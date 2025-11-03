"""
WebSocket路由器
处理WebSocket连接、认证和消息路由
"""

import json
import logging
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..auth import get_current_user_ws, verify_token, security
from ..schemas import TokenData
from ..websocket_manager import manager, WebSocketMessage
from ..database import get_db
from ..models import User, Cluster

logger = logging.getLogger(__name__)
router = APIRouter()

class SubscriptionRequest(BaseModel):
    """订阅请求模型"""
    action: str  # 'subscribe' or 'unsubscribe'
    resource_type: Optional[str] = None  # 'pods', 'deployments', 'jobs', etc.
    cluster_id: Optional[int] = None
    namespace: Optional[str] = None

@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(..., description="JWT认证令牌")
):
    """
    WebSocket连接端点
    支持实时资源更新订阅
    """
    connection_id = None
    db = None

    try:
        # 手动获取数据库会话
        db = next(get_db())

        # 验证token并获取用户信息
        try:
            user = await get_current_user_ws(token, db)
        except Exception as e:
            logger.warning(f"WebSocket authentication failed: {e}")
            # Accept the connection first before closing to send proper close code
            try:
                await websocket.accept()
            except Exception:
                pass
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Could not validate credentials")
            return

        # 生成连接ID
        import uuid
        connection_id = f"{user.id}_{uuid.uuid4().hex[:8]}"

        # 建立连接
        if not await manager.connect(websocket, connection_id, user.id, token):
            await websocket.close(code=1011, reason="Connection failed")
            return

        logger.info(f"WebSocket connection established for user {user.username} ({connection_id})")

        # 启动心跳检测（如果还没有启动）
        await manager.start_heartbeat_monitor()

        # 消息处理循环
        while True:
            try:
                # 接收消息
                data = await websocket.receive_text()
                message_data = json.loads(data)

                # 处理订阅/取消订阅请求
                if message_data.get('type') == 'subscription':
                    await handle_subscription(connection_id, message_data, user, db)

                # 处理心跳响应
                elif message_data.get('type') == 'pong':
                    # 更新心跳时间戳（在manager.send_personal_message中已处理）
                    pass

                # 处理其他消息类型
                else:
                    logger.warning(f"Unknown message type from {connection_id}: {message_data.get('type')}")

            except json.JSONDecodeError:
                logger.warning(f"Invalid JSON received from {connection_id}")
                await manager.send_personal_message(
                    connection_id,
                    WebSocketMessage(type="error", data={"message": "Invalid JSON format"})
                )

            except WebSocketDisconnect:
                logger.info(f"WebSocket disconnect received from {connection_id}")
                break

            except Exception as e:
                logger.error(f"Error processing WebSocket message from {connection_id}: {e}")
                break

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: {connection_id}")

    except Exception as e:
        logger.error(f"WebSocket connection error: {e}")

    finally:
        # 清理连接
        if connection_id:
            await manager.disconnect(connection_id)

        # 关闭数据库会话
        if db:
            db.close()

async def handle_subscription(connection_id: str, message_data: dict, user: User, db):
    """处理订阅请求"""
    try:
        subscription = SubscriptionRequest(**message_data.get('data', {}))

        if subscription.action not in ['subscribe', 'unsubscribe']:
            await manager.send_personal_message(
                connection_id,
                WebSocketMessage(type="error", data={"message": "Invalid action. Must be 'subscribe' or 'unsubscribe'"})
            )
            return

        # 验证集群权限
        if subscription.cluster_id:
            cluster = db.query(Cluster).filter(
                Cluster.id == subscription.cluster_id,
                Cluster.is_active == True
            ).first()

            if not cluster:
                await manager.send_personal_message(
                    connection_id,
                    WebSocketMessage(type="error", data={"message": f"Cluster {subscription.cluster_id} not found or inactive"})
                )
                return

        # 处理订阅操作
        if subscription.action == 'subscribe':
            await handle_subscribe(connection_id, subscription)
        else:
            await handle_unsubscribe(connection_id, subscription)

        # 发送确认消息
        await manager.send_personal_message(
            connection_id,
            WebSocketMessage(
                type="subscription_ack",
                data={
                    "action": subscription.action,
                    "resource_type": subscription.resource_type,
                    "cluster_id": subscription.cluster_id,
                    "namespace": subscription.namespace
                }
            )
        )

    except Exception as e:
        logger.error(f"Error handling subscription for {connection_id}: {e}")
        await manager.send_personal_message(
            connection_id,
            WebSocketMessage(type="error", data={"message": f"Subscription error: {str(e)}"})
        )

async def handle_subscribe(connection_id: str, subscription: SubscriptionRequest):
    """处理订阅操作"""
    # 订阅集群
    if subscription.cluster_id:
        await manager.join_cluster(connection_id, subscription.cluster_id)

    # 订阅命名空间
    if subscription.cluster_id and subscription.namespace:
        await manager.join_namespace(connection_id, subscription.cluster_id, subscription.namespace)

    # 订阅资源类型
    if subscription.cluster_id and subscription.resource_type:
        await manager.join_resource_type(connection_id, subscription.cluster_id, subscription.resource_type)

async def handle_unsubscribe(connection_id: str, subscription: SubscriptionRequest):
    """处理取消订阅操作"""
    # 取消订阅集群
    if subscription.cluster_id:
        await manager.leave_cluster(connection_id, subscription.cluster_id)

    # 取消订阅命名空间
    if subscription.cluster_id and subscription.namespace:
        await manager.leave_namespace(connection_id, subscription.cluster_id, subscription.namespace)

    # 取消订阅资源类型
    if subscription.cluster_id and subscription.resource_type:
        await manager.leave_resource_type(connection_id, subscription.cluster_id, subscription.resource_type)

def get_current_user_with_db(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """获取当前用户的依赖函数，包含数据库会话"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    token_data = verify_token(credentials.credentials, credentials_exception)
    user = db.query(User).filter(User.username == token_data.username).first()
    if user is None:
        raise credentials_exception
    return user

@router.get("/ws/stats")
async def get_websocket_stats(current_user: User = Depends(get_current_user_with_db)):
    """获取WebSocket连接统计信息"""
    return manager.get_connection_stats()

@router.on_event("startup")
async def startup_event():
    """应用启动时启动心跳检测"""
    await manager.start_heartbeat_monitor()

@router.on_event("shutdown")
async def shutdown_event():
    """应用关闭时清理连接"""
    await manager.stop_heartbeat_monitor()

    # 关闭所有连接
    connection_ids = list(manager.active_connections.keys())
    for connection_id in connection_ids:
        await manager.disconnect(connection_id)
