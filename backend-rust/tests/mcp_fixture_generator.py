"""Generate deterministic MCP oracle JSON from the legacy Python service.

Run with the repository's mandated uv interpreter.  This file is intentionally
under the MCP test scope; Rust runtime/build never imports or executes it.
"""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))

from backend.mcp.protocol import McpError, McpProtocolHandler
from backend.mcp.resources import McpResourceManager
from backend.mcp.service import HorizonTunerMcpService
from backend.mcp.tools import McpToolManager

LIVE = {
    "CurrentEngineRpm": 6500.0,
    "EngineMaxRpm": 7500.0,
    "EngineIdleRpm": 800.0,
    "SpeedMetersPerSecond": 45.0,
    "Gear": 4,
    "AccelInput": 255,
    "BrakeInput": 0,
    "SteerInput": 64,
    "AccelerationX": 9.81 * 1.2,
    "AccelerationY": 9.81,
    "AccelerationZ": -9.81 * 0.8,
    "PowerWatts": 350000.0,
    "TorqueNewtons": 500.0,
    "Boost": 101325.0 * 1.5,
    "Yaw": 0.05,
    "Pitch": -0.02,
    "Roll": 0.03,
    "PositionX": 100.0,
    "PositionY": 20.0,
    "PositionZ": 300.0,
    "TireTemp": [200.0, 205.0, 190.0, 192.0],
    "TireSlipAngle": [0.05, 0.06, 0.02, 0.02],
    "TireSlipRatio": [0.08, 0.08, 0.01, 0.01],
    "SuspTravel": [0.45, 0.48, 0.96, 0.50],
}


def normalize(value):
    if isinstance(value, dict):
        return {k: normalize(v) for k, v in value.items() if k != "file_path"}
    if isinstance(value, list):
        return [normalize(v) for v in value]
    return value


def tool_or_error(manager, name, args):
    try:
        return manager._dispatch_sync(name, args)
    except McpError as exc:
        return {"error": {"code": exc.code, "message": exc.message}}


async def resource_or_error(manager, uri):
    try:
        return await manager.read_resource(uri)
    except McpError as exc:
        return {"error": {"code": exc.code, "message": exc.message}}


def main() -> None:
    with tempfile.TemporaryDirectory(
        prefix="fh6-mcp-oracle-", ignore_cleanup_errors=True
    ) as root_name:
        root = Path(root_name)
        (root / "logs").mkdir()
        (root / "settings.json").write_text(
            json.dumps({"language": "en-us", "speedUnit": "kmh"}), encoding="utf-8"
        )
        (root / "hud_config.json").write_text(
            json.dumps({"enabled": True, "showTeleMaster": True}), encoding="utf-8"
        )
        (root / "logs" / "backend.log").write_text("fixture log\n", encoding="utf-8")
        service = HorizonTunerMcpService(
            data_root=str(root),
            resource_root=str(root),
            telemetry_state_provider=lambda: LIVE,
        )
        project_root = Path(__file__).resolve().parents[2]
        service.car_db_path = str(project_root / "backend" / "car_database.json")
        car_id = next(
            iter(json.loads(Path(service.car_db_path).read_text(encoding="utf-8")))
        )
        service.calibration_dir = str(root / "docs" / "calibration")
        (root / "docs" / "calibration").mkdir(parents=True)
        (root / "drag_sessions").mkdir()
        (root / "tunings").mkdir()
        session_point = {
            "time": 1.0,
            "LapNumber": 1,
            "SpeedMetersPerSecond": 30.0,
            "DistanceTraveled": 100.0,
            "CurrentEngineRpm": 4000.0,
            "Gear": 3,
            "TireTemp": [190.0, 191.0, 188.0, 189.0],
            "NormalizedSuspensionTravel": [0.2, 0.2, 0.3, 0.3],
            "TireSlipAngle": [0.01, 0.01, 0.01, 0.01],
            "TireSlipRatio": [0.02, 0.02, 0.02, 0.02],
        }
        service.telemetry_db.create_session(
            "fixture-session", 247, "Fixture Car", 700, 800, 1.0
        )
        service.telemetry_db.insert_points_batch("fixture-session", [session_point])
        service.telemetry_db.finalize_session(
            "fixture-session", {"endReason": "fixture"}
        )
        capture = {
            "schemaVersion": "tuning-capture/v1",
            "captureId": "fixture-capture",
            "createdAt": "2026-09-22T00:00:00Z",
            "metadata": {
                "carOrdinal": 247,
                "installedParts": [],
                "surface": "asphalt",
                "purpose": "road",
            },
            "samples": [
                {"timestampMs": 0, "speedKmh": 50.0},
                {"timestampMs": 500, "speedKmh": 100.0},
            ],
            "confidence": "in_game_capture",
        }
        (root / "docs" / "calibration" / "fixture-capture.json").write_text(
            json.dumps(capture), encoding="utf-8"
        )
        (root / "drag_sessions" / "fixture-drag.json").write_text(
            json.dumps(
                {"car_name": "Fixture Car", "timestamp": 1, "times": {"0-100": 3.2}}
            ),
            encoding="utf-8",
        )
        (root / "tunings" / "fixture-preset.json").write_text(
            json.dumps(
                {
                    "car_id": car_id,
                    "created_at": "2026-09-22",
                    "schema_version": "fixture",
                    "spring": 123,
                }
            ),
            encoding="utf-8",
        )
        tools = McpToolManager(service)
        resources = McpResourceManager(service)
        protocol = McpProtocolHandler(tools, resources)
        calls = {
            "get_live_telemetry_snapshot": {},
            "get_driver_cockpit_telemetry": {},
            "get_vehicle_dynamics_telemetry": {},
            "get_tires_status_telemetry": {},
            "get_suspension_telemetry": {},
            "list_race_sessions": {},
            "get_session_summary": {"session_id": "fixture-session"},
            "query_session_telemetry": {
                "session_id": "fixture-session",
                "channels": ["time", "SpeedMetersPerSecond"],
            },
            "list_tuning_captures": {},
            "get_capture_summary": {"capture_id": "fixture-capture"},
            "query_capture_window": {
                "capture_id": "fixture-capture",
                "channels": ["timestampMs", "speedKmh"],
            },
            "compare_captures": {
                "baseline_id": "fixture-capture",
                "candidate_id": "fixture-capture",
            },
            "list_drag_sessions": {},
            "get_drag_analysis": {"filename": "fixture-drag.json"},
            "search_cars": {"query": car_id},
            "get_car_details": {"car_id": car_id},
            "get_car_tuning_capabilities": {"car_id": car_id},
            "get_tuning_constants_and_priors": {},
            "list_tuning_presets": {},
            "get_tuning_preset": {"car_id": car_id, "save_name": "fixture-preset"},
            "run_dev_tuning_solver": {
                "car_params": {
                    "ordinal": int(car_id),
                    "weight_kg": 1500,
                    "front_weight_bias": 0.54,
                    "drivetrain": "RWD",
                },
                "purpose": "road",
            },
            "run_gearing_solver": {
                "max_rpm": 7500,
                "peak_hp_rpm": 6800,
                "top_speed_kmh": 300,
                "gears_count": 6,
            },
            "diagnose_telemetry_handling": {
                "tire_temps": [105.0, 106.0, 85.0, 86.0],
                "symptom": "understeer_entry",
            },
            "get_system_settings": {},
            "get_hud_configurations": {},
            "get_recent_logs": {"line_count": 50},
        }
        output = {
            "arguments": calls,
            "tools": {
                name: normalize(tool_or_error(tools, name, args))
                for name, args in calls.items()
            },
            "resources": normalize(
                __import__("asyncio").run(resources.list_resources())
            ),
            "resource_reads": {
                uri: normalize(
                    __import__("asyncio").run(resource_or_error(resources, uri))
                )
                for uri in (
                    "fh6://telemetry/live",
                    "fh6://settings/current",
                    f"fh6://car/{car_id}",
                    f"fh6://tuning/{car_id}/fixture-preset",
                    "fh6://capture/fixture-capture",
                )
            },
            "initialize": normalize(
                __import__("asyncio").run(
                    protocol.handle_request(
                        {
                            "jsonrpc": "2.0",
                            "id": 1,
                            "method": "initialize",
                            "params": {},
                        }
                    )
                )
            ),
            "errors": normalize(
                __import__("asyncio").run(
                    protocol.handle_request(
                        {
                            "jsonrpc": "2.0",
                            "id": 2,
                            "method": "tools/call",
                            "params": {},
                        }
                    )
                )
            ),
        }
        destination = Path(__file__).with_name("mcp_golden.json")
        destination.write_text(
            json.dumps(output, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        print(destination)


if __name__ == "__main__":
    main()
