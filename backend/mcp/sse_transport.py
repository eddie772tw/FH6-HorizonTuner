"""Server-Sent Events (SSE) and HTTP Message Transport for MCP."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Any, AsyncIterator

from .protocol import McpError, McpProtocolHandler

logger = logging.getLogger(__name__)


class McpSseTransportManager:
    """Manages active SSE client sessions and dispatches incoming JSON-RPC messages."""

    def __init__(self, protocol: McpProtocolHandler):
        self.protocol = protocol
        self._sessions: dict[str, asyncio.Queue[dict[str, Any]]] = {}
        self.total_requests_served = 0

    @property
    def active_sessions_count(self) -> int:
        return len(self._sessions)

    async def connect_session(self) -> tuple[str, AsyncIterator[str]]:
        """Establish a new SSE connection for an MCP client and yield event stream."""
        session_id = uuid.uuid4().hex
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self._sessions[session_id] = queue
        logger.info("New MCP SSE client session connected: %s", session_id)

        async def event_generator() -> AsyncIterator[str]:
            try:
                # 1. Send the initial endpoint event as specified by the MCP SSE protocol
                endpoint_url = f"/mcp/messages?session_id={session_id}"
                yield f"event: endpoint\r\ndata: {endpoint_url}\r\n\r\n"

                # 2. Continuously stream messages pushed into the session queue
                while True:
                    msg = await queue.get()
                    data_str = json.dumps(msg, ensure_ascii=False)
                    yield f"event: message\r\ndata: {data_str}\r\n\r\n"
            except asyncio.CancelledError:
                logger.info("MCP SSE client session disconnected: %s", session_id)
            finally:
                self._sessions.pop(session_id, None)

        return session_id, event_generator()

    async def handle_post_message(
        self, session_id: str, message: dict[str, Any]
    ) -> dict[str, Any]:
        """Receive a JSON-RPC message from an HTTP POST and push the response to the SSE stream."""
        if session_id not in self._sessions:
            raise McpError(-32004, f"Invalid or expired MCP session ID: {session_id}")

        self.total_requests_served += 1
        queue = self._sessions[session_id]

        response = await self.protocol.handle_request(message)
        if response is not None:
            await queue.put(response)
            return {
                "status": "accepted",
                "session_id": session_id,
                "has_response": True,
            }

        return {"status": "accepted", "session_id": session_id, "has_response": False}

    def close_all_sessions(self) -> None:
        """Close all active sessions."""
        self._sessions.clear()
