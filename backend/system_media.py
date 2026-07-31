import asyncio
import base64
import ctypes
import logging
import subprocess
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
    "last_check": 0,
}

CACHE_TTL_SECONDS = 0.5

_PS_GSMTC_SCRIPT = """
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
$mgr = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync().GetAwaiter().GetResult()
$s = $mgr.GetCurrentSession()
if ($s) {
    $p = $s.TryGetMediaPropertiesAsync().GetAwaiter().GetResult()
    $pb = $s.GetPlaybackInfo()
    $status = if ($pb.PlaybackStatus -eq 4) { "playing" } else { "paused" }
    [PSCustomObject]@{
        title = $p.Title
        artist = $p.Artist
        status = $status
        has_media = $true
    } | ConvertTo-Json -Compress
} else {
    [PSCustomObject]@{
        has_media = $false
    } | ConvertTo-Json -Compress
}
"""

_PS_GSMTC_B64 = base64.b64encode(_PS_GSMTC_SCRIPT.encode("utf-16le")).decode("ascii")


def _query_powershell_gsmtc() -> dict | None:
    """Query Windows WinRT GSMTC via PowerShell encoded command."""
    try:
        creationflags = 0x08000000 if sys.platform == "win32" else 0
        res = subprocess.run(
            ["powershell", "-NoProfile", "-EncodedCommand", _PS_GSMTC_B64],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="ignore",
            timeout=2.0,
            creationflags=creationflags,
        )
        if res.returncode == 0 and res.stdout.strip():
            import json

            data = json.loads(res.stdout.strip())
            if (
                data
                and data.get("has_media")
                and (data.get("title") or data.get("artist"))
            ):
                return {
                    "title": (data.get("title") or "").strip() or DEFAULT_TITLE,
                    "artist": (data.get("artist") or "").strip(),
                    "status": data.get("status") or "playing",
                    "has_media": True,
                }
    except Exception as e:
        logger.debug(f"PowerShell GSMTC query notice: {e}")
    return None


async def _try_get_winrt_gsm_media() -> dict | None:
    """Attempt to fetch media info using Windows WinRT GSMTC session manager."""
    if sys.platform != "win32":
        return None

    # 1. Try python winsdk first if available
    try:
        import winsdk.windows.media.control as wmc

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
                    }
    except Exception as e:
        logger.debug(f"WinRT GSMTC winsdk fetch notice: {e}")

    # 2. Fallback to PowerShell WinRT GSMTC query
    return await asyncio.to_thread(_query_powershell_gsmtc)


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
    now = time.time()
    if now - _media_cache["last_check"] < CACHE_TTL_SECONDS:
        return {
            "title": _media_cache["title"],
            "artist": _media_cache["artist"],
            "status": _media_cache["status"],
            "has_media": _media_cache["has_media"],
            "success": True,
        }

    _media_cache["last_check"] = now

    # 1. Try WinRT GSMTC session manager first
    winrt_res = await _try_get_winrt_gsm_media()
    if winrt_res and winrt_res.get("has_media"):
        _media_cache["title"] = winrt_res["title"]
        _media_cache["artist"] = winrt_res["artist"]
        _media_cache["status"] = winrt_res["status"]
        _media_cache["has_media"] = True
        return {
            "title": _media_cache["title"],
            "artist": _media_cache["artist"],
            "status": _media_cache["status"],
            "has_media": _media_cache["has_media"],
            "success": True,
        }

    # 2. Fallback to desktop window media scanner
    #    extracted = await asyncio.to_thread(_extract_windows_desktop_media)
    #    if extracted and extracted.get("has_media"):
    #        _media_cache["title"] = extracted["title"]
    #        _media_cache["artist"] = extracted["artist"]
    #        _media_cache["status"] = extracted["status"]
    #        _media_cache["has_media"] = True
    #    else:
    #        _media_cache["title"] = DEFAULT_TITLE
    #        _media_cache["artist"] = DEFAULT_ARTIST
    #        _media_cache["status"] = "none"
    #        _media_cache["has_media"] = False

    _media_cache["title"] = DEFAULT_TITLE
    _media_cache["artist"] = DEFAULT_ARTIST
    _media_cache["status"] = "none"
    _media_cache["has_media"] = False

    return {
        "title": _media_cache["title"],
        "artist": _media_cache["artist"],
        "status": _media_cache["status"],
        "has_media": _media_cache["has_media"],
        "success": True,
    }
