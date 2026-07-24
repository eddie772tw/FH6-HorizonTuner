import asyncio
import logging
import struct

logger = logging.getLogger(__name__)

TELEMETRY_STRUCT_FORMAT = (
    "<iffffffffffff" + "f" * 4 + "f" * 4 + "f" * 4 + "f" * 4 + "16s"
)


def pack_telemetry_binary(data: dict) -> bytes:
    try:
        is_race_on = int(data.get("IsRaceOn", 0))
        rpm = float(data.get("CurrentEngineRpm", 0.0))
        max_rpm = float(data.get("EngineMaxRpm", 6000.0))
        idle_rpm = float(data.get("EngineIdleRpm", 1000.0))
        speed = float(data.get("SpeedMetersPerSecond", 0.0)) * 3.6
        gear = int(data.get("Gear", 0))
        power = float(data.get("PowerWatts", 0.0)) / 745.7
        boost = float(data.get("Boost", 0.0)) / 6894.75729

        accel_x = float(data.get("AccelerationX", 0.0)) / 9.81
        accel_y = float(data.get("AccelerationY", 0.0)) / 9.81
        accel_z = float(data.get("AccelerationZ", 0.0)) / 9.81

        yaw = float(data.get("Yaw", 0.0))
        pitch = 0.0
        roll = 0.0

        tire_temps = data.get("TireTemp", [0.0] * 4)
        susp_travels = data.get("NormalizedSuspensionTravel", [0.0] * 4)
        slip_ratios = data.get("TireSlipRatio", [0.0] * 4)
        slip_angles = data.get("TireSlipAngle", [0.0] * 4)

        tire_temps += [0.0] * (4 - len(tire_temps))
        susp_travels += [0.0] * (4 - len(susp_travels))
        slip_ratios += [0.0] * (4 - len(slip_ratios))
        slip_angles += [0.0] * (4 - len(slip_angles))

        slip_angles_deg = [sa * 57.2958 for sa in slip_angles]

        packed = struct.pack(
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
            *tire_temps[:4],
            *susp_travels[:4],
            *slip_ratios[:4],
            *slip_angles_deg[:4],
            b"\x00" * 16,
        )
        return packed
    except Exception as e:
        logger.error(f"Error packing telemetry binary: {e}")
        return b"\x00" * 128


class TelemetryProtocol(asyncio.DatagramProtocol):
    def __init__(self, queue: asyncio.Queue):
        self.queue = queue
        self.transport = None

    def connection_made(self, transport):
        self.transport = transport
        logger.info("UDP Telemetry Listener connected.")

    def datagram_received(self, data: bytes, addr):
        if len(data) >= 232:
            try:
                parsed = parse_forza_dash_packet(data)
                if parsed.get("IsRaceOn", 0) == 1:
                    if self.queue.full():
                        try:
                            self.queue.get_nowait()
                        except asyncio.QueueEmpty:
                            pass
                    self.queue.put_nowait(parsed)
            except Exception as e:
                logger.error(f"Error parsing UDP packet: {e}")

    def error_received(self, exc):
        logger.error(f"UDP Telemetry Listener error: {exc}")

    def connection_lost(self, exc):
        logger.info("UDP Telemetry Listener connection closed.")


def parse_forza_dash_packet(data: bytes) -> dict:
    if len(data) < 232:
        raise ValueError(
            f"Packet size too small: expected >= 232 bytes, got {len(data)}"
        )

    unpacked = struct.unpack("<iI", data[0:8])
    is_race_on = unpacked[0]
    timestamp_ms = unpacked[1]

    engine_max_rpm = struct.unpack("<f", data[8:12])[0]
    engine_idle_rpm = struct.unpack("<f", data[12:16])[0]
    current_engine_rpm = struct.unpack("<f", data[16:20])[0]

    acceleration_x = struct.unpack("<f", data[20:24])[0]
    acceleration_y = struct.unpack("<f", data[24:28])[0]
    acceleration_z = struct.unpack("<f", data[28:32])[0]

    velocity_x = struct.unpack("<f", data[32:36])[0]
    velocity_y = struct.unpack("<f", data[36:40])[0]
    velocity_z = struct.unpack("<f", data[40:44])[0]

    angular_velocity_x = struct.unpack("<f", data[44:48])[0]
    angular_velocity_y = struct.unpack("<f", data[48:52])[0]
    angular_velocity_z = struct.unpack("<f", data[52:56])[0]

    yaw = struct.unpack("<f", data[56:60])[0]
    pitch = struct.unpack("<f", data[60:64])[0]
    roll = struct.unpack("<f", data[64:68])[0]

    normalized_suspension_travel = list(struct.unpack("<4f", data[68:84]))
    tire_slip_ratio = list(struct.unpack("<4f", data[84:100]))
    wheel_rotation_speed = list(struct.unpack("<4f", data[100:116]))
    wheel_on_rumble_strip = list(struct.unpack("<4i", data[116:132]))
    wheel_in_puddle_depth = list(struct.unpack("<4f", data[132:148]))

    surface_rumble = list(struct.unpack("<4f", data[148:164]))
    tire_slip_angle = list(struct.unpack("<4f", data[164:180]))
    tire_combined_slip = list(struct.unpack("<4f", data[180:196]))
    suspension_travel_meters = list(struct.unpack("<4f", data[196:212]))

    car_ordinal = struct.unpack("<i", data[212:216])[0]
    car_class = struct.unpack("<i", data[216:220])[0]
    car_performance_index = struct.unpack("<i", data[220:224])[0]
    drivetrain_type = struct.unpack("<i", data[224:228])[0]
    num_cylinders = struct.unpack("<i", data[228:232])[0] if len(data) >= 232 else 0

    packet_dict = {
        "IsRaceOn": is_race_on,
        "TimestampMS": timestamp_ms,
        "EngineMaxRpm": engine_max_rpm,
        "EngineIdleRpm": engine_idle_rpm,
        "CurrentEngineRpm": current_engine_rpm,
        "AccelerationX": acceleration_x,
        "AccelerationY": acceleration_y,
        "AccelerationZ": acceleration_z,
        "VelocityX": velocity_x,
        "VelocityY": velocity_y,
        "VelocityZ": velocity_z,
        "AngularVelocityX": angular_velocity_x,
        "AngularVelocityY": angular_velocity_y,
        "AngularVelocityZ": angular_velocity_z,
        "Yaw": yaw,
        "Pitch": pitch,
        "Roll": roll,
        "NormalizedSuspensionTravel": normalized_suspension_travel,
        "TireSlipRatio": tire_slip_ratio,
        "WheelRotationSpeed": wheel_rotation_speed,
        "WheelOnRumbleStrip": wheel_on_rumble_strip,
        "WheelInPuddleDepth": wheel_in_puddle_depth,
        "SurfaceRumble": surface_rumble,
        "TireSlipAngle": tire_slip_angle,
        "TireCombinedSlip": tire_combined_slip,
        "SuspensionTravelMeters": suspension_travel_meters,
        "CarOrdinal": car_ordinal,
        "CarClass": car_class,
        "CarPerformanceIndex": car_performance_index,
        "DrivetrainType": drivetrain_type,
        "NumCylinders": num_cylinders,
    }

    if len(data) >= 311:
        packet_dict["PositionX"] = struct.unpack("<f", data[244:248])[0]
        packet_dict["PositionY"] = struct.unpack("<f", data[248:252])[0]
        packet_dict["PositionZ"] = struct.unpack("<f", data[252:256])[0]
        packet_dict["SpeedMetersPerSecond"] = struct.unpack("<f", data[256:260])[0]
        packet_dict["PowerWatts"] = struct.unpack("<f", data[260:264])[0]
        packet_dict["TorqueNewtons"] = struct.unpack("<f", data[264:268])[0]
        packet_dict["TorqueNm"] = packet_dict["TorqueNewtons"]
        packet_dict["TireTemp"] = list(struct.unpack("<4f", data[268:284]))
        packet_dict["Boost"] = struct.unpack("<f", data[284:288])[0]
        packet_dict["Fuel"] = struct.unpack("<f", data[288:292])[0]
        packet_dict["DistanceTraveled"] = (
            struct.unpack("<f", data[292:296])[0] if len(data) >= 296 else 0.0
        )
        packet_dict["BestLap"] = (
            struct.unpack("<f", data[296:300])[0] if len(data) >= 300 else 0.0
        )
        packet_dict["LastLap"] = (
            struct.unpack("<f", data[300:304])[0] if len(data) >= 304 else 0.0
        )
        packet_dict["CurrentLap"] = (
            struct.unpack("<f", data[304:308])[0] if len(data) >= 308 else 0.0
        )
        packet_dict["CurrentRaceTime"] = (
            struct.unpack("<f", data[308:312])[0] if len(data) >= 312 else 0.0
        )

        if len(data) >= 324:
            packet_dict["Accel"] = data[315]
            packet_dict["Brake"] = data[316]
            packet_dict["Clutch"] = data[317]
            packet_dict["Handbrake"] = data[318]
            packet_dict["Gear"] = data[319]
            packet_dict["Steer"] = struct.unpack("<b", data[320:321])[0]

            packet_dict["AccelInput"] = data[315]
            packet_dict["BrakeInput"] = data[316]
            packet_dict["ClutchInput"] = data[317]
            packet_dict["HandBrakeInput"] = data[318]
            packet_dict["SteerInput"] = packet_dict["Steer"]

    return packet_dict


async def start_udp_listener(ip: str, port: int, queue: asyncio.Queue):
    loop = asyncio.get_running_loop()
    transport, protocol = await loop.create_datagram_endpoint(
        lambda: TelemetryProtocol(queue), local_addr=(ip, port)
    )
    logger.info(f"UDP Telemetry listener started on {ip}:{port}")
    return transport
