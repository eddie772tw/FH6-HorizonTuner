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


# è‡ªè¨‚ Formatter ä»¥ç§»é™¤æ—¥èªŒä¸­çš„ ANSI é¡è‰²ä»£ç¢¼ï¼Œç¶­æŒ backend.log çš„ç´”æ–‡å­—æ ¼å¼
class CleanFormatter(logging.Formatter):
    ANSI_ESCAPE = re.compile(r"\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])")

    def format(self, record):
        formatted = super().format(record)
        return self.ANSI_ESCAPE.sub("", formatted)


# é…ç½®æ ¹ Logger
root_logger = logging.getLogger()
root_logger.setLevel(logging.INFO)

# æ¸…é™¤æ‰€æœ‰å·²æœ‰çš„ handler
for handler in root_logger.handlers[:]:
    root_logger.removeHandler(handler)

# æª”æ¡ˆ Handler
file_handler = logging.FileHandler(backend_log_path, encoding="utf-8")
file_handler.setFormatter(
    CleanFormatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
)
root_logger.addHandler(file_handler)

# æŽ§åˆ¶å° Handler (åªæœ‰åœ¨éž frozen é–‹ç™¼æœŸæ‰éœ€è¦)
if not getattr(sys, "frozen", False):
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(
        CleanFormatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    )
    root_logger.addHandler(console_handler)

logger = logging.getLogger(__name__)

# çµ±ä¸€é…ç½®å”¯è®€è³‡æºç›®éŒ„èˆ‡å¯å¯«å…¥è³‡æ–™ç›®éŒ„

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

# å®Œæ•´è¤‡è£½å…§å»ºèªžç³»æª”è‡³ DATA_ROOT/lang/ ä¾›ä½¿ç”¨è€…è‡ªè¡Œç¶­è­·
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
# ä½¿ç”¨æœ€ä¸Šæ–¹çµ±ä¸€å®£å‘Šçš„è·¯å¾‘èˆ‡è¨­å®šï¼Œå…é‡è¤‡å®šç¾©ã€‚

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
            relative_tÛMùÖÚ$z{-®éÜj×¢&WGW&â²&W'&÷"#¢$f–ÆVBFò6ÆV"Æöw2'ÐÐ¢&WGW&â²&ÖW76vR#¢$Æörf–ÆRFöW2æ÷BW†—7B'ÐÐ Ð Ð¢2ÒÒÒ÷fW&Æ’’ÒÒÐÐ¢2Š‹¾Š‰ŽûÉ®yºîX˜ÞX˜Þzºþ[{.z{¾™šBF6†&ö&B÷fW&Æ’Xˆnšˆˆ~y»Ž™yÎ™h¾y›ÎûÈÎKØn[èÎzºþKº^Kˆ¾K˜²’hê^XZ^›¹îK¸ÞK¨ŽKº^KùÞyYžûÈÎKÙÎx+®iÊ®KènXúþˆ;Þ˜xÞYYþh‰ni;N[^™h¾y›ÎK˜¾š	yYžhê^Xú>8 Ð¤Ä”õUEôd”ÄRÒ÷2çF‚æ¦ö–â„DDõ$ôõBÂ&Æ–÷WBæ§6öâ"Ð¤DTdTÅEôÄ”õUBÒ°Ð¢&ÖöGVÆW2#¢°Ð¢'F—&UFV×#¢²'f—6–&ÆR#¢G'VRÂ'‚#¢SÂ'’#¢SÂ'r#¢#SÂ&‚#¢ƒÒÀÐ¢'7W7G&fVÂ#¢²'f—6–&ÆR#¢G'VRÂ'‚#¢3#Â'’#¢SÂ'r#¢#Â&‚#¢ƒÒÀÐ¢'6Æ—Æ–Ö—B#¢²'f—6–&ÆR#¢G'VRÂ'‚#¢SCÂ'’#¢SÂ'r#¢##Â&‚#¢##ÒÀÐ¢&tf÷&6R#¢²'f—6–&ÆR#¢G'VRÂ'‚#¢SÂ'’#¢#SÂ'r#¢##Â&‚#¢##ÒÀÐ¢&F6†&ö&B#¢²'f—6–&ÆR#¢G'VRÂ'‚#¢#“Â'’#¢#SÂ'r#¢CsÂ&‚#¢#ÒÀÐ¢ÐÐ§ÐÐ Ð Ð¤…TEô4ôäd”uôd”ÄRÒ÷2çF‚æ¦ö–â„DDõ$ôõBÂ&‡VEö6öæf–ræ§6öâ"Ð¤4%ôÄT$ä”äuôd”ÄRÒ÷2çF‚æ¦ö–â„DDõ$ôõBÂ&6%öÆV&æ–æræ§6öâ"Ð Ð Ð¦FVbæ÷&ÖÆ—¦U÷ffE÷&VæFW%öÖöFR‡fÇVS¢ö&¦V7B’Óâ7G# Ð¢""%&WGW&âF†R7W÷'FVBddB&VæFW&W"ÖöFRÂFVfVÇF–ærFòF†R6fRÆVv7’F‚â"" Ð¢&WGW&â&÷F–Ö—¦VB"–bfÇVRÓÒ&÷F–Ö—¦VB"VÇ6R&ÆVv7’ Ð Ð Ð¥ddEõ$TäDU%ôÔôDRÒæ÷&ÖÆ—¦U÷ffE÷&VæFW%öÖöFR†÷2ævWFVçb‚%ddEõ$TäDU%ôÔôDR"Â&ÆVv7’"’Ð Ð¤DTdTÅEô…TEô4ôäd”rÒ°Ð¢&Væ&ÆVB#¢fÇ6RÀÐ¢&‡VE7G–ÆR#¢'ffB"ÀÐ¢'3cSF†VÖR#¢&†W&—FvScr"ÀÐ¢'3cS6VçFW%v–FvWB#¢&G&—fR"ÀÐ¢'3cS†Ö”öfg6WE’#¢cÀÐ¢'÷6—F–öâ#¢²'‚#¢Â'’#¢ÒÀÐ¢'66ÆR#¢ãÀÐ¢'Væ—B#¢&¶Ö‚"ÀÐ¢'FVÆVÖWG'”÷6—G’#¢ãcRÀÐ¢'FVÆVÖWG'”u&F%66ÆR#¢ãÀÐ¢'FVÆVÖWG'”6÷&æW'566ÆR#¢ãÀÐ¢'FVÆVÖWG'•VFÅ66ÆR#¢ãÀÐ¢'FVÆVÖWG'•÷vW%F÷'VU66ÆR#¢ãÀÐ¢'FVÆVÖWG'”ÖW&vVD6†'G566ÆR#¢ãÀÐ¢'FVÆVÖWG'”Æ—fTÖ66ÆR#¢ãÀÐ¢'FVÆVÖWG'”Æ—fTÖ÷6—G’#¢ãÀÐ¢'FVÆVÖWG'”Æ—fTÖöfg6WE‚#¢ÀÐ¢'FVÆVÖWG'”Æ—fTÖöfg6WE’#¢ÀÐ¢'FVÆVÖWG'•6–FT'•6–FT6†'G2#¢G'VRÀÐ¢'W6UFVÆVÖWG'•f–Wuv†Vä7F—fR#¢G'VRÀÐ¢&VÆVÖVçG2#¢°Ð¢'6†÷tvVvR#¢G'VRÀÐ¢'6†÷t6VçFW$–æfò#¢G'VRÀÐ¢'6†÷u%Ò#¢G'VRÀÐ¢'6†÷u7VVB#¢G'VRÀÐ¢'6†÷tvV"#¢G'VRÀÐ¢'6†÷u÷vW%F÷'VR#¢G'VRÀÐ¢'6†÷t&ö÷7B#¢G'VRÀÐ¢'6†÷uv†VVÄÆö6·W#¢G'VRÀÐ¢'6†÷tÖ÷F–öäVffV7B#¢G'VRÀÐ¢'6†÷uFVÆU7W7Vç6–öâ#¢G'VRÀÐ¢'6†÷uFVÆUF—&W2#¢G'VRÀÐ¢'6†÷uFVÆUF—&W56Æ—#¢G'VRÀÐ¢'6†÷uFVÆUF—&W5FV×#¢G'VRÀÐ¢'6†÷uFVÆTGF—GVFR#¢G'VRÀÐ¢'6†÷uFVÆTVæv–æR#¢G'VRÀÐ¢'6†÷uFVÆUVFÇ2#¢G'VRÀÐ¢'6†÷uFVÆT6VçFW$æ6†÷"#¢G'VRÀÐ¢'6†÷uFVÆTw&–DÆ–æW2#¢fÇ6RÀÐ¢'6†÷tÆ—fTÖ#¢G'VRÀÐ¢'6†÷tÆ—fTÖô—2#¢G'VRÀÐ¢'6†÷tÆ—fTÖ%7GVçG2#¢G'VRÀÐ¢'6†÷tÆ—fTÖ6öÆÆV7F–&ÆW2#¢G'VRÀÐ¢'6†÷tÆ—fTÖ†VF–ær#¢G'VRÀÐ¢ÒÀÐ¢'6÷VæDVæ&ÆVB#¢fÇ6RÀÐ§ÐÐ Ð Ð¤ÄTt5•õ3cSõ5E”ÄUôÔÒ°Ð¢'3cSöæ÷&ÖÂ#¢&æ÷&ÖÂ"ÀÐ¢'3cSö†W&—FvScr#¢&†W&—FvScr"ÀÐ¢'3cSöf÷†&öG’#¢&f÷†&öG’"ÀÐ§ÐÐ¥3cSô„Ô•õD„TÔU2Ò6WB„ÄTt5•õ3cSõ5E”ÄUôÔçfÇVW2‚’’Â²'G&6²'ÐÐ¥3cSô„Ô•ô4TåDU%õt”DtUE2Ò²&F—6&ÆR"Â&G&—fR"Â'F—&U÷FV×"Â'W&f÷&Öæ6R'ÐÐ Ð Ð¦FVbæ÷&ÖÆ—¦Uö‡VEö6öæf–r†FF¢F–7B’ÓâF–7C Ð¢""$æ÷&ÖÆ—¦R3cS…TB–G2v†–ÆRÆVf–ær÷F†W"…TB6öæf–wW&F–öç2VçF÷V6†VBâ"" Ð¢æ÷&ÖÆ—¦VBÒF–7B†FF÷"·ÒÐ¢æ÷&ÖÆ—¦VBç÷‚'ffE&VæFW$ÖöFR"ÂæöæRÐ¢27GVÅ66ÆRW6VBFò&RFW&—fVB6ö×F–&–Æ—G’f–VÆBâ66Æ–æræ÷r†2Ð¢26–ævÆR÷væW"„…TD6÷&R’Â6òF—66&B7FÆRfÇVW2g&öÒöÆFW"6öæf–rf–ÆW2àÐ¢æ÷&ÖÆ—¦VBç÷‚&7GVÅ66ÆR"ÂæöæRÐ¢æ÷&ÖÆ—¦VBç÷‚'3cSwV•F†VÖTÖöFR"ÂæöæRÐ¢‡VE÷7G–ÆRÒæ÷&ÖÆ—¦VBævWB‚&‡VE7G–ÆR"Ð¢—5öÆVv7•÷3cS÷7G–ÆRÒ€Ð¢—6–ç7Fæ6R†‡VE÷7G–ÆRÂ7G"Ð¢æB‡VE÷7G–ÆRÒ'3cSö†Ö’ Ð¢æB‡VE÷7G–ÆRç7F'G7v—F‚‚'3cSò"Ð¢Ð Ð¢–b‡VE÷7G–ÆR–âÄTt5•õ3cSõ5E”ÄUôÔ÷"—5öÆVv7•÷3cS÷7G–ÆS Ð¢æ÷&ÖÆ—¦VE²&‡VE7G–ÆR%ÒÒ'3cSö†Ö’ Ð¢æ÷&ÖÆ—¦VE²'3cSF†VÖR%ÒÒÄTt5•õ3cSõ5E”ÄUôÔævWB†‡VE÷7G–ÆRÂ&†W&—FvScr"Ð¢VÆ–b‡VE÷7G–ÆRÓÒ'3cSö†Ö’"æBæ÷&ÖÆ—¦VBævWB‚'3cSF†VÖR"’æ÷B–â3cSô„Ô•õD„TÔU3 Ð¢æ÷&ÖÆ—¦VE²'3cSF†VÖR%ÒÒ&†W&—FvScr Ð Ð¢–b€Ð¢æ÷&ÖÆ—¦VBævWB‚&‡VE7G–ÆR"’ÓÒ'3cSö†Ö’ Ð¢æBæ÷&ÖÆ—¦VBævWB‚'3cS6VçFW%v–FvWB"’æ÷B–â3cSô„Ô•ô4TåDU%õt”DtUE0Ð¢“ Ð¢æ÷&ÖÆ—¦VE²'3cS6VçFW%v–FvWB%ÒÒ&G&—fR Ð Ð¢&WGW&âæ÷&ÖÆ—¦V@Ð Ð Ð¦FVb‡VEö6öæf–u÷v—F…öwV•÷F†VÖR†FF¢F–7B’ÓâF–7C Ð¢æ÷&ÖÆ—¦VBÒæ÷&ÖÆ—¦Uö‡VEö6öæf–r†FFÐ¢F†VÖRÒ÷6WGF–æw2ævWB‚'F†VÖR"Â·ÒÐ¢ÖöFRÒF†VÖRævWB‚&ÖöFR"’–b—6–ç7Fæ6R‡F†VÖRÂF–7B’VÇ6RæöæPÐ¢æ÷&ÖÆ—¦VE²'3cSwV•F†VÖTÖöFR%ÒÒ&Æ–v‡B"–bÖöFRÓÒ&Æ–v‡B"VÇ6R&F&² Ð¢æ÷&ÖÆ—¦VE²'ffE&VæFW$ÖöFR%ÒÒddEõ$TäDU%ôÔôDPÐ¢&WGW&âæ÷&ÖÆ—¦V@Ð Ð Ð¤ævWB‚"ö’ö÷fW&Æ’ö6öæf–r"Ð¤ævWB‚"ö’ö÷fW&Æ’öÆ–÷WB"Ð¦7–æ2FVbvWEö÷fW&Æ•ö6öæf–r‚“ Ð¢–b÷2çF‚æW†—7G2„…TEô4ôäd”uôd”ÄR“ Ð¢G'“ Ð¢v—F‚÷Vâ„…TEô4ôäd”uôd”ÄRÂ'""ÂVæ6öF–æsÒ'WFbÓ‚"’2c Ð¢&WGW&â‡VEö6öæf–u÷v—F…öwV•÷F†VÖR†§6öâæÆöB†b’Ð¢W†6WBW†6WF–öâ2S Ð¢ÆövvW"æW'&÷"†b$f–ÆVBFòÆöB‡VEö6öæf–ræ§6öã¢¶WÒ"Ð¢&WGW&â‡VEö6öæf–u÷v—F…öwV•÷F†VÖR„DTdTÅEô…TEô4ôäd”rÐ Ð Ð¤ç÷7B‚"ö’ö÷fW&Æ’ö6öæf–r"Ð¤ç÷7B‚"ö’ö÷fW&Æ’öÆ–÷WB"Ð¦7–æ2FVb6fUö÷fW&Æ•ö6öæf–r†FF¢F–7B“ Ð¢G'“ Ð¢FFÒæ÷&ÖÆ—¦Uö‡VEö6öæf–r†FFÐ¢v—F‚÷Vâ„…TEô4ôäd”uôd”ÄRÂ'r"ÂVæ6öF–æsÒ'WFbÓ‚"’2c Ð¢§6öâæGV×†FFÂbÂ–æFVçCÓ"ÂVç7W&Uö66–“ÔfÇ6RÐ¢'&öF67EöFFÒ‡VEö6öæf–u÷v—F…öwV•÷F†VÖR†FFÐ Ð¢2'&öF67B6öæf–rWFFRFòÆÂ6öææV7FVBvV%6ö6¶WG2†–æ6ÇVF–ærF†R…TBÐ¢v—B÷fW&Æ•öÖævW"æ'&öF67Eö§6öâ€Ð¢²'G—R#¢&‡VC¦6öæf–r"Â&FF#¢'&öF67EöFFÐÐ¢Ð Ð¢&WGW&â²&ÖW76vR#¢$…TB6öæf–r6fVB7V66W76gVÆÇ’"Â'7V66W72#¢G'VWÐÐ¢W†6WBW†6WF–öâ2S Ð¢ÆövvW"æW'&÷"†b$f–ÆVBFò6fR‡VEö6öæf–ræ§6öã¢¶WÒ"Ð¢&WGW&â²&W'&÷"#¢$f–ÆVBFò6fR…TB6öæf–r"Â'7V66W72#¢fÇ6WÐÐ Ð Ð¤ç÷7B‚"ö’ö÷fW&Æ’÷&W6WB"Ð¦7–æ2FVb&W6WEö÷fW&Æ•ö6öæf–r‚“ Ð¢G'“ Ð¢FFÒæ÷&ÖÆ—¦Uö‡VEö6öæf–r„DTdTÅEô…TEô4ôäd”rÐ¢v—F‚÷Vâ„…TEô4ôäd”uôd”ÄRÂ'r"ÂVæ6öF–æsÒ'WFbÓ‚"’2c Ð¢§6öâæGV×†FFÂbÂ–æFVçCÓ"ÂVç7W&Uö66–“ÔfÇ6RÐ Ð¢v—B÷fW&Æ•öÖævW"æ'&öF67Eö§6öâ€Ð¢°Ð¢'G—R#¢&‡VC¦6öæf–r"ÀÐ¢&FF#¢‡VEö6öæf–u÷v—F…öwV•÷F†VÖR†FF’ÀÐ¢ÐÐ¢Ð Ð¢&WGW&â°Ð¢&ÖW76vR#¢$…TB6öæf–r&W6WBFòFVfVÇG27V66W76gVÆÇ’"ÀÐ¢'7V66W72#¢G'VRÀÐ¢&FF#¢FFÀÐ¢ÐÐ¢W†6WBW†6WF–öâ2S Ð¢ÆövvW"æW'&÷"†b$f–ÆVBFò&W6WB‡VEö6öæf–ræ§6öã¢¶WÒ"Ð¢&WGW&â²&W'&÷"#¢$f–ÆVBFò&W6WB…TB6öæf–r"Â'7V66W72#¢fÇ6WÐÐ Ð Ð¤ævWB‚"ö’ö‡VB÷7G–ÆW2"Ð¦7–æ2FVbvWEö‡VE÷7G–ÆW2‚“ Ð¢"".hè>høþXéþyIò…$U4õU$4Uõ$ôõB’ˆˆ~KÛþyJŽˆ^ˆz®Šˆ"„DDõ$ôõB’‡VEö÷fW&Æ’yºî˜ÈNûÈÀÐ¢˜îkûîhèž™Ùâ…TByºî˜ÈBŽZh"6†&VBÂ76WG2ÂFVÆVÖWG'’žûÈÀÐ¢YŽKÛ^Y¹îX+>iÈžiXŽy¨B…TBkˆ^YjîûÈŽKÛþyJŽˆ^ˆz®Šˆ.XJ®XXŽikÎXéþyIþûÈž8 Ð¢"" Ð¢–bvWFGG"‡7—2Â&g&÷¦Vâ"ÂfÇ6R“ Ð¢'V–ÇF–å÷F‚Ò÷2çF‚æ¦ö–â…$U4õU$4Uõ$ôõBÂ&‡VEö÷fW&Æ’"Ð¢W6W%÷F‚Ò÷2çF‚æ¦ö–â„DDõ$ôõBÂ&‡VEö÷fW&Æ’"Ð¢VÇ6S Ð¢'V–ÇF–å÷F‚Ò÷2çF‚æ'7F‚€Ð¢÷2çF‚æ¦ö–â†÷2çF‚æF—&æÖR…õöf–ÆUõò’Â"ââ"Â&‡VEö÷fW&Æ’"Ð¢Ð¢W6W%÷F‚Ò'V–ÇF–å÷F€Ð Ð¢7G–ÆW3¢F–7E·7G"ÂF–7EÒÒ·ÐÐ Ð¢2âhè>høþXéþyIò…TB†'V–ÇF–âÐ¢–b÷2çF‚æ—6F—"†'V–ÇF–å÷F‚“ Ð¢f÷"VçG'’–â6÷'FVB†÷2ç66æF—"†'V–ÇF–å÷F‚’Â¶W“ÖÆÖ&FS¢RææÖR“ Ð¢–b€Ð¢VçG'’æ—5öF—"‚Ð¢æBVçG'’ææÖRæÆ÷vW"‚’æ÷B–â”täõ$TEô…TEôD•%0Ð¢æB÷2çF‚æ—6f–ÆR†÷2çF‚æ¦ö–â†VçG'’çF‚Â&–æFW‚æ‡FÖÂ"’Ð¢“ Ð¢7G–ÆW5¶VçG'’ææÖUÒÒ°Ð¢&–B#¢VçG'’ææÖRÀÐ¢'6÷W&6R#¢&'V–ÇF–â"ÀÐ¢'W&Å&Vf—‚#¢"ö‡VB"ÀÐ¢ÐÐ Ð¢2"âhè>høþKÛþyJŽˆ^ˆz®Šˆ"…TB‡W6W"Ð¢–b÷2çF‚æ—6F—"‡W6W%÷F‚’æBW6W%÷F‚Ò'V–ÇF–å÷Fƒ Ð¢f÷"VçG'’–â6÷'FVB†÷2ç66æF—"‡W6W%÷F‚’Â¶W“ÖÆÖ&FS¢RææÖR“ Ð¢–b€Ð¢VçG'’æ—5öF—"‚Ð¢æBVçG'’ææÖRæÆ÷vW"‚’æ÷B–â”täõ$TEô…TEôD•%0Ð¢æB÷2çF‚æ—6f–ÆR†÷2çF‚æ¦ö–â†VçG'’çF‚Â&–æFW‚æ‡FÖÂ"’Ð¢“ Ð¢2ŠÞz¨i˜.KÛþyJŽˆ^ˆz®Šˆ.Šhn‰8¾XéþyIðÐ¢7G–ÆW5¶VçG'’ææÖUÒÒ°Ð¢&–B#¢VçG'’ææÖRÀÐ¢'6÷W&6R#¢'W6W""ÀÐ¢'W&Å&Vf—‚#¢"ö‡VE÷W6W""ÀÐ¢ÐÐ Ð¢&WGW&â²'7G–ÆW2#¢Æ—7B‡7G–ÆW2çfÇVW2‚’—ÐÐ Ð Ð¤ævWB‚"ö’ö÷fW&Æ’ö6%öÆV&æ–ær"Ð¦7–æ2FVbvWEö6%öÆV&æ–ær‚“ Ð¢–b÷2çF‚æW†—7G2„4%ôÄT$ä”äuôd”ÄR“ Ð¢G'“ Ð¢v—F‚÷Vâ„4%ôÄT$ä”äuôd”ÄRÂ'""ÂVæ6öF–æsÒ'WFbÓ‚"’2c Ð¢&WGW&â§6öâæÆöB†bÐ¢W†6WBW†6WF–öâ2S Ð¢ÆövvW"æW'&÷"†b$f–ÆVBFòÆöB6%öÆV&æ–æræ§6öã¢¶WÒ"Ð¢&WGW&â·ÐÐ Ð Ð¤ç÷7B‚"ö’ö÷fW&Æ’ö6%öÆV&æ–ær"Ð¦7–æ2FVb6fUö6%öÆV&æ–ær†FF¢F–7B“ Ð¢G'“ Ð¢v—F‚÷Vâ„4%ôÄT$ä”äuôd”ÄRÂ'r"ÂVæ6öF–æsÒ'WFbÓ‚"’2c Ð¢§6öâæGV×†FFÂbÂ–æFVçCÓ"ÂVç7W&Uö66–“ÔfÇ6RÐ¢&WGW&â²&ÖW76vR#¢$6"ÆV&æ–ærFF6fVB7V66W76gVÆÇ’"Â'7V66W72#¢G'VWÐÐ¢W†6WBW†6WF–öâ2S Ð¢ÆövvW"æW'&÷"†b$f–ÆVBFò6fR6%öÆV&æ–æræ§6öã¢¶WÒ"Ð¢&WGW&â²&W'&÷"#¢$f–ÆVBFò6fR6"ÆV&æ–ærFF"Â'7V66W72#¢fÇ6WÐÐ Ð Ð¤ævWB‚"ö’ö÷fW&Æ’÷7—7FVÕöÖVF–"Ð¦7–æ2FVbvWE÷7—7FVÕöÖVF–‚“ Ð¢G'“ Ð¢&WGW&âv—BvWE÷7—7FVÕöÖVF–ö–æfò‚Ð¢W†6WBW†6WF–öâ2S Ð¢ÆövvW"æW'&÷"†b$f–ÆVBFòvWB7—7FVÒÖVF––æfó¢¶WÒ"Ð¢&WGW&â°Ð¢'F—FÆR#¢$dõ%¤„õ$•¤ôâb4õTäEE$4²"ÀÐ¢&'F—7B#¢%$D”òUD”TääR"ÀÐ¢'7FGW2#¢&–FÆR"ÀÐ¢'7FFR#¢'Væf–Æ&ÆR"ÀÐ¢'6÷W&6R#¢'Væf–Æ&ÆR"ÀÐ¢&†5öÖVF–#¢fÇ6RÀÐ¢'7V66W72#¢fÇ6RÀÐ¢ÐÐ Ð Ð¤ævWB‚"ö’ö÷fW&Æ’öVF–õ÷7V7G'VÒ"Ð¦7–æ2FVbvWEöVF–õ÷7V7G'VÒ‚“ Ð¢G'“ Ð¢&WGW&âv—BvWEöVF–õ÷7V7G'VÕöFF‚Ð¢W†6WBW†6WF–öâ2S Ð¢ÆövvW"æW'&÷"†b$f–ÆVBFòvWBVF–ò7V7G'VÒFF¢¶WÒ"Ð¢&WGW&â°Ð¢'7V7G'VÒ#¢³ãÒ¢3"ÀÐ¢'gUöÆVgB#¢ãÀÐ¢'gU÷&–v‡B#¢ãÀÐ¢&†5öVF–ò#¢fÇ6RÀÐ¢'7FFR#¢'Væf–Æ&ÆR"ÀÐ¢'6WVVæ6R#¢ÀÐ¢&6GW&VEöEö×2#¢ÀÐ¢'6÷W&6R#¢'Væf–Æ&ÆR"ÀÐ¢'7V66W72#¢fÇ6RÀÐ¢ÐÐ Ð Ð¦FVb6†V6µög&öçFVæEöÆ—fR‡&ö2“ Ð¢–×÷'BF–ÖPÐ Ð¢F–ÖRç6ÆVWƒ"Ð¢v†–ÆRG'VS Ð¢öÆÅö6öFRÒ&ö2çöÆÂ‚Ð¢–böÆÅö6öFR—2æ÷BæöæS Ð¢ÆövvW"æW'&÷"†b$g&öçFVæB&ö6W72FW&Ö–æFVBv—F‚W†—B6öFS¢·öÆÅö6öFWÒ"Ð¢Æöuöö&¢Òö6ÆVçW÷7FFRævWB‚&Æör"Ð¢–bÆöuöö&£ Ð¢G'“ Ð¢Æöuöö&¢æfÇW6‚‚Ð¢W†6WBW†6WF–öã Ð¢70Ð¢G'“ Ð¢7—2ç7FF÷WBæfÇW6‚‚Ð¢7—2ç7FFW'"æfÇW6‚‚Ð¢W†6WBW†6WF–öã Ð¢70Ð¢÷2åöW†—B‡öÆÅö6öFR–böÆÅö6öFR—2æ÷BæöæRVÇ6RÐ¢F–ÖRç6ÆVWƒÐ Ð Ð¦–bõöæÖUõòÓÒ%õöÖ–åõò# Ð¢–×÷'B×VÇF—&ö6W76–æpÐ Ð¢×VÇF—&ö6W76–æræg&VW¦U÷7W÷'B‚Ð Ð¢–×÷'B7—0Ð¢–×÷'BF‡&VF–æpÐ Ð¢–×÷'BWf–6÷&àÐ Ð¢FVbvWEög&VU÷÷'B‚“ Ð¢–×÷'B6ö6¶W@Ð Ð¢2Ò6ö6¶WBç6ö6¶WB‡6ö6¶WBäeô”äUBÂ6ö6¶WBå4ô4µõ5E$TÒÐ¢2æ&–æB‚‚##rããã"Â’Ð¢÷'BÒ2ævWG6ö6¶æÖR‚•³ÐÐ¢2æ6Æ÷6R‚Ð¢&WGW&â÷'@Ð Ð¢27FæFÆöæRf—FRFWb6W'fW"6ææ÷B6ÆÂFW&’w2vWEö&6¶VæE÷÷'B6öÖÖæBÀÐ¢26òFWfVÆ÷ÖVçB×W7BW6RF†R6ÖRFWFW&Ö–æ—7F–2÷'BF†Rg&öçFVæBF&vWG2àÐ¢2F†R6¶vVBÆ–6F–öâ¶VW2—G2G–æÖ–2×÷'B&V†f–÷W"Fòfö–B6Æ6†W0Ð¢2&WGvVVâ6öæ7W'&VçB–ç7FÆÆVB–ç7Fæ6W2àÐ¢–bvWFGG"‡7—2Â&g&÷¦Vâ"ÂfÇ6R“ Ð¢G'“ Ð¢&6¶VæE÷÷'BÒvWEög&VU÷÷'B‚Ð¢W†6WBW†6WF–öã Ð¢&6¶VæE÷÷'BÒƒÐ¢VÇ6S Ð¢&6¶VæE÷÷'BÒ–çB†÷2ævWFVçb‚$$4´TäEõõ%B"Â#ƒ"’Ð Ð¢FVbw&—FU÷vV%÷÷'B‡÷'B“ Ð¢G'“ Ð¢ÆöuöF—"Ò÷2çF‚æ¦ö–â„DDõ$ôõBÂ&Æöw2"Ð¢÷2æÖ¶VF—'2†ÆöuöF—"ÂW†—7Eöö³ÕG'VRÐ¢÷'Eöf–ÆU÷F‚Ò÷2çF‚æ¦ö–â†ÆöuöF—"Â'vV%÷÷'BçG‡B"Ð¢v—F‚÷Vâ‡÷'Eöf–ÆU÷F‚Â'r"ÂVæ6öF–æsÒ'WFbÓ‚"’2c Ð¢bçw&—FR‡7G"‡÷'B’Ð¢W†6WBW†6WF–öâ2S Ð¢&–çB†b$f–ÆVBFòw&—FRvV%÷÷'BçG‡C¢¶WÒ"Ð Ð¢w&—FU÷vV%÷÷'B†&6¶VæE÷÷'BÐ Ð¢ö6ÆVçW÷7FFRÒ²&Æör#¢æöæWÐÐ Ð¢FVb6ÆVçW÷&W6÷W&6W2‚“ Ð¢ÆörÒö6ÆVçW÷7FFRævWB‚&Æör"Ð¢–bÆös Ð¢G'“ Ð¢Æöræ6Æ÷6R‚Ð¢W†6WBW†6WF–öã Ð¢70Ð¢ö6ÆVçW÷7FFU²&Æör%ÒÒæöæPÐ Ð¢–×÷'BFW†—@Ð Ð¢FW†—Bç&Vv—7FW"†6ÆVçW÷&W6÷W&6W2Ð Ð¢2YÊ‚6–FV6"jŠ[ÈþKˆ¾ûÈÎyº>ˆÒ7FF–âTôbKº^YÊŽx‹nzˆ¾[¨ò…FW&’†÷7B’™yÎ™hži˜.˜
>[‹n˜X{®8 Ð¢FVbÖöæ—F÷%÷7FF–åöVöb‚“ Ð¢G'“ Ð¢–b7—2ç7FF–â—2æ÷BæöæS Ð¢7—2ç7FF–âç&VB‚Ð¢W†6WBW†6WF–öã Ð¢70Ð¢2TôbiŠòFW&’†÷7By¨Niˆîz+¢6‡WFF÷vâYŽ{HNûÉ¾KˆÞˆ;ÞKéÞ‹;NYYþX¹^[èÎ{i>˜îy¨Ni˜.™i>ûÈÀÐ¢2Y
nX˜r&VG’[èÎ[ú¾˜	þ™yÎ™hži˜.Xúþˆ;ÞyYžKˆ¾K¸ÞhÈiÈ’TE6ö6¶WBy¨B6–FV6.8 Ð¢6ÆVçW÷&W6÷W&6W2‚Ð¢÷2åöW†—BƒÐ Ð¢2FW&’Çv—276W2ÒÖFFÖF—"v†Vâ—B÷vç2F†R6–FV6"âÖçVÆÇÐ¢2ÆVæ6†VBW†V7WF&ÆRÖ’†fRâ–æ†W&—FVB6öç6öÆR7FF–âv†÷6RTôb×W7@Ð¢2æ÷BFW&Ö–æFRF†R6W'fW"àÐ¢–b'6VEö&w2æFFöF—# Ð¢F‡&VF–æråF‡&VB‡F&vWCÖÖöæ—F÷%÷7FF–åöVöbÂFVÖöãÕG'VR’ç7F'B‚Ð Ð¢–×÷'B6ö6¶W@Ð Ð¢Ö…÷&WG&–W2Ò0Ð¢&÷VæBÒfÇ6PÐ Ð¢f÷"GFV×B–â&ævR†Ö…÷&WG&–W2“ Ð¢G'“ Ð¢v—F‚6ö6¶WBç6ö6¶WB‡6ö6¶WBäeô”äUBÂ6ö6¶WBå4ô4µõ5E$TÒ’23 Ð¢2æ&–æB‚‚##rããã"Â&6¶VæE÷÷'B’Ð¢&÷VæBÒG'VPÐ¢'&V°Ð¢W†6WBõ4W'&÷"2S Ð¢&–çB†b%÷'B¶&6¶VæE÷÷'GÒ—2Væf–Æ&ÆS¢¶WÒ"Ð¢–bGFV×BÂÖ…÷&WG&–W2Ò Ð¢G'“ Ð¢&6¶VæE÷÷'BÒvWEög&VU÷÷'B‚Ð¢W†6WBW†6WF–öã Ð¢&6¶VæE÷÷'B³ÒÐ¢w&—FU÷vV%÷÷'B†&6¶VæE÷÷'BÐ¢&–çB†b%&WG'––ærv—F‚÷'B¶&6¶VæE÷÷'GÒâââ"Ð¢VÇ6S Ð¢&–çB‚$Ö‚&WG&–W2&V6†VBâ&6¶VæBf–ÆVBFò7F'Bâ"Ð¢7—2æW†—BƒÐ Ð¢–b&÷VæC Ð¢VÖ—E÷6–FV6%öWfVçB‚$$4´TäEõ$TE’"Â÷'CÖ&6¶VæE÷÷'BÐ Ð¢6Æ72VæGö–çDf–ÇFW"†Æövv–æräf–ÇFW"“ Ð¢FVbf–ÇFW"‡6VÆbÂ&V6÷&C¢Æövv–æräÆöu&V6÷&B’Óâ&ööÃ Ð¢–b&V6÷&Bæ&w2æBÆVâ‡&V6÷&Bæ&w2’ãÒ3 Ð¢&W÷F‚Ò7G"‡&V6÷&Bæ&w5³%ÒÐ¢–b"ö’öÆöw2"–â&W÷F‚÷""ö’ö6%÷&×2"–â&W÷Fƒ Ð¢&WGW&âfÇ6PÐ¢&WGW&âG'VPÐ Ð¢Æövv–ærævWDÆövvW"‚'Wf–6÷&âæ66W72"’æFDf–ÇFW"„VæGö–çDf–ÇFW"‚’Ð¢Wf–6÷&âç'Vâ†Â†÷7CÒ##rããã"Â÷'CÖ&6¶VæE÷÷'BÐ