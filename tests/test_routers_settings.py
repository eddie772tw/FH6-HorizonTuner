import os
import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.core.config import SETTINGS_FILE, backend_log_path, LANG_DIR

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_and_teardown():
    # Setup test logs
    with open(backend_log_path, "w", encoding="utf-8") as f:
        f.write("2026-07-24 10:00:00,000 [INFO] test.logger: Test log line 1\n")
        f.write("2026-07-24 10:00:01,000 [ERROR] test.logger: Test error line\n")
        f.write("    A stack trace continuation line\n")
    
    # Backup original settings
    original_settings = None
    if os.path.exists(SETTINGS_FILE):
        with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
            original_settings = f.read()
    
    yield
    
    # Restore settings
    if original_settings is not None:
        with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
            f.write(original_settings)
    elif os.path.exists(SETTINGS_FILE):
        os.remove(SETTINGS_FILE)

def test_get_settings():
    response = client.get("/api/settings")
    assert response.status_code == 200
    data = response.json()
    assert "language" in data
    assert "theme" in data

def test_update_settings():
    new_settings = {
        "language": "zh-tw",
        "units": {"speed": "mph"},
        "theme": {"primaryColor": "#ffffff"}
    }
    response = client.post("/api/settings", json=new_settings)
    assert response.status_code == 200
    data = response.json()
    assert data["language"] == "zh-tw"
    assert data["units"]["speed"] == "mph"
    assert data["theme"]["primaryColor"] == "#ffffff"
    
    # Check if saved
    response = client.get("/api/settings")
    data = response.json()
    assert data["language"] == "zh-tw"

def test_get_logs():
    response = client.get("/api/logs")
    assert response.status_code == 200
    data = response.json()
    assert "logs" in data
    logs = data["logs"]
    assert len(logs) == 2
    assert logs[0]["level"] == "INFO"
    assert logs[1]["level"] == "ERROR"
    assert "stack trace continuation line" in logs[1]["message"]

def test_get_logs_filtered():
    response = client.get("/api/logs?level=error")
    assert response.status_code == 200
    logs = response.json()["logs"]
    assert len(logs) == 1
    assert logs[0]["level"] == "ERROR"

def test_clear_logs():
    response = client.delete("/api/logs")
    assert response.status_code == 200
    
    response = client.get("/api/logs")
    assert response.status_code == 200
    assert len(response.json()["logs"]) <= 1

def test_list_languages():
    # Make sure en-us is always there
    response = client.get("/api/languages")
    assert response.status_code == 200
    langs = response.json()
    assert isinstance(langs, list)
    assert any(l["code"] == "en-us" for l in langs)

def test_get_language():
    response = client.get("/api/languages/en-us")
    assert response.status_code == 200
    assert response.json() == {}

def test_get_language_not_found():
    response = client.get("/api/languages/invalid_lang")
    assert response.status_code == 200
    assert "error" in response.json()
