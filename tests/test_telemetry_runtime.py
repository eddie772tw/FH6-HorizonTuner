import asyncio
import threading

from telemetry_runtime import (
    AsyncCarParamsCache,
    AsyncCarParamsWriter,
    TelemetryPipelineMetrics,
)


def test_pipeline_metrics_expose_a_bounded_v1_contract():
    metrics = TelemetryPipelineMetrics(sample_window=3)
    metrics.record_stage("dyno", 0.002)
    metrics.record_stage("dyno", 0.004)
    metrics.record_frame(0.006)
    metrics.record_dropped_frames(2)
    metrics.observe_queue_depth(7)
    metrics.record_datagram(324)
    metrics.record_packet_parsed()
    metrics.record_packet_rejected("too_short")

    snapshot = metrics.snapshot(queue_depth=1, json_clients=2, binary_clients=1)

    assert snapshot["contractVersion"] == "telemetry-pipeline-metrics/v1"
    assert snapshot["framesProcessed"] == 1
    assert snapshot["framesDropped"] == 2
    assert snapshot["dropReasons"] == {"consumer_lag": 2}
    assert snapshot["input"]["datagramsReceived"] == 1
    assert snapshot["input"]["packetsParsed"] == 1
    assert snapshot["input"]["packetsRejected"] == {"too_short": 1}
    assert snapshot["input"]["lastPacketLength"] == 324
    assert snapshot["input"]["schemasAccepted"] == {}
    assert snapshot["input"]["lastPacketSchema"] is None
    assert snapshot["input"]["timestampDiagnostics"] == {
        "duplicates": 0,
        "outOfOrder": 0,
        "wraps": 0,
        "estimatedDrops": 0,
    }
    assert snapshot["input"]["lastDatagramAt"] is not None
    assert snapshot["queue"] == {"current": 1, "peak": 7}
    assert snapshot["clients"] == {"json": 2, "binary": 1}
    assert snapshot["stagesMs"]["dyno"] == {
        "count": 2,
        "last": 4.0,
        "avg": 3.0,
        "max": 4.0,
        "p95": 4.0,
    }


def test_packet_timestamp_diagnostics_distinguish_duplicate_order_wrap_and_gaps():
    metrics = TelemetryPipelineMetrics()
    for timestamp in (100, 100, 90, 116):
        metrics.record_packet_parsed(
            timestamp_ms=timestamp, schema="forza-data-out/fh6-324-v2"
        )

    snapshot = metrics.snapshot(queue_depth=0, json_clients=0, binary_clients=0)
    assert snapshot["input"]["schemasAccepted"] == {"forza-data-out/fh6-324-v2": 4}
    assert snapshot["input"]["timestampDiagnostics"] == {
        "duplicates": 1,
        "outOfOrder": 1,
        "wraps": 0,
        "estimatedDrops": 0,
    }

    wrap_metrics = TelemetryPipelineMetrics()
    for timestamp in (0xFFFFFFF0, 16, 80):
        wrap_metrics.record_packet_parsed(timestamp_ms=timestamp)
    wrap_snapshot = wrap_metrics.snapshot(
        queue_depth=0, json_clients=0, binary_clients=0
    )
    assert wrap_snapshot["input"]["timestampDiagnostics"] == {
        "duplicates": 0,
        "outOfOrder": 0,
        "wraps": 1,
        "estimatedDrops": 4,
    }


def test_profile_load_is_deferred_from_the_event_loop():
    async def scenario():
        started = threading.Event()
        release = threading.Event()
        cache: dict[str, dict] = {}

        def load_profile(car_id: str):
            started.set()
            release.wait(timeout=1)
            return {"carId": car_id, "dyno_curve": {}}

        profile_cache = AsyncCarParamsCache(load_profile)
        assert profile_cache.resolve(cache, "42").state == "loading"
        assert await asyncio.to_thread(started.wait, 0.5)
        assert profile_cache.resolve(cache, "42").state == "loading"

        release.set()
        resolved = profile_cache.resolve(cache, "42")
        for _ in range(50):
            if resolved.state == "ready":
                break
            await asyncio.sleep(0.01)
            resolved = profile_cache.resolve(cache, "42")
        assert resolved.state == "ready"
        assert resolved.profile == {"carId": "42", "dyno_curve": {}}
        assert cache["42"] == resolved.profile

    asyncio.run(scenario())


def test_profile_writes_are_coalesced_to_the_latest_pending_snapshot():
    async def scenario():
        started = threading.Event()
        release = threading.Event()
        saved_profiles: list[dict] = []

        def save_profile(_car_id: str, profile: dict):
            saved_profiles.append(profile)
            if len(saved_profiles) == 1:
                started.set()
                release.wait(timeout=1)

        writer = AsyncCarParamsWriter(save_profile)
        writer.schedule("42", {"dyno_curve": {"1000": {"hp": 100}}})
        assert await asyncio.to_thread(started.wait, 0.5)

        writer.schedule("42", {"dyno_curve": {"1000": {"hp": 110}}})
        release.set()
        await writer.flush()

        assert saved_profiles == [
            {"dyno_curve": {"1000": {"hp": 100}}},
            {"dyno_curve": {"1000": {"hp": 110}}},
        ]

    asyncio.run(scenario())
