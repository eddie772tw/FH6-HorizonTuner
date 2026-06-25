import asyncio
import struct
import logging

logger = logging.getLogger(__name__)

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
                is_race_on = struct.unpack_from('<i', data, 0)[0]
                
                # Only process if actually racing
                if is_race_on != 1:
                    return

                # Common telemetry block
                timestamp_ms = struct.unpack_from('<I', data, 4)[0]
                engine_max_rpm = struct.unpack_from('<f', data, 8)[0]
                engine_idle_rpm = struct.unpack_from('<f', data, 12)[0]
                current_engine_rpm = struct.unpack_from('<f', data, 16)[0]
                
                accel_x, accel_y, accel_z = struct.unpack_from('<fff', data, 20)
                vel_x, vel_y, vel_z = struct.unpack_from('<fff', data, 32)
                
                # Heading
                yaw = struct.unpack_from('<f', data, 56)[0]
                
                # Suspension Travel (Normalized 0.0 to 1.0)
                susp_fl, susp_fr, susp_rl, susp_rr = struct.unpack_from('<ffff', data, 68)
                
                # Tire Slip Ratio
                slip_ratio_fl, slip_ratio_fr, slip_ratio_rl, slip_ratio_rr = struct.unpack_from('<ffff', data, 84)

                # Tire Slip Angle (Radians)
                slip_angle_fl, slip_angle_fr, slip_angle_rl, slip_angle_rr = struct.unpack_from('<ffff', data, 164)
                
                # Car Identification
                car_ordinal = struct.unpack_from('<i', data, 212)[0]
                drivetrain_type = struct.unpack_from('<i', data, 224)[0]

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
                    "TireSlipRatio": [slip_ratio_fl, slip_ratio_fr, slip_ratio_rl, slip_ratio_rr],
                    "TireSlipAngle": [slip_angle_fl, slip_angle_fr, slip_angle_rl, slip_angle_rr],
                    "CarOrdinal": car_ordinal,
                    "DrivetrainType": drivetrain_type,
                }

                # V2 Dash Data
                if data_len >= 324:
                    pos_x, pos_y, pos_z = struct.unpack_from('<fff', data, 244)
                    speed = struct.unpack_from('<f', data, 256)[0]
                    power = struct.unpack_from('<f', data, 260)[0]
                    torque = struct.unpack_from('<f', data, 264)[0]
                    
                    tire_temp_fl, tire_temp_fr, tire_temp_rl, tire_temp_rr = struct.unpack_from('<ffff', data, 268)
                    boost = struct.unpack_from('<f', data, 284)[0]
                    fuel = struct.unpack_from('<f', data, 288)[0]
                    
                    best_lap, last_lap, current_lap = struct.unpack_from('<fff', data, 296)
                    
                    # Controller Inputs
                    accel_input = struct.unpack_from('<B', data, 315)[0]
                    brake_input = struct.unpack_from('<B', data, 316)[0]
                    clutch_input = struct.unpack_from('<B', data, 317)[0]
                    handbrake_input = struct.unpack_from('<B', data, 318)[0]
                    gear = struct.unpack_from('<B', data, 319)[0]
                    steer_input = struct.unpack_from('<b', data, 320)[0]
                    
                    telemetry_data.update({
                        "PositionX": pos_x,
                        "PositionY": pos_y,
                        "PositionZ": pos_z,
                        "SpeedMetersPerSecond": speed,
                        "PowerWatts": power,
                        "TorqueNewtons": torque,
                        "TireTemp": [tire_temp_fl, tire_temp_fr, tire_temp_rl, tire_temp_rr],
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
                        "SteerInput": steer_input
                    })
                
                # Push to queue without blocking
                try:
                    self.message_queue.put_nowait(telemetry_data)
                except asyncio.QueueFull:
                    pass
                    
        except Exception as e:
            logger.error(f"Error parsing UDP packet: {e}")

async def start_udp_listener(ip: str, port: int, message_queue: asyncio.Queue):
    loop = asyncio.get_running_loop()
    transport, protocol = await loop.create_datagram_endpoint(
        lambda: TelemetryProtocol(message_queue),
        local_addr=(ip, port)
    )
    logger.info(f"Listening for Forza Telemetry on UDP {ip}:{port}")
    return transport
