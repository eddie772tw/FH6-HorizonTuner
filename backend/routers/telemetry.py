import json
import logging
import os

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

import backend.core.config as config
from backend.core.state import manager

logger = logging.getLogger("backend.telemetry_router")

router = APIRouter(tags=["Telemetry & HUD Overlay"])

DEFAULT_HUD_CONFIG = {
    "enabled": False,
    "hudStyle": "advanced",
    "position": {"x": 100, "y": 100},
    "scale": 1.0,
    "unit": "kmh",
    "elements": {
        "showRPM": True,
        "showSpeed": True,
        "showGear": True,
        "showPowerTorque": True,
        "showBoost": True,
        "showWheelLockup": True,
        "showMotionEffect": True,
    },
    "soundEnabled": False,
}


@router.websocket("/ws/telemetry")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket, is_binary=False)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, is_binary=False)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket, is_binary=False)


@router.websocket("/ws/telemetry/binary")
async def websocket_binary_endpoint(websocket: WebSocket):
    await manager.connect(websocket, is_binary=True)
    try:
        while True:
            await websocket.receive_bytes()
    except WebSocketDisconnect:
        manager.disconnect(websocket, is_binary=True)
    except Exception as e:
        logger.error(f"Binary WebSocket error: {e}")
        manager.disconnect(websocket, is_binary=True)


@router.get("/api/overlay/config")
@router.get("/api/overlay/layout")
async def get_overlay_config():
    hud_file = config.HUD_CONFIG_FILE
    if os.path.exists(hud_file):
        try:
            with open(hud_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Failed to load hud_config.json: {e}")
    return DEFAULT_HUD_CONFIG


@router.post("/api/overlay/config")
@router.post("/api/overlay/layout")
async def save_overlay_config(data: dict):
    hud_file = config.HUD_CONFIG_FILE
    try:
        os.makedirs(os.path.dirname(hud_file), exist_ok=True)
        with open(hud_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        return {"message": "HUD config saved successfully", "success": True}
    except Exception as e:
        logger.error(f"Failed to save hud_config.json: {e}")
        return {"error": f"Failed to save HUD config: {e}", "success": False}
