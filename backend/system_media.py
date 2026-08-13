import asyncio
import ctypes
import logging
import sys
import time
from ctypes import wintypes

logger = logging.getLogger(__name__)

DEFAULT_TITLE = "Turbo Fire"
DEFAULT_ARTIST = "TANTRON"

_media_cache = {
    "title": DEFAULT_TITLE,
    "artist": DEFAULT_ARTIST,
    "status": "none",
    "has_media": False,
    "state": "none",
    "source": "none",
    "last_check": 0.0,
    "last_valid": 0.0,
    "failure_count": 0,
    "next_retry_at": 0.0,
}

CACHE_TTL_SECONDS = 1.0
MEDIA_STALE_GRACE_SECONDS = 3.0
MEDIA_FAILURE_BACKOFF_SECONDS = (1.0, 2.0, 5.0, 10.0)
_media_query_lock = asyncio.Lock()


async def _try_get_winrt_gsm_media() -> dict | None:
    """Attempt to fetch media info using Windows WinRT GSMTC session manager."""
    if sys.platform != "win32":
        return None

    # 1. Try the modular Python WinRT package first if available.
    try:
        import winrt.windows.media.control as wmc

        manager = (
            await wmc.GlobalSystemMediaTransportControlsSessionManager.request_async()
        )
        session = manager.get_current_session()
        if session:
            info = await session.try_get_media_properties_async()
            if info:
                title = (info.title or "").strip()
                artist = (info.artist or "").strip()
                if title or artist:
                    playback_info = session.get_playback_info()
                    status_val = "playing"
                    if playback_info:
                        status_val = (
                            "playing"
                            if playback_info.playback_status == 4
                            else "paused"
                        )
                    return {
                        "title": title or DEFAULT_TITLE,
                        "artist": artist or DEFAULT_ARTIST,
                        "status": status_val,
                        "has_media": True,
                        "available": True,
                    }
        return {"available": True, "has_media": False}
    except Exception as e:
        logger.debug(f"WinRT GSMTC modular package fetch notice: {e}")
    return None


def _extract_windows_desktop_media() -> dict | None:
    if sys.platform != "win32":
        return None

    try:
        user32 = ctypes.windll.user32

        user32.OpenInputDesktop.argtypes = [
            wintypes.DWORD,
            wintypes.BOOL,
            wintypes.DWORD,
        ]
        user32.OpenInputDesktop.restype = wintypes.HANDLE

        WNDENUMPROC = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

        user32.EnumDesktopWindows.argtypes = [
            wintypes.HANDLE,
            WNDENUMPROC,
            wintypes.LPARAM,
        ]
        user32.EnumDesktopWindows.restype = wintypes.BOOL

        user32.GetWindowTextW.argtypes = [
            wintypes.HWND,
            wintypes.LPWSTR,
            ctypes.c_int,
        ]
        user32.GetWindowTextW.restype = ctypes.c_int

        user32.GetWindowTextLengthW.argtypes = [wintypes.HWND]
        user32.GetWindowTextLengthW.restype = ctypes.c_int

        hDesk = user32.OpenInputDesktop(0, False, 0x0100)
        if not hDesk:
            return None

        titles = []

        def enum_proc(hwnd, lparam):
            length = user32.GetWindowTextLengthW(hwnd)
            if length > 0:
                buf = ctypes.create_unicode_buffer(length + 1)
                user32.GetWindowTextW(hwnd, buf, length + 1)
                t = buf.value
                if t:
                    titles.append(t)
            return True

        cb = WNDENUMPROC(enum_proc)
        user32.EnumDesktopWindows(hDesk, cb, 0)

        ignore_keywords = [
            "gdi+",
            "horizon tuner",
            "cmd.exe",
            "windows terminal",
            "taskbar",
            "desktopwindowxamlsource",
            "dde server",
            "program manager",
            "microsoft text input",
            "settings",
            "network flyout",
            "outlook",
            "globalprotect",
            "parsec",
            "logioptions",
            "menu",
            "pnpm run dev",
            "visual studio",
            "code",
            "file explorer",
            "calculator",
            "notepad",
            "spotifylauncher",
            "spotify.exe",
            "spotifylauncher.exe",
            "spotify free",
            "spotify premium",
        ]

        media_app_keywords = [
            "spotify",
            "youtube",
            "potplayer",
            "vlc",
            "foobar",
            "netease",
            "網易雲",
            "qq音樂",
            "apple music",
            "itunes",
            "music",
            "sound",
        ]

        matched_media_titles = []
        generic_titles = []

        for t in titles:
            t_clean = t.strip()
            if not t_clean:
                continue

            t_lower = t_clean.lower()
            if any(k in t_lower for k in ignore_keywords):
                continue

            cleaned = (
                t_clean.replace(" - Google Chrome", "")
                .replace(" - Microsoft Edge", "")
                .replace(" - Mozilla Firefox", "")
                .replace(" - YouTube", "")
            )

            is_media_app = any(m in t_lower for m in media_app_keywords)
            if is_media_app:
                matched_media_titles.append(cleaned)
            else:
                generic_titles.append(cleaned)

        # Prioritize windows from known media player applications
        candidate_titles = matched_media_titles + generic_titles

        for cleaned in candidate_titles:
            # Strictly require " - " separator to extract valid Artist - Track titles
            if " - " in cleaned:
                parts = cleaned.split(" - ", 1)
                artist = parts[0].strip()
                title = parts[1].strip()
                if artist and title:
                    return {
                        "title": title,
                        "artist": artist,
                        "status": "playing",
                        "has_media": True,
                    }
    except Exception as e:
        logger.debug(f"Desktop window media extraction notice: {e}")

    return None


async def get_system_media_info() -> dict:
    """Fetch current playing system media info on Windows.
    Uses cached result if checked within CACHE_TTL_SECONDS.
    """
    async with _media_query_lock:
        now = time.monotonic()
        if now - _media_cache["last_check"] < CACHE_TTL_SECONDS:
            return _media_snapshot()

        if now < _media_cache["next_retry_at"]:
            _media_cache["last_check"] = now
            return _media_snapshot()

        _media_cache["last_check"] = now

        # 1. Try the native WinRT GSMTC session manager first.
        winrt_res = await _try_get_winrt_gsm_media()
        if winrt_res is not None:
            if winrt_res.get("has_media"):
                _apply_media_result(winrt_res, source="winrt", now=now)
            else:
                _apply_no_media(source="winrt", now=now)
            return _media_snapshot()

        _apply_media_failure(now)
        return _media_snapshot()


def _media_snapshot() -> dict:
    """Return the public media contract without exposing internal cache fields."""
    return {
        "title": _media_cache["title"],
        "artist": _media_cache["artist"],
        "status": _media_cache["status"],
        "has_media": _media_cache["has_media"],
        "state": _media_cache["state"],
        "source": _media_cache["source"],
        "success": True,
    }


def _apply_media_result(result: dict, *, source: str, now: float) -> None:
    """Store a valid playing/paused media result and reset fallback backoff."""
    _media_cache["title"] = result.get("title") or DEFAULT_TITLE
    _media_cache["artist"] = result.get("artist") or DEFAULT_ARTIST
    _media_cache["status"] = result.get("status") or "playing"
    _media_cache["has_media"] = True
    _media_cache["state"] = "live"
    _media_cache["source"] = source
    _media_cache["last_valid"] = now
    _media_cache["failure_count"] = 0
    _media_cache["next_retry_at"] = 0.0


def _apply_no_media(*, source: str, now: float) -> None:
    """Store a successful query with no active media session."""
    _media_cache["title"] = DEFAULT_TITLE
    _media_cache["artist"] = DEFAULT_ARTIST
    _media_cache["status"] = "none"
    _media_cache["has_media"] = False
    _media_cache["state"] = "none"
    _media_cache["source"] = source
    _media_cache["last_valid"] = now
    _media_cache["failure_count"] = 0
    _media_cache["next_retry_at"] = 0.0


def _apply_media_failure(now: float) -> None:
    """Back off failed fallback queries while preserving a short stale grace period."""
    failure_count = min(
        _media_cache["failure_count"], len(MEDIA_FAILURE_BACKOFF_SECONDS) - 1
    )
    _media_cache["failure_count"] += 1
    _media_cache["next_retry_at"] = now + MEDIA_FAILURE_BACKOFF_SECONDS[failure_count]

    if (
        _media_cache["last_valid"]
        and now - _media_cache["last_valid"] <= MEDIA_STALE_GRACE_SECONDS
    ):
        _media_cache["state"] = "stale"
        _media_cache["source"] = "stale"
        return

    _media_cache["title"] = DEFAULT_TITLE
    _media_cache["artist"] = DEFAULT_ARTIST
    _media_cache["status"] = "none"
    _media_cache["has_media"] = False
    _media_cache["source"] = "unavailable"
    _media_cache["state"] = "unavailable"
