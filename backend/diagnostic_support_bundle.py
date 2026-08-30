"""Privacy-preserving, bounded diagnostic support bundle generation.

The bundle deliberately accepts only a small set of aggregate diagnostics.  It
never receives telemetry frames or settings files, and it is created entirely
in memory so a support export does not leave a second copy on disk.
"""

from __future__ import annotations

import io
import json
import re
import zipfile
from collections.abc import Mapping
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

MAX_WINDOW_MINUTES = 60
MAX_LOG_ENTRIES = 100
MAX_SECTION_BYTES = 256 * 1024
MAX_BUNDLE_BYTES = 1024 * 1024

ALLOWED_FIELDS = frozenset(
    {"telemetryPipeline", "overlay", "discordPresence", "recentLogs"}
)

_LOG_TIMESTAMP = re.compile(r"^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3})")
_ABSOLUTE_PATH = re.compile(r"(?:[A-Za-z]:[\\/][^\s\"']+|/(?:[^\s\"']+))")
_EMAIL = re.compile(r"\b[^\s@]+@[^\s@]+\.[^\s@]+\b")
_SECRET_VALUE = re.compile(
    r"(?i)\b(password|passphrase|token|secret|credential|authorization|api[_-]?key)\b"
    r"\s*[:=]\s*[^\s,;]+"
)
_SENSITIVE_MESSAGE = re.compile(r"(?i)\b(raw[_ ]?udp|packet payload|raw payload)\b")
_SENSITIVE_KEY_PARTS = (
    "password",
    "passphrase",
    "credential",
    "secret",
    "token",
    "authorization",
    "api_key",
    "apikey",
    "raw_udp",
    "payload",
    "packet",
    "path",
    "player",
    "gamertag",
    "user_name",
    "username",
    "email",
)


def _is_sensitive_key(key: str) -> bool:
    normalized = key.casefold().replace("-", "_")
    return any(part in normalized for part in _SENSITIVE_KEY_PARTS)


def redact_value(value: Any) -> Any:
    """Drop unsafe mapping fields and redact identifying strings recursively."""
    if isinstance(value, Mapping):
        return {
            str(key): redact_value(child)
            for key, child in value.items()
            if not _is_sensitive_key(str(key))
        }
    if isinstance(value, list):
        return [redact_value(item) for item in value]
    if isinstance(value, tuple):
        return [redact_value(item) for item in value]
    if isinstance(value, str):
        if _SENSITIVE_MESSAGE.search(value):
            return "[redacted: unsafe diagnostic content]"
        value = _SECRET_VALUE.sub(r"\1=[redacted]", value)
        value = _ABSOLUTE_PATH.sub("[redacted-path]", value)
        return _EMAIL.sub("[redacted-email]", value)
    return value


def _parse_timestamp(line: str) -> datetime | None:
    match = _LOG_TIMESTAMP.match(line)
    if not match:
        return None
    return datetime.strptime(match.group(1), "%Y-%m-%d %H:%M:%S,%f").replace(tzinfo=UTC)


def collect_recent_logs(log_path: Path, cutoff: datetime) -> list[str]:
    """Read a bounded, timestamped log window without retaining orphan lines."""
    if not log_path.is_file():
        return []

    entries: list[tuple[datetime, list[str]]] = []
    current_timestamp: datetime | None = None
    current_lines: list[str] = []
    with log_path.open("r", encoding="utf-8", errors="ignore") as log_file:
        for raw_line in log_file:
            line = raw_line.rstrip("\r\n")
            timestamp = _parse_timestamp(line)
            if timestamp is not None:
                if current_timestamp is not None and current_timestamp >= cutoff:
                    entries.append((current_timestamp, current_lines))
                current_timestamp, current_lines = timestamp, [line]
            elif current_timestamp is not None:
                current_lines.append(line)
        if current_timestamp is not None and current_timestamp >= cutoff:
            entries.append((current_timestamp, current_lines))

    result: list[str] = []
    used_bytes = 0
    for _, lines in entries[-MAX_LOG_ENTRIES:]:
        for line in lines:
            safe_line = str(redact_value(line))
            encoded_length = len(safe_line.encode("utf-8")) + 1
            if used_bytes + encoded_length > MAX_SECTION_BYTES:
                return result
            result.append(safe_line)
            used_bytes += encoded_length
    return result


def _encode_json(value: Any) -> bytes:
    encoded = json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True).encode(
        "utf-8"
    )
    if len(encoded) > MAX_SECTION_BYTES:
        raise ValueError("Diagnostic section exceeds the support bundle size limit")
    return encoded


def create_support_bundle(
    *,
    log_path: Path,
    diagnostics: Mapping[str, Any],
    app_version: str,
    backend_version: str,
    window_minutes: int = 10,
    requested_fields: list[str] | None = None,
    now: datetime | None = None,
) -> bytes:
    """Create a redacted ZIP payload or reject invalid collection requests."""
    if not 1 <= window_minutes <= MAX_WINDOW_MINUTES:
        raise ValueError(f"windowMinutes must be between 1 and {MAX_WINDOW_MINUTES}")
    requested = requested_fields or sorted(ALLOWED_FIELDS)
    unsafe_fields = set(requested) - ALLOWED_FIELDS
    if unsafe_fields:
        raise ValueError("Requested diagnostic fields are not allowed")

    generated_at = now or datetime.now(UTC)
    cutoff = generated_at - timedelta(minutes=window_minutes)
    files: dict[str, bytes] = {}
    for field in requested:
        if field == "recentLogs":
            files["recent-logs.txt"] = "\n".join(
                collect_recent_logs(log_path, cutoff)
            ).encode("utf-8")
        else:
            files[f"diagnostics/{field}.json"] = _encode_json(
                redact_value(diagnostics.get(field, {}))
            )

    manifest = {
        "schemaVersion": "fh6-diagnostic-support-bundle/v1",
        "generatedAt": generated_at.isoformat(),
        "appVersion": app_version,
        "backendVersion": backend_version,
        "settingsSchema": "settings/v1 (schema identifier only; no settings values)",
        "windowMinutes": window_minutes,
        "includedFields": requested,
        "redaction": {
            "excluded": [
                "raw UDP payloads and packets",
                "absolute paths",
                "player identifiers",
                "credentials, tokens, and secrets",
            ],
            "collection": "manual local export; this bundle is not uploaded automatically",
        },
    }
    files["manifest.json"] = _encode_json(manifest)

    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for filename, content in files.items():
            archive.writestr(filename, content)
    bundle = output.getvalue()
    if len(bundle) > MAX_BUNDLE_BYTES:
        raise ValueError("Support bundle exceeds the size limit")
    return bundle
