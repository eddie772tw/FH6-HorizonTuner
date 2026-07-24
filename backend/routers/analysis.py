import json
import os
import time

from fastapi import APIRouter
from fastapi.responses import FileResponse

from backend.core.config import ANALYSIS_LAYOUT_FILE, SESSIONS_DB_PATH, SESSIONS_DIR
from backend.services.motec_exporter import export_session_to_motec_csv
from backend.services.recorders import RaceRecorder
from backend.services.telemetry_sqlite import TelemetrySQLite

router = APIRouter(prefix="/api/analysis", tags=["Post-Race Analysis"])

telemetry_db = TelemetrySQLite(SESSIONS_DB_PATH)
race_recorder = RaceRecorder(telemetry_db)


@router.get("/config")
async def get_analysis_config():
    if os.path.exists(ANALYSIS_LAYOUT_FILE):
        try:
            with open(ANALYSIS_LAYOUT_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
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


@router.post("/config")
async def save_analysis_config(config: dict):
    try:
        os.makedirs(os.path.dirname(ANALYSIS_LAYOUT_FILE), exist_ok=True)
        with open(ANALYSIS_LAYOUT_FILE, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=4)
        return {"message": "Analysis layout saved successfully"}
    except Exception as e:
        return {"error": f"Failed to save analysis layout: {e}"}


@router.get("/status")
async def get_analysis_status():
    return {
        "isRecording": race_recorder.is_recording,
        "recordingCount": race_recorder.total_count,
        "currentSessionId": race_recorder.current_session_id,
    }


@router.get("/data")
async def get_current_analysis_data(lap: int = 0):
    if race_recorder.current_session_id:
        return telemetry_db.get_telemetry_points(
            race_recorder.current_session_id, lap_number=lap if lap > 0 else None
        )
    sessions = telemetry_db.list_all_sessions()
    if sessions:
        latest_id = sessions[0]["session_id"]
        return telemetry_db.get_telemetry_points(
            latest_id, lap_number=lap if lap > 0 else None
        )
    return []


@router.post("/clear")
async def clear_analysis_data():
    race_recorder.clear()
    return {"message": "Current recording session cleared."}


@router.post("/recorder/start")
async def start_manual_recording():
    race_recorder.clear()
    race_recorder.manual_mode = True
    race_recorder.is_recording = True
    race_recorder.current_session_id = f"session_{int(time.time())}"

    telemetry_db.create_session(
        session_id=race_recorder.current_session_id,
        car_ordinal=0,
        car_name="Manual Session",
        start_time=time.time(),
    )
    return {
        "message": "Manual recording started successfully",
        "sessionId": race_recorder.current_session_id,
    }


@router.post("/recorder/stop")
async def stop_manual_recording():
    if not race_recorder.is_recording or not race_recorder.manual_mode:
        return {"error": "Manual recording is not active"}
    race_recorder.manual_mode = False
    race_recorder.save_latest_and_clear({})
    return {"message": "Manual recording stopped and saved successfully"}


@router.get("/sessions")
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
    except Exception:
        return []


@router.get("/sessions/{session_id}/laps")
async def get_session_laps(session_id: str):
    return telemetry_db.get_session_laps(session_id)


@router.get("/sessions/{session_id}")
async def load_saved_session(session_id: str, lap: int = 0):
    try:
        data = telemetry_db.get_telemetry_points(
            session_id, lap_number=lap if lap > 0 else None
        )
        if data:
            return data
    except Exception as e:
        return {"error": f"Failed to read session telemetry: {e}"}
    return []


@router.delete("/sessions/{session_id}")
async def delete_saved_session(session_id: str):
    try:
        success = telemetry_db.delete_session(session_id)
        if success:
            return {"message": "Session deleted successfully"}
    except Exception as e:
        return {"error": f"Failed to delete session: {e}"}
    return {"error": "Session not found"}


@router.get("/export/motec/{session_id}")
async def export_motec_session(session_id: str):
    sessions = telemetry_db.list_all_sessions()
    session_meta = next((s for s in sessions if s["session_id"] == session_id), None)
    if not session_meta:
        return {"error": "Session not found"}

    points = telemetry_db.get_telemetry_points(session_id)
    if not points:
        return {"error": "No telemetry data points found in session"}

    export_filename = f"{session_id}_motec.csv"
    export_filepath = os.path.join(SESSIONS_DIR, export_filename)

    success = export_session_to_motec_csv(session_meta, points, export_filepath)
    if success and os.path.exists(export_filepath):
        return FileResponse(
            export_filepath, filename=export_filename, media_type="text/csv"
        )
    return {"error": "Failed to generate MoTeC CSV export"}
