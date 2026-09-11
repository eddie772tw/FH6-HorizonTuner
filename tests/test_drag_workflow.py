"""Drag workflow lifecycle tests through durable snapshots and synthetic frames."""

import pytest
from drag_analysis import summarize_drag_observations
from drag_comparison import compare_drag_runs
from drag_models import (
    CreateDragCandidate,
    CreateDragWorkflow,
    DragComparison,
    StartDragRun,
)
from drag_router import create_drag_router
from drag_service import DragService
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from telemetry_sqlite import TelemetrySQLite
from workflow_store import WorkflowStore


def drag_frame(timestamp, elapsed=0.1, speed=20.0, gear=1, rpm=5000.0, **overrides):
    return {
        "TimestampMS": timestamp,
        "IsRaceOn": 1,
        "CurrentRaceTime": elapsed,
        "CarOrdinal": 101,
        "CarPerformanceIndex": 850,
        "DrivetrainType": 1,  # AWD
        "SpeedMetersPerSecond": speed,
        "CurrentEngineRpm": rpm,
        "Gear": gear,
        "Accel": 255,
        "TireSlipRatio": [0.05, 0.05, 0.15, 0.15],
        "DistanceTraveled": elapsed * speed,
        **overrides,
    }


@pytest.fixture
def service(tmp_path):
    database = TelemetrySQLite(str(tmp_path / "drag_sessions.sqlite"))
    store = WorkflowStore(database.db_path, default_discipline="drag")
    return DragService(database, store)


async def record_drag_run(
    service, workflow_id, setup_id, offset, seconds=5, finish_time=10.5, **overrides
):
    service.observe(drag_frame(offset - 100, 0, speed=0.0, gear=1, rpm=3000))
    service.observe(drag_frame(offset, 0, speed=0.0, gear=1, rpm=3500))
    run = await service.start_run(
        workflow_id,
        StartDragRun(
            setupId=setup_id,
            settingsConfirmed=True,
            otherSettings="unchanged",
            tires="unchanged",
            driverAssists="unchanged",
        ),
    )
    for i in range(1, seconds * 10 + 1):
        elapsed = i / 10
        speed = min(80.0, elapsed * 15.0)
        gear = 1 if speed < 25 else 2 if speed < 50 else 3
        rpm = 4000 + (speed % 25) * 100
        service.observe(
            drag_frame(
                offset + i * 100,
                elapsed=elapsed,
                speed=speed,
                gear=gear,
                rpm=rpm,
                **overrides,
            )
        )
    await service.stop()
    service.store.append(
        "finish",
        workflow_id,
        {
            "runId": run["id"],
            "completed": True,
            "clean": "confirmed",
            "timeSeconds": finish_time,
            "source": "game-confirmed",
        },
    )
    return run


@pytest.mark.asyncio
async def test_drag_workflow_lifecycle(service):
    wf = await service.create(
        CreateDragWorkflow(
            identity={"ordinal": 101, "performanceIndex": 850, "drivetrain": 1},
            carName="Muscle Car",
            eventName="Drag Quarter Mile",
        )
    )
    workflow_id = wf["id"]
    setups = [d for d in service.store.list(workflow_id) if d["kind"] == "setup"]
    setup_a = setups[0]

    # Run A
    run_a = await record_drag_run(
        service, workflow_id, setup_a["id"], 1000, seconds=5, finish_time=10.2
    )
    assert run_a["id"] is not None

    # Candidate B (tweak tire pressure)
    candidate = await service.candidate(
        workflow_id,
        CreateDragCandidate(
            baselineRunId=run_a["id"],
            parameter="pressure.rear",
            baseline={
                "value": 28.0,
                "unit": "psi",
                "minimum": 15.0,
                "maximum": 45.0,
                "step": 0.5,
                "source": "game-confirmed",
            },
            candidateValue=27.5,
            baselineValueUnchanged=True,
            hypothesis="Lower rear tire pressure improves launch grip",
            source="one-game-step-exploration",
        ),
    )
    assert candidate["label"] == "B"

    # Run B
    run_b = await record_drag_run(
        service, workflow_id, candidate["id"], 20000, seconds=5, finish_time=10.0
    )

    # Compare
    report = compare_drag_runs(
        service.store,
        service.database,
        workflow_id,
        DragComparison(baselineRunIds=[run_a["id"]], candidateRunIds=[run_b["id"]]),
    )
    assert report["kind"] == "comparison"
    assert report["conclusion"] in ("provisional-keep", "difference-insufficient")
    assert "limitations" in report
    assert len(report["limitations"]) > 0


@pytest.mark.asyncio
async def test_drag_router_api(service):
    app = FastAPI()
    app.include_router(create_drag_router(service))

    # Mock live state by sending frames
    service.observe(drag_frame(100, 0, speed=0.0))
    service.observe(drag_frame(200, 0.1, speed=5.0))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/drag/live")
        assert res.status_code == 200
        data = res.json()
        assert "fresh" in data

        # Create workflow
        create_res = await client.post(
            "/api/drag/workflows",
            json={
                "identity": {"ordinal": 101, "performanceIndex": 850, "drivetrain": 1},
                "carName": "Test Drag Car",
                "eventName": "Strip 1/4",
            },
        )
        assert create_res.status_code == 200
        wf = create_res.json()
        assert wf["kind"] == "workflow"
