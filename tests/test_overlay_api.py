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


def test_legacy_s650_style_is_migrated_to_hmi_mode(temp_hud_config_file):
    client = TestClient(app)

    post_res = client.post(
        "/api/overlay/config",
        json={"hudStyle": "s650_sport", "enabled": True},
    )
    assert post_res.status_code == 200
    assert post_res.json()["success"] is True

    get_res = client.get("/api/overlay/config")
    assert get_res.status_code == 200
    loaded_data = get_res.json()
    assert loaded_data["hudStyle"] == "s650_hmi"
    assert loaded_data["s650Theme"] == "sport"


def test_invalid_s650_hmi_mode_defaults_to_normal(temp_hud_config_file):
    client = TestClient(app)

    client.post(
        "/api/overlay/config",
        json={"hudStyle": "s650_hmi", "s650Theme": "does-not-exist"},
    )

    loaded_data = client.get("/api/overlay/config").json()
    assert loaded_data["hudStyle"] == "s650_hmi"
    assert loaded_data["s650Theme"] == "normal"


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


def test_get_hud_styles_scan():
    client = TestClient(app)
    res = client.get("/api/hud/styles")
    assert res.status_code == 200
    data = res.json()
    assert "styles" in data
    style_ids = [style["id"] for style in data["styles"]]

    for expected_hud in ["simple", "advanced", "vfd", "gt7", "drift", "s650_hmi"]:
        assert expected_hud in style_ids

    for ignored in ["shared", "assets", "telemetry"]:
        assert ignored not in style_ids

    for style in data["styles"]:
        assert "id" in style
        assert "source" in style
        assert "urlPrefix" in style


def test_hud_styles_strict_filesystem_consistency():
    client = TestClient(app)
    res = client.get("/api/hud/styles")
    assert res.status_code == 200
    api_style_ids = {style["id"] for style in res.json()["styles"]}

    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    hud_dir = os.path.join(project_root, "hud_overlay")
    expected_hud_ids = {
        entry.name
        for entry in os.scandir(hud_dir)
        if (
            entry.is_dir()
            and entry.name.lower() not in main.IGNORED_HUD_DIRS
            and os.path.isfile(os.path.join(entry.path, "index.html"))
        )
    }

    assert api_style_ids == expected_hud_ids
