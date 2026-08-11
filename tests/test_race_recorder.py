import asyncio

import pytest
from race_recorder import AsyncRacePersistence, RaceRecorder
from telemetry_sqlite import TelemetrySQLite


class RecordingStore:
    def __init__(self):
        self.calls = []

    def create_session(self, **kwargs):
        self.calls.append(("create", kwargs["session_id"]))

    def insert_points_batch(self, session_id, points):
        self.calls.append(("points", session_id, len(points)))

    def finalize_session(self, session_id):
        self.calls.append(("finalize", session_id))
        return {"session_id": session_id}


def active_frame(timestamp_ms: int) -> dict:
    return {
        "IsRaceOn": 1,
        "CurrentRaceTime": timestamp_ms / 1000,
        "CurrentLap": 1,
        "TimestampMS": timestamp_ms,
        "CarOrdinal": 42,
        "SpeedMetersPerSecond": 20.0,
    }


@pytest.mark.asyncio
async def test_persistence_serializes_session_points_and_finalization():
    store = RecordingStore()
    persistence = AsyncRacePersistence(store)
    persistence.start()
    persistence.enqueue_session_start(
        session_id="session-1",
        car_ordinal=42,
        car_name="Test Car",
        car_class=1,
        car_pi=900,
        start_time=1.0,
    )
    persistence.enqueue_points("session-1", [{"time": 0.0}])
    persistence.enqueue_finalize("session-1")

    await persistence.flush()

    assert store.calls == [
        ("create", "session-1"),
        ("points", "session-1", 1),
        ("finalize", "session-1"),
    ]
    assert persistence.snapshot()["completedBatches"] == 1
    await persistence.shutdown()


@pytest.mark.asyncio
async def test_persistence_drops_samples_but_never_drops_a_finalizer():
    store = RecordingStore()
    persistence = AsyncRacePersistence(store, max_pending_work=1)
    assert persistence.enqueue_points("session-1", [{"time": 0.0}])
    assert not persistence.enqueue_points("session-1", [{"time": 0.1}, {"time": 0.2}])
    persistence.enqueue_finalize("session-1")

    persistence.start()
    await persistence.flush()

    snapshot = persistence.snapshot()
    assert snapshot["droppedBatches"] == 1
    assert snapshot["droppedSamples"] == 2
    assert store.calls == [
        ("points", "session-1", 1),
        ("finalize", "session-1"),
    ]
    await persistence.shutdown()


@pytest.mark.asyncio
async def test_recorder_queues_sqlite_work_without_calling_store_inline():
    store = RecordingStore()
    persistence = AsyncRacePersistence(store)
    persistence.start()
    recorder = RaceRecorder(
        persistence,
        {"race_recording": True},
        {"42": {"year": 2026, "make": "Test", "model": "Car"}},
    )
    recorder.downsample_interval = 0

    for sample in range(1, 51):
        recorder.record(active_frame(sample * 100))

    # The worker has not yielded yet, so any store activity here would be a
    # synchronous call from RaceRecorder.record().
    assert store.calls == []
    assert recorder.in_memory_batch == []

    session_id = recorder.current_session_id
    recorder.record({"IsRaceOn": 0})
    await persistence.flush()

    assert store.calls[0] == ("create", session_id)
    assert store.calls[1][0] == "points"
    assert store.calls[1][2] == 50
    assert store.calls[2][0] == "finalize"
    await persistence.shutdown()


def test_sqlite_finalization_persists_lap_summary(tmp_path):
    store = TelemetrySQLite(str(tmp_path / "sessions.db"))
    store.create_session(session_id="session-1", start_time=1.0)
    store.insert_points_batch(
        "session-1",
        [
            {"LapNumber": 1, "time": 0.0, "SpeedMetersPerSecond": 20.0},
            {"LapNumber": 1, "time": 2.5, "SpeedMetersPerSecond": 30.0},
        ],
    )

    summary = store.finalize_session("session-1")
    sessions = store.list_all_sessions()
    laps = store.get_session_laps("session-1")

    assert summary["total_laps"] == 1
    assert summary["best_lap_time"] == 2.5
    assert sessions[0]["total_laps"] == 1
    assert laps[0]["max_speed_kmh"] == 108.0
