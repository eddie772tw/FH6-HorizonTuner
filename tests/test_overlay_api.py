import os
import tempfile

import main
import pytest
from fastapi.testclient import TestClient
from main import app


@pytest.fixture
def temp_hud_config_file():
    fd, temp_path = tempfile.mkstemp(suffix=".json")
    os.close(fd)
    if os.path.exists(temp_path):
        os.remove(temp_path)

    orig_path = main.HUD_CONFIG_FILE
    main.HUD_CONFIG_FILE = temp_path

    yield temp_path

    main.HUD_CONFIG_FILE = orig_path
    if os.path.exists(temp_path):
        os.remove(temp_path)


def test_get_hud_config_default(temp_hud_config_file):
    client = TestClient(app)
    response = client.get("/api/overlay/config")
    assert response.status_code == 200

    data = response.json()
    assert data["hudStyle"] == "vfd"
    assert "elements" in data
    assert data["elements"]["showRPM"] is True


def test_save_and_get_hud_config(temp_hud_config_file):
    client = TestClient(app)

    custom_config = {
        "enabled": True,
        "hudStyle": "simple",
        "position": {"x": 200, "y": 200},
        "scale": 1.2,
        "unit": "kmh",
        "elements": {
            "showRPM": True,
            "showSpeed": False,
            "showGear": True,
            "showPowerTorque": True,
            "showBoost": True,
            "showWheelLockup": True,
            "showMotionEffect": False,
        },
        "soundEnabled": True,
    }

    post_res = client.post("/api/overlay/config", json=custom_config)
    assert post_res.status_code == 200
    assert post_res.json()["success"] is True

    get_res = client.get("/api/overlay/config")
    assert get_res.status_code == 200

    loaded_data = get_res.json()
    assert loaded_data["hudStyle"] == "simple"
    assert loaded_data["elements"]["showSpeed"] is False


def test_reset_hud_config(temp_hud_config_file):
    client = TestClient(app)

    # First modify config
    client.post("/api/overlay/config", json={"hudStyle": "vfd"})

    # Then reset
    reset_res = client.post("/api/overlay/reset")
    assert reset_res.status_code == 200
    assert reset_res.json()["success"] is True

    # Verify reset back to default
    get_res = client.get("/api/overlay/config")
    assert get_res.status_code == 200
    data = get_res.json()
    assert data["hudStyle"] == "vfd"
    assert data["elements"]["showTeleTires"] is True


def test_get_system_media_endpoint():
    client = TestClient(app)
    res = client.get("/api/overlay/system_media")
    assert res.status_code == 200
    data = res.json()
    assert "title" in data
    assert "artist" in data
    assert "status" in data
    assert data["success"] is True


def test_get_audio_spectrum_endpoint():
    client = TestClient(app)
    res = client.get("/api/overlay/audio_spectrum")
    assert res.status_code == 200
    data = res.json()
    assert "spectrum" in data
    assert len(data["spectrum"]) == 32
    assert "vu_left" in data
    assert "vu_right" in data
    assert data["success"] is True
