import os
import sys

sys.path.insert(
    0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../backend"))
)

from main import (
    DEFAULT_SETTINGS,
    GENERAL_UNIT_PROFILES,
    dyno_is_reasonable,
    normalize_general_unit_settings,
    normalize_vfd_render_mode,
)


def test_normalize_vfd_render_mode():
    """Test VFD render mode normalization with valid, invalid, and non-string inputs."""
    # Valid inputs
    assert normalize_vfd_render_mode("optimized") == "optimized"
    assert normalize_vfd_render_mode("legacy") == "legacy"

    # Invalid string inputs (case sensitive, whitespace, unknown modes, empty)
    assert normalize_vfd_render_mode("OPTIMIZED") == "legacy"
    assert normalize_vfd_render_mode(" optimized ") == "legacy"
    assert normalize_vfd_render_mode("") == "legacy"
    assert normalize_vfd_render_mode("custom") == "legacy"

    # Non-string inputs
    assert normalize_vfd_render_mode(None) == "legacy"
    assert normalize_vfd_render_mode(123) == "legacy"
    assert normalize_vfd_render_mode(True) == "legacy"
    assert normalize_vfd_render_mode([]) == "legacy"
    assert normalize_vfd_render_mode({}) == "legacy"


def test_dyno_is_reasonable_no_neighbors():
    """Test when neighbor_vals is empty, None, or empty containers."""
    assert dyno_is_reasonable(100, []) is True
    assert dyno_is_reasonable(100, ()) is True
    assert dyno_is_reasonable(100, set()) is True
    assert dyno_is_reasonable(100, None) is True


def test_dyno_is_reasonable_max_neighbor_zero_or_negative():
    """Test when the maximum neighbor value is 0 or negative."""
    assert dyno_is_reasonable(100, [0]) is True
    assert dyno_is_reasonable(100, [0, -10, -5]) is True
    assert dyno_is_reasonable(100, [-20, -10, -5]) is True
    assert dyno_is_reasonable(-50, [-20, -10, 0]) is True


def test_dyno_is_reasonable_within_threshold():
    """Test when new_val is within the acceptable threshold."""
    # With default threshold 0.30
    # max_neighbor = 100
    # max_acceptable = 100 * 1.30 = 130
    assert dyno_is_reasonable(130, [80, 90, 100]) is True
    assert dyno_is_reasonable(129.99, [80, 90, 100]) is True
    assert dyno_is_reasonable(100, [80, 90, 100]) is True
    assert dyno_is_reasonable(0, [80, 90, 100]) is True
    assert dyno_is_reasonable(-50, [80, 90, 100]) is True


def test_dyno_is_reasonable_exceeds_threshold():
    """Test when new_val exceeds the acceptable threshold."""
    # With default threshold 0.30
    # max_neighbor = 100
    # max_acceptable = 100 * 1.30 = 130
    assert dyno_is_reasonable(130.01, [80, 90, 100]) is False
    assert dyno_is_reasonable(131, [80, 90, 100]) is False
    assert dyno_is_reasonable(200, [80, 90, 100]) is False


def test_dyno_is_reasonable_custom_threshold():
    """Test with a custom threshold."""
    # With threshold 0.0 (strictly <= max_neighbor)
    assert dyno_is_reasonable(100, [80, 90, 100], threshold=0.0) is True
    assert dyno_is_reasonable(100.1, [80, 90, 100], threshold=0.0) is False

    # With custom threshold 0.50
    # max_neighbor = 100 -> max_acceptable = 150
    assert dyno_is_reasonable(150, [80, 90, 100], threshold=0.50) is True
    assert dyno_is_reasonable(151, [80, 90, 100], threshold=0.50) is False


def test_dyno_is_reasonable_unsorted_and_iterable_types():
    """Test handling of unsorted neighbor lists, tuples, and sets."""
    assert dyno_is_reasonable(130, [100, 50, 90]) is True
    assert dyno_is_reasonable(131, [100, 50, 90]) is False
    assert dyno_is_reasonable(130, (80, 100, 90)) is True
    assert dyno_is_reasonable(130, {80, 90, 100}) is True


def test_get_language_search_dirs():
    from main import LANG_DIR, get_language_search_dirs

    dirs = get_language_search_dirs()
    assert isinstance(dirs, list)
    assert len(dirs) >= 1
    assert os.path.normpath(LANG_DIR) in dirs


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


def test_normalize_general_unit_settings_default_fallback():
    # None input should return metric profile default
    res_none = normalize_general_unit_settings(None)
    expected = dict(DEFAULT_SETTINGS["units"])
    expected.update(GENERAL_UNIT_PROFILES["metric"])
    assert res_none == expected

    # Empty dict input should also default to metric profile
    res_empty = normalize_general_unit_settings({})
    assert res_empty == expected


def test_normalize_general_unit_settings_metric_and_imperial():
    # Explicit metric speed ("kmh") should result in metric profile
    res_metric = normalize_general_unit_settings({"speed": "kmh"})
    expected_metric = dict(DEFAULT_SETTINGS["units"])
    expected_metric.update({"speed": "kmh"})
    expected_metric.update(GENERAL_UNIT_PROFILES["metric"])
    assert res_metric == expected_metric

    # Explicit imperial speed ("mph") should result in imperial profile
    res_imperial = normalize_general_unit_settings({"speed": "mph"})
    expected_imperial = dict(DEFAULT_SETTINGS["units"])
    expected_imperial.update({"speed": "mph"})
    expected_imperial.update(GENERAL_UNIT_PROFILES["imperial"])
    assert res_imperial == expected_imperial


def test_normalize_general_unit_settings_mixed_and_custom_keys():
    # Legacy mixed settings: speed=mph, but weight=kg (metric).
    # Expected behavior: speed=mph forces the imperial profile, overwriting weight to lbs.
    mixed_input = {
        "speed": "mph",
        "weight": "kg",
        "power": "kw",  # non-profile custom unit key
        "springRate": "Nmm",  # non-profile custom unit key
    }
    res_mixed = normalize_general_unit_settings(mixed_input)

    expected = dict(DEFAULT_SETTINGS["units"])
    expected.update(mixed_input)
    expected.update(GENERAL_UNIT_PROFILES["imperial"])
    assert res_mixed["weight"] == "lbs"
    assert res_mixed["speed"] == "mph"
    assert res_mixed["power"] == "kw"
    assert res_mixed["springRate"] == "Nmm"
    assert res_mixed == expected


def test_normalize_general_unit_settings_invalid_input():
    expected_default = dict(DEFAULT_SETTINGS["units"])
    expected_default.update(GENERAL_UNIT_PROFILES["metric"])

    # Non-dict inputs should safely fall back to default normalized dict
    assert normalize_general_unit_settings("invalid_string") == expected_default
    assert normalize_general_unit_settings(123) == expected_default
    assert normalize_general_unit_settings(["list"]) == expected_default
