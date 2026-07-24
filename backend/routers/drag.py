import json
import logging
import os
import time
from typing import Any, Dict

from fastapi import APIRouter

from backend.core.config import DRAG_SESSIONS_DIR
from backend.services.recorders import drag_recorder

logger = logging.getLogger("backend.drag_router")

router = APIRouter(prefix="/api/drag", tags=["Drag Test"])


@router.get("/status")
async def get_drag_status():
    return {
        "status": drag_recorder.status,
        "point_count": len(drag_recorder.current_session),
        "car_id": drag_recorder.car_id,
    }


@router.post("/prepare")
async def prepare_drag_test():
    drag_recorder.prepare()
    return {
        "status": "waiting",
        "message": "Drag recorder prepared, waiting for launch.",
    }


@router.post("/cancel")
async def cancel_drag_test():
    drag_recorder.clear()
    return {"status": "idle"}


@router.get("/result")
@router.get("/analysis")
async def get_drag_result():
    return drag_recorder.analysis_result


@router.get("/data")
async def get_drag_data():
    return drag_recorder.current_session


@router.post("/sessions/save")
async def save_drag_session():
    if not drag_recorder.current_session or not drag_recorder.analysis_result:
        return {"error": "No drag session data to save."}

    timestamp = int(time.time())
    filename = f"drag_{timestamp}.json"
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
        os.makedirs(DRAG_SESSIONS_DIR, exist_ok=True)
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(session_payload, f, indent=4)
        return {"message": "Drag session saved successfully", "filename": filename}
    except Exception as e:
        logger.error(f"Failed to save drag session to {filename}: {e}")
        return {"error": f"Failed to save session: {e}"}


@router.get("/sessions")
async def list_drag_sessions():
    try:
        if not os.path.exists(DRAG_SESSIONS_DIR):
            return []
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


@router.get("/sessions/{filename}")
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


@router.delete("/sessions/{filename}")
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
