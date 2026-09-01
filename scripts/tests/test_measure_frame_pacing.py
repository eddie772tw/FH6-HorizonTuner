"""Unit tests for measure_frame_pacing.py diagnostic tool."""

from scripts.measure_frame_pacing import calculate_pacing_metrics


def test_calculate_pacing_metrics_empty():
    res = calculate_pacing_metrics([])
    assert res["samplesCount"] == 0
    assert res["avgIntervalMs"] == 0.0
    assert res["estimatedFps"] == 0.0
    assert res["frameDropRatio"] == 0.0


def test_calculate_pacing_metrics_perfect_60fps():
    intervals = [16.667] * 100
    res = calculate_pacing_metrics(intervals, target_fps=60.0)
    assert res["samplesCount"] == 100
    assert abs(res["avgIntervalMs"] - 16.667) < 0.01
    assert abs(res["jitterStdDevMs"] - 0.0) < 0.01
    assert abs(res["estimatedFps"] - 60.0) < 0.1
    assert res["frameDropRatio"] == 0.0


def test_calculate_pacing_metrics_with_jitter_and_drops():
    # 90 smooth frames (16.67ms) + 10 dropped frames with long intervals (40ms)
    intervals = [16.667] * 90 + [40.0] * 10
    res = calculate_pacing_metrics(intervals, target_fps=60.0)
    assert res["samplesCount"] == 100
    assert res["minIntervalMs"] == 16.667
    assert res["maxIntervalMs"] == 40.0
    assert res["p95IntervalMs"] == 40.0
    assert res["jitterStdDevMs"] > 0.0
    # 10 out of 100 frames are > 16.667 * 1.8 = 30.0ms
    assert res["frameDropRatio"] == 0.1
