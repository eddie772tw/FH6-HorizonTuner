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
    assert data["hudStyle"] == "advanced"
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
