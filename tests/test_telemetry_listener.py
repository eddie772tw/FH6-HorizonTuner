import asyncio
import socket
import struct
import unittest
from unittest.mock import MagicMock

from telemetry_listener import (
    MultiEndpointDatagramTransport,
    TelemetryProtocol,
    create_resilient_udp_socket,
    discover_local_ipv4_addresses,
    forward_udp_packet,
    parse_telemetry_packet,
    start_udp_listener,
)
from telemetry_runtime import TelemetryPipelineMetrics


class TestTelemetryListener(unittest.TestCase):
    def setUp(self):
        self.queue = asyncio.Queue()
        self.metrics = TelemetryPipelineMetrics()
        self.protocol = TelemetryProtocol(self.queue, metrics=self.metrics)

    def test_parse_telemetry_packet_direct(self):
        # Short binary should return None
        self.assertIsNone(parse_telemetry_packet(b"\x00" * 100))

        # Not racing (IsRaceOn = 0)
        data = bytearray(232)
        struct.pack_into("<i", data, 0, 0)
        self.assertIsNone(parse_telemetry_packet(bytes(data)))

        # Racing (IsRaceOn = 1)
        struct.pack_into("<i", data, 0, 1)
        struct.pack_into("<I", data, 4, 12345)
        parsed = parse_telemetry_packet(bytes(data))
        self.assertIsNotNone(parsed)
        self.assertEqual(parsed["IsRaceOn"], 1)
        self.assertEqual(parsed["TimestampMS"], 12345)
        self.assertEqual(parsed["TelemetrySchema"], "forza-data-out/legacy-common-v1")

    def test_datagram_received_v1(self):
        # Build 232 byte packet (V1)
        data = bytearray(232)

        # 0: IsRaceOn = 1 (s32)
        struct.pack_into("<i", data, 0, 1)
        # 4: TimestampMS = 5000 (u32)
        struct.pack_into("<I", data, 4, 5000)
        # 8: EngineMaxRpm = 8000.0 (f32)
        struct.pack_into("<f", data, 8, 8000.0)
        # 12: EngineIdleRpm = 1000.0 (f32)
        struct.pack_into("<f", data, 12, 1000.0)
        # 16: CurrentEngineRpm = 3000.0 (f32)
        struct.pack_into("<f", data, 16, 3000.0)
        # 20: AccelerationX/Y/Z = (1.1, 2.2, 3.3) (f32)
        struct.pack_into("<fff", data, 20, 1.1, 2.2, 3.3)
        # 32: VelocityX/Y/Z = (10.0, 20.0, 30.0) (f32)
        struct.pack_into("<fff", data, 32, 10.0, 20.0, 30.0)
        # 56: Yaw = 1.57 (f32)
        struct.pack_into("<f", data, 56, 1.57)
        # 68: NormalizedSuspensionTravel = (0.1, 0.2, 0.3, 0.4) (f32)
        struct.pack_into("<ffff", data, 68, 0.1, 0.2, 0.3, 0.4)
        # 84: TireSlipRatio = (0.01, 0.02, 0.03, 0.04) (f32)
        struct.pack_into("<ffff", data, 84, 0.01, 0.02, 0.03, 0.04)
        # 164: TireSlipAngle = (0.11, 0.12, 0.13, 0.14) (f32)
        struct.pack_into("<ffff", data, 164, 0.11, 0.12, 0.13, 0.14)
        # 196: Absolute suspension travel in meters
        struct.pack_into("<ffff", data, 196, 0.101, 0.102, 0.103, 0.104)
        # 212: car_ordinal = 1009 (s32)
        struct.pack_into("<i", data, 212, 1009)
        # 216: car_class = 4 (s32)
        struct.pack_into("<i", data, 216, 4)
        # 220: car_pi = 850 (s32)
        struct.pack_into("<i", data, 220, 850)
        # 224: drivetrain_type = 1 (s32)
        struct.pack_into("<i", data, 224, 1)

        self.protocol.datagram_received(bytes(data), ("127.0.0.1", 20440))

        # Check queue
        self.assertEqual(self.queue.qsize(), 1)
        parsed = self.queue.get_nowait()

        self.assertEqual(parsed["IsRaceOn"], 1)
        self.assertEqual(parsed["TimestampMS"], 5000)
        self.assertAlmostEqual(parsed["EngineMaxRpm"], 8000.0, places=3)
        self.assertAlmostEqual(parsed["CurrentEngineRpm"], 3000.0, places=3)
        self.assertAlmostEqual(parsed["AccelerationX"], 1.1, places=5)

        for a, b in zip(parsed["NormalizedSuspensionTravel"], [0.1, 0.2, 0.3, 0.4]):
            self.assertAlmostEqual(a, b, places=5)

        for a, b in zip(parsed["TireSlipRatio"], [0.01, 0.02, 0.03, 0.04]):
            self.assertAlmostEqual(a, b, places=5)

        for a, b in zip(parsed["TireSlipAngle"], [0.11, 0.12, 0.13, 0.14]):
            self.assertAlmostEqual(a, b, places=5)

        for a, b in zip(parsed["SuspensionTravelMeters"], [0.101, 0.102, 0.103, 0.104]):
            self.assertAlmostEqual(a, b, places=5)

        self.assertEqual(parsed["CarOrdinal"], 1009)
        self.assertEqual(parsed["CarClass"], 4)
        self.assertEqual(parsed["CarPerformanceIndex"], 850)
        self.assertEqual(parsed["DrivetrainType"], 1)
        # V2-only fields should not be present
        self.assertNotIn("SpeedMetersPerSecond", parsed)
        self.assertEqual(
            self.metrics.snapshot(queue_depth=0, json_clients=0, binary_clients=0)[
                "input"
            ]["packetsParsed"],
            1,
        )

    def test_datagram_received_v2(self):
        # Build 324 byte packet (V2)
        data = bytearray(324)

        # Fill V1 part
        struct.pack_into("<i", data, 0, 1)
        struct.pack_into("<I", data, 4, 12000)
        struct.pack_into(
            "<fffffffffff",
            data,
            8,
            9000.0,
            800.0,
            4500.0,
            0.1,
            0.2,
            0.3,
            10.0,
            20.0,
            30.0,
            0.0,
            0.0,
        )
        struct.pack_into("<f", data, 56, -0.5)
        struct.pack_into("<ffff", data, 68, 0.5, 0.5, 0.6, 0.6)
        struct.pack_into("<ffff", data, 84, 0.0, 0.0, 0.0, 0.0)
        struct.pack_into("<ffff", data, 164, 0.0, 0.0, 0.0, 0.0)
        struct.pack_into("<ffff", data, 196, 0.12, 0.13, 0.14, 0.15)
        struct.pack_into("<iiii", data, 212, 1041, 5, 998, 2)

        # Fill V2 part
        # 244: PositionX/Y/Z = (100.1, 200.2, 300.3)
        struct.pack_into("<fff", data, 244, 100.1, 200.2, 300.3)
        # 256: speed = 55.5 (f32)
        struct.pack_into("<f", data, 256, 55.5)
        # 260: power = 450000.0 (f32)
        struct.pack_into("<f", data, 260, 450000.0)
        # 264: torque = 600.0 (f32)
        struct.pack_into("<f", data, 264, 600.0)
        # 268: TireTemp = (200.0, 201.0, 198.0, 199.0) (4*f32)
        struct.pack_into("<ffff", data, 268, 200.0, 201.0, 198.0, 199.0)
        # 284: boost = 15.2 (f32)
        struct.pack_into("<f", data, 284, 15.2)
        # 288: fuel = 0.85 (f32)
        struct.pack_into("<f", data, 288, 0.85)
        # 296: best_lap, last_lap, current_lap = (65.2, 66.8, 22.1)
        struct.pack_into("<fff", data, 296, 65.2, 66.8, 22.1)
        # 315-320: Controller inputs (u8, u8, u8, u8, u8, s8)
        # accel, brake, clutch, handbrake, gear, steer
        struct.pack_into("<BBBBBb", data, 315, 255, 0, 0, 0, 3, -12)

        self.protocol.datagram_received(bytes(data), ("127.0.0.1", 20440))

        self.assertEqual(self.queue.qsize(), 1)
        parsed = self.queue.get_nowait()

        # Verify V2 fields
        self.assertAlmostEqual(parsed["PositionX"], 100.1, places=4)
        self.assertAlmostEqual(parsed["SpeedMetersPerSecond"], 55.5, places=4)
        self.assertAlmostEqual(parsed["PowerWatts"], 450000.0, places=2)
        self.assertAlmostEqual(parsed["TorqueNewtons"], 600.0, places=2)

        for a, b in zip(parsed["TireTemp"], [200.0, 201.0, 198.0, 199.0]):
            self.assertAlmostEqual(a, b, places=4)

        for a, b in zip(parsed["SuspensionTravelMeters"], [0.12, 0.13, 0.14, 0.15]):
            self.assertAlmostEqual(a, b, places=4)

        self.assertAlmostEqual(parsed["Boost"], 15.2, places=4)
        self.assertAlmostEqual(parsed["Fuel"], 0.85, places=4)
        self.assertAlmostEqual(parsed["BestLap"], 65.2, places=4)
        self.assertAlmostEqual(parsed["LastLap"], 66.8, places=4)
        self.assertAlmostEqual(parsed["CurrentLap"], 22.1, places=4)
        self.assertEqual(parsed["AccelInput"], 255)
        self.assertEqual(parsed["BrakeInput"], 0)
        self.assertEqual(parsed["ClutchInput"], 0)
        self.assertEqual(parsed["HandBrakeInput"], 0)
        self.assertEqual(parsed["Gear"], 3)
        self.assertEqual(parsed["SteerInput"], -12)
        self.assertEqual(parsed["TelemetrySchema"], "forza-data-out/fh6-324-v2")

    def test_datagram_received_not_racing(self):
        # IsRaceOn = 0 -> packet should be ignored
        data = bytearray(232)
        struct.pack_into("<i", data, 0, 0)

        self.protocol.datagram_received(bytes(data), ("127.0.0.1", 20440))
        self.assertEqual(self.queue.qsize(), 0)
        input_metrics = self.metrics.snapshot(
            queue_depth=0, json_clients=0, binary_clients=0
        )["input"]
        self.assertEqual(input_metrics["datagramsReceived"], 1)
        self.assertEqual(input_metrics["packetsRejected"], {"not_racing": 1})

    def test_not_racing_session_boundary_rebases_timestamp_diagnostics(self):
        racing = bytearray(232)
        struct.pack_into("<i", racing, 0, 1)
        struct.pack_into("<I", racing, 4, 10_000)
        not_racing = bytearray(232)
        struct.pack_into("<i", not_racing, 0, 0)
        resumed = bytearray(232)
        struct.pack_into("<i", resumed, 0, 1)
        struct.pack_into("<I", resumed, 4, 16)

        self.protocol.datagram_received(bytes(racing), ("127.0.0.1", 20440))
        self.protocol.datagram_received(bytes(not_racing), ("127.0.0.1", 20440))
        self.protocol.datagram_received(bytes(resumed), ("127.0.0.1", 20440))

        diagnostics = self.metrics.snapshot(
            queue_depth=0, json_clients=0, binary_clients=0
        )["input"]["timestampDiagnostics"]
        self.assertEqual(diagnostics["outOfOrder"], 0)
        self.assertEqual(diagnostics["estimatedDrops"], 0)
        self.assertEqual(diagnostics["resets"], 1)

    def test_datagram_received_invalid_length(self):
        # Packet length < 232 -> should be ignored
        data = bytearray(200)
        struct.pack_into("<i", data, 0, 1)

        self.protocol.datagram_received(bytes(data), ("127.0.0.1", 20440))
        self.assertEqual(self.queue.qsize(), 0)
        input_metrics = self.metrics.snapshot(
            queue_depth=0, json_clients=0, binary_clients=0
        )["input"]
        self.assertEqual(input_metrics["packetsRejected"], {"too_short": 1})

    def test_packet_quality_rejections_are_observable_and_never_enqueue(self):
        partial = bytearray(300)
        struct.pack_into("<i", partial, 0, 1)
        oversized = bytearray(325)
        struct.pack_into("<i", oversized, 0, 1)
        implausible = bytearray(324)
        struct.pack_into("<i", implausible, 0, 1)
        struct.pack_into("<f", implausible, 256, float("nan"))

        self.protocol.datagram_received(bytes(partial), ("127.0.0.1", 20440))
        self.protocol.datagram_received(bytes(oversized), ("127.0.0.1", 20440))
        self.protocol.datagram_received(bytes(implausible), ("127.0.0.1", 20440))

        self.assertEqual(self.queue.qsize(), 0)
        rejected = self.metrics.snapshot(
            queue_depth=0, json_clients=0, binary_clients=0
        )["input"]["packetsRejected"]
        self.assertEqual(
            rejected,
            {
                "partial_schema": 1,
                "plausibility_failed": 1,
                "unsupported_length": 1,
            },
        )

    def test_input_queue_full_drop_reason_keeps_the_existing_bounded_frame(self):
        queue = asyncio.Queue(maxsize=1)
        metrics = TelemetryPipelineMetrics()
        protocol = TelemetryProtocol(queue, metrics=metrics)
        first = bytearray(324)
        second = bytearray(324)
        for packet, timestamp in ((first, 100), (second, 116)):
            struct.pack_into("<i", packet, 0, 1)
            struct.pack_into("<I", packet, 4, timestamp)
            protocol.datagram_received(bytes(packet), ("127.0.0.1", 20440))

        self.assertEqual(queue.qsize(), 1)
        self.assertEqual(queue.get_nowait()["TimestampMS"], 100)
        snapshot = metrics.snapshot(queue_depth=0, json_clients=0, binary_clients=0)
        self.assertEqual(snapshot["framesDropped"], 1)
        self.assertEqual(snapshot["dropReasons"], {"input_queue_full": 1})
        self.assertEqual(
            snapshot["input"]["schemasAccepted"], {"forza-data-out/fh6-324-v2": 2}
        )

    def test_forward_udp_packet_direct(self):
        raw_data = b"forza_telemetry_bytes" * 10
        mock_transport = MagicMock()

        # Disabled -> returns False, sendto not called
        self.assertFalse(
            forward_udp_packet(
                raw_data, "127.0.0.1", 5300, enabled=False, transport=mock_transport
            )
        )
        mock_transport.sendto.assert_not_called()

        # Enabled but no target_port
        self.assertFalse(
            forward_udp_packet(
                raw_data, "127.0.0.1", None, enabled=True, transport=mock_transport
            )
        )
        mock_transport.sendto.assert_not_called()

        # Enabled but no transport
        self.assertFalse(
            forward_udp_packet(
                raw_data, "127.0.0.1", 5300, enabled=True, transport=None
            )
        )

        # Enabled with valid transport -> success
        self.assertTrue(
            forward_udp_packet(
                raw_data, "127.0.0.1", 5300, enabled=True, transport=mock_transport
            )
        )
        mock_transport.sendto.assert_called_once_with(raw_data, ("127.0.0.1", 5300))

        # Transport exception -> gracefully caught and returns False
        mock_transport.sendto.side_effect = OSError("Network unreachable")
        self.assertFalse(
            forward_udp_packet(
                raw_data, "127.0.0.1", 5300, enabled=True, transport=mock_transport
            )
        )

    def test_telemetry_protocol_forwarding_and_loopback_guard(self):
        queue = asyncio.Queue()
        proto = TelemetryProtocol(
            queue,
            forward_enabled=True,
            forward_host="127.0.0.1",
            forward_port=5300,
            local_ip="127.0.0.1",
            local_port=8000,
        )

        mock_transport = MagicMock()
        proto.connection_made(mock_transport)

        self.assertTrue(proto._forward_enabled)
        self.assertEqual(proto._forward_addr, ("127.0.0.1", 5300))
        self.assertIsNotNone(proto._forward_socket)

        # Mock the dedicated forward socket to test isolated sending
        mock_forward_socket = MagicMock()
        proto._forward_socket = mock_forward_socket

        # Test forwarding during datagram_received
        raw_packet = bytearray(324)
        struct.pack_into("<i", raw_packet, 0, 1)  # IsRaceOn = 1
        proto.datagram_received(bytes(raw_packet), ("127.0.0.1", 20440))

        # Forwarding must be sent via dedicated socket, NEVER via transport
        mock_forward_socket.sendto.assert_called_once_with(
            bytes(raw_packet), ("127.0.0.1", 5300)
        )
        mock_transport.sendto.assert_not_called()
        self.assertEqual(queue.qsize(), 1)

        # Test loopback protection: target equals local listener
        proto.set_forwarding(enabled=True, host="127.0.0.1", port=8000)
        self.assertFalse(proto._forward_enabled)
        self.assertIsNone(proto._forward_addr)
        self.assertIsNone(proto._forward_socket)

        # Re-enable with safe port
        proto.set_forwarding(enabled=True, host="192.168.1.100", port=5300)
        self.assertTrue(proto._forward_enabled)
        self.assertEqual(proto._forward_addr, ("192.168.1.100", 5300))
        self.assertIsNotNone(proto._forward_socket)

        # Disable forwarding cleans up socket
        proto.set_forwarding(enabled=False)
        self.assertFalse(proto._forward_enabled)
        self.assertIsNone(proto._forward_addr)
        self.assertIsNone(proto._forward_socket)

    def test_forwarding_socket_auto_healing(self):
        queue = asyncio.Queue()
        proto = TelemetryProtocol(
            queue,
            forward_enabled=True,
            forward_host="127.0.0.1",
            forward_port=5300,
        )

        mock_socket = MagicMock()
        mock_socket.sendto.side_effect = OSError(
            10038, "Socket operation on non-socket"
        )
        proto._forward_socket = mock_socket

        raw_packet = bytearray(324)
        struct.pack_into("<i", raw_packet, 0, 1)

        # Datagram received triggers error -> should catch, close, and mark socket for self-healing
        proto.datagram_received(bytes(raw_packet), ("127.0.0.1", 20440))

        mock_socket.close.assert_called_once()
        self.assertIsNone(proto._forward_socket)
        # Main queue still receives parsed telemetry successfully
        self.assertEqual(queue.qsize(), 1)

    def test_forwarding_lifecycle_cleanup(self):
        queue = asyncio.Queue()
        proto = TelemetryProtocol(
            queue,
            forward_enabled=True,
            forward_host="127.0.0.1",
            forward_port=5300,
        )
        self.assertIsNotNone(proto._forward_socket)

        # Clean teardown via connection_lost
        proto.connection_lost(None)
        self.assertIsNone(proto._forward_socket)

    def test_error_received_resilience(self):
        queue = asyncio.Queue()
        metrics = TelemetryPipelineMetrics()
        proto = TelemetryProtocol(queue, metrics=metrics)

        # Simulate Windows WSAECONNRESET (10054)
        conn_reset_err = ConnectionResetError(
            10054, "An existing connection was forcibly closed by the remote host"
        )
        # Must not raise exception
        proto.error_received(conn_reset_err)

        snapshot = metrics.snapshot(queue_depth=0, json_clients=0, binary_clients=0)
        self.assertEqual(snapshot["input"]["packetsRejected"].get("socket_error"), 1)

    def test_connection_lost_callback(self):
        queue = asyncio.Queue()
        proto = TelemetryProtocol(queue)

        # Clean closure
        proto.connection_lost(None)

        # Exceptional closure
        proto.connection_lost(RuntimeError("Forced disconnect"))

    def test_discover_local_ipv4_addresses(self):
        ips = discover_local_ipv4_addresses()
        self.assertIsInstance(ips, list)
        self.assertIn("127.0.0.1", ips)
        # Insecure 0.0.0.0 wildcard must NEVER be in discovered interface list
        self.assertNotIn("0.0.0.0", ips)
        for ip in ips:
            self.assertFalse(ip.startswith("169.254."))

    def test_multi_endpoint_datagram_transport(self):
        mock_t1 = MagicMock()
        mock_t1.is_closing.return_value = False
        mock_t2 = MagicMock()
        mock_t2.is_closing.return_value = False

        composite = MultiEndpointDatagramTransport([mock_t1, mock_t2])
        self.assertFalse(composite.is_closing())

        # Test close
        composite.close()
        mock_t1.close.assert_called_once()
        mock_t2.close.assert_called_once()

        # Test abort
        composite.abort()
        mock_t1.abort.assert_called_once()
        mock_t2.abort.assert_called_once()

    def test_start_udp_listener_multi_interface(self):
        async def run_test():
            queue = asyncio.Queue()
            # Start listener on ephemeral port with auto discovery (explicit multi-interface binding)
            transport = await start_udp_listener(
                port=0,
                message_queue=queue,
            )
            self.assertIsNotNone(transport)
            transport.close()

            # Also verify passing ip explicitly still binds loopback + interfaces
            transport2 = await start_udp_listener(
                ip="127.0.0.1",
                port=0,
                message_queue=queue,
            )
            self.assertIsNotNone(transport2)
            transport2.close()

        asyncio.run(run_test())


if __name__ == "__main__":
    unittest.main()
