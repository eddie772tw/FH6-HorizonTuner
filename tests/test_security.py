import json
import os
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.append(
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
)

from main import app, get_tuning, load_car_params, save_car_params, save_tuning

client = TestClient(app)


def test_load_car_params_path_traversal():
    result = load_car_params("../../etc/passwd")
    assert result is None


@pytest.mark.asyncio
async def test_get_tuning_path_traversal():
    # Call the backend function directly to avoid fastapi 404 router issues
    result = await get_tuning("malicious", "../../etc/passwd")
    assert result == {"error": "Tuning not found"}


@pytest.mark.asyncio
async def test_save_tuning_path_traversal(tmp_path):
    import main

    orig_dir = main.TUNINGS_DIR
    main.TUNINGS_DIR = str(tmp_path)

    try:
        await save_tuning("malicious", "../../etc/passwd", {"some": "data"})
        expected_path = os.path.join(str(tmp_path), "malicious-passwd.json")
        assert os.path.exists(expected_path)
    finally:
        main.TUNINGS_DIR = orig_dir


def test_save_car_params_path_traversal(tmp_path):
    import main

    orig_dir = main.CAR_PARAMS_DIR
    main.CAR_PARAMS_DIR = str(tmp_path)

    try:
        save_car_params("../../etc/passwd", {"some": "data"})
        expected_path = os.path.join(str(tmp_path), "passwd.json")
        assert os.path.exists(expected_path)
        with open(expected_path, "r") as f:
            data = json.load(f)
            assert data == {"some": "data"}
    finally:
        main.CAR_PARAMS_DIR = orig_dir


def test_cors_preflight_valid_origins():
    valid_origins = [
        "tauri://localhost",
        "https://tauri.localhost",
        "http://tauri.localhost",
        "http://localhost:1420",
        "http://127.0.0.1:52234",
    ]
    for origin in valid_origins:
        res = client.options(
            "/api/overlay/config",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        assert res.status_code == 200, f"Failed for origin: {origin}"
        assert res.headers.get("access-control-allow-origin") == origin


def test_cors_preflight_blocked_origins():
    blocked_origins = [
        "https://evil-attacker.com",
        "http://malicious-website.org",
        "http://localhost.evil.com",
    ]
    for origin in blocked_origins:
        res = client.options(
            "/api/overlay/config",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        assert res.headers.get("access-control-allow-origin") != origin
