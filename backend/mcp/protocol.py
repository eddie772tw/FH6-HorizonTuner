"""JSON-RPC 2.0 and Model Context Protocol (MCP) Message Processing."""

from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

SUPPORTED_PROTOCOL_VERSIONS = ("2024-11-05", "2024-10-07", "2025-06-18")
SERVER_NAME = "fh6-horizon-tuner-mcp"
SERVER_VERSION = "1.1.0"
SERVER_INSTRUCTIONS = (
    "FH6-HorizonTuner is a localhost, read-only MCP server exposed by the "
    "running FastAPI backend. Use the MCP endpoint URL that the client used "
    "for this connection; its path is /mcp and Release Builds may use a "
    "dynamic local port. No stdio command or second telemetry listener is "
    "required. The server is available only while Horizon Tuner is running "
    "and MCP is enabled in Settings. Live access is controlled by the "
    "mcp_allow_live setting; when it is disabled, use recorded sessions and "
    "captures instead. Prefer small summary tools/resources before requesting "
    "time-series data, and treat all tuning results as advisory. MCP tools "
    "cannot write tuning values, control the game, or access arbitrary SQL or "
    "files."
)


class McpError(Exception):
    """MCP JSON-RPC error container."""

    def __init__(self, code: int, message: str, data: Any = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.data = data


class McpProtocolHandler:
    """Handles MCP protocol lifecycle, dispatching, and error formatting."""

    def __init__(self, tool_manager: Any, resource_manager: Any):
        self.tool_manager = tool_manager
        self.resource_manager = resource_manager
        self.protocol_version = SUPPORTED_PROTOCOL_VERSIONS[0]
        self.initialized = False

    async def handle_request(self, message: dict[str, Any]) -> dict[str, Any] | None:
        """Process a single JSON-RPC request or notification."""
        msg_id = message.get("id")
        method = message.get("method")
        params = message.get("params", {})

        # If method is absent, invalid JSON-RPC
        if not method or not isinstance(method, str):
            if msg_id is not None:
                return self._error_response(
                    msg_id, -32600, "Invalid Request: missing method"
                )
            return None

        # Notifications (no id)
        if msg_id is None:
            await self._handle_notification(method, params)
            return None

        try:
            result = await self._dispatch_method(method, params)
            return {
                "jsonrpc": "2.0",
                "id": msg_id,
                "result": result,
            }
        except McpError as exc:
            return self._error_response(msg_id, exc.code, exc.message, exc.data)
        except Exception as exc:
            logger.exception("Internal error handling method %s", method)
            return self._error_response(msg_id, -32603, f"Internal error: {exc}")

    async def _handle_notification(self, method: str, params: dict[str, Any]) -> None:
        if method in ("notifications/initialized", "initialized"):
            self.initialized = True
            logger.info("MCP client initialized successfully")
        elif method == "notifications/cancelled":
            logger.debug("Received cancelled notification: %s", params)

    async def _dispatch_method(
        self, method: str, params: dict[str, Any]
    ) -> dict[str, Any]:
        if method == "initialize":
            client_version = params.get(
                "protocolVersion", SUPPORTED_PROTOCOL_VERSIONS[0]
            )
            self.protocol_version = (
                client_version
                if client_version in SUPPORTED_PROTOCOL_VERSIONS
                else SUPPORTED_PROTOCOL_VERSIONS[0]
            )
            return {
                "protocolVersion": self.protocol_version,
                "capabilities": {
                    "tools": {"listChanged": False},
                    "resources": {"subscribe": False, "listChanged": False},
                },
                "serverInfo": {
                    "name": SERVER_NAME,
                    "version": SERVER_VERSION,
                },
                "instructions": SERVER_INSTRUCTIONS,
            }

        if method == "ping":
            return {}

        if method == "tools/list":
            tools = await self.tool_manager.list_tools()
            return {"tools": tools}

        if method == "tools/call":
            name = params.get("name")
            if not name or not isinstance(name, str):
                raise McpError(
                    -32602, "Invalid params: 'name' is required for tools/call"
                )
            arguments = params.get("arguments", {})
            return await self.tool_manager.call_tool(name, arguments)

        if method == "resources/list":
            resources = await self.resource_manager.list_resources()
            return {"resources": resources}

        if method == "resources/read":
            uri = params.get("uri")
            if not uri or not isinstance(uri, str):
                raise McpError(
                    -32602, "Invalid params: 'uri' is required for resources/read"
                )
            return await self.resource_manager.read_resource(uri)

        raise McpError(-32601, f"Method not found: {method}")

    def _error_response(
        self, msg_id: Any, code: int, message: str, data: Any = None
    ) -> dict[str, Any]:
        err_obj: dict[str, Any] = {"code": code, "message": message}
        if data is not None:
            err_obj["data"] = data
        return {
            "jsonrpc": "2.0",
            "id": msg_id,
            "error": err_obj,
        }

    def parse_line(self, line: str) -> dict[str, Any] | None:
        """Safely parse a JSON-RPC message string."""
        line = line.strip()
        if not line:
            return None
        try:
            parsed = json.loads(line)
            if isinstance(parsed, dict):
                return parsed
            return None
        except json.JSONDecodeError as exc:
            raise McpError(-32700, f"Parse error: {exc}") from exc
