#!/usr/bin/env python3
"""FH6-HorizonTuner Agent CLI.

A robust, self-contained CLI tool designed for AI Agents (Antigravity, Codex,
Jules, scripts, terminal LLM runners) to participate in tuning workflows,
telemetry monitoring, closed-loop handling diagnosis, and MCP configurations.

Designed for long-term stability:
- Zero external third-party pip dependencies (standard library only).
- Offline & Online dual mode (deterministic math offline, live UDP telemetry online).
- Fully compatible with PyInstaller packaging as standalone binary or Tauri sidecar.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
import urllib.error
import urllib.request
from typing import Any

CLI_VERSION = "1.0.0"
APP_VERSION = "11.45.17"
DEFAULT_HTTP_PORT = 8001
DEFAULT_UDP_PORT = 8000


# =============================================================================
# 1. Runtime Environment & Path Resolution
# =============================================================================


class RuntimeContext:
    """Manages paths and runtime environment for both source and frozen (PyInstaller) modes."""

    def __init__(self, data_dir: str | None = None, backend_url: str | None = None):
        self.is_frozen = getattr(sys, "frozen", False)

        if self.is_frozen:
            self.resource_root = getattr(
                sys, "_MEIPASS", os.path.dirname(sys.executable)
            )
            self.data_root = os.path.abspath(
                data_dir or os.path.dirname(sys.executable)
            )
        else:
            current_dir = os.path.dirname(os.path.abspath(__file__))
            # If agent_cli.py is inside backend/, repo root is parent directory
            repo_root = (
                os.path.dirname(current_dir)
                if os.path.basename(current_dir) == "backend"
                else current_dir
            )
            self.resource_root = os.path.join(repo_root, "backend")
            self.data_root = os.path.abspath(data_dir or repo_root)

        self._user_backend_url = backend_url
        self._cached_backend_url: str | None = None

    def resolve_car_database_path(self) -> str | None:
        candidates = [
            os.path.join(self.resource_root, "car_database.json"),
            os.path.join(self.data_root, "car_database.json"),
            os.path.join(self.data_root, "backend", "car_database.json"),
        ]
        for path in candidates:
            if os.path.isfile(path):
                return path
        return None

    def resolve_tunings_dir(self) -> str:
        candidates = [
            os.path.join(self.data_root, "tunings"),
            os.path.join(self.data_root, "backend", "tunings"),
        ]
        for path in candidates:
            if os.path.isdir(path):
                return path
        primary = os.path.join(self.data_root, "tunings")
        os.makedirs(primary, exist_ok=True)
        return primary

    def resolve_backend_url(self) -> str:
        if self._user_backend_url:
            return self._user_backend_url.rstrip("/")

        if self._cached_backend_url:
            return self._cached_backend_url

        port = self._discover_bound_port()
        self._cached_backend_url = f"http://127.0.0.1:{port}"
        return self._cached_backend_url

    def _discover_bound_port(self) -> int:
        port_file_candidates = [
            os.path.join(self.data_root, "logs", "web_port.txt"),
            os.path.join(self.data_root, "backend", "logs", "web_port.txt"),
            os.path.join(self.resource_root, "logs", "web_port.txt"),
        ]
        for p in port_file_candidates:
            if os.path.isfile(p):
                try:
                    with open(p, "r", encoding="utf-8") as f:
                        val = f.read().strip()
                        if val.isdigit():
                            return int(val)
                except Exception:
                    pass
        return DEFAULT_HTTP_PORT


# =============================================================================
# 2. HTTP & MCP Protocol Client
# =============================================================================


class BackendClient:
    """Lightweight HTTP client communicating with HorizonTuner REST & MCP endpoints."""

    def __init__(self, base_url: str, timeout: float = 3.0):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def get(self, endpoint: str) -> tuple[bool, Any]:
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": f"FH6-Agent-CLI/{CLI_VERSION}",
                "Accept": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return True, data
        except urllib.error.HTTPError as e:
            try:
                err_body = json.loads(e.read().decode("utf-8"))
            except Exception:
                err_body = str(e)
            return False, {"http_code": e.code, "error": err_body}
        except Exception as e:
            return False, {"error": str(e), "unreachable": True}

    def post(self, endpoint: str, payload: dict[str, Any]) -> tuple[bool, Any]:
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        data_bytes = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data_bytes,
            headers={
                "User-Agent": f"FH6-Agent-CLI/{CLI_VERSION}",
                "Content-Type": "application/json",
                "Accept": "application/json, text/event-stream",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return True, data
        except urllib.error.HTTPError as e:
            try:
                err_body = json.loads(e.read().decode("utf-8"))
            except Exception:
                err_body = str(e)
            return False, {"http_code": e.code, "error": err_body}
        except Exception as e:
            return False, {"error": str(e), "unreachable": True}

    def call_mcp_tool(
        self, tool_name: str, arguments: dict[str, Any]
    ) -> tuple[bool, Any]:
        payload = {
            "jsonrpc": "2.0",
            "id": int(time.time() * 1000),
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": arguments,
            },
        }
        success, res = self.post("mcp", payload)
        if not success:
            return False, res

        if "error" in res:
            return False, res["error"]

        result = res.get("result", {})
        if result.get("isError"):
            return False, result

        # Extract text content if standard MCP tool response
        contents = result.get("content", [])
        if contents and isinstance(contents, list) and "text" in contents[0]:
            try:
                parsed_text = json.loads(contents[0]["text"])
                return True, parsed_text
            except Exception:
                return True, contents[0]["text"]
        return True, result


# =============================================================================
# 3. Deterministic Physics & Tuning Solvers (Pure Math Invariant)
# =============================================================================


class TuningMathSolver:
    """Deterministic tuning algorithms aligned with frontend/src/utils/tuningMath.ts and MCP service."""

    @staticmethod
    def calculate_chassis(
        weight_kg: float,
        front_weight_bias: float,
        drivetrain: str = "RWD",
        purpose: str = "road",
        aero_f: float = 0.0,
        aero_r: float = 0.0,
    ) -> dict[str, Any]:
        """Calculates pure suspension, ARBs, springs, dampers, and differential setup."""
        weight_kg = max(500.0, min(3500.0, weight_kg))
        weight_lbs = weight_kg * 2.20462

        f_bias = front_weight_bias
        if f_bias > 1.0:
            f_bias /= 100.0
        f_bias = max(0.2, min(0.8, f_bias))
        r_bias = 1.0 - f_bias

        dt = drivetrain.upper()
        if dt not in {"AWD", "RWD", "FWD"}:
            dt = "RWD"

        goal = purpose.lower()
        if goal not in {"road", "drift", "rally", "drag"}:
            goal = "road"

        # 1. Anti-Roll Bars (ARB)
        if goal == "drag":
            arb_f = 1.0
            arb_r = 65.0
        elif goal == "drift":
            arb_f = 10.0
            arb_r = 50.0
        elif goal == "rally":
            arb_f = round(((64.0 * f_bias) + 1.0) * 0.35, 1)
            arb_r = round(((64.0 * r_bias) + 1.0) * 0.35, 1)
        else:  # road
            if dt == "AWD":
                arb_f = round(min(5.0, 1.0 + 4.0 * f_bias), 1)
                arb_r = round(max(50.0, 65.0 - 0.3 * (100.0 - (r_bias * 100.0))), 1)
            else:
                arb_f = round((64.0 * f_bias) + 1.0, 1)
                arb_r = round((64.0 * r_bias) + 1.0, 1)

        # 2. Springs (lbs/in and kgf/mm)
        spring_base_f_lbs = weight_lbs * f_bias * 0.70
        spring_base_r_lbs = weight_lbs * r_bias * 0.70

        if goal == "drift":
            spring_f_lbs = weight_lbs * f_bias * 0.035 * 10.0
            spring_r_lbs = weight_lbs * r_bias * 0.035 * 10.0
        elif goal == "rally":
            spring_f_lbs = spring_base_f_lbs * 0.65
            spring_r_lbs = spring_base_r_lbs * 0.65
        elif goal == "drag":
            spring_f_lbs = spring_base_f_lbs * 0.50
            spring_r_lbs = spring_base_r_lbs * 1.30
        else:  # road
            aero_add_f = (aero_f / 10.0) * 0.5 if aero_f > 0 else 0.0
            aero_add_r = (aero_r / 25.0) * 0.5 if aero_r > 0 else 0.0
            spring_f_lbs = spring_base_f_lbs + aero_add_f
            spring_r_lbs = spring_base_r_lbs + aero_add_r

        spring_f_kgf = spring_f_lbs * 0.017858
        spring_r_kgf = spring_r_lbs * 0.017858

        # 3. Ride Height Recommendation (Clicks / Stance)
        if goal == "drift":
            ride_height = {"front": "Lowest + 1 click", "rear": "Lowest"}
        elif goal == "rally":
            ride_height = {"front": "Maximum (Highest)", "rear": "Maximum (Highest)"}
        elif goal == "drag":
            ride_height = {
                "front": "Lowest (Front Rake)",
                "rear": "Highest (Weight Transfer)",
            }
        else:
            ride_height = {
                "front": "Stock/Min + 3 clicks",
                "rear": "Stock/Min + 3 clicks",
            }

        # 4. Dampers (Rebound and Bump)
        if goal == "drift":
            rebound_f = 6.0
            rebound_r = 6.0
            bump_f = round(rebound_f * 0.50, 1)
            bump_r = round(rebound_r * 0.50, 1)
        elif goal == "rally":
            rebound_f = round((14.0 * f_bias) + 1.0, 1)
            rebound_r = round((14.0 * r_bias) + 1.0, 1)
            bump_f = round(rebound_f * 0.40, 1)
            bump_r = round(rebound_r * 0.40, 1)
        elif goal == "drag":
            rebound_f = 3.0
            rebound_r = 12.0
            bump_f = 4.0
            bump_r = 10.0
        else:  # road
            rebound_f = round((19.0 * f_bias) + 1.0, 1)
            rebound_r = round((19.0 * r_bias) + 1.0, 1)
            bump_f = round(rebound_f * 0.60, 1)
            bump_r = round(rebound_r * 0.60, 1)

        # 5. Differential Settings
        if dt == "FWD":
            diff = {
                "front_accel": 45,
                "front_decel": 0,
                "rear_accel": 0,
                "rear_decel": 0,
                "center_balance": 0,
            }
        elif dt == "AWD":
            if goal == "drift":
                diff = {
                    "front_accel": 25,
                    "front_decel": 0,
                    "rear_accel": 100,
                    "rear_decel": 100,
                    "center_balance": 85,
                }
            elif goal == "rally":
                diff = {
                    "front_accel": 40,
                    "front_decel": 0,
                    "rear_accel": 70,
                    "rear_decel": 20,
                    "center_balance": 60,
                }
            else:
                diff = {
                    "front_accel": 30,
                    "front_decel": 0,
                    "rear_accel": 65,
                    "rear_decel": 15,
                    "center_balance": 65,
                }
        else:  # RWD
            if goal == "drift":
                diff = {
                    "front_accel": 0,
                    "front_decel": 0,
                    "rear_accel": 100,
                    "rear_decel": 100,
                    "center_balance": 0,
                }
            elif goal == "drag":
                diff = {
                    "front_accel": 0,
                    "front_decel": 0,
                    "rear_accel": 100,
                    "rear_decel": 100,
                    "center_balance": 0,
                }
            else:
                diff = {
                    "front_accel": 0,
                    "front_decel": 0,
                    "rear_accel": 60,
                    "rear_decel": 20,
                    "center_balance": 0,
                }

        # 6. Alignment & Tire Pressures
        if goal == "drift":
            camber_f, camber_r = -3.5, -1.0
            toe_f, toe_r = 0.5, -0.2
            caster = 7.0
            cold_psi_f, cold_psi_r = 32.0, 26.0
        elif goal == "rally":
            camber_f, camber_r = -1.5, -1.0
            toe_f, toe_r = 0.1, 0.0
            caster = 6.0
            cold_psi_f, cold_psi_r = 25.0, 25.0
        elif goal == "drag":
            camber_f, camber_r = -0.5, 0.0
            toe_f, toe_r = 0.0, 0.0
            caster = 5.0
            cold_psi_f, cold_psi_r = 35.0, 20.0
        else:  # road
            camber_f, camber_r = -1.8, -1.2
            toe_f, toe_r = 0.0, 0.0
            caster = 6.5
            cold_psi_f, cold_psi_r = 28.5, 28.5

        return {
            "schemaVersion": "tuning-dev/v1",
            "goal": goal,
            "drivetrain": dt,
            "weight_kg": round(weight_kg, 1),
            "front_weight_bias_pct": round(f_bias * 100.0, 1),
            "anti_roll_bars": {
                "front": arb_f,
                "rear": arb_r,
            },
            "springs": {
                "front_lbs_in": round(spring_f_lbs, 1),
                "rear_lbs_in": round(spring_r_lbs, 1),
                "front_kgf_mm": round(spring_f_kgf, 2),
                "rear_kgf_mm": round(spring_r_kgf, 2),
            },
            "ride_height": ride_height,
            "dampers": {
                "rebound_front": rebound_f,
                "rebound_rear": rebound_r,
                "bump_front": bump_f,
                "bump_rear": bump_r,
            },
            "alignment": {
                "camber_front_deg": camber_f,
                "camber_rear_deg": camber_r,
                "toe_front_deg": toe_f,
                "toe_rear_deg": toe_r,
                "caster_deg": caster,
            },
            "tires": {
                "front_cold_psi": cold_psi_f,
                "rear_cold_psi": cold_psi_r,
                "target_hot_psi": 32.0,
            },
            "differential": diff,
        }

    @staticmethod
    def calculate_gearing(
        max_rpm: float,
        peak_hp_rpm: float,
        top_speed_kmh: float,
        gears_count: int = 6,
        tire_diameter_cm: float = 65.0,
    ) -> dict[str, Any]:
        """AEGO geometric powerband gearing solver."""
        if max_rpm <= 0 or peak_hp_rpm <= 0 or gears_count < 1:
            return {"error": "Invalid engine or gear parameters"}

        tire_circumference_m = (tire_diameter_cm / 100.0) * math.pi
        wheel_rpm_at_top = (top_speed_kmh / 3.6 / tire_circumference_m) * 60.0
        final_drive = (
            round(peak_hp_rpm / (wheel_rpm_at_top * 0.85), 2)
            if wheel_rpm_at_top > 0
            else 3.73
        )

        step_ratio = min(0.85, peak_hp_rpm / max_rpm)
        gears = []
        curr_ratio = 3.20
        for g in range(1, gears_count + 1):
            speed_redline = (
                (max_rpm / (curr_ratio * final_drive) * tire_circumference_m / 60.0)
                * 3.6
                if final_drive > 0 and curr_ratio > 0
                else 0.0
            )
            upshift_drop = round(max_rpm * step_ratio, 0) if g < gears_count else None

            gears.append(
                {
                    "gear": g,
                    "ratio": round(curr_ratio, 2),
                    "speed_at_redline_kmh": round(speed_redline, 1),
                    "upshift_drop_rpm": upshift_drop,
                }
            )
            curr_ratio *= step_ratio

        return {
            "final_drive": final_drive,
            "gears_count": gears_count,
            "gears": gears,
            "powerband_retention_ratio": round(step_ratio, 3),
        }

    @classmethod
    def export_applied_setup(
        cls, chassis: dict[str, Any], gearing: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        """Converts solver output into AppliedTuningSetup dictionary matching frontend Step 5."""
        diff = chassis.get("differential", {})
        setup = {
            "tirePressureFront": chassis["tires"]["front_cold_psi"],
            "tirePressureRear": chassis["tires"]["rear_cold_psi"],
            "camberFront": chassis["alignment"]["camber_front_deg"],
            "camberRear": chassis["alignment"]["camber_rear_deg"],
            "toeFront": chassis["alignment"]["toe_front_deg"],
            "toeRear": chassis["alignment"]["toe_rear_deg"],
            "caster": chassis["alignment"]["caster_deg"],
            "arbFront": chassis["anti_roll_bars"]["front"],
            "arbRear": chassis["anti_roll_bars"]["rear"],
            "springsFront": chassis["springs"]["front_lbs_in"],
            "springsRear": chassis["springs"]["rear_lbs_in"],
            "rideHeightFront": 12.0,
            "rideHeightRear": 12.0,
            "reboundFront": chassis["dampers"]["rebound_front"],
            "reboundRear": chassis["dampers"]["rebound_rear"],
            "bumpFront": chassis["dampers"]["bump_front"],
            "bumpRear": chassis["dampers"]["bump_rear"],
            "diffAccelRear": diff.get("rear_accel", 60),
            "diffDecelRear": diff.get("rear_decel", 20),
        }

        if "front_accel" in diff:
            setup["diffAccelFront"] = diff["front_accel"]
        if "front_decel" in diff:
            setup["diffDecelFront"] = diff["front_decel"]
        if "center_balance" in diff:
            setup["diffCenterRear"] = diff["center_balance"]

        if gearing and "final_drive" in gearing:
            setup["finalDrive"] = gearing["final_drive"]

        return setup

    @classmethod
    def export_preset_format(
        cls,
        car_id: int | str,
        vehicle_class: str,
        chassis: dict[str, Any],
        gearing: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Generates a TuningPresetV1 compatible dictionary for frontend and API persistence."""
        applied = cls.export_applied_setup(chassis, gearing)
        return {
            "schemaVersion": "tuning-preset/v1",
            "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "gameBuild": "FH6_B1.0",
            "vehicleClass": vehicle_class.upper(),
            "profileUsed": chassis.get("goal", "road"),
            "installedParts": {},
            "parameters": {
                "tire_pressure_f": applied["tirePressureFront"],
                "tire_pressure_r": applied["tirePressureRear"],
                "camber_front": applied["camberFront"],
                "camber_rear": applied["camberRear"],
                "toe_front": applied["toeFront"],
                "toe_rear": applied["toeRear"],
                "caster": applied["caster"],
                "arb_front": applied["arbFront"],
                "arb_rear": applied["arbRear"],
                "spring_front": applied["springsFront"],
                "spring_rear": applied["springsRear"],
                "rebound_front": applied["reboundFront"],
                "rebound_rear": applied["reboundRear"],
                "bump_front": applied["bumpFront"],
                "bump_rear": applied["bumpRear"],
                "diff_accel_rear": applied["diffAccelRear"],
                "diff_decel_rear": applied["diffDecelRear"],
                "final_drive": applied.get("finalDrive", 3.73),
            },
            "solverOutputSnapshot": {
                "chassis": chassis,
                "gearing": gearing,
            },
            "calibrationStatus": "unverified",
        }


# =============================================================================
# 4. Vehicle Database Reader
# =============================================================================


class CarDatabase:
    """Offline reader for car_database.json."""

    def __init__(self, ctx: RuntimeContext):
        self.ctx = ctx
        self._data: dict[str, Any] | None = None

    def load(self) -> dict[str, Any]:
        if self._data is not None:
            return self._data
        db_path = self.ctx.resolve_car_database_path()
        if not db_path:
            self._data = {}
            return self._data
        try:
            with open(db_path, "r", encoding="utf-8") as f:
                self._data = json.load(f)
        except Exception:
            self._data = {}
        return self._data

    def search(
        self,
        query: str,
        drivetrain: str | None = None,
        limit: int = 15,
    ) -> list[dict[str, Any]]:
        db = self.load()
        q = query.lower()
        results = []

        for cid, info in db.items():
            name = str(info.get("display_name", "")).lower()
            make = str(info.get("make", "")).lower()
            model = str(info.get("model", "")).lower()

            if q in name or q in make or q in model:
                if drivetrain:
                    dt = str(info.get("drivetrain", "")).upper()
                    if dt and dt != drivetrain.upper():
                        continue

                entry = dict(info)
                entry["car_id"] = int(cid) if cid.isdigit() else cid
                results.append(entry)
                if len(results) >= limit:
                    break
        return results

    def get_car(self, car_id: int | str) -> dict[str, Any] | None:
        db = self.load()
        sid = str(car_id)
        return db.get(sid)


# =============================================================================
# 5. CLI Command Handlers
# =============================================================================


def handle_status(
    args: argparse.Namespace, ctx: RuntimeContext, client: BackendClient
) -> int:
    backend_url = ctx.resolve_backend_url()
    connected, status_data = client.get("api/mcp/status")

    # Check telemetry health
    telemetry_connected = False
    game_in_race = False
    live_speed = 0.0

    if connected:
        client.get("api/overlay/media/info")
        # Try fetching live snapshot via MCP tool or REST
        snap_ok, snap_data = client.call_mcp_tool("get_live_telemetry_snapshot", {})
        if snap_ok and isinstance(snap_data, dict):
            telemetry_connected = snap_data.get("ingestion_status") in {
                "active",
                "receiving",
                "live",
            }
            raw = snap_data.get("raw", {})
            live_speed = round(raw.get("Speed", 0.0) * 3.6, 1)
            game_in_race = raw.get("IsRaceOn", 0) == 1

    result = {
        "cli_version": CLI_VERSION,
        "app_version": APP_VERSION,
        "backend_url": backend_url,
        "backend_running": connected,
        "mcp_enabled": connected and status_data.get("transport") is not None,
        "mcp_endpoint": f"{backend_url}/mcp",
        "telemetry_udp_port": DEFAULT_UDP_PORT,
        "telemetry_receiving": telemetry_connected,
        "is_race_on": game_in_race,
        "current_speed_kmh": live_speed,
        "mode": "online" if connected else "offline",
    }

    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        print("=" * 60)
        print(f"  FH6-HorizonTuner Agent Status  (v{CLI_VERSION})")
        print("=" * 60)
        print(f"  Mode              : {result['mode'].upper()}")
        print(f"  Backend URL       : {result['backend_url']}")
        print(
            f"  Backend Service   : {'ONLINE (Ready)' if connected else 'OFFLINE (Pure math fallback active)'}"
        )
        print(
            f"  MCP Endpoint      : {result['mcp_endpoint']} ({'Active' if result['mcp_enabled'] else 'Unavailable'})"
        )
        print(f"  Telemetry Ingest  : UDP 127.0.0.1:{result['telemetry_udp_port']}")
        print(
            f"  Game Signal       : {'RECEIVING' if telemetry_connected else 'NO SIGNAL (Start FH6 Data Out)'}"
        )
        if telemetry_connected:
            print(f"  Race Active       : {'YES' if game_in_race else 'PAUSED'}")
            print(f"  Live Speed        : {live_speed} km/h")
        print("=" * 60)
    return 0


def handle_mcp_config(args: argparse.Namespace, ctx: RuntimeContext) -> int:
    backend_url = ctx.resolve_backend_url()
    mcp_url = f"{backend_url}/mcp"
    client_type = getattr(args, "client", "all").lower()

    configs = {
        "mcp_url": mcp_url,
        "codex": {
            "instruction": "Run in terminal once:",
            "command": f"codex mcp add fh6-horizon-tuner --url {mcp_url}",
        },
        "claude_desktop": {
            "config_path": "%APPDATA%\\Claude\\claude_desktop_config.json",
            "snippet": {
                "mcpServers": {
                    "fh6-horizon-tuner": {
                        "url": mcp_url,
                    }
                }
            },
        },
        "cursor": {
            "type": "Streamable HTTP",
            "name": "fh6-horizon-tuner",
            "url": mcp_url,
        },
    }

    if args.json:
        if client_type in configs and client_type != "all":
            print(json.dumps(configs[client_type], indent=2, ensure_ascii=False))
        else:
            print(json.dumps(configs, indent=2, ensure_ascii=False))
    else:
        print(f"MCP Streamable HTTP Endpoint: {mcp_url}\n")
        if client_type in {"codex", "all"}:
            print("--- Codex Registration Command ---")
            print(f"  {configs['codex']['command']}\n")
        if client_type in {"claude", "claude_desktop", "all"}:
            print("--- Claude Desktop Configuration ---")
            print(json.dumps(configs["claude_desktop"]["snippet"], indent=2))
            print()
        if client_type in {"cursor", "all"}:
            print("--- Cursor Configuration ---")
            print(
                f"  Add MCP Server: Name='fh6-horizon-tuner', Type='HTTP', URL='{mcp_url}'\n"
            )
    return 0


def handle_cars_search(args: argparse.Namespace, ctx: RuntimeContext) -> int:
    db = CarDatabase(ctx)
    results = db.search(
        args.query, drivetrain=getattr(args, "drive", None), limit=args.limit
    )

    if args.json:
        print(
            json.dumps(
                {"query": args.query, "count": len(results), "cars": results},
                indent=2,
                ensure_ascii=False,
            )
        )
    else:
        if not results:
            print(f"No cars found matching '{args.query}'.")
            return 1
        print(f"Found {len(results)} vehicle(s) matching '{args.query}':")
        for c in results:
            print(f"  [{c.get('car_id', 'N/A')}] {c.get('display_name', 'Unknown')}")
    return 0


def handle_cars_get(args: argparse.Namespace, ctx: RuntimeContext) -> int:
    db = CarDatabase(ctx)
    car = db.get_car(args.car_id)
    if not car:
        err = {"error": f"Vehicle ordinal {args.car_id} not found in database."}
        if args.json:
            print(json.dumps(err, indent=2))
        else:
            print(err["error"])
        return 1

    if args.json:
        print(json.dumps(car, indent=2, ensure_ascii=False))
    else:
        print(f"--- Car Ordinal {args.car_id} Specification ---")
        for k, v in car.items():
            print(f"  {k:20}: {v}")
    return 0


def handle_solve_chassis(args: argparse.Namespace, ctx: RuntimeContext) -> int:
    weight = args.weight
    bias = args.bias
    drive = args.drive

    # If car-id is provided, try extracting specs from database or car_params
    if args.car_id:
        db = CarDatabase(ctx)
        car = db.get_car(args.car_id)
        if car:
            if "weight" in car and weight is None:
                weight = float(car["weight"])
            if "weight_distribution" in car and bias is None:
                bias = float(car["weight_distribution"])
            if "drivetrain" in car and (drive is None or drive == "RWD"):
                drive = str(car["drivetrain"])

    weight = weight or 1450.0
    bias = bias or 52.0
    drive = drive or "RWD"
    goal = args.goal or "road"

    solution = TuningMathSolver.calculate_chassis(
        weight_kg=weight,
        front_weight_bias=bias,
        drivetrain=drive,
        purpose=goal,
        aero_f=args.aero_f or 0.0,
        aero_r=args.aero_r or 0.0,
    )

    if getattr(args, "export_applied_setup", False):
        output = TuningMathSolver.export_applied_setup(solution)
    else:
        output = solution

    if args.json:
        print(json.dumps(output, indent=2, ensure_ascii=False))
    else:
        print("=" * 60)
        print(f"  FH6 Chassis Tuning Solution  ({goal.upper()} / {drive})")
        print("=" * 60)
        print(f"  Weight            : {weight} kg | Front Bias: {bias}%")
        print(
            f"  Anti-Roll Bars    : Front {solution['anti_roll_bars']['front']} | Rear {solution['anti_roll_bars']['rear']}"
        )
        print(
            f"  Springs (lbs/in)  : Front {solution['springs']['front_lbs_in']} | Rear {solution['springs']['rear_lbs_in']}"
        )
        print(
            f"  Springs (kgf/mm)  : Front {solution['springs']['front_kgf_mm']} | Rear {solution['springs']['rear_kgf_mm']}"
        )
        print(
            f"  Rebound Dampers   : Front {solution['dampers']['rebound_front']} | Rear {solution['dampers']['rebound_rear']}"
        )
        print(
            f"  Bump Dampers      : Front {solution['dampers']['bump_front']} | Rear {solution['dampers']['bump_rear']}"
        )
        print(
            f"  Camber (deg)      : Front {solution['alignment']['camber_front_deg']} | Rear {solution['alignment']['camber_rear_deg']}"
        )
        print(
            f"  Toe (deg)         : Front {solution['alignment']['toe_front_deg']} | Rear {solution['alignment']['toe_rear_deg']}"
        )
        print(f"  Caster (deg)      : {solution['alignment']['caster_deg']}")
        print(
            f"  Cold Tire PSI     : Front {solution['tires']['front_cold_psi']} | Rear {solution['tires']['rear_cold_psi']}"
        )
        print(f"  Differential      : {solution['differential']}")
        print("=" * 60)
    return 0


def handle_solve_gearing(args: argparse.Namespace) -> int:
    result = TuningMathSolver.calculate_gearing(
        max_rpm=args.max_rpm,
        peak_hp_rpm=args.peak_hp_rpm,
        top_speed_kmh=args.top_speed,
        gears_count=args.gears,
        tire_diameter_cm=args.tire_diameter or 65.0,
    )

    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        if "error" in result:
            print(f"Error: {result['error']}")
            return 1
        print("=" * 60)
        print("  FH6 AEGO Powerband Gearing Solution")
        print("=" * 60)
        print(f"  Final Drive       : {result['final_drive']}")
        print(f"  Retention Ratio   : {result['powerband_retention_ratio'] * 100:.1f}%")
        print(f"  Gear Count        : {result['gears_count']}")
        print("  ------------------------------------------------------------")
        print("  Gear  |  Ratio  |  Redline Speed  |  Upshift Drop RPM")
        print("  ------------------------------------------------------------")
        for g in result["gears"]:
            drop_str = (
                f"{int(g['upshift_drop_rpm'])} RPM" if g["upshift_drop_rpm"] else "---"
            )
            print(
                f"   {g['gear']}    |  {g['ratio']:5.2f}  |  {g['speed_at_redline_kmh']:6.1f} km/h  |  {drop_str}"
            )
        print("=" * 60)
    return 0


def handle_solve_full(
    args: argparse.Namespace, ctx: RuntimeContext, client: BackendClient
) -> int:
    weight = args.weight or 1400.0
    bias = args.bias or 52.0
    drive = args.drive or "RWD"
    goal = args.goal or "road"
    max_rpm = args.max_rpm or 8000.0
    peak_hp_rpm = args.peak_hp_rpm or 7200.0
    top_speed = args.top_speed or 300.0
    gears = args.gears or 6
    car_id = args.car_id or "custom"
    vehicle_class = args.vehicle_class or "S1"

    chassis = TuningMathSolver.calculate_chassis(
        weight_kg=weight,
        front_weight_bias=bias,
        drivetrain=drive,
        purpose=goal,
    )
    gearing = TuningMathSolver.calculate_gearing(
        max_rpm=max_rpm,
        peak_hp_rpm=peak_hp_rpm,
        top_speed_kmh=top_speed,
        gears_count=gears,
    )

    preset_data = TuningMathSolver.export_preset_format(
        car_id=car_id,
        vehicle_class=vehicle_class,
        chassis=chassis,
        gearing=gearing,
    )

    # If user wants to save directly to tunings directory or via API
    if args.save:
        save_name = args.save
        # 1. Try writing directly to local tunings directory
        tunings_dir = ctx.resolve_tunings_dir()
        filename = f"{car_id}-{save_name}.json"
        dest_file = os.path.join(tunings_dir, filename)
        try:
            with open(dest_file, "w", encoding="utf-8") as f:
                json.dump(preset_data, f, indent=4)
            saved_local = True
        except Exception as e:
            saved_local = False
            preset_data["save_error"] = str(e)

        # 2. Also attempt syncing to backend API if running
        api_ok, _ = client.post(f"api/tunings/{car_id}/{save_name}", preset_data)
        preset_data["saved_to_disk"] = saved_local
        preset_data["synced_to_backend"] = api_ok
        preset_data["saved_path"] = dest_file

    if getattr(args, "export_applied_setup", False):
        output = TuningMathSolver.export_applied_setup(chassis, gearing)
    else:
        output = preset_data

    if args.json:
        print(json.dumps(output, indent=2, ensure_ascii=False))
    else:
        print("=" * 60)
        print(f"  FH6 Full Vehicle Tuning Solution ({goal.upper()} / {vehicle_class})")
        print("=" * 60)
        print(
            f"  ARB (F/R)         : {chassis['anti_roll_bars']['front']} / {chassis['anti_roll_bars']['rear']}"
        )
        print(
            f"  Springs (F/R)     : {chassis['springs']['front_lbs_in']} / {chassis['springs']['rear_lbs_in']} lbs/in"
        )
        print(
            f"  Dampers Rebound   : {chassis['dampers']['rebound_front']} / {chassis['dampers']['rebound_rear']}"
        )
        print(
            f"  Dampers Bump      : {chassis['dampers']['bump_front']} / {chassis['dampers']['bump_rear']}"
        )
        print(
            f"  Alignment Camber  : Front {chassis['alignment']['camber_front_deg']}° | Rear {chassis['alignment']['camber_rear_deg']}°"
        )
        print(f"  Final Drive       : {gearing.get('final_drive')}")
        if args.save:
            print(f"  Preset Saved      : {dest_file}")
            print(
                f"  Backend Sync      : {'SUCCESS' if api_ok else 'OFFLINE (Saved locally)'}"
            )
        print("=" * 60)
    return 0


def handle_telemetry_snapshot(args: argparse.Namespace, client: BackendClient) -> int:
    category = getattr(args, "category", "all")
    tool_map = {
        "cockpit": "get_driver_cockpit_telemetry",
        "dynamics": "get_vehicle_dynamics_telemetry",
        "tires": "get_tires_status_telemetry",
        "suspension": "get_suspension_telemetry",
        "all": "get_live_telemetry_snapshot",
    }
    tool_name = tool_map.get(category, "get_live_telemetry_snapshot")
    success, data = client.call_mcp_tool(tool_name, {})

    if not success:
        err = {
            "error": "Failed to retrieve telemetry snapshot",
            "detail": data,
            "hint": "Ensure HorizonTuner is running with 'Enable MCP Server' and Forza Data Out is active.",
        }
        if args.json:
            print(json.dumps(err, indent=2))
        else:
            print(f"Error: {err['error']}\n{err['hint']}")
        return 1

    if args.json:
        print(json.dumps(data, indent=2, ensure_ascii=False))
    else:
        print(f"--- Live Telemetry Snapshot [{category.upper()}] ---")
        if isinstance(data, dict):
            for k, v in data.items():
                print(f"  {k:22}: {v}")
        else:
            print(data)
    return 0


def handle_telemetry_diagnose(args: argparse.Namespace, client: BackendClient) -> int:
    # 1. First attempt to fetch real tire temperatures from live telemetry
    tire_temps = [85.0, 85.0, 85.0, 85.0]
    tires_ok, tires_data = client.call_mcp_tool("get_tires_status_telemetry", {})
    if tires_ok and isinstance(tires_data, dict):
        raw_temps = tires_data.get("temperatures_c", {})
        if "FL" in raw_temps and "FR" in raw_temps:
            tire_temps = [
                float(raw_temps.get("FL", 85.0)),
                float(raw_temps.get("FR", 85.0)),
                float(raw_temps.get("RL", 85.0)),
                float(raw_temps.get("RR", 85.0)),
            ]

    # Override if manually supplied via CLI arguments
    if getattr(args, "tire_temps", None) and len(args.tire_temps) == 4:
        tire_temps = args.tire_temps

    diag_args = {
        "tire_temps": tire_temps,
        "symptom": args.symptom,
    }
    success, result = client.call_mcp_tool("diagnose_telemetry_handling", diag_args)

    if not success:
        # Fallback offline diagnosis
        f_avg = (tire_temps[0] + tire_temps[1]) / 2.0
        r_avg = (tire_temps[2] + tire_temps[3]) / 2.0
        delta_t = f_avg - r_avg
        actions = []
        if delta_t > 5.0:
            actions.append("Front axle overheat: Soften Front ARB (-2.0)")
        elif delta_t < -5.0:
            actions.append("Rear axle overheat: Soften Rear ARB (-2.0)")
        if args.symptom == "understeer_entry":
            actions.append("Entry Understeer: Increase front negative camber (-0.2°)")
        elif args.symptom == "oversteer_exit":
            actions.append(
                "Exit Oversteer: Soften rear spring or reduce rear accel diff lock"
            )

        result = {
            "front_avg_temp_c": round(f_avg, 1),
            "rear_avg_temp_c": round(r_avg, 1),
            "axle_delta_t_c": round(delta_t, 1),
            "convergence_status": "converged"
            if abs(delta_t) <= 3.0
            else "adjustment_required",
            "actionable_directives": actions
            if actions
            else ["Tire thermal balance is nominal. No adjustments required."],
            "source": "offline_fallback",
        }

    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        print("=" * 60)
        print("  FH6 Closed-Loop Telemetry & Handling Diagnosis")
        print("=" * 60)
        print(
            f"  Tire Temps (°C)   : FL={tire_temps[0]:.1f}, FR={tire_temps[1]:.1f}, RL={tire_temps[2]:.1f}, RR={tire_temps[3]:.1f}"
        )
        print(f"  Front Axle Avg    : {result.get('front_avg_temp_c')} °C")
        print(f"  Rear Axle Avg     : {result.get('rear_avg_temp_c')} °C")
        print(f"  Axle Delta (F-R)  : {result.get('axle_delta_t_c')} °C")
        print(f"  Thermal Balance   : {result.get('convergence_status')}")
        print("  ------------------------------------------------------------")
        print("  Recommended Tuning Directives:")
        for act in result.get("actionable_directives", []):
            print(f"    * {act}")
        print("=" * 60)
    return 0


def handle_preset_list(args: argparse.Namespace, ctx: RuntimeContext) -> int:
    tunings_dir = ctx.resolve_tunings_dir()
    presets = []
    if os.path.isdir(tunings_dir):
        for f in os.listdir(tunings_dir):
            if f.endswith(".json"):
                presets.append(f[:-5])

    if args.json:
        print(
            json.dumps(
                {
                    "count": len(presets),
                    "directory": tunings_dir,
                    "presets": presets,
                },
                indent=2,
            )
        )
    else:
        print(f"Presets in {tunings_dir} ({len(presets)} found):")
        for p in sorted(presets):
            print(f"  - {p}")
    return 0


def handle_preset_get(args: argparse.Namespace, ctx: RuntimeContext) -> int:
    tunings_dir = ctx.resolve_tunings_dir()
    filename = f"{args.car_id}-{args.save_name}.json"
    file_path = os.path.join(tunings_dir, filename)

    if not os.path.isfile(file_path):
        err = {"error": f"Preset '{filename}' not found in {tunings_dir}."}
        if args.json:
            print(json.dumps(err, indent=2))
        else:
            print(err["error"])
        return 1

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        err = {"error": f"Failed to read preset: {e}"}
        if args.json:
            print(json.dumps(err, indent=2))
        else:
            print(err["error"])
        return 1

    if args.json:
        print(json.dumps(data, indent=2, ensure_ascii=False))
    else:
        print(f"--- Preset: {args.car_id}-{args.save_name} ---")
        print(json.dumps(data, indent=2, ensure_ascii=False))
    return 0


def handle_mcp_call(args: argparse.Namespace, client: BackendClient) -> int:
    raw_args = {}
    if args.args:
        try:
            raw_args = json.loads(args.args)
        except Exception as e:
            err = {"error": f"Invalid JSON in --args: {e}"}
            if args.json:
                print(json.dumps(err, indent=2))
            else:
                print(err["error"])
            return 2

    success, result = client.call_mcp_tool(args.tool, raw_args)
    if args.json:
        if success:
            print(
                json.dumps(
                    {"status": "ok", "result": result},
                    indent=2,
                    ensure_ascii=False,
                )
            )
        else:
            print(
                json.dumps(
                    {"status": "error", "error": result},
                    indent=2,
                    ensure_ascii=False,
                )
            )
    else:
        if success:
            print(json.dumps(result, indent=2, ensure_ascii=False))
        else:
            print(f"MCP Call Failed: {result}")
    return 0 if success else 1


# =============================================================================
# 6. Main CLI Argument Parser
# =============================================================================


def build_parser() -> argparse.ArgumentParser:
    common_parent = argparse.ArgumentParser(add_help=False)
    common_parent.add_argument(
        "--json",
        action="store_true",
        help="Format output as machine-readable JSON for AI Agents.",
    )
    common_parent.add_argument(
        "--backend-url",
        type=str,
        default=None,
        help="Override backend HTTP URL (default: auto-detected or 127.0.0.1:8001).",
    )
    common_parent.add_argument(
        "--data-dir",
        type=str,
        default=None,
        help="User data directory (compatible with Tauri sidecar arguments).",
    )

    parser = argparse.ArgumentParser(
        prog="fh6-agent",
        description="FH6-HorizonTuner CLI for AI Agents, Telemetry & Tuning Automation.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        parents=[common_parent],
    )

    parser.add_argument(
        "--version",
        action="version",
        version=f"%(prog)s {CLI_VERSION} (Core: {APP_VERSION})",
    )

    subparsers = parser.add_subparsers(dest="subcommand", help="Available commands")

    # 1. status / doctor
    status_p = subparsers.add_parser(
        "status",
        aliases=["doctor"],
        help="Inspect HorizonTuner backend, dynamic port, and UDP telemetry state.",
        parents=[common_parent],
    )
    status_p.set_defaults(func="status")

    # 2. mcp-config
    mcp_p = subparsers.add_parser(
        "mcp-config",
        help="Generate client configuration snippet for Codex, Claude Desktop, or Cursor.",
        parents=[common_parent],
    )
    mcp_p.add_argument(
        "--client",
        choices=["all", "codex", "claude", "cursor"],
        default="all",
        help="Target client environment.",
    )
    mcp_p.set_defaults(func="mcp-config")

    # 3. cars (search / get)
    cars_p = subparsers.add_parser(
        "cars",
        help="Search and query vehicle database.",
        parents=[common_parent],
    )
    cars_sub = cars_p.add_subparsers(dest="cars_action")

    cars_search_p = cars_sub.add_parser(
        "search",
        help="Search vehicles by name or brand.",
        parents=[common_parent],
    )
    cars_search_p.add_argument("query", type=str, help="Search query string.")
    cars_search_p.add_argument(
        "--drive", choices=["AWD", "RWD", "FWD"], help="Filter by drivetrain."
    )
    cars_search_p.add_argument(
        "--limit", type=int, default=10, help="Maximum number of results."
    )
    cars_search_p.set_defaults(func="cars_search")

    cars_get_p = cars_sub.add_parser(
        "get",
        help="Get car specs by ordinal ID.",
        parents=[common_parent],
    )
    cars_get_p.add_argument("car_id", type=str, help="Car ordinal ID (e.g. 247, 3847).")
    cars_get_p.set_defaults(func="cars_get")

    # 4. solve (chassis / gearing / full)
    solve_p = subparsers.add_parser(
        "solve",
        help="Execute deterministic physics and gearing calculations.",
        parents=[common_parent],
    )
    solve_sub = solve_p.add_subparsers(dest="solve_action")

    # solve chassis
    sc_p = solve_sub.add_parser(
        "chassis",
        help="Calculate ARB, springs, dampers, and differential.",
        parents=[common_parent],
    )
    sc_p.add_argument(
        "--car-id",
        type=str,
        default=None,
        help="Car ID to automatically pull weight/bias/drivetrain.",
    )
    sc_p.add_argument(
        "--weight", type=float, default=None, help="Vehicle weight in kilograms (kg)."
    )
    sc_p.add_argument(
        "--bias",
        type=float,
        default=None,
        help="Front weight bias percentage (e.g. 52.0).",
    )
    sc_p.add_argument(
        "--drive",
        choices=["AWD", "RWD", "FWD"],
        default="RWD",
        help="Drivetrain type.",
    )
    sc_p.add_argument(
        "--goal",
        choices=["road", "drift", "rally", "drag"],
        default="road",
        help="Tuning race goal.",
    )
    sc_p.add_argument(
        "--aero-f", type=float, default=0.0, help="Front downforce (lbs)."
    )
    sc_p.add_argument("--aero-r", type=float, default=0.0, help="Rear downforce (lbs).")
    sc_p.add_argument(
        "--export-applied-setup",
        action="store_true",
        help="Output in AppliedTuningSetup format for UI Step 5.",
    )
    sc_p.set_defaults(func="solve_chassis")

    # solve gearing
    sg_p = solve_sub.add_parser(
        "gearing",
        help="Calculate AEGO powerband gearing ratios.",
        parents=[common_parent],
    )
    sg_p.add_argument(
        "--max-rpm", type=float, required=True, help="Engine redline RPM."
    )
    sg_p.add_argument(
        "--peak-hp-rpm", type=float, required=True, help="Peak horsepower RPM."
    )
    sg_p.add_argument(
        "--top-speed", type=float, required=True, help="Target top speed in km/h."
    )
    sg_p.add_argument("--gears", type=int, default=6, help="Number of forward gears.")
    sg_p.add_argument(
        "--tire-diameter",
        type=float,
        default=65.0,
        help="Tire outer diameter in cm.",
    )
    sg_p.set_defaults(func="solve_gearing")

    # solve full
    sf_p = solve_sub.add_parser(
        "full",
        help="Calculate complete vehicle tune (chassis + gearing).",
        parents=[common_parent],
    )
    sf_p.add_argument("--car-id", type=str, default="custom", help="Car ID.")
    sf_p.add_argument(
        "--vehicle-class", type=str, default="S1", help="Vehicle Class (e.g. S1, A)."
    )
    sf_p.add_argument("--weight", type=float, default=1400.0, help="Weight in kg.")
    sf_p.add_argument(
        "--bias", type=float, default=52.0, help="Front weight bias percentage."
    )
    sf_p.add_argument(
        "--drive", choices=["AWD", "RWD", "FWD"], default="RWD", help="Drivetrain."
    )
    sf_p.add_argument(
        "--goal",
        choices=["road", "drift", "rally", "drag"],
        default="road",
        help="Goal.",
    )
    sf_p.add_argument(
        "--max-rpm", type=float, default=8000.0, help="Engine redline RPM."
    )
    sf_p.add_argument(
        "--peak-hp-rpm", type=float, default=7200.0, help="Peak horsepower RPM."
    )
    sf_p.add_argument("--top-speed", type=float, default=300.0, help="Top speed km/h.")
    sf_p.add_argument("--gears", type=int, default=6, help="Gear count.")
    sf_p.add_argument(
        "--save",
        type=str,
        default=None,
        metavar="PRESET_NAME",
        help="Save directly as preset (e.g. 'base_road').",
    )
    sf_p.add_argument(
        "--export-applied-setup",
        action="store_true",
        help="Output in AppliedTuningSetup format for UI Step 5.",
    )
    sf_p.set_defaults(func="solve_full")

    # 5. telemetry (snapshot / diagnose)
    tele_p = subparsers.add_parser(
        "telemetry",
        help="Live telemetry inspection and closed-loop diagnosis.",
        parents=[common_parent],
    )
    tele_sub = tele_p.add_subparsers(dest="telemetry_action")

    tele_snap_p = tele_sub.add_parser(
        "snapshot",
        help="Capture current live telemetry.",
        parents=[common_parent],
    )
    tele_snap_p.add_argument(
        "--category",
        choices=["all", "cockpit", "dynamics", "tires", "suspension"],
        default="all",
        help="Telemetry channel category.",
    )
    tele_snap_p.set_defaults(func="telemetry_snapshot")

    tele_diag_p = tele_sub.add_parser(
        "diagnose",
        help="Closed-loop handling diagnosis based on tire telemetry.",
        parents=[common_parent],
    )
    tele_diag_p.add_argument(
        "--symptom",
        choices=["understeer_entry", "oversteer_exit", "none"],
        default=None,
        help="Driver handling symptom feedback.",
    )
    tele_diag_p.add_argument(
        "--tire-temps",
        type=float,
        nargs=4,
        metavar=("FL", "FR", "RL", "RR"),
        help="Override 4 tire temps in °C.",
    )
    tele_diag_p.set_defaults(func="telemetry_diagnose")

    # 6. preset (list / get)
    preset_p = subparsers.add_parser(
        "preset",
        help="Manage saved tuning presets.",
        parents=[common_parent],
    )
    preset_sub = preset_p.add_subparsers(dest="preset_action")

    preset_list_p = preset_sub.add_parser(
        "list",
        help="List all saved presets.",
        parents=[common_parent],
    )
    preset_list_p.set_defaults(func="preset_list")

    preset_get_p = preset_sub.add_parser(
        "get",
        help="Read a specific preset.",
        parents=[common_parent],
    )
    preset_get_p.add_argument("car_id", type=str, help="Car ordinal ID.")
    preset_get_p.add_argument("save_name", type=str, help="Preset save name.")
    preset_get_p.set_defaults(func="preset_get")

    # 7. mcp-call
    call_p = subparsers.add_parser(
        "mcp-call",
        help="Directly invoke any MCP tool via Streamable HTTP.",
        parents=[common_parent],
    )
    call_p.add_argument(
        "tool", type=str, help="Name of the MCP tool (e.g. get_system_settings)."
    )
    call_p.add_argument(
        "--args",
        type=str,
        default="{}",
        help="JSON string of tool arguments.",
    )
    call_p.set_defaults(func="mcp_call")

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if not hasattr(args, "func") or not args.func:
        parser.print_help()
        return 0

    ctx = RuntimeContext(data_dir=args.data_dir, backend_url=args.backend_url)
    backend_url = ctx.resolve_backend_url()
    client = BackendClient(backend_url)

    func_map = {
        "status": lambda: handle_status(args, ctx, client),
        "mcp-config": lambda: handle_mcp_config(args, ctx),
        "cars_search": lambda: handle_cars_search(args, ctx),
        "cars_get": lambda: handle_cars_get(args, ctx),
        "solve_chassis": lambda: handle_solve_chassis(args, ctx),
        "solve_gearing": lambda: handle_solve_gearing(args),
        "solve_full": lambda: handle_solve_full(args, ctx, client),
        "telemetry_snapshot": lambda: handle_telemetry_snapshot(args, client),
        "telemetry_diagnose": lambda: handle_telemetry_diagnose(args, client),
        "preset_list": lambda: handle_preset_list(args, ctx),
        "preset_get": lambda: handle_preset_get(args, ctx),
        "mcp_call": lambda: handle_mcp_call(args, client),
    }

    handler = func_map.get(args.func)
    if handler:
        try:
            return handler()
        except Exception as e:
            if args.json:
                print(json.dumps({"status": "error", "error": str(e)}, indent=2))
            else:
                sys.stderr.write(f"Error: {e}\n")
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
