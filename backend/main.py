import asyncio
import logging
import os
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import backend.core.config as config
from backend.core.config import DATA_ROOT, LOG_DIR, RESOURCE_ROOT, SESSIONS_DB_PATH
from backend.core.logging_config import setup_logging
from backend.core.state import (
    current_udp_ip_port,
    current_udp_transport,
    manager,
    telemetry_queue,
)
from backend.routers import analysis, drag, settings, telemetry, theme, tuning
from backend.services.recorders import (
    DragRecorder,
    RaceRecorder,
    drag_recorder,
    race_recorder,
)
from backend.services.telemetry_listener import (
    pack_telemetry_binary,
    start_udp_listener,
)
from backend.services.telemetry_sqlite import TelemetrySQLite

logger = setup_logging()
telemetry_db = TelemetrySQLite(SESSIONS_DB_PATH)


async def broadcast_telemetry_loop():
    logger.info("Broadcasting loop started.")
    while True:
        data = await telemetry_queue.get()

        race_recorder.record(data, settings.app_settings.get("race_recording", True))
        drag_recorder.record(data)

        if telemetry_queue.qsize() > 5:
            try:
                while telemetry_queue.qsize() > 1:
                    telemetry_queue.get_nowait()
            except asyncio.QueueEmpty:
                pass

        if manager.active_connections:
            await manager.broadcast_json(data)

        if manager.active_binary_connections:
            binary_data = pack_telemetry_binary(data)
            await manager.broadcast_binary(binary_data)

        await asyncio.sleep(0)


@asynccontextmanager
async def lifespan(app_inst: FastAPI):
    global current_udp_transport, current_udp_ip_port
    ip = settings.app_settings.get("telemetry_ip", os.getenv("TELEMETRY_IP", "0.0.0.0"))
    port = int(
        settings.app_settings.get("telemetry_port", os.getenv("TELEMETRY_PORT", 8000))
    )
    current_udp_ip_port = (ip, port)

    try:
        current_udp_transport = await start_udp_listener(ip, port, telemetry_queue)
    except Exception as e:
        logger.error(f"Failed to start UDP Telemetry listener on {ip}:{port}: {e}")

    asyncio.create_task(broadcast_telemetry_loop())
    yield
    if current_udp_transport:
        current_udp_transport.close()


app = FastAPI(title="FH6 Telemetry Tuning Tool API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(telemetry.router)
app.include_router(tuning.router)
app.include_router(drag.router)
app.include_router(analysis.router)
app.include_router(theme.router)
app.include_router(settings.router)


# Module-level property wrapper for tests compatibility
class MainModule(sys.modules[__name__].__class__):
    @property
    def backend_log_path(self):
        return config.backend_log_path

    @backend_log_path.setter
    def backend_log_path(self, val):
        config.backend_log_path = val

    @property
    def HUD_CONFIG_FILE(self):
        return config.HUD_CONFIG_FILE

    @HUD_CONFIG_FILE.setter
    def HUD_CONFIG_FILE(self, val):
        config.HUD_CONFIG_FILE = val


sys.modules[__name__].__class__ = MainModule


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
