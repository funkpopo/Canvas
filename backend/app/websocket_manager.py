"""
WebSocket连接管理器
负责管理WebSocket连接、消息广播和资源监听
支持连接复用、消息聚合和降级策略
"""

import asyncio
import json
import logging
import os
from typing import Dict, List, Set, Optional, Any
from datetime import datetime, timedelta
from collections import defaultdict
from fastapi import WebSocket
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class WebSocketMessage(BaseModel):
    """WebSocket消息模型"""
    type: str  # 消息类型: 'resource_update', 'status', 'error', 'ping', 'pong'
    data: dict
    timestamp: datetime = None

    def __init__(self, **data):
        super().__init__(**data)
        if self.timestamp is None:
            self.timestamp = datetime.utcnow()


class MessageAggregator:
    """消息聚合器 - 批量发送消息减少网络开销"""

    def __init__(self, flush_interval: float = 0.1, max_batch_size: int = 50):
        self.flush_interval = flush_interval
        self.max_batch_size = max_batch_size
        self._buffers: Dict[str, List[WebSocketMessage]] = defaultdict(list)
        self._flush_task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()

    async def add(self, connection_id: str, message: WebSocketMessage):
        """添加消息到缓冲区"""
        async with self._lock:
            self._buffers[connection_id].append(message)
            if len(self._buffers[connection_id]) >= self.max_batch_size:
                messages = self._buffers.pop(connection_id)
                return messages
        return None

    async def flush_all(self) -> Dict[str, List[WebSocketMessage]]:
        """刷新所有缓冲区"""
        async with self._lock:
            buffers = dict(self._buffers)
            self._buffers.clear()
            return buffers

    def remove_connection(self, connection_id: str):
        """移除连接的缓冲区"""
        self._buffers.pop(connection_id, None)

class ConnectionManager:
    """WebSocket连接管理器"""

    def __init__(self):
        # 活动连接: {connection_id: websocket}
        self.active_connections: Dict[str, WebSocket] = {}

        # 集群房间: {cluster_id: set(connection_ids)}
        self.cluster_rooms: Dict[int, Set[str]] = {}

        # 命名空间房间: {(cluster_id, namespace): set(connection_ids)}
        self.namespace_rooms: Dict[tuple, Set[str]] = {}

        # 资源类型房间: {(cluster_id, resource_type): set(connection_ids)}
        self.resource_rooms: Dict[tuple, Set[str]] = {}

        # 连接元数据: {connection_id: {"user_id", "token", "filters"}}
        self.connection_metadata: Dict[str, Dict[str, Any]] = {}

        # 用户连接映射: {user_id: set(connection_ids)}
        self.user_connections: Dict[int, Set[str]] = defaultdict(set)

        # 心跳检测
        self.heartbeat_interval = 30  # 秒
        self.heartbeat_task: Optional[asyncio.Task] = None

        # 连接数限制
        self.max_connections = int(os.getenv("WS_MAX_CONNECTIONS", "1000"))
        self.max_connections_per_user = int(os.getenv("WS_MAX_CONNECTIONS_PER_USER", "10"))

        # 广播并发限制
        self.broadcast_concurrency = 50

        # 消息聚合器
        self.aggregator = MessageAggregator()
        self._aggregator_task: Optional[asyncio.Task] = None

        # 降级策略
        self._load_threshold = int(os.getenv("WS_LOAD_THRESHOLD", "500"))
        self._degraded_mode = False
        self._message_skip_counter: Dict[str, int] = defaultdict(int)

    async def connect(self, websocket: WebSocket, connection_id: str, user_id: int, token: str) -> bool:
        """建立WebSocket连接"""
        try:
            # 全局连接数限制
            if len(self.active_connections) >= self.max_connections:
                await websocket.accept()
                await websocket.close(code=1013, reason="Too many connections")
                return False

            # 单用户连接数限制
            if len(self.user_connections[user_id]) >= self.max_connections_per_user:
                await websocket.accept()
                await websocket.close(code=1013, reason="Too many connections for this user")
                return False

            await websocket.accept()
            self.active_connections[connection_id] = websocket
            self.user_connections[user_id].add(connection_id)
            self.connection_metadata[connection_id] = {
                "user_id": user_id,
                "token": token,
                "connected_at": datetime.utcnow(),
                "last_heartbeat": datetime.utcnow()
            }

            # 更新降级模式状态
            self._update_degraded_mode()

            logger.info(f"WebSocket connection established: {connection_id} (user: {user_id})")

            # 发送连接成功消息
            await self.send_personal_message(
                connection_id,
                WebSocketMessage(type="status", data={"status": "connected", "message": "WebSocket连接已建立"})
            )

            return True
        except Exception as e:
            logger.error(f"Failed to establish WebSocket connection {connection_id}: {e}")
            return False

    def _update_degraded_mode(self):
        """更新降级模式状态"""
        conn_count = len(self.active_connections)
        if conn_count >= self._load_threshold and not self._degraded_mode:
            self._degraded_mode = True
            logger.warning(f"Entering degraded mode: {conn_count} connections")
        elif conn_count < self._load_threshold * 0.8 and self._degraded_mode:
            self._degraded_mode = False
            logger.info(f"Exiting degraded mode: {conn_count} connections")

    async def disconnect(self, connection_id: str):
        """断开WebSocket连接"""
        if connection_id in self.active_connections:
            try:
                # 清理房间成员身份
                await self._leave_all_rooms(connection_id)

                # 清理用户连接映射
                metadata = self.connection_metadata.get(connection_id, {})
                user_id = metadata.get("user_id")
                if user_id and user_id in self.user_connections:
                    self.user_connections[user_id].discard(connection_id)
                    if not self.user_connections[user_id]:
                        del self.user_connections[user_id]

                # 清理消息聚合器缓冲区
                self.aggregator.remove_connection(connection_id)

                # 清理数据先于关闭连接，避免重复发送消息
                websocket = self.active_connections.pop(connection_id, None)
                self.connection_metadata.pop(connection_id, None)
                self._message_skip_counter.pop(connection_id, None)

                # 更新降级模式状态
                self._update_degraded_mode()

                # 最后关闭连接
                if websocket:
                    try:
                        await websocket.close()
                    except RuntimeError as e:
                        # 忽略已关闭/重复关闭的连接错误（ASGI 会在重复 close 时抛 RuntimeError）
                        msg = str(e)
                        if (
                            "Cannot call" in msg
                            or "Unexpected ASGI message 'websocket.close'" in msg
                            or "after sending 'websocket.close'" in msg
                            or "response already completed" in msg
                        ):
                            pass
                        else:
                            raise

                logger.info(f"WebSocket connection closed: {connection_id}")

            except Exception as e:
                logger.error(f"Error closing WebSocket connection {connection_id}: {e}")

    async def _leave_all_rooms(self, connection_id: str):
        """从所有房间中移除连接"""
        # 从集群房间移除
        for cluster_id, connections in list(self.cluster_rooms.items()):
            connections.discard(connection_id)
            if not connections:
                del self.cluster_rooms[cluster_id]

        # 从命名空间房间移除
        for key, connections in list(self.namespace_rooms.items()):
            connections.discard(connection_id)
            if not connections:
                del self.namespace_rooms[key]

        # 从资源类型房间移除
        for key, connections in list(self.resource_rooms.items()):
            connections.discard(connection_id)
            if not connections:
                del self.resource_rooms[key]

    def mark_heartbeat(self, connection_id: str) -> None:
        """标记连接仍然存活（收到客户端消息/pong 时调用）。"""
        if connection_id in self.connection_metadata:
            self.connection_metadata[connection_id]["last_heartbeat"] = datetime.utcnow()

    async def _broadcast(self, connection_ids: Set[str], message: WebSocketMessage) -> None:
        """带并发限制的广播发送。"""
        if not connection_ids:
            return

        sem = asyncio.Semaphore(self.broadcast_concurrency)

        async def _send_one(cid: str):
            async with sem:
                await self.send_personal_message(cid, message)

        await asyncio.gather(*[_send_one(cid) for cid in list(connection_ids)], return_exceptions=True)

    async def join_cluster(self, connection_id: str, cluster_id: int):
        """加入集群房间"""
        if connection_id not in self.active_connections:
            return

        if cluster_id not in self.cluster_rooms:
            self.cluster_rooms[cluster_id] = set()

        self.cluster_rooms[cluster_id].add(connection_id)
        logger.debug(f"Connection {connection_id} joined cluster room {cluster_id}")

    async def leave_cluster(self, connection_id: str, cluster_id: int):
        """离开集群房间"""
        if cluster_id in self.cluster_rooms:
            self.cluster_rooms[cluster_id].discard(connection_id)
            if not self.cluster_rooms[cluster_id]:
                del self.cluster_rooms[cluster_id]

    async def join_namespace(self, connection_id: str, cluster_id: int, namespace: str):
        """加入命名空间房间"""
        if connection_id not in self.active_connections:
            return

        room_key = (cluster_id, namespace)
        if room_key not in self.namespace_rooms:
            self.namespace_rooms[room_key] = set()

        self.namespace_rooms[room_key].add(connection_id)
        logger.debug(f"Connection {connection_id} joined namespace room {cluster_id}/{namespace}")

    async def leave_namespace(self, connection_id: str, cluster_id: int, namespace: str):
        """离开命名空间房间"""
        room_key = (cluster_id, namespace)
        if room_key in self.namespace_rooms:
            self.namespace_rooms[room_key].discard(connection_id)
            if not self.namespace_rooms[room_key]:
                del self.namespace_rooms[room_key]

    async def join_resource_type(self, connection_id: str, cluster_id: int, resource_type: str):
        """加入资源类型房间"""
        if connection_id not in self.active_connections:
            return

        room_key = (cluster_id, resource_type)
        if room_key not in self.resource_rooms:
            self.resource_rooms[room_key] = set()

        self.resource_rooms[room_key].add(connection_id)
        logger.debug(f"Connection {connection_id} joined resource room {cluster_id}/{resource_type}")

    async def leave_resource_type(self, connection_id: str, cluster_id: int, resource_type: str):
        """离开资源类型房间"""
        room_key = (cluster_id, resource_type)
        if room_key in self.resource_rooms:
            self.resource_rooms[room_key].discard(connection_id)
            if not self.resource_rooms[room_key]:
                del self.resource_rooms[room_key]

    async def broadcast_to_cluster(self, cluster_id: int, message: WebSocketMessage):
        """广播消息到集群中的所有连接"""
        if cluster_id not in self.cluster_rooms:
            return

        await self._broadcast(self.cluster_rooms[cluster_id].copy(), message)

    async def broadcast_to_namespace(self, cluster_id: int, namespace: str, message: WebSocketMessage):
        """广播消息到命名空间中的所有连接"""
        room_key = (cluster_id, namespace)
        if room_key not in self.namespace_rooms:
            return

        await self._broadcast(self.namespace_rooms[room_key].copy(), message)

    async def broadcast_to_resource_type(self, cluster_id: int, resource_type: str, message: WebSocketMessage):
        """广播消息到资源类型中的所有连接"""
        room_key = (cluster_id, resource_type)
        if room_key not in self.resource_rooms:
            return

        await self._broadcast(self.resource_rooms[room_key].copy(), message)

    async def send_personal_message(self, connection_id: str, message: WebSocketMessage):
        """发送消息给特定连接"""
        if connection_id not in self.active_connections:
            return

        try:
            websocket = self.active_connections.get(connection_id)
            if not websocket:
                return

            message_data = message.dict()
            message_data['timestamp'] = message_data['timestamp'].isoformat()

            await websocket.send_text(json.dumps(message_data))

        except RuntimeError as e:
            # 连接已关闭，静默清理
            if "Cannot call" in str(e):
                logger.debug(f"Connection {connection_id} already closed, cleaning up")
                await self.disconnect(connection_id)
            else:
                logger.error(f"Failed to send message to {connection_id}: {e}")
                await self.disconnect(connection_id)
        except Exception as e:
            logger.error(f"Failed to send message to {connection_id}: {e}")
            # 连接可能已断开，清理连接
            await self.disconnect(connection_id)

    async def broadcast_resource_update(self, cluster_id: int, resource_type: str, resource_data: dict,
                                       namespace: Optional[str] = None):
        """广播资源更新消息（支持降级策略）"""
        message = WebSocketMessage(
            type="resource_update",
            data={
                "resource_type": resource_type,
                "resource_data": resource_data,
                "cluster_id": cluster_id,
                "namespace": namespace
            }
        )

        # 降级模式下跳过部分消息
        if self._degraded_mode:
            msg_key = f"{cluster_id}:{resource_type}"
            self._message_skip_counter[msg_key] += 1
            if self._message_skip_counter[msg_key] % 3 != 0:  # 跳过2/3的消息
                return
            self._message_skip_counter[msg_key] = 0

        # 广播到集群房间
        await self.broadcast_to_cluster(cluster_id, message)

        # 如果指定了命名空间，也广播到命名空间房间
        if namespace:
            await self.broadcast_to_namespace(cluster_id, namespace, message)

        # 广播到资源类型房间
        await self.broadcast_to_resource_type(cluster_id, resource_type, message)

    async def start_aggregator(self):
        """启动消息聚合器刷新任务"""
        if self._aggregator_task and not self._aggregator_task.done():
            return
        self._aggregator_task = asyncio.create_task(self._aggregator_flush_loop())

    async def stop_aggregator(self):
        """停止消息聚合器"""
        if self._aggregator_task and not self._aggregator_task.done():
            self._aggregator_task.cancel()
            try:
                await self._aggregator_task
            except asyncio.CancelledError:
                pass

    async def _aggregator_flush_loop(self):
        """定期刷新消息聚合器"""
        while True:
            try:
                await asyncio.sleep(self.aggregator.flush_interval)
                buffers = await self.aggregator.flush_all()
                for connection_id, messages in buffers.items():
                    if messages and connection_id in self.active_connections:
                        await self._send_batch(connection_id, messages)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Aggregator flush error: {e}")

    async def _send_batch(self, connection_id: str, messages: List[WebSocketMessage]):
        """批量发送消息"""
        if not messages:
            return
        try:
            websocket = self.active_connections.get(connection_id)
            if not websocket:
                return
            batch_data = {
                "type": "batch",
                "messages": [{"type": m.type, "data": m.data, "timestamp": m.timestamp.isoformat()} for m in messages]
            }
            await websocket.send_text(json.dumps(batch_data))
        except Exception as e:
            logger.debug(f"Failed to send batch to {connection_id}: {e}")

    async def start_heartbeat_monitor(self):
        """启动心跳检测任务"""
        if self.heartbeat_task and not self.heartbeat_task.done():
            return

        self.heartbeat_task = asyncio.create_task(self._heartbeat_monitor())

    async def stop_heartbeat_monitor(self):
        """停止心跳检测任务"""
        if self.heartbeat_task and not self.heartbeat_task.done():
            self.heartbeat_task.cancel()
            try:
                await self.heartbeat_task
            except asyncio.CancelledError:
                pass

    async def _heartbeat_monitor(self):
        """心跳检测循环"""
        while True:
            try:
                await asyncio.sleep(self.heartbeat_interval)

                current_time = datetime.utcnow()
                timeout_threshold = current_time - timedelta(seconds=self.heartbeat_interval * 2)

                # 检查超时的连接
                timed_out_connections = []
                for connection_id, metadata in self.connection_metadata.items():
                    last_heartbeat = metadata.get('last_heartbeat')
                    if last_heartbeat and last_heartbeat < timeout_threshold:
                        timed_out_connections.append(connection_id)

                # 清理超时连接
                for connection_id in timed_out_connections:
                    logger.warning(f"Connection {connection_id} timed out, disconnecting")
                    await self.disconnect(connection_id)

                # 发送心跳消息给活跃连接
                active_connection_ids = list(self.active_connections.keys())
                for connection_id in active_connection_ids:
                    if connection_id in self.active_connections:  # 再次检查，避免并发修改
                        try:
                            await self.send_personal_message(
                                connection_id,
                                WebSocketMessage(type="ping", data={"timestamp": current_time.isoformat()})
                            )
                        except Exception as e:
                            logger.debug(f"Failed to send heartbeat to {connection_id}: {e}")

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Heartbeat monitor error: {e}")
                await asyncio.sleep(5)  # 错误后等待5秒再继续

    def get_connection_stats(self) -> Dict[str, Any]:
        """获取连接统计信息"""
        return {
            "active_connections": len(self.active_connections),
            "unique_users": len(self.user_connections),
            "cluster_rooms": len(self.cluster_rooms),
            "namespace_rooms": len(self.namespace_rooms),
            "resource_rooms": len(self.resource_rooms),
            "total_rooms": len(self.cluster_rooms) + len(self.namespace_rooms) + len(self.resource_rooms),
            "degraded_mode": self._degraded_mode,
            "max_connections": self.max_connections,
            "max_connections_per_user": self.max_connections_per_user
        }


# 创建全局连接管理器实例
manager = ConnectionManager()
