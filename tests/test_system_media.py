import asyncio

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


def test_winrt_media_does_not_start_powershell_fallback(monkeypatch):
    _reset_media_cache(monkeypatch)

    async def fake_winrt():
        return {
            "title": "Track",
            "artist": "Artist",
            "status": "playing",
            "has_media": True,
        }

    def fail_powershell():
        raise AssertionError("PowerShell fallback must not run after WinRT success")

    monkeypatch.setattr(system_media, "_try_get_winrt_gsm_media", fake_winrt)
    monkeypatch.setattr(system_media, "_query_powershell_gsmtc", fail_powershell)

    result = asyncio.run(system_media.get_system_media_info())

    assert result["source"] == "winrt"
    assert result["state"] == "live"
    assert result["has_media"] is True


def test_powershell_fallback_is_single_query_and_backed_off_on_failure(monkeypatch):
    _reset_media_cache(monkeypatch)
    powershell_calls = []

    async def unavailable_winrt():
        return None

    def failed_powershell():
        powershell_calls.append(True)
        return None

    monkeypatch.setattr(system_media, "_try_get_winrt_gsm_media", unavailable_winrt)
    monkeypatch.setattr(system_media, "_query_powershell_gsmtc", failed_powershell)

    first = asyncio.run(system_media.get_system_media_info())
    second = asyncio.run(system_media.get_system_media_info())

    assert len(powershell_calls) == 1
    assert first["state"] == "unavailable"
    assert second["state"] == "unavailable"
    assert second["source"] == "unavailable"
