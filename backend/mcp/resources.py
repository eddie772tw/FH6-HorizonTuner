"""Resource registration and URI routing for FH6-HorizonTuner MCP."""

from __future__ import annotations

import json
from typing import Any
from urllib.parse import urlparse

from .protocol import McpError
from .service import HorizonTunerMcpService


class McpResourceManager:
    """Manages MCP Resources and maps URIs to service methods."""

    def __init__(self, service: HorizonTunerMcpService):
        self.service = service

    async def list_resources(self) -> list[dict[str, Any]]:
        """List statically discoverable resources and templates."""
        resources = [
            {
                "uri": "fh6://telemetry/live",
                "name": "Live Telemetry Snapshot",
                "description": "Latest real-time UDP telemetry frame and ingestion status.",
                "mimeType": "application/json",
            },
            {
                "uri": "fh6://settings/current",
                "name": "System & HUD Settings",
                "description": "Current user preferences, units, and HUD configuration.",
                "mimeType": "application/json",
            },
        ]

        # Add recent race sessions
        sessions = self.service.list_race_sessions(limit=5)
        for s in sessions:
            s_id = s.get("session_id")
            resources.append(
                {
                    "uri": f"fh6://telemetry/session/{s_id}",
                    "name": f"Race Session {s_id} ({s.get('car_name', 'Unknown')})",
                    "description": f"Session summary with {s.get('total_laps', 0)} laps.",
                    "mimeType": "application/json",
                }
            )

        # Add recent tuning captures
        captures = self.service.list_tuning_captures()[:5]
        for c in captures:
            c_id = c.get("capture_id")
            resources.append(
                {
                    "uri": f"fh6://capture/{c_id}",
                    "name": f"Tuning Capture {c_id}",
                    "description": f"Capture dataset ({c.get('samples_count', 0)} samples).",
                    "mimeType": "application/json",
                }
            )

        return resources

    async def read_resource(self, uri: str) -> dict[str, Any]:
        """Fetch and return JSON text content for a resource URI."""
        parsed = urlparse(uri)
        if parsed.scheme != "fh6":
            raise McpError(
                -32602, f"Unsupported URI scheme: {parsed.scheme}. Expected 'fh6://'"
            )

        path_parts = [p for p in parsed.path.strip("/").split("/") if p]
        host = parsed.netloc

        if host == "telemetry":
            if not path_parts or path_parts[0] == "live":
                data = self.service.get_live_telemetry_snapshot()
                return self._wrap_response(uri, data)
            if path_parts[0] == "session" and len(path_parts) > 1:
                session_id = path_parts[1]
                data = self.service.get_session_summary(session_id)
                if not data:
                    raise McpError(-32004, f"Session not found: {session_id}")
                return self._wrap_response(uri, data)

        elif host == "capture" and path_parts:
            capture_id = path_parts[0]
            data = self.service.get_capture_summary(capture_id)
            if not data:
                raise McpError(-32004, f"Capture dataset not found: {capture_id}")
            return self._wrap_response(uri, data)

        elif host == "car" and path_parts:
            car_id = path_parts[0]
            details = self.service.get_car_details(car_id)
            if not details:
                raise McpError(-32004, f"Car not found: {car_id}")
            caps = self.service.get_car_tuning_capabilities(car_id)
            return self._wrap_response(uri, {"details": details, "capabilities": caps})

        elif host == "tuning" and len(path_parts) >= 2:
            car_id = path_parts[0]
            save_name = path_parts[1]
            preset = self.service.get_tuning_preset(car_id, save_name)
            if not preset:
                raise McpError(-32004, f"Tuning preset not found: {car_id}/{save_name}")
            return self._wrap_response(uri, preset)

        elif host == "settings":
            settings = self.service.get_system_settings()
            hud = self.service.get_hud_configurations()
            return self._wrap_response(uri, {"settings": settings, "hud": hud})

        raise McpError(-32602, f"Unknown resource URI: {uri}")

    def _wrap_response(self, uri: str, data: Any) -> dict[str, Any]:
        return {
            "contents": [
                {
                    "uri": uri,
                    "mimeType": "application/json",
                    "text": json.dumps(data, indent=2, ensure_ascii=False),
                }
            ]
        }
