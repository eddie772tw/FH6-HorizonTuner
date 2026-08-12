import argparse
import math
import os
import re
import sys

# Keep the original process streams available for the Tauri sidecar protocol.
# Frozen builds redirect normal output to backend.log below, so using sys.stdout
# later would prevent the host process from receiving readiness notifications.
SIDECAR_STDOUT = sys.stdout

if getattr(sys, "frozen", False):
    if sys.platform == "win32":
        try:
            os.add_dll_directory(sys._MEIPASS)
        except Exception:
            pass

parser = argparse.ArgumentParser(description="FH6 HorizonTuner Backend Sidecar")
parser.add_argument(
    "--data-dir", type=str, default=None, help="Directory for user persistent data"
)
parsed_args, _ = parser.parse_known_args()


def emit_sidecar_event(event: str, **payload) -> None:
    """Send a machine-readable lifecycle event to the Tauri host process."""
    try:
        message = json.dumps(payload, separators=(",", ":"))
        SIDECAR_STDOUT.write(f"FH6_{event}:{message}\n")
        SIDECAR_STDOUT.flush()
    except Exception:
        # Logging is not configured this early and failure to notify the host
        # must not prevent the backend itself from starting.
        pass


if getattr(sys, "frozen", False):
    RESOURCE_ROOT = sys._MEIPASS
    if parsed_args.data_dir:
        DATA_ROOT = os.path.abspath(parsed_args.data_dir)
    else:
        DATA_ROOT = os.path.dirname(sys.executable)
else:
    RESOURCE_ROOT = os.path.dirname(os.path.abspath(__file__))
    if parsed_args.data_dir:
        DATA_ROOT = os.path.abspath(parsed_args.data_dir)
    else:
        DATA_ROOT = RESOURCE_ROOT

log_dir = os.path.join(DATA_ROOT, "logs")
os.makedirs(log_dir, exist_ok=True)
backend_log_path = os.path.join(log_dir, "backend.log")

if getattr(sys, "frozen", False):
    try:
        backend_log = open(backend_log_path, "a", encoding="utf-8", buffering=1)
        sys.stdout = backend_log
        sys.stderr = backend_log
    except OSError as e:
        if sys.stderr is not None:
            try:
                sys.stderr.write(f"Failed to open backend.log: {e}\n")
            except Exception:
                pass

import asyncio
import gc
import json
import logging
import subprocess
import time
from contextlib import asynccontextmanager
from typing import List

from audio_spectrum import (
    get_audio_spectrum_data,
    stop_audio_spectrum_service,
)
from fastapi import FastAPI, File, Path, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from motec_exporter import export_session_to_motec_csv, parse_motec_csv_to_telemetry
from overlay_metrics import OverlayPerformanceMetrics
from race_recorder import AsyncRacePersistence, RaceRecorder
from system_media import get_system_media_info
from telemetry_listener import (
    DEFAULT_TIRE_ARRAY,
    pack_telemetry_binary,
    start_udp_listener,
)
from telemetry_runtime import (
    AsyncCarParamsCache,
    AsyncCarParamsWriter,
    TelemetryPipelineMetrics,
)
from telemetry_sqlite import TelemetrySQLite


# 自訂 Formatter 以移除日誌中的 ANSI 顏色代碼，維持 backend.log 的純文字格式
class CleanFormatter(logging.Formatter):
    ANSI_ESCAPE = re.compile(r"\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])")

    def format(self, record):
        formatted = super().format(record)
        return self.ANSI_ESCAPE.sub("", formatted)


# 配置根 Logger
root_logger = logging.getLogger()
root_logger.setLevel(logging.INFO)

# 清除所有已有的 handler
for handler in root_logger.handlers[:]:
    root_logger.removeHandler(handler)

# 檔案 Handler
file_handler = logging.FileHandler(backend_log_path, encoding="utf-8")
file_handler.setFormatter(
    CleanFormatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
)
root_logger.addHandler(file_handler)

# 控制台 Handler (只有在非 frozen 開發期才需要)
if not getattr(sys, "frozen", False):
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(
        CleanFormatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    )
    root_logger.addHandler(console_handler)

logger = logging.getLogger(__name__)

# 統一配置唯讀資源目錄與可寫入資料目錄

CAR_DB_PATH = os.path.join(RESOURCE_ROOT, "car_database.json")
RESOURCE_CAR_PARAMS_DIR = os.path.join(RESOURCE_ROOT, "car_params")
RESOURCE_LANG_DIR = (
    os.path.join(RESOURCE_ROOT, "lang")
    if getattr(sys, "frozen", False)
    else os.path.join(os.path.dirname(RESOURCE_ROOT), "lang")
)
RESOURCE_HUD_DIR = (
    os.path.join(RESOURCE_ROOT, "hud_overlay")
    if getattr(sys, "frozen", False)
    else os.path.join(os.path.dirname(RESOURCE_ROOT), "hud_overlay")
)

LANG_DIR = os.path.join(DATA_ROOT, "lang")
TUNINGS_DIR = os.path.join(DATA_ROOT, "tunings")
CAR_PARAMS_DIR = os.path.join(DATA_ROOT, "car_params")
HUD_OVERLAY_DIR = os.path.join(DATA_ROOT, "hud_overlay")
SESSIONS_DIR = os.path.join(DATA_ROOT, "sessions")
DRAG_SESSIONS_DIR = os.path.join(DATA_ROOT, "drag_sessions")
USER_CONFIGS_DIR = os.path.join(DATA_ROOT, "user_configs")
SETTINGS_FILE = os.path.join(DATA_ROOT, "settings.json")

SESSIONS_DB_PATH = os.path.join(SESSIONS_DIR, "telemetry_sessions.db")
ANALYSIS_LAYOUT_FILE = os.path.join(USER_CONFIGS_DIR, "analysis_layout.json")

# Ensure directories exist
os.makedirs(TUNINGS_DIR, exist_ok=True)
os.makedirs(CAR_PARAMS_DIR, exist_ok=True)
os.makedirs(LANG_DIR, exist_ok=True)
os.makedirs(HUD_OVERLAY_DIR, exist_ok=True)
os.makedirs(SESSIONS_DIR, exist_ok=True)
os.makedirs(DRAG_SESSIONS_DIR, exist_ok=True)
os.makedirs(USER_CONFIGS_DIR, exist_ok=True)

# 完整複製內建語系檔至 DATA_ROOT/lang/ 供使用者自行維護
if os.path.exists(RESOURCE_LANG_DIR):
    import shutil

    for f_name in os.listdir(RESOURCE_LANG_DIR):
        if f_name.endswith(".json"):
            src = os.path.join(RESOURCE_LANG_DIR, f_name)
            dst = os.path.join(LANG_DIR, f_name)
            if not os.path.exists(dst):
                try:
                    shutil.copy2(src, dst)
                except Exception:
                    pass

telemetry_db = TelemetrySQLite(SESSIONS_DB_PATH)

car_database = {}
if os.path.exists(CAR_DB_PATH):
    try:
        with open(CAR_DB_PATH, "r", encoding="utf-8") as f:
            car_database = json.load(f)
    except Exception as e:
        logger.error(f"Failed to load car database: {e}")


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.active_binary_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket, is_binary: bool = False):
        await websocket.accept()
        if is_binary:
            self.active_binary_connections.append(websocket)
            logger.info(
                f"Binary Client connected. Total binary clients: {len(self.active_binary_connections)}"
            )
        else:
            self.active_connections.append(websocket)
            logger.info(
                f"Client connected. Total clients: {len(self.active_connections)}"
            )

    def disconnect(self, websocket: WebSocket, is_binary: bool = False):
        if is_binary:
            if websocket in self.active_binary_connections:
                self.active_binary_connections.remove(websocket)
            logger.info(
                f"Binary Client disconnected. Total binary clients: {len(self.active_binary_connections)}"
            )
        else:
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
                self.disconnect(connection, is_binary=False)

    async def broadcast_binary(self, data: bytes):
        for connection in self.active_binary_connections:
            try:
                await connection.send_bytes(data)
            except Exception as e:
                logger.error(f"Error sending binary data to client: {e}")
                self.disconnect(connection, is_binary=True)


telemetry_manager = ConnectionManager()
overlay_manager = ConnectionManager()
telemetry_queue = asyncio.Queue(maxsize=10)
telemetry_pipeline_metrics = TelemetryPipelineMetrics()
overlay_performance_metrics = OverlayPerformanceMetrics()

current_udp_transport = None
current_udp_ip_port = (None, None)
backend_port = 8000
overlay_process = None


app = FastAPI(title="FH6 Telemetry Tuning Tool API")

IGNORED_HUD_DIRS = {
    "shared",
    "assets",
    "telemetry",
    "common",
    "fonts",
    "css",
    "js",
    "__pycache__",
}

if getattr(sys, "frozen", False):
    builtin_hud_path = os.path.join(RESOURCE_ROOT, "hud_overlay")
    user_hud_path = os.path.join(DATA_ROOT, "hud_overlay")

    if os.path.exists(builtin_hud_path):
        app.mount(
            "/hud", StaticFiles(directory=builtin_hud_path, html=True), name="hud"
        )
    if os.path.exists(user_hud_path):
        app.mount(
            "/hud_user",
            StaticFiles(directory=user_hud_path, html=True),
            name="hud_user",
        )
else:
    hud_overlay_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "hud_overlay")
    )
    if os.path.exists(hud_overlay_path):
        app.mount(
            "/hud", StaticFiles(directory=hud_overlay_path, html=True), name="hud"
        )


app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^(https?://(localhost|127\.0\.0\.1|tauri\.localhost)(:\d+)?|tauri://localhost)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Memory cache for dyno data to avoid disk I/O every frame
dyno_cache = {}
last_dyno_save_time = time.time()

# --- Settings File Paths & Defaults ---
# 使用最上方統一宣告的路徑與設定，免重複定義。

DEFAULT_SETTINGS = {
    "dyno_recording": False,
    "race_recording": False,
    "language": "zh-tw",
    "dyno_test_gear": 4,
    "dyno_filter_slip": True,
    "dyno_filter_transients": True,
    "telemetry_ip": "0.0.0.0",
    "telemetry_port": 8000,
    "units": {
        "speed": "kmh",
        "weight": "kg",
        "temperature": "C",
        "tirePressure": "psi",
        "boostPressure": "bar",
        "springRate": "kgfmm",
        "rideHeight": "cm",
        "suspensionForce": "kgf",
        "power": "hp",
        "torque": "nm",
    },
    "theme": {
        "mode": "dark",
        "primaryColor": "#00f0ff",
        "secondaryColor": "#ff003c",
        "accentColor": "#7000ff",
        "customCSS": "",
        "slots": [],
    },
}

app_settings = {
    "dyno_recording": False,
    "race_recording": False,
    "language": "zh-tw",
    "dyno_test_gear": 4,
    "dyno_filter_slip": True,
    "dyno_filter_transients": True,
    "telemetry_ip": "0.0.0.0",
    "telemetry_port": 8000,
    "units": dict(DEFAULT_SETTINGS["units"]),
    "theme": dict(DEFAULT_SETTINGS["theme"]),
}

# Load settings from settings.json
if os.path.exists(SETTINGS_FILE):
    try:
        with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
            loaded = json.load(f)
            for k, v in loaded.items():
                if k == "units" and isinstance(v, dict):
                    app_settings["units"].update(v)
                elif k == "theme" and isinstance(v, dict):
                    app_settings["theme"].update(v)
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


# --- Race Telemetry Recorder ---
race_persistence = AsyncRacePersistence(telemetry_db)
race_recorder = RaceRecorder(race_persistence, app_settings, car_database)


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
                "TireSlipRatio": list(data.get("TireSlipRatio", DEFAULT_TIRE_ARRAY)),
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
    car_id = os.path.basename(car_id)
    file_path = os.path.join(CAR_PARAMS_DIR, f"{car_id}.json")
    if os.path.exists(file_path):
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    res_path = os.path.join(RESOURCE_CAR_PARAMS_DIR, f"{car_id}.json")
    if os.path.exists(res_path):
        with open(res_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return None


def save_car_params(car_id: str, data: dict):
    car_id = os.path.basename(car_id)
    file_path = os.path.join(CAR_PARAMS_DIR, f"{car_id}.json")
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4)


def create_default_car_params() -> dict:
    """Create the initial dyno profile without performing persistence work."""
    return {
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


car_params_cache = AsyncCarParamsCache(load_car_params)
car_params_writer = AsyncCarParamsWriter(save_car_params)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global current_udp_transport, current_udp_ip_port

    # Customizable IP and Port
    ip = os.getenv("TELEMETRY_IP", "0.0.0.0")
    port = int(os.getenv("TELEMETRY_PORT", "8000"))

    # Bind the UDP listener before exposing the HTTP server. Previously this
    # ran as an unobserved task, allowing uvicorn to start even when a stale
    # sidecar still owned the telemetry port.
    current_udp_transport = await start_udp_listener(ip, port, telemetry_queue)
    current_udp_ip_port = (ip, port)
    race_persistence.start()
    background_tasks = [
        asyncio.create_task(broadcast_telemetry()),
        asyncio.create_task(broadcast_overlay_state()),
    ]
    try:
        yield
    finally:
        current_udp_transport.close()
        current_udp_transport = None
        for task in background_tasks:
            task.cancel()
        await asyncio.gather(*background_tasks, return_exceptions=True)
        await car_params_writer.flush()
        await car_params_cache.cancel_pending()
        await race_persistence.shutdown()


app.router.lifespan_context = lifespan


async def broadcast_overlay_state():
    logger.info("Overlay state broadcasting loop started.")
    last_media_time = 0.0
    last_audio_poll = 0.0
    last_audio_sequence = -1
    last_audio_state = None
    last_media_fingerprint = None

    while True:
        try:
            # Only process if there are active connections
            if overlay_manager.active_connections:
                current_time = time.time()

                # Audio capture produces samples at roughly 30Hz; polling faster
                # only repeats the same snapshot and creates transport work.
                if current_time - last_audio_poll >= 1.0 / 30.0:
                    last_audio_poll = current_time
                    overlay_performance_metrics.increment("audioPolls")
                    with overlay_performance_metrics.measure("audioSnapshot"):
                        audio_data = await get_audio_spectrum_data()
                    if audio_data:
                        audio_sequence = audio_data.get("sequence", 0)
                        audio_state = audio_data.get("state", "unavailable")
                        is_new_audio_state = (
                            audio_sequence != last_audio_sequence
                            or audio_state != last_audio_state
                        )
                        if is_new_audio_state:
                            last_audio_sequence = audio_sequence
                            last_audio_state = audio_state
                            overlay_performance_metrics.increment("audioPublishes")
                            with overlay_performance_metrics.measure("audioBroadcast"):
                                await overlay_manager.broadcast_json(
                                    {"type": "hud:audio", "data": audio_data}
                                )
                        else:
                            overlay_performance_metrics.increment("audioDuplicates")

                # Fetch media info every 1000ms
                if current_time - last_media_time >= 1.0:
                    overlay_performance_metrics.increment("mediaPolls")
                    with overlay_performance_metrics.measure("mediaSnapshot"):
                        media_data = await get_system_media_info()
                    if media_data:
                        media_fingerprint = (
                            media_data.get("title"),
                            media_data.get("artist"),
                            media_data.get("status"),
                            media_data.get("state"),
                            media_data.get("has_media"),
                        )
                        if media_fingerprint != last_media_fingerprint:
                            last_media_fingerprint = media_fingerprint
                            overlay_performance_metrics.increment("mediaPublishes")
                            with overlay_performance_metrics.measure("mediaBroadcast"):
                                await overlay_manager.broadcast_json(
                                    {"type": "hud:media", "data": media_data}
                                )
                        else:
                            overlay_performance_metrics.increment("mediaDuplicates")
                    last_media_time = current_time
            else:
                stop_audio_spectrum_service()
                last_audio_sequence = -1
                last_audio_state = None
                last_media_fingerprint = None

            # 60Hz loop interval (approx 16.6ms) - we run it at roughly 16-20ms to allow smooth audio
            await asyncio.sleep(0.016)

        except Exception as e:
            logger.error(f"Error in broadcast_overlay_state: {e}")
            await asyncio.sleep(1.0)


async def broadcast_telemetry():
    global last_dyno_save_time
    logger.info("Broadcasting loop started.")

    # Track gear changes for transient filtering
    prev_gear = 0
    last_gear_change_time = 0.0

    while True:
        data = await telemetry_queue.get()
        frame_started_at = time.perf_counter()
        telemetry_pipeline_metrics.observe_queue_depth(telemetry_queue.qsize())

        # --- Record Race Telemetry ---
        with telemetry_pipeline_metrics.measure_stage("recorders"):
            race_recorder.record(data)

            # --- Record Drag Test Telemetry ---
            drag_recorder.record(data)

        # --- Dyno Collection Logic ---
        dyno_stage_started_at = time.perf_counter()
        car_id = str(data.get("CarOrdinal", 0))
        if car_id and car_id != "0":
            # The first disk read is deliberately deferred. The current frame
            # continues without dyno collection until the profile is ready.
            profile_lookup = car_params_cache.resolve(dyno_cache, car_id)
            if profile_lookup.state == "missing" and app_settings.get(
                "race_recording", True
            ):
                params = create_default_car_params()
                dyno_cache[car_id] = params
                car_params_writer.schedule(car_id, params)

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
                    slip_ratios = data.get("TireSlipRatio", DEFAULT_TIRE_ARRAY)

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
                            car_params_writer.schedule(car_id, dyno_cache[car_id])
                            last_dyno_save_time = current_time

        # --- Cache capacity limiting for dyno_cache (LRU/Cap to 20) ---
        if len(dyno_cache) > 20:
            # Pop the oldest inserted key
            oldest_key = next(iter(dyno_cache))
            dyno_cache.pop(oldest_key, None)
        telemetry_pipeline_metrics.record_stage(
            "dyno", time.perf_counter() - dyno_stage_started_at
        )

        # --- Periodic GC (every 60 seconds) ---
        current_time = time.time()
        static_gc_state = getattr(broadcast_telemetry, "last_gc_time", 0.0)
        if current_time - static_gc_state > 60.0:
            asyncio.create_task(asyncio.to_thread(gc.collect))
            broadcast_telemetry.last_gc_time = current_time

        # --- Backpressure: If queue is filling up, drop old frames ---
        # Note: telemetry_queue size is 10. If it gets larger than 5, we clear all but the latest.
        if telemetry_queue.qsize() > 5:
            dropped_frames = 0
            try:
                while telemetry_queue.qsize() > 1:
                    telemetry_queue.get_nowait()
                    dropped_frames += 1
            except asyncio.QueueEmpty:
                pass
            telemetry_pipeline_metrics.record_dropped_frames(dropped_frames)

        # --- Broadcast telemetry ---
        with telemetry_pipeline_metrics.measure_stage("broadcast"):
            if telemetry_manager.active_connections:
                await telemetry_manager.broadcast_json(data)

            if telemetry_manager.active_binary_connections:
                binary_data = pack_telemetry_binary(data)
                await telemetry_manager.broadcast_binary(binary_data)

        telemetry_pipeline_metrics.record_frame(time.perf_counter() - frame_started_at)

        # Yield control immediately back to event loop without forced delay
        await asyncio.sleep(0)


# Initialize static variable for GC tracking
broadcast_telemetry.last_gc_time = time.time()


@app.get("/api/diagnostics/telemetry-pipeline")
async def get_telemetry_pipeline_metrics():
    """Expose bounded telemetry health metrics for diagnostics tooling."""
    snapshot = telemetry_pipeline_metrics.snapshot(
        queue_depth=telemetry_queue.qsize(),
        json_clients=len(telemetry_manager.active_connections),
        binary_clients=len(telemetry_manager.active_binary_connections),
    )
    snapshot["profilePersistence"] = {
        "pendingWrites": car_params_writer.pending_write_count,
        "failedWrites": car_params_writer.failed_writes,
    }
    snapshot["raceRecorderPersistence"] = race_persistence.snapshot()
    return snapshot


@app.get("/api/diagnostics/overlay")
async def get_overlay_performance_metrics():
    """Expose bounded overlay diagnostics and the active VFD renderer mode."""
    return overlay_performance_metrics.snapshot(
        active_clients=len(overlay_manager.active_connections),
        render_mode=VFD_RENDER_MODE,
    )


@app.websocket("/ws/telemetry")
async def websocket_endpoint(websocket: WebSocket):
    await telemetry_manager.connect(websocket, is_binary=False)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        telemetry_manager.disconnect(websocket, is_binary=False)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        telemetry_manager.disconnect(websocket, is_binary=False)


@app.websocket("/ws/telemetry/binary")
async def websocket_binary_endpoint(websocket: WebSocket):
    await telemetry_manager.connect(websocket, is_binary=True)
    try:
        while True:
            await websocket.receive_bytes()
    except WebSocketDisconnect:
        telemetry_manager.disconnect(websocket, is_binary=True)
    except Exception as e:
        logger.error(f"Binary WebSocket error: {e}")
        telemetry_manager.disconnect(websocket, is_binary=True)


@app.websocket("/ws/overlay")
async def websocket_overlay_endpoint(websocket: WebSocket):
    await overlay_manager.connect(websocket, is_binary=False)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        overlay_manager.disconnect(websocket, is_binary=False)
    except Exception as e:
        logger.error(f"Overlay WebSocket error: {e}")
        overlay_manager.disconnect(websocket, is_binary=False)


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
    params = dyno_cache.get(car_id) or load_car_params(car_id)
    if params:
        return params
    return {"error": "Car parameters not found"}


@app.post("/api/car_params/{car_id}")
async def update_car_params(car_id: str, data: dict):
    # Merge with existing to avoid overwriting dyno curve if not provided
    params = dyno_cache.get(car_id) or load_car_params(car_id) or {}
    params.update(data)
    dyno_cache[car_id] = params
    car_params_cache.mark_ready(car_id)
    car_params_writer.schedule(car_id, params)
    return {"message": "Car parameters saved successfully"}


@app.delete("/api/car_params/{car_id}/dyno_curve")
async def clear_dyno_curve(car_id: str):
    """Clear all dyno curve data for a specific car."""
    # Update memory cache
    if car_id in dyno_cache:
        dyno_cache[car_id]["dyno_curve"] = {}
        dyno_cache[car_id].pop("maxHpRpm", None)
        dyno_cache[car_id].pop("maxTorqueRpm", None)
        car_params_cache.mark_ready(car_id)
        car_params_writer.schedule(car_id, dyno_cache[car_id])
    else:
        # Also handle case where data is only on disk
        params = load_car_params(car_id)
        if params:
            params["dyno_curve"] = {}
            params.pop("maxHpRpm", None)
            params.pop("maxTorqueRpm", None)
            dyno_cache[car_id] = params
            car_params_cache.mark_ready(car_id)
            car_params_writer.schedule(car_id, params)
        else:
            return {"error": "Car parameters not found"}
    return {"message": "Dyno curve data cleared successfully"}


# --- Settings API ---


@app.get("/api/settings")
async def get_settings():
    return app_settings


@app.post("/api/settings")
async def update_settings(data: dict):
    global current_udp_transport, current_udp_ip_port
    theme_updated = "theme" in data and isinstance(data["theme"], dict)

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

    # 處理 telemetry_ip 與 telemetry_port
    new_ip = data.get("telemetry_ip", app_settings.get("telemetry_ip", "0.0.0.0"))
    new_port = int(data.get("telemetry_port", app_settings.get("telemetry_port", 8000)))

    ip_port_changed = (new_ip != current_udp_ip_port[0]) or (
        new_port != current_udp_ip_port[1]
    )

    app_settings["telemetry_ip"] = new_ip
    app_settings["telemetry_port"] = new_port

    if "units" in data and isinstance(data["units"], dict):
        if "units" not in app_settings:
            app_settings["units"] = {}
        app_settings["units"].update(data["units"])

    if "theme" in data and isinstance(data["theme"], dict):
        if "theme" not in app_settings:
            app_settings["theme"] = {}
        app_settings["theme"].update(data["theme"])

    # Save to file asynchronously to avoid blocking the event loop
    def _save_settings():
        with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(app_settings, f, indent=4)

    try:
        await asyncio.to_thread(_save_settings)
        logger.info(f"Saved settings to {SETTINGS_FILE}")
    except Exception as e:
        logger.error(f"Failed to save settings to {SETTINGS_FILE}: {e}")

    if theme_updated:
        hud_data = DEFAULT_HUD_CONFIG
        if os.path.exists(HUD_CONFIG_FILE):
            try:
                with open(HUD_CONFIG_FILE, "r", encoding="utf-8") as f:
                    hud_data = json.load(f)
            except Exception as e:
                logger.error(f"Failed to load HUD config after theme update: {e}")
        await overlay_manager.broadcast_json(
            {"type": "hud:config", "data": hud_config_with_gui_theme(hud_data)}
        )

    # 若 IP 或 Port 變更，在執行期動態重啟 UDP listener
    if ip_port_changed:
        logger.info(
            f"Forza UDP Telemetry endpoint changed to {new_ip}:{new_port}. Restarting listener..."
        )
        if current_udp_transport:
            try:
                current_udp_transport.close()
            except Exception:
                pass
            current_udp_transport = None
        try:
            current_udp_transport = await start_udp_listener(
                new_ip, new_port, telemetry_queue
            )
            current_udp_ip_port = (new_ip, new_port)
        except Exception as e:
            logger.error(
                f"Failed to restart UDP Telemetry listener on {new_ip}:{new_port}: {e}"
            )

    return app_settings


# --- Languages API ---


@app.get("/api/languages")
async def list_languages():
    # Always include English (US) which is hardcoded in the frontend
    languages = [{"code": "en-us", "name": "English (US)"}]

    if os.path.exists(LANG_DIR):
        for filename in os.listdir(LANG_DIR):
            if filename.endswith(".json") and filename.lower() != "iso639.json":
                code = filename[:-5].lower()
                # Skip en-us if it's somehow in the folder to prevent duplication
                if code == "en-us":
                    continue
                file_path = os.path.join(LANG_DIR, filename)
                try:
                    with open(file_path, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        if isinstance(data, dict):
                            name = data.get("__language_name__", filename[:-5])
                            languages.append({"code": code, "name": name})
                except Exception as e:
                    logger.error(f"Failed to read language file {filename}: {e}")

    return languages


@app.get("/api/languages/{code}")
async def get_language(code: str = Path(pattern="^[a-zA-Z0-9-]+$")):
    code = code.lower()
    if code == "en-us":
        return {}

    file_path = os.path.join(LANG_DIR, f"{code}.json")
    if os.path.exists(file_path):
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Failed to read language file: {e}")
            return {"error": "Failed to read language file"}

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
    car_id = os.path.basename(car_id)
    save_name = os.path.basename(save_name)
    file_path = os.path.join(TUNINGS_DIR, f"{car_id}-{save_name}.json")
    if os.path.exists(file_path):
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"error": "Tuning not found"}


@app.post("/api/tunings/{car_id}/{save_name}")
async def save_tuning(car_id: str, save_name: str, data: dict):
    car_id = os.path.basename(car_id)
    save_name = os.path.basename(save_name)
    file_path = os.path.join(TUNINGS_DIR, f"{car_id}-{save_name}.json")
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4)
    return {"message": "Saved successfully"}


# --- Post-Race Analysis API Endpoints ---


@app.get("/api/analysis/config")
async def get_analysis_config():
    if os.path.exists(ANALYSIS_LAYOUT_FILE):
        try:
            with open(ANALYSIS_LAYOUT_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Failed to read analysis layout config: {e}")
    # Default layout configuration
    return {
        "activeMetric": "speed",
        "customMathChannels": [],
        "enabledCharts": [
            "track_map",
            "inputs_gear",
            "gg_diagram",
            "slip_scatter",
            "susp_dist",
            "temp_dist",
        ],
    }


@app.post("/api/analysis/config")
async def save_analysis_config(config: dict):
    try:
        with open(ANALYSIS_LAYOUT_FILE, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=4)
        return {"message": "Analysis layout saved successfully"}
    except Exception as e:
        logger.error(f"Failed to save analysis layout: {e}")
        return {"error": "Failed to save analysis layout"}


@app.get("/api/analysis/status")
async def get_analysis_status():
    return {
        "isRecording": race_recorder.is_recording,
        "recordingCount": race_recorder.total_count,
        "currentSessionId": race_recorder.current_session_id,
    }


@app.get("/api/analysis/data")
async def get_current_analysis_data(lap: int = 0):
    if race_recorder.current_session_id:
        return telemetry_db.get_telemetry_points(
            race_recorder.current_session_id, lap_number=lap if lap > 0 else None
        )
    # Return latest recorded session if any
    sessions = telemetry_db.list_all_sessions()
    if sessions:
        latest_id = sessions[0]["session_id"]
        return telemetry_db.get_telemetry_points(
            latest_id, lap_number=lap if lap > 0 else None
        )
    return []


@app.post("/api/analysis/clear")
async def clear_analysis_data():
    race_recorder.clear()
    return {"message": "Current recording session cleared."}


@app.post("/api/analysis/recorder/start")
async def start_manual_recording():
    race_persistence.start()
    session_id = race_recorder.start_manual()
    await race_persistence.flush()
    logger.info("Manual recording started.")
    return {
        "message": "Manual recording started successfully",
        "sessionId": session_id,
    }


@app.post("/api/analysis/recorder/stop")
async def stop_manual_recording():
    if not race_recorder.is_recording or not race_recorder.manual_mode:
        return {"error": "Manual recording is not active"}

    race_recorder.save_latest_and_clear()
    await race_persistence.flush()
    logger.info("Manual recording stopped and saved.")
    return {"message": "Manual recording stopped and saved successfully"}


@app.get("/api/analysis/sessions")
async def list_saved_sessions():
    try:
        raw_sessions = telemetry_db.list_all_sessions()
        sessions = []
        for s in raw_sessions:
            sessions.append(
                {
                    "filename": s["session_id"],
                    "session_id": s["session_id"],
                    "car_name": s["car_name"],
                    "total_laps": s["total_laps"],
                    "best_lap_time": s["best_lap_time"],
                    "total_distance": s["total_distance"],
                    "mtime": s["start_time"],
                    "size": 0,
                }
            )
        return sessions
    except Exception as e:
        logger.error(f"Failed to list saved sessions from SQLite: {e}")
        return []


@app.get("/api/analysis/sessions/{session_id}/laps")
async def get_session_laps(session_id: str):
    return telemetry_db.get_session_laps(session_id)


@app.get("/api/analysis/sessions/{session_id}")
async def load_saved_session(session_id: str, lap: int = 0):
    try:
        data = telemetry_db.get_telemetry_points(
            session_id, lap_number=lap if lap > 0 else None
        )
        if data:
            return data
    except Exception as e:
        logger.error(f"Failed to read session telemetry: {e}")
        return {"error": "Failed to read session telemetry"}
    return []


@app.delete("/api/analysis/sessions/{session_id}")
async def delete_saved_session(session_id: str):
    try:
        success = telemetry_db.delete_session(session_id)
        if success:
            return {"message": "Session deleted successfully"}
    except Exception as e:
        logger.error(f"Failed to delete session: {e}")
        return {"error": "Failed to delete session"}
    return {"error": "Session not found"}


@app.get("/api/analysis/export/motec/{session_id}")
async def export_motec_session(session_id: str):
    sessions = telemetry_db.list_all_sessions()
    session_meta = next((s for s in sessions if s["session_id"] == session_id), None)
    if not session_meta:
        return {"error": "Session not found"}

    points = telemetry_db.get_telemetry_points(session_id)
    if not points:
        return {"error": "No telemetry data points found in session"}

    export_filename = os.path.basename(f"{session_id}_motec.csv")
    export_filepath = os.path.join(SESSIONS_DIR, export_filename)

    success = export_session_to_motec_csv(session_meta, points, export_filepath)
    if success and os.path.exists(export_filepath):
        return FileResponse(
            export_filepath, filename=export_filename, media_type="text/csv"
        )
    return {"error": "Failed to generate MoTeC CSV export"}


@app.post("/api/analysis/import/motec")
async def import_motec_session(file: UploadFile = File(...)):
    import shutil
    import tempfile

    try:
        # Save uploaded file to a temporary location
        with tempfile.NamedTemporaryFile(delete=False, suffix=".csv") as tmp:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = tmp.name

        # Parse the CSV file
        meta, data = parse_motec_csv_to_telemetry(tmp_path, parse_data=True)

        # Clean up the temporary file
        os.remove(tmp_path)

        if not data:
            return {"error": "Failed to parse MoTeC CSV or file is empty"}

        return {
            "metadata": {
                "filename": file.filename,
                "car_name": meta.get("car_name", "Unknown Vehicle"),
                "session_id": meta.get("session_id", file.filename),
            },
            "data": data,
        }
    except Exception as e:
        logger.error(f"Failed to import MoTeC CSV: {e}")
        return {"error": "Failed to import MoTeC CSV"}


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
        return {"error": "Failed to save session"}


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
            logger.error(f"Failed to read drag session file: {e}")
            return {"error": "Failed to read drag session file"}
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
            logger.error(f"Failed to delete drag session file: {e}")
            return {"error": "Failed to delete drag session file"}
    return {"error": "Drag session file not found"}


LOG_LINE_PATTERN = re.compile(
    r"^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3}) \[(\w+)\] ([\w\.-]+): (.*)$"
)


@app.get("/api/logs")
async def get_logs(level: str = None, limit: int = 300):
    if not os.path.exists(backend_log_path):
        return {"logs": []}

    try:
        with open(backend_log_path, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()
    except Exception as e:
        logger.error(f"Failed to read log file: {e}")
        return {"error": "Failed to read log file"}

    parsed_logs = []
    current_entry = None

    for line in lines:
        line_str = line.rstrip("\n")
        match = LOG_LINE_PATTERN.match(line_str)
        if match:
            if current_entry:
                parsed_logs.append(current_entry)

            timestamp, log_level, logger_name, message = match.groups()
            current_entry = {
                "timestamp": timestamp,
                "level": log_level.upper(),
                "logger": logger_name,
                "message": message,
            }
        else:
            # 如果不匹配，可能是 Traceback 或是多行日誌，併入上一行
            if current_entry:
                current_entry["message"] += "\n" + line_str
            else:
                # 孤立的行，直接作為普通日誌，預設為 INFO
                current_entry = {
                    "timestamp": "",
                    "level": "INFO",
                    "logger": "stdout",
                    "message": line_str,
                }

    if current_entry:
        parsed_logs.append(current_entry)

    # 篩選級別
    if level and level.upper() != "ALL":
        target_level = level.upper()
        parsed_logs = [log for log in parsed_logs if log["level"] == target_level]

    # 取最新的 limit 條
    return {"logs": parsed_logs[-limit:]}


@app.delete("/api/logs")
async def clear_logs():
    if os.path.exists(backend_log_path):
        try:
            with open(backend_log_path, "w", encoding="utf-8") as f:
                f.write("")
            return {"message": "Logs cleared successfully"}
        except Exception as e:
            logger.error(f"Failed to clear logs: {e}")
            return {"error": "Failed to clear logs"}
    return {"message": "Log file does not exist"}


# --- Overlay API ---
# 註記：目前前端已移除 Dashboard Overlay 分頁與相關開發，但後端以下之 API 接入點仍予以保留，作為未來可能重啟或擴展開發之預留接口。
LAYOUT_FILE = os.path.join(DATA_ROOT, "layout.json")
DEFAULT_LAYOUT = {
    "modules": {
        "tireTemp": {"visible": True, "x": 50, "y": 50, "w": 250, "h": 180},
        "suspTravel": {"visible": True, "x": 320, "y": 50, "w": 200, "h": 180},
        "slipLimit": {"visible": True, "x": 540, "y": 50, "w": 220, "h": 220},
        "gForce": {"visible": True, "x": 50, "y": 250, "w": 220, "h": 220},
        "dashboard": {"visible": True, "x": 290, "y": 250, "w": 470, "h": 120},
    }
}


HUD_CONFIG_FILE = os.path.join(DATA_ROOT, "hud_config.json")
CAR_LEARNING_FILE = os.path.join(DATA_ROOT, "car_learning.json")


def normalize_vfd_render_mode(value: object) -> str:
    """Return the supported VFD renderer mode, defaulting to the safe legacy path."""
    return "optimized" if value == "optimized" else "legacy"


VFD_RENDER_MODE = normalize_vfd_render_mode(os.getenv("VFD_RENDER_MODE", "legacy"))

DEFAULT_HUD_CONFIG = {
    "enabled": False,
    "hudStyle": "vfd",
    "s650Theme": "heritage67",
    "s650CenterWidget": "drive",
    "s650HmiOffsetY": 60,
    "position": {"x": 100, "y": 100},
    "scale": 1.0,
    "unit": "kmh",
    "telemetryOpacity": 0.65,
    "telemetryGRadarScale": 1.0,
    "telemetryCornersScale": 1.0,
    "telemetryPedalScale": 1.0,
    "telemetryPowerTorqueScale": 1.0,
    "telemetryMergedChartsScale": 1.0,
    "telemetryLiveMapScale": 1.0,
    "telemetryLiveMapOpacity": 1.0,
    "telemetryLiveMapOffsetX": 0,
    "telemetryLiveMapOffsetY": 0,
    "telemetrySideBySideCharts": True,
    "pauseTelemetryViewWhenActive": True,
    "elements": {
        "showGauge": True,
        "showCenterInfo": True,
        "showRPM": True,
        "showSpeed": True,
        "showGear": True,
        "showPowerTorque": True,
        "showBoost": True,
        "showWheelLockup": True,
        "showMotionEffect": True,
        "showTeleSuspension": True,
        "showTeleTires": True,
        "showTeleTiresSlip": True,
        "showTeleTiresTemp": True,
        "showTeleAttitude": True,
        "showTeleEngine": True,
        "showTelePedals": True,
        "showTeleCenterAnchor": True,
        "showTeleGridLines": False,
        "showLiveMap": True,
        "showLiveMapPOIs": True,
        "showLiveMapPRStunts": True,
        "showLiveMapCollectibles": True,
        "showLiveMapHeading": True,
    },
    "soundEnabled": False,
}


LEGACY_S650_STYLE_MAP = {
    "s650_normal": "normal",
    "s650_heritage67": "heritage67",
    "s650_foxbody": "foxbody",
}
S650_HMI_THEMES = set(LEGACY_S650_STYLE_MAP.values())
S650_HMI_CENTER_WIDGETS = {"disable", "drive", "tire_temp", "performance"}


def normalize_hud_config(data: dict) -> dict:
    """Normalize S650 HUD ids while leaving other HUD configurations untouched."""
    normalized = dict(data or {})
    normalized.pop("vfdRenderMode", None)
    # actualScale used to be a derived compatibility field. Scaling now has a
    # single owner (HUDCore), so discard stale values from older config files.
    normalized.pop("actualScale", None)
    normalized.pop("s650GuiThemeMode", None)
    hud_style = normalized.get("hudStyle")
    is_legacy_s650_style = (
        isinstance(hud_style, str)
        and hud_style != "s650_hmi"
        and hud_style.startswith("s650_")
    )

    if hud_style in LEGACY_S650_STYLE_MAP or is_legacy_s650_style:
        normalized["hudStyle"] = "s650_hmi"
        normalized["s650Theme"] = LEGACY_S650_STYLE_MAP.get(hud_style, "heritage67")
    elif hud_style == "s650_hmi" and normalized.get("s650Theme") not in S650_HMI_THEMES:
        normalized["s650Theme"] = "heritage67"

    if (
        normalized.get("hudStyle") == "s650_hmi"
        and normalized.get("s650CenterWidget") not in S650_HMI_CENTER_WIDGETS
    ):
        normalized["s650CenterWidget"] = "drive"

    return normalized


def hud_config_with_gui_theme(data: dict) -> dict:
    normalized = normalize_hud_config(data)
    theme = app_settings.get("theme", {})
    mode = theme.get("mode") if isinstance(theme, dict) else None
    normalized["s650GuiThemeMode"] = "light" if mode == "light" else "dark"
    normalized["vfdRenderMode"] = VFD_RENDER_MODE
    return normalized


@app.get("/api/overlay/config")
@app.get("/api/overlay/layout")
async def get_overlay_config():
    if os.path.exists(HUD_CONFIG_FILE):
        try:
            with open(HUD_CONFIG_FILE, "r", encoding="utf-8") as f:
                return hud_config_with_gui_theme(json.load(f))
        except Exception as e:
            logger.error(f"Failed to load hud_config.json: {e}")
    return hud_config_with_gui_theme(DEFAULT_HUD_CONFIG)


@app.post("/api/overlay/config")
@app.post("/api/overlay/layout")
async def save_overlay_config(data: dict):
    try:
        data = normalize_hud_config(data)
        with open(HUD_CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        broadcast_data = hud_config_with_gui_theme(data)

        # Broadcast config update to all connected WebSockets (including the HUD)
        await overlay_manager.broadcast_json(
            {"type": "hud:config", "data": broadcast_data}
        )

        return {"message": "HUD config saved successfully", "success": True}
    except Exception as e:
        logger.error(f"Failed to save hud_config.json: {e}")
        return {"error": "Failed to save HUD config", "success": False}


@app.post("/api/overlay/reset")
async def reset_overlay_config():
    try:
        data = normalize_hud_config(DEFAULT_HUD_CONFIG)
        with open(HUD_CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

        await overlay_manager.broadcast_json(
            {
                "type": "hud:config",
                "data": hud_config_with_gui_theme(data),
            }
        )

        return {
            "message": "HUD config reset to defaults successfully",
            "success": True,
            "data": data,
        }
    except Exception as e:
        logger.error(f"Failed to reset hud_config.json: {e}")
        return {"error": "Failed to reset HUD config", "success": False}


@app.get("/api/hud/styles")
async def get_hud_styles():
    """掃描原生 (RESOURCE_ROOT) 與使用者自訂 (DATA_ROOT) hud_overlay 目錄，
    過濾掉非 HUD 目錄 (如 shared, assets, telemetry)，
    合併回傳有效的 HUD 清單（使用者自訂優先於原生）。
    """
    if getattr(sys, "frozen", False):
        builtin_path = os.path.join(RESOURCE_ROOT, "hud_overlay")
        user_path = os.path.join(DATA_ROOT, "hud_overlay")
    else:
        builtin_path = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "hud_overlay")
        )
        user_path = builtin_path

    styles: dict[str, dict] = {}

    # 1. 掃描原生 HUD (builtin)
    if os.path.isdir(builtin_path):
        for entry in sorted(os.scandir(builtin_path), key=lambda e: e.name):
            if (
                entry.is_dir()
                and entry.name.lower() not in IGNORED_HUD_DIRS
                and os.path.isfile(os.path.join(entry.path, "index.html"))
            ):
                styles[entry.name] = {
                    "id": entry.name,
                    "source": "builtin",
                    "urlPrefix": "/hud",
                }

    # 2. 掃描使用者自訂 HUD (user)
    if os.path.isdir(user_path) and user_path != builtin_path:
        for entry in sorted(os.scandir(user_path), key=lambda e: e.name):
            if (
                entry.is_dir()
                and entry.name.lower() not in IGNORED_HUD_DIRS
                and os.path.isfile(os.path.join(entry.path, "index.html"))
            ):
                # 衝突時使用者自訂覆蓋原生
                styles[entry.name] = {
                    "id": entry.name,
                    "source": "user",
                    "urlPrefix": "/hud_user",
                }

    return {"styles": list(styles.values())}


@app.get("/api/overlay/car_learning")
async def get_car_learning():
    if os.path.exists(CAR_LEARNING_FILE):
        try:
            with open(CAR_LEARNING_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Failed to load car_learning.json: {e}")
    return {}


@app.post("/api/overlay/car_learning")
async def save_car_learning(data: dict):
    try:
        with open(CAR_LEARNING_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        return {"message": "Car learning data saved successfully", "success": True}
    except Exception as e:
        logger.error(f"Failed to save car_learning.json: {e}")
        return {"error": "Failed to save car learning data", "success": False}


@app.get("/api/overlay/system_media")
async def get_system_media():
    try:
        return await get_system_media_info()
    except Exception as e:
        logger.error(f"Failed to get system media info: {e}")
        return {
            "title": "FORZA HORIZON 6 SOUNDTRACK",
            "artist": "RADIO ETIENNE",
            "status": "idle",
            "state": "unavailable",
            "source": "unavailable",
            "has_media": False,
            "success": False,
        }


@app.get("/api/overlay/audio_spectrum")
async def get_audio_spectrum():
    try:
        return await get_audio_spectrum_data()
    except Exception as e:
        logger.error(f"Failed to get audio spectrum data: {e}")
        return {
            "spectrum": [0.0] * 32,
            "vu_left": 0.0,
            "vu_right": 0.0,
            "has_audio": False,
            "state": "unavailable",
            "sequence": 0,
            "captured_at_ms": 0,
            "source": "unavailable",
            "success": False,
        }


def check_frontend_alive(proc):
    import time

    time.sleep(2)
    while True:
        poll_code = proc.poll()
        if poll_code is not None:
            logger.error(f"Frontend process terminated with exit code: {poll_code}")
            log_obj = _cleanup_state.get("log")
            if log_obj:
                try:
                    log_obj.flush()
                except Exception:
                    pass
            try:
                sys.stdout.flush()
                sys.stderr.flush()
            except Exception:
                pass
            os._exit(poll_code if poll_code is not None else 0)
        time.sleep(1)


if __name__ == "__main__":
    import multiprocessing

    multiprocessing.freeze_support()

    import sys
    import threading

    import uvicorn

    def get_free_port():
        import socket

        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
        s.close()
        return port

    # A standalone Vite dev server cannot call Tauri's get_backend_port command,
    # so development must use the same deterministic port the frontend targets.
    # The packaged application keeps its dynamic-port behaviour to avoid clashes
    # between concurrent installed instances.
    if getattr(sys, "frozen", False):
        try:
            backend_port = get_free_port()
        except Exception:
            backend_port = 8001
    else:
        backend_port = int(os.getenv("BACKEND_PORT", "8001"))

    def write_web_port(port):
        try:
            log_dir = os.path.join(DATA_ROOT, "logs")
            os.makedirs(log_dir, exist_ok=True)
            port_file_path = os.path.join(log_dir, "web_port.txt")
            with open(port_file_path, "w", encoding="utf-8") as f:
                f.write(str(port))
        except Exception as e:
            print(f"Failed to write web_port.txt: {e}")

    write_web_port(backend_port)

    _cleanup_state = {"log": None}

    def cleanup_resources():
        log = _cleanup_state.get("log")
        if log:
            try:
                log.close()
            except Exception:
                pass
            _cleanup_state["log"] = None

    import atexit

    atexit.register(cleanup_resources)

    # 在 Sidecar 模式下，監聽 stdin EOF 以在父程序 (Tauri Host) 關閉時連帶退出。
    def monitor_stdin_eof():
        try:
            if sys.stdin is not None:
                sys.stdin.read()
        except Exception:
            pass
        # EOF 是 Tauri host 的明確 shutdown 合約；不能依賴啟動後經過的時間，
        # 否則 ready 後快速關閉時可能留下仍持有 UDP socket 的 sidecar。
        cleanup_resources()
        os._exit(0)

    # Tauri always passes --data-dir when it owns the sidecar. A manually
    # launched executable may have an inherited console stdin whose EOF must
    # not terminate the server.
    if parsed_args.data_dir:
        threading.Thread(target=monitor_stdin_eof, daemon=True).start()

    import socket

    max_retries = 3
    bound = False

    for attempt in range(max_retries):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(("127.0.0.1", backend_port))
                bound = True
                break
        except OSError as e:
            print(f"Port {backend_port} is unavailable: {e}")
            if attempt < max_retries - 1:
                try:
                    backend_port = get_free_port()
                except Exception:
                    backend_port += 1
                write_web_port(backend_port)
                print(f"Retrying with port {backend_port}...")
            else:
                print("Max retries reached. Backend failed to start.")
                sys.exit(1)

    if bound:
        emit_sidecar_event("BACKEND_READY", port=backend_port)

        class EndpointFilter(logging.Filter):
            def filter(self, record: logging.LogRecord) -> bool:
                if record.args and len(record.args) >= 3:
                    req_path = str(record.args[2])
                    if "/api/logs" in req_path or "/api/car_params" in req_path:
                        return False
                return True

        logging.getLogger("uvicorn.access").addFilter(EndpointFilter())
        uvicorn.run(app, host="127.0.0.1", port=backend_port)
