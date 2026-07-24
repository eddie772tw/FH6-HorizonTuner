from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

def test_get_theme_config():
    response = client.get("/api/theme/config")
    assert response.status_code == 200
    assert isinstance(response.json(), dict)

def test_update_theme_config():
    payload = {"primaryColor": "#ff00ff"}
    response = client.post("/api/theme/config", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["theme"]["primaryColor"] == "#ff00ff"
