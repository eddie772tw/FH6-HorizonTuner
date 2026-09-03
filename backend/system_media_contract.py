"""Pure GSMTC-to-JSON contract mapping for the overlay media pipeline."""

from typing import Any

DEFAULT_TITLE = "Turbo Fire"
DEFAULT_ARTIST = "TANTRON"

MEDIA_TEXT_FIELDS = (
    "album_title",
    "album_artist",
    "subtitle",
    "playback_type",
)

MEDIA_STATUS_BY_VALUE = {
    0: "closed",
    1: "opened",
    2: "changing",
    3: "stopped",
    4: "playing",
    5: "paused",
}

MEDIA_PLAYBACK_TYPE_BY_VALUE = {0: "unknown", 1: "music", 2: "video", 3: "image"}
MEDIA_REPEAT_MODE_BY_VALUE = {0: "none", 1: "track", 2: "list"}

PLAYBACK_CONTROL_FIELDS = (
    "is_channel_down_enabled",
    "is_channel_up_enabled",
    "is_fast_forward_enabled",
    "is_next_enabled",
    "is_pause_enabled",
    "is_playback_position_enabled",
    "is_playback_rate_enabled",
    "is_play_enabled",
    "is_play_pause_toggle_enabled",
    "is_previous_enabled",
    "is_record_enabled",
    "is_repeat_enabled",
    "is_rewind_enabled",
    "is_shuffle_enabled",
    "is_stop_enabled",
)

DEFAULT_PLAYBACK_CONTROLS = {field: False for field in PLAYBACK_CONTROL_FIELDS}


def _enum_value(value: Any) -> int | None:
    """Return a WinRT enum as an int without coupling to one projection version."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _safe_text(value: Any) -> str | None:
    if value is None:
        return None
    try:
        text = str(value).strip()
    except Exception:
        return None
    return text or None


def _safe_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _safe_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number and abs(number) != float("inf") else None


def _time_span_seconds(value: Any) -> float | None:
    """Convert WinRT/.NET time spans to seconds across Python projections."""
    if value is None:
        return None
    total_seconds = getattr(value, "total_seconds", None)
    if callable(total_seconds):
        seconds = _safe_float(total_seconds())
    else:
        duration = getattr(value, "duration", value)
        raw_duration = _safe_float(duration)
        seconds = raw_duration / 10_000_000 if raw_duration is not None else None
    if seconds is None or seconds < 0:
        return None
    return round(seconds, 3)


def _date_time_ms(value: Any) -> int | None:
    """Convert a WinRT DateTime or datetime-like value to Unix milliseconds."""
    if value is None:
        return None
    timestamp = getattr(value, "timestamp", None)
    if callable(timestamp):
        seconds = _safe_float(timestamp())
        return round(seconds * 1000) if seconds is not None else None
    raw_ticks = _safe_float(value)
    if raw_ticks is None:
        return None
    # WinRT DateTime is a 100-nanosecond count from 1601-01-01 UTC.
    return round(raw_ticks / 10_000 - 11_644_473_600_000)


def _safe_genres(value: Any) -> list[str]:
    if value is None:
        return []
    try:
        values = list(value)
    except (TypeError, ValueError):
        return []
    return [text for text in (_safe_text(item) for item in values) if text][:8]


def _playback_controls_snapshot(controls: Any) -> dict[str, bool]:
    """Expose capability flags without exposing WinRT objects to JSON."""
    return {
        field: bool(getattr(controls, field, False))
        for field in PLAYBACK_CONTROL_FIELDS
    }


def build_media_result(
    info: Any,
    playback_info: Any = None,
    timeline: Any = None,
    session: Any = None,
) -> dict[str, Any]:
    """Map WinRT GSMTC objects into the bounded JSON media contract."""
    status_value = _enum_value(getattr(playback_info, "playback_status", None))
    playback_type_value = _enum_value(getattr(info, "playback_type", None))
    if playback_type_value is None:
        playback_type_value = _enum_value(getattr(playback_info, "playback_type", None))

    controls = getattr(playback_info, "controls", None)
    repeat_value = _enum_value(getattr(playback_info, "auto_repeat_mode", None))
    playback_rate = _safe_float(getattr(playback_info, "playback_rate", None))
    position_seconds = _time_span_seconds(getattr(timeline, "position", None))
    start_seconds = _time_span_seconds(getattr(timeline, "start_time", None))
    end_seconds = _time_span_seconds(getattr(timeline, "end_time", None))
    duration_seconds = end_seconds
    if start_seconds is not None and end_seconds is not None:
        duration_seconds = max(0, round(end_seconds - start_seconds, 3))

    return {
        "title": _safe_text(getattr(info, "title", None)) or DEFAULT_TITLE,
        "artist": _safe_text(getattr(info, "artist", None)) or DEFAULT_ARTIST,
        "album_title": _safe_text(getattr(info, "album_title", None)),
        "album_artist": _safe_text(getattr(info, "album_artist", None)),
        "subtitle": _safe_text(getattr(info, "subtitle", None)),
        "genres": _safe_genres(getattr(info, "genres", None)),
        "track_number": _safe_int(getattr(info, "track_number", None)),
        "album_track_count": _safe_int(getattr(info, "album_track_count", None)),
        "playback_type": MEDIA_PLAYBACK_TYPE_BY_VALUE.get(
            playback_type_value, "unknown"
        ),
        # WinRT exposes Thumbnail as a RandomAccessStream. Keep the complete
        # media-properties field in the contract, but do not serialize the
        # stream object until a bounded image/data-URI transport is designed.
        "thumbnail": None,
        "thumbnail_available": getattr(info, "thumbnail", None) is not None,
        "status": MEDIA_STATUS_BY_VALUE.get(status_value, "playing"),
        "position_seconds": position_seconds,
        "start_seconds": start_seconds,
        "duration_seconds": duration_seconds,
        "min_seek_seconds": _time_span_seconds(
            getattr(timeline, "min_seek_time", None)
        ),
        "max_seek_seconds": _time_span_seconds(
            getattr(timeline, "max_seek_time", None)
        ),
        "timeline_last_updated_ms": _date_time_ms(
            getattr(timeline, "last_updated_time", None)
        ),
        "can_seek": bool(getattr(controls, "is_playback_position_enabled", False)),
        "is_shuffle_active": bool(getattr(playback_info, "is_shuffle_active", False)),
        "repeat_mode": MEDIA_REPEAT_MODE_BY_VALUE.get(repeat_value, "none"),
        "playback_rate": playback_rate if playback_rate is not None else 1.0,
        "playback_controls": _playback_controls_snapshot(controls),
        "source_app_user_model_id": _safe_text(
            getattr(session, "source_app_user_model_id", None)
        ),
        "has_media": True,
        "available": True,
    }
