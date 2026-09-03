"""MoTeC i2 Exporter and Session Debrief Engine for HorizonTuner.

Provides full 41-channel mapping for MoTeC i2 Pro, GPS coordinate projection,
CSV generation, and post-race vehicle health & handling debrief analysis.
"""

import csv
import logging
import math
import os
from typing import Any, Dict, List, Tuple

from telemetry_listener import DEFAULT_TIRE_ARRAY

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
                "fl_avg": 0.0,
                "fr_avg": 0.0,
                "rl_avg": 0.0,
                "rr_avg": 0.0,
                "status": "no_data",
            },
            "suspension": {
                "peak_travel_pct": 0.0,
                "bottom_out_count": 0,
                "status": "no_data",
            },
            "handling_balance": {
                "understeer_pct": 50.0,
                "oversteer_pct": 50.0,
                "tendency": "Neutral",
            },
        }

    total_pts = len(telemetry_points)
    fl_temps, fr_temps, rl_temps, rr_temps = [], [], [], []
    bottom_outs = 0
    max_susp_travel = 0.0

    cornering_understeer_count = 0
    cornering_oversteer_count = 0
    cornering_total_count = 0

    laps_seen = set()

    for p in telemetry_points:
        lap = p.get("LapNumber", 0)
        if lap > 0:
            laps_seen.add(lap)

        # 1. Tire Temperatures (canonical unit is Fahrenheit, convert to Celsius)
        temps = p.get("TireTemp", DEFAULT_TIRE_ARRAY)
        fl_c = (temps[0] - 32) * 5 / 9
        fr_c = (temps[1] - 32) * 5 / 9
        rl_c = (temps[2] - 32) * 5 / 9
        rr_c = (temps[3] - 32) * 5 / 9

        fl_temps.append(fl_c)
        fr_temps.append(fr_c)
        rl_temps.append(rl_c)
        rr_temps.append(rr_c)

        # 2. Suspension bottom out
        susp = p.get("SuspTravel", DEFAULT_TIRE_ARRAY)
        for s in susp:
            if s > max_susp_travel:
                max_susp_travel = s
            if s >= 0.95:
                bottom_outs += 1

        # 3. Handling Dynamics (Cornering when LatG >= 0.3G and speed > 10 m/s)
        accel_x = abs(p.get("AccelerationX", 0.0))
        speed = p.get("SpeedMetersPerSecond", 0.0)
        if accel_x >= 2.94 and speed >= 10.0:  # ~0.3G
            slip_angles = p.get("TireSlipAngle", DEFAULT_TIRE_ARRAY)
            front_slip = (abs(slip_angles[0]) + abs(slip_angles[1])) / 2.0
            rear_slip = (abs(slip_angles[2]) + abs(slip_angles[3])) / 2.0

            cornering_total_count += 1
            if front_slip > rear_slip * 1.15:
                cornering_understeer_count += 1
            elif rear_slip > front_slip * 1.15:
                cornering_oversteer_count += 1

    avg_fl = sum(fl_temps) / total_pts if total_pts else 0.0
    avg_fr = sum(fr_temps) / total_pts if total_pts else 0.0
    avg_rl = sum(rl_temps) / total_pts if total_pts else 0.0
    avg_rr = sum(rr_temps) / total_pts if total_pts else 0.0

    # Thermal status
    max_temp = max(avg_fl, avg_fr, avg_rl, avg_rr)
    if max_temp > 105.0:
        thermal_status = "Overheating"
    elif max_temp < 65.0:
        thermal_status = "Cold"
    else:
        thermal_status = "Optimal"

    # Suspension status
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
    else:
        understeer_pct = 50.0
        oversteer_pct = 50.0

    if understeer_pct >= 58.0:
        tendency = "Understeer Biased"
    elif oversteer_pct >= 58.0:
        tendency = "Oversteer Biased"
    else:
        tendency = "Neutral / Balanced"

    return {
        "total_samples": total_pts,
        "valid_laps": len(laps_seen),
        "tire_thermals": {
            "fl_avg": round(avg_fl, 1),
            "fr_avg": round(avg_fr, 1),
            "rl_avg": round(avg_rl, 1),
            "rr_avg": round(avg_rr, 1),
            "status": thermal_status,
        },
        "suspension": {
            "peak_travel_pct": round(max_susp_travel * 100.0, 1),
            "bottom_out_count": bottom_outs,
            "status": susp_status,
        },
        "handling_balance": {
            "understeer_pct": round(understeer_pct, 1),
            "oversteer_pct": round(oversteer_pct, 1),
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
            writer.writerow(["Sample Rate", "60.0"])
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
                "Slip Angle FL",
                "Slip Angle FR",
                "Slip Angle RL",
                "Slip Angle RR",
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
                "deg",
                "deg",
                "deg",
                "deg",
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

            # Data Rows
            for p in telemetry_points:
                susp = p.get("SuspTravel", DEFAULT_TIRE_ARRAY)
                susp_meters = p.get("SuspensionTravelMeters", DEFAULT_TIRE_ARRAY)
                s_angle = p.get("TireSlipAngle", DEFAULT_TIRE_ARRAY)
                s_ratio = p.get("TireSlipRatio", DEFAULT_TIRE_ARRAY)
                temp = p.get("TireTemp", DEFAULT_TIRE_ARRAY)

                speed_kmh = p.get("SpeedMetersPerSecond", 0.0) * 3.6
                accel_x_g = p.get("AccelerationX", 0.0) / 9.81
                accel_y_g = p.get("AccelerationY", 0.0) / 9.81
                accel_z_g = p.get("AccelerationZ", 0.0) / 9.81

                pos_x = p.get("PositionX", 0.0)
                pos_y = p.get("PositionY", 0.0)
                pos_z = p.get("PositionZ", 0.0)
                lat, lon, alt = position_to_gps(pos_x, pos_y, pos_z)

                power_raw = p.get("PowerWatts")
                if power_raw is None:
                    power_raw = p.get("Power", 0.0)
                power_hp = power_raw / 745.7

                torque_raw = p.get("TorqueNewtons")
                if torque_raw is None:
                    torque_raw = p.get("Torque", 0.0)
                torque_nm = torque_raw

                boost_raw = p.get("Boost", 0.0)
                boost_psi = boost_raw / 6894.75729
                fuel_pct = p.get("Fuel", 1.0) * 100.0

                clutch_val = (
                    p.get("clutch_pct")
                    if p.get("clutch_pct") is not None
                    else (p.get("ClutchInput", 0) / 2.55)
                )
                handbrake_val = (
                    p.get("handbrake_pct")
                    if p.get("handbrake_pct") is not None
                    else (p.get("HandBrakeInput", 0) / 2.55)
                )

                row = [
                    f"{p.get('time', 0.0):.3f}",
                    f"{p.get('lap_distance', 0.0):.1f}",
                    p.get("LapNumber", 1),
                    f"{speed_kmh:.1f}",
                    f"{p.get('CurrentEngineRpm', 0):.0f}",
                    p.get("Gear", 0),
                    f"{(p.get('AccelInput', 0) / 2.55):.1f}",
                    f"{(p.get('BrakeInput', 0) / 2.55):.1f}",
                    f"{clutch_val:.1f}",
                    f"{handbrake_val:.1f}",
                    f"{p.get('steer_pct', 0.0):.1f}",
                    f"{accel_x_g:.3f}",
                    f"{accel_z_g:.3f}",
                    f"{accel_y_g:.3f}",
                    f"{boost_psi:.2f}",
                    f"{fuel_pct:.1f}",
                    f"{power_hp:.1f}",
                    f"{torque_nm:.1f}",
                    f"{(susp[0] * 100):.1f}",
                    f"{(susp[1] * 100):.1f}",
                    f"{(susp[2] * 100):.1f}",
                    f"{(susp[3] * 100):.1f}",
                    f"{susp_meters[0]:.3f}",
                    f"{susp_meters[1]:.3f}",
                    f"{susp_meters[2]:.3f}",
                    f"{susp_meters[3]:.3f}",
                    f"{(s_angle[0] * 57.29578):.2f}",
                    f"{(s_angle[1] * 57.29578):.2f}",
                    f"{(s_angle[2] * 57.29578):.2f}",
                    f"{(s_angle[3] * 57.29578):.2f}",
                    f"{s_ratio[0]:.3f}",
                    f"{s_ratio[1]:.3f}",
                    f"{s_ratio[2]:.3f}",
                    f"{s_ratio[3]:.3f}",
                    f"{((temp[0] - 32) * 5 / 9):.1f}",
                    f"{((temp[1] - 32) * 5 / 9):.1f}",
                    f"{((temp[2] - 32) * 5 / 9):.1f}",
                    f"{((temp[3] - 32) * 5 / 9):.1f}",
                    f"{lat:.7f}",
                    f"{lon:.7f}",
                    f"{alt:.1f}",
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

            next(reader, [])
            next(reader, [])

            for row in reader:
                if not row or len(row) < 27:
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
                        get_float(26 if len(row) > 30 else 15) / 57.29578,
                        get_float(27 if len(row) > 30 else 16) / 57.29578,
                        get_float(28 if len(row) > 30 else 17) / 57.29578,
                        get_float(29 if len(row) > 30 else 18) / 57.29578,
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
                    "Boost": get_float(14) * 6894.75729 if len(row) > 30 else 0.0,
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
