import os
import sys

sys.path.insert(
    0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../backend"))
)

from main import dyno_is_reasonable


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
