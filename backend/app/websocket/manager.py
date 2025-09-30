import asyncio
from typing import Set
from fastapi import WebSocket
import structlog

logger = structlog.get_logger(__name__)


class ConnectionManager:
    """管理所有活跃的WebSocket连接"""

    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket):
        """接受新的WebSocket连接"""
        await websocket.accept()
        async with self._lock:
            self.active_connections.add(websocket)
        logger.info("websocket.connected", total=len(self.active_connections))

    async def disconnect(self, websocket: WebSocket):
        """断开WebSocket连接"""
        async with self._lock:
            self.active_connections.discard(websocket)
        logger.info("websocket.disconnected", total=len(self.active_connections))

    async def broadcast(self, message: str):
        """向所有客户端广播消息"""
        if not self.active_connections:
            return

        async with self._lock:
            connections = list(self.active_connections)

        # 发送消息并移除失败的连接
        disconnected = []
        for connection in connections:
            try:
                await connection.send_text(message)
            except Exception as e:
                logger.warning("websocket.send_failed", error=str(e))
                disconnected.append(connection)

        # 清理断开的连接
        if disconnected:
            async with self._lock:
                for conn in disconnected:
                    self.active_connections.discard(conn)

    async def send_to_client(self, websocket: WebSocket, message: str):
        """向特定客户端发送消息"""
        try:
            await websocket.send_text(message)
        except Exception as e:
            logger.warning("websocket.send_to_client_failed", error=str(e))
            await self.disconnect(websocket)
