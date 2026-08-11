import asyncio
import json
import os
import tempfile

import main
import pytest


@pytest.fixture
def mock_car_params_dir(monkeypatch):
    with tempfile.TemporaryDirectory() as temp_dir:
        monkeypatch.setattr(main, "CAR_PARAMS_DIR", temp_dir)
        yield temp_dir


def test_load_car_params_exists(mock_car_params_dir):
    car_id = "test_car_123"
    test_data = {"param1": 1, "param2": "value"}

    file_path = os.path.join(mock_car_params_dir, f"{car_id}.json")
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(test_data, f)

    result = main.load_car_params(car_id)
    assert result == test_data


def test_load_car_params_not_exists(mock_car_params_dir):
    car_id = "nonexistent_car"

    result = main.load_car_params(car_id)
    assert result is None


def test_save_car_params(mock_car_params_dir):
    car_id = "test_car_456"
    test_data = {"speed": 100, "weight": 2000}

    main.save_car_params(car_id, test_data)

    file_path = os.path.join(mock_car_params_dir, f"{car_id}.json")
    assert os.path.exists(file_path)
    with open(file_path, "r", encoding="utf-8") as f:
        saved_data = json.load(f)

    assert saved_data == test_data


def test_car_params_api_prefers_the_live_profile_cache(monkeypatch):
    cached_profile = {"weight": 1200, "dyno_curve": {}}
    monkeypatch.setattr(main, "dyno_cache", {"42": cached_profile})

    def fail_disk_lookup(_car_id: str):
        raise AssertionError("the API should not read disk when the cache is ready")

    monkeypatch.setattr(main, "load_car_params", fail_disk_lookup)

    response = asyncio.run(main.get_car_params("42"))

    assert response == cached_profile


def test_car_params_update_uses_the_shared_background_writer(monkeypatch):
    scheduled: list[tuple[str, dict]] = []

    class RecordingWriter:
        def schedule(self, car_id: str, profile: dict):
            scheduled.append((car_id, profile.copy()))

    monkeypatch.setattr(main, "dyno_cache", {"42": {"dyno_curve": {"1000": {}}}})
    monkeypatch.setattr(main, "car_params_writer", RecordingWriter())
    monkeypatch.setattr(
        main,
        "save_car_params",
        lambda *_args: (_ for _ in ()).throw(
            AssertionError("sync save is not allowed")
        ),
    )

    response = asyncio.run(main.update_car_params("42", {"weight": 1300}))

    assert response == {"message": "Car parameters saved successfully"}
    assert scheduled == [("42", {"dyno_curve": {"1000": {}}, "weight": 1300})]
