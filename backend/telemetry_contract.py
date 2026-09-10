"""Explicit decoded FH6 storage boundary; normalized slip never uses angle units."""

import math
from typing import Any

DECODED_POINT_SCHEMA = "decoded-fh6/v1"
LEGACY_POINT_SCHEMA = "legacy-sqlite/unknown"

SCALARS = (
    "IsRaceOn",
    "TimestampMS",
    "CarOrdinal",
    "CarClass",
    "CarPerformanceIndex",
    "DrivetrainType",
    "EngineMaxRpm",
    "EngineIdleRpm",
    "CurrentEngineRpm",
    "AccelerationX",
    "AccelerationY",
    "AccelerationZ",
    "VelocityX",
    "VelocityY",
    "VelocityZ",
    "Yaw",
    "Pitch",
    "Roll",
    "PositionX",
    "PositionY",
    "PositionZ",
    "SpeedMetersPerSecond",
    "PowerWatts",
    "TorqueNewtons",
    "Boost",
    "Fuel",
    "DistanceTraveled",
    "BestLap",
    "LastLap",
    "CurrentLap",
    "CurrentRaceTime",
    "LapNumber",
    "RacePosition",
    "Gear",
    "Cylinders",
    "SmashableVelDiff",
    "SmashableMass",
    "time",
)
VECTORS = (
    "NormalizedSuspensionTravel",
    "SuspensionTravelMeters",
    "TireSlipRatio",
    "TireSlipAngle",
    "TireCombinedSlip",
    "TireTemp",
    "SurfaceRumble",
)
CONTROLS = (
    ("AccelInput", "accel_pct", 255),
    ("BrakeInput", "brake_pct", 255),
    ("SteerInput", "steer_pct", 127),
    ("ClutchInput", "clutch_pct", 255),
    ("HandBrakeInput", "handbrake_pct", 255),
)


def finite(value: Any) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
    )


def number(value: Any) -> float | int | None:
    return value if finite(value) else None


def decoded_point(point: dict[str, Any]) -> dict[str, Any]:
    """Preserve absent/invalid channels as null, including individual wheel values.

    Units are chosen by named input fields, never by their numeric magnitude.
    The aliases are the documented existing analysis/export boundary, not a
    second set of measurements. Temperature remains the application's raw °F
    contract; slip is normalized, acceleration m/s², and orientation radians.
    """
    result = {key: number(point.get(key)) for key in SCALARS}
    for canonical, alias in (
        ("PowerWatts", "Power"),
        ("TorqueNewtons", "Torque"),
        ("DistanceTraveled", "lap_distance"),
    ):
        if canonical not in point:
            result[canonical] = number(point.get(alias))
    for key in VECTORS:
        values = point.get(key)
        if key == "NormalizedSuspensionTravel" and key not in point:
            values = point.get("SuspTravel")
        result[key] = [
            number(values[i])
            if isinstance(values, (list, tuple)) and i < len(values)
            else None
            for i in range(4)
        ]
    for raw, percent, scale in CONTROLS:
        value = number(point.get(raw))
        if raw not in point and finite(point.get(percent)):
            value = point[percent] * scale / 100
        result[raw] = value
        result[percent] = value * 100 / scale if value is not None else None
    result.update(
        {
            "sourceSchema": point.get("sourceSchema")
            if isinstance(point.get("sourceSchema"), str)
            else DECODED_POINT_SCHEMA,
            "lap_distance": result["DistanceTraveled"],
            "SuspTravel": result["NormalizedSuspensionTravel"],
            "Power": result["PowerWatts"],
            "Torque": result["TorqueNewtons"],
        }
    )
    return result
