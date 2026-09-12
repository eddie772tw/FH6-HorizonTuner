"""MoTeC i2 Exporter and Session Debrief Engine for HorizonTuner.

Provides full 41-channel mapping for MoTeC i2 Pro, GPS coordinate projection,
CSV generation, and post-race vehicle health & handling debrief analysis.
"""

import csv
import logging
import math
import os
from typing import Any, Dict, List, Tuple

from road_analysis import summarize_laps

logger = logging.getLogger(__name__)

# Base GPS Reference Anchor (approx. Mexico / Equatorial baseline for Forza Horizon)
# 1 deg Lat approx 111,139 m; 1 deg Lon approx 104,800 m at 19.43 deg N
BASE_GPS_LAT = 19.432608
BASE_GPS_LON = -99.133209
LAT_METERS_PER_DEG = 111139.0
LON_METERS_PER_DEG = 104800.0


def position_to_gps(
    pos_x: float, pos_y: float, pos_z: float
) -> Tuple[float, float, float]:
    """Converts Forza local Cartesian coordinates (meters) to pseudo-WGS84 GPS.

    Allows MoTeC i2 native Track Map plugin to generate closed-loop circuit maps directly.
    """
    lat = BASE_GPS_LAT + (pos_z / LAT_METERS_PER_DEG)
    lon = BASE_GPS_LON + (pos_x / LON_METERS_PER_DEG)
    alt = pos_y
    return lat, lon, alt


def calculate_session_debrief(telemetry_points: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Calculates a post-race chassis health and vehicle dynamics debrief report.

    Extracts:
    1. Tire Thermal Balance: 4-wheel average temperatures and gradients.
    2. Suspension Utilization: Peak travel and bottom-out (travel >= 95%) count.
    3. Handling Dynamics: Understeer vs Oversteer percentage during cornering.
    4. Telemetry Signal Quality: Sample integrity and lap stats.
    """
    if not telemetry_points:
        return {
            "total_samples": 0,
            "valid_laps": 0,
            "tire_thermals": {
                "fl_avg": None,
                "fr_avg": None,
                "rl_avg": None,
                "rr_avg": None,
                "status": "no_data",
            },
            "suspension": {
                "peak_travel_pct": None,
                "bottom_out_count": None,
                "status": "no_data",
            },
            "handling_balance": {
                "understeer_pct": None,
                "oversteer_pct": None,
                "tendency": "no_data",
            },
        }

    total_pts = len(telemetry_points)
    tire_temps = [[], [], [], []]
    suspension_values = []
    bottom_outs = 0

    cornering_understeer_count = 0
    cornering_oversteer_count = 0
    cornering_total_count = 0

    def finite_number(value: Any) -> bool:
        return (
            isinstance(value, (int, float))
            and not isinstance(value, bool)
            and math.isfinite(value)
        )

    def wheel_values(point: Dict[str, Any], key: str) -> List[Any]:
        values = point.get(key)
        if not isinstance(values, (list, tuple)):
            return [None] * 4
        return [
            values[index]
            if index < len(values) and finite_number(values[index])
            else None
            for index in range(4)
        ]

    for p in telemetry_points:
        # 1. Tire Temperatures (canonical unit is Fahrenheit, convert to Celsius)
        temps = wheel_values(p, "TireTemp")
        for index, temp in enumerate(temps):
            if temp is not None:
                tire_temps[index].append((temp - 32) * 5 / 9)

        # 2. Suspension bottom out
        susp = wheel_values(p, "SuspTravel")
        for s in susp:
            if s is not None:
                suspension_values.append(s)
            if s is not None and s >= 0.95:
                bottom_outs += 1

        # 3. Handling Dynamics (Cornering when LatG >= 0.3G and speed > 10 m/s)
        accel_x = p.get("AccelerationX")
        speed = p.get("SpeedMetersPerSecond")
        if (
            finite_number(accel_x)
            and finite_number(speed)
            and abs(accel_x) >= 2.94
            and speed >= 10.0
        ):  # ~0.3G
            slip_angles = wheel_values(p, "TireSlipAngle")
            front = [abs(value) for value in slip_angles[:2] if value is not None]
            rear = [abs(value) for value in slip_angles[2:] if value is not None]
            if not front or not rear:
                continue
            front_slip = sum(front) / len(front)
            rear_slip = sum(rear) / len(rear)

            cornering_total_count += 1
            if front_slip > rear_slip * 1.15:
                cornering_understeer_count += 1
            elif rear_slip > front_slip * 1.15:
                cornering_oversteer_count += 1

    valid_laps = sum(
        1 for lap in summarize_laps(telemetry_points) if lap.get("complete") is True
    )
    averages = [
        round(sum(values) / len(values), 1) if values else None for values in tire_temps
    ]
    avg_fl, avg_fr, avg_rl, avg_rr = averages

    # Thermal status
    known_temps = [value for value in averages if value is not None]
    if not known_temps:
        thermal_status = "no_data"
    else:
        max_temp = max(known_temps)
        if max_temp > 105.0:
            thermal_status = "Overheating"
        elif max_temp < 65.0:
            thermal_status = "Cold"
        else:
            thermal_status = "Optimal"

    # Suspension status
    if not suspension_values:
        susp_status = "no_data"
        peak_travel_pct = None
    else:
        peak_travel_pct = round(max(suspension_values) * 100.0, 1)
        if bottom_outs > 10:
            susp_status = "Severe Bottoming"
        elif bottom_outs > 0:
            susp_status = "Occasional Bottoming"
        else:
            susp_status = "Optimal"

    # Handling tendency
    if cornering_total_count > 0:
        understeer_pct = (cornering_understeer_count / cornering_total_count) * 100.0
        oversteer_pct = (cornering_oversteer_count / cornering_total_count) * 100.0
        if understeer_pct >= 58.0:
            tendency = "Understeer Biased"
        elif oversteer_pct >= 58.0:
            tendency = "Oversteer Biased"
        else:
            tendency = "Neutral / Balanced"
    else:
        understeer_pct = None
        oversteer_pct = None
        tendency = "no_data"

    return {
        "total_samples": total_pts,
        "valid_laps": valid_laps,
        "tire_thermals": {
            "fl_avg": avg_fl,
            "fr_avg": avg_fr,
            "rl_avg": avg_rl,
            "rr_avg": avg_rr,
            "status": thermal_status,
        },
        "suspension": {
            "peak_travel_pct": peak_travel_pct,
            "bottom_out_count": bottom_outs if suspension_values else None,
            "status": susp_status,
        },
        "handling_balance": {
            "understeer_pct": round(understeer_pct, 1)
            if understeer_pct is not None
            else None,
            "oversteer_pct": round(oversteer_pct, 1)
            if oversteer_pct is not None
            else None,
            "tendency": tendency,
        },
    }


def export_session_to_motec_csv(
    session_meta: Dict[str, Any],
    telemetry_points: List[Dict[str, Any]],
    output_filepath: str,
) -> bool:
    """Exports a telemetry session into standard MoTeC i2 CSV format with full 41-channel alignment.
    Fully compatible with MoTeC i2 Pro, RaceRender, and TrackVision.
    """
    try:
        abs_output = os.path.realpath(os.path.abspath(output_filepath))
        output_dir = os.path.dirname(abs_output)
        os.makedirs(output_dir, exist_ok=True)

        car_name = session_meta.get("car_name", "Unknown Vehicle")
        session_id = session_meta.get("session_id", "session")

        with open(abs_output, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)

            # MoTeC Standard Header Block
            writer.writerow(["Format", "MoTeC CSV Log File", "Version", "1.00"])
            writer.writerow(
                ["Device", "FH6 Horizon Tuner Telemetry", "Serial", "FH6-HORIZON-TUNER"]
            )
            writer.writerow(["Date", session_id, "Time", "00:00:00"])
            writer.writerow(["Driver", "Driver", "Vehicle", car_name])
            writer.writerow(
                [
                    "Venue",
                    "Forza Circuit",
                    "Comment",
                    f"Exported Telemetry Session {session_id} - Full 41 Channels",
                ]
            )
            times = [p.get("time") for p in telemetry_points]
            intervals = [
                b - a
                for a, b in zip(times, times[1:])
                if isinstance(a, (int, float)) and isinstance(b, (int, float)) and b > a
            ]
            from statistics import median

            writer.writerow(
                [
                    "Sample Rate",
                    f"{1 / median(intervals):.3f}" if intervals else "unknown",
                ]
            )
            writer.writerow([])

            # Channel Names Row
            headers = [
                "Time",
                "Distance",
                "Lap Number",
                "Ground Speed",
                "Engine RPM",
                "Gear",
                "Throttle Pos",
                "Brake Pos",
                "Clutch Pos",
                "Handbrake Pos",
                "Steered Angle",
                "G Force Lat",
                "G Force Long",
                "G Force Vert",
                "Boost Pressure",
                "Fuel Level",
                "Engine Power",
                "Engine Torque",
                "Susp Pos FL",
                "Susp Pos FR",
                "Susp Pos RL",
                "Susp Pos RR",
                "Susp Travel FL",
                "Susp Travel FR",
                "Susp Travel RL",
                "Susp Travel RR",
                "Normalized Slip Angle FL",
                "Normalized Slip Angle FR",
                "Normalized Slip Angle RL",
                "Normalized Slip Angle RR",
                "Slip Ratio FL",
                "Slip Ratio FR",
                "Slip Ratio RL",
                "Slip Ratio RR",
                "Tire Temp FL",
                "Tire Temp FR",
                "Tire Temp RL",
                "Tire Temp RR",
                "GPS Latitude",
                "GPS Longitude",
                "GPS Altitude",
            ]
            writer.writerow(headers)

            # Units Row
            units = [
                "s",
                "m",
                "",
                "km/h",
                "rpm",
                "",
                "%",
                "%",
                "%",
                "%",
                "%",
                "G",
                "G",
                "G",
                "psi",
                "%",
                "hp",
                "Nm",
                "%",
                "%",
                "%",
                "%",
                "m",
                "m",
                "m",
                "m",
                "normalized",
                "normalized",
                "normalized",
                "normalized",
                "",
                "",
                "",
                "",
                "°C",
                "°C",
                "°C",
                "°C",
                "deg",
                "deg",
                "m",
            ]
            writer.writerow(units)

            # Missing recorded channels remain blank; absence is not a zero reading.
            def fmt(value, scale=1.0, offset=0.0, digits=3):
                if not isinstance(value, (int, float)) or not math.isfinite(value):
                    return ""
                return f"{value * scale + offset:.{digits}f}"

            for p in telemetry_points:

                def channel(key, scale=1.0, digits=3):
                    return fmt(p.get(key), scale, digits=digits)

                def wheel(key, scale=1.0, offset=0.0):
                    values = p.get(key) or []
                    return [
                        fmt(values[i] if i < len(values) else None, scale, offset)
                        for i in range(4)
                    ]

                row = [
                    channel("time"),
                    channel("lap_distance"),
                    channel("LapNumber", digits=0),
                    channel("SpeedMetersPerSecond", 3.6),
                    channel("CurrentEngineRpm", digits=0),
                    channel("Gear", digits=0),
                    channel("AccelInput", 100 / 255),
                    channel("BrakeInput", 100 / 255),
                    channel("ClutchInput", 100 / 255),
                    channel("HandBrakeInput", 100 / 255),
                    fmt(p.get("steer_pct"))
                    if p.get("steer_pct") is not None
                    else channel("SteerInput", 100 / 127),
                    channel("AccelerationX", 1 / 9.81),
                    channel("AccelerationZ", 1 / 9.81),
                    channel("AccelerationY", 1 / 9.81),
                    channel("Boost"),
                    channel("Fuel", 100),
                    fmt(p.get("PowerWatts", p.get("Power")), 1 / 745.7),
                    fmt(p.get("TorqueNewtons", p.get("Torque"))),
                    *wheel("SuspTravel", 100),
                    *wheel("SuspensionTravelMeters"),
                    *wheel("TireSlipAngle"),
                    *wheel("TireSlipRatio"),
                    *wheel("TireTemp", 5 / 9, -32 * 5 / 9),
                    fmt(p.get("PositionZ"), 1 / LAT_METERS_PER_DEG, BASE_GPS_LAT, 7),
                    fmt(p.get("PositionX"), 1 / LON_METERS_PER_DEG, BASE_GPS_LON, 7),
                    channel("PositionY"),
                ]
                writer.writerow(row)

        logger.info(f"Successfully exported session to MoTeC CSV: {output_filepath}")
        return True
    except Exception as e:
        logger.error(f"Failed to export MoTeC CSV: {e}")
        return False


def parse_motec_csv_to_telemetry(
    filepath: str, parse_data: bool = True
) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """Parses an exported MoTeC CSV file back into telemetry structure."""
    session_meta = {
        "session_id": "Unknown",
        "car_name": "Unknown Vehicle",
        "timestamp": 0,
    }
    telemetry_points = []

    try:
        with open(filepath, "r", encoding="utf-8") as f:
            reader = csv.reader(f)

            # Read header block until empty row
            for row in reader:
                if not row:
                    break
                if len(row) >= 4:
                    if row[0] == "Date":
                        session_meta["session_id"] = row[1]
                    elif row[0] == "Driver" and len(row) >= 4:
                        if row[2] == "Vehicle":
                            session_meta["car_name"] = row[3]

            if not parse_data:
                return session_meta, []

            headers = next(reader, [])
            next(reader, [])
            normalized_slip = "Normalized Slip Angle FL" in headers

            for row in reader:
                if not row or len(row) < 27:
                    continue

                if normalized_slip:

                    def value(index, scale=1.0, offset=0.0):
                        try:
                            raw = float(row[index])
                            return raw * scale + offset if math.isfinite(raw) else None
                        except (ValueError, IndexError):
                            return None

                    point = {
                        key: value(index, scale)
                        for key, index, scale in (
                            ("time", 0, 1),
                            ("lap_distance", 1, 1),
                            ("LapNumber", 2, 1),
                            ("SpeedMetersPerSecond", 3, 1 / 3.6),
                            ("CurrentEngineRpm", 4, 1),
                            ("Gear", 5, 1),
                            ("AccelInput", 6, 2.55),
                            ("BrakeInput", 7, 2.55),
                            ("ClutchInput", 8, 2.55),
                            ("HandBrakeInput", 9, 2.55),
                            ("steer_pct", 10, 1),
                            ("AccelerationX", 11, 9.81),
                            ("AccelerationZ", 12, 9.81),
                            ("AccelerationY", 13, 9.81),
                            ("Boost", 14, 1),
                            ("Fuel", 15, 0.01),
                            ("PowerWatts", 16, 745.7),
                            ("TorqueNewtons", 17, 1),
                        )
                    }
                    for key, start, scale, offset in (
                        ("SuspTravel", 18, 0.01, 0),
                        ("SuspensionTravelMeters", 22, 1, 0),
                        ("TireSlipAngle", 26, 1, 0),
                        ("TireSlipRatio", 30, 1, 0),
                        ("TireTemp", 34, 1.8, 32),
                    ):
                        point[key] = [
                            value(i, scale, offset) for i in range(start, start + 4)
                        ]
                    point.update(
                        {
                            "sourceSchema": "motec-csv/normalized-v1",
                            "Power": point["PowerWatts"],
                            "Torque": point["TorqueNewtons"],
                            "PositionY": value(40),
                            "PositionX": value(
                                39,
                                LON_METERS_PER_DEG,
                                -BASE_GPS_LON * LON_METERS_PER_DEG,
                            ),
                            "PositionZ": value(
                                38,
                                LAT_METERS_PER_DEG,
                                -BASE_GPS_LAT * LAT_METERS_PER_DEG,
                            ),
                        }
                    )
                    telemetry_points.append(point)
                    continue

                def get_float(idx, default=0.0):
                    try:
                        return float(row[idx])
                    except (ValueError, IndexError):
                        return default

                def get_int(idx, default=0):
                    try:
                        return int(float(row[idx]))
                    except (ValueError, IndexError):
                        return default

                point = {
                    "time": get_float(0),
                    "lap_distance": get_float(1),
                    "LapNumber": get_int(2, 1),
                    "SpeedMetersPerSecond": get_float(3) / 3.6,
                    "CurrentEngineRpm": get_int(4),
                    "Gear": get_int(5),
                    "AccelInput": int(get_float(6) * 2.55),
                    "BrakeInput": int(get_float(7) * 2.55),
                    "steer_pct": get_float(10) if len(row) > 30 else get_float(8),
                    "AccelerationX": get_float(11 if len(row) > 30 else 9) * 9.81,
                    "AccelerationZ": get_float(12 if len(row) > 30 else 10) * 9.81,
                    "SuspTravel": [
                        get_float(18 if len(row) > 30 else 11) / 100.0,
                        get_float(19 if len(row) > 30 else 12) / 100.0,
                        get_float(20 if len(row) > 30 else 13) / 100.0,
                        get_float(21 if len(row) > 30 else 14) / 100.0,
                    ],
                    "TireSlipAngle": [
                        get_float(26 if len(row) > 30 else 15)
                        / (1 if normalized_slip else 57.29578),
                        get_float(27 if len(row) > 30 else 16)
                        / (1 if normalized_slip else 57.29578),
                        get_float(28 if len(row) > 30 else 17)
                        / (1 if normalized_slip else 57.29578),
                        get_float(29 if len(row) > 30 else 18)
                        / (1 if normalized_slip else 57.29578),
                    ],
                    "TireSlipRatio": [
                        get_float(30 if len(row) > 30 else 19),
                        get_float(31 if len(row) > 30 else 20),
                        get_float(32 if len(row) > 30 else 21),
                        get_float(33 if len(row) > 30 else 22),
                    ],
                    "TireTemp": [
                        get_float(34 if len(row) > 30 else 23) * 9 / 5 + 32,
                        get_float(35 if len(row) > 30 else 24) * 9 / 5 + 32,
                        get_float(36 if len(row) > 30 else 25) * 9 / 5 + 32,
                        get_float(37 if len(row) > 30 else 26) * 9 / 5 + 32,
                    ],
                    "ClutchInput": int(get_float(8) * 2.55) if len(row) > 30 else 0,
                    "HandBrakeInput": int(get_float(9) * 2.55) if len(row) > 30 else 0,
                    "clutch_pct": get_float(8) if len(row) > 30 else 0.0,
                    "handbrake_pct": get_float(9) if len(row) > 30 else 0.0,
                    "AccelerationY": get_float(13) * 9.81 if len(row) > 30 else 0.0,
                    "Boost": get_float(14) * (1 if normalized_slip else 6894.75729)
                    if len(row) > 30
                    else 0.0,
                    "Fuel": get_float(15) / 100.0 if len(row) > 30 else 1.0,
                    "PowerWatts": get_float(16) * 745.7 if len(row) > 30 else 0.0,
                    "Power": get_float(16) * 745.7 if len(row) > 30 else 0.0,
                    "TorqueNewtons": get_float(17) if len(row) > 30 else 0.0,
                    "Torque": get_float(17) if len(row) > 30 else 0.0,
                    "SuspensionTravelMeters": [
                        get_float(22),
                        get_float(23),
                        get_float(24),
                        get_float(25),
                    ]
                    if len(row) > 30
                    else [0.0, 0.0, 0.0, 0.0],
                }
                telemetry_points.append(point)

    except Exception as e:
        logger.error(f"Failed to parse MoTeC CSV: {e}")

    return session_meta, telemetry_points
