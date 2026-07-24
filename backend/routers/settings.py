import json
import logging
import os
import re
from typing import Any, Dict, Optional

from fastapi import APIRouter

import backend.core.config as config
from backend.core.config import LANG_DIR, SETTINGS_FILE

logger = logging.getLogger("backend.settings")

router = APIRouter(prefix="/api", tags=["Settings & Logs"])

DEFAULT_SETTINGS = {
    "dyno_recording": True,
    "race_recording": True,
    "language": "en-us",
    "dyno_test_gear": 4,
    "dyno_filter_slip": True,
    "dyno_filter_transients": True,
    "telemetry_ip": "0.0.0.0",
    "telemetry_port": 20127,
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
    "theme": {
        "mode": "dark",
        "primaryColor": "#00f0ff",
        "secondaryColor": "#ff003c",
        "accentColor": "#7000ff",
        "customCSS": "",
        "slots": [],
    },
}

app_settings = dict(DEFAULT_SETTINGS)

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
    except Exception as e:
        logger.error(f"Failed to load settings: {e}")


def save_app_settings():
    try:
        with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(app_settings, f, indent=4)
        return True
    except Exception as e:
        logger.error(f"Failed to save settings: {e}")
        return False


@router.get("/settings")
async def get_settings():
    return app_settings


@router.post("/settings")
async def update_settings(data: Dict[str, Any]):
    for k, v in data.items():
        if k == "units" and isinstance(v, dict):
            app_settings["units"].update(v)
        elif k == "theme" and isinstance(v, dict):
            app_settings["theme"].update(v)
        else:
            app_settings[k] = v
    save_app_settings()
    return app_settings


LOG_LINE_PATTERN = re.compile(
    r"^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3}) \[(\w+)\] ([\w\.-]+): (.*)$"
)


@router.get("/logs")
async def get_logs(level: Optional[str] = None, limit: int = 300):
    log_path = config.backend_log_path
    if not os.path.exists(log_path):
        return {"logs": []}

    try:
        with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()
    except Exception as e:
        return {"error": f"Failed to read log file: {e}"}

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
            if current_entry:
                current_entry["message"] += "\n" + line_str
            else:
                current_entry = {
                    "timestamp": "",
                    "level": "INFO",
                    "logger": "stdout",
                    "message": line_str,
                }

    if current_entry:
        parsed_logs.append(current_entry)

    if level and level.upper() != "ALL":
        target_level = level.upper()
        parsed_logs = [log for log in parsed_logs if log["level"] == target_level]

    return {"logs": parsed_logs[-limit:]}


@router.delete("/logs")
async def clear_logs():
    log_path = config.backend_log_path
    if os.path.exists(log_path):
        try:
            with open(log_path, "w", encoding="utf-8") as f:
                f.write("")
            return {"message": "Logs cleared successfully"}
        except Exception as e:
            return {"error": f"Failed to clear logs: {e}"}
    return {"message": "Log file does not exist"}


@router.get("/languages")
async def list_languages():
    languages = [{"code": "en-us", "name": "English (US)"}]
    if os.path.exists(LANG_DIR):
        for filename in os.listdir(LANG_DIR):
            if filename.endswith(".json"):
                code = filename[:-5].lower()
                if code == "en-us":
                    continue
                file_path = os.path.join(LANG_DIR, filename)
                try:
                    with open(file_path, "r", encoding="utf-8") as f:
                        lang_data = json.load(f)
                        name = lang_data.get("__language_name__", filename[:-5])
                        languages.append({"code": code, "name": name})
                except Exception:
                    pass
    return languages


@router.get("/languages/{code}")
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
            return {"error": str(e)}
    return {"error": "Language not found"}
