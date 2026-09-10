"""MoTeC i2 Exporter and Session Debrief Engine for HorizonTuner.

Provides full 41-channel mapping for MoTeC i2 Pro, GPS coordinate projection,
CSV generation, and post-race vehicle health & handling debrief analysis.
"""

import csv
import logging
import math
import os
from typing import Any, Dict, List, Tuple

from motec_channels import export_row, import_row, observed_sample_rate
from road_analysis import descriptive_debrief

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
    """Return the shared time-weighted observation contract."""
    return descriptive_debrief(telemetry_points)


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
            writer.writerow(["Format", "MoTeC CSV Log File", "Version", "2.00"])
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
            writer.writerow(["Sample Rate", observed_sample_rate(telemetry_points)])
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

            # Missing channels produce empty CSV cells, never plausible zeros.
            for point in telemetry_points:
                writer.writerow(export_row(point, position_to_gps))

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
    points = []
    version = ""
    device = ""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            reader = csv.reader(f)
            for row in reader:
                if not row:
                    break
                if len(row) < 2:
                    continue
                if row[0] == "Format" and len(row) >= 4:
                    version = row[3]
                elif row[0] == "Device":
                    device = row[1]
                elif row[0] == "Date":
                    session_meta["session_id"] = row[1]
                elif row[0] == "Driver" and len(row) >= 4:
                    session_meta["car_name"] = row[3]
            if not parse_data:
                return session_meta, []
            headers, units = next(reader, []), next(reader, [])
            known_legacy = version == "1.00" and device == "FH6 Horizon Tuner Telemetry"
            for row in reader:
                if row:
                    points.append(
                        import_row(headers, units, row, known_legacy=known_legacy)
                    )
    except (OSError, ValueError, csv.Error) as exc:
        logger.error("Failed to parse MoTeC CSV: %s", exc)
    return session_meta, points
