"""Discord Rich Presence integration for the telemetry sidecar.

The telemetry loop only submits the latest parsed frame to this module.  All
blocking Discord IPC work is owned by a dedicated worker thread so a missing
Discord client can never delay UDP ingestion or WebSocket broadcasts.
"""

from __future__ import annotations

import copy
import json
import math
import os
import socket
import struct
import threading
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Mapping

IPC_OPCODE_HANDSHAKE = 0
IPC_OPCODE_FRAME = 1
IPC_PIPE_COUNT = 10
STALE_TELEMETRY_SECONDS = 5.0
UPDATE_INTERVAL_SECONDS = 0.5
HEARTBEAT_SECONDS = 15.0

# Discord falls back to the Application icon when an uploaded asset key is
# missing or invalid. Use a stable, project-owned external asset URL so the
# Rich Presence image is independent of the Application's configured icon.
RICH_PRESENCE_IMAGE_URL = (
    "https://raw.githubusercontent.com/eddie772tw/FH6-HorizonTuner/"
    "main/frontend/src-tauri/icons/icon.png"
)
RICH_PRESENCE_IMAGE_TEXT = "FH6 HorizonTuner"


def _finite_positive(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number) or number <= 0:
        return None
    return number


def format_lap_time(value: Any) -> str:
    """Format seconds as m:ss.sss without displaying invalid telemetry."""
    seconds = _finite_positive(value)
    if seconds is None:
        return "--"
    minutes, remainder = divmod(seconds, 60.0)
    return f"{int(minutes)}:{remainder:06.3f}"


def _car_display_name(
    car_ordinal: Any, car_database: Mapping[str, Mapping[str, Any]]
) -> str:
    try:
        ordinal = int(car_ordinal or 0)
    except (TypeError, ValueError):
        ordinal = 0

    info = car_database.get(str(ordinal), {})
    display_name = str(info.get("display_name", "")).strip()
    if display_name:
        return display_name[:80]

    name = " ".join(
        str(info.get(field, "")).strip()
        for field in ("year", "make", "model")
        if str(info.get(field, "")).strip()
    )
    return (name or (f"Car #{ordinal}" if ordinal > 0 else "Unknown Car"))[:80]


@dataclass(frozen=True)
class PresenceSnapshot:
    car_ordinal: int
    car_name: str
    mode: str
    current_lap_seconds: float | None
    last_lap_seconds: float | None
    best_lap_seconds: float | None
    lap_number: int | None
    race_position: int | None
    current_race_time: float | None


def snapshot_from_telemetry(
    data: Mapping[str, Any],
    car_database: Mapping[str, Mapping[str, Any]],
) -> PresenceSnapshot:
    """Create a cheap, deterministic Presence domain snapshot.

    `IsRaceOn` remains the validity gate supplied by the existing parser.  The
    race-vs-roaming distinction deliberately uses the verified race recorder
    rule instead of treating `IsRaceOn` as a race-mode indicator.
    """
    try:
        car_ordinal = int(data.get("CarOrdinal", 0) or 0)
    except (TypeError, ValueError):
        car_ordinal = 0

    current_race_time = _finite_positive(data.get("CurrentRaceTime"))
    current_lap = _finite_positive(data.get("CurrentLap"))
    try:
        is_race_on = int(data.get("IsRaceOn", 0) or 0) == 1
    except (TypeError, ValueError):
        is_race_on = False
    mode = (
        "race"
        if is_race_on and current_race_time is not None and current_lap is not None
        else "roam"
    )

    def positive_int(key: str) -> int | None:
        try:
            value = int(data.get(key, 0) or 0)
        except (TypeError, ValueError):
            return None
        return value if value > 0 else None

    return PresenceSnapshot(
        car_ordinal=car_ordinal,
        car_name=_car_display_name(car_ordinal, car_database),
        mode=mode,
        current_lap_seconds=current_lap,
        last_lap_seconds=_finite_positive(data.get("LastLap")),
        best_lap_seconds=_finite_positive(data.get("BestLap")),
        lap_number=positive_int("LapNumber"),
        race_position=positive_int("RacePosition"),
        current_race_time=current_race_time,
    )


def build_activity(snapshot: PresenceSnapshot, start_timestamp: int) -> dict[str, Any]:
    """Build the compact Discord SET_ACTIVITY payload."""
    best = format_lap_time(snapshot.best_lap_seconds)
    details = f"{snapshot.car_name}"
    if snapshot.mode == "race":
        lap = f"Lap {snapshot.lap_number}" if snapshot.lap_number else "Race"
        position = f"P{snapshot.race_position}" if snapshot.race_position else "P--"
        state = f"Race · {lap} · {position} · {best}"
    else:
        state = "Roaming"

    return {
        "type": 0,
        "details": details[:128],
        "state": state[:128],
        "timestamps": {"start": int(start_timestamp)},
        "assets": {
            "large_image": RICH_PRESENCE_IMAGE_URL,
            "large_text": RICH_PRESENCE_IMAGE_TEXT,
            "small_text": snapshot.car_name,
        },
    }


def _read_json_config(path: Path) -> str | None:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError):
        return None
    if isinstance(payload, dict):
        value = payload.get("discord_application_id")
        return str(value).strip() if value is not None else None
    return None


def _valid_application_id(value: str | None) -> str | None:
    if value and value.isdigit() and 17 <= len(value) <= 20:
        return value
    return None


def _safe_error_detail(error: Exception) -> str:
    """Return bounded IPC diagnostics without including application credentials."""
    root_error = error.__cause__ or error
    detail = str(root_error).strip() or "no additional detail"
    return f"{type(root_error).__name__}: {detail}"[:240]


def load_discord_application_id(data_root: str, resource_root: str) -> str | None:
    """Resolve the ID without ever logging or exposing its value.

    Runtime environment wins, followed by ignored local config, followed by
    the release-only embedded resource generated by GitHub Actions.
    """
    candidates: list[str | None] = [os.environ.get("DISCORD_APPLICATION_ID")]
    data_path = Path(data_root)
    resource_path = Path(resource_root)
    project_root = resource_path.parent
    candidates.extend(
        [
            _read_json_config(project_root / "config" / "discord.local.json"),
            _read_json_config(data_path / "discord.local.json"),
            _read_json_config(resource_path / "discord_application_id.json"),
        ]
    )
    for candidate in candidates:
        valid = _valid_application_id(candidate.strip() if candidate else None)
        if valid:
            return valid
    return None


class _DiscordIpcStream:
    def __init__(self, handle: Any, is_socket: bool):
        self.handle = handle
        self.is_socket = is_socket

    def write(self, payload: bytes) -> None:
        if self.is_socket:
            self.handle.sendall(payload)
        else:
            self.handle.write(payload)
            self.handle.flush()

    def read(self, size: int) -> bytes:
        chunks: list[bytes] = []
        remaining = size
        while remaining:
            chunk = (
                self.handle.recv(remaining)
                if self.is_socket
                else self.handle.read(remaining)
            )
            if not chunk:
                raise ConnectionError("Discord IPC closed the connection")
            chunks.append(chunk)
            remaining -= len(chunk)
        return b"".join(chunks)

    def close(self) -> None:
        try:
            self.handle.close()
        except Exception:
            pass


class DiscordIpcClient:
    """Small synchronous Discord IPC client isolated behind a testable API."""

    def __init__(
        self,
        application_id: str,
        stream_factory: Callable[[int], _DiscordIpcStream] | None = None,
    ):
        self.application_id = application_id
        self._stream_factory = stream_factory
        self.stream: _DiscordIpcStream | None = None

    def connect(self) -> None:
        last_error: Exception | None = None
        for index in range(IPC_PIPE_COUNT):
            try:
                if self._stream_factory is not None:
                    self.stream = self._stream_factory(index)
                elif os.name == "nt":
                    handle = open(rf"\\?\pipe\discord-ipc-{index}", "r+b", buffering=0)
                    self.stream = _DiscordIpcStream(handle, is_socket=False)
                else:
                    handle = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                    handle.settimeout(2.0)
                    handle.connect(f"/tmp/discord-ipc-{index}")
                    self.stream = _DiscordIpcStream(handle, is_socket=True)
                response = self._send(
                    IPC_OPCODE_HANDSHAKE, {"v": 1, "client_id": self.application_id}
                )
                if response.get("evt") != "READY":
                    raise ConnectionError("Discord IPC handshake was not ready")
                return
            except (OSError, ConnectionError) as error:
                last_error = error
                self.close()
        raise ConnectionError("Discord Desktop IPC pipe not available") from last_error

    def set_activity(self, activity: dict[str, Any]) -> None:
        self._send_command(
            {"pid": os.getpid(), "activity": activity},
        )

    def clear_activity(self) -> None:
        self._send_command({"pid": os.getpid(), "activity": None})

    def _send_command(self, args: dict[str, Any]) -> None:
        nonce = str(uuid.uuid4())
        response = self._send(
            IPC_OPCODE_FRAME,
            {"cmd": "SET_ACTIVITY", "args": args, "nonce": nonce},
        )
        if response.get("evt") == "ERROR":
            raise ConnectionError("Discord IPC rejected SET_ACTIVITY")
        if response.get("cmd") != "SET_ACTIVITY" or response.get("nonce") != nonce:
            raise ConnectionError("Discord IPC response did not match SET_ACTIVITY")

    def _send(self, opcode: int, payload: dict[str, Any]) -> dict[str, Any]:
        if self.stream is None:
            raise ConnectionError("Discord IPC is not connected")
        encoded = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.stream.write(struct.pack("<II", opcode, len(encoded)) + encoded)
        # Discord replies to commands; consume the frame to avoid pipe buildup.
        header = self.stream.read(8)
        response_opcode, length = struct.unpack("<II", header)
        if response_opcode != IPC_OPCODE_FRAME:
            raise ConnectionError("Discord IPC response used an unexpected opcode")
        if length > 4 * 1024 * 1024:
            raise ConnectionError("Discord IPC response is unexpectedly large")
        try:
            response = json.loads(self.stream.read(length).decode("utf-8"))
        except (UnicodeDecodeError, ValueError, TypeError) as error:
            raise ConnectionError("Discord IPC response was not valid JSON") from error
        if not isinstance(response, dict):
            raise ConnectionError("Discord IPC response was not an object")
        return response

    def close(self) -> None:
        if self.stream is not None:
            self.stream.close()
            self.stream = None


class DiscordPresenceManager:
    """Latest-only producer plus a blocking IPC worker."""

    def __init__(
        self, application_id: str | None, car_database: Mapping[str, Mapping[str, Any]]
    ):
        self.application_id = application_id
        self.car_database = car_database
        self._condition = threading.Condition()
        self._latest_data: Mapping[str, Any] | None = None
        self._latest_received_at = 0.0
        self._stop = False
        self._thread: threading.Thread | None = None
        self._client: DiscordIpcClient | None = None
        self._status_lock = threading.Lock()
        self._status = (
            "missing_application_id" if not application_id else "waiting_for_telemetry"
        )
        self._last_error: str | None = None
        self._last_telemetry_at: float | None = None
        self._last_attempt_at: float | None = None
        self._connection_attempts = 0
        self._updates_sent = 0
        self._last_activity: dict[str, Any] | None = None
        self._last_activity_sent_at: float | None = None
        self._reconnects = 0

    def start(self) -> None:
        if self._thread is None:
            self._thread = threading.Thread(
                target=self._run, name="discord-presence", daemon=True
            )
            self._thread.start()

    def stop(self) -> None:
        with self._condition:
            self._stop = True
            self._condition.notify_all()
        if self._thread is not None:
            self._thread.join(timeout=2.0)
        self._thread = None
        self._close_client()

    def submit(self, data: Mapping[str, Any]) -> None:
        if not self.application_id:
            return
        received_at = time.time()
        with self._condition:
            self._latest_data = data
            self._latest_received_at = time.monotonic()
            self._condition.notify()
        with self._status_lock:
            self._last_telemetry_at = received_at
            if self._status in {"waiting_for_telemetry", "error"}:
                self._status = "waiting_for_discord"

    def status(self) -> dict[str, Any]:
        with self._status_lock:
            return {
                "configured": bool(self.application_id),
                "state": self._status,
                "lastError": self._last_error,
                "lastTelemetryAt": self._last_telemetry_at,
                "lastAttemptAt": self._last_attempt_at,
                "connectionAttempts": self._connection_attempts,
                "updatesSent": self._updates_sent,
                "lastActivity": copy.deepcopy(self._last_activity),
                "lastActivitySentAt": self._last_activity_sent_at,
                "reconnects": self._reconnects,
            }

    def _run(self) -> None:
        last_key: str | None = None
        last_sent_at = 0.0
        activity_start = int(time.time())
        last_mode: str | None = None
        last_car_ordinal: int | None = None
        next_retry_at = 0.0

        while True:
            with self._condition:
                self._condition.wait(timeout=UPDATE_INTERVAL_SECONDS)
                if self._stop:
                    break
                data = self._latest_data
                received_at = self._latest_received_at

            now = time.monotonic()
            if data is None:
                if self._client is None and self.application_id:
                    self._set_status("waiting_for_telemetry", None)
                continue
            if now - received_at > STALE_TELEMETRY_SECONDS:
                if self._client is not None and last_key is not None:
                    try:
                        self._client.clear_activity()
                    except (ConnectionError, OSError):
                        pass
                    last_key = None
                last_mode = None
                last_car_ordinal = None
                continue

            snapshot = snapshot_from_telemetry(data, self.car_database)
            if snapshot.mode != last_mode or snapshot.car_ordinal != last_car_ordinal:
                activity_start = int(time.time())
                last_mode = snapshot.mode
                last_car_ordinal = snapshot.car_ordinal
            activity = build_activity(snapshot, activity_start)
            key = json.dumps(activity, sort_keys=True, separators=(",", ":"))
            if key == last_key and now - last_sent_at < HEARTBEAT_SECONDS:
                continue
            if now < next_retry_at:
                continue

            try:
                if self._client is None:
                    self._set_status("connecting", None)
                    with self._status_lock:
                        self._connection_attempts += 1
                        self._last_attempt_at = time.time()
                    self._client = DiscordIpcClient(self.application_id or "")
                    self._client.connect()
                    self._set_status("connected", None)
                    self._reconnects = 0
                self._client.set_activity(activity)
                last_key = key
                last_sent_at = now
                with self._status_lock:
                    self._updates_sent += 1
                    self._last_activity = copy.deepcopy(activity)
                    self._last_activity_sent_at = time.time()
            except (ConnectionError, OSError, ValueError) as error:
                self._set_status("error", _safe_error_detail(error))
                self._close_client()
                self._reconnects += 1
                next_retry_at = now + min(30.0, 2.0 * max(1, self._reconnects))

        if self._client is not None and last_key is not None:
            try:
                self._client.clear_activity()
            except (ConnectionError, OSError):
                pass

    def _set_status(self, state: str, error: str | None) -> None:
        with self._status_lock:
            self._status = state
            self._last_error = error

    def _close_client(self) -> None:
        if self._client is not None:
            self._client.close()
            self._client = None
