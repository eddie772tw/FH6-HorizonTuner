import json
from pathlib import Path

import pytest
from road_analysis import (
    descriptive_debrief,
    observation_weights,
    summarize_laps,
    summarize_road_observations,
)


def test_shared_frontend_backend_observation_contract():
    fixture = json.loads(
        (Path(__file__).parent / "fixtures/road_observation_contract.json").read_text()
    )
    actual = descriptive_debrief(fixture["points"])

    def compare(a, b):
        if isinstance(b, dict):
            assert set(a) == set(b)
            for key in b:
                compare(a[key], b[key])
        elif isinstance(b, (int, float)):
            assert a == pytest.approx(b)
        else:
            assert a == b

    compare(actual, fixture["expected"])


def point(ms, **updates):
    return {
        "TimestampMS": ms,
        "IsRaceOn": 1,
        "SpeedMetersPerSecond": 20,
        "TireTemp": [180, None, 190, 200],
        "NormalizedSuspensionTravel": [0.96, 0.3, 0.2, 0.3],
        "TireSlipRatio": [1.2, -1.2, 0, 0],
        **updates,
    }


def test_time_weighted_missing_channels_and_continuous_events():
    data = [point(ms) for ms in (0, 100, 200, 300, 400)]
    report = summarize_road_observations(data)
    assert report["quality"]["observedSeconds"] == pytest.approx(0.4)
    assert report["wheels"]["FL"]["nearCompression"]["count"] == 1
    assert report["wheels"]["FL"]["nearCompression"]["seconds"] == pytest.approx(0.4)
    assert report["wheels"]["FR"]["temperatureC"]["mean"] is None
    assert report["wheels"]["FR"]["temperatureC"]["observedSeconds"] == 0
    assert report["wheels"]["FL"]["normalizedAngle"]["mean"] is None


def test_resampling_does_not_change_exposure_and_missing_time_cannot_claim_events():
    a = summarize_road_observations([point(ms) for ms in range(0, 1001, 100)])
    b = summarize_road_observations([point(ms) for ms in range(0, 1001, 50)])
    assert a["wheels"]["FL"]["temperatureC"]["mean"] == pytest.approx(
        b["wheels"]["FL"]["temperatureC"]["mean"]
    )
    assert a["wheels"]["FL"]["nearCompression"] == b["wheels"]["FL"]["nearCompression"]
    unknown = summarize_road_observations([{"TireTemp": [180] * 4}])
    assert unknown["wheels"]["FL"]["temperatureC"]["mean"] is None
    assert unknown["wheels"]["FL"]["nearCompression"]["count"] is None


def test_gaps_duplicates_and_regressions_never_add_exposure():
    frames = [point(ms) for ms in (0, 100, 100, 50, 5000, 5100)]
    weights, quality = observation_weights(frames)
    assert sum(weights) == pytest.approx(0.2)
    assert quality["gapSeconds"] == pytest.approx(4.95)
    assert quality["duplicateTimestamps"] == 1
    assert quality["timestampRegressions"] == 1
    assert (
        summarize_road_observations(frames)["wheels"]["FL"]["nearCompression"]["count"]
        == 2
    )


def test_lap_number_is_not_current_lap_and_delayed_lastlap_is_attributed():
    frames = [
        point(0, LapNumber=0, CurrentLap=0, LastLap=0),
        point(59000, LapNumber=0, CurrentLap=59, LastLap=0),
        point(60000, LapNumber=1, CurrentLap=0, LastLap=0),
        point(60100, LapNumber=1, CurrentLap=0.1, LastLap=60),
        point(120000, LapNumber=2, CurrentLap=0, LastLap=60),
        point(120100, LapNumber=2, CurrentLap=0.1, LastLap=60.1, IsRaceOn=0),
    ]
    laps = summarize_laps(frames)
    assert laps[0]["lapTimeSeconds"] == 60
    assert laps[0]["complete"]
    assert laps[1]["lapTimeSeconds"] == 60.1
    assert laps[1]["complete"]
    assert not laps[2]["complete"]


def test_missing_start_final_lap_and_unchanged_lastlap_remain_unverified():
    frames = [
        point(10000, LapNumber=0, CurrentLap=10, LastLap=59),
        point(60000, LapNumber=1, CurrentLap=0, LastLap=60),
        point(120000, LapNumber=2, CurrentLap=0, LastLap=60),
    ]
    laps = summarize_laps(frames)
    assert laps[0]["lapTimeSeconds"] == 60
    assert not laps[0]["complete"]
    assert laps[1]["lapTimeSeconds"] is None
    assert laps[2]["lapTimeSeconds"] is None


def test_starting_thermal_state_does_not_average_away_later_warming():
    frames = [point(0, TireTemp=[185, None, 185, 185])]
    frames += [point(ms, TireTemp=[221] * 4) for ms in range(100, 2100, 100)]
    report = summarize_road_observations(frames)
    assert report["wheels"]["FL"]["startTemperatureC"] == 85
    assert report["wheels"]["FL"]["temperatureChangeC"] == pytest.approx(20)
    assert report["wheels"]["FR"]["startTemperatureC"] is None
