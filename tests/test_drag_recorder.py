import time
import unittest

from main import DragRecorder


class TestDragRecorder(unittest.TestCase):
    def setUp(self):
        self.recorder = DragRecorder()

    def test_initial_state(self):
        self.assertEqual(self.recorder.status, "idle")
        self.assertEqual(len(self.recorder.current_session), 0)

    def test_prepare(self):
        self.recorder.prepare()
        self.assertEqual(self.recorder.status, "waiting")

    def test_launch_trigger(self):
        self.recorder.prepare()

        # 1. Stationary, no throttle -> should not trigger
        data = {
            "SpeedMetersPerSecond": 0.0,
            "Gear": 1,
            "AccelInput": 0,
            "TimestampMS": 1000,
            "IsRaceOn": 1,
            "CurrentEngineRpm": 1000.0,
            "TireSlipRatio": [0.0, 0.0, 0.0, 0.0],
        }
        self.recorder.record(data)
        self.assertEqual(self.recorder.status, "waiting")

        # 2. Stationary, throttle pinned, but in neutral -> should not trigger
        data["AccelInput"] = 255
        data["Gear"] = 0
        data["TimestampMS"] = 1016
        self.recorder.record(data)
        self.assertEqual(self.recorder.status, "waiting")

        # 3. Stationary, throttle pinned, in 1st gear -> should trigger!
        data["Gear"] = 1
        data["TimestampMS"] = 1032
        self.recorder.record(data)
        self.assertEqual(self.recorder.status, "recording")
        self.assertEqual(len(self.recorder.current_session), 1)

    def test_recording_and_shift_analysis(self):
        self.recorder.prepare()

        # Trigger recording
        t_ms = 1000
        self.recorder.record(
            {
                "SpeedMetersPerSecond": 0.0,
                "Gear": 1,
                "AccelInput": 255,
                "TimestampMS": t_ms,
                "IsRaceOn": 1,
                "CurrentEngineRpm": 1500.0,
                "TireSlipRatio": [0.12, 0.12, 0.22, 0.22],  # RWD slip
            }
        )

        # 1st gear acceleration
        for i in range(1, 20):
            t_ms += 16
            self.recorder.record(
                {
                    "SpeedMetersPerSecond": i * 1.5,
                    "Gear": 1,
                    "AccelInput": 255,
                    "TimestampMS": t_ms,
                    "IsRaceOn": 1,
                    "CurrentEngineRpm": 1500.0 + i * 250,
                    "TireSlipRatio": [
                        0.01,
                        0.01,
                        0.20 - (i * 0.005),
                        0.20 - (i * 0.005),
                    ],
                }
            )

        # Shift to 2nd gear (brief throttle drop during shift)
        # Frame 21: shift starts, gear becomes 2, throttle drops
        t_ms += 16
        self.recorder.record(
            {
                "SpeedMetersPerSecond": 30.0,
                "Gear": 2,
                "AccelInput": 50,  # clutch in, throttle release
                "TimestampMS": t_ms,
                "IsRaceOn": 1,
                "CurrentEngineRpm": 6000.0,
                "TireSlipRatio": [0.0, 0.0, 0.0, 0.0],
            }
        )

        # Frame 22-25: still shifting
        for _ in range(3):
            t_ms += 16
            self.recorder.record(
                {
                    "SpeedMetersPerSecond": 30.1,
                    "Gear": 2,
                    "AccelInput": 50,
                    "TimestampMS": t_ms,
                    "IsRaceOn": 1,
                    "CurrentEngineRpm": 5000.0,
                    "TireSlipRatio": [0.0, 0.0, 0.0, 0.0],
                }
            )

        # Frame 26: shift completes, throttle back to 255
        t_ms += 16
        self.recorder.record(
            {
                "SpeedMetersPerSecond": 30.5,
                "Gear": 2,
                "AccelInput": 255,
                "TimestampMS": t_ms,
                "IsRaceOn": 1,
                "CurrentEngineRpm": 3500.0,  # RPM dropped from 6250 to 3500 (retention 0.56 < 0.62)
                "TireSlipRatio": [0.01, 0.01, 0.05, 0.05],
            }
        )

        # 2nd gear acceleration
        for i in range(1, 20):
            t_ms += 16
            self.recorder.record(
                {
                    "SpeedMetersPerSecond": 30.5 + i * 2.0,
                    "Gear": 2,
                    "AccelInput": 255,
                    "TimestampMS": t_ms,
                    "IsRaceOn": 1,
                    "CurrentEngineRpm": 4200.0 + i * 150,
                    "TireSlipRatio": [0.01, 0.01, 0.03, 0.03],
                }
            )

        # Stop condition: throttle release for > 0.8 seconds
        # 55 frames of low throttle (55 * 16ms = 880ms)
        for i in range(60):
            t_ms += 16
            self.recorder.record(
                {
                    "SpeedMetersPerSecond": 70.0,
                    "Gear": 2,
                    "AccelInput": 0,
                    "TimestampMS": t_ms,
                    "IsRaceOn": 1,
                    "CurrentEngineRpm": 3000.0 - i * 20,
                    "TireSlipRatio": [0.0, 0.0, 0.0, 0.0],
                }
            )
            if self.recorder.status == "finished":
                break

        self.assertEqual(self.recorder.status, "finished")
        self.assertTrue(len(self.recorder.current_session) > 40)

        # Check analysis result
        res = self.recorder.analysis_result
        self.assertIn("drivetrain", res)
        self.assertEqual(res["drivetrain"], "RWD")  # rear wheels slipped much more
        self.assertEqual(res["max_gear"], 2)
        self.assertTrue(len(res["shifts"]) >= 1)

        # Shift 1->2 analysis checks
        shift1 = res["shifts"][0]
        self.assertEqual(shift1["from_gear"], 1)
        self.assertEqual(shift1["to_gear"], 2)
        self.assertTrue(shift1["n_before"] > 6000)
        self.assertTrue(shift1["n_after"] < 4500)
        self.assertTrue(len(res["launch_recommendation"]) > 0)
        self.assertTrue(len(res["shift_recommendations"]) > 0)

        print("Analysis Result JSON:")
        import json

        print(json.dumps(res, indent=2, ensure_ascii=False))

    def test_invalid_path_and_high_slip_asymmetry(self):
        self.recorder.prepare()
        t_ms = 1000
        # Trigger launch first
        self.recorder.record(
            {
                "SpeedMetersPerSecond": 0.0,
                "Gear": 1,
                "AccelInput": 255,
                "TimestampMS": t_ms,
                "IsRaceOn": 1,
                "CurrentEngineRpm": 1500.0,
                "TireSlipRatio": [0.0, 0.0, 0.0, 0.0],
                "PositionX": 0.0,
                "PositionZ": 0.0,
                "Yaw": 0.0,
            }
        )
        for i in range(50):
            t_ms += 16
            x = 8.0 if 15 < i < 35 else 0.0
            self.recorder.record(
                {
                    "SpeedMetersPerSecond": 10.0 + i * 1.0,
                    "Gear": 2,
                    "AccelInput": 255,
                    "TimestampMS": t_ms,
                    "IsRaceOn": 1,
                    "CurrentEngineRpm": 3000.0 + i * 50,
                    "TireSlipRatio": [
                        0.01,
                        0.01,
                        0.25,
                        0.02,
                    ],  # Large slip diff = 0.23 > 0.08
                    "PositionX": x,
                    "PositionZ": i * 2.0,
                    "Yaw": 0.0,
                }
            )

        # Trigger finish
        t_ms += 1000
        self.recorder.record(
            {
                "SpeedMetersPerSecond": 60.0,
                "Gear": 2,
                "AccelInput": 0,
                "TimestampMS": t_ms,
                "IsRaceOn": 1,
                "CurrentEngineRpm": 2000.0,
                "TireSlipRatio": [0.0, 0.0, 0.0, 0.0],
                "PositionX": 0.0,
                "PositionZ": 102.0,
                "Yaw": 0.0,
            }
        )

        # Second low throttle point to trigger finish (>0.8s)
        t_ms += 1000
        self.recorder.record(
            {
                "SpeedMetersPerSecond": 58.0,
                "Gear": 2,
                "AccelInput": 0,
                "TimestampMS": t_ms,
                "IsRaceOn": 1,
                "CurrentEngineRpm": 1800.0,
                "TireSlipRatio": [0.0, 0.0, 0.0, 0.0],
                "PositionX": 0.0,
                "PositionZ": 105.0,
                "Yaw": 0.0,
            }
        )

        self.assertEqual(self.recorder.status, "finished")
        res = self.recorder.analysis_result
        self.assertFalse(res["path_valid"])
        self.assertTrue(res["max_deviation_meters"] > 3.0)

        self.assertTrue(
            any(
                "調高" in diag or "鎖定" in diag or "Lock" in diag
                for diag in res["stability_diagnostics"]
            )
        )

    def test_fishtailing_oscillation(self):
        self.recorder.prepare()
        t_ms = 1000
        # Trigger launch first
        self.recorder.record(
            {
                "SpeedMetersPerSecond": 0.0,
                "Gear": 1,
                "AccelInput": 255,
                "TimestampMS": t_ms,
                "IsRaceOn": 1,
                "CurrentEngineRpm": 1500.0,
                "TireSlipRatio": [0.0, 0.0, 0.0, 0.0],
                "PositionX": 0.0,
                "PositionZ": 0.0,
                "Yaw": 0.0,
            }
        )
        import math

        for i in range(40):
            t_ms += 16
            l_slip = 0.15 if i < 20 else 0.01
            r_slip = 0.01 if i < 20 else 0.15
            yaw = 0.10 * math.sin(i * 0.3)

            self.recorder.record(
                {
                    "SpeedMetersPerSecond": 10.0 + i * 1.0,
                    "Gear": 2,
                    "AccelInput": 255,
                    "TimestampMS": t_ms,
                    "IsRaceOn": 1,
                    "CurrentEngineRpm": 3000.0 + i * 50,
                    "TireSlipRatio": [0.01, 0.01, l_slip, r_slip],
                    "PositionX": 0.0,
                    "PositionZ": i * 2.0,
                    "Yaw": yaw,
                }
            )

        # Trigger finish
        t_ms += 1000
        self.recorder.record(
            {
                "SpeedMetersPerSecond": 50.0,
                "Gear": 2,
                "AccelInput": 0,
                "TimestampMS": t_ms,
                "IsRaceOn": 1,
                "CurrentEngineRpm": 2000.0,
                "TireSlipRatio": [0.0, 0.0, 0.0, 0.0],
                "PositionX": 0.0,
                "PositionZ": 82.0,
                "Yaw": 0.0,
            }
        )

        # Second low throttle point to trigger finish (>0.8s)
        t_ms += 1000
        self.recorder.record(
            {
                "SpeedMetersPerSecond": 48.0,
                "Gear": 2,
                "AccelInput": 0,
                "TimestampMS": t_ms,
                "IsRaceOn": 1,
                "CurrentEngineRpm": 1800.0,
                "TireSlipRatio": [0.0, 0.0, 0.0, 0.0],
                "PositionX": 0.0,
                "PositionZ": 85.0,
                "Yaw": 0.0,
            }
        )

        self.assertEqual(self.recorder.status, "finished")
        res = self.recorder.analysis_result

        self.assertTrue(res["yaw_variance_rad"] > 0.08)
        self.assertTrue(
            any(
                "降低" in diag or "蛇行" in diag or "Lock" in diag or "鎖定" in diag
                for diag in res["stability_diagnostics"]
            )
        )


from fastapi.testclient import TestClient
from main import app, drag_recorder


class TestDragAPI(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        drag_recorder.clear()

    def test_drag_session_lifecycle_api(self):
        # 1. Save empty session -> should return error
        res = self.client.post("/api/drag/sessions/save")
        self.assertEqual(res.status_code, 200)
        self.assertIn("error", res.json())

        # 2. Simulate a recording via API/recorder
        drag_recorder.prepare()
        # Trigger launch
        drag_recorder.record(
            {
                "SpeedMetersPerSecond": 0.0,
                "Gear": 1,
                "AccelInput": 255,
                "TimestampMS": 1000,
                "IsRaceOn": 1,
                "CurrentEngineRpm": 1500.0,
                "TireSlipRatio": [0.0, 0.0, 0.0, 0.0],
            }
        )
        # Record points
        for i in range(10):
            drag_recorder.record(
                {
                    "SpeedMetersPerSecond": 10.0 + i * 2.0,
                    "Gear": 1,
                    "AccelInput": 255,
                    "TimestampMS": 1000 + i * 16,
                    "IsRaceOn": 1,
                    "CurrentEngineRpm": 2000.0 + i * 100,
                    "TireSlipRatio": [0.05, 0.05, 0.05, 0.05],
                    "PositionX": 0.0,
                    "PositionZ": i * 1.0,
                    "Yaw": 0.0,
                }
            )
        # End recording
        drag_recorder.record(
            {
                "SpeedMetersPerSecond": 30.0,
                "Gear": 1,
                "AccelInput": 0,
                "TimestampMS": 2000,
                "IsRaceOn": 1,
                "CurrentEngineRpm": 1500.0,
                "TireSlipRatio": [0.0, 0.0, 0.0, 0.0],
            }
        )
        drag_recorder.record(
            {
                "SpeedMetersPerSecond": 28.0,
                "Gear": 1,
                "AccelInput": 0,
                "TimestampMS": 3000,
                "IsRaceOn": 1,
                "CurrentEngineRpm": 1200.0,
                "TireSlipRatio": [0.0, 0.0, 0.0, 0.0],
            }
        )
        self.assertEqual(drag_recorder.status, "finished")

        # 3. Save session
        res = self.client.post("/api/drag/sessions/save")
        self.assertEqual(res.status_code, 200)
        save_data = res.json()
        self.assertIn("filename", save_data)
        filename = save_data["filename"]

        # 4. List sessions
        res = self.client.get("/api/drag/sessions")
        self.assertEqual(res.status_code, 200)
        sessions = res.json()
        self.assertTrue(len(sessions) > 0)
        self.assertEqual(sessions[0]["filename"], filename)
        self.assertIn("car_name", sessions[0])

        # 5. Get session detail
        res = self.client.get(f"/api/drag/sessions/{filename}")
        self.assertEqual(res.status_code, 200)
        detail = res.json()
        self.assertIn("metadata", detail)
        self.assertIn("data", detail)
        self.assertIn("analysis", detail)
        self.assertEqual(detail["metadata"]["filename"], filename)

        # 6. Delete session
        res = self.client.delete(f"/api/drag/sessions/{filename}")
        self.assertEqual(res.status_code, 200)
        self.assertIn("deleted successfully", res.json()["message"])

        # 7. Get deleted session -> should fail
        res = self.client.get(f"/api/drag/sessions/{filename}")
        self.assertIn("not found", res.json()["error"])


if __name__ == "__main__":
    unittest.main()
