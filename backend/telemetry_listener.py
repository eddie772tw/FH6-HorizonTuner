import asyncio
import logging
import socket
import struct
import sys
import time
from typing import Any

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
# - 16 bytes: Reserved padding (對齊 128 位元組)
TELEMETRY_STRUCT_FORMAT = (
    "<iffffffffffff" + "f" * 4 + "f" * 4 + "f" * 4 + "f" * 4 + "16s"
)

DEFAULT_TIRE_ARRAY = (0.0, 0.0, 0.0, 0.0)


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
        # 暫時用 0.0 代替 Pitch/Roll (原 telemetry_listener.py 中沒有對這兩者直接賦值)
        pitch = 0.0
        roll = 0.0

        tire_temps = data.get("TireTemp", DEFAULT_TIRE_ARRAY)
        susp_travels = data.get("NormalizedSuspensionTravel", DEFAULT_TIRE_ARRAY)
        slip_ratios = data.get("TireSlipRatio", DEFAULT_TIRE_ARRAY)
        slip_angles = data.get("TireSlipAngle", DEFAULT_TIRE_ARRAY)

        # 確保陣列長度皆為 4
        if len(tire_temps) < 4:
            tire_temps = list(tire_temps) + [0.0] * (4 - len(tire_temps))
        if len(susp_travels) < 4:
            susp_travels = list(susp_travels) + [0.0] * (4 - len(susp_travels))
        if len(slip_ratios) < 4:
            slip_ratios = list(slip_ratios) + [0.0] * (4 - len(slip_ratios))
        if len(slip_angles) < 4:
            slip_angles = list(slip_angles) + [0.0] * (4 - len(slip_angles))

        # 轉換弧度為度
        slip_angles_deg = [sa * 57.29578 for sa in slip_angles]

        reserved = b"\x00" * 16

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
            reserved,
        )
    except Exception as e:
        logger.error(f"Failed to pack telemetry data: {e}")
        # 返回一個全 0 封包
        return b"\x00" * 128


def parse_telemetry_packet(data: bytes) -> dict | None:
    data_len = len(data)
    if data_len < 232:
        return None

    # 0: IsRaceOn (s32)
    is_race_on = struct.unpack_from("<i", data, 0)[0]

    # Only process if actually racing
    if is_race_on != 1:
        return None

    # Common telemetry block
    timestamp_ms = struct.unpack_from("<I", data, 4)[0]
    engine_max_rpm = struct.unpack_from("<f", data, 8)[0]
    engine_idle_rpm = struct.unpack_from("<f", data, 12)[0]
    current_engine_rpm = struct.unpack_from("<f", data, 16)[0]

    accel_x, accel_y, accel_z = struct.unpack_from("<fff", data, 20)
    vel_x, vel_y, vel_z = struct.unpack_from("<fff", data, 32)

    # Heading
    yaw = struct.unpack_from("<f", data, 56)[0]
    pitch = struct.unpack_from("<f", data, 60)[0]
    roll = struct.unpack_from("<f", data, 64)[0]

    # Suspension Travel (Normalized 0.0 to 1.0)
    susp_fl, susp_fr, susp_rl, susp_rr = struct.unpack_from("<ffff", data, 68)

    # Tire Slip Ratio
    slip_ratio_fl, slip_ratio_fr, slip_ratio_rl, slip_ratio_rr = struct.unpack_from(
        "<ffff", data, 84
    )

    # Tire Slip Angle (Radians)
    slip_angle_fl, slip_angle_fr, slip_angle_rl, slip_angle_rr = struct.unpack_from(
        "<ffff", data, 164
    )

    # Surface Rumble
    rumble_fl, rumble_fr, rumble_rl, rumble_rr = struct.unpack_from("<ffff", data, 148)

    # Car Identification
    car_ordinal = struct.unpack_from("<i", data, 212)[0]
    car_class = struct.unpack_from("<i", data, 216)[0]
    car_pi = struct.unpack_from("<i", data, 220)[0]
    drivetrain_type = struct.unpack_from("<i", data, 224)[0]
    cylinders = struct.unpack_from("<i", data, 228)[0]

    # Combined Slip
    (
        combined_slip_fl,
        combined_slip_fr,
        combined_slip_rl,
        combined_slip_rr,
    ) = struct.unpack_from("<ffff", data, 180)

    # Absolute Suspension Travel (Meters)
    abs_susp_fl, abs_susp_fr, abs_susp_rl, abs_susp_rr = struct.unpack_from(
        "<ffff", data, 196
    )

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
        "Pitch": pitch,
        "Roll": roll,
        "SurfaceRumble": [rumble_fl, rumble_fr, rumble_rl, rumble_rr],
        "TireCombinedSlip": [
            combined_slip_fl,
            combined_slip_fr,
            combined_slip_rl,
            combined_slip_rr,
        ],
        "NormalizedSuspensionTravel": [susp_fl, susp_fr, susp_rl, susp_rr],
        "SuspensionTravelMeters": [
            abs_susp_fl,
            abs_susp_fr,
            abs_susp_rl,
            abs_susp_rr,
        ],
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
        "Cylinders": cylinders,
    }

    # V2 Dash Data
    if data_len >= 324:
        pos_x, pos_y, pos_z = struct.unpack_from("<fff", data, 244)
        speed = struct.unpack_from("<f", data, 256)[0]
        power = struct.unpack_from("<f", data, 260)[0]
        torque = struct.unpack_from("<f", data, 264)[0]

        tire_temp_fl, tire_temp_fr, tire_temp_rl, tire_temp_rr = struct.unpack_from(
            "<ffff", data, 268
        )
        boost = struct.unpack_from("<f", data, 284)[0]
        fuel = struct.unpack_from("<f", data, 288)[0]

        best_lap, last_lap, current_lap = struct.unpack_from("<fff", data, 296)

        distance_traveled = struct.unpack_from("<f", data, 292)[0]
        current_race_time = struct.unpack_from("<f", data, 308)[0]
        lap_number = struct.unpack_from("<H", data, 312)[0]
        race_position = struct.unpack_from("<B", data, 314)[0]

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
                "DistanceTraveled": distance_traveled,
                "CurrentRaceTime": current_race_time,
                "LapNumber": lap_number,
                "RacePosition": race_position,
                "AccelInput": accel_input,
                "BrakeInput": brake_input,
                "ClutchInput": clutch_input,
                "HandBrakeInput": handbrake_input,
                "Gear": gear,
                "SteerInput": steer_input,
            }
        )

    return telemetry_data


def forward_udp_packet(
    data: bytes,
    target_host: str = "127.0.0.1",
    target_port: int | None = None,
    enabled: bool = False,
    transport: asyncio.DatagramTransport | socket.socket | None = None,
) -> bool:
    """SimHub / Third-party UDP passthrough raw packet forwarding function.

    When enabled=True, target_port is specified, and a valid datagram transport/socket is provided,
    forwards the raw binary telemetry datagram bytes directly to target_host:target_port.

    :param data: Raw binary telemetry datagram bytes received from Forza
    :param target_host: Target forwarding IPv4 address (default "127.0.0.1")
    :param target_port: Target forwarding UDP port (e.g. 5300)
    :param enabled: Whether forwarding is enabled (default False)
    :param transport: Active DatagramTransport or dedicated socket.socket instance to send through
    :return: True if successfully forwarded, False otherwise
    """
    if not enabled or target_port is None or transport is None:
        return False

    try:
        transport.sendto(data, (target_host, target_port))
        return True
    except Exception as e:
        logger.debug(
            f"Failed to forward UDP packet to {target_host}:{target_port}: {e}"
        )
        return False


class TelemetryProtocol(asyncio.DatagramProtocol):
    def __init__(
        self,
        message_queue: asyncio.Queue,
        forward_enabled: bool = False,
        forward_host: str = "127.0.0.1",
        forward_port: int = 5300,
        local_ip: str = "0.0.0.0",
        local_port: int = 8000,
        metrics=None,
    ):
        self.message_queue = message_queue
        self.local_ip = local_ip
        self.local_port = local_port
        self.metrics = metrics
        self.transport: asyncio.DatagramTransport | None = None
        self._forward_enabled = False
        self._forward_addr: tuple[str, int] | None = None
        self._forward_socket: socket.socket | None = None
        self._last_forward_error_time: float = 0.0
        self.set_forwarding(forward_enabled, forward_host, forward_port)

    def _create_dedicated_forward_socket(self) -> socket.socket | None:
        """Create an isolated, dedicated non-blocking UDP sender socket for passthrough.

        - Completely decouples forwarding from the 8000 listener transport.
        - Sets SO_SNDBUF = 512KB to avoid buffer saturation.
        - Applies WSAIoctl SIO_UDP_CONNRESET on Windows to prevent ICMP errors from corrupting the sender.
        """
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            try:
                sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            except Exception:
                pass
            try:
                sock.setsockopt(socket.SOL_SOCKET, socket.SO_SNDBUF, 512 * 1024)
            except Exception:
                pass

            if sys.platform == "win32":
                try:
                    import ctypes

                    b_false = ctypes.c_ulong(0)
                    bytes_ret = ctypes.c_ulong(0)
                    ctypes.windll.ws2_32.WSAIoctl(
                        sock.fileno(),
                        0x9800000C,
                        ctypes.byref(b_false),
                        ctypes.sizeof(b_false),
                        None,
                        0,
                        ctypes.byref(bytes_ret),
                        None,
                        None,
                    )
                except Exception as e:
                    logger.debug(f"Failed to apply WSAIoctl on forward socket: {e}")

            sock.setblocking(False)
            return sock
        except Exception as e:
            logger.warning(f"Failed to create dedicated UDP forward socket: {e}")
            return None

    def _forward_datagram(self, data: bytes) -> None:
        """Forward raw datagram to third-party target with self-healing auto-recovery."""
        if not self._forward_enabled or not self._forward_addr:
            return

        if self._forward_socket is None:
            now = time.monotonic()
            if now - self._last_forward_error_time >= 0.5:
                self._forward_socket = self._create_dedicated_forward_socket()
            if self._forward_socket is None:
                return

        try:
            self._forward_socket.sendto(data, self._forward_addr)
        except (BlockingIOError, InterruptedError):
            # Transient non-blocking buffer condition; drop frame safely
            pass
        except Exception as e:
            # Fatal or severe socket error: trigger self-healing recreation
            self._last_forward_error_time = time.monotonic()
            logger.debug(
                f"UDP forward error on dedicated socket: {e}. Initiating self-healing..."
            )
            try:
                self._forward_socket.close()
            except Exception:
                pass
            self._forward_socket = None

    def set_forwarding(
        self,
        enabled: bool,
        host: str = "127.0.0.1",
        port: int | None = 5300,
    ) -> None:
        """Dynamically update raw UDP packet forwarding target."""
        if not enabled or port is None:
            self._forward_enabled = False
            self._forward_addr = None
            if self._forward_socket is not None:
                try:
                    self._forward_socket.close()
                except Exception:
                    pass
                self._forward_socket = None
            return

        normalized_host = host.strip() if host else "127.0.0.1"
        is_loopback_target = port == self.local_port and normalized_host in (
            "127.0.0.1",
            "localhost",
            "0.0.0.0",
            self.local_ip,
        )

        if is_loopback_target:
            logger.warning(
                f"UDP forwarding target {normalized_host}:{port} matches local listener. "
                "Disabling forwarding to prevent loopback packet storm."
            )
            self._forward_enabled = False
            self._forward_addr = None
            if self._forward_socket is not None:
                try:
                    self._forward_socket.close()
                except Exception:
                    pass
                self._forward_socket = None
            return

        self._forward_enabled = True
        self._forward_addr = (normalized_host, port)
        if self._forward_socket is None:
            self._forward_socket = self._create_dedicated_forward_socket()

        logger.info(
            f"UDP Telemetry Forwarding configured to {normalized_host}:{port} (enabled={enabled}, Dedicated Sender Socket)"
        )

    def connection_made(self, transport):
        self.transport = transport
        logger.info("UDP Telemetry Listener started.")

    def datagram_received(self, data, addr):
        if self.metrics is not None:
            self.metrics.record_datagram(len(data))

        # 1. Forward raw datagram via dedicated isolated sender socket (Full Passthrough)
        if self._forward_enabled:
            self._forward_datagram(data)

        # 2. Parse telemetry packet for local processing
        try:
            telemetry_data = parse_telemetry_packet(data)
            if telemetry_data is not None:
                if self.metrics is not None:
                    self.metrics.record_packet_parsed()
                try:
                    self.message_queue.put_nowait(telemetry_data)
                except asyncio.QueueFull:
                    pass
            elif self.metrics is not None:
                if len(data) < 232:
                    rejection_reason = "too_short"
                else:
                    rejection_reason = "not_racing"
                self.metrics.record_packet_rejected(rejection_reason)
        except Exception as e:
            if self.metrics is not None:
                self.metrics.record_packet_rejected("parser_error")
            logger.error(f"Error parsing UDP packet: {e}")

    def error_received(self, exc: Exception) -> None:
        """Handle transport level socket errors without terminating the listener.

        Specifically swallows transient Windows ConnectionResetError (WSAECONNRESET 10054).
        """
        if self.metrics is not None:
            self.metrics.record_packet_rejected("socket_error")
        logger.debug(f"UDP Telemetry listener received transient socket error: {exc}")

    def connection_lost(self, exc: Exception | None) -> None:
        """Handle transport teardown and clean up dedicated sender socket."""
        if self._forward_socket is not None:
            try:
                self._forward_socket.close()
            except Exception:
                pass
            self._forward_socket = None

        if exc is not None:
            logger.warning(f"UDP Telemetry transport closed with error: {exc}")
        else:
            logger.info("UDP Telemetry transport closed.")


def discover_local_ipv4_addresses() -> list[str]:
    """Discover all active registered IPv4 interface addresses on the local host.

    Always includes 127.0.0.1 (Loopback).
    Excludes wildcard 0.0.0.0, APIPA auto-assigned link-local (169.254.x.x), and broadcast.
    """
    discovered: set[str] = {"127.0.0.1"}

    # 1. Query hostname resolution
    try:
        hostname = socket.gethostname()
        for host_ip in socket.gethostbyname_ex(hostname)[2]:
            if (
                host_ip
                and not host_ip.startswith("169.254.")
                and not host_ip.startswith("0.")
            ):
                discovered.add(host_ip)
    except Exception:
        pass

    # 2. Query getaddrinfo for all AF_INET addresses on host
    try:
        addr_info = socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)
        for item in addr_info:
            info_ip = item[4][0]
            if (
                info_ip
                and not info_ip.startswith("169.254.")
                and not info_ip.startswith("0.")
            ):
                discovered.add(info_ip)
    except Exception:
        pass

    return sorted(list(discovered))


class MultiEndpointDatagramTransport(asyncio.DatagramTransport):
    """Composite DatagramTransport that encapsulates multiple bound DatagramTransport instances.

    Enables listening on all registered host interface IPs (e.g. 127.0.0.1 + local LAN IPs)
    without binding to the insecure wildcard 0.0.0.0.
    """

    def __init__(self, transports: list[asyncio.DatagramTransport]):
        self._transports = list(transports)

    def close(self) -> None:
        for t in self._transports:
            try:
                t.close()
            except Exception:
                pass

    def is_closing(self) -> bool:
        return (
            all(t.is_closing() for t in self._transports) if self._transports else True
        )

    def get_extra_info(self, name: str, default: Any = None) -> Any:
        if self._transports:
            return self._transports[0].get_extra_info(name, default)
        return default

    def abort(self) -> None:
        for t in self._transports:
            try:
                t.abort()
            except Exception:
                pass


def create_resilient_udp_socket(
    ip: str,
    port: int,
    rcvbuf_size: int = 2 * 1024 * 1024,
) -> socket.socket:
    """Create and configure a resilient UDP socket for Forza telemetry.

    - Sets SO_REUSEADDR for rapid port re-binding upon service restarts.
    - Expands SO_RCVBUF to 2MB to prevent packet drops during high burst 60Hz telemetry.
    - Disables Winsock SIO_UDP_CONNRESET on Windows to prevent ICMP Port Unreachable (WSAECONNRESET 10054)
      from breaking the Asyncio datagram reader loop.
    - Binds to (ip, port) and marks non-blocking for asyncio event loop consumption.
    """
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

    # 1. Enable address reuse
    try:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    except Exception as e:
        logger.debug(f"Failed to set SO_REUSEADDR: {e}")

    # 2. Expand receive buffer
    try:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, rcvbuf_size)
    except Exception as e:
        logger.debug(f"Failed to set SO_RCVBUF to {rcvbuf_size}: {e}")

    # 3. Disable Winsock SIO_UDP_CONNRESET on Windows
    if sys.platform == "win32":
        try:
            import ctypes

            # SIO_UDP_CONNRESET = 0x9800000C. Must use ws2_32.WSAIoctl to disable ICMP connection reset.
            b_false = ctypes.c_ulong(0)
            bytes_ret = ctypes.c_ulong(0)
            ctypes.windll.ws2_32.WSAIoctl(
                sock.fileno(),
                0x9800000C,
                ctypes.byref(b_false),
                ctypes.sizeof(b_false),
                None,
                0,
                ctypes.byref(bytes_ret),
                None,
                None,
            )
        except Exception as e:
            logger.debug(f"Failed to disable SIO_UDP_CONNRESET on Windows: {e}")

    sock.bind((ip, port))
    sock.setblocking(False)
    return sock


async def start_udp_listener(
    ip: str,
    port: int,
    message_queue: asyncio.Queue,
    forward_enabled: bool = False,
    forward_host: str = "127.0.0.1",
    forward_port: int = 5300,
    metrics=None,
):
    loop = asyncio.get_running_loop()

    # If ip is "auto", "0.0.0.0", "all", or empty: probe and bind all registered local IPs explicitly
    if ip in ("0.0.0.0", "auto", "all", "", None):
        target_ips = discover_local_ipv4_addresses()
    else:
        target_ips = [ip]

    transports: list[asyncio.DatagramTransport] = []
    bound_ips: list[str] = []

    for bind_ip in target_ips:
        try:
            sock = create_resilient_udp_socket(bind_ip, port)
            transport, protocol = await loop.create_datagram_endpoint(
                lambda b_ip=bind_ip: TelemetryProtocol(
                    message_queue,
                    forward_enabled=forward_enabled,
                    forward_host=forward_host,
                    forward_port=forward_port,
                    local_ip=b_ip,
                    local_port=port,
                    metrics=metrics,
                ),
                sock=sock,
            )
            transports.append(transport)
            bound_ips.append(bind_ip)
        except Exception as e:
            logger.warning(
                f"Failed to bind telemetry listener to {bind_ip}:{port}: {e}"
            )

    if not transports:
        # Fallback to loopback if all interface bindings failed
        fallback_ip = "127.0.0.1"
        sock = create_resilient_udp_socket(fallback_ip, port)
        transport, protocol = await loop.create_datagram_endpoint(
            lambda: TelemetryProtocol(
                message_queue,
                forward_enabled=forward_enabled,
                forward_host=forward_host,
                forward_port=forward_port,
                local_ip=fallback_ip,
                local_port=port,
                metrics=metrics,
            ),
            sock=sock,
        )
        transports.append(transport)
        bound_ips.append(fallback_ip)

    logger.info(
        f"Listening for Forza Telemetry on UDP {', '.join(bound_ips)}:{port} (Resilient Sockets, Zero Wildcard 0.0.0.0)"
    )

    if len(transports) == 1:
        return transports[0]
    return MultiEndpointDatagramTransport(transports)
