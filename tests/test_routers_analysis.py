import json
import os
import time

import pytest
from fastapi.testclient import TestClient

from backend.core.config import ANALYSIS_LAYOUT_FILE
from backend.main import app
from backend.routers.analysis import race_recorder, telemetry_db

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_and_teardown():
    # Ensure a clean state before each test
    race_recorder.clear()

    # Clean up the DB
    sessions = telemetry_db.list_all_sessions()
    for s in sessions:
        telemetry_db.delete_session(s["session_id"])

    if os.path.exists(ANALYSIS_LAYOUT_FILE):
        os.remove(ANALYSIS_LAYOUT_FILE)

    yield

    race_recorder.clear()


def test_get_analysis_config_default():
    response = client.get("/api/analysis/config")
    assert response.status_code == 200
    data = response.json()
    assert "enabledCharts" in data
    assert "track_map" in data["enabledCharts"]


def test_save_and_get_analysis_config():
    test_config = {
        "activeMetric": "rpm",
        "customMathChannels": [{"name": "Test"}],
        "enabledCharts": ["gg_diagram"],
    }
    response = client.post("/api/analysis/config", json=test_config)
    assert response.status_code == 200
    assert "successfully" in response.json().get("message", "")

    response = client.get("/api/analysis/config")
    assert response.status_code == 200
    data = response.json()
    assert data["activeMetric"] == "rpm"
    assert "gg_diagram" in data["enabledCharts"]
    assert "track_map" not in data["enabledCharts"]


def test_analysis_status():
    response = client.get("/api/analysis/status")
    assert response.status_code == 200
    data = response.json()
    assert "isRecording" in data
    assert "recordingCount" in data


def test_manual_recording_lifecycle():
    # Start manual recording
    res = client.post("/api/analysis/recorder/start")
    assert res.status_code == 200
    data = res.json()
    assert "sessionId" in data
    session_id = data["sessionId"]

    # Check status
    res = client.get("/api/analysis/status")
    assert res.json()["isRecording"] is True

    # Add a mock telemetry point via the recorder
    race_recorder.in_memory_batch.append({"time": 0.1, "speed": 100, "LapNumber": 1})

    # Get current analysis data
    res = client.get("/api/analysis/data")
    assert res.status_code == 200

    # Stop manual recording
    res = client.post("/api/analysis/recorder/stop")
    assert res.status_code == 200

    # List sessions
    res = client.get("/api/analysis/sessions")
    assert res.status_code == 200
    sessions = res.json()
    assert len(sessions) >= 1
    assert any(s["session_id"] == session_id for s in sessions)

    # Load saved session
    res = client.get(f"/api/analysis/sessions/{session_id}")
    assert res.status_code == 200

    # Delete saved session
    res = client.delete(f"/api/analysis/sessions/{session_id}")
    assert res.status_code == 200

    # Verify deletion
    res = client.get(f"/api/analysis/sessions/{session_id}")
    assert res.json() == []  # Empty or error


def test_stop_manual_recording_when_not_recording():
    res = client.post("/api/analysis/recorder/stop")
    assert res.status_code == 200
    assert "error" in res.json()


def test_clear_analysis_data():
    client.post("/api/analysis/recorder/start")
    res = client.post("/api/analysis/clear")
    assert res.status_code == 200
    assert "cleared" in res.json().get("message", "")


def test_export_motec_session_not_found():
    res = client.get("/api/analysis/export/motec/invalid_session_id")
    assert res.status_code == 200
    assert "error" in res.json()
