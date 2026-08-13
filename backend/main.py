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


# ?芾? Formatter 隞亦宏?斗隤葉??ANSI 憿隞?Ⅳ嚗雁??backend.log ?????澆?
class CleanFormatter(logging.Formatter):
    ANSI_ESCAPE = re.compile(r"\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])")

    def format(self, record):
        formatted = super().format(record)
        return self.ANSI_ESCAPE.sub("", formatted)


# ?蔭??Logger
root_logger = logging.getLogger()
root_logger.setLevel(logging.INFO)

# 皜??歇?? handler
for handler in root_logger.handlers[:]:
    root_logger.removeHandler(handler)

# 瑼? Handler
file_handler = logging.FileHandler(backend_log_path, encoding="utf-8")
file_handler.setFormatter(
    CleanFormatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
)
root_logger.addHandler(file_handler)

# ?批??Handler (?芣??券? frozen ????閬?
if not getattr(sys, "frozen", False):
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(
        CleanFormatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    )
    root_logger.addHandler(console_handler)

logger = logging.getLogger(__name__)

# 蝯曹??蔭?航?鞈??桅??撖怠鞈??桅?

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

# 摰銴ˊ?批遣隤頂瑼 DATA_ROOT/lang/ 靘蝙?刻銵雁霅?
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
# 雿輻?銝蝯曹?摰???楝敺?閮剖?嚗???摰儔??

DEFAULT_SETTINGS = {
    "dyno_recording": False,
    "race_recording": False,
    "developer_tuning_enabled": False,
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
        "halfmoonCore": "default",
        "primaryColor": "#00f0ff",
        "secondaryColor": "#ff003c",
        "accentColor": "#7000ff",
        "customCSS": "",
    },
}

app_settings = {
    "dyno_recording": False,
    "race_recording": False,
    "developer_tuning_enabled": False,
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
            launch_recommendation = "韏瑟郊???憚???漲嚗像??蝘餌? {:.1f}%嚗?瘚芾祥???撱箄降撠?1 瑼?瘥矽撠?敺 Speed ?孵?嚗?潸矽雿?5%~10%嚗?隤踹?蝯瘥?隞仿?雿憚?垢??絲甇交??.format(
                launch_slip * 100
            )
        elif launch_slip < 0.05:
            launch_recommendation = "韏瑟郊?嗾銋???皛?撟喳?皛宏??{:.1f}%嚗…12895 tokens truncated…t.get(
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


def _read_drag_sessions():
    """Helper function to read drag sessions synchronously."""
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


@app.get("/api/drag/sessions")
async def list_drag_sessions():
    return await asyncio.to_thread(_read_drag_sessions)


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
            # 憒?銝???航??Traceback ?憭??亥?嚗蔥?乩?銝銵?
            if current_entry:
                current_entry["message"] += "\n" + line_str
            else:
                # 摮斤???嚗?乩??箸?隤??身??INFO
                current_entry = {
                    "timestamp": "",
                    "level": "INFO",
                    "logger": "stdout",
                    "message": line_str,
                }

    if current_entry:
        parsed_logs.append(current_entry)

    # 蝭拚蝝
    if level and level.upper() != "ALL":
        target_level = level.upper()
        parsed_logs = [log for log in parsed_logs if log["level"] == target_level]

    # ???啁? limit 璇?
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
# 閮餉?嚗??蝡臬歇蝘駁 Dashboard Overlay ??????潘?雿?蝡臭誑銝? API ?亙暺?鈭誑靽?嚗??箸靘?賡????游??銋?????
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
S650_HMI_THEMES = set(LEGACY_S650_STYLE_MAP.values()) | {"track"}
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
    """???? (RESOURCE_ROOT) ?蝙?刻閮?(DATA_ROOT) hud_overlay ?桅?嚗?
    ?蕪?? HUD ?桅? (憒?shared, assets, telemetry)嚗?
    ?蔥?????HUD 皜嚗蝙?刻閮???嚗?
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

    # 1. ???? HUD (builtin)
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

    # 2. ??雿輻?閮?HUD (user)
    if os.path.isdir(user_path) and user_path != builtin_path:
        for entry in sorted(os.scandir(user_path), key=lambda e: e.name):
            if (
                entry.is_dir()
                and entry.name.lower() not in IGNORED_HUD_DIRS
                and os.path.isfile(os.path.join(entry.path, "index.html"))
            ):
                # 銵??蝙?刻閮?????
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

    # ??Sidecar 璅∪?銝??? stdin EOF 隞亙?嗥?摨?(Tauri Host) ????葆??箝?
    def monitor_stdin_eof():
        try:
            if sys.stdin is not None:
                sys.stdin.read()
        except Exception:
            pass
        # EOF ??Tauri host ??蝣?shutdown ??嚗??賭?鞈游???蝬?????
        # ?血? ready 敺翰?????航??隞???UDP socket ??sidecar??
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

