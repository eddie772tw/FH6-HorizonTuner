import asyncio
import struct
import unittest

from telemetry_listener import TelemetryProtocol


class TestTelemetryListener(unittest.TestCase):
    def setUp(self):
        self.queue = asyncio.Queue()
        self.protocol = TelemetryProtocol(self.queue)

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

        self.assertEqual(parsed["CarOrdinal"], 1009)
        self.assertEqual(parsed["CarClass"], 4)
        self.assertEqual(parsed["CarPerformanceIndex"], 850)
        self.assertEqual(parsed["DrivetrainType"], 1)
        # V2-only fields should not be present
        self.assertNotIn("SpeedMetersPerSecond", parsed)

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

    def test_datagram_received_not_racing(self):
        # IsRaceOn = 0 -> packet should be ignored
        data = bytearray(232)
        struct.pack_into("<i", data, 0, 0)

        self.protocol.datagram_received(bytes(data), ("127.0.0.1", 20440))
        self.assertEqual(self.queue.qsize(), 0)

    def test_datagram_received_invalid_length(self):
        # Packet length < 232 -> should be ignored
        data = bytearray(200)
        struct.pack_into("<i", data, 0, 1)

        self.protocol.datagram_received(bytes(data), ("127.0.0.1", 20440))
        self.assertEqual(self.queue.qsize(), 0)


if __name__ == "__main__":
    unittest.main()
