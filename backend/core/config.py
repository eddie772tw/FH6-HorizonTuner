import os
import sys

if getattr(sys, "frozen", False):
    RESOURCE_ROOT = sys._MEIPASS
    DATA_ROOT = os.path.dirname(sys.executable)

    CAR_DB_PATH = os.path.join(RESOURCE_ROOT, "car_database.json")
    LANG_DIR = os.path.join(RESOURCE_ROOT, "lang")

    TUNINGS_DIR = os.path.join(DATA_ROOT, "tunings")
    CAR_PARAMS_DIR = os.path.join(DATA_ROOT, "car_params")
    SESSIONS_DIR = os.path.join(DATA_ROOT, "sessions")
    DRAG_SESSIONS_DIR = os.path.join(DATA_ROOT, "drag_sessions")
    USER_CONFIGS_DIR = os.path.join(DATA_ROOT, "user_configs")
    SETTINGS_FILE = os.path.join(DATA_ROOT, "settings.json")
    HUD_CONFIG_FILE = os.path.join(DATA_ROOT, "hud_config.json")
    LOG_DIR = os.path.join(DATA_ROOT, "logs")
else:
    RESOURCE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    DATA_ROOT = os.path.join(RESOURCE_ROOT, "backend")

    CAR_DB_PATH = os.path.join(DATA_ROOT, "car_database.json")
    LANG_DIR = os.path.join(RESOURCE_ROOT, "lang")

    TUNINGS_DIR = os.path.join(DATA_ROOT, "tunings")
    CAR_PARAMS_DIR = os.path.join(DATA_ROOT, "car_params")
    SESSIONS_DIR = os.path.join(DATA_ROOT, "sessions")
    DRAG_SESSIONS_DIR = os.path.join(DATA_ROOT, "drag_sessions")
    USER_CONFIGS_DIR = os.path.join(DATA_ROOT, "user_configs")
    SETTINGS_FILE = os.path.join(DATA_ROOT, "settings.json")
    HUD_CONFIG_FILE = os.path.join(DATA_ROOT, "hud_config.json")
    LOG_DIR = os.path.join(DATA_ROOT, "logs")

SESSIONS_DB_PATH = os.path.join(SESSIONS_DIR, "telemetry_sessions.db")
ANALYSIS_LAYOUT_FILE = os.path.join(USER_CONFIGS_DIR, "analysis_layout.json")
backend_log_path = os.path.join(LOG_DIR, "backend.log")

for d in [
    TUNINGS_DIR,
    CAR_PARAMS_DIR,
    SESSIONS_DIR,
    DRAG_SESSIONS_DIR,
    USER_CONFIGS_DIR,
    LOG_DIR,
]:
    os.makedirs(d, exist_ok=True)
