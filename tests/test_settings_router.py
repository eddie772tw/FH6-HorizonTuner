import json

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.settings_persistence import SettingsPersistence
from backend.settings_router import create_settings_router


def test_storage_overview_route_does_not_disclose_its_data_root(tmp_path):
    store = SettingsPersistence(tmp_path / "private-app-data" / "settings.json")
    store.save({"language": "en-us"})
    app = FastAPI()

    async def update_settings(data: dict) -> dict:
        return data

    app.include_router(
        create_settings_router(
            get_settings=lambda: {"language": "en-us"},
            update_settings=update_settings,
            get_storage_overview=store.storage_overview,
        )
    )

    response = TestClient(app).get("/api/settings/storage-overview")

    assert response.status_code == 200
    assert str(tmp_path) not in json.dumps(response.json())
    assert response.json()["capabilities"]["settings_backup_recovery"] == "available"
