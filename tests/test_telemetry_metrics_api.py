import asyncio
from unittest.mock import MagicMock

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
    assert snapshot["dropReasons"] == {"consumer_lag": 3}
    assert snapshot["queue"]["peak"] == 5
    assert snapshot["profilePersistence"] == {
        "pendingWrites": 0,
        "failedWrites": 0,
    }
    assert snapshot["raceRecorderPersistence"] == {
        "pendingWork": 3,
        "droppedSamples": 2,
    }


def test_broadcast_consumer_discards_stale_backlog_and_keeps_latest_frame(monkeypatch):
    class BlockingTelemetryManager:
        active_connections = {"test-client"}
        active_binary_connections: set = set()

        def __init__(
            self, reached_broadcast: asyncio.Event, release_broadcast: asyncio.Event
        ):
            self._reached_broadcast = reached_broadcast
            self._release_broadcast = release_broadcast

        async def broadcast_json(self, _data: dict) -> None:
            self._reached_broadcast.set()
            await self._release_broadcast.wait()

    async def scenario():
        queue: asyncio.Queue[dict] = asyncio.Queue(maxsize=10)
        metrics = TelemetryPipelineMetrics()
        reached_broadcast = asyncio.Event()
        release_broadcast = asyncio.Event()
        for timestamp in range(1, 8):
            queue.put_nowait({"TimestampMS": timestamp, "CarOrdinal": 0})

        monkeypatch.setattr(main, "telemetry_queue", queue)
        monkeypatch.setattr(main, "telemetry_pipeline_metrics", metrics)
        monkeypatch.setattr(
            main,
            "telemetry_manager",
            BlockingTelemetryManager(reached_broadcast, release_broadcast),
        )
        monkeypatch.setattr(main, "race_recorder", MagicMock())
        monkeypatch.setattr(main, "drag_recorder", MagicMock())
        monkeypatch.setattr(main, "discord_presence", MagicMock())

        task = asyncio.create_task(main.broadcast_telemetry())
        try:
            await asyncio.wait_for(reached_broadcast.wait(), timeout=0.2)

            assert queue.qsize() == 1
            assert queue.get_nowait()["TimestampMS"] == 7
            snapshot = metrics.snapshot(queue_depth=0, json_clients=0, binary_clients=0)
            assert snapshot["dropReasons"] == {"consumer_lag": 5}
        finally:
            release_broadcast.set()
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    asyncio.run(scenario())
