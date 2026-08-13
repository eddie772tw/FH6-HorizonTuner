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
root_logger.addHandler(file_