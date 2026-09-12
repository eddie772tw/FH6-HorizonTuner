import pytest
from race_recorder import AsyncRacePersistence, RaceRecorder
from telemetry_sqlite import TelemetrySQLite


def active_frame(timestamp):
    return {
        "TimestampMS": timestamp,
        "IsRaceOn": 1,
        "CarOrdinal": 42,
        "CarPerformanceIndex": 700,
        "DrivetrainType": 1,
        "CurrentRaceTime": timestamp / 1000,
        "CurrentLap": 0.1,
        "LapNumber": 0,
        "LastLap": 0,
        "SpeedMetersPerSecond": 20,
    }


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
    recorder.record({**active_frame(500), "LapNumber": 1, "CurrentRaceTime": 0.1})
    await persistence.flush()
    sessions = store.list_all_sessions()
    assert len(sessions) == 1
    session_id = sessions[0]["session_id"]
    assert len(store.get_telemetry_points(session_id)) == 2
    assert store.get_session_metadata(session_id)["endReason"] == "sample-limit"
    await persistence.shutdown()


@pytest.mark.asyncio
@pytest.mark.parametrize("clock_resets", [False, True])
async def test_seven_laps_remain_one_race_even_when_clock_updates_before_lap(
    tmp_path, clock_resets
):
    store = TelemetrySQLite(str(tmp_path / "races.db"))
    persistence = AsyncRacePersistence(store)
    persistence.start()
    recorder = RaceRecorder(persistence, {}, {})
    recorder.downsample_interval = 0
    timestamp = 100
    for lap in range(7):
        for current in (0.1, 30, 59.9):
            timestamp += 100
            recorder.record(
                {
                    **active_frame(timestamp),
                    "LapNumber": lap,
                    "CurrentRaceTime": current if clock_resets else lap * 60 + current,
                    "CurrentLap": current,
                    "LastLap": 59 + lap if lap else 0,
                }
            )
        if clock_resets:
            timestamp += 100
            recorder.record(
                {
                    **active_frame(timestamp),
                    "LapNumber": lap,
                    "CurrentRaceTime": 0,
                    "CurrentLap": 0,
                    "LastLap": 59 + lap if lap else 0,
                }
            )
    timestamp += 100
    recorder.record(
        {
            **active_frame(timestamp),
            "LapNumber": 7,
            "CurrentLap": 0.1,
            "CurrentRaceTime": 0.1 if clock_resets else 420.1,
            "LastLap": 66,
        }
    )
    recorder.save_latest_and_clear()
    await persistence.flush()
    sessions = store.list_all_sessions()
    assert len(sessions) == 1
    session_id = sessions[0]["session_id"]
    assert {p["LapNumber"] for p in store.get_telemetry_points(session_id)} == set(
        range(8)
    )
    laps = store.get_session_laps(session_id)
    assert len(laps) == 8  # Seven complete laps and the partial tail are all retained.
    assert sum(lap["complete"] for lap in laps) == 7
    assert store.get_session_metadata(session_id)["raceClockRegressions"] == (
        7 if clock_resets else 0
    )
    await persistence.shutdown()


@pytest.mark.asyncio
async def test_lap_and_race_clock_restart_starts_another_session(tmp_path):
    store = TelemetrySQLite(str(tmp_path / "races.db"))
    persistence = AsyncRacePersistence(store)
    persistence.start()
    recorder = RaceRecorder(persistence, {}, {})
    recorder.record({**active_frame(100), "LapNumber": 3, "CurrentRaceTime": 180})
    old_id = recorder.current_session_id
    recorder.record(active_frame(200))
    assert recorder.current_session_id != old_id
    recorder.save_latest_and_clear()
    await persistence.flush()
    assert len(store.list_all_sessions()) == 2
    assert store.get_session_metadata(old_id)["endReason"] == "race-restarted"
    await persistence.shutdown()
