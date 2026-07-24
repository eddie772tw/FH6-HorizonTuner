import os
import pytest
from fastapi.testclient import TestClient
from backend.main import app
import backend.core.config as config

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_and_teardown():
    original_config = None
    if os.path.exists(config.HUD_CONFIG_FILE):
        with open(config.HUD_CONFIG_FILE, "r", encoding="utf-8") as f:
            original_config = f.read()
    
    yield
    
    if original_config is not None:
        with open(config.HUD_CONFIG_FILE, "w", encoding="utf-8") as f:
            f.write(original_config)
    elif os.path.exists(config.HUD_CONFIG_FILE):
        os.remove(config.HUD_CONFIG_FILE)

def test_get_overlay_config_default():
    if os.path.exists(config.HUD_CONFIG_FILE):
        os.remove(config.HUD_CONFIG_FILE)
    response = client.get("/api/overlay/config")
    assert response.status_code == 200
    assert "hudStyle" in response.json()

def test_save_and_get_overlay_config():
    payload = {"hudStyle": "test_style", "position": {"x": 50, "y": 50}}
    res_post = client.post("/api/overlay/config", json=payload)
    assert res_post.status_code == 200
    assert res_post.json()["success"] is True

    res_get = client.get("/api/overlay/config")
    assert res_get.status_code == 200
    data = res_get.json()
    assert data["hudStyle"] == "test_style"

def test_websocket_telemetry():
    with client.websocket_connect("/ws/telemetry") as websocket:
        websocket.send_text("Hello")
        # Just sending text shouldn't crash it, it just receives in a loop

def test_websocket_telemetry_binary():
    with client.websocket_connect("/ws/telemetry/binary") as websocket:
        websocket.send_bytes(b"Hello")
