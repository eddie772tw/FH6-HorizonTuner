import json
import os
import struct
import time
from pathlib import Path

import pytest
from discord_presence import (
    DiscordIpcClient,
    DiscordPresenceManager,
    build_activity,
    format_lap_time,
    load_discord_application_id,
    snapshot_from_telemetry,
)


def _car_db():
    return {
        "1041": {
            "year": 2022,
            "make": "Toyota",
            "model": "GR86",
        }
    }


def _race_data(**overrides):
    data = {
        "IsRaceOn": 1,
        "CarOrdinal": 1041,
        "CurrentRaceTime": 125.0,
        "CurrentLap": 22.1,
        "LastLap": 66.8,
        "BestLap": 65.2,
        "LapNumber": 3,
        "RacePosition": 2,
    }
    data.update(overrides)
    return data


def test_snapshot_uses_race_recorder_rule_not_is_race_on_alone():
    race = snapshot_from_telemetry(_race_data(), _car_db())
    roam = snapshot_from_telemetry(
        _race_data(CurrentRaceTime=0, CurrentLap=0), _car_db()
    )
    invalid = snapshot_from_telemetry(_race_data(IsRaceOn=0), _car_db())

    assert race.mode == "race"
    assert race.car_name == "2022 Toyota GR86"
    assert roam.mode == "roam"
    assert invalid.mode == "roam"


def test_activity_contains_car_best_lap_and_position():
    snapshot = snapshot_from_telemetry(_race_data(), _car_db())

    activity = build_activity(snapshot, 1_700_000_000)

    assert activity["details"] == "2022 Toyota GR86 · Best 1:05.200"
    assert activity["state"] == "Race · Lap 3 · P2"
    assert activity["timestamps"] == {"start": 1_700_000_000}


def test_activity_degrades_when_optional_race_values_are_missing():
    snapshot = snapshot_from_telemetry(
        _race_data(
            BestLap=0, RacePosition=0, LapNumber=0, CurrentRaceTime=0, CurrentLap=0
        ),
        _car_db(),
    )

    activity = build_activity(snapshot, 1_700_000_000)

    assert activity["details"] == "2022 Toyota GR86 · Best --"
    assert activity["state"] == "Roaming"


def test_lap_time_formatting_rejects_invalid_values():
    assert format_lap_time(65.2) == "1:05.200"
    assert format_lap_time(0) == "--"
    assert format_lap_time(float("nan")) == "--"


def test_application_id_precedence_and_validation(tmp_path, monkeypatch):
    project_root = tmp_path / "project"
    resource_root = project_root / "backend"
    resource_root.mkdir(parents=True)
    config_dir = project_root / "config"
    config_dir.mkdir()
    (config_dir / "discord.local.json").write_text(
        json.dumps({"discord_application_id": "11111111111111111"}),
        encoding="utf-8",
    )
    (resource_root / "discord_application_id.json").write_text(
        json.dumps({"discord_application_id": "22222222222222222"}),
        encoding="utf-8",
    )

    monkeypatch.delenv("DISCORD_APPLICATION_ID", raising=False)
    assert (
        load_discord_application_id(str(tmp_path), str(resource_root))
        == "11111111111111111"
    )

    monkeypatch.setenv("DISCORD_APPLICATION_ID", "33333333333333333")
    assert (
        load_discord_application_id(str(tmp_path), str(resource_root))
        == "33333333333333333"
    )

    monkeypatch.setenv("DISCORD_APPLICATION_ID", "not-an-id")
    assert (
        load_discord_application_id(str(tmp_path), str(resource_root))
        == "11111111111111111"
    )


def test_presence_status_distinguishes_telemetry_wait_from_discord_wait():
    manager = DiscordPresenceManager("11111111111111111", _car_db())

    initial = manager.status()
    assert initial["state"] == "waiting_for_telemetry"
    assert initial["lastTelemetryAt"] is None
    assert initial["connectionAttempts"] == 0
    assert initial["lastActivity"] is None
    assert initial["lastActivitySentAt"] is None

    manager.submit(_race_data())

    waiting_for_discord = manager.status()
    assert waiting_for_discord["state"] == "waiting_for_discord"
    assert waiting_for_discord["lastTelemetryAt"] is not None
    assert waiting_for_discord["connectionAttempts"] == 0


def test_presence_status_records_activity_after_successful_send(monkeypatch):
    class FakeClient:
        def __init__(self, _application_id):
            self.activity = None

        def connect(self):
            return None

        def set_activity(self, activity):
            self.activity = activity

        def clear_activity(self):
            return None

        def close(self):
            return None

    monkeypatch.setattr("discord_presence.DiscordIpcClient", FakeClient)
    manager = DiscordPresenceManager("11111111111111111", _car_db())
    manager.start()
    try:
        manager.submit(_race_data())
        for _ in range(100):
            if manager.status()["updatesSent"] == 1:
                break
            time.sleep(0.01)
        status = manager.status()
    finally:
        manager.stop()

    assert status["state"] == "connected"
    assert status["updatesSent"] == 1
    assert status["lastActivity"]["type"] == 0
    assert status["lastActivity"]["details"] == "2022 Toyota GR86 · Best 1:05.200"
    assert status["lastActivity"]["state"] == "Race · Lap 3 · P2"
    assert status["lastActivity"]["assets"]["large_image"] == "fh6_horizon_tuner"
    assert status["lastActivitySentAt"] is not None


class _FakeStream:
    """A protocol-aware Discord IPC peer that never needs a Discord client."""

    def __init__(self, ready_event="READY"):
        self.requests = []
        self.reads = []
        self.ready_event = ready_event

    def _queue_response(self, payload):
        encoded = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.reads.extend([struct.pack("<II", 1, len(encoded)), encoded])

    def write(self, payload):
        opcode, length = struct.unpack("<II", payload[:8])
        encoded = payload[8:]
        assert len(encoded) == length
        request = json.loads(encoded.decode("utf-8"))
        self.requests.append((opcode, request))

        if opcode == 0:
            assert request == {"v": 1, "client_id": "11111111111111111"}
            self._queue_response(
                {"cmd": "DISPATCH", "evt": self.ready_event, "data": {}}
            )
            return

        assert opcode == 1
        assert request["cmd"] == "SET_ACTIVITY"
        assert isinstance(request["args"]["pid"], int)
        assert isinstance(request["nonce"], str)
        self._queue_response(
            {
                "cmd": request["cmd"],
                "evt": None,
                "data": None,
                "nonce": request["nonce"],
            }
        )

    def read(self, size):
        value = self.reads.pop(0)
        assert len(value) == size
        return value

    def close(self):
        pass


def test_ipc_protocol_asserts_handshake_activity_and_clear_without_discord():
    stream = _FakeStream()
    client = DiscordIpcClient("11111111111111111", stream_factory=lambda _index: stream)

    client.connect()
    client.set_activity({"type": 0, "details": "test"})
    client.clear_activity()

    assert [opcode for opcode, _request in stream.requests] == [0, 1, 1]
    set_request = stream.requests[1][1]
    clear_request = stream.requests[2][1]
    assert set_request["args"] == {
        "pid": os.getpid(),
        "activity": {"type": 0, "details": "test"},
    }
    assert clear_request["args"] == {"pid": os.getpid(), "activity": None}
    assert set_request["nonce"] != clear_request["nonce"]


def test_ipc_client_rejects_handshake_without_ready_event():
    stream = _FakeStream(ready_event="ERROR")
    client = DiscordIpcClient("11111111111111111", stream_factory=lambda _index: stream)

    with pytest.raises(ConnectionError, match="pipe not available") as error:
        client.connect()
    assert isinstance(error.value.__cause__, ConnectionError)
    assert str(error.value.__cause__) == "Discord IPC handshake was not ready"


def test_release_build_requires_secret_and_embeds_only_sidecar_resource():
    repository_root = Path(__file__).resolve().parents[1]
    workflow = (repository_root / ".github" / "workflows" / "release.yml").read_text(
        encoding="utf-8"
    )
    spec = (repository_root / "server-sidecar.spec").read_text(encoding="utf-8")

    assert "DISCORD_APPLICATION_ID: ${{ secrets.DISCORD_APPLICATION_ID }}" in workflow
    assert "DISCORD_APPLICATION_ID is empty or unavailable." in workflow
    assert "backend/discord_application_id.json" in workflow
    assert "discord_application_id_file" in spec
    sidecar_start = workflow.index("Build Python Backend Sidecar Executable")
    stage_start = workflow.index("Stage Embedded Sidecar")
    assert "frontend" not in workflow[sidecar_start:stage_start]
