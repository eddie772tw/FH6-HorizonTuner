"""Generate Python-oracle telemetry fixtures for the Rust backend contract.

The script intentionally imports the existing pure telemetry implementations and
uses a temporary data root for the one module-level application import needed by
DragRecorder. It never edits backend source files or a user's database.
"""

from __future__ import annotations

import asyncio
import base64
import json
import os
import struct
import sys
import tempfile
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "tests" / "fixtures" / "telemetry"
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "backend"))


def build_packet(full: bool) -> bytes:
    size = 324 if full else 232
    data = bytearray(size)
    struct.pack_into("<iI", data, 0, 1, 123456)
    for index, value in {
        2: 8200.0,
        3: 1100.0,
        4: 4321.0,
        5: 1.1,
        6: -2.2,
        7: 9.81,
        8: 3.0,
        9: 4.0,
        10: 5.0,
        11: 0.1,
        12: 0.2,
        13: 0.3,
        14: 0.4,
        15: 0.5,
        16: 0.6,
    }.items():
        struct.pack_into("<f", data, index * 4, value)
    for start, values in {
        17: (0.1, 0.2, 0.3, 0.4),
        21: (0.01, 0.02, 0.03, 0.04),
        25: (10.0, 11.0, 12.0, 13.0),
        37: (0.5, 0.6, 0.7, 0.8),
        41: (0.11, 0.12, 0.13, 0.14),
        45: (0.21, 0.22, 0.23, 0.24),
        49: (0.31, 0.32, 0.33, 0.34),
    }.items():
        for offset, value in enumerate(values):
            struct.pack_into("<f", data, (start + offset) * 4, value)
    for index, value in enumerate((100, 200, 300, 400), 29):
        struct.pack_into("<i", data, index * 4, value)
    for index, value in enumerate((42, 700, 800, 1, 6), 53):
        struct.pack_into("<i", data, index * 4, value)
    if full:
        for index, value in {
            61: 100.0,
            62: 200.0,
            63: 300.0,
            64: 25.0,
            65: 14914.0,
            66: 400.0,
            71: 2000.0,
            72: 0.75,
            73: 1234.0,
            74: 60.0,
            75: 61.0,
            76: 12.5,
            77: 62.5,
        }.items():
            struct.pack_into("<f", data, index * 4, value)
        for index, value in enumerate((90.0, 91.0, 92.0, 93.0), 67):
            struct.pack_into("<f", data, index * 4, value)
        struct.pack_into("<HB", data, 312, 3, 2)
        data[315:321] = bytes((255, 0, 0, 0, 4, 12))
    return bytes(data)


def collect_dyno(profile: dict[str, Any], frame: dict[str, Any], quality: Any) -> None:
    from backend.main import compute_dyno_value, dyno_is_reasonable

    rpm = frame["CurrentEngineRpm"]
    bucket = str(int(rpm // 50) * 50)
    curve = profile.setdefault("dyno_curve", {})
    existing = curve.setdefault(
        bucket, {"hp": 0, "torque": 0, "hp_hist": [], "torque_hist": []}
    )
    for field, value in (
        ("hp", frame["PowerWatts"] / 745.7),
        ("torque", frame["TorqueNewtons"] * 0.73756),
    ):
        neighbors = [
            curve[str(int(bucket) + offset)][field]
            for offset in (-200, -150, -100, -50, 50, 100, 150, 200)
            if str(int(bucket) + offset) in curve
        ]
        if dyno_is_reasonable(value, neighbors):
            history = existing[f"{field}_hist"]
            history.append(value)
            existing[f"{field}_hist"] = history[-50:]
            existing[field] = compute_dyno_value(existing[f"{field}_hist"])


def drag_fixture(main: Any, mode: str) -> dict[str, Any]:
    recorder = main.DragRecorder()
    recorder.prepare()
    frames = []
    slips = {
        "FWD": [0.2, 0.2, 0.01, 0.01],
        "RWD": [0.01, 0.01, 0.2, 0.2],
        "AWD": [0.12, 0.12, 0.12, 0.12],
    }[mode]
    timestamp = 1000
    for index in range(12):
        frame = {
            "SpeedMetersPerSecond": 0.1 if index == 0 else float(index),
            "CurrentEngineRpm": 5000 - index * 120,
            "Gear": 1 if index < 5 else 2,
            "AccelInput": 255,
            "BrakeInput": 0,
            "TorqueNewtons": 350,
            "PowerWatts": 160000,
            "TireSlipRatio": slips,
            "EngineMaxRpm": 8000,
            "EngineIdleRpm": 1000,
            "PositionX": index * 2.0,
            "PositionZ": 0.0,
            "Yaw": 0.0,
            "TimestampMS": timestamp,
            "IsRaceOn": 1,
            "CarOrdinal": 42,
        }
        frames.append(frame)
        recorder.record(frame)
        timestamp += 100
    for _ in range(4):
        frame = {
            "SpeedMetersPerSecond": 13.0,
            "CurrentEngineRpm": 3500,
            "Gear": 2,
            "AccelInput": 0,
            "BrakeInput": 0,
            "TorqueNewtons": 350,
            "PowerWatts": 160000,
            "TireSlipRatio": slips,
            "EngineMaxRpm": 8000,
            "EngineIdleRpm": 1000,
            "PositionX": 24.0,
            "PositionZ": 0.0,
            "Yaw": 0.0,
            "TimestampMS": timestamp,
            "IsRaceOn": 1,
            "CarOrdinal": 42,
        }
        frames.append(frame)
        recorder.record(frame)
        timestamp += 400
    return {
        "frames": frames,
        "status": recorder.status,
        "data": recorder.current_session,
        "analysis": recorder.analysis_result,
    }


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    # DragRecorder currently lives in main.py. Use a temporary application data
    # root and a clean argv so its module setup cannot touch the checkout DB.
    with tempfile.TemporaryDirectory(
        prefix="fh6-telemetry-fixtures-", ignore_cleanup_errors=True
    ) as data_root:
        sys.argv = [str(ROOT / "backend" / "main.py"), "--data-dir", data_root]
        from backend import main as app_main
        from backend.dyno_quality import DynoQualityGate, DynoQualityGateRegistry
        from backend.race_recorder import RaceRecorder
        from backend.telemetry_contract import decoded_point
        from backend.telemetry_listener import (
            pack_telemetry_binary,
            parse_telemetry_packet,
        )
        from backend.telemetry_sqlite import TelemetrySQLite

        full = build_packet(True)
        legacy = build_packet(False)
        parser = {
            "full": {
                "bytes_base64": base64.b64encode(full).decode(),
                "expected": parse_telemetry_packet(full),
            },
            "legacy": {
                "bytes_base64": base64.b64encode(legacy).decode(),
                "expected": parse_telemetry_packet(legacy),
            },
            "rejections": {
                "too_short": parse_telemetry_packet(b""),
                "not_racing": parse_telemetry_packet(bytes(324)),
                "partial_schema": parse_telemetry_packet(bytes([1]) + bytes(232)),
            },
        }
        binary_source = {
            "IsRaceOn": 1,
            "CurrentEngineRpm": 4321.5,
            "EngineMaxRpm": 8200,
            "EngineIdleRpm": 1100,
            "SpeedMetersPerSecond": 25.0,
            "Gear": 4,
            "PowerWatts": 14914,
            "Boost": 6894.75729,
            "AccelerationX": 9.81,
            "AccelerationY": -9.81,
            "AccelerationZ": 0.0,
            "Yaw": 0.4,
            "TireTemp": [90, 91, 92, 93],
            "NormalizedSuspensionTravel": [0.1, 0.2, 0.3, 0.4],
            "TireSlipRatio": [0.01, 0.02, 0.03, 0.04],
            "TireSlipAngle": [0.11, 0.12, 0.13, 0.14],
        }
        variants = [
            {"SpeedMetersPerSecond": 10, "accel_pct": 50},
            {"Power": 123, "Torque": 456, "lap_distance": 7, "SuspTravel": [1, 2]},
        ]
        contract = {
            "variants": [
                {"input": value, "expected": decoded_point(value)} for value in variants
            ]
        }

        gate = DynoQualityGate()
        quality_frames = []
        for index in range(8):
            frame = {
                "TimestampMS": 1000 + index * 16,
                "PositionX": 0,
                "PositionY": 0,
                "PositionZ": index * 0.16,
                "SpeedMetersPerSecond": 10,
                "Gear": 4,
                "CarOrdinal": 42,
                "CarClass": 700,
                "CarPerformanceIndex": 800,
            }
            quality_frames.append(gate.observe(frame).as_dict())
        profile = {"drivetrain": "RWD", "dyno_curve": {}}
        frame = {
            "CurrentEngineRpm": 4000,
            "PowerWatts": 7457,
            "TorqueNewtons": 100,
            "AccelInput": 255,
            "Gear": 4,
            "ClutchInput": 0,
            "BrakeInput": 0,
            "HandBrakeInput": 0,
            "TireSlipRatio": [0, 0, 0, 0],
            "TimestampMS": 1200,
        }
        collect_dyno(profile, frame, quality_frames[-1])
        dyno = {"quality": quality_frames, "profile_after_collection": profile}

        drag = {mode: drag_fixture(app_main, mode) for mode in ("FWD", "RWD", "AWD")}

        class Persistence:
            def __init__(self):
                self.calls = []

            def enqueue_session_start(self, **kwargs):
                self.calls.append(("create", kwargs))
                return True

            def enqueue_points(self, session_id, points):
                self.calls.append(("points", session_id, points))
                return True

            def enqueue_finalize(self, session_id, metadata=None):
                self.calls.append(("finalize", session_id, metadata))

        persistence = Persistence()
        recorder = RaceRecorder(
            persistence,
            {"race_recording": True},
            {"42": {"year": 2026, "make": "Test", "model": "Car"}},
        )
        recorder.downsample_interval = 0
        recorder.record(
            {
                "IsRaceOn": 1,
                "CurrentRaceTime": 1,
                "LapNumber": 0,
                "TimestampMS": 100,
                "CarOrdinal": 42,
                "CarClass": 700,
                "CarPerformanceIndex": 800,
                "DrivetrainType": 1,
            }
        )
        recorder.record(
            {
                "IsRaceOn": 0,
                "CurrentRaceTime": 0,
                "LapNumber": 0,
                "TimestampMS": 200,
                "CarOrdinal": 42,
                "CarPerformanceIndex": 800,
                "DrivetrainType": 1,
            }
        )
        recorder.tick(recorder._awaiting_since + 3.1)
        normalized_calls = []
        for raw_call in persistence.calls:
            call = list(raw_call)
            if len(call) > 1 and isinstance(call[1], dict):
                call[1] = dict(call[1])
                call[1]["session_id"] = "<session_id>"
                call[1].pop("start_time", None)
            elif len(call) > 1 and isinstance(call[1], str):
                call[1] = "<session_id>"
            normalized_calls.append(call)
        race = {
            "status": {
                "is_recording": recorder.is_recording,
                "session_id": "<session_id>",
            },
            "calls": normalized_calls,
        }

        db_path = Path(data_root) / "sessions" / "fixture.db"
        store = TelemetrySQLite(str(db_path))
        store.create_session("fixture", 42, "Test Car", 700, 800, 1.0)
        point = {
            "TimestampMS": 1,
            "LapNumber": 0,
            "SpeedMetersPerSecond": 10,
            "AccelerationX": 9.81,
            "TireSlipAngle": [0.1, 0, 0, 0],
        }
        store.insert_points_batch("fixture", [point])
        sqlite_points = store.get_telemetry_points("fixture")
        sqlite_finalize = store.finalize_session("fixture", {"endReason": "fixture"})
        sqlite = {
            "points": sqlite_points,
            "laps": store.get_session_laps("fixture"),
            "finalize": sqlite_finalize,
            "metadata": store.get_session_metadata("fixture"),
        }

        payloads = {
            "parser.json": parser,
            "binary.json": {
                "input": binary_source,
                "bytes_base64": base64.b64encode(
                    pack_telemetry_binary(binary_source)
                ).decode(),
            },
            "contract.json": contract,
            "dyno.json": dyno,
            "drag.json": drag,
            "race.json": race,
            "sqlite.json": sqlite,
        }
        for name, payload in payloads.items():
            (OUT / name).write_text(
                json.dumps(
                    payload,
                    ensure_ascii=False,
                    allow_nan=False,
                    indent=2,
                    sort_keys=True,
                ),
                encoding="utf-8",
            )


if __name__ == "__main__":
    main()
