import asyncio
import logging
import sys
import time
from typing import Any

from system_media_contract import (
    DEFAULT_ARTIST,
    DEFAULT_PLAYBACK_CONTROLS,
    DEFAULT_TITLE,
    MEDIA_TEXT_FIELDS,
)
from system_media_contract import (
    build_media_result as _build_media_result,
)

logger = logging.getLogger(__name__)

_media_cache = {
    "title": DEFAULT_TITLE,
    "artist": DEFAULT_ARTIST,
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
    "playback_controls": dict(DEFAULT_PLAYBACK_CONTROLS),
    "source_app_user_model_id": None,
    "has_media": False,
    "state": "none",
    "source": "none",
    "last_check": 0.0,
    "last_valid": 0.0,
    "failure_count": 0,
    "next_retry_at": 0.0,
}

_thumbnail_cache = {
    "bytes": None,
    "content_type": None,
    "hash": None,
    "track_key": None,
}

CACHE_TTL_SECONDS = 1.0
MEDIA_STALE_GRACE_SECONDS = 3.0
MEDIA_FAILURE_BACKOFF_SECONDS = (1.0, 2.0, 5.0, 10.0)
_media_query_lock = asyncio.Lock()


def get_current_thumbnail_data() -> tuple[bytes | None, str | None, str | None]:
    """Return (bytes, content_type, hash) of current media thumbnail for HTTP endpoint."""
    return (
        _thumbnail_cache["bytes"],
        _thumbnail_cache["content_type"],
        _thumbnail_cache["hash"],
    )


async def extract_thumbnail_bytes(thumb_ref: Any) -> tuple[bytes | None, str | None]:
    """Asynchronously extract binary image bytes and content-type from a WinRT thumbnail stream reference."""
    if thumb_ref is None:
        return None, None
    try:
        import winrt.windows.storage.streams as streams

        stream = await thumb_ref.open_read_async()
        if not stream:
            return None, None

        size = getattr(stream, "size", 0)
        if not size or size <= 0:
            return None, None

        # Guard against oversized streams (cap at 10MB)
        if size > 10 * 1024 * 1024:
            return None, None

        content_type = getattr(stream, "content_type", None) or "image/jpeg"
        read_buffer = streams.Buffer(size)
        await stream.read_async(
            read_buffer, size, streams.InputStreamOptions.READ_AHEAD
        )
        reader = streams.DataReader.from_buffer(read_buffer)
        data = bytearray(read_buffer.length)
        reader.read_bytes(data)
        return bytes(data), content_type
    except Exception as e:
        logger.debug(f"WinRT thumbnail stream extraction notice: {e}")
        return None, None


async def _try_get_winrt_gsm_media() -> dict | None:
    """Fetch system media info using Windows WinRT Global System Media Transport Controls (GSMTC).
    Note: Requires winrt-Windows.Foundation alongside winrt-Windows.Media.Control package
    to convert WinRT async operations (request_async, try_get_media_properties_async) into Python awaitables.
    """
    if sys.platform != "win32":
        return None

    try:
        import winrt.windows.foundation  # noqa: F401 - Required for WinRT async awaitables
        import winrt.windows.media.control as wmc

        manager = (
            await wmc.GlobalSystemMediaTransportControlsSessionManager.request_async()
        )
        if not manager:
            return {"available": True, "has_media": False}

        sessions_to_check = []
        current = manager.get_current_session()
        if current:
            sessions_to_check.append(current)

        try:
            all_sessions = manager.get_sessions()
            if all_sessions:
                for s in all_sessions:
                    if s and (not current or s != current):
                        sessions_to_check.append(s)
        except Exception as se:
            logger.debug(f"WinRT GSMTC get_sessions notice: {se}")

        best_candidate = None
        for s in sessions_to_check:
            try:
                info = await s.try_get_media_properties_async()
                if not info:
                    continue
                title = (getattr(info, "title", None) or "").strip()
                artist = (getattr(info, "artist", None) or "").strip()
                if not (title or artist):
                    continue

                pb = s.get_playback_info()
                tl = s.get_timeline_properties()
                status_val = getattr(pb, "playback_status", None)
                is_playing = False
                try:
                    if hasattr(status_val, "value"):
                        is_playing = int(status_val.value) == 4
                    elif status_val is not None:
                        is_playing = int(status_val) == 4
                except Exception:
                    is_playing = False

                candidate = (s, info, pb, tl)
                if is_playing:
                    best_candidate = candidate
                    break
                if best_candidate is None:
                    best_candidate = candidate
            except Exception as item_err:
                logger.debug(f"WinRT GSMTC session inspection notice: {item_err}")

        if best_candidate is not None:
            s, info, pb, tl = best_candidate
            title = (getattr(info, "title", None) or "").strip()
            artist = (getattr(info, "artist", None) or "").strip()
            album_title = (getattr(info, "album_title", None) or "").strip()
            current_track_key = (title, artist, album_title)

            thumb_ref = getattr(info, "thumbnail", None)
            thumb_url = None

            if thumb_ref:
                if (
                    _thumbnail_cache["track_key"] == current_track_key
                    and _thumbnail_cache["hash"]
                ):
                    thumb_url = (
                        f"/api/overlay/media/thumbnail?v={_thumbnail_cache['hash']}"
                    )
                else:
                    img_bytes, content_type = await extract_thumbnail_bytes(thumb_ref)
                    if img_bytes:
                        import hashlib

                        h = hashlib.sha256(img_bytes).hexdigest()[:16]
                        _thumbnail_cache["bytes"] = img_bytes
                        _thumbnail_cache["content_type"] = content_type or "image/jpeg"
                        _thumbnail_cache["hash"] = h
                        _thumbnail_cache["track_key"] = current_track_key
                        thumb_url = f"/api/overlay/media/thumbnail?v={h}"
                    else:
                        _thumbnail_cache["bytes"] = None
                        _thumbnail_cache["content_type"] = None
                        _thumbnail_cache["hash"] = None
                        _thumbnail_cache["track_key"] = None
            else:
                if _thumbnail_cache["track_key"] != current_track_key:
                    _thumbnail_cache["bytes"] = None
                    _thumbnail_cache["content_type"] = None
                    _thumbnail_cache["hash"] = None
                    _thumbnail_cache["track_key"] = None

            return _build_media_result(info, pb, tl, s, thumbnail_url=thumb_url)

        return {"available": True, "has_media": False}
    except Exception as e:
        logger.debug(f"WinRT GSMTC media query notice: {e}")
    return None


async def get_system_media_info() -> dict:
    """Fetch current playing system media info on Windows using native WinRT GSMTC APIs.
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
        "album_title": _media_cache["album_title"],
        "album_artist": _media_cache["album_artist"],
        "subtitle": _media_cache["subtitle"],
        "genres": list(_media_cache["genres"]),
        "track_number": _media_cache["track_number"],
        "album_track_count": _media_cache["album_track_count"],
        "playback_type": _media_cache["playback_type"],
        "thumbnail": _media_cache["thumbnail"],
        "thumbnail_url": _media_cache["thumbnail_url"],
        "thumbnail_available": _media_cache["thumbnail_available"],
        "status": _media_cache["status"],
        "position_seconds": _media_cache["position_seconds"],
        "start_seconds": _media_cache["start_seconds"],
        "duration_seconds": _media_cache["duration_seconds"],
        "min_seek_seconds": _media_cache["min_seek_seconds"],
        "max_seek_seconds": _media_cache["max_seek_seconds"],
        "timeline_last_updated_ms": _media_cache["timeline_last_updated_ms"],
        "can_seek": _media_cache["can_seek"],
        "is_shuffle_active": _media_cache["is_shuffle_active"],
        "repeat_mode": _media_cache["repeat_mode"],
        "playback_rate": _media_cache["playback_rate"],
        "playback_controls": dict(_media_cache["playback_controls"]),
        "source_app_user_model_id": _media_cache["source_app_user_model_id"],
        "has_media": _media_cache["has_media"],
        "state": _media_cache["state"],
        "source": _media_cache["source"],
        "success": True,
    }


def _apply_media_result(result: dict, *, source: str, now: float) -> None:
    """Store a valid playing/paused media result and reset backoff."""
    _media_cache["title"] = result.get("title") or DEFAULT_TITLE
    _media_cache["artist"] = result.get("artist") or DEFAULT_ARTIST
    for field in MEDIA_TEXT_FIELDS:
        _media_cache[field] = result.get(field)
    _media_cache["genres"] = list(result.get("genres") or [])
    _media_cache["track_number"] = result.get("track_number")
    _media_cache["album_track_count"] = result.get("album_track_count")
    _media_cache["thumbnail_available"] = bool(result.get("thumbnail_available"))
    _media_cache["thumbnail"] = result.get("thumbnail")
    _media_cache["thumbnail_url"] = result.get("thumbnail_url")
    _media_cache["status"] = result.get("status") or "playing"
    _media_cache["position_seconds"] = result.get("position_seconds")
    _media_cache["start_seconds"] = result.get("start_seconds")
    _media_cache["duration_seconds"] = result.get("duration_seconds")
    _media_cache["min_seek_seconds"] = result.get("min_seek_seconds")
    _media_cache["max_seek_seconds"] = result.get("max_seek_seconds")
    _media_cache["timeline_last_updated_ms"] = result.get("timeline_last_updated_ms")
    _media_cache["can_seek"] = bool(result.get("can_seek"))
    _media_cache["is_shuffle_active"] = bool(result.get("is_shuffle_active"))
    _media_cache["repeat_mode"] = result.get("repeat_mode") or "none"
    _media_cache["playback_rate"] = result.get("playback_rate") or 1.0
    _media_cache["playback_type"] = result.get("playback_type") or "unknown"
    _media_cache["playback_controls"] = dict(result.get("playback_controls") or {})
    _media_cache["source_app_user_model_id"] = result.get("source_app_user_model_id")
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
    for field in MEDIA_TEXT_FIELDS:
        _media_cache[field] = None
    _media_cache["genres"] = []
    _media_cache["track_number"] = None
    _media_cache["album_track_count"] = None
    _media_cache["playback_type"] = None
    _media_cache["thumbnail_available"] = False
    _media_cache["thumbnail"] = None
    _media_cache["thumbnail_url"] = None
    _media_cache["status"] = "none"
    _media_cache["position_seconds"] = None
    _media_cache["start_seconds"] = None
    _media_cache["duration_seconds"] = None
    _media_cache["min_seek_seconds"] = None
    _media_cache["max_seek_seconds"] = None
    _media_cache["timeline_last_updated_ms"] = None
    _media_cache["can_seek"] = False
    _media_cache["is_shuffle_active"] = False
    _media_cache["repeat_mode"] = "none"
    _media_cache["playback_rate"] = 1.0
    _media_cache["playback_controls"] = dict(DEFAULT_PLAYBACK_CONTROLS)
    _media_cache["source_app_user_model_id"] = None
    _media_cache["has_media"] = False
    _media_cache["state"] = "none"
    _media_cache["source"] = source
    _media_cache["last_valid"] = now
    _media_cache["failure_count"] = 0
    _media_cache["next_retry_at"] = 0.0
    _thumbnail_cache["bytes"] = None
    _thumbnail_cache["content_type"] = None
    _thumbnail_cache["hash"] = None
    _thumbnail_cache["track_key"] = None


def _apply_media_failure(now: float) -> None:
    """Back off failed queries while preserving a short stale grace period."""
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
    for field in MEDIA_TEXT_FIELDS:
        _media_cache[field] = None
    _media_cache["genres"] = []
    _media_cache["track_number"] = None
    _media_cache["album_track_count"] = None
    _media_cache["playback_type"] = None
    _media_cache["thumbnail_available"] = False
    _media_cache["thumbnail"] = None
    _media_cache["thumbnail_url"] = None
    _media_cache["status"] = "none"
    _media_cache["position_seconds"] = None
    _media_cache["start_seconds"] = None
    _media_cache["duration_seconds"] = None
    _media_cache["min_seek_seconds"] = None
    _media_cache["max_seek_seconds"] = None
    _media_cache["timeline_last_updated_ms"] = None
    _media_cache["can_seek"] = False
    _media_cache["is_shuffle_active"] = False
    _media_cache["repeat_mode"] = "none"
    _media_cache["playback_rate"] = 1.0
    _media_cache["playback_controls"] = dict(DEFAULT_PLAYBACK_CONTROLS)
    _media_cache["source_app_user_model_id"] = None
    _media_cache["has_media"] = False
    _media_cache["source"] = "unavailable"
    _media_cache["state"] = "unavailable"
    _thumbnail_cache["bytes"] = None
    _thumbnail_cache["content_type"] = None
    _thumbnail_cache["hash"] = None
    _thumbnail_cache["track_key"] = None
