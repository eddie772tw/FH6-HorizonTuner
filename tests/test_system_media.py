import asyncio
from pathlib import Path
from types import SimpleNamespace

import system_media
import system_media_contract


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
            "thumbnail": None,
            "thumbnail_url": None,
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
    assert "import winrt.windows.foundation;" in setup_source
    assert "import winrt.windows.foundation.collections;" in setup_source
    assert "import winrt.windows.media;" in setup_source
    assert "import winrt.windows.media.control;" in setup_source
    assert "import winrt.windows.storage;" in setup_source
    assert "import winrt.windows.storage.streams" in setup_source
    assert "winsdk.windows.media.control" not in setup_source
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
        "thumbnail_url": None,
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


def test_build_media_result_resilient_to_c_extension_import_errors():
    """Verify that properties raising ModuleNotFoundError or ImportError (e.g. uninstalled WinRT extensions)
    do not crash build_media_result and fall back gracefully.
    """

    class ExplosiveInfo:
        title = "Explosive Title"
        artist = "Explosive Artist"
        album_title = "Explosive Album"
        album_artist = "Explosive Artist"
        subtitle = None
        track_number = 1
        album_track_count = 10

        @property
        def genres(self):
            raise ModuleNotFoundError(
                "No module named 'winrt.windows.foundation.collections'"
            )

        @property
        def thumbnail(self):
            raise ModuleNotFoundError("No module named 'winrt.windows.storage'")

        @property
        def playback_type(self):
            raise AttributeError(
                "module 'winrt.windows.media' has no attribute 'MediaPlaybackType'"
            )

    class ExplosivePlayback:
        playback_status = 4
        is_shuffle_active = False
        playback_rate = 1.0

        @property
        def playback_type(self):
            raise AttributeError(
                "module 'winrt.windows.media' has no attribute 'MediaPlaybackType'"
            )

        @property
        def auto_repeat_mode(self):
            raise AttributeError(
                "module 'winrt.windows.media' has no attribute 'MediaPlaybackAutoRepeatMode'"
            )

        @property
        def controls(self):
            return SimpleNamespace(
                is_playback_position_enabled=True,
                is_play_enabled=True,
                is_pause_enabled=True,
            )

    result = system_media._build_media_result(
        ExplosiveInfo(),
        ExplosivePlayback(),
        None,
        SimpleNamespace(source_app_user_model_id="boom.app"),
    )

    assert result["has_media"] is True
    assert result["title"] == "Explosive Title"
    assert result["artist"] == "Explosive Artist"
    assert result["album_title"] == "Explosive Album"
    assert result["genres"] == []
    assert result["thumbnail_available"] is False
    assert result["thumbnail"] is None
    assert result["playback_type"] == "unknown"
    assert result["repeat_mode"] == "none"
    assert result["status"] == "playing"
    assert result["can_seek"] is True
    assert result["playback_controls"]["is_play_enabled"] is True


def test_try_get_winrt_gsm_media_prioritizes_playing_session(monkeypatch):
    """When the current session is idle/paused but a secondary session is actively playing,
    _try_get_winrt_gsm_media should discover and return the playing session.
    """
    import sys

    monkeypatch.setattr(system_media.sys, "platform", "win32")

    class FakeSession:
        def __init__(self, title, artist, status):
            self._title = title
            self._artist = artist
            self._status = status
            self.source_app_user_model_id = f"app.{title.lower()}"

        async def try_get_media_properties_async(self):
            return SimpleNamespace(
                title=self._title,
                artist=self._artist,
                album_title="Album",
                album_artist=self._artist,
                subtitle=None,
                genres=[],
                track_number=1,
                album_track_count=1,
                playback_type=1,
                thumbnail=None,
            )

        def get_playback_info(self):
            return SimpleNamespace(
                playback_status=self._status,
                playback_type=1,
                controls=SimpleNamespace(),
                is_shuffle_active=False,
                auto_repeat_mode=0,
                playback_rate=1.0,
            )

        def get_timeline_properties(self):
            return SimpleNamespace(
                position=None,
                start_time=None,
                end_time=None,
                min_seek_time=None,
                max_seek_time=None,
                last_updated_time=None,
            )

    idle_current = FakeSession("Paused Song", "Paused Artist", status=5)
    active_background = FakeSession("Active Banger", "Live Band", status=4)

    class FakeManager:
        def get_current_session(self):
            return idle_current

        def get_sessions(self):
            return [idle_current, active_background]

    class FakeWMC:
        class GlobalSystemMediaTransportControlsSessionManager:
            @classmethod
            async def request_async(cls):
                return FakeManager()

    import types

    fake_winrt = types.ModuleType("winrt")
    fake_windows = types.ModuleType("winrt.windows")
    fake_foundation = types.ModuleType("winrt.windows.foundation")
    fake_media = types.ModuleType("winrt.windows.media")
    fake_media.control = FakeWMC
    fake_windows.foundation = fake_foundation
    fake_windows.media = fake_media
    fake_winrt.windows = fake_windows

    monkeypatch.setattr(
        system_media,
        "_build_media_result",
        system_media_contract.build_media_result,
    )
    monkeypatch.setitem(sys.modules, "winrt", fake_winrt)
    monkeypatch.setitem(sys.modules, "winrt.windows", fake_windows)
    monkeypatch.setitem(sys.modules, "winrt.windows.foundation", fake_foundation)
    monkeypatch.setitem(sys.modules, "winrt.windows.media", fake_media)
    monkeypatch.setitem(sys.modules, "winrt.windows.media.control", FakeWMC)

    result = asyncio.run(system_media._try_get_winrt_gsm_media())
    assert result is not None
    assert result["has_media"] is True
    assert result["title"] == "Active Banger"
    assert result["artist"] == "Live Band"
    assert result["status"] == "playing"


def test_extract_thumbnail_bytes_handles_none_or_error():
    assert asyncio.run(system_media.extract_thumbnail_bytes(None)) == (None, None)

    class BrokenRef:
        async def open_read_async(self):
            raise RuntimeError("Corrupted stream")

    assert asyncio.run(system_media.extract_thumbnail_bytes(BrokenRef())) == (
        None,
        None,
    )


def test_get_media_thumbnail_endpoint(monkeypatch):
    from fastapi.testclient import TestClient
    from main import app

    client = TestClient(app)

    # 1. When no thumbnail is cached, returns 404
    monkeypatch.setattr(
        system_media,
        "_thumbnail_cache",
        {"bytes": None, "content_type": None, "hash": None, "track_key": None},
    )
    res = client.get("/api/overlay/media/thumbnail")
    assert res.status_code == 404

    # 2. When thumbnail is cached, returns image bytes and headers
    fake_png = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"
    monkeypatch.setattr(
        system_media,
        "_thumbnail_cache",
        {
            "bytes": fake_png,
            "content_type": "image/png",
            "hash": "aabbcc1122334455",
            "track_key": ("Song", "Artist", "Album"),
        },
    )
    res = client.get("/api/overlay/media/thumbnail?v=aabbcc1122334455")
    assert res.status_code == 200
    assert res.content == fake_png
    assert res.headers["content-type"] == "image/png"
    assert res.headers["etag"] == '"aabbcc1122334455"'
    assert "max-age=3600" in res.headers["cache-control"]

    # 3. Conditional request with matching If-None-Match returns 304
    res304 = client.get(
        "/api/overlay/media/thumbnail",
        headers={"if-none-match": '"aabbcc1122334455"'},
    )
    assert res304.status_code == 304
