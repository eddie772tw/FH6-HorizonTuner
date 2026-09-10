"""Race-level exposure and lap-window contracts for the offline audit."""

import importlib.util
from pathlib import Path

import pytest

SPEC = importlib.util.spec_from_file_location(
    "chassis_race", Path(__file__).parents[1] / "analyze_chassis_race.py"
)
audit = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(audit)


def frame(t, lap, **fields):
    return {
        "frame": {
            "CurrentRaceTime": t,
            "LapNumber": lap,
            "IsRaceOn": 1,
            "CarOrdinal": 42,
            "CarPerformanceIndex": 700,
            "LastLap": 1,
            "TireTemp": [100, 110, 90, 95],
            **fields,
        }
    }


def test_all_laps_retained_with_prespecified_and_sensitivity_windows():
    records = [frame((i + 1) / 20, i // 20) for i in range(140)]
    result = audit.analyze(records, 7.025, 42, 700)
    assert result["experimentalUnits"] == 1
    assert [lap["lap"] for lap in result["laps"]] == list(range(1, 8))
    assert result["windows"]["predeclared_laps_3_to_6"]["frames"] == 80
    assert result["windows"]["sensitivity_laps_2_to_7"]["frames"] == 120
    assert result["laps"][-1]["gameCompletedLapSeconds"] is None
    assert result["laps"][-1]["finishRemainderSeconds"] == pytest.approx(0.975)
    assert result["wholeRace"]["observedSeconds"] == pytest.approx(6.975)


def test_gaps_not_credited_as_observed_exposure_and_no_following_race_merge():
    records = [frame(1, 0), frame(1.05, 0), frame(2, 1), frame(0.1, 0)]
    result = audit.analyze(records, 2.05, 42, 700)
    assert "following_race_reset_stop" in result["issues"]
    assert "capture_gap_above_100ms" in result["issues"]
    assert result["wholeRace"]["frames"] == 3
    assert result["wholeRace"]["observedSeconds"] == pytest.approx(0.1)


def test_time_weighted_quantiles_and_missing_wheel_coverage():
    assert audit.describe([10, 100], [0.09, 0.01])["p50"] == 10
    result = audit.summary(
        [{"NormalizedSuspensionTravel": [0, 0.5, 0.5, 1]}, {}], [0.05, 0.05]
    )
    assert result["wheels"]["FL"]["normalizedTravel"]["observedSeconds"] == 0.05
    assert result["wheels"]["FL"]["nearExtensionFraction"] == 1
    assert result["wheels"]["RR"]["nearCompressionFraction"] == 1
    assert result["wheels"]["FL"]["temperatureRawF"]["p50"] is None


def test_lap_clock_restart_preserves_frames_and_distinguishes_normal_crossing():
    records = [
        frame(2.65, 0, CurrentLap=2.65),
        frame(2.67, 0, CurrentLap=0.02),
        frame(2.69, 1, CurrentLap=0.0),
    ]
    result = audit.analyze(records, 2.71, 42, 700, expected_laps=2)
    assert result["wholeRace"]["frames"] == 3
    assert "lap_clock_reset_without_lap_increment" in result["issues"]
    assert len(result["lapClockResets"]) == 1
    assert result["lapClockResets"][0]["raceTimeAfter"] == 2.67


def test_delayed_finish_metadata_does_not_add_driving_exposure_or_merge_restart():
    records = [
        frame(0.05, 0),
        frame(0.1, 0),
        frame(40, 1, LastLap=0.12, BestLap=0.12),
        frame(0.2, 0),
        frame(50, 1, LastLap=99),
    ]
    result = audit.analyze(records, 0.15, 42, 700, expected_laps=1)
    assert result["wholeRace"]["frames"] == 2
    assert result["wholeRace"]["observedSeconds"] == pytest.approx(0.1)
    assert result["postFinishReports"] == [
        {"CurrentRaceTime": 40, "LastLap": 0.12, "BestLap": 0.12}
    ]
    assert "following_race_reset_stop" in result["issues"]


def test_inputs_do_not_imply_steady_state_and_braking_has_precedence():
    assert (
        audit.phase({"AccelInput": 255, "BrakeInput": 1, "AccelerationX": 8})
        == "braking"
    )
    assert (
        audit.phase({"AccelInput": 255, "BrakeInput": 0, "AccelerationX": -8})
        == "turning_power"
    )
    assert audit.phase({"AccelInput": 255}) == "unknown"
