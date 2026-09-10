"""Nullable MoTeC channel conversion with explicit units and source identity."""

from statistics import median
from typing import Any

from telemetry_contract import decoded_point, finite


def format_value(
    value: Any, digits: int = 3, scale: float = 1, offset: float = 0
) -> str:
    return f"{(value * scale + offset):.{digits}f}" if finite(value) else ""


def observed_sample_rate(points: list[dict]) -> str:
    intervals = [
        b["time"] - a["time"]
        for a, b in zip(points, points[1:])
        if finite(a.get("time")) and finite(b.get("time")) and b["time"] > a["time"]
    ]
    return f"{1 / median(intervals):.3f}" if intervals else "unknown"


def export_row(source: dict, project_position) -> list[Any]:
    p = decoded_point(source)
    xyz = [p[key] for key in ("PositionX", "PositionY", "PositionZ")]
    gps = project_position(*xyz) if all(finite(v) for v in xyz) else (None, None, None)
    f = format_value
    return [
        f(p["time"]),
        f(p["DistanceTraveled"], 1),
        p["LapNumber"],
        f(p["SpeedMetersPerSecond"], 1, 3.6),
        f(p["CurrentEngineRpm"], 0),
        p["Gear"],
        *[
            f(p[key], 3)
            for key in (
                "accel_pct",
                "brake_pct",
                "clutch_pct",
                "handbrake_pct",
                "steer_pct",
            )
        ],
        *[
            f(p[key], 5, 1 / 9.81)
            for key in ("AccelerationX", "AccelerationZ", "AccelerationY")
        ],
        f(p["Boost"], 3),
        f(p["Fuel"], 3, 100),
        f(p["PowerWatts"], 1, 1 / 745.7),
        f(p["TorqueNewtons"], 1),
        *[f(v, 3, 100) for v in p["NormalizedSuspensionTravel"]],
        *[f(v, 4) for v in p["SuspensionTravelMeters"]],
        *[f(v, 5) for v in p["TireSlipAngle"]],
        *[f(v, 5) for v in p["TireSlipRatio"]],
        *[f(v, 2, 5 / 9, -32 * 5 / 9) for v in p["TireTemp"]],
        f(gps[0], 7),
        f(gps[1], 7),
        f(gps[2], 1),
    ]


def import_row(
    headers: list[str], units: list[str], row: list[str], *, known_legacy: bool
) -> dict:
    cells = {
        name: (row[i] if i < len(row) else "", units[i] if i < len(units) else "")
        for i, name in enumerate(headers)
    }

    def read(name: str, unit: str = "", scale: float = 1, offset: float = 0):
        text, actual_unit = cells.get(name, ("", ""))
        if actual_unit != unit:
            return None
        try:
            value = float(text)
        except (ValueError, TypeError):
            return None
        return value * scale + offset if finite(value) else None

    point = {
        "time": read("Time", "s"),
        "DistanceTraveled": read("Distance", "m"),
        "LapNumber": read("Lap Number"),
        "SpeedMetersPerSecond": read("Ground Speed", "km/h", 1 / 3.6),
        "CurrentEngineRpm": read("Engine RPM", "rpm"),
        "Gear": read("Gear"),
        "AccelerationX": read("G Force Lat", "G", 9.81),
        "AccelerationY": read("G Force Vert", "G", 9.81),
        "AccelerationZ": read("G Force Long", "G", 9.81),
        "Boost": read("Boost Pressure", "psi"),
        "Fuel": read("Fuel Level", "%", 0.01),
        "PowerWatts": read("Engine Power", "hp", 745.7),
        "TorqueNewtons": read("Engine Torque", "Nm"),
    }
    for field, name, scale in (
        ("AccelInput", "Throttle Pos", 255),
        ("BrakeInput", "Brake Pos", 255),
        ("ClutchInput", "Clutch Pos", 255),
        ("HandBrakeInput", "Handbrake Pos", 255),
        ("SteerInput", "Steered Angle", 127),
    ):
        value = read(name, "%", scale / 100)
        point[field] = round(value) if value is not None else None
    for field, name, unit, scale, offset in (
        ("NormalizedSuspensionTravel", "Susp Pos", "%", 0.01, 0),
        ("SuspensionTravelMeters", "Susp Travel", "m", 1, 0),
        ("TireSlipAngle", "Slip Angle", "normalized", 1, 0),
        ("TireSlipRatio", "Slip Ratio", "", 1, 0),
        ("TireTemp", "Tire Temp", "°C", 9 / 5, 32),
    ):
        point[field] = [
            read(f"{name} {wheel}", unit, scale, offset)
            for wheel in ("FL", "FR", "RL", "RR")
        ]
    # The v1 FH6 exporter erroneously scaled normalized ANG by 57.29578.
    # Only undo that known source's encoding, never generic real slip angles.
    if known_legacy:
        point["TireSlipAngle"] = [
            read(f"Slip Angle {w}", "deg", 1 / 57.29578)
            for w in ("FL", "FR", "RL", "RR")
        ]
    result = decoded_point(point)
    result["sourceSchema"] = (
        "motec-fh6/v1-lossy" if known_legacy else "motec-channels/v2"
    )
    return result
