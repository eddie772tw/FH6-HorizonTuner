import os
import time

import pytest

import backend.core.config as config
from backend.services.recorders import drag_recorder, race_recorder
from backend.services.telemetry_sqlite import TelemetrySQLite


@pytest.fixture(autouse=True)
def setup_teardown():
    race_recorder.clear()
    drag_recorder.clear()
    yield
    race_recorder.clear()
    drag_recorder.clear()


def test_race_recorder_basic():
    # disabled
    race_recorder.record({"IsRaceOn": 1}, race_recording_enabled=False)
    assert not race_recorder.is_recording

    # enabled but race off
    race_recorder.record(
        {"IsRaceOn": 0, "CurrentRaceTime": 0.0}, race_recording_enabled=True
    )
    assert not race_recorder.is_recording

    # enabled and race on
    race_recorder.record(
        {"IsRaceOn": 1, "CurrentRaceTime": 1.0, "CurrentLap": 1, "TimestampMS": 1000},
        race_recording_enabled=True,
    )
    assert race_recorder.is_recording
    assert race_recorder.total_count == 1

    # Add enough to trigger flush
    for i in range(55):
        # advance time to bypass downsample interval
        time.sleep(0.001)
        # Hack the last sample time to simulate time passed
        race_recorder.last_sample_time -= 0.2
        race_recorder.record(
            {
                "IsRaceOn": 1,
                "CurrentRaceTime": 1.0,
                "CurrentLap": 1,
                "TimestampMS": 1000 + i * 100,
            },
            race_recording_enabled=True,
        )

    assert len(race_recorder.in_memory_batch) < 50  # It should have flushed

    # Stop race
    race_recorder.record(
        {"IsRaceOn": 0, "CurrentRaceTime": 0.0}, race_recording_enabled=True
    )
    assert not race_recorder.is_recording


def test_drag_recorder_basic():
    drag_recorder.prepare()
    assert drag_recorder.status == "waiting"

    # Should start recording if speed < 0.5, gear >= 1, accel >= 220
    drag_recorder.record(
        {
            "SpeedMetersPerSecond": 0.1,
            "Gear": 1,
            "AccelInput": 255,
            "TimestampMS": 1000,
            "IsRaceOn": 1,
        }
    )
    assert drag_recorder.status == "recording"

    # Continue recording
    drag_recorder.record(
        {
            "SpeedMetersPerSecond": 10.0,
            "Gear": 1,
            "AccelInput": 255,
            "TimestampMS": 2000,
            "IsRaceOn": 1,
        }
    )
    assert len(drag_recorder.current_session) == 2

    # Stop recording by lifting throttle for a long time
    drag_recorder.record(
        {
            "SpeedMetersPerSecond": 20.0,
            "Gear": 2,
            "AccelInput": 0,
            "TimestampMS": 3000,
            "IsRaceOn": 1,
        }
    )
    drag_recorder.record(
        {
            "SpeedMetersPerSecond": 20.0,
            "Gear": 2,
            "AccelInput": 0,
            "TimestampMS": 4000,
            "IsRaceOn": 1,
        }
    )

    assert drag_recorder.status == "finished"
    assert "error" not in drag_recorder.analysis_result
