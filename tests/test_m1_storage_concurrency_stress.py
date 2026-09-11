"""Milestone M1 Empirical Stress Harness: Storage Concurrency & 60Hz Loop Safety."""

import asyncio
import sqlite3
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from unittest.mock import patch

import pytest
from offroad_models import (
    CreateOffroadWorkflow,
    OffroadIdentity,
    OffroadSetting,
    StartOffroadRun,
)
from offroad_service import OffroadService
from race_recorder import AsyncRacePersistence
from telemetry_sqlite import TelemetrySQLite
from workflow_store import WorkflowStore


def synthetic_offroad_frame(
    timestamp_ms: int, elapsed: float = 0.1, **overrides
) -> dict:
    """Generate a realistic synthetic 60Hz telemetry frame."""
    frame = {
        "TimestampMS": timestamp_ms,
        "IsRaceOn": 1,
        "CurrentRaceTime": elapsed,
        "CurrentLap": elapsed,
        "LapNumber": 0,
        "CarOrdinal": 77,
        "CarPerformanceIndex": 800,
        "DrivetrainType": 1,  # AWD
        "SpeedMetersPerSecond": 25.0,
        "PositionX": elapsed * 25.0,
        "PositionY": 100.0,
        "PositionZ": 0.0,
        "AccelerationX": 0.5,
        "AccelerationY": -9.80665,
        "AccelerationZ": 2.0,
        "Pitch": 0.02,
        "Roll": 0.01,
        "Yaw": 0.0,
        "TireTemp": [180.0, 180.0, 180.0, 180.0],
        "NormalizedSuspensionTravel": [0.45, 0.45, 0.45, 0.45],
        "SuspensionTravelMeters": [0.12, 0.12, 0.12, 0.12],
        "SurfaceRumble": [0.2, 0.2, 0.2, 0.2],
        "DistanceTraveled": elapsed * 25.0,
        "AccelInput": 220,
        "BrakeInput": 0,
        "SteerInput": 0,
    }
    frame.update(overrides)
    return frame


ENVELOPE_KEYS = {
    "id",
    "discipline",
    "workflowId",
    "kind",
    "schema",
    "createdAt",
    "identitySource",
}


# ==============================================================================
# 1. Storage Concurrency & SQLite Stress Tests
# ==============================================================================


def test_workflow_store_high_concurrency_multi_discipline(tmp_path):
    """Stress test concurrent insertions and reads across multiple disciplines and workflows."""
    db_path = str(tmp_path / "concurrent_store.sqlite")
    store = WorkflowStore(db_path, default_discipline="offroad")

    disciplines = ["offroad", "road", "drag", "drift"]
    num_writers = 20
    writes_per_thread = 50
    total_expected_docs = num_writers * writes_per_thread

    stop_reading = False
    read_results = []
    read_errors = []

    def reader_task(reader_id: int):
        reads = 0
        while not stop_reading:
            try:
                disc = disciplines[reader_id % len(disciplines)]
                docs = store.list(discipline=disc)
                assert isinstance(docs, list)
                reads += 1
                time.sleep(0.001)
            except Exception as e:
                read_errors.append((reader_id, str(e)))
        read_results.append((reader_id, reads))

    def writer_task(thread_id: int):
        disc = disciplines[thread_id % len(disciplines)]
        inserted = []
        for i in range(writes_per_thread):
            workflow_id = f"wf-{thread_id % 5}"
            kind = "setup" if i % 2 == 0 else "run"
            payload = {
                "thread_id": thread_id,
                "iteration": i,
                "data_payload": f"payload-{thread_id}-{i}",
                "metrics": {"value": i * 1.5, "flag": (i % 2 == 0)},
            }
            doc = store.append(
                kind=kind,
                workflow_id=workflow_id,
                payload=payload,
                discipline=disc,
            )
            inserted.append(doc["id"])
        return inserted

    with ThreadPoolExecutor(max_workers=num_writers + 5) as executor:
        # Launch 5 reader threads to contend with writers
        reader_futures = [executor.submit(reader_task, r) for r in range(5)]

        # Launch 20 writer threads
        writer_futures = [executor.submit(writer_task, t) for t in range(num_writers)]

        all_doc_ids = []
        for f in as_completed(writer_futures):
            all_doc_ids.extend(f.result())

        # Stop readers
        stop_reading = True
        for f in as_completed(reader_futures):
            f.result()

    assert not read_errors, f"Encountered read errors during concurrency: {read_errors}"
    assert len(all_doc_ids) == total_expected_docs
    assert len(set(all_doc_ids)) == total_expected_docs

    # Integrity verification on SQLite
    with store.connect() as conn:
        integrity = conn.execute("PRAGMA integrity_check").fetchall()
        assert integrity[0][0] == "ok", f"SQLite integrity check failed: {integrity}"

        count_row = conn.execute("SELECT COUNT(*) FROM workflow_documents").fetchone()
        assert count_row[0] == total_expected_docs

    # Verify all documents are retrievable across disciplines
    for disc in disciplines:
        docs = store.list(discipline=disc)
        expected_per_disc = total_expected_docs // len(disciplines)
        assert len(docs) == expected_per_disc
        for d in docs:
            assert d["discipline"] == disc
            assert d["schema"] == f"{disc}-workflow/v1"


def test_workflow_store_discipline_and_kind_filtering(tmp_path):
    """Verify strict discipline and kind isolation under same workflow ID."""
    db_path = str(tmp_path / "filter_test.sqlite")
    store = WorkflowStore(db_path, default_discipline="offroad")

    common_wf = "wf-shared-100"
    doc_offroad = store.append(
        "setup", common_wf, {"name": "Offroad A"}, discipline="offroad"
    )
    doc_road = store.append("setup", common_wf, {"name": "Road A"}, discipline="road")
    doc_drag = store.append("setup", common_wf, {"name": "Drag A"}, discipline="drag")
    doc_drift = store.append(
        "setup", common_wf, {"name": "Drift A"}, discipline="drift"
    )

    # Filter by discipline
    offroad_list = store.list(workflow_id=common_wf, discipline="offroad")
    assert len(offroad_list) == 1
    assert offroad_list[0]["id"] == doc_offroad["id"]

    road_list = store.list(workflow_id=common_wf, discipline="road")
    assert len(road_list) == 1
    assert road_list[0]["id"] == doc_road["id"]

    drag_list = store.list(workflow_id=common_wf, discipline="drag")
    assert len(drag_list) == 1
    assert drag_list[0]["id"] == doc_drag["id"]

    drift_list = store.list(workflow_id=common_wf, discipline="drift")
    assert len(drift_list) == 1
    assert drift_list[0]["id"] == doc_drift["id"]

    wildcard_list = store.list(workflow_id=common_wf, discipline="*")
    assert len(wildcard_list) == 4

    # Direct get with discipline checking
    assert store.get(doc_offroad["id"], discipline="offroad")["name"] == "Offroad A"
    with pytest.raises(
        ValueError, match="different workflow, item type, or discipline"
    ):
        store.get(doc_offroad["id"], discipline="road")

    # Direct get with kind checking
    with pytest.raises(
        ValueError, match="different workflow, item type, or discipline"
    ):
        store.get(doc_offroad["id"], kind="run")


def test_workflow_store_roundtrip_fidelity_and_types(tmp_path):
    """Verify precision, unicode, special types, and roundtrip fidelity."""
    db_path = str(tmp_path / "types_test.sqlite")
    store = WorkflowStore(db_path, default_discipline="offroad")

    complex_payload = {
        "string_ascii": "normal string",
        "string_unicode": "越野賽事 / 懸吊調校 / 測試 (Rally & Trail)",
        "string_special": "Quotes \"and\" 'escapes' \n \t \r \\",
        "int_zero": 0,
        "float_zero": 0.0,
        "bool_true": True,
        "bool_false": False,
        "none_value": None,
        "float_precision": 1.23456789012345,
        "float_small": 1e-12,
        "nested_dict": {
            "level1": {
                "level2": [1, 2.0, "3", True, None],
            }
        },
        "empty_list": [],
        "empty_dict": {},
    }

    doc = store.append("complex", "wf-fidelity", complex_payload)
    retrieved = store.get(doc["id"], "complex")

    for k, v in complex_payload.items():
        assert retrieved[k] == v, (
            f"Field mismatch for key {k}: expected {v}, got {retrieved[k]}"
        )
        assert type(retrieved[k]) is type(v), (
            f"Type mismatch for {k}: {type(v)} vs {type(retrieved[k])}"
        )

    # Verify NaN and Inf rejection (allow_nan=False)
    with pytest.raises(ValueError):
        store.append("invalid_nan", "wf-fidelity", {"bad_val": float("nan")})

    with pytest.raises(ValueError):
        store.append("invalid_inf", "wf-fidelity", {"bad_val": float("inf")})


def test_workflow_store_pydantic_schema_revalidation(tmp_path):
    """Verify stored documents re-validate seamlessly into Pydantic models when unmarshaled."""
    db_path = str(tmp_path / "pydantic_store.sqlite")
    store = WorkflowStore(db_path, default_discipline="offroad")

    create_wf = CreateOffroadWorkflow(
        identity=OffroadIdentity(ordinal=101, performanceIndex=850, drivetrain=1),
        carName="2026 Hoonigan Ford RS200",
        configuration="AWD Rally S1",
        event={"name": "Copper Canyon Trail", "format": "sprint"},
    )
    doc_wf = store.append("workflow", "wf-pydantic", create_wf.model_dump())
    retrieved_wf = store.get(doc_wf["id"], "workflow")

    # Filter envelope keys to re-validate against CreateOffroadWorkflow input model
    raw_input_payload = {
        k: v for k, v in retrieved_wf.items() if k not in ENVELOPE_KEYS
    }
    validated_wf = CreateOffroadWorkflow.model_validate(raw_input_payload)
    assert validated_wf.identity.ordinal == 101
    assert validated_wf.identity.performanceIndex == 850
    assert validated_wf.carName == "2026 Hoonigan Ford RS200"
    assert validated_wf.event.format == "sprint"

    # Setting roundtrip
    setting = OffroadSetting(
        value=15.0,
        unit="cm",
        minimum=10.0,
        maximum=25.0,
        step=0.5,
        source="game-confirmed",
    )
    doc_setting = store.append("setting", "wf-pydantic", setting.model_dump())
    retrieved_setting = store.get(doc_setting["id"], "setting")
    raw_setting_payload = {
        k: v for k, v in retrieved_setting.items() if k not in ENVELOPE_KEYS
    }
    validated_setting = OffroadSetting.model_validate(raw_setting_payload)
    assert validated_setting.value == 15.0
    assert validated_setting.unit == "cm"


# ==============================================================================
# 2. 60Hz Telemetry Ingestion Loop Non-Blocking Verification
# ==============================================================================


@pytest.mark.asyncio
async def test_offroad_service_zero_synchronous_disk_io_during_observe(tmp_path):
    """Verify OffroadService.observe() executes zero synchronous disk writes or SQLite connections."""
    db_path = str(tmp_path / "no_io_test.sqlite")
    database = TelemetrySQLite(db_path)
    store = WorkflowStore(db_path, default_discipline="offroad")
    service = OffroadService(database, store)

    # Prime telemetry identity
    service.observe(synthetic_offroad_frame(100, 0))
    service.observe(synthetic_offroad_frame(200, 0))
    identity = service.live()["identity"]
    assert identity is not None

    wf = await service.create(CreateOffroadWorkflow(identity=identity))
    setup = store.list(wf["id"], "setup")[0]
    await service.start_run(wf["id"], StartOffroadRun(setupId=setup["id"]))

    assert service.recorder.is_recording is True

    # Track synchronous disk I/O
    sqlite_connect_calls = []
    original_connect = sqlite3.connect

    def patched_connect(*args, **kwargs):
        sqlite_connect_calls.append(args)
        return original_connect(*args, **kwargs)

    # Instrument and observe 1,000 frames
    with patch("sqlite3.connect", side_effect=patched_connect):
        for i in range(1, 1001):
            frame = synthetic_offroad_frame(
                200 + i * 16,
                elapsed=0.1 + i * 0.016,
                DistanceTraveled=i * 0.5,
            )
            service.observe(frame)

    # During observe(), sqlite3.connect MUST NOT have been called on the telemetry thread!
    # (Any SQLite writes happen only in background persistence thread/tasks)
    assert len(sqlite_connect_calls) == 0, (
        f"observe() synchronously invoked sqlite3.connect {len(sqlite_connect_calls)} times!"
    )

    await service.stop()
    await service.shutdown()


@pytest.mark.asyncio
async def test_offroad_service_observe_latency_under_10k_flood(tmp_path):
    """Verify per-packet observe() execution latency remains orders of magnitude below 60Hz frame budget."""
    db_path = str(tmp_path / "timing_test.sqlite")
    database = TelemetrySQLite(db_path)
    store = WorkflowStore(db_path, default_discipline="offroad")
    service = OffroadService(database, store)

    # Prime service
    service.observe(synthetic_offroad_frame(100, 0))
    service.observe(synthetic_offroad_frame(200, 0))
    identity = service.live()["identity"]

    wf = await service.create(CreateOffroadWorkflow(identity=identity))
    setup = store.list(wf["id"], "setup")[0]
    await service.start_run(wf["id"], StartOffroadRun(setupId=setup["id"]))

    num_frames = 10000
    latencies_ns = []

    for i in range(1, num_frames + 1):
        frame = synthetic_offroad_frame(
            200 + i * 16,
            elapsed=0.1 + i * 0.016,
            DistanceTraveled=i * 0.4,
        )
        t0 = time.perf_counter_ns()
        service.observe(frame)
        t1 = time.perf_counter_ns()
        latencies_ns.append(t1 - t0)

    # 60Hz frame budget is 16.67ms = 16,670,000 ns.
    # Ingestion observer budget should be < 100 microseconds (100,000 ns).
    mean_latency_us = (sum(latencies_ns) / len(latencies_ns)) / 1000.0
    p95_latency_us = sorted(latencies_ns)[int(0.95 * len(latencies_ns))] / 1000.0
    p99_latency_us = sorted(latencies_ns)[int(0.99 * len(latencies_ns))] / 1000.0
    max_latency_us = max(latencies_ns) / 1000.0

    print(
        f"\nObserve latency over {num_frames} frames: "
        f"mean={mean_latency_us:.2f}us, p95={p95_latency_us:.2f}us, "
        f"p99={p99_latency_us:.2f}us, max={max_latency_us:.2f}us"
    )

    # Assert mean latency is well under 50 microseconds
    assert mean_latency_us < 50.0, (
        f"Mean latency {mean_latency_us}us exceeds 50us threshold!"
    )
    # Assert 99th percentile is under 500 microseconds (0.5ms)
    assert p99_latency_us < 500.0, (
        f"P99 latency {p99_latency_us}us exceeds 500us threshold!"
    )

    await service.stop()
    await service.shutdown()


@pytest.mark.asyncio
async def test_offroad_service_buffer_saturation_resilience(tmp_path):
    """Verify that when persistence queue saturates, observe() drops samples gracefully without blocking."""
    db_path = str(tmp_path / "saturation_test.sqlite")
    database = TelemetrySQLite(db_path)
    store = WorkflowStore(db_path, default_discipline="offroad")

    # Create persistence with very small queue (max_pending_work = 2)
    service = OffroadService(database, store)
    service.persistence = AsyncRacePersistence(database, max_pending_work=2)
    # Re-wire recorder with this constrained persistence
    from race_recorder import RaceRecorder

    service.recorder = RaceRecorder(service.persistence, {}, {}, automatic=False)
    service.recorder.downsample_interval = 0  # Force every frame to be processed

    service.observe(synthetic_offroad_frame(100, 0))
    service.observe(synthetic_offroad_frame(200, 0))
    identity = service.live()["identity"]

    wf = await service.create(CreateOffroadWorkflow(identity=identity))
    setup = store.list(wf["id"], "setup")[0]

    # Do NOT start the persistence worker yet - this causes the queue to saturate quickly!
    await service.start_run(wf["id"], StartOffroadRun(setupId=setup["id"]))

    # Flood 1,500 frames into observe() while persistence queue is blocked
    for i in range(1, 1501):
        frame = synthetic_offroad_frame(
            200 + i * 10,
            elapsed=0.1 + i * 0.01,
            DistanceTraveled=i * 0.2,
        )
        service.observe(frame)

    snapshot = service.persistence.snapshot()
    # Ensure queue saturated and dropped batches/samples occurred gracefully
    assert snapshot["droppedBatches"] > 0, (
        "Expected dropped batches due to queue saturation"
    )
    assert snapshot["droppedSamples"] > 0, (
        "Expected dropped samples due to queue saturation"
    )

    # Now start persistence worker and verify clean drain
    service.persistence.start()
    await service.stop()
    await service.persistence.flush()

    after_snapshot = service.persistence.snapshot()
    assert after_snapshot["pendingWork"] == 0, (
        "Queue did not drain completely after unblocking"
    )
    await service.shutdown()


@pytest.mark.asyncio
async def test_offroad_service_adversarial_telemetry_resilience(tmp_path):
    """Stress test observe() with malformed, regressing, and unexpected frames."""
    db_path = str(tmp_path / "adversarial_test.sqlite")
    database = TelemetrySQLite(db_path)
    store = WorkflowStore(db_path, default_discipline="offroad")
    service = OffroadService(database, store)

    service.observe(synthetic_offroad_frame(100, 0))
    service.observe(synthetic_offroad_frame(200, 0))
    identity = service.live()["identity"]

    wf = await service.create(CreateOffroadWorkflow(identity=identity))
    setup = store.list(wf["id"], "setup")[0]
    await service.start_run(wf["id"], StartOffroadRun(setupId=setup["id"]))

    # 1. Empty dictionary
    service.observe({})

    # 2. None / missing values
    service.observe({"TimestampMS": None, "CarOrdinal": None})

    # 3. Timestamp regression (time moves backwards)
    service.observe(synthetic_offroad_frame(50, 0.05))

    # 4. Zero / negative race time
    service.observe(synthetic_offroad_frame(300, -5.0))

    # 5. Missing wheel telemetry arrays
    service.observe(
        synthetic_offroad_frame(
            400, 1.0, NormalizedSuspensionTravel=None, TireTemp=None
        )
    )

    # 6. Infinite / NaN values in telemetry (must not crash observe)
    service.observe(
        synthetic_offroad_frame(500, 1.5, SpeedMetersPerSecond=float("nan"))
    )
    service.observe(synthetic_offroad_frame(600, 2.0, AccelerationY=float("inf")))

    # 7. Car ordinal mismatch mid-race (car switch)
    service.observe(synthetic_offroad_frame(700, 2.5, CarOrdinal=999))

    # All of the above should be absorbed gracefully without uncaught exceptions
    assert service.live()["state"] in (
        "saving",
        "idle",
        "waiting-for-race",
        "recording",
    )

    await service.shutdown()
