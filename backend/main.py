import asyncio
import json
import logging
import os
import time
from typing import List

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from telemetry_listener import start_udp_listener

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Ensure directories exist
TUNINGS_DIR = os.path.join(os.path.dirname(__file__), "tunings")
CAR_PARAMS_DIR = os.path.join(os.path.dirname(__file__), "car_params")
SESSIONS_DIR = os.path.join(os.path.dirname(__file__), "sessions")
DRAG_SESSIONS_DIR = os.path.join(os.path.dirname(__file__), "drag_sessions")
CAR_DB_PATH = os.path.join(os.path.dirname(__file__), "car_database.json")
os.makedirs(TUNINGS_DIR, exist_ok=True)
os.makedirs(CAR_PARAMS_DIR, exist_ok=True)
os.makedirs(SESSIONS_DIR, exist_ok=True)
os.makedirs(DRAG_SESSIONS_DIR, exist_ok=True)

car_database = {}
if os.path.exists(CAR_DB_PATH):
    try:
        with open(CAR_DB_PATH, "r", encoding="utf-8") as f:
            car_database = json.load(f)
    except Exception as e:
        logger.error(f"Failed to load car database: {e}")

app = FastAPI(title="FH6 Telemetry Tuning Tool API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"Client connected. Total clients: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(
            f"Client disconnected. Total clients: {len(self.active_connections)}"
        )

    async def broadcast_json(self, data: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(data)
            except Exception as e:
                logger.error(f"Error sending data to client: {e}")
                self.disconnect(connection)


manager = ConnectionManager()
telemetry_queue = asyncio.Queue(maxsize=100)

# Memory cache for dyno data to avoid disk I/O every frame
dyno_cache = {}
last_dyno_save_time = time.time()

# --- Settings File Paths & Defaults ---
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SETTINGS_FILE = os.path.join(ROOT_DIR, "settings.json")
LANG_DIR = os.path.join(ROOT_DIR, "lang")

# Ensure directories exist
os.makedirs(LANG_DIR, exist_ok=True)

DEFAULT_SETTINGS = {
    "dyno_recording": True,
    "race_recording": True,
    "language": "en-us",
    "dyno_test_gear": 4,
    "dyno_filter_slip": True,
    "dyno_filter_transients": True,
    "units": {
        "speed": "kmh",
        "weight": "kg",
        "temperature": "C",
        "tirePressure": "bar",
        "boostPressure": "psi",
        "springRate": "kgfmm",
        "rideHeight": "cm",
        "suspensionForce": "kgf",
        "power": "kw",
        "torque": "nm",
    },
}

app_settings = {
    "dyno_recording": True,
    "race_recording": True,
    "language": "en-us",
    "dyno_test_gear": 4,
    "dyno_filter_slip": True,
    "dyno_filter_transients": True,
    "units": dict(DEFAULT_SETTINGS["units"]),
}

# Load settings from settings.json
if os.path.exists(SETTINGS_FILE):
    try:
        with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
            loaded = json.load(f)
            for k, v in loaded.items():
                if k == "units" and isinstance(v, dict):
                    app_settings["units"].update(v)
                else:
                    app_settings[k] = v
        logger.info(f"Loaded settings from {SETTINGS_FILE}")
    except Exception as e:
        logger.error(f"Failed to load settings from {SETTINGS_FILE}: {e}")
else:
    try:
        with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(app_settings, f, indent=4)
        logger.info(f"Created default settings at {SETTINGS_FILE}")
    except Exception as e:
        logger.error(f"Failed to save default settings to {SETTINGS_FILE}: {e}")


# --- Race Telemetry Recorder Class ---
class RaceRecorder:
    def __init__(self):
        self.is_recording = False
        self.manual_mode = False  # Added to support open-world recording
        self.current_session = []
        self.first_timestamp = None
        self.last_sample_time = 0
        self.max_samples = 20000
        self.downsample_interval = 0.1  # 100ms (attempt ~10Hz)
        self.lap_start_times = {}  # {lap_num: relative_time}
        self.last_write_time = 0
        self.total_count = 0
        self.latest_filepath = os.path.join(SESSIONS_DIR, "latest.json")

    def clear(self):
        self.is_recording = False
        self.manual_mode = False
        self.current_session = []
        self.first_timestamp = None
        self.last_sample_time = 0
        self.lap_start_times = {}
        self.last_write_time = 0
        self.total_count = 0

    def _flush_to_disk(self):
        """Append in-memory points to the latest.json file on disk and clear memory."""
        if not self.current_session:
            return

        existing_data = []
        if os.path.exists(self.latest_filepath):
            try:
                with open(self.latest_filepath, "r", encoding="utf-8") as f:
                    existing_data = json.load(f)
                    if not isinstance(existing_data, list):
                        existing_data = []
            except Exception as e:
                logger.error(f"Failed to read existing latest.json for flushing: {e}")
                existing_data = []

        existing_data.extend(self.current_session)

        try:
            with open(self.latest_filepath, "w", encoding="utf-8") as f:
                json.dump(existing_data, f, indent=4)
            self.current_session = []
            self.last_write_time = time.time()
            logger.info(
                f"Flushed telemetry chunk to disk. Total points on disk: {len(existing_data)}"
            )
        except Exception as e:
            logger.error(f"Failed to flush telemetry chunk to disk: {e}")

    def record(self, data: dict):
        if not app_settings.get("race_recording", True):
            if self.is_recording or self.current_session:
                self.clear()
                if os.path.exists(self.latest_filepath):
                    try:
                        os.remove(self.latest_filepath)
                    except Exception:
                        pass
            return

        is_race_on = (data.get("IsRaceOn", 0) == 1) or self.manual_mode

        if is_race_on:
            if not self.is_recording:
                self.clear()
                self.is_recording = True
                if self.manual_mode:
                    self.manual_mode = True  # Keep manual_mode flag True after clear
                # Initialize/clear latest.json on start
                try:
                    with open(self.latest_filepath, "w", encoding="utf-8") as f:
                        json.dump([], f)
                except Exception as e:
                    logger.error(f"Failed to initialize latest.json: {e}")

            now = time.time()
            if now - self.last_sample_time >= self.downsample_interval:
                if self.total_count >= self.max_samples:
                    self.is_recording = False
                    return

                timestamp_ms = data.get("TimestampMS", 0)
                if self.first_timestamp is None:
                    self.first_timestamp = timestamp_ms

                relative_time = (timestamp_ms - self.first_timestamp) / 1000.0
                current_lap = data.get("CurrentLap", 1)

                # Track lap start times
                if current_lap not in self.lap_start_times:
                    self.lap_start_times[current_lap] = relative_time

                # Data projection for memory efficiency
                point = {
                    "time": round(relative_time, 2),
                    "SpeedMetersPerSecond": data.get("SpeedMetersPerSecond", 0.0),
                    "CurrentEngineRpm": data.get("CurrentEngineRpm", 0),
                    "Gear": data.get("Gear", 0),
                    "AccelInput": data.get("AccelInput", 0),
                    "BrakeInput": data.get("BrakeInput", 0),
                    "AccelerationX": data.get("AccelerationX", 0.0),
                    "AccelerationZ": data.get("AccelerationZ", 0.0),
                    "SuspTravel": list(
                        data.get("NormalizedSuspensionTravel", [0.0, 0.0, 0.0, 0.0])
                    ),
                    "TireSlipAngle": list(
                        data.get("TireSlipAngle", [0.0, 0.0, 0.0, 0.0])
                    ),
                    "TireSlipRatio": list(
                        data.get("TireSlipRatio", [0.0, 0.0, 0.0, 0.0])
                    ),
                    "TireTemp": list(data.get("TireTemp", [0.0, 0.0, 0.0, 0.0])),
                    "PositionX": data.get("PositionX", 0.0),
                    "PositionY": data.get("PositionY", 0.0),
                    "PositionZ": data.get("PositionZ", 0.0),
                }
                self.current_session.append(point)
                self.total_count += 1
                self.last_sample_time = now

                # Segmented write: Flush to disk every 30 seconds or 150 points
                if len(self.current_session) >= 150 or (
                    now - self.last_write_time >= 30.0 and self.last_write_time > 0
                ):
                    self._flush_to_disk()
        else:
            if self.is_recording:
                self.save_latest_and_clear(data)

    def save_latest_and_clear(self, last_data: dict):
        """Flush remaining data to disk, truncate post-finish line telemetry, and clear memory."""
        self._flush_to_disk()
        self.is_recording = False

        last_lap_num = last_data.get("CurrentLap", 1)
        last_lap_time = last_data.get("LastLap", 0.0)

        if last_lap_num in self.lap_start_times and last_lap_time > 0.0:
            cutoff_time = self.lap_start_times[last_lap_num] + last_lap_time
            logger.info(
                f"Truncation: Last lap {last_lap_num} started at {self.lap_start_times[last_lap_num]}s, lasted {last_lap_time}s. Cutoff time: {cutoff_time}s"
            )

            if os.path.exists(self.latest_filepath):
                try:
                    with open(self.latest_filepath, "r", encoding="utf-8") as f:
                        all_points = json.load(f)

                    if isinstance(all_points, list):
                        original_count = len(all_points)
                        filtered_points = [
                            p for p in all_points if p.get("time", 0.0) <= cutoff_time
                        ]
                        truncated_count = original_count - len(filtered_points)

                        with open(self.latest_filepath, "w", encoding="utf-8") as f:
                            json.dump(filtered_points, f, indent=4)

                        logger.info(
                            f"Truncated {truncated_count} post-finish line telemetry points. Cleaned session saved."
                        )
                except Exception as e:
                    logger.error(f"Failed to truncate post-finish line telemetry: {e}")
        else:
            logger.info(
                f"No truncation applied. Last lap: {last_lap_num}, Last lap time: {last_lap_time}. Lap start times: {self.lap_start_times}"
            )

        self.clear()


race_recorder = RaceRecorder()


# --- Drag Telemetry Recorder Class ---
class DragRecorder:
    def __init__(self):
        self.status = "idle"  # idle, waiting, recording, finished
        self.current_session = []
        self.first_timestamp = None
        self.low_throttle_start_time = None
        self.low_throttle_duration_limit = 0.8  # 0.8 seconds
        self.max_recording_time = 30.0  # 30 seconds limit
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
        logger.info("Drag Test: Prepared and waiting for launch.")

    def clear(self):
        self.status = "idle"
        self.current_session = []
        self.first_timestamp = None
        self.low_throttle_start_time = None
        self.analysis_result = {}
        self.car_id = 0
        self.car_name = ""
        logger.info("Drag Test: Cleared.")

    def record(self, data: dict):
        if self.status == "idle" or self.status == "finished":
            return

        speed = data.get("SpeedMetersPerSecond", 0.0)
        accel_input = data.get("AccelInput", 0)
        gear = data.get("Gear", 0)
        timestamp_ms = data.get("TimestampMS", 0)
        is_race_on = data.get("IsRaceOn", 0)

        # 1. Waiting for launch
        if self.status == "waiting":
            # Trigger: Speed is very low, gear is >= 1, and throttle is pinned (>= 220)
            if speed < 0.5 and gear >= 1 and accel_input >= 220:
                self.status = "recording"
                self.first_timestamp = timestamp_ms
                self.car_id = data.get("CarOrdinal", 0)
                logger.info("Drag Test: Launch detected! Recording started.")
            else:
                return

        # 2. Recording
        if self.status == "recording":
            time.time()
            relative_time = (timestamp_ms - self.first_timestamp) / 1000.0

            # Record point
            point = {
                "time": round(relative_time, 3),
                "SpeedMetersPerSecond": speed,
                "CurrentEngineRpm": data.get("CurrentEngineRpm", 0.0),
                "Gear": gear,
                "AccelInput": accel_input,
                "BrakeInput": data.get("BrakeInput", 0),
                "TorqueNewtons": data.get("TorqueNewtons", 0.0),
                "PowerWatts": data.get("PowerWatts", 0.0),
                "TireSlipRatio": list(data.get("TireSlipRatio", [0.0, 0.0, 0.0, 0.0])),
                "EngineMaxRpm": data.get("EngineMaxRpm", 8000.0),
                "EngineIdleRpm": data.get("EngineIdleRpm", 1000.0),
                "PositionX": data.get("PositionX", 0.0),
                "PositionZ": data.get("PositionZ", 0.0),
                "Yaw": data.get("Yaw", 0.0),
            }
            self.current_session.append(point)

            # Check Stop Conditions
            stop_recording = False
            reason = ""

            # Condition A: Race is off
            if is_race_on != 1:
                stop_recording = True
                reason = "Race paused/ended"

            # Condition B: Timeout
            elif relative_time > self.max_recording_time:
                stop_recording = True
                reason = "Max recording time reached"

            # Condition C: Throttle release (excluding quick shifts)
            elif accel_input < 150:
                if self.low_throttle_start_time is None:
                    self.low_throttle_start_time = timestamp_ms
                elif (
                    timestamp_ms - self.low_throttle_start_time
                ) / 1000.0 > self.low_throttle_duration_limit:
                    stop_recording = True
                    reason = "Throttle released"
            else:
                self.low_throttle_start_time = None

            # Condition D: Start failure (staying stationary for more than 3 seconds after throttle pinned)
            if not stop_recording and relative_time > 3.0 and speed < 0.1:
                stop_recording = True
                reason = "Launch failed (stationary)"

            if stop_recording:
                self.status = "finished"
                logger.info(
                    f"Drag Test: Recording finished. Reason: {reason}. Total points: {len(self.current_session)}"
                )
                self.analyze()

    def analyze(self):
        if not self.current_session:
            self.analysis_result = {"error": "No data recorded."}
            return

        # Truncate session data after reaching maximum speed (discard subsequent deceleration)
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

        # Determine drivetrain dynamically
        drivetrain = "AWD"
        if avg_rear_slip > 0.08 and avg_front_slip < 0.03:
            drivetrain = "RWD"
        elif avg_front_slip > 0.08 and avg_rear_slip < 0.03:
            drivetrain = "FWD"

        launch_slip = (
            avg_rear_slip
            if drivetrain == "RWD"
            else (
                avg_front_slip
                if drivetrain == "FWD"
                else (avg_front_slip + avg_rear_slip) / 2
            )
        )

        launch_recommendation = ""
        if launch_slip > 0.18:
            launch_recommendation = "起步時驅動輪打滑過度（平均滑移率 {:.1f}%）。這會浪費抓地力，建議將 1 檔齒比調小（往 Speed 方向，數值調低 5%~10%）或調小終傳比，以降低輪胎端的瞬間起步扭力。".format(
                launch_slip * 100
            )
        elif launch_slip < 0.05:
            launch_recommendation = "起步時幾乎沒有打滑（平均滑移率 {:.1f}%）。若起步拉轉速度較慢，說明抓地力未被充分利用，建議將 1 檔齒比調大（往 Acceleration 方向，數值調高 5%~10%）以獲得更強的起步推力。".format(
                launch_slip * 100
            )
        else:
            launch_recommendation = "起步滑移率表現優異（平均滑移率 {:.1f}%），輪胎剛好處於最佳縱向抓地力區間（10%~15%）。請保持目前的 1 檔與終傳比設定。".format(
                launch_slip * 100
            )

        # 2. Shift analysis
        shifts = []
        current_gear = None

        for i, p in enumerate(self.current_session):
            g = p["Gear"]
            if g <= 0:
                continue
            if current_gear is None:
                current_gear = g
            elif g != current_gear:
                # Gear changed from current_gear to g
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

                shift_time = 0.0
                if throttle_pts:
                    shift_time = throttle_pts[0]["time"] - p["time"]

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

        # Analyze shifts step ratios
        shift_recommendations = []
        for idx, s in enumerate(shifts):
            if idx > 0:
                prev_s = shifts[idx - 1]
                if s["retention"] < prev_s["retention"] - 0.02:
                    shift_recommendations.append(
                        "{} 檔升 {} 檔的轉速保留率（{:.1f}%）低於 {} 檔升 {} 檔（{:.1f}%）。這說明 {} 檔齒比相對於前一檔過疏，換檔後轉速掉得太深。建議將 {} 檔齒比調大（往 Acceleration 方向，數值調高 5%~8%）。".format(
                            s["from_gear"],
                            s["to_gear"],
                            s["retention"] * 100,
                            prev_s["from_gear"],
                            prev_s["to_gear"],
                            prev_s["retention"] * 100,
                            s["to_gear"],
                            s["to_gear"],
                        )
                    )
                elif s["retention"] > 0.93:
                    shift_recommendations.append(
                        "{} 檔升 {} 檔的齒比過密（轉速保留率高達 {:.1f}%）。這會導致頻繁換檔且無法充分拉長加速時間，建議將 {} 檔齒比調小（往 Speed 方向，數值調低 5%）。".format(
                            s["from_gear"],
                            s["to_gear"],
                            s["retention"] * 100,
                            s["to_gear"],
                        )
                    )
            else:
                if s["retention"] < 0.62:
                    shift_recommendations.append(
                        "1 檔升 2 檔的轉速掉落過多（保留率僅 {:.1f}%）。建議將 2 檔齒比調大（往 Acceleration 方向，數值調高）以減小轉速落差，避免引擎掉出動力帶。".format(
                            s["retention"] * 100
                        )
                    )

        # 3. Final drive analysis
        last_pt = self.current_session[-1]
        max(p["CurrentEngineRpm"] for p in self.current_session)
        max_gear = max(p["Gear"] for p in self.current_session)
        engine_max_rpm = last_pt.get("EngineMaxRpm", 8000.0)

        final_drive_recommendation = ""
        top_gear_pts = [p for p in self.current_session if p["Gear"] == max_gear]
        top_gear_max_rpm = (
            max(p["CurrentEngineRpm"] for p in top_gear_pts) if top_gear_pts else 0
        )

        if top_gear_max_rpm >= engine_max_rpm - 150:
            final_drive_recommendation = "車輛在最高檔位（{} 檔）達到了轉速紅線（{:.0f} RPM）。這限制了您的最高時速，建議將終傳比（Final Drive）調小（往 Speed 方向，數值降低 5%~10%）以釋放更高的極速潛力。".format(
                max_gear, top_gear_max_rpm
            )
        elif (
            top_gear_max_rpm < engine_max_rpm * 0.72
            and last_pt["SpeedMetersPerSecond"] > 0
        ):
            last_1s_pts = [
                p for p in self.current_session if p["time"] > last_pt["time"] - 1.0
            ]
            avg_accel = 0
            if len(last_1s_pts) > 1:
                dv = (
                    last_1s_pts[-1]["SpeedMetersPerSecond"]
                    - last_1s_pts[0]["SpeedMetersPerSecond"]
                )
                dt = last_1s_pts[-1]["time"] - last_1s_pts[0]["time"]
                avg_accel = dv / dt if dt > 0 else 0

            if avg_accel < 0.5:
                final_drive_recommendation = "測試結束時，最高檔位（{} 檔）的最高轉速僅為 {:.0f} RPM，且車輛已無明顯加速度。這說明終傳比過疏，引擎無法拉高轉速發揮馬力。建議將終傳比（Final Drive）調大（往 Acceleration 方向，數值提高 5%~10%）以提升加速響應。".format(
                    max_gear, top_gear_max_rpm
                )

        if not final_drive_recommendation:
            final_drive_recommendation = (
                "終傳比設定尚屬合理，最高檔位轉速與加速終點匹配良好。"
            )

        # 4. Path Validity & OLS Linear Regression
        x_coords = [p.get("PositionX", 0.0) for p in self.current_session]
        z_coords = [p.get("PositionZ", 0.0) for p in self.current_session]
        n_pts = len(self.current_session)

        max_deviation_meters = 0.0
        path_valid = True

        if n_pts >= 10:
            mean_x = sum(x_coords) / n_pts
            mean_z = sum(z_coords) / n_pts

            num = sum(
                (x_coords[i] - mean_x) * (z_coords[i] - mean_z) for i in range(n_pts)
            )
            den = sum((x_coords[i] - mean_x) ** 2 for i in range(n_pts))

            if den == 0:
                deviations = [abs(x - mean_x) for x in x_coords]
            else:
                a = num / den
                b = mean_z - a * mean_x
                denom = (a**2 + 1) ** 0.5
                deviations = [
                    abs(a * x_coords[i] - z_coords[i] + b) / denom for i in range(n_pts)
                ]

            max_deviation_meters = max(deviations)
            if max_deviation_meters > 3.0:
                path_valid = False

        # 5. Yaw stability (using vector average to handle -pi/pi wrap-around)
        yaws = [p.get("Yaw", 0.0) for p in self.current_session]
        import math

        cos_sum = sum(math.cos(y) for y in yaws)
        sin_sum = sum(math.sin(y) for y in yaws)

        avg_cos = cos_sum / n_pts if n_pts > 0 else 1.0
        avg_sin = sin_sum / n_pts if n_pts > 0 else 0.0
        avg_yaw = math.atan2(avg_sin, avg_cos)

        yaw_devs = []
        for y in yaws:
            diff = math.atan2(math.sin(y - avg_yaw), math.cos(y - avg_yaw))
            yaw_devs.append(diff)

        yaw_variance_rad = max(yaw_devs) - min(yaw_devs) if yaw_devs else 0.0

        # 6. Differential Lock Diagnostics (focusing on asymmetry and fishtailing)
        active_pts = [
            p for p in self.current_session if p["Gear"] >= 1 and p["AccelInput"] > 200
        ]
        stability_diagnostics = []
        avg_slip_diff = 0.0

        if active_pts:
            if drivetrain == "RWD":
                slip_diffs = [
                    abs(p["TireSlipRatio"][2] - p["TireSlipRatio"][3])
                    for p in active_pts
                ]
            elif drivetrain == "FWD":
                slip_diffs = [
                    abs(p["TireSlipRatio"][0] - p["TireSlipRatio"][1])
                    for p in active_pts
                ]
            else:  # AWD
                slip_diffs = [
                    (
                        abs(p["TireSlipRatio"][0] - p["TireSlipRatio"][1])
                        + abs(p["TireSlipRatio"][2] - p["TireSlipRatio"][3])
                    )
                    / 2
                    for p in active_pts
                ]

            avg_slip_diff = sum(slip_diffs) / len(active_pts)

            # Diagnostic A: Open Differential (lock too low) -> one wheel spins, one is static
            if avg_slip_diff > 0.08:
                stability_diagnostics.append(
                    "偵測到驅動輪左右打滑嚴重失衡（平均滑移差值 {:.1f}%）。這通常是由於【差速器加速鎖定率 (Acceleration Lock)】過低所引發的單邊打滑（動力流失至空轉輪）。建議將差速器加速鎖定率調高 10%~20%，以確保兩側驅動輪獲得均衡扭力，維持加速軌跡穩定。".format(
                        avg_slip_diff * 100
                    )
                )

            # Diagnostic B: Over-locked Differential -> Fish-tailing (oscillation in slip difference and yaw)
            elif yaw_variance_rad > 0.08 and avg_slip_diff > 0.03:
                left_leads = 0
                right_leads = 0
                for p in active_pts:
                    if drivetrain == "RWD":
                        l, r = p["TireSlipRatio"][2], p["TireSlipRatio"][3]
                    elif drivetrain == "FWD":
                        l, r = p["TireSlipRatio"][0], p["TireSlipRatio"][1]
                    else:
                        l = (p["TireSlipRatio"][0] + p["TireSlipRatio"][2]) / 2
                        r = (p["TireSlipRatio"][1] + p["TireSlipRatio"][3]) / 2

                    if l > r + 0.02:
                        left_leads += 1
                    elif r > l + 0.02:
                        right_leads += 1

                total_leads = left_leads + right_leads
                if (
                    total_leads > 10
                    and left_leads / total_leads > 0.25
                    and right_leads / total_leads > 0.25
                ):
                    stability_diagnostics.append(
                        "偵測到車尾在加速過程中出現左右搖擺（蛇行，Fish-tailing，偏航角波動達 {:.1f}°）。這通常是由於【差速器加速鎖定率 (Acceleration Lock)】過高，限制了左右輪必要轉速差而產生強烈側向力矩。建議將差速器加速鎖定率降低 10%~15%，以提升行車穩定性。".format(
                            math.degrees(yaw_variance_rad)
                        )
                    )

            if not stability_diagnostics:
                if avg_slip_diff < 0.03 and yaw_variance_rad < 0.04:
                    stability_diagnostics.append(
                        "直行穩定性優異，左右動力分配非常均衡，加速時車身無明顯偏擺。"
                    )
                else:
                    stability_diagnostics.append(
                        "直行穩定性良好。加速過程中車身動態對稱。"
                    )

            if avg_slip_diff > 0.04:
                stability_diagnostics.append(
                    "環境提示：請確保測試直路完全乾燥且平整。如果單側輪胎壓到草地、沙地或路邊，會因為物理路面摩擦力不均而造成嚴重的左右打滑失衡。"
                )
        else:
            stability_diagnostics.append("無足夠的加速區間數據進行穩定性分析。")

        self.car_name = car_database.get(str(self.car_id), {}).get(
            "display_name", f"Car {self.car_id}"
        )

        self.analysis_result = {
            "car_id": str(self.car_id),
            "car_name": self.car_name,
            "drivetrain": drivetrain,
            "max_gear": max_gear,
            "max_speed_kmh": round(
                max(p["SpeedMetersPerSecond"] for p in self.current_session) * 3.6, 1
            )
            if self.current_session
            else 0.0,
            "duration": round(last_pt["time"], 2),
            "launch_slip_percent": round(launch_slip * 100, 1),
            "launch_recommendation": launch_recommendation,
            "shifts": shifts,
            "shift_recommendations": shift_recommendations,
            "final_drive_recommendation": final_drive_recommendation,
            "path_valid": path_valid,
            "max_deviation_meters": round(max_deviation_meters, 2),
            "yaw_variance_rad": round(yaw_variance_rad, 4),
            "stability_diagnostics": stability_diagnostics,
        }


drag_recorder = DragRecorder()

# --- Dyno Collection Constants ---
DYNO_BUCKET_SIZE = 50  # RPM per bucket (denser than 100 for higher resolution)
DYNO_ANOMALY_THRESHOLD = 0.30  # 30% neighbor deviation threshold
DYNO_NEIGHBOR_OFFSETS = [-200, -150, -100, -50, 50, 100, 150, 200]
DYNO_MAX_HISTORY = 50  # Max historical records per RPM bucket


def compute_dyno_value(history):
    """Compute robust value from history using IQR outlier filtering + recency weighting.

    1. If < 4 samples, return max (not enough for statistics)
    2. IQR filter: remove values outside [Q1 - 1.5*IQR, Q3 + 1.5*IQR]
    3. Recency-weighted mean of filtered values (newer entries = higher weight)
    """
    if not history:
        return 0
    n = len(history)
    if n < 4:
        return max(history)

    sorted_vals = sorted(history)
    q1 = sorted_vals[n // 4]
    q3 = sorted_vals[(3 * n) // 4]
    iqr = q3 - q1
    lower_fence = q1 - 1.5 * iqr
    upper_fence = q3 + 1.5 * iqr

    # Recency-weighted computation (history is oldest-first, index 0 = oldest)
    weighted_sum = 0.0
    total_weight = 0.0
    for i, val in enumerate(history):
        if lower_fence <= val <= upper_fence:
            weight = 1.0 + i  # newer = higher weight
            weighted_sum += val * weight
            total_weight += weight

    if total_weight == 0:
        return max(history)  # fallback if all filtered

    return weighted_sum / total_weight


def dyno_is_reasonable(new_val, neighbor_vals, threshold=DYNO_ANOMALY_THRESHOLD):
    """Check if new_val is within threshold of neighbor context."""
    if not neighbor_vals:
        return True  # No neighbors yet, accept any value
    max_neighbor = max(neighbor_vals)
    if max_neighbor <= 0:
        return True
    # Reject if new value exceeds neighbors by more than threshold
    return new_val <= max_neighbor * (1 + threshold)


def load_car_params(car_id: str):
    file_path = os.path.join(CAR_PARAMS_DIR, f"{car_id}.json")
    if os.path.exists(file_path):
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return None


def save_car_params(car_id: str, data: dict):
    file_path = os.path.join(CAR_PARAMS_DIR, f"{car_id}.json")
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4)


@app.on_event("startup")
async def startup_event():
    # Customizable IP and Port
    ip = os.getenv("TELEMETRY_IP", "0.0.0.0")
    port = int(os.getenv("TELEMETRY_PORT", "8000"))

    # Start UDP listener in the background
    asyncio.create_task(start_udp_listener(ip, port, telemetry_queue))
    # Start the broadcast loop
    asyncio.create_task(broadcast_telemetry())


async def broadcast_telemetry():
    global last_dyno_save_time
    logger.info("Broadcasting loop started.")

    # Track gear changes for transient filtering
    prev_gear = 0
    last_gear_change_time = 0.0

    while True:
        data = await telemetry_queue.get()

        # --- Record Race Telemetry ---
        race_recorder.record(data)

        # --- Record Drag Test Telemetry ---
        drag_recorder.record(data)

        # --- Dyno Collection Logic ---
        car_id = str(data.get("CarOrdinal", 0))
        if car_id and car_id != "0":
            # Load existing params into cache (always), auto-create only if race_recording
            if car_id not in dyno_cache:
                params = load_car_params(car_id)
                if params:
                    dyno_cache[car_id] = params
                elif app_settings.get("race_recording", True):
                    # Auto-create default profile
                    params = {
                        "weight": 1500,
                        "weight_distribution": 50,
                        "drivetrain": "RWD",
                        "frontTireWidth": 245,
                        "frontTireAspect": 40,
                        "frontTireRim": 18,
                        "rearTireWidth": 245,
                        "rearTireAspect": 40,
                        "rearTireRim": 18,
                        "adjustability": {
                            "gearbox": "Full",
                            "gears": 6,
                            "suspension": "Race",
                            "arb": "Adjustable",
                        },
                        "dyno_curve": {},
                    }
                    save_car_params(car_id, params)
                    dyno_cache[car_id] = params

            # Only collect dyno data if recording is enabled AND car is in cache
            if app_settings.get("dyno_recording", True) and car_id in dyno_cache:
                # --- WOT (Wide Open Throttle) Filter ---
                accel_input = data.get("AccelInput", 0)
                gear = data.get("Gear", 0)
                clutch_input = data.get("ClutchInput", 0)
                brake_input = data.get("BrakeInput", 0)
                handbrake_input = data.get("HandBrakeInput", 0)
                rpm = data.get("CurrentEngineRpm", 0)

                # Track gear changes
                current_time = time.time()
                if gear != prev_gear:
                    prev_gear = gear
                    last_gear_change_time = current_time

                # 1. Target gear check
                target_gear = app_settings.get("dyno_test_gear", 4)
                gear_match = True
                if target_gear != 0 and gear != target_gear:
                    gear_match = False

                # 2. Exclude braking and Launch Control (handbrake + throttle)
                no_braking = brake_input == 0 and handbrake_input == 0

                # 3. Transient spike filter (ignore data within 0.5s of shifting)
                no_transient = True
                if app_settings.get("dyno_filter_transients", True):
                    if current_time - last_gear_change_time < 0.5:
                        no_transient = False

                # 4. Tire slip filter
                no_slip = True
                if app_settings.get("dyno_filter_slip", True):
                    drivetrain = dyno_cache[car_id].get("drivetrain", "RWD")
                    slip_ratios = data.get("TireSlipRatio", [0.0, 0.0, 0.0, 0.0])

                    SLIP_THRESHOLD = 0.10
                    if drivetrain == "RWD":
                        if (
                            abs(slip_ratios[2]) > SLIP_THRESHOLD
                            or abs(slip_ratios[3]) > SLIP_THRESHOLD
                        ):
                            no_slip = False
                    elif drivetrain == "FWD":
                        if (
                            abs(slip_ratios[0]) > SLIP_THRESHOLD
                            or abs(slip_ratios[1]) > SLIP_THRESHOLD
                        ):
                            no_slip = False
                    else:  # AWD or default
                        if any(abs(s) > SLIP_THRESHOLD for s in slip_ratios):
                            no_slip = False

                if (
                    rpm > 0
                    and accel_input == 255
                    and gear > 0
                    and clutch_input == 0
                    and gear_match
                    and no_braking
                    and no_transient
                    and no_slip
                ):
                    power_hp = data.get("PowerWatts", 0) / 745.7
                    torque_lbft = data.get("TorqueNewtons", 0) * 0.73756

                    bucket_int = int(rpm // DYNO_BUCKET_SIZE) * DYNO_BUCKET_SIZE
                    bucket = str(bucket_int)
                    curve = dyno_cache[car_id].get("dyno_curve", {})

                    existing = curve.get(
                        bucket, {"hp": 0, "torque": 0, "hp_hist": [], "torque_hist": []}
                    )
                    hp_hist = existing.get("hp_hist", [])
                    torque_hist = existing.get("torque_hist", [])

                    # --- Multi-Neighbor Consistency Check (±200 RPM, 8 neighbors) ---
                    neighbor_hp_vals = []
                    neighbor_torque_vals = []
                    for offset in DYNO_NEIGHBOR_OFFSETS:
                        nb_key = str(bucket_int + offset)
                        if nb_key in curve:
                            neighbor_hp_vals.append(curve[nb_key]["hp"])
                            neighbor_torque_vals.append(curve[nb_key]["torque"])

                    updated = False

                    # Add to HP history if reasonable
                    if dyno_is_reasonable(power_hp, neighbor_hp_vals):
                        hp_hist.append(power_hp)
                        if len(hp_hist) > DYNO_MAX_HISTORY:
                            hp_hist = hp_hist[-DYNO_MAX_HISTORY:]
                        existing["hp_hist"] = hp_hist
                        existing["hp"] = compute_dyno_value(hp_hist)
                        updated = True

                    # Add to Torque history if reasonable
                    if dyno_is_reasonable(torque_lbft, neighbor_torque_vals):
                        torque_hist.append(torque_lbft)
                        if len(torque_hist) > DYNO_MAX_HISTORY:
                            torque_hist = torque_hist[-DYNO_MAX_HISTORY:]
                        existing["torque_hist"] = torque_hist
                        existing["torque"] = compute_dyno_value(torque_hist)
                        updated = True

                    if updated:
                        curve[bucket] = existing
                        dyno_cache[car_id]["dyno_curve"] = curve

                        # Periodic save to disk (every 5 seconds max)
                        current_time = time.time()
                        if current_time - last_dyno_save_time > 5.0:
                            save_car_params(car_id, dyno_cache[car_id])
                            last_dyno_save_time = current_time

        if manager.active_connections:
            await manager.broadcast_json(data)

        # Give control back to event loop
        await asyncio.sleep(0.01)


@app.websocket("/ws/telemetry")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)


# --- Car Params API Endpoints ---


@app.get("/api/cars/database")
async def get_car_database():
    return car_database


@app.get("/api/cars/with_params")
async def get_cars_with_params():
    try:
        files = [
            f.replace(".json", "")
            for f in os.listdir(CAR_PARAMS_DIR)
            if f.endswith(".json")
        ]
        result = []
        for car_id in files:
            name = car_database.get(car_id, {}).get("display_name", f"Car {car_id}")
            result.append({"id": car_id, "name": name})
        result.sort(key=lambda x: x["name"])
        return result
    except Exception as e:
        logger.error(f"Failed to list cars with params: {e}")
        return []


@app.get("/api/car_params/{car_id}")
async def get_car_params(car_id: str):
    params = load_car_params(car_id)
    if params:
        return params
    return {"error": "Car parameters not found"}


@app.post("/api/car_params/{car_id}")
async def update_car_params(car_id: str, data: dict):
    # Merge with existing to avoid overwriting dyno curve if not provided
    params = load_car_params(car_id) or {}
    params.update(data)
    save_car_params(car_id, params)
    # Update cache
    dyno_cache[car_id] = params
    return {"message": "Car parameters saved successfully"}


@app.delete("/api/car_params/{car_id}/dyno_curve")
async def clear_dyno_curve(car_id: str):
    """Clear all dyno curve data for a specific car."""
    # Update memory cache
    if car_id in dyno_cache:
        dyno_cache[car_id]["dyno_curve"] = {}
        dyno_cache[car_id].pop("maxHpRpm", None)
        dyno_cache[car_id].pop("maxTorqueRpm", None)
        save_car_params(car_id, dyno_cache[car_id])
    else:
        # Also handle case where data is only on disk
        params = load_car_params(car_id)
        if params:
            params["dyno_curve"] = {}
            params.pop("maxHpRpm", None)
            params.pop("maxTorqueRpm", None)
            save_car_params(car_id, params)
            dyno_cache[car_id] = params
        else:
            return {"error": "Car parameters not found"}
    return {"message": "Dyno curve data cleared successfully"}


# --- Settings API ---


@app.get("/api/settings")
async def get_settings():
    return app_settings


@app.post("/api/settings")
async def update_settings(data: dict):
    if "dyno_recording" in data:
        app_settings["dyno_recording"] = bool(data["dyno_recording"])
    if "race_recording" in data:
        app_settings["race_recording"] = bool(data["race_recording"])
    if "language" in data:
        app_settings["language"] = str(data["language"])
    if "dyno_test_gear" in data:
        app_settings["dyno_test_gear"] = int(data["dyno_test_gear"])
    if "dyno_filter_slip" in data:
        app_settings["dyno_filter_slip"] = bool(data["dyno_filter_slip"])
    if "dyno_filter_transients" in data:
        app_settings["dyno_filter_transients"] = bool(data["dyno_filter_transients"])
    if "units" in data and isinstance(data["units"], dict):
        if "units" not in app_settings:
            app_settings["units"] = {}
        app_settings["units"].update(data["units"])

    # Save to file
    try:
        with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(app_settings, f, indent=4)
        logger.info(f"Saved settings to {SETTINGS_FILE}")
    except Exception as e:
        logger.error(f"Failed to save settings to {SETTINGS_FILE}: {e}")

    return app_settings


# --- Languages API ---


@app.get("/api/languages")
async def list_languages():
    # Always include English (US) which is hardcoded in the frontend
    languages = [{"code": "en-us", "name": "English (US)"}]

    if os.path.exists(LANG_DIR):
        for filename in os.listdir(LANG_DIR):
            if filename.endswith(".json"):
                code = filename[:-5].lower()
                # Skip en-us if it's somehow in the folder to prevent duplication
                if code == "en-us":
                    continue
                file_path = os.path.join(LANG_DIR, filename)
                try:
                    with open(file_path, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        name = data.get("__language_name__", filename[:-5])
                        languages.append({"code": code, "name": name})
                except Exception as e:
                    logger.error(f"Failed to read language file {filename}: {e}")

    return languages


@app.get("/api/languages/{code}")
async def get_language(code: str):
    code = code.lower()
    if code == "en-us":
        return {}

    file_path = os.path.join(LANG_DIR, f"{code}.json")
    if os.path.exists(file_path):
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            return {"error": f"Failed to read language file: {e}"}

    return {"error": "Language not found"}


# --- Tuning API Endpoints ---


@app.get("/api/tunings")
async def list_tunings():
    files = [
        f.replace(".json", "") for f in os.listdir(TUNINGS_DIR) if f.endswith(".json")
    ]
    return {"tunings": files}


@app.get("/api/tunings/{car_id}/{save_name}")
async def get_tuning(car_id: str, save_name: str):
    file_path = os.path.join(TUNINGS_DIR, f"{car_id}-{save_name}.json")
    if os.path.exists(file_path):
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"error": "Tuning not found"}


@app.post("/api/tunings/{car_id}/{save_name}")
async def save_tuning(car_id: str, save_name: str, data: dict):
    file_path = os.path.join(TUNINGS_DIR, f"{car_id}-{save_name}.json")
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4)
    return {"message": "Saved successfully"}


# --- Post-Race Analysis API Endpoints ---


@app.get("/api/analysis/status")
async def get_analysis_status():
    return {
        "isRecording": race_recorder.is_recording,
        "recordingCount": race_recorder.total_count,
    }


@app.get("/api/analysis/data")
async def get_analysis_data():
    if os.path.exists(race_recorder.latest_filepath):
        try:
            with open(race_recorder.latest_filepath, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Failed to read latest.json: {e}")
            return []
    return []


@app.post("/api/analysis/clear")
async def clear_analysis_data():
    race_recorder.clear()
    if os.path.exists(race_recorder.latest_filepath):
        try:
            os.remove(race_recorder.latest_filepath)
        except Exception:
            pass
    return {"message": "Current recording session cleared."}


@app.post("/api/analysis/recorder/start")
async def start_manual_recording():
    race_recorder.clear()
    race_recorder.manual_mode = True
    race_recorder.is_recording = True

    # Initialize/clear latest.json on start
    try:
        with open(race_recorder.latest_filepath, "w", encoding="utf-8") as f:
            json.dump([], f)
        logger.info("Manual recording started.")
        return {"message": "Manual recording started successfully"}
    except Exception as e:
        logger.error(f"Failed to initialize latest.json for manual recording: {e}")
        race_recorder.clear()
        return {"error": f"Failed to start manual recording: {str(e)}"}


@app.post("/api/analysis/recorder/stop")
async def stop_manual_recording():
    if not race_recorder.is_recording or not race_recorder.manual_mode:
        return {"error": "Manual recording is not active"}

    race_recorder.manual_mode = False
    race_recorder.save_latest_and_clear({})
    logger.info("Manual recording stopped and saved.")
    return {"message": "Manual recording stopped and saved successfully"}


@app.get("/api/analysis/sessions")
async def list_saved_sessions():
    try:
        files = [f for f in os.listdir(SESSIONS_DIR) if f.endswith(".json")]
        sessions = []
        for f in files:
            if f == "latest.json":
                continue
            path = os.path.join(SESSIONS_DIR, f)
            stat = os.stat(path)
            sessions.append(
                {"filename": f, "size": stat.st_size, "mtime": stat.st_mtime}
            )
        sessions.sort(key=lambda x: x["mtime"], reverse=True)
        return sessions
    except Exception as e:
        logger.error(f"Failed to list saved sessions: {e}")
        return []


@app.post("/api/analysis/sessions/save")
async def save_session_to_file():
    # Deprecated in favor of save_latest, but kept for compatibility
    return await save_latest_session_to_file()


@app.post("/api/analysis/sessions/save_latest")
async def save_latest_session_to_file():
    if not os.path.exists(race_recorder.latest_filepath):
        return {"error": "No recorded data found"}

    timestamp = int(time.time())
    filename = f"session_{timestamp}.json"
    file_path = os.path.join(SESSIONS_DIR, filename)

    try:
        import shutil

        shutil.copy2(race_recorder.latest_filepath, file_path)
        return {"message": "Session saved successfully", "filename": filename}
    except Exception as e:
        logger.error(f"Failed to save latest session as {filename}: {e}")
        return {"error": f"Failed to save session: {e}"}


@app.get("/api/analysis/sessions/{filename}")
async def load_saved_session(filename: str):
    filename = os.path.basename(filename)
    file_path = os.path.join(SESSIONS_DIR, filename)
    if os.path.exists(file_path):
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            return {"error": f"Failed to read session file: {e}"}
    return {"error": "Session file not found"}


@app.delete("/api/analysis/sessions/{filename}")
async def delete_saved_session(filename: str):
    filename = os.path.basename(filename)
    file_path = os.path.join(SESSIONS_DIR, filename)
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
            return {"message": "Session deleted successfully"}
        except Exception as e:
            return {"error": f"Failed to delete session file: {e}"}
    return {"error": "Session file not found"}


# --- Drag Test API Endpoints ---


@app.post("/api/drag/prepare")
async def drag_prepare():
    drag_recorder.prepare()
    return {"message": "Drag recorder prepared, waiting for launch."}


@app.get("/api/drag/status")
async def drag_status():
    return {
        "status": drag_recorder.status,
        "points_count": len(drag_recorder.current_session),
    }


@app.get("/api/drag/data")
async def drag_data():
    return drag_recorder.current_session


@app.get("/api/drag/analysis")
async def drag_analysis():
    return drag_recorder.analysis_result


@app.post("/api/drag/clear")
async def drag_clear():
    drag_recorder.clear()
    return {"message": "Drag recorder cleared."}


@app.post("/api/drag/sessions/save")
async def drag_save_session():
    if not drag_recorder.current_session:
        return {"error": "No data to save"}

    timestamp = int(time.time())
    filename = f"drag_session_{timestamp}.json"
    file_path = os.path.join(DRAG_SESSIONS_DIR, filename)

    session_payload = {
        "metadata": {
            "filename": filename,
            "timestamp": timestamp,
            "car_id": drag_recorder.analysis_result.get("car_id", "0"),
            "car_name": drag_recorder.analysis_result.get("car_name", "Unknown Car"),
            "max_speed_kmh": drag_recorder.analysis_result.get("max_speed_kmh", 0.0),
            "duration": drag_recorder.analysis_result.get("duration", 0.0),
            "launch_slip_percent": drag_recorder.analysis_result.get(
                "launch_slip_percent", 0.0
            ),
        },
        "data": drag_recorder.current_session,
        "analysis": drag_recorder.analysis_result,
    }

    try:
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(session_payload, f, indent=4)
        return {"message": "Drag session saved successfully", "filename": filename}
    except Exception as e:
        logger.error(f"Failed to save drag session to {filename}: {e}")
        return {"error": f"Failed to save session: {e}"}


@app.get("/api/drag/sessions")
async def list_drag_sessions():
    try:
        files = [f for f in os.listdir(DRAG_SESSIONS_DIR) if f.endswith(".json")]
        sessions = []
        for f in files:
            path = os.path.join(DRAG_SESSIONS_DIR, f)
            try:
                with open(path, "r", encoding="utf-8") as file:
                    payload = json.load(file)
                    metadata = payload.get("metadata", {})
                    sessions.append(metadata)
            except Exception as e:
                logger.error(f"Failed to read drag session metadata from {f}: {e}")

        sessions.sort(key=lambda x: x.get("timestamp", 0), reverse=True)
        return sessions
    except Exception as e:
        logger.error(f"Failed to list drag sessions: {e}")
        return []


@app.get("/api/drag/sessions/{filename}")
async def get_drag_session(filename: str):
    filename = os.path.basename(filename)
    file_path = os.path.join(DRAG_SESSIONS_DIR, filename)
    if os.path.exists(file_path):
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            return {"error": f"Failed to read drag session file: {e}"}
    return {"error": "Drag session file not found"}


@app.delete("/api/drag/sessions/{filename}")
async def delete_drag_session(filename: str):
    filename = os.path.basename(filename)
    file_path = os.path.join(DRAG_SESSIONS_DIR, filename)
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
            return {"message": "Drag session deleted successfully"}
        except Exception as e:
            return {"error": f"Failed to delete drag session file: {e}"}
    return {"error": "Drag session file not found"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8001)
