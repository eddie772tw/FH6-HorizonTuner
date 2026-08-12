import asyncio

import main
from overlay_metrics import OverlayPerformanceMetrics


def test_overlay_metrics_expose_bounded_v1_contract():
    metrics = OverlayPerformanceMetrics(sample_window=2)
    metrics.increment("audioSamples", 3)
    metrics.increment("audioDuplicates", -1)
    metrics.record_duration("broadcast", 0.001)
    metrics.record_duration("broadcast", 0.003)
    metrics.record_duration("broadcast", 0.005)

    snapshot = metrics.snapshot(active_clients=2, render_mode="legacy")

    assert snapshot["contractVersion"] == "overlay-performance-metrics/v1"
    assert snapshot["renderMode"] == "legacy"
    assert snapshot["activeClients"] == 2
    assert snapshot["counters"] == {"audioSamples": 3}
    assert snapshot["durationsMs"]["broadcast"] == {
        "count": 2,
        "last": 5.0,
        "avg": 4.0,
        "max": 5.0,
        "p95": 5.0,
    }


def test_overlay_diagnostics_endpoint_reports_renderer_mode(monkeypatch):
    metrics = OverlayPerformanceMetrics()
    metrics.increment("audioPolls", 4)
    monkeypatch.setattr(main, "overlay_performance_metrics", metrics)
    monkeypatch.setattr(main, "VFD_RENDER_MODE", "optimized")

    snapshot = asyncio.run(main.get_overlay_performance_metrics())

    assert snapshot["contractVersion"] == "overlay-performance-metrics/v1"
    assert snapshot["renderMode"] == "optimized"
    assert snapshot["counters"] == {"audioPolls": 4}
