"""Replay fixtures prove deterministic boundaries, not live FH6 telemetry behavior."""

import asyncio
import struct
from unittest.mock import AsyncMock, Mock

import main
import pytest
from race_recorder import AsyncRacePersistence, RaceRecorder
from telemetry_listener import (
    TELEMETRY_STRUCT_FORMAT,
    pack_telemetry_binary,
    parse_telemetry_packet,
)
from telemetry_replay_fixture import (
    FIXTURE_CONTRACT_VERSION,
    load_synthetic_replay_fixture,
    replay_raw_packets,
)
from telemetry_runtime import TelemetryPipelineMetrics


def test_fixture_declares_synthetic_provenance_and_version():
    fixture = load_synthetic_replay_fixture()

    assert fixture["fixtureContractVersion"] == FIXTURE_CONTRACT_VERSION
    assert fixture["provenance"] == {
        "source": "synthetic",
        "containsRealVehicleOrPlayerData": False,
        "purpose": "deterministic parser, recorder, and wire-contract regression coverage",
        "notEvidenceOfLiveForzaBehavior": True,
    }


def test_fixture_loader_rejects_unknown_contract_version(monkeypatch):
    fixture = load_synthetic_replay_fixture()
    fixture["fixtureContractVersion"] = "fh6-telemetry-replay-fixture/v999"
    monkeypatch.setattr("telemetry_replay_fixture.json.loads", lambda _: fixture)

    with pytest.raises(ValueError, match="unsupported"):
        load_synthetic_replay_fixture()


def test_replay_preserves_raw_domain_and_binary_wire_units():
    domain = parse_telemetry_packet(replay_raw_packets()[0])

    assert domain is not None
    assert domain["TimestampMS"] == 1000
    assert domain["SpeedMetersPerSecond"] == pytest.approx(22.5)
    assert domain["PowerWatts"] == pytest.approx(149140.0)
    assert domain["AccelerationX"] == pytest.approx(9.81)
    assert domain["TireTemp"] == pytest.approx([180.0, 181.0, 182.0, 183.0])

    wire = pack_telemetry_binary(domain)
    unpacked = struct.unpack(TELEMETRY_STRUCT_FORMAT, wire)
    assert len(wire) == 128
    assert unpacked[4] == pytest.approx(81.0)  # m/s -> km/h
    assert unpacked[6] == pytest.approx(200.0)  # W -> hp
    assert unpacked[7] == pytest.approx(2.0)  # Pa -> PSI
    assert unpacked[8] == pytest.approx(1.0)  # m/s² -> G
    assert unpacked[14:18] == pytest.approx((180.0, 181.0, 182.0, 183.0))


def test_replay_makes_timestamp_discontinuity_explicit_for_recorder():
    parsed_frames = [parse_telemetry_packet(packet) for packet in replay_raw_packets()]
    assert all(frame is not None for frame in parsed_frames)

    persistence = AsyncRacePersistence(Mock())
    recorder = RaceRecorder(persistence, {"race_recording": True}, {})
    recorder.downsample_interval = 0
    for frame in parsed_frames:
        recorder.record(frame)

    assert [point["TimestampMS"] for point in recorder.in_memory_batch] == [
        1000,
        1100,
        850,
    ]
    assert [point["time"] for point in recorder.in_memory_batch] == [0.0, 0.1, -0.15]


@pytest.mark.asyncio
async def test_broadcast_backpressure_keeps_the_most_recent_fixture_frame(monkeypatch):
    parsed_frames = [parse_telemetry_packet(packet) for packet in replay_raw_packets()]
    assert all(frame is not None for frame in parsed_frames)
    first = parsed_frames[0]
    queue = asyncio.Queue(maxsize=10)
    for timestamp in range(1000, 1700, 100):
        queued = dict(first, TimestampMS=timestamp)
        queue.put_nowait(queued)

    broadcast_started = asyncio.Event()

    async def record_broadcast(data):
        assert data["TimestampMS"] == 1000
        broadcast_started.set()

    manager = Mock(active_connections=[object()], active_binary_connections=[])
    manager.broadcast_json = AsyncMock(side_effect=record_broadcast)
    monkeypatch.setattr(main, "telemetry_queue", queue)
    monkeypatch.setattr(main, "telemetry_manager", manager)
    monkeypatch.setattr(main, "telemetry_pipeline_metrics", TelemetryPipelineMetrics())
    monkeypatch.setattr(main, "race_recorder", Mock())
    monkeypatch.setattr(main, "drag_recorder", Mock())
    monkeypatch.setattr(main, "discord_presence", Mock())

    task = asyncio.create_task(main.broadcast_telemetry())
    await broadcast_started.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task

    assert queue.qsize() == 1
    assert queue.get_nowait()["TimestampMS"] == 1600
    metrics = main.telemetry_pipeline_metrics.snapshot(
        queue_depth=queue.qsize(), json_clients=1, binary_clients=0
    )
    assert metrics["framesDropped"] == 5
