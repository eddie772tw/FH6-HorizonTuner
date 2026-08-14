"""Tool definitions, JSON schema validation, and dispatching for FH6-HorizonTuner MCP."""

from __future__ import annotations

import json
from typing import Any

from .protocol import McpError
from .service import HorizonTunerMcpService


class McpToolManager:
    """Manages MCP Tool declarations and execution."""

    def __init__(self, service: HorizonTunerMcpService):
        self.service = service

    async def list_tools(self) -> list[dict[str, Any]]:
        """Return list of all registered tool specifications."""
        return [
            # --- 1. TelemetryView Aligned Live Tools ---
            {
                "name": "get_live_telemetry_snapshot",
                "description": "Get latest live UDP telemetry snapshot, ingestion rate, and active session status.",
                "inputSchema": {"type": "object", "properties": {}},
            },
            {
                "name": "get_driver_cockpit_telemetry",
                "description": "Get cockpit telemetry matching TelemetryView EngineRpmDisplay & VerticalInputBar (RPM, shift alert, gear, speed in km/h & mph, throttle/brake/clutch/steer percentages).",
                "inputSchema": {"type": "object", "properties": {}},
            },
            {
                "name": "get_vehicle_dynamics_telemetry",
                "description": "Get vehicle dynamics matching TelemetryView VehicleDynamicsDisplay & GForceRadar (Lateral/Longitudinal/Vertical G, pitch/roll/yaw, Power kW/HP, Torque Nm/ft-lb, Boost PSI/bar, EV Regen).",
                "inputSchema": {"type": "object", "properties": {}},
            },
            {
                "name": "get_tires_status_telemetry",
                "description": "Get 4-wheel tire status matching TelemetryView TireRadar (FL/FR/RL/RR temperatures in °C & °F, slip angles, slip ratios %, combined slip vectors, and overheating/slipping alerts).",
                "inputSchema": {"type": "object", "properties": {}},
            },
            {
                "name": "get_suspension_telemetry",
                "description": "Get 4-wheel suspension status matching TelemetryView SuspensionBar (FL/FR/RL/RR normalized travel 0.0-1.0, bottoming alert threshold >= 0.95, roll deflection and pitch dive).",
                "inputSchema": {"type": "object", "properties": {}},
            },
            # --- 2. Race Sessions & Lap Analysis ---
            {
                "name": "list_race_sessions",
                "description": "List historical track recording sessions from SQLite (session ID, car name, PI, total laps, best lap time).",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "limit": {
                            "type": "integer",
                            "description": "Maximum sessions to return (default 20)",
                            "default": 20,
                        },
                        "offset": {
                            "type": "integer",
                            "description": "Offset index (default 0)",
                            "default": 0,
                        },
                    },
                },
            },
            {
                "name": "get_session_summary",
                "description": "Get detailed lap-by-lap timing, maximum speeds, average speeds, and distance for a race session.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "session_id": {
                            "type": "string",
                            "description": "Session ID string",
                        },
                    },
                    "required": ["session_id"],
                },
            },
            {
                "name": "query_session_telemetry",
                "description": "Query downsampled time-series telemetry points for a specific session/lap.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "session_id": {
                            "type": "string",
                            "description": "Session ID string",
                        },
                        "lap_number": {
                            "type": "integer",
                            "description": "Optional specific lap number (1-indexed)",
                        },
                        "downsample": {
                            "type": "integer",
                            "description": "Downsampling factor (e.g. 5 = every 5th point, default 1)",
                            "default": 1,
                        },
                        "channels": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Optional list of channel names to include (e.g. ['time', 'SpeedMetersPerSecond', 'CurrentEngineRpm', 'SuspTravel'])",
                        },
                    },
                    "required": ["session_id"],
                },
            },
            # --- 3. Tuning Captures & Calibration ---
            {
                "name": "list_tuning_captures",
                "description": "List captured tuning-capture/v1 test datasets from docs/calibration/ and captures/ directory.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "surface": {
                            "type": "string",
                            "description": "Filter by road surface (e.g. 'asphalt', 'dirt')",
                        },
                        "purpose": {
                            "type": "string",
                            "description": "Filter by purpose ('road', 'rally', 'drift', 'drag')",
                        },
                        "confidence": {
                            "type": "string",
                            "description": "Filter by confidence ('in_game_capture', 'community', 'unverified')",
                        },
                    },
                },
            },
            {
                "name": "get_capture_summary",
                "description": "Get metadata, sample count, duration, speed stats, and data hygiene integrity checks for a tuning capture.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "capture_id": {
                            "type": "string",
                            "description": "Capture ID or JSON filename",
                        },
                    },
                    "required": ["capture_id"],
                },
            },
            {
                "name": "query_capture_window",
                "description": "Query a sliced time window and downsampled channels from a tuning-capture/v1 dataset.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "capture_id": {
                            "type": "string",
                            "description": "Capture ID or JSON filename",
                        },
                        "start_ms": {
                            "type": "integer",
                            "description": "Start timestamp in ms (default 0)",
                            "default": 0,
                        },
                        "end_ms": {
                            "type": "integer",
                            "description": "End timestamp in ms",
                        },
                        "channels": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Selected channels to return",
                        },
                        "max_samples": {
                            "type": "integer",
                            "description": "Maximum samples to return (default 500)",
                            "default": 500,
                        },
                    },
                    "required": ["capture_id"],
                },
            },
            {
                "name": "compare_captures",
                "description": "Perform A/B comparison delta analysis between a baseline and candidate tuning capture.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "baseline_id": {
                            "type": "string",
                            "description": "Baseline capture ID or filename",
                        },
                        "candidate_id": {
                            "type": "string",
                            "description": "Candidate capture ID or filename",
                        },
                    },
                    "required": ["baseline_id", "candidate_id"],
                },
            },
            # --- 4. Drag Test Sessions ---
            {
                "name": "list_drag_sessions",
                "description": "List all recorded straight-line acceleration Drag test runs.",
                "inputSchema": {"type": "object", "properties": {}},
            },
            {
                "name": "get_drag_analysis",
                "description": "Get detailed drag acceleration times (0-100kmh, 0-200kmh, 60ft, 1/4mi) and launch telemetry.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "filename": {
                            "type": "string",
                            "description": "Drag session JSON filename",
                        },
                    },
                    "required": ["filename"],
                },
            },
            # --- 5. Car Database & Capabilities ---
            {
                "name": "search_cars",
                "description": "Search the Forza official car database by name, manufacturer, drivetrain, or class.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Car name or keyword to search",
                        },
                        "drivetrain": {
                            "type": "string",
                            "description": "Filter by drivetrain ('FWD', 'RWD', 'AWD')",
                        },
                        "car_class": {
                            "type": "string",
                            "description": "Filter by class ('D', 'C', 'B', 'A', 'S1', 'S2', 'X')",
                        },
                    },
                },
            },
            {
                "name": "get_car_details",
                "description": "Get native vehicle specifications (weight, distribution, horsepower, redline RPM, drivetrain) by car ID/Ordinal.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "car_id": {
                            "type": "string",
                            "description": "Car Ordinal or Database Key",
                        },
                    },
                    "required": ["car_id"],
                },
            },
            {
                "name": "get_car_tuning_capabilities",
                "description": "Resolve upgrade unlock capability contract (which sliders are unlocked given installed upgrade parts).",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "car_id": {
                            "type": "string",
                            "description": "Car Ordinal or Database Key",
                        },
                        "installed_parts": {
                            "type": "object",
                            "description": "Dictionary of installed parts (e.g. {'suspension': 'race', 'arb': 'race', 'differential': 'race'})",
                        },
                    },
                    "required": ["car_id"],
                },
            },
            {
                "name": "get_tuning_constants_and_priors",
                "description": "Get system physics priors, critical damping ratios, and natural frequencies for tuning calculations.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "profile_name": {
                            "type": "string",
                            "description": "Optional specific profile name (e.g. 'natural_frequency_hz')",
                        },
                    },
                },
            },
            # --- 6. Tuning Presets & Solvers ---
            {
                "name": "list_tuning_presets",
                "description": "List saved user tuning presets.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "car_id": {
                            "type": "string",
                            "description": "Optional filter by Car ID",
                        },
                    },
                },
            },
            {
                "name": "get_tuning_preset",
                "description": "Get complete parameters for a saved user tuning preset.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "car_id": {
                            "type": "string",
                            "description": "Car ID or folder name",
                        },
                        "save_name": {
                            "type": "string",
                            "description": "Preset save name",
                        },
                    },
                    "required": ["car_id", "save_name"],
                },
            },
            {
                "name": "run_dev_tuning_solver",
                "description": "Execute pure physics tuning calculation for Road, Rally, Drift, or Drag and return recommended baseline setups.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "car_params": {
                            "type": "object",
                            "description": "Vehicle parameters (weight_kg, front_weight_bias, drivetrain, max_rpm)",
                        },
                        "installed_parts": {
                            "type": "object",
                            "description": "Optional dictionary of installed parts (e.g. {'suspension': 'race'})",
                        },
                        "purpose": {
                            "type": "string",
                            "enum": ["road", "rally", "drift", "drag"],
                            "description": "Tuning discipline (default 'road')",
                            "default": "road",
                        },
                    },
                    "required": ["car_params"],
                },
            },
            {
                "name": "run_gearing_solver",
                "description": "Execute AEGO geometric powerband gearing optimization based on peak horsepower RPM and redline.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "max_rpm": {
                            "type": "number",
                            "description": "Redline engine RPM (e.g. 8000)",
                        },
                        "peak_hp_rpm": {
                            "type": "number",
                            "description": "Peak horsepower RPM (e.g. 7200)",
                        },
                        "top_speed_kmh": {
                            "type": "number",
                            "description": "Target top speed in km/h (e.g. 320)",
                        },
                        "gears_count": {
                            "type": "integer",
                            "description": "Number of transmission gears (default 6)",
                            "default": 6,
                        },
                        "tire_diameter_cm": {
                            "type": "number",
                            "description": "Driven tire diameter in cm (default 65.0)",
                            "default": 65.0,
                        },
                    },
                    "required": ["max_rpm", "peak_hp_rpm", "top_speed_kmh"],
                },
            },
            {
                "name": "diagnose_telemetry_handling",
                "description": "Execute closed-loop handling diagnosis based on tire temperatures, hot pressures, and handling symptoms.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "tire_temps": {
                            "type": "array",
                            "items": {"type": "number"},
                            "description": "List of 4 tire temperatures [FL, FR, RL, RR] in Celsius",
                        },
                        "hot_pressures": {
                            "type": "array",
                            "items": {"type": "number"},
                            "description": "Optional list of 4 hot tire pressures [FL, FR, RL, RR] in PSI",
                        },
                        "symptom": {
                            "type": "string",
                            "enum": ["understeer_entry", "oversteer_exit", "neutral"],
                            "description": "Observed driving handling anomaly",
                        },
                    },
                    "required": ["tire_temps"],
                },
            },
            # --- 7. Settings & Diagnostics ---
            {
                "name": "get_system_settings",
                "description": "Get current app configuration (speed unit, telemetry ports, language).",
                "inputSchema": {"type": "object", "properties": {}},
            },
            {
                "name": "get_hud_configurations",
                "description": "Get HUD overlay master switch status, layout configs, and audio spectrum capture device.",
                "inputSchema": {"type": "object", "properties": {}},
            },
            {
                "name": "get_recent_logs",
                "description": "Read recent lines from the backend log file (backend.log) for troubleshooting.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "line_count": {
                            "type": "integer",
                            "description": "Number of lines to read (default 50)",
                            "default": 50,
                        },
                    },
                },
            },
        ]

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        """Dispatch tool call by name."""
        try:
            result = self._dispatch_sync(name, arguments)
            return {
                "content": [
                    {
                        "type": "text",
                        "text": json.dumps(result, indent=2, ensure_ascii=False),
                    }
                ]
            }
        except McpError:
            raise
        except Exception as exc:
            return {
                "isError": True,
                "content": [
                    {
                        "type": "text",
                        "text": f"Error executing tool '{name}': {exc}",
                    }
                ],
            }

    def _dispatch_sync(self, name: str, args: dict[str, Any]) -> Any:
        # 1. Telemetry
        if name == "get_live_telemetry_snapshot":
            return self.service.get_live_telemetry_snapshot()
        if name == "get_driver_cockpit_telemetry":
            return self.service.get_driver_cockpit_telemetry()
        if name == "get_vehicle_dynamics_telemetry":
            return self.service.get_vehicle_dynamics_telemetry()
        if name == "get_tires_status_telemetry":
            return self.service.get_tires_status_telemetry()
        if name == "get_suspension_telemetry":
            return self.service.get_suspension_telemetry()

        # 2. Race Sessions
        if name == "list_race_sessions":
            limit = int(args.get("limit", 20))
            offset = int(args.get("offset", 0))
            return self.service.list_race_sessions(limit=limit, offset=offset)
        if name == "get_session_summary":
            session_id = args.get("session_id")
            if not session_id:
                raise McpError(-32602, "Missing 'session_id'")
            data = self.service.get_session_summary(str(session_id))
            if data is None:
                raise McpError(-32004, f"Session '{session_id}' not found")
            return data
        if name == "query_session_telemetry":
            session_id = args.get("session_id")
            if not session_id:
                raise McpError(-32602, "Missing 'session_id'")
            lap_number = args.get("lap_number")
            downsample = int(args.get("downsample", 1))
            channels = args.get("channels")
            return self.service.query_session_telemetry(
                str(session_id),
                lap_number=int(lap_number) if lap_number is not None else None,
                downsample=downsample,
                channels=channels,
            )

        # 3. Tuning Captures
        if name == "list_tuning_captures":
            return self.service.list_tuning_captures(
                surface=args.get("surface"),
                purpose=args.get("purpose"),
                confidence=args.get("confidence"),
            )
        if name == "get_capture_summary":
            capture_id = args.get("capture_id")
            if not capture_id:
                raise McpError(-32602, "Missing 'capture_id'")
            data = self.service.get_capture_summary(str(capture_id))
            if data is None:
                raise McpError(-32004, f"Capture dataset '{capture_id}' not found")
            return data
        if name == "query_capture_window":
            capture_id = args.get("capture_id")
            if not capture_id:
                raise McpError(-32602, "Missing 'capture_id'")
            return self.service.query_capture_window(
                str(capture_id),
                start_ms=int(args.get("start_ms", 0)),
                end_ms=int(args.get("end_ms"))
                if args.get("end_ms") is not None
                else None,
                channels=args.get("channels"),
                max_samples=int(args.get("max_samples", 500)),
            )
        if name == "compare_captures":
            b_id = args.get("baseline_id")
            c_id = args.get("candidate_id")
            if not b_id or not c_id:
                raise McpError(-32602, "Requires both 'baseline_id' and 'candidate_id'")
            res = self.service.compare_captures(str(b_id), str(c_id))
            if res is None:
                raise McpError(
                    -32004, "One or both capture datasets could not be loaded"
                )
            return res

        # 4. Drag
        if name == "list_drag_sessions":
            return self.service.list_drag_sessions()
        if name == "get_drag_analysis":
            fn = args.get("filename")
            if not fn:
                raise McpError(-32602, "Missing 'filename'")
            data = self.service.get_drag_analysis(str(fn))
            if data is None:
                raise McpError(-32004, f"Drag session file '{fn}' not found")
            return data

        # 5. Cars & Capabilities
        if name == "search_cars":
            return self.service.search_cars(
                query=args.get("query"),
                drivetrain=args.get("drivetrain"),
                car_class=args.get("car_class"),
            )
        if name == "get_car_details":
            car_id = args.get("car_id")
            if not car_id:
                raise McpError(-32602, "Missing 'car_id'")
            car = self.service.get_car_details(str(car_id))
            if car is None:
                raise McpError(-32004, f"Car '{car_id}' not found in database")
            return car
        if name == "get_car_tuning_capabilities":
            car_id = args.get("car_id")
            if not car_id:
                raise McpError(-32602, "Missing 'car_id'")
            return self.service.get_car_tuning_capabilities(
                str(car_id), installed_parts=args.get("installed_parts")
            )
        if name == "get_tuning_constants_and_priors":
            return self.service.get_tuning_constants_and_priors(
                profile_name=args.get("profile_name")
            )

        # 6. Presets & Solvers
        if name == "list_tuning_presets":
            return self.service.list_tuning_presets(car_id=args.get("car_id"))
        if name == "get_tuning_preset":
            car_id = args.get("car_id")
            save_name = args.get("save_name")
            if not car_id or not save_name:
                raise McpError(-32602, "Requires 'car_id' and 'save_name'")
            preset = self.service.get_tuning_preset(str(car_id), str(save_name))
            if preset is None:
                raise McpError(
                    -32004, f"Tuning preset '{car_id}/{save_name}' not found"
                )
            return preset
        if name == "run_dev_tuning_solver":
            car_params = args.get("car_params")
            if not isinstance(car_params, dict):
                raise McpError(-32602, "Missing or invalid 'car_params' dictionary")
            return self.service.run_dev_tuning_solver(
                car_params,
                installed_parts=args.get("installed_parts"),
                purpose=args.get("purpose", "road"),
            )
        if name == "run_gearing_solver":
            return self.service.run_gearing_solver(
                max_rpm=float(args.get("max_rpm", 0)),
                peak_hp_rpm=float(args.get("peak_hp_rpm", 0)),
                top_speed_kmh=float(args.get("top_speed_kmh", 0)),
                gears_count=int(args.get("gears_count", 6)),
                tire_diameter_cm=float(args.get("tire_diameter_cm", 65.0)),
            )
        if name == "diagnose_telemetry_handling":
            tire_temps = args.get("tire_temps")
            if not isinstance(tire_temps, list) or len(tire_temps) < 4:
                raise McpError(
                    -32602, "Requires 'tire_temps' array with 4 values [FL, FR, RL, RR]"
                )
            return self.service.diagnose_telemetry_handling(
                tire_temps=[float(t) for t in tire_temps],
                hot_pressures=args.get("hot_pressures"),
                symptom=args.get("symptom"),
            )

        # 7. Settings & Logs
        if name == "get_system_settings":
            return self.service.get_system_settings()
        if name == "get_hud_configurations":
            return self.service.get_hud_configurations()
        if name == "get_recent_logs":
            return self.service.get_recent_logs(
                line_count=int(args.get("line_count", 50))
            )

        raise McpError(-32601, f"Tool not found: {name}")
