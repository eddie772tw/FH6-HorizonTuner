import asyncio

import main
from telemetry_runtime import TelemetryPipelineMetrics


class RecorderPersistence:
    def snapshot(self):
        return {"pendingWork": 3, "droppedSamples": 2}


def test_telemetry_metrics_endpoint_uses_the_v1_contract(monkeypatch):
    metrics = TelemetryPipelineMetrics()
    metrics.record_frame(0.001)
    metrics.record_dropped_frames(3)
    metrics.observe_queue_depth(5)
    monkeypatch.setattr(main, "telemetry_pipeline_metrics", metrics)
    monkeypatch.setattr(main, "race_persistence", RecorderPersistence())

    snapshot = asyncio.run(main.get_telemetry_pipeline_metrics())

    assert snapshot["contractVersion"] == "telemetry-pipeline-metrics/v1"
    assert snapshot["framesProcessed"] == 1
    assert snapshot["framesDropped"] == 3
    assert snapshot["queue"]["peak"] == 5
    assert snapshot["profilePersistence"] == {
        "pendingWrites": 0,
        "failedWrites": 0,
    }
    assert snapshot["raceRecorderPersistence"] == {
        "pendingWork": 3,
        "droppedSamples": 2,
    }
