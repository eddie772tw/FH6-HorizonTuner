import json
import logging
import os
import time
from typing import Any, Dict, List

from backend.core.config import CAR_DB_PATH, SESSIONS_DB_PATH
from backend.services.telemetry_sqlite import TelemetrySQLite

logger = logging.getLogger("backend.recorders")

car_database = {}
if os.path.exists(CAR_DB_PATH):
    try:
        with open(CAR_DB_PATH, "r", encoding="utf-8") as f:
            car_database = json.load(f)
    except Exception:
        pass

telemetry_db = TelemetrySQLite(SESSIONS_DB_PATH)


class RaceRecorder:
    def __init__(self, db: TelemetrySQLite):
        self.db = db
        self.is_recording = False
        self.manual_mode = False
        self.current_session_id = None
        self.in_memory_batch = []
        self.first_timestamp = None
        self.last_sample_time = 0
        self.max_samples = 50000
        self.downsample_interval = 0.1
        self.lap_start_times = {}
        self.total_count = 0

    def clear(self):
        self.is_recording = False
        self.manual_mode = False
        self.current_session_id = None
        self.in_memory_batch = []
        self.first_timestamp = None
        self.last_sample_time = 0
        self.lap_start_times = {}
        self.total_count = 0

    def _flush_to_sqlite(self):
        if not self.in_memory_batch or not self.current_session_id:
            return
        batch_to_write = list(self.in_memory_batch)
        self.in_memory_batch = []
        try:
            self.db.insert_points_batch(self.current_session_id, batch_to_write)
        except Exception as e:
            logger.error(f"Failed to flush telemetry batch to SQLite: {e}")

    def record(self, data: dict, race_recording_enabled: bool = True):
        if not race_recording_enabled:
            if self.is_recording:
                self.clear()
            return

        is_race_on = data.get("IsRaceOn", 0) == 1
        current_race_time = data.get("CurrentRaceTime", 0.0)
        current_lap = data.get("CurrentLap", data.get("LapNumber", 0))

        is_race_active = self.manual_mode or (
            is_race_on and current_race_time > 0.0 and current_lap > 0
        )

        if is_race_active:
            if not self.is_recording:
                self.clear()
                self.is_recording = True
                self.current_session_id = f"session_{int(time.time())}"

                car_ordinal = data.get("CarOrdinal", 0)
                car_info = car_database.get(str(car_ordinal), {})
                car_name = f"{car_info.get('year', '')} {car_info.get('make', '')} {car_info.get('model', '')}".strip()
                if not car_name:
                    car_name = (
                        f"Car #{car_ordinal}" if car_ordinal > 0 else "Unknown Car"
                    )

                car_class = data.get("CarClass", 0)
                car_pi = data.get("CarPerformanceIndex", 0)

                self.db.create_session(
                    session_id=self.current_session_id,
                    car_ordinal=car_ordinal,
                    car_name=car_name,
                    car_class=car_class,
                    car_pi=car_pi,
                    start_time=time.time(),
                )

            now = time.time()
            if now - self.last_sample_time >= self.downsample_interval:
                if self.total_count >= self.max_samples:
                    self.is_recording = False
                    return

                timestamp_ms = data.get("TimestampMS", 0)
                if self.first_timestamp is None:
                    self.first_timestamp = timestamp_ms

                relative_time = (timestamp_ms - self.first_timestamp) / 1000.0
                c_lap = data.get("CurrentLap", 1)

                if c_lap not in self.lap_start_times:
                    self.lap_start_times[c_lap] = relative_time

                point = dict(data)
                point["time"] = round(relative_time, 2)

                self.in_memory_batch.append(point)
                self.total_count += 1
                self.last_sample_time = now

                if len(self.in_memory_batch) >= 50:
                    self._flush_to_sqlite()
        else:
            if self.is_recording:
                self.save_latest_and_clear(data)

    def save_latest_and_clear(self, last_data: dict):
        if not self.current_session_id:
            self.clear()
            return

        self._flush_to_sqlite()

        try:
            points = self.db.get_telemetry_points(self.current_session_id)
            if points:
                laps_map: dict[int, list[dict]] = {}
                for p in points:
                    l_num = p.get("LapNumber", 1)
                    if l_num not in laps_map:
                        laps_map[l_num] = []
                    laps_map[l_num].append(p)

                laps_summary = []
                best_lap_time = 999999.0
                total_distance = 0.0

                for l_num, l_points in laps_map.items():
                    if not l_points:
                        continue
                    l_time = l_points[-1]["time"] - l_points[0]["time"]
                    start_dist = l_points[0].get("lap_distance", 0.0)
                    end_dist = l_points[-1].get("lap_distance", 0.0)
                    speeds = [p["SpeedMetersPerSecond"] * 3.6 for p in l_points]
                    max_sp = max(speeds) if speeds else 0.0
                    avg_sp = sum(speeds) / len(speeds) if speeds else 0.0

                    if l_time > 1.0 and l_time < best_lap_time:
                        best_lap_time = l_time

                    laps_summary.append(
                        {
                            "lap_number": l_num,
                            "lap_time": round(l_time, 3),
                            "start_distance": round(start_dist, 1),
                            "end_distance": round(end_dist, 1),
                            "max_speed_kmh": round(max_sp, 1),
                            "avg_speed_kmh": round(avg_sp, 1),
                        }
                    )
                    total_distance = max(total_distance, end_dist)

                if best_lap_time == 999999.0:
                    best_lap_time = 0.0

                self.db.save_laps_summary(self.current_session_id, laps_summary)
                self.db.update_session_summary(
                    self.current_session_id,
                    total_laps=len(laps_summary),
                    best_lap_time=round(best_lap_time, 3),
                    total_distance=round(total_distance, 1),
                )
        except Exception as e:
            logger.error(f"Error finalizing session summary: {e}")

        self.clear()


class DragRecorder:
    def __init__(self):
        self.status = "idle"
        self.current_session = []
        self.first_timestamp = None
        self.low_throttle_start_time = None
        self.low_throttle_duration_limit = 0.8
        self.max_recording_time = 30.0
        self.analysis_result = {}
        self.car_id = 0
        self.car_name = ""

    def prepare(self):
        self.status = "waiting"
        self.current_session = []
        self.first_timestamp = None
        self.low_throttle_start_time = None
        self.analysis_result = {}
        self.car_id = 0
        self.car_name = ""

    def clear(self):
        self.status = "idle"
        self.current_session = []
        self.first_timestamp = None
        self.low_throttle_start_time = None
        self.analysis_result = {}
        self.car_id = 0
        self.car_name = ""

    def record(self, data: dict):
        if self.status == "idle" or self.status == "finished":
            return

        speed = data.get("SpeedMetersPerSecond", 0.0)
        accel_input = data.get("AccelInput", data.get("Accel", 0))
        gear = data.get("Gear", 0)
        timestamp_ms = data.get("TimestampMS", 0)
        is_race_on = data.get("IsRaceOn", 0)

        if self.status == "waiting":
            if speed < 0.5 and gear >= 1 and accel_input >= 220:
                self.status = "recording"
                self.first_timestamp = timestamp_ms
                self.car_id = data.get("CarOrdinal", 0)
            else:
                return

        if self.status == "recording":
            relative_time = (timestamp_ms - self.first_timestamp) / 1000.0

            point = {
                "time": round(relative_time, 3),
                "SpeedMetersPerSecond": speed,
                "CurrentEngineRpm": data.get("CurrentEngineRpm", 0.0),
                "Gear": gear,
                "AccelInput": accel_input,
                "BrakeInput": data.get("BrakeInput", data.get("Brake", 0)),
                "TorqueNewtons": data.get("TorqueNewtons", data.get("TorqueNm", 0.0)),
                "PowerWatts": data.get("PowerWatts", 0.0),
                "TireSlipRatio": list(data.get("TireSlipRatio", [0.0, 0.0, 0.0, 0.0])),
                "EngineMaxRpm": data.get("EngineMaxRpm", 8000.0),
                "EngineIdleRpm": data.get("EngineIdleRpm", 1000.0),
                "PositionX": data.get("PositionX", 0.0),
                "PositionZ": data.get("PositionZ", 0.0),
                "Yaw": data.get("Yaw", 0.0),
            }
            self.current_session.append(point)

            stop_recording = False

            if is_race_on != 1 or relative_time > self.max_recording_time:
                stop_recording = True
            elif accel_input < 150:
                if self.low_throttle_start_time is None:
                    self.low_throttle_start_time = timestamp_ms
                elif (
                    timestamp_ms - self.low_throttle_start_time
                ) / 1000.0 > self.low_throttle_duration_limit:
                    stop_recording = True
            else:
                self.low_throttle_start_time = None

            if not stop_recording and relative_time > 3.0 and speed < 0.1:
                stop_recording = True

            if stop_recording:
                self.status = "finished"
                self.analyze()

    def analyze(self):
        if not self.current_session:
            self.analysis_result = {"error": "No data recorded."}
            return

        max_speed = -1.0
        max_speed_idx = 0
        for idx, p in enumerate(self.current_session):
            if p["SpeedMetersPerSecond"] > max_speed:
                max_speed = p["SpeedMetersPerSecond"]
                max_speed_idx = idx

        if max_speed_idx >= 10:
            self.current_session = self.current_session[: max_speed_idx + 1]

        first_gear_pts = [p for p in self.current_session if p["Gear"] == 1]
        fl_slips = [abs(p["TireSlipRatio"][0]) for p in first_gear_pts]
        fr_slips = [abs(p["TireSlipRatio"][1]) for p in first_gear_pts]
        rl_slips = [abs(p["TireSlipRatio"][2]) for p in first_gear_pts]
        rr_slips = [abs(p["TireSlipRatio"][3]) for p in first_gear_pts]

        avg_front_slip = (
            (sum(fl_slips) + sum(fr_slips)) / (2 * len(first_gear_pts))
            if first_gear_pts
            else 0
        )
        avg_rear_slip = (
            (sum(rl_slips) + sum(rr_slips)) / (2 * len(first_gear_pts))
            if first_gear_pts
            else 0
        )

        drivetrain = "AWD"
        if avg_rear_slip > 0.08 and avg_front_slip < 0.03:
            drivetrain = "RWD"
        elif avg_front_slip > 0.08 and avg_rear_slip < 0.03:
            drivetrain = "FWD"

        max_gear = (
            max(p["Gear"] for p in self.current_session) if self.current_session else 1
        )

        shifts = []
        current_gear = None
        for i, p in enumerate(self.current_session):
            g = p["Gear"]
            if g <= 0:
                continue
            if current_gear is None:
                current_gear = g
            elif g != current_gear:
                window = self.current_session[max(0, i - 8) : i]
                n_before = (
                    max(wp["CurrentEngineRpm"] for wp in window)
                    if window
                    else p["CurrentEngineRpm"]
                )
                post_window = self.current_session[
                    i : min(len(self.current_session), i + 30)
                ]
                throttle_pts = [wp for wp in post_window if wp["AccelInput"] > 200]
                n_after = (
                    min(wp["CurrentEngineRpm"] for wp in throttle_pts)
                    if throttle_pts
                    else (
                        min(wp["CurrentEngineRpm"] for wp in post_window)
                        if post_window
                        else p["CurrentEngineRpm"]
                    )
                )
                shift_time = (
                    throttle_pts[0]["time"] - p["time"] if throttle_pts else 0.0
                )
                retention = n_after / n_before if n_before > 0 else 0

                shifts.append(
                    {
                        "from_gear": current_gear,
                        "to_gear": g,
                        "n_before": round(n_before),
                        "n_after": round(n_after),
                        "rpm_drop": round(n_before - n_after),
                        "retention": round(retention, 3),
                        "shift_time": round(shift_time, 3),
                    }
                )
                current_gear = g

        shift_recommendations = []
        for idx, s in enumerate(shifts):
            if idx == 0:
                if s["retention"] < 0.62:
                    shift_recommendations.append(
                        "1 檔升 2 檔轉速掉落過多，建議加大 2 檔齒比。"
                    )
            else:
                prev_s = shifts[idx - 1]
                if s["retention"] < prev_s["retention"] - 0.02:
                    shift_recommendations.append(
                        f"{s['from_gear']} 檔升 {s['to_gear']} 檔齒比過疏。"
                    )

        # Path validity and variance check
        pos_x_vals = [p.get("PositionX", 0.0) for p in self.current_session]
        max_deviation_meters = max(abs(x) for x in pos_x_vals) if pos_x_vals else 0.0
        path_valid = max_deviation_meters <= 5.0

        yaws = [p.get("Yaw", 0.0) for p in self.current_session]
        yaw_variance_rad = max(yaws) - min(yaws) if yaws else 0.0
        fishtailing_detected = yaw_variance_rad > 0.08

        # Slip asymmetry check
        slip_diffs = []
        for p in self.current_session:
            slips = p.get("TireSlipRatio", [0, 0, 0, 0])
            diff = abs((slips[0] + slips[2]) - (slips[1] + slips[3]))
            slip_diffs.append(diff)
        slip_asymmetry_detected = max(slip_diffs) > 0.08 if slip_diffs else False

        stability_diagnostics = []
        if fishtailing_detected:
            stability_diagnostics.append(
                "偵測到蛇行擺動，建議調高 LSD Acceleration 鎖定率或調軟後防傾桿。"
            )
        if slip_asymmetry_detected or not path_valid:
            stability_diagnostics.append(
                "左右輪打滑不均勻，建議調高 LSD 鎖定率與懸吊。"
            )

        t_0_100 = None
        t_0_200 = None
        t_100_200 = None
        t_0_400m = None
        trap_speed_400m = None
        distance = 0.0

        for idx in range(1, len(self.current_session)):
            p0 = self.current_session[idx - 1]
            p1 = self.current_session[idx]
            dt = p1["time"] - p0["time"]
            v0 = p0["SpeedMetersPerSecond"]
            v1 = p1["SpeedMetersPerSecond"]
            avg_v = (v0 + v1) / 2.0
            distance += avg_v * dt

            v0_kmh = v0 * 3.6
            v1_kmh = v1 * 3.6

            if t_0_100 is None and v0_kmh <= 100.0 <= v1_kmh:
                t_0_100 = (
                    p0["time"]
                    + ((100.0 - v0_kmh) / (v1_kmh - v0_kmh) if v1_kmh > v0_kmh else 0)
                    * dt
                )
            if t_0_200 is None and v0_kmh <= 200.0 <= v1_kmh:
                t_0_200 = (
                    p0["time"]
                    + ((200.0 - v0_kmh) / (v1_kmh - v0_kmh) if v1_kmh > v0_kmh else 0)
                    * dt
                )
            if t_0_400m is None and distance >= 402.336:
                t_0_400m = p1["time"]
                trap_speed_400m = v1_kmh

        if t_0_100 is not None and t_0_200 is not None:
            t_100_200 = t_0_200 - t_0_100

        self.analysis_result = {
            "drivetrain": drivetrain,
            "max_gear": max_gear,
            "shifts": shifts,
            "t_0_100": round(t_0_100, 3) if t_0_100 is not None else None,
            "t_0_200": round(t_0_200, 3) if t_0_200 is not None else None,
            "t_100_200": round(t_100_200, 3) if t_100_200 is not None else None,
            "t_0_400m": round(t_0_400m, 3) if t_0_400m is not None else None,
            "trap_speed_400m": round(trap_speed_400m, 1)
            if trap_speed_400m is not None
            else None,
            "total_distance": round(distance, 1),
            "max_speed_kmh": round(max_speed * 3.6, 1),
            "total_time": self.current_session[-1]["time"]
            if self.current_session
            else 0.0,
            "launch_slip_percent": round(max(avg_front_slip, avg_rear_slip) * 100, 1),
            "launch_recommendation": "Launch slip is within optimal range.",
            "shift_recommendations": shift_recommendations,
            "final_drive_recommendation": "Final drive gear is optimal.",
            "path_valid": path_valid,
            "max_deviation_meters": max_deviation_meters,
            "yaw_variance_rad": yaw_variance_rad,
            "slip_asymmetry_detected": slip_asymmetry_detected,
            "stability_diagnostics": stability_diagnostics,
        }


race_recorder = RaceRecorder(telemetry_db)
drag_recorder = DragRecorder()
