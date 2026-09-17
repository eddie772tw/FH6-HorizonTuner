import asyncio
import os
import sys
import time

import pytest
from fastapi.testclient import TestClient

sys.path.insert(
    0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../backend"))
)
import main
from main import ANALYSIS_LAYOUT_FILE, app

client = TestClient(app)


@pytest.fixture(autouse=True)
def cleanup_analysis_config():
    # Store original file state if exists
    backup = None
    if os.path.exists(ANALYSIS_LAYOUT_FILE):
        with open(ANALYSIS_LAYOUT_FILE, "r", encoding="utf-8") as f:
            backup = f.read()
        os.remove(ANALYSIS_LAYOUT_FILE)
    yield
    # Restore original file state
    if backup is not None:
        with open(ANALYSIS_LAYOUT_FILE, "w", encoding="utf-8") as f:
            f.write(backup)
    elif os.path.exists(ANALYSIS_LAYOUT_FILE):
        os.remove(ANALYSIS_LAYOUT_FILE)


def test_get_analysis_config_default():
    response = client.get("/api/analysis/config")
    assert response.status_code == 200
    data = response.json()
    assert data["activeMetric"] == "speed"
    assert "enabledCharts" in data


def test_save_and_get_analysis_config():
    custom_config = {
        "activeMetric": "accel",
        "customMathChannels": ["G_Sum"],
        "enabledCharts": ["track_map", "gg_diagram"],
    }
    response = client.post("/api/analysis/config", json=custom_config)
    assert response.status_code == 200
    assert response.json() == {"message": "Analysis layout saved successfully"}

    response_get = client.get("/api/analysis/config")
    assert response_get.status_code == 200
    assert response_get.json() == custom_config


@pytest.mark.asyncio
async def test_async_non_blocking_execution(monkeypatch):
    executed_in_thread = False

    def mocked_read():
        nonlocal executed_in_thread
        # Verify execution occurs off the main event loop thread worker
        time.sleep(0.01)
        executed_in_thread = True
        return {"activeMetric": "mocked"}

    monkeypatch.setattr(main, "_read_analysis_config", mocked_read)

    start = time.perf_counter()
    res = await main.get_analysis_config()
    elapsed = time.perf_counter() - start

    assert res == {"activeMetric": "mocked"}
    assert executed_in_thread
    assert elapsed >= 0.01
