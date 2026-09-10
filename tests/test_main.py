import asyncio
import os
import sys
import threading

import pytest

sys.path.insert(
    0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../backend"))
)

from main import AudioDeviceDiscovery, dyno_is_reasonable


def test_dyno_is_reasonable_no_neighbors():
    """Test when neighbor_vals is empty or None."""
    assert dyno_is_reasonable(100, []) is True
    assert dyno_is_reasonable(100, None) is True


def test_dyno_is_reasonable_max_neighbor_zero_or_negative():
    """Test when the maximum neighbor value is 0 or negative."""
    assert dyno_is_reasonable(100, [0, -10, -5]) is True
    assert dyno_is_reasonable(100, [-20, -10, -5]) is True


def test_dyno_is_reasonable_within_threshold():
    """Test when new_val is within the acceptable threshold."""
    # With default threshold 0.30
    # max_neighbor = 100
    # max_acceptable = 100 * 1.30 = 130
    assert dyno_is_reasonable(130, [80, 90, 100]) is True
    assert dyno_is_reasonable(129, [80, 90, 100]) is True
    assert dyno_is_reasonable(100, [80, 90, 100]) is True


def test_dyno_is_reasonable_exceeds_threshold():
    """Test when new_val exceeds the acceptable threshold."""
    # With default threshold 0.30
    # max_neighbor = 100
    # max_acceptable = 100 * 1.30 = 130
    assert dyno_is_reasonable(131, [80, 90, 100]) is False
    assert dyno_is_reasonable(200, [80, 90, 100]) is False


def test_dyno_is_reasonable_custom_threshold():
    """Test with a custom threshold."""
    # With custom threshold 0.50
    # max_neighbor = 100
    # max_acceptable = 100 * 1.50 = 150
    assert dyno_is_reasonable(150, [80, 90, 100], threshold=0.50) is True
    assert dyno_is_reasonable(151, [80, 90, 100], threshold=0.50) is False


def test_get_language_search_dirs():
    from main import LANG_DIR, get_language_search_dirs

    dirs = get_language_search_dirs()
    assert isinstance(dirs, list)
    assert len(dirs) >= 1
    assert os.path.normpath(LANG_DIR) in dirs


@pytest.mark.asyncio
async def test_audio_device_discovery_keeps_the_event_loop_responsive_and_single_flight():
    started = threading.Event()
    release = threading.Event()
    calls = 0

    def blocking_discovery():
        nonlocal calls
        calls += 1
        started.set()
        release.wait(timeout=1)
        return [{"id": "speaker-1", "name": "Speaker", "is_default": True}]

    discovery = AudioDeviceDiscovery(
        blocking_discovery, cache_ttl_seconds=0, failure_backoff_seconds=1
    )
    first = asyncio.create_task(discovery.get_devices(timeout_seconds=0.01))
    await asyncio.to_thread(started.wait, 0.2)

    yielded = asyncio.Event()

    async def confirm_event_loop_progress() -> None:
        await asyncio.sleep(0)
        yielded.set()

    asyncio.create_task(confirm_event_loop_progress())
    await asyncio.wait_for(yielded.wait(), timeout=0.05)
    second = await discovery.get_devices(timeout_seconds=0.01)
    first_result = await first

    assert calls == 1
    assert first_result == second
    assert first_result[0]["id"] == "default"

    release.set()
    for _ in range(20):
        resolved = await discovery.get_devices(timeout_seconds=0.05)
        if resolved[0]["id"] == "speaker-1":
            break
        await asyncio.sleep(0.01)
    assert resolved == [{"id": "speaker-1", "name": "Speaker", "is_default": True}]


@pytest.mark.asyncio
@pytest.mark.parametrize("outcome", ["error", "empty"])
async def test_audio_device_discovery_returns_cached_fallback_for_failed_results(
    outcome,
):
    calls = 0

    def unavailable_discovery():
        nonlocal calls
        calls += 1
        if outcome == "empty":
            return []
        raise RuntimeError("WASAPI unavailable")

    discovery = AudioDeviceDiscovery(
        unavailable_discovery, cache_ttl_seconds=0, failure_backoff_seconds=10
    )
    expected = [
        {
            "id": "default",
            "name": "System Default Speaker / 系統預設輸出裝置",
            "is_default": True,
        }
    ]

    assert await discovery.get_devices(timeout_seconds=0.1) == expected
    await asyncio.sleep(0)
    assert await discovery.get_devices(timeout_seconds=0.1) == expected
    assert calls == 1


@pytest.mark.asyncio
async def test_audio_device_discovery_returns_cached_fallback_when_worker_is_cancelled():
    started = threading.Event()
    release = threading.Event()

    def blocking_discovery():
        started.set()
        release.wait(timeout=1)
        return [{"id": "speaker-1", "name": "Speaker", "is_default": True}]

    discovery = AudioDeviceDiscovery(
        blocking_discovery, cache_ttl_seconds=0, failure_backoff_seconds=10
    )
    request = asyncio.create_task(discovery.get_devices(timeout_seconds=1))
    await asyncio.to_thread(started.wait, 0.2)
    assert discovery._task is not None
    discovery._task.cancel()

    assert await request == [
        {
            "id": "default",
            "name": "System Default Speaker / 系統預設輸出裝置",
            "is_default": True,
        }
    ]
    release.set()


def test_api_languages_discovery_and_fallback(tmp_path, monkeypatch):
    import main
    from fastapi.testclient import TestClient
    from main import app

    client = TestClient(app)

    # 1. English is always included
    res = client.get("/api/languages")
    assert res.status_code == 200
    languages = res.json()
    codes = [l["code"] for l in languages]
    assert "en-us" in codes
    assert "zh-tw" in codes

    # 2. Test fetching en-us returns empty dict
    res_en = client.get("/api/languages/en-us")
    assert res_en.status_code == 200
    assert res_en.json() == {}

    # 3. Test fetching zh-tw returns dictionary with translations
    res_zh = client.get("/api/languages/zh-tw")
    assert res_zh.status_code == 200
    zh_data = res_zh.json()
    assert isinstance(zh_data, dict)
    assert "error" not in zh_data
    assert zh_data.get("__language_name__") == "繁體中文"

    # 4. Test fallback when LANG_DIR is forced to an empty directory
    empty_lang_dir = tmp_path / "empty_lang"
    empty_lang_dir.mkdir()
    monkeypatch.setattr(main, "LANG_DIR", str(empty_lang_dir))

    # Should still find zh-tw and ja-jp from RESOURCE_LANG_DIR or fallbacks
    res_fallback = client.get("/api/languages")
    assert res_fallback.status_code == 200
    fallback_langs = res_fallback.json()
    fallback_codes = [l["code"] for l in fallback_langs]
    assert "en-us" in fallback_codes
    assert "zh-tw" in fallback_codes

    res_zh_fallback = client.get("/api/languages/zh-tw")
    assert res_zh_fallback.status_code == 200
    assert res_zh_fallback.json().get("__language_name__") == "繁體中文"

    # 5. Non-existent language returns error
    res_invalid = client.get("/api/languages/nonexistent-lang-code")
    assert res_invalid.status_code == 200
    assert res_invalid.json() == {"error": "Language not found"}


def test_api_settings_forwarding_configuration():
    from fastapi.testclient import TestClient
    from main import app

    client = TestClient(app)

    # 1. Get initial settings
    res = client.get("/api/settings")
    assert res.status_code == 200
    data = res.json()
    assert "forward_telemetry_enabled" in data
    assert "forward_telemetry_host" in data
    assert "forward_telemetry_port" in data

    # 2. Update forwarding settings
    update_payload = {
        "forward_telemetry_enabled": True,
        "forward_telemetry_host": "127.0.0.1",
        "forward_telemetry_port": 5300,
    }
    post_res = client.post("/api/settings", json=update_payload)
    assert post_res.status_code == 200
    updated_data = post_res.json()
    assert updated_data["forward_telemetry_enabled"] is True
    assert updated_data["forward_telemetry_host"] == "127.0.0.1"
    assert updated_data["forward_telemetry_port"] == 5300
