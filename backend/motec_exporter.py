import csv
import logging
import os
from typing import Any, Dict, List

logger = logging.getLogger(__name__)


def export_session_to_motec_csv(
    session_meta: Dict[str, Any],
    telemetry_points: List[Dict[str, Any]],
    output_filepath: str,
) -> bool:
    """Exports a telemetry session into standard MoTeC i2 CSV format.
    Fully compatible with MoTeC i2 Pro, RaceRender, and TrackVision.
    """
    try:
        os.makedirs(os.path.dirname(os.path.abspath(output_filepath)), exist_ok=True)

        car_name = session_meta.get("car_name", "Unknown Vehicle")
        session_id = session_meta.get("session_id", "session")

        with open(output_filepath, "w", newline="", encoding="utf-8") as f:
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
                    f"Exported Telemetry Session {session_id}",
                ]
            )
            writer.writerow(["Sample Rate", "10.0"])
            writer.writerow([])

            # Channel Names Row
            headers = [
                "Time",
                "Distance",
                "Lap Number",
                "Speed",
                "Engine RPM",
                "Gear",
                "Throttle Pos",
                "Brake Pos",
                "Steer Pos",
                "G Force Lat",
                "G Force Long",
                "Susp Pos FL",
                "Susp Pos FR",
                "Susp Pos RL",
                "Susp Pos RR",
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
                "G",
                "G",
                "%",
                "%",
                "%",
                "%",
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
            ]
            writer.writerow(units)

            # Data Rows
            for p in telemetry_points:
                susp = p.get("SuspTravel", [0, 0, 0, 0])
                s_angle = p.get("TireSlipAngle", [0, 0, 0, 0])
                s_ratio = p.get("TireSlipRatio", [0, 0, 0, 0])
                temp = p.get("TireTemp", [0, 0, 0, 0])

                speed_kmh = p.get("SpeedMetersPerSecond", 0.0) * 3.6
                accel_x_g = p.get("AccelerationX", 0.0) / 9.81
                accel_z_g = p.get("AccelerationZ", 0.0) / 9.81

                row = [
                    f"{p.get('time', 0.0):.3f}",
                    f"{p.get('lap_distance', 0.0):.1f}",
                    p.get("LapNumber", 1),
                    f"{speed_kmh:.1f}",
                    f"{p.get('CurrentEngineRpm', 0):.0f}",
                    p.get("Gear", 0),
                    f"{(p.get('AccelInput', 0) / 2.55):.1f}",
                    f"{(p.get('BrakeInput', 0) / 2.55):.1f}",
                    f"{p.get('steer_pct', 0.0):.1f}",
                    f"{accel_x_g:.3f}",
                    f"{accel_z_g:.3f}",
                    f"{(susp[0] * 100):.1f}",
                    f"{(susp[1] * 100):.1f}",
                    f"{(susp[2] * 100):.1f}",
                    f"{(susp[3] * 100):.1f}",
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
                ]
                writer.writerow(row)

        logger.info(f"Successfully exported session to MoTeC CSV: {output_filepath}")
        return True
    except Exception as e:
        logger.error(f"Failed to export MoTeC CSV: {e}")
        return False
