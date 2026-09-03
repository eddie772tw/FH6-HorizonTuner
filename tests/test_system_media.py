import asyncio
from pathlib import Path
from types import SimpleNamespace

import system_media


def _reset_media_cache(monkeypatch):
    monkeypatch.setattr(
        system_media,
        "_media_cache",
        {
            "title": system_media.DEFAULT_TITLE,
            "artist": system_media.DEFAULT_ARTIST,
            "album_title": None,
            "album_artist": None,
            "subtitle": None,
            "genres": [],
            "track_number": None,
            "album_track_count": None,
            "playback_type": None,
            "thumbnail_available": False,
            "status": "none",
            "position_seconds": None,
            "start_seconds": None,
            "duration_seconds": None,
            "min_seek_seconds": None,
            "max_seek_seconds": None,
            "timeline_last_updated_ms": None,
            "can_seek": False,
            "is_shuffle_active": False,
            "repeat_mode": "none",
            "playback_rate": 1.0,
            "playback_controls": {},
            "source_app_user_model_id": None,
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
    setup_script = Path(__file__).parents[1] / "setup_venv.bat"
    setup_source = setup_script.read_text(encoding="utf-8")

    assert "import winrt.windows.foundation" in source
    assert "import winrt.windows.media.control as wmc" in source
    assert "import winsdk.windows.media.control as wmc" not in source
    assert "import winrt.windows.foundation" in setup_source
    assert "import winrt.windows.media.control" in setup_source
    assert "import winsdk.windows.media.control" not in setup_source
    assert "_query_powershell_gsmtc" not in source
    assert "_extract_windows_desktop_media" not in source
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


def test_gsmtc_media_properties_are_mapped_to_bounded_contract():
    class TimeSpan:
        def __init__(self, ticks):
            self.duration = ticks

    info = SimpleNamespace(
        title="  Track  ",
        artist=" Artist ",
        album_title="Album",
        album_artist="Album Artist",
        subtitle="Live edit",
        genres=["Rock", "Alternative"],
        track_number=3,
        album_track_count=12,
        playback_type=1,
        thumbnail=object(),
    )
    playback_info = SimpleNamespace(
        playback_status=4,
        playback_type=1,
        controls=SimpleNamespace(is_playback_position_enabled=True),
        is_shuffle_active=True,
        auto_repeat_mode=2,
        playback_rate=1.25,
    )
    timeline = SimpleNamespace(
        position=TimeSpan(12_500_000),
        start_time=TimeSpan(0),
        end_time=TimeSpan(210_000_000),
        min_seek_time=TimeSpan(0),
        max_seek_time=TimeSpan(210_000_000),
        last_updated_time=116_444_736_000_000_000,
    )
    session = SimpleNamespace(source_app_user_model_id="music.app")

    result = system_media._build_media_result(info, playback_info, timeline, session)

    assert result == {
        "title": "Track",
        "artist": "Artist",
        "album_title": "Album",
        "album_artist": "Album Artist",
        "subtitle": "Live edit",
        "genres": ["Rock", "Alternative"],
        "track_number": 3,
        "album_track_count": 12,
        "playback_type": "music",
        "thumbnail": None,
        "thumbnail_available": True,
        "status": "playing",
        "position_seconds": 1.25,
        "start_seconds": 0.0,
        "duration_seconds": 21.0,
        "min_seek_seconds": 0.0,
        "max_seek_seconds": 21.0,
        "timeline_last_updated_ms": 0,
        "can_seek": True,
        "is_shuffle_active": True,
        "repeat_mode": "list",
        "playback_rate": 1.25,
        "playback_controls": {
            "is_channel_down_enabled": False,
            "is_channel_up_enabled": False,
            "is_fast_forward_enabled": False,
            "is_next_enabled": False,
            "is_pause_enabled": False,
            "is_playback_position_enabled": True,
            "is_playback_rate_enabled": False,
            "is_play_enabled": False,
            "is_play_pause_toggle_enabled": False,
            "is_previous_enabled": False,
            "is_record_enabled": False,
            "is_repeat_enabled": False,
            "is_rewind_enabled": False,
            "is_shuffle_enabled": False,
            "is_stop_enabled": False,
        },
        "source_app_user_model_id": "music.app",
        "has_media": True,
        "available": True,
    }


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
