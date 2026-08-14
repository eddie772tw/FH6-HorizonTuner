"""Business logic and read-only data service for FH6-HorizonTuner MCP Server."""

from __future__ import annotations

import glob
import json
import logging
import math
import os
import sys
from typing import Any

from telemetry_sqlite import TelemetrySQLite

logger = logging.getLogger(__name__)


def find_project_root() -> str:
    """Resolve project root directory."""
    current = os.path.dirname(os.path.abspath(__file__))
    # backend/mcp -> backend -> root
    root = os.path.abspath(os.path.join(current, "..", ".."))
    if os.path.exists(os.path.join(root, "backend")):
        return root
    return os.path.abspath(os.path.join(current, ".."))


class HorizonTunerMcpService:
    """Encapsulates all read-only access to telemetry, databases, captures, and solvers."""

    def __init__(
        self,
        data_root: str | None = None,
        resource_root: str | None = None,
        telemetry_state_provider: Any = None,
    ):
        self.project_root = find_project_root()
        self.resource_root = (
            resource_root
            if resource_root
            else os.path.join(self.project_root, "backend")
            if os.path.exists(os.path.join(self.project_root, "backend"))
            else self.project_root
        )
        self.data_root = (
            data_root
            if data_root
            else os.path.join(self.project_root, "backend")
            if os.path.exists(os.path.join(self.project_root, "backend"))
            else self.project_root
        )
        self.telemetry_state_provider = telemetry_state_provider

        # File paths
        self.car_db_path = os.path.join(self.resource_root, "car_database.json")
        self.sessions_db_path = os.path.join(self.data_root, "telemetry_sessions.db")
        self.calibration_dir = os.path.join(self.project_root, "docs", "calibration")
        self.captures_dir = self.calibration_dir
        self.drag_sessions_dir = os.path.join(self.data_root, "drag_sessions")
        self.tunings_dir = os.path.join(self.data_root, "tunings")
        self.settings_file = os.path.join(self.data_root, "settings.json")
        self.hud_config_file = os.path.join(self.data_root, "hud_config.json")
        self.logs_file = os.path.join(self.data_root, "logs", "backend.log")
        self.backend_log_path = self.logs_file

        # Helpers
        self._db: TelemetrySQLite | None = None

        # Cached car database
        self._car_database: dict[str, Any] | None = None

    @property
    def telemetry_db(self) -> TelemetrySQLite:
        if self._db is None:
            self._db = TelemetrySQLite(self.sessions_db_path)
        return self._db

    def _get_car_database(self) -> dict[str, Any]:
        if self._car_database is None:
            if os.path.exists(self.car_db_path):
                try:
                    with open(self.car_db_path, "r", encoding="utf-8") as f:
                        self._car_database = json.load(f)
                except Exception as exc:
                    logger.error(
                        "Failed to load car database from %s: %s", self.car_db_path, exc
                    )
                    self._car_database = {}
            else:
                self._car_database = {}
        return self._car_database or {}

    # =========================================================================
    # 1. Telemetry Data Readers (Aligned with TelemetryView)
    # =========================================================================

    def get_live_telemetry_snapshot(self) -> dict[str, Any]:
        """Return the latest live telemetry frame and ingestion status."""
        if self.telemetry_state_provider is not None:
            live_frame = self.telemetry_state_provider()
            if live_frame:
                return {
                    "status": "live",
                    "source": "udp_memory_stream",
                    "latest_sample": live_frame,
                }

        # Query latest point from SQLite if available or report offline status
        sessions = self.telemetry_db.list_all_sessions()
        latest_session_id = sessions[0]["session_id"] if sessions else None
        latest_point = None
        if latest_session_id:
            points = self.telemetry_db.get_telemetry_points(
                latest_session_id, downsample=1
            )
            if points:
                latest_point = points[-1]

        return {
            "status": "ready" if latest_point else "idle",
            "active_session_id": latest_session_id,
            "total_recorded_sessions": len(sessions),
            "latest_sample": latest_point,
        }

    def get_driver_cockpit_telemetry(
        self, sample_data: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        """Format driver inputs and engine instrument data matching EngineRpmDisplay and VerticalInputBar."""
        p = sample_data or {}
        if not p:
            live = self.get_live_telemetry_snapshot()
            p = live.get("latest_sample") or {}

        rpm = float(p.get("CurrentEngineRpm") or p.get("rpm") or 0.0)
        max_rpm = float(p.get("EngineMaxRpm") or 8000.0)
        idle_rpm = float(p.get("EngineIdleRpm") or 800.0)
        speed_ms = float(p.get("SpeedMetersPerSecond") or p.get("speed") or 0.0)
        gear_raw = int(p.get("Gear") or p.get("gear") or 0)

        # Format gear display string (aligned with formatTelemetryGear)
        if gear_raw == 0:
            gear_str = "R"
        elif gear_raw == 11:
            gear_str = "N"
        else:
            gear_str = str(gear_raw)

        # Inputs normalized (0.0 to 100.0% and 0..255 byte)
        clutch = float(p.get("clutch_pct") or 0.0)
        accel = float(
            p.get("accel_pct") or (float(p.get("AccelInput") or 0) / 255.0 * 100.0)
        )
        brake = float(
            p.get("brake_pct") or (float(p.get("BrakeInput") or 0) / 255.0 * 100.0)
        )
        handbrake = float(p.get("handbrake_pct") or 0.0)
        steer_pct = float(
            p.get("steer_pct") or (float(p.get("SteerInput") or 0) / 127.0 * 100.0)
        )

        shift_alert = rpm >= (max_rpm * 0.95) and max_rpm > 1000

        return {
            "engine": {
                "rpm": round(rpm, 1),
                "idle_rpm": round(idle_rpm, 1),
                "max_rpm": round(max_rpm, 1),
                "rpm_ratio": round(min(1.0, max(0.0, rpm / max_rpm)), 3)
                if max_rpm > 0
                else 0.0,
                "is_shift_alert": shift_alert,
                "is_ev": idle_rpm == 0.0,
            },
            "transmission": {
                "gear_raw": gear_raw,
                "gear_display": gear_str,
            },
            "speed": {
                "meters_per_second": round(speed_ms, 2),
                "kmh": round(speed_ms * 3.6, 1),
                "mph": round(speed_ms * 2.23694, 1),
            },
            "driver_inputs": {
                "throttle_pct": round(accel, 1),
                "brake_pct": round(brake, 1),
                "clutch_pct": round(clutch, 1),
                "handbrake_pct": round(handbrake, 1),
                "steer_pct": round(steer_pct, 1),
                "steer_angle_deg": round(steer_pct * 0.45, 1),  # +-45 deg scale
            },
        }

    def get_vehicle_dynamics_telemetry(
        self, sample_data: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        """Format vehicle dynamics, G-force, and power stats matching VehicleDynamicsDisplay & GForceRadar."""
        p = sample_data or {}
        if not p:
            live = self.get_live_telemetry_snapshot()
            p = live.get("latest_sample") or {}

        # Acceleration / G-Force
        accel_x = float(p.get("AccelerationX") or p.get("accel_x") or 0.0)
        accel_y = float(p.get("AccelerationY") or p.get("accel_y") or 0.0)
        accel_z = float(p.get("AccelerationZ") or p.get("accel_z") or 0.0)

        # Power and Torque
        power_w = float(p.get("PowerWatts") or p.get("power_watts") or 0.0)
        torque_nm = float(p.get("TorqueNewtons") or p.get("torque_nm") or 0.0)
        boost_pa = float(p.get("Boost") or p.get("boost") or 0.0)

        # Orientation
        yaw = float(p.get("Yaw") or p.get("yaw") or 0.0)
        pitch = float(p.get("Pitch") or p.get("pitch") or 0.0)
        roll = float(p.get("Roll") or p.get("roll") or 0.0)

        # EV status
        idle_rpm = float(p.get("EngineIdleRpm") or 800.0)
        is_ev = idle_rpm == 0.0
        is_regen = is_ev and (power_w < 0.0 or torque_nm < 0.0)

        return {
            "g_forces": {
                "lateral_g": round(accel_x / 9.81 if abs(accel_x) > 5 else accel_x, 3),
                "longitudinal_g": round(
                    accel_z / 9.81 if abs(accel_z) > 5 else accel_z, 3
                ),
                "vertical_g": round(accel_y / 9.81 if abs(accel_y) > 5 else accel_y, 3),
            },
            "orientation": {
                "yaw_rad": round(yaw, 4),
                "yaw_deg": round(math.degrees(yaw), 2),
                "pitch_rad": round(pitch, 4),
                "pitch_deg": round(math.degrees(pitch), 2),
                "roll_rad": round(roll, 4),
                "roll_deg": round(math.degrees(roll), 2),
            },
            "power_train": {
                "power_kw": round(power_w / 1000.0, 1),
                "power_hp": round(power_w / 745.699872, 1),
                "torque_nm": round(torque_nm, 1),
                "torque_ftlb": round(torque_nm * 0.737562, 1),
                "boost_psi": round(boost_pa * 0.000145038, 2)
                if boost_pa > 1000
                else round(boost_pa, 2),
                "boost_bar": round(boost_pa / 100000.0, 3)
                if boost_pa > 1000
                else round(boost_pa / 14.5038, 3),
                "is_ev": is_ev,
                "is_regen_active": is_regen,
            },
            "position": {
                "x": round(float(p.get("PositionX") or p.get("pos_x") or 0.0), 2),
                "y": round(float(p.get("PositionY") or p.get("pos_y") or 0.0), 2),
                "z": round(float(p.get("PositionZ") or p.get("pos_z") or 0.0), 2),
            },
        }

    def get_tires_status_telemetry(
        self, sample_data: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        """Format 4-corner tire temperatures, slip angles, slip ratios matching TireRadar."""
        p = sample_data or {}
        if not p:
            live = self.get_live_telemetry_snapshot()
            p = live.get("latest_sample") or {}

        def get_corner_array(key: str, default: tuple[float, ...]) -> list[float]:
            val = p.get(key)
            if isinstance(val, (list, tuple)) and len(val) >= 4:
                return [float(x) for x in val[:4]]
            return list(default)

        # Temps (Forza native is Fahrenheit)
        raw_temps = get_corner_array(
            "TireTemp",
            (
                p.get("temp_fl", 180.0),
                p.get("temp_fr", 180.0),
                p.get("temp_rl", 180.0),
                p.get("temp_rr", 180.0),
            ),
        )
        temps_f = [round(t, 1) for t in raw_temps]
        temps_c = [round((t - 32.0) * 5.0 / 9.0, 1) for t in raw_temps]

        # Slip angles
        raw_slip_angles = get_corner_array(
            "TireSlipAngle",
            (
                p.get("slip_angle_fl", 0.0),
                p.get("slip_angle_fr", 0.0),
                p.get("slip_angle_rl", 0.0),
                p.get("slip_angle_rr", 0.0),
            ),
        )
        slip_angles_deg = [
            round(math.degrees(a) if abs(a) < 10 else a, 2) for a in raw_slip_angles
        ]

        # Slip ratios
        raw_slip_ratios = get_corner_array(
            "TireSlipRatio",
            (
                p.get("slip_ratio_fl", 0.0),
                p.get("slip_ratio_fr", 0.0),
                p.get("slip_ratio_rl", 0.0),
                p.get("slip_ratio_rr", 0.0),
            ),
        )
        slip_ratios_pct = [
            round(r * 100.0 if abs(r) <= 5.0 else r, 1) for r in raw_slip_ratios
        ]

        corners = ["front_left", "front_right", "rear_left", "rear_right"]
        corner_data = {}
        for i, name in enumerate(corners):
            combined_slip = math.sqrt(slip_ratios_pct[i] ** 2 + slip_angles_deg[i] ** 2)
            corner_data[name] = {
                "temp_c": temps_c[i],
                "temp_f": temps_f[i],
                "slip_angle_deg": slip_angles_deg[i],
                "slip_ratio_pct": slip_ratios_pct[i],
                "combined_slip": round(combined_slip, 2),
                "is_slipping": combined_slip > 15.0,
                "is_overheating": temps_c[i] > 110.0,
            }

        return {
            "summary": {
                "front_avg_temp_c": round((temps_c[0] + temps_c[1]) / 2.0, 1),
                "rear_avg_temp_c": round((temps_c[2] + temps_c[3]) / 2.0, 1),
                "axle_temp_delta_c": round(
                    ((temps_c[0] + temps_c[1]) / 2.0)
                    - ((temps_c[2] + temps_c[3]) / 2.0),
                    1,
                ),
            },
            "corners": corner_data,
        }

    def get_suspension_telemetry(
        self, sample_data: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        """Format 4-corner suspension travels and bottoming alerts matching SuspensionBar."""
        p = sample_data or {}
        if not p:
            live = self.get_live_telemetry_snapshot()
            p = live.get("latest_sample") or {}

        val = p.get("SuspTravel")
        if isinstance(val, (list, tuple)) and len(val) >= 4:
            travels = [float(x) for x in val[:4]]
        else:
            travels = [
                float(p.get("susp_fl", 0.0)),
                float(p.get("susp_fr", 0.0)),
                float(p.get("susp_rl", 0.0)),
                float(p.get("susp_rr", 0.0)),
            ]

        corners = ["front_left", "front_right", "rear_left", "rear_right"]
        corner_data = {}
        for i, name in enumerate(corners):
            t = max(0.0, min(1.0, travels[i]))
            corner_data[name] = {
                "travel_ratio": round(t, 3),
                "travel_pct": round(t * 100.0, 1),
                "is_bottoming": t >= 0.95,
            }

        roll_deflection = (travels[0] - travels[1]) + (travels[2] - travels[3])
        pitch_dive = (travels[0] + travels[1]) - (travels[2] + travels[3])

        return {
            "corners": corner_data,
            "dynamics": {
                "roll_deflection": round(roll_deflection, 3),
                "pitch_dive": round(pitch_dive, 3),
            },
        }

    # =========================================================================
    # 2. Race Sessions from SQLite (AnalysisView)
    # =========================================================================

    def list_race_sessions(
        self, limit: int = 20, offset: int = 0
    ) -> list[dict[str, Any]]:
        """List recorded race sessions with summary stats."""
        sessions = self.telemetry_db.list_all_sessions()
        return sessions[offset : offset + limit]

    def get_session_summary(self, session_id: str) -> dict[str, Any] | None:
        """Get detailed lap summary and speed benchmarks for a session."""
        sessions = self.telemetry_db.list_all_sessions()
        session_meta = next(
            (s for s in sessions if s["session_id"] == session_id), None
        )
        if not session_meta:
            return None

        laps = self.telemetry_db.get_session_laps(session_id)
        return {
            "session": session_meta,
            "laps": laps,
            "total_laps_count": len(laps),
        }

    def query_session_telemetry(
        self,
        session_id: str,
        lap_number: int | None = None,
        downsample: int = 1,
        channels: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        """Query downsampled points for a specific session/lap."""
        points = self.telemetry_db.get_telemetry_points(
            session_id, lap_number=lap_number, downsample=max(1, downsample)
        )
        if not channels:
            return points

        channel_set = set(channels)
        return [{k: v for k, v in pt.items() if k in channel_set} for pt in points]

    # =========================================================================
    # 3. Tuning Captures & Calibration (TuningTelemetryCaptureView)
    # =========================================================================

    def list_tuning_captures(
        self,
        surface: str | None = None,
        purpose: str | None = None,
        confidence: str | None = None,
    ) -> list[dict[str, Any]]:
        """List captured tuning-capture/v1 files in docs/calibration/ and captures/."""
        results = []
        search_paths = [
            os.path.join(self.calibration_dir, "**", "*.json"),
            os.path.join(self.data_root, "captures", "*.json"),
        ]
        for pattern in search_paths:
            for filepath in glob.glob(pattern, recursive=True):
                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    if (
                        isinstance(data, dict)
                        and data.get("schemaVersion") == "tuning-capture/v1"
                    ):
                        meta = data.get("metadata", {})
                        if surface and meta.get("surface") != surface:
                            continue
                        if purpose and meta.get("purpose") != purpose:
                            continue
                        if confidence and data.get("confidence") != confidence:
                            continue

                        results.append(
                            {
                                "capture_id": data.get(
                                    "captureId", os.path.basename(filepath)
                                ),
                                "file_path": filepath,
                                "created_at": data.get("createdAt"),
                                "metadata": meta,
                                "samples_count": len(data.get("samples", [])),
                                "confidence": data.get("confidence", "unverified"),
                            }
                        )
                except Exception:
                    pass
        return results

    def get_capture_summary(self, capture_id_or_path: str) -> dict[str, Any] | None:
        """Load tuning capture and report metadata, summary statistics and data hygiene."""
        target_file = None
        if os.path.exists(capture_id_or_path):
            target_file = capture_id_or_path
        else:
            # Search by capture ID
            captures = self.list_tuning_captures()
            for c in captures:
                if (
                    c["capture_id"] == capture_id_or_path
                    or os.path.basename(c["file_path"]) == capture_id_or_path
                ):
                    target_file = c["file_path"]
                    break

        if not target_file or not os.path.exists(target_file):
            return None

        with open(target_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        samples = data.get("samples", [])
        meta = data.get("metadata", {})

        # Integrity checks
        timestamps = [s.get("timestampMs", 0) for s in samples]
        is_monotonic = (
            all(timestamps[i] <= timestamps[i + 1] for i in range(len(timestamps) - 1))
            if len(timestamps) > 1
            else True
        )

        speeds = [s.get("speedKmh", 0.0) for s in samples]
        max_speed = max(speeds) if speeds else 0.0
        avg_speed = sum(speeds) / len(speeds) if speeds else 0.0

        return {
            "capture_id": data.get("captureId"),
            "file_path": target_file,
            "metadata": meta,
            "summary": {
                "sample_count": len(samples),
                "duration_sec": round((timestamps[-1] - timestamps[0]) / 1000.0, 2)
                if len(timestamps) > 1
                else 0.0,
                "max_speed_kmh": round(max_speed, 1),
                "avg_speed_kmh": round(avg_speed, 1),
            },
            "hygiene": {
                "is_monotonic_timestamps": is_monotonic,
                "has_complete_metadata": all(
                    meta.get(k) not in (None, "unknown", "")
                    for k in ("carOrdinal", "installedParts", "surface")
                ),
            },
            "confidence": data.get("confidence", "unverified"),
        }

    def query_capture_window(
        self,
        capture_id: str,
        start_ms: int = 0,
        end_ms: int | None = None,
        channels: list[str] | None = None,
        max_samples: int = 500,
    ) -> list[dict[str, Any]]:
        """Query sliced, downsampled frames from a tuning-capture/v1 file."""
        captures = self.list_tuning_captures()
        target_file = next(
            (
                c["file_path"]
                for c in captures
                if c["capture_id"] == capture_id
                or os.path.basename(c["file_path"]) == capture_id
            ),
            None,
        )
        if not target_file or not os.path.exists(target_file):
            return []

        with open(target_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        samples = data.get("samples", [])
        # Filter window
        filtered = [
            s
            for s in samples
            if s.get("timestampMs", 0) >= start_ms
            and (end_ms is None or s.get("timestampMs", 0) <= end_ms)
        ]

        if not filtered:
            return []

        step = max(1, len(filtered) // max_samples)
        downsampled = filtered[::step]

        if not channels:
            return downsampled

        ch_set = set(channels)
        return [{k: v for k, v in s.items() if k in ch_set} for s in downsampled]

    def compare_captures(
        self, baseline_id: str, candidate_id: str
    ) -> dict[str, Any] | None:
        """Compute A/B comparison delta statistics between baseline and candidate captures."""
        base = self.get_capture_summary(baseline_id)
        cand = self.get_capture_summary(candidate_id)
        if not base or not cand:
            return None

        # Return comparison summary
        return {
            "baseline": {
                "id": base["capture_id"],
                "meta": base["metadata"],
                "summary": base["summary"],
            },
            "candidate": {
                "id": cand["capture_id"],
                "meta": cand["metadata"],
                "summary": cand["summary"],
            },
            "delta": {
                "max_speed_diff_kmh": round(
                    cand["summary"]["max_speed_kmh"] - base["summary"]["max_speed_kmh"],
                    2,
                ),
                "avg_speed_diff_kmh": round(
                    cand["summary"]["avg_speed_kmh"] - base["summary"]["avg_speed_kmh"],
                    2,
                ),
                "duration_diff_sec": round(
                    cand["summary"]["duration_sec"] - base["summary"]["duration_sec"], 2
                ),
            },
        }

    # =========================================================================
    # 4. Drag Sessions (DragTestView)
    # =========================================================================

    def list_drag_sessions(self) -> list[dict[str, Any]]:
        """List recorded drag acceleration sessions."""
        results = []
        pattern = os.path.join(self.drag_sessions_dir, "*.json")
        for filepath in glob.glob(pattern):
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                results.append(
                    {
                        "filename": os.path.basename(filepath),
                        "car_name": data.get("car_name", "Unknown Car"),
                        "timestamp": data.get("timestamp"),
                        "times": data.get("times", {}),
                    }
                )
            except Exception:
                pass
        return sorted(results, key=lambda x: str(x.get("timestamp", "")), reverse=True)

    def get_drag_analysis(self, filename: str) -> dict[str, Any] | None:
        """Get full drag run time splits and acceleration analysis."""
        filepath = os.path.join(self.drag_sessions_dir, filename)
        if not os.path.exists(filepath):
            return None
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)

    # =========================================================================
    # 5. Car Database & Capabilities
    # =========================================================================

    def search_cars(
        self,
        query: str | None = None,
        drivetrain: str | None = None,
        car_class: str | None = None,
    ) -> list[dict[str, Any]]:
        """Search cars in the native Forza car database."""
        db = self._get_car_database()
        results = []
        for key, car in db.items():
            name = str(car.get("name") or car.get("car_name") or "")
            dt = str(car.get("drivetrain") or "")
            cls = str(car.get("car_class") or car.get("class") or "")

            if query and query.lower() not in name.lower() and query not in str(key):
                continue
            if drivetrain and drivetrain.upper() != dt.upper():
                continue
            if car_class and car_class.upper() != cls.upper():
                continue

            results.append(
                {
                    "ordinal": int(
                        car.get("ordinal", key) if str(key).isdigit() else 0
                    ),
                    "car_id": key,
                    "name": name,
                    "year": car.get("year"),
                    "drivetrain": dt,
                    "class": cls,
                    "pi": car.get("pi"),
                    "weight_kg": car.get("weight_kg") or car.get("weight"),
                    "front_weight_bias": car.get("front_weight_bias")
                    or car.get("weight_distribution"),
                    "max_rpm": car.get("max_rpm") or car.get("redline_rpm"),
                }
            )
        return results[:50]

    def get_car_details(self, car_id: int | str) -> dict[str, Any] | None:
        """Get native specifications for a specific vehicle."""
        db = self._get_car_database()
        car = db.get(str(car_id))
        if not car:
            # Try searching by ordinal
            car = next(
                (c for c in db.values() if str(c.get("ordinal")) == str(car_id)), None
            )
        return car

    def get_car_tuning_capabilities(
        self, car_id: int | str, installed_parts: dict[str, str] | None = None
    ) -> dict[str, Any]:
        """Resolve capability contract and upgrade locks matching contracts.ts."""
        parts = installed_parts or {}
        has_race_suspension = parts.get("suspension") == "race"
        has_race_arb = parts.get("arb") == "race"
        has_race_diff = parts.get("differential") == "race"
        has_race_gearbox = parts.get("transmission") == "race"

        return {
            "car_id": str(car_id),
            "installed_parts": parts,
            "capabilities": {
                "tire_pressure": True,
                "camber": has_race_suspension,
                "toe": has_race_suspension,
                "caster": has_race_suspension,
                "arb_front": has_race_arb,
                "arb_rear": has_race_arb,
                "springs": has_race_suspension,
                "ride_height": has_race_suspension,
                "damping_rebound": has_race_suspension,
                "damping_bump": has_race_suspension,
                "aero_downforce": parts.get("aero") == "race",
                "gearing_final_drive": has_race_gearbox,
                "gearing_individual": has_race_gearbox,
                "differential_lock": has_race_diff,
            },
        }

    def get_tuning_constants_and_priors(
        self, profile_name: str | None = None
    ) -> dict[str, Any]:
        """Return system physics priors and calibration constants."""
        priors = {
            "target_hot_pressure_psi": 32.0,
            "natural_frequency_hz": {
                "road_front": 2.2,
                "road_rear": 2.4,
                "rally_front": 1.6,
                "rally_rear": 1.7,
                "drift_front": 2.5,
                "drift_rear": 2.3,
            },
            "critical_damping_ratio": {
                "rebound": 0.65,
                "bump": 0.35,
            },
            "aego_gearing": {
                "max_step_ratio": 0.85,
                "first_gear_traction_factor": 1.15,
            },
        }
        if profile_name and profile_name in priors:
            return {profile_name: priors[profile_name]}
        return priors

    # =========================================================================
    # 6. Tuning Presets & Pure Solvers
    # =========================================================================

    def list_tuning_presets(self, car_id: str | None = None) -> list[dict[str, Any]]:
        """List saved tuning presets."""
        results = []
        if not os.path.exists(self.tunings_dir):
            return results
        for root, _, files in os.walk(self.tunings_dir):
            for f in files:
                if f.endswith(".json"):
                    full_p = os.path.join(root, f)
                    try:
                        with open(full_p, "r", encoding="utf-8") as fp:
                            content = json.load(fp)
                        c_id = content.get("car_id") or os.path.basename(root)
                        if car_id and str(c_id) != str(car_id):
                            continue
                        results.append(
                            {
                                "car_id": c_id,
                                "save_name": f[:-5],
                                "file_path": full_p,
                                "preset_data": content,
                            }
                        )
                    except Exception:
                        pass
        return results

    def get_tuning_preset(self, car_id: str, save_name: str) -> dict[str, Any] | None:
        """Get full tuning parameters for a saved preset."""
        target = os.path.join(self.tunings_dir, str(car_id), f"{save_name}.json")
        if not os.path.exists(target):
            target = os.path.join(self.tunings_dir, f"{save_name}.json")
        if not os.path.exists(target):
            return None
        with open(target, "r", encoding="utf-8") as f:
            return json.load(f)

    def run_dev_tuning_solver(
        self,
        car_params: dict[str, Any],
        installed_parts: dict[str, str] | None = None,
        purpose: str = "road",
    ) -> dict[str, Any]:
        """Execute deterministic tuning calculation aligned with tuningMath.ts and contracts.ts."""
        weight_kg = float(car_params.get("weight_kg") or 1400.0)
        weight_lbs = weight_kg * 2.20462
        f_bias = float(car_params.get("front_weight_bias") or 0.52)
        if f_bias > 1.0:
            f_bias /= 100.0
        r_bias = 1.0 - f_bias
        drivetrain = str(car_params.get("drivetrain") or "RWD").upper()

        # ARB calculation
        if purpose == "drag":
            arb_f = 1.0
            arb_r = 65.0
        elif purpose == "drift":
            arb_f = round((f_bias * 45.0) + 1.0, 1)
            arb_r = round((r_bias * 45.0) + 1.0, 1)
        else:
            arb_f = round((f_bias * 64.0) + 1.0, 1)
            arb_r = round((r_bias * 64.0) + 1.0, 1)

        # Springs (lbs/in)
        spring_base_f = weight_lbs * f_bias * 0.7
        spring_base_r = weight_lbs * r_bias * 0.7

        # Dampers
        rebound_f = round((f_bias * 12.0) + 3.0, 1)
        rebound_r = round((r_bias * 12.0) + 3.0, 1)
        bump_f = round(rebound_f * 0.6, 1)
        bump_r = round(rebound_r * 0.6, 1)

        # Differential
        if drivetrain == "FWD":
            diff = {
                "front_accel": 45,
                "front_decel": 0,
                "rear_accel": 0,
                "rear_decel": 0,
                "center_balance": 0,
            }
        elif drivetrain == "AWD":
            diff = {
                "front_accel": 30,
                "front_decel": 0,
                "rear_accel": 65,
                "rear_decel": 15,
                "center_balance": 65,
            }
        else:  # RWD
            if purpose == "drift":
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

        return {
            "schemaVersion": "tuning-dev/v1",
            "purpose": purpose,
            "calculated_setup": {
                "tires": {
                    "front_cold_psi": 28.5,
                    "rear_cold_psi": 28.5,
                    "target_hot_psi": 32.0,
                },
                "alignment": {
                    "camber_front_deg": -1.8 if purpose != "drag" else -0.5,
                    "camber_rear_deg": -1.2 if purpose != "drag" else 0.0,
                    "toe_front_deg": 0.0 if purpose != "drift" else 0.5,
                    "toe_rear_deg": 0.0 if purpose != "drift" else -0.2,
                    "caster_deg": 6.5 if purpose != "drift" else 7.0,
                },
                "anti_roll_bars": {
                    "front": arb_f,
                    "rear": arb_r,
                },
                "springs": {
                    "front_lbs_in": round(spring_base_f, 1),
                    "rear_lbs_in": round(spring_base_r, 1),
                },
                "dampers": {
                    "rebound_front": rebound_f,
                    "rebound_rear": rebound_r,
                    "bump_front": bump_f,
                    "bump_rear": bump_r,
                },
                "differential": diff,
            },
            "capabilities": self.get_car_tuning_capabilities(
                car_params.get("ordinal", 0), installed_parts
            ),
        }

    def run_gearing_solver(
        self,
        max_rpm: float,
        peak_hp_rpm: float,
        top_speed_kmh: float,
        gears_count: int = 6,
        tire_diameter_cm: float = 65.0,
    ) -> dict[str, Any]:
        """Execute AEGO geometric powerband gearing solver."""
        if max_rpm <= 0 or peak_hp_rpm <= 0 or gears_count < 1:
            return {"error": "Invalid engine or gear parameters"}

        # Peak HP to top speed calculation
        tire_circumference_m = (tire_diameter_cm / 100.0) * math.pi
        wheel_rpm_at_top_speed = (top_speed_kmh / 3.6 / tire_circumference_m) * 60.0
        final_drive = (
            round(peak_hp_rpm / (wheel_rpm_at_top_speed * 0.85), 2)
            if wheel_rpm_at_top_speed > 0
            else 3.73
        )

        # Step ratios
        step_ratio = min(0.85, peak_hp_rpm / max_rpm)
        gears = []
        curr_ratio = 3.20  # 1st gear baseline
        for g in range(1, gears_count + 1):
            gears.append(
                {
                    "gear": g,
                    "ratio": round(curr_ratio, 2),
                    "speed_at_redline_kmh": round(
                        (
                            max_rpm
                            / (curr_ratio * final_drive)
                            * tire_circumference_m
                            / 60.0
                        )
                        * 3.6,
                        1,
                    ),
                    "upshift_drop_rpm": round(max_rpm * step_ratio, 0)
                    if g < gears_count
                    else None,
                }
            )
            curr_ratio *= step_ratio

        return {
            "final_drive": final_drive,
            "gears_count": gears_count,
            "gears": gears,
            "powerband_retention_ratio": round(step_ratio, 3),
        }

    def diagnose_telemetry_handling(
        self,
        tire_temps: list[float],
        hot_pressures: list[float] | None = None,
        symptom: str | None = None,
    ) -> dict[str, Any]:
        """Execute closed-loop handling diagnosis based on tire temperatures and pressures."""
        if len(tire_temps) < 4:
            return {"error": "Requires 4 tire temperatures (FL, FR, RL, RR)"}

        f_avg = (tire_temps[0] + tire_temps[1]) / 2.0
        r_avg = (tire_temps[2] + tire_temps[3]) / 2.0
        delta_t = f_avg - r_avg

        actions = []
        if delta_t > 5.0:
            actions.append(
                "Front axle overheat: Soften Front ARB (-2.0) or increase front cold tire pressure (+0.5 PSI)."
            )
        elif delta_t < -5.0:
            actions.append(
                "Rear axle overheat: Soften Rear ARB (-2.0) or increase rear cold tire pressure (+0.5 PSI)."
            )

        if symptom == "understeer_entry":
            actions.append(
                "Entry Understeer: Increase front negative camber (-0.2°) and reduce front bump damping."
            )
        elif symptom == "oversteer_exit":
            actions.append(
                "Exit Oversteer: Soften rear spring (-5%) or reduce rear acceleration differential lock (-10%)."
            )

        return {
            "front_avg_temp_c": round(f_avg, 1),
            "rear_avg_temp_c": round(r_avg, 1),
            "axle_delta_t_c": round(delta_t, 1),
            "convergence_status": "converged"
            if abs(delta_t) <= 3.0
            else "adjustment_required",
            "actionable_directives": actions
            if actions
            else ["Tire thermal balance is nominal. No adjustments required."],
        }

    # =========================================================================
    # 7. Settings & Diagnostics
    # =========================================================================

    def get_system_settings(self) -> dict[str, Any]:
        """Read system settings."""
        if os.path.exists(self.settings_file):
            try:
                with open(self.settings_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return {"language": "zh-tw", "speedUnit": "kmh", "telemetryPort": 8000}

    def get_hud_configurations(self) -> dict[str, Any]:
        """Read HUD overlay configurations."""
        if os.path.exists(self.hud_config_file):
            try:
                with open(self.hud_config_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return {"enabled": True, "showTeleMaster": True}

    def get_recent_logs(self, line_count: int = 50) -> list[str]:
        """Read recent backend logs."""
        if not os.path.exists(self.logs_file):
            return []
        try:
            with open(self.logs_file, "r", encoding="utf-8", errors="ignore") as f:
                lines = f.readlines()
            return [line.rstrip() for line in lines[-max(1, line_count) :]]
        except Exception:
            return []
