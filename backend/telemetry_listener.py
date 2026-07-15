import asyncio
import logging
import struct

logger = logging.getLogger(__name__)

# 二進位封包格式 (128 bytes 固定大小，全部以小端/C aligned 對齊)
# 格式說明:
# - i: IsRaceOn (4 bytes)
# - f: CurrentEngineRpm (4 bytes)
# - f: EngineMaxRpm (4 bytes)
# - f: EngineIdleRpm (4 bytes)
# - f: Speed (4 bytes)
# - i: Gear (4 bytes)
# - f: Power (4 bytes)
# - f: Boost (4 bytes)
# - f[3]: Accel X, Y, Z (12 bytes)
# - f[3]: Yaw, Pitch, Roll (12 bytes)
# - f[4]: TireTemp FL, FR, RL, RR (16 bytes)
# - f[4]: SuspTravel FL, FR, RL, RR (16 bytes)
# - f[4]: SlipRatio FL, FR, RL, RR (16 bytes)
# - f[4]: SlipAngle FL, FR, RL, RR (16 bytes)
# - f[3]: Position X, Y, Z (12 bytes)
# - 4 bytes: Reserved padding (對齊 136 位元組)
TELEMETRY_STRUCT_FORMAT = (
    "<iffffi" + "f" * 8 + "f" * 4 + "f" * 4 + "f" * 4 + "f" * 4 + "fff" + "4s"
)


def pack_telemetry_binary(data: dict) -> bytes:
    try:
        is_race_on = int(data.get("IsRaceOn", 0))
        rpm = float(data.get("CurrentEngineRpm", 0.0))
        max_rpm = float(data.get("EngineMaxRpm", 6000.0))
        idle_rpm = float(data.get("EngineIdleRpm", 1000.0))
        speed = float(data.get("SpeedMetersPerSecond", 0.0)) * 3.6  # 轉為 km/h
        gear = int(data.get("Gear", 0))
        power = float(data.get("PowerWatts", 0.0)) / 745.7
        boost = float(data.get("Boost", 0.0)) / 6894.75729

        accel_x = float(data.get("AccelerationX", 0.0)) / 9.81
        accel_y = float(data.get("AccelerationY", 0.0)) / 9.81
        accel_z = float(data.get("AccelerationZ", 0.0)) / 9.81

        yaw = float(data.get("Yaw", 0.0))
        # 暫時用 0.0 代替 Pitch/Roll
        pitch = 0.0
        roll = 0.0

        tire_temps = data.get("TireTemp", [0.0] * 4)
        susp_travels = data.get("NormalizedSuspensionTravel", [0.0] * 4)
        slip_ratios = data.get("TireSlipRatio", [0.0] * 4)
        slip_angles = data.get("TireSlipAngle", [0.0] * 4)

        # 確保陣列長度皆為 4
        tire_temps += [0.0] * (4 - len(tire_temps))
        susp_travels += [0.0] * (4 - len(susp_travels))
        slip_ratios += [0.0] * (4 - len(slip_ratios))
        slip_angles += [0.0] * (4 - len(slip_angles))

        # 轉換弧度為度
        slip_angles_deg = [sa * 57.29578 for sa in slip_angles]

        pos_x = float(data.get("PositionX", 0.0))
        pos_y = float(data.get("PositionY", 0.0))
        pos_z = float(data.get("PositionZ", 0.0))

        reserved = b"\x00" * 4

        return struct.pack(
            TELEMETRY_STRUCT_FORMAT,
            is_race_on,
            rpm,
            max_rpm,
            idle_rpm,
            speed,
            gear,
            power,
            boost,
            accel_x,
            accel_y,
            accel_z,
            yaw,
            pitch,
            roll,
            *tire_temps,
            *susp_travels,
            *slip_ratios,
            *slip_angles_deg,
            pos_x,
            pos_y,
            pos_z,
            reserved,
        )
    except Exception as e:
        logger.error(f"Failed to pack telemetry data: {e}")
        # 返回一個全 0 封包
        return b"\x00" * 136


class TelemetryProtocol(asyncio.DatagramProtocol):
    def __init__(self, message_queue: asyncio.Queue):
        self.message_queue = message_queue

    def connection_made(self, transport):
        self.transport = transport
        logger.info("UDP Telemetry Listener started.")

    def datagram_received(self, data, addr):
        try:
            data_len = len(data)
            if data_len >= 232:
                # 0: IsRaceOn (s32)
                is_race_on = struct.unpack_from("<i", data, 0)[0]

                # Only process if actually racing
                if is_race_on != 1:
                    return

                # Common telemetry block
                timestamp_ms = struct.unpack_from("<I", data, 4)[0]
                engine_max_rpm = struct.unpack_from("<f", data, 8)[0]
                engine_idle_rpm = struct.unpack_from("<f", data, 12)[0]
                current_engine_rpm = struct.unpack_from("<f", data, 16)[0]

                accel_x, accel_y, accel_z = struct.unpack_from("<fff", data, 20)
                vel_x, vel_y, vel_z = struct.unpack_from("<fff", data, 32)

                # Heading
                yaw = struct.unpack_from("<f", data, 56)[0]

                # Suspension Travel (Normalized 0.0 to 1.0)
                susp_fl, susp_fr, susp_rl, susp_rr = struct.unpack_from(
                    "<ffff", data, 68
                )

                # Tire Slip Ratio
                slip_ratio_fl, slip_ratio_fr, slip_ratio_rl, slip_ratio_rr = (
                    struct.unpack_from("<ffff", data, 84)
                )

                # Tire Slip Angle (Radians)
                slip_angle_fl, slip_angle_fr, slip_angle_rl, slip_angle_rr = (
                    struct.unpack_from("<ffff", data, 164)
                )

                # Car Identification
                car_ordinal = struct.unpack_from("<i", data, 212)[0]
                car_class = struct.unpack_from("<i", data, 216)[0]
                car_pi = struct.unpack_from("<i", data, 220)[0]
                drivetrain_type = struct.unpack_from("<i", data, 224)[0]

                telemetry_data = {
                    "IsRaceOn": is_race_on,
                    "TimestampMS": timestamp_ms,
                    "EngineMaxRpm": engine_max_rpm,
                    "EngineIdleRpm": engine_idle_rpm,
                    "CurrentEngineRpm": current_engine_rpm,
                    "AccelerationX": accel_x,
                    "AccelerationY": accel_y,
                    "AccelerationZ": accel_z,
                    "VelocityX": vel_x,
                    "VelocityY": vel_y,
                    "VelocityZ": vel_z,
                    "Yaw": yaw,
                    "NormalizedSuspensionTravel": [susp_fl, susp_fr, susp_rl, susp_rr],
                    "TireSlipRatio": [
                        slip_ratio_fl,
                        slip_ratio_fr,
                        slip_ratio_rl,
                        slip_ratio_rr,
                    ],
                    "TireSlipAngle": [
                        slip_angle_fl,
                        slip_angle_fr,
                        slip_angle_rl,
                        slip_angle_rr,
                    ],
                    "CarOrdinal": car_ordinal,
                    "CarClass": car_class,
                    "CarPerformanceIndex": car_pi,
                    "DrivetrainType": drivetrain_type,
                }

                # V2 Dash Data
                if data_len >= 324:
                    pos_x, pos_y, pos_z = struct.unpack_from("<fff", data, 244)
                    speed = struct.unpack_from("<f", data, 256)[0]
                    power = struct.unpack_from("<f", data, 260)[0]
                    torque = struct.unpack_from("<f", data, 264)[0]

                    tire_temp_fl, tire_temp_fr, tire_temp_rl, tire_temp_rr = (
                        struct.unpack_from("<ffff", data, 268)
                    )
                    boost = struct.unpack_from("<f", data, 284)[0]
                    fuel = struct.unpack_from("<f", data, 288)[0]

                    best_lap, last_lap, current_lap = struct.unpack_from(
                        "<fff", data, 296
                    )

                    # Controller Inputs
                    accel_input = struct.unpack_from("<B", data, 315)[0]
                    brake_input = struct.unpack_from("<B", data, 316)[0]
                    clutch_input = struct.unpack_from("<B", data, 317)[0]
                    handbrake_input = struct.unpack_from("<B", data, 318)[0]
                    gear = struct.unpack_from("<B", data, 319)[0]
                    steer_input = struct.unpack_from("<b", data, 320)[0]

                    telemetry_data.update(
                        {
                            "PositionX": pos_x,
                            "PositionY": pos_y,
                            "PositionZ": pos_z,
                            "SpeedMetersPerSecond": speed,
                            "PowerWatts": power,
                            "TorqueNewtons": torque,
                            "TireTemp": [
                                tire_temp_fl,
                                tire_temp_fr,
                                tire_temp_rl,
                                tire_temp_rr,
                            ],
                            "Boost": boost,
                            "Fuel": fuel,
                            "BestLap": best_lap,
                            "LastLap": last_lap,
                            "CurrentLap": current_lap,
                            "AccelInput": accel_input,
                            "BrakeInput": brake_input,
                            "ClutchInput": clutch_input,
                            "HandBrakeInput": handbrake_input,
                            "Gear": gear,
                            "SteerInput": steer_input,
                        }
                    )

                # Push to queue without blocking
                try:
                    self.message_queue.put_nowait(telemetry_data)
                except asyncio.QueueFull:
                    pass

        except Exception as e:
            logger.error(f"Error parsing UDP packet: {e}")


async def start_udp_listener(ip: str, port: int, message_queue: asyncio.Queue):
    try:
        loop = asyncio.get_running_loop()
        import socket

        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind((ip, port))

        transport, protocol = await loop.create_datagram_endpoint(
            lambda: TelemetryProtocol(message_queue), sock=sock
        )
        logger.info(f"Listening for Forza Telemetry on UDP {ip}:{port}")
        return transport
    except Exception as e:
        logger.error(
            f"Failed to bind UDP Telemetry socket on {ip}:{port}: {e}. (The port might be exclusively occupied by another process.)"
        )
        return None
