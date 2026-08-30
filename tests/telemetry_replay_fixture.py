"""Versioned synthetic FH telemetry replay fixture helpers for tests only."""

import json
import struct
from pathlib import Path
from typing import Any

FIXTURE_CONTRACT_VERSION = "fh6-telemetry-replay-fixture/v1"
FIXTURE_PATH = (
    Path(__file__).parent
    / "fixtures"
    / "telemetry_replay"
    / "synthetic-v1.json"
)


def load_synthetic_replay_fixture() -> dict[str, Any]:
    """Load the versioned synthetic fixture or fail closed on schema drift."""
    fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    if fixture.get("fixtureContractVersion") != FIXTURE_CONTRACT_VERSION:
        raise ValueError("unsupported telemetry replay fixture contract version")
    if fixture.get("provenance", {}).get("source") != "synthetic":
        raise ValueError("telemetry replay fixtures must be synthetic")
    return fixture


def build_raw_packet(frame: dict[str, Any], baseline: dict[str, Any]) -> bytes:
    """Build a 324-byte little-endian test packet without touching production parsing."""
    values = {**baseline, **frame}
    packet = bytearray(324)
    _pack(packet, "<i", 0, values["IsRaceOn"])
    _pack(packet, "<I", 4, values["TimestampMS"])
    _pack(
        packet,
        "<fff",
        8,
        values["EngineMaxRpm"],
        values["EngineIdleRpm"],
        values["CurrentEngineRpm"],
    )
    _pack(packet, "<fff", 20, *values["Acceleration"])
    _pack(packet, "<fff", 32, *values["Velocity"])
    _pack(packet, "<fff", 56, *values["YawPitchRoll"])
    _pack(packet, "<ffff", 68, *values["NormalizedSuspensionTravel"])
    _pack(packet, "<ffff", 84, *values["TireSlipRatio"])
    _pack(packet, "<ffff", 148, *values["SurfaceRumble"])
    _pack(packet, "<ffff", 164, *values["TireSlipAngle"])
    _pack(packet, "<ffff", 180, *values["TireCombinedSlip"])
    _pack(packet, "<ffff", 196, *values["SuspensionTravelMeters"])
    _pack(
        packet,
        "<iiii",
        212,
        values["CarOrdinal"],
        values["CarClass"],
        values["CarPerformanceIndex"],
        values["DrivetrainType"],
    )
    _pack(packet, "<i", 228, values["Cylinders"])
    _pack(packet, "<fff", 244, *values["Position"])
    _pack(
        packet,
        "<fff",
        256,
        values["SpeedMetersPerSecond"],
        values["PowerWatts"],
        values["TorqueNewtons"],
    )
    _pack(packet, "<ffff", 268, *values["TireTemp"])
    _pack(
        packet,
        "<fff",
        284,
        values["Boost"],
        values["Fuel"],
        values["DistanceTraveled"],
    )
    _pack(
        packet,
        "<ffff",
        296,
        values["BestLap"],
        values["LastLap"],
        values["CurrentLap"],
        values["CurrentRaceTime"],
    )
    _pack(
        packet,
        "<HBBBBBBb",
        312,
        values["LapNumber"],
        values["RacePosition"],
        values["AccelInput"],
        values["BrakeInput"],
        values["ClutchInput"],
        values["HandBrakeInput"],
        values["Gear"],
        values["SteerInput"],
    )
    return bytes(packet)


def replay_raw_packets() -> list[bytes]:
    """Return fixture frames as raw packets, inheriting stable baseline test fields."""
    fixture = load_synthetic_replay_fixture()
    frames = fixture["frames"]
    return [build_raw_packet(frame, frames[0]) for frame in frames]


def _pack(packet: bytearray, format_string: str, offset: int, *values: Any) -> None:
    struct.pack_into(format_string, packet, offset, *values)
