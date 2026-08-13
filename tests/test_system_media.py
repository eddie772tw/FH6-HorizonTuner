import asyncio
from pathlib import Path

import system_media


def _reset_media_cache(monkeypatch):
    monkeypatch.setattr(
        system_media,
        "_media_cache",
        {
            "title": system_media.DEFAULT_TITLE,
            "artist": system_media.DEFAULT_ARTIST,
            "status": "none",
            "has_media": False,
            "state": "none",
            "source": "none",
            "last_check": 0.0,
            "last_valid": 0.0,
            "failure_count": 0,
            "next_retry_at": 0.0,
        },
    )


def test_winrt_media_uses_modular_namespace():
    source = Path(system_media.__file__).read_text(encoding="utf-8")

    assert "import winrt.windows.media.control as wmc" in source
    assert "import winsdk.windows.media.control as wmc" not in source
    assert "_query_powershell_gsmtc" not in source
    assert "subprocess.run" not in source


def test_winrt_media_is_returned_directly(monkeypatch):
    _reset_media_cache(monkeypatch)

    async def fake_winrt():
        return {
            "title": "Track",
            "artist": "Artist",
            "status": "playing",
            "has_media": True,
        }

    monkeypatch.setattr(system_media, "_try_get_winrt_gsm_media", fake_winrt)

    result = asyncio.run(system_media.get_system_media_info())

    assert result["source"] == "winrt"
    assert result["state"] == "live"
    assert result["has_media"] is True


def test_winrt_failure_is_backed_off_without_spawning_a_fallback(monkeypatch):
    _reset_media_cache(monkeypatch)

    async def unavailable_winrt():
        return None

    monkeypatch.setattr(system_media, "_try_get_winrt_gsm_media", unavailable_winrt)

    first = asyncio.run(system_media.get_system_media_info())
    second = asyncio.run(system_media.get_system_media_info())

    assert first["state"] == "unavailable"
    assert second["state"] == "unavailable"
    assert second["source"] == "unavailable"
