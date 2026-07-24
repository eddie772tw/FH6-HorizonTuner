import asyncio
import logging
from typing import List

from fastapi import WebSocket

logger = logging.getLogger("backend.state")


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.active_binary_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket, is_binary: bool = False):
        await websocket.accept()
        if is_binary:
            self.active_binary_connections.append(websocket)
            logger.info(
                f"Binary Client connected. Total binary clients: {len(self.active_binary_connections)}"
            )
        else:
            self.active_connections.append(websocket)
            logger.info(
                f"Client connected. Total clients: {len(self.active_connections)}"
            )

    def disconnect(self, websocket: WebSocket, is_binary: bool = False):
        if is_binary:
            if websocket in self.active_binary_connections:
                self.active_binary_connections.remove(websocket)
            logger.info(
                f"Binary Client disconnected. Total binary clients: {len(self.active_binary_connections)}"
            )
        else:
            if websocket in self.active_connections:
                self.active_connections.remove(websocket)
            logger.info(
                f"Client disconnected. Total clients: {len(self.active_connections)}"
            )

    async def broadcast_json(self, data: dict):
        for connection in list(self.active_connections):
            try:
                await connection.send_json(data)
            except Exception as e:
                logger.error(f"Error sending data to client: {e}")
                self.disconnect(connection, is_binary=False)

    async def broadcast_binary(self, data: bytes):
        for connection in list(self.active_binary_connections):
            try:
                await connection.send_bytes(data)
            except Exception as e:
                logger.error(f"Error sending binary data to client: {e}")
                self.disconnect(connection, is_binary=True)


manager = ConnectionManager()
telemetry_queue = asyncio.Queue(maxsize=10)

current_udp_transport = None
current_udp_ip_port = (None, None)
overlay_process = None
