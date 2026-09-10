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

    def finalize_session(self, session_id, metadata=None):
        self.calls.append(("finalize", session_id))
        return {"session_id": session_id}


def active_frame(timestamp_ms: int) -> dict:
    return {
        "IsRaceOn": 1,
        "CurrentRaceTime": timestamp_ms / 1000,
        "CurrentLap": 1,
        "LapNumber": 0,
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
    assert recorder.is_recording  # Wait for bounded, potentially delayed metadata.
    recorder.tick(recorder._awaiting_since + 3.1)
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

    assert summary["total_laps"] == 0
    assert summary["best_lap_time"] == 0
    assert sessions[0]["total_laps"] == 0
    assert laps[0]["lap_time"] is None
    assert laps[0]["observed_span"] == 2.5
    assert laps[0]["complete"] == 0
    assert laps[0]["max_speed_kmh"] == 108.0


@pytest.mark.asyncio
async def test_first_lap_metadata_survives_sampling_and_silence(tmp_path):
    store = TelemetrySQLite(str(tmp_path / "races.db"))
    persistence = AsyncRacePersistence(store)
    persistence.start()
    recorder = RaceRecorder(persistence, {"race_recording": True}, {})
    first = active_frame(100)
    first["CurrentLap"] = 0.1
    recorder.record(first)
    session_id = recorder.current_session_id
    recorder.record(
        {**active_frame(60100), "LapNumber": 1, "CurrentLap": 0.1, "LastLap": 0}
    )
    recorder.record(
        {**active_frame(60120), "LapNumber": 1, "CurrentLap": 0.12, "LastLap": 60}
    )
    recorder.tick(recorder._last_progress_at + 3.1)
    await persistence.flush()
    loaded = store.get_telemetry_points(session_id)
    assert len(loaded) == 3
    assert loaded[0]["LapNumber"] == 0
    assert store.get_session_laps(session_id)[0]["lap_time"] == 60
    assert store.get_session_metadata(session_id)["endReason"] == "telemetry-stopped"
    await persistence.shutdown()


@pytest.mark.asyncio
async def test_sample_limit_flushes_and_preserves_all_accepted_samples(tmp_path):
    store = TelemetrySQLite(str(tmp_path / "races.db"))
    persistence = AsyncRacePersistence(store)
    persistence.start()
    recorder = RaceRecorder(persistence, {"race_recording": True}, {})
    recorder.max_samples = 2
    recorder.downsample_interval = 0
    for ms in (100, 200, 300, 400):
        recorder.record(active_frame(ms))
    await persistence.flush()
    sessions = store.list_all_sessions()
    assert len(sessions) == 1
    session_id = sessions[0]["session_id"]
    assert len(store.get_telemetry_points(session_id)) == 2
    assert store.get_session_metadata(session_id)["endReason"] == "sample-limit"
    await persistence.shutdown()
