"""Drift workflow lifecycle tests through durable snapshots and synthetic frames."""

import pytest
from drift_analysis import summarize_drift_observations
from drift_comparison import compare_drift_runs
from drift_models import (
    CreateDriftCandidate,
    CreateDriftWorkflow,
    DriftComparison,
    StartDriftRun,
)
from drift_router import create_drift_router
from drift_service import DriftService
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from telemetry_sqlite import TelemetrySQLite
from workflow_store import WorkflowStore


def drift_frame(timestamp, elapsed=0.1, speed=20.0, yaw_rate=0.8, **overrides):
    return {
        "TimestampMS": timestamp,
        "IsRaceOn": 1,
        "CurrentRaceTime": elapsed,
        "CarOrdinal": 202,
        "CarPerformanceIndex": 750,
        "DrivetrainType": 0,  # RWD
        "SpeedMetersPerSecond": speed,
        "AngularVelocityZ": yaw_rate,
        "TireSlipRatio": [0.05, 0.05, 0.45, 0.45],  # high rear slip
        "TireTemp": [190.0, 190.0, 230.0, 230.0],
        **overrides,
    }


@pytest.fixture
def service(tmp_path):
    database = TelemetrySQLite(str(tmp_path / "drift_sessions.sqlite"))
    store = WorkflowStore(database.db_path, default_discipline="drift")
    return DriftService(database, store)


async def record_drift_run(
    service, workflow_id, setup_id, offset, seconds=5, score=45000.0, **overrides
):
    service.observe(drift_frame(offset - 100, 0, speed=0.0))
    service.observe(drift_frame(offset, 0, speed=0.0))
    run = await service.start_run(
        workflow_id,
        StartDriftRun(
            setupId=setup_id,
            settingsConfirmed=True,
            otherSettings="unchanged",
            tires="unchanged",
            conditions="unchanged",
            driverAssists="unchanged",
        ),
    )
    for i in range(1, seconds * 10 + 1):
        elapsed = i / 10
        service.observe(
            drift_frame(
                offset + i * 100,
                elapsed=elapsed,
                speed=22.0,
                yaw_rate=0.75,
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
            "score": score,
            "durationSeconds": float(seconds),
            "source": "game-confirmed",
        },
    )
    return run


@pytest.mark.asyncio
async def test_drift_workflow_lifecycle(service):
    wf = await service.create(
        CreateDriftWorkflow(
            identity={"ordinal": 202, "performanceIndex": 750, "drivetrain": 0},
            carName="Drift Missile",
            event={"name": "Mountain Pass Drift Zone", "format": "zone"},
        )
    )
    workflow_id = wf["id"]
    setups = [d for d in service.store.list(workflow_id) if d["kind"] == "setup"]
    setup_a = setups[0]

    # Run A
    run_a = await record_drift_run(
        service, workflow_id, setup_a["id"], 1000, seconds=5, score=45000.0
    )
    assert run_a["id"] is not None

    # Candidate B (tweak rear tire pressure)
    candidate = await service.candidate(
        workflow_id,
        CreateDriftCandidate(
            baselineRunId=run_a["id"],
            parameter="pressure.rear",
            baseline={
                "value": 32.0,
                "unit": "psi",
                "minimum": 15.0,
                "maximum": 55.0,
                "step": 0.5,
                "source": "game-confirmed",
            },
            candidateValue=32.5,
            baselineValueUnchanged=True,
            hypothesis="Higher rear tire pressure induces slide more progressively",
            source="one-game-step-exploration",
        ),
    )
    assert candidate["label"] == "B"

    # Run B
    run_b = await record_drift_run(
        service, workflow_id, candidate["id"], 20000, seconds=5, score=48000.0
    )

    # Compare
    report = compare_drift_runs(
        service.store,
        service.database,
        workflow_id,
        DriftComparison(baselineRunIds=[run_a["id"]], candidateRunIds=[run_b["id"]]),
    )
    assert report["kind"] == "comparison"
    assert "limitations" in report
    assert len(report["limitations"]) > 0
    # Check that mandatory limitation disclaimer is present
    assert any("no causal model" in lim.lower() for lim in report["limitations"])


@pytest.mark.asyncio
async def test_drift_router_api(service):
    app = FastAPI()
    app.include_router(create_drift_router(service))

    service.observe(drift_frame(100, 0, speed=0.0))
    service.observe(drift_frame(200, 0.1, speed=10.0))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/drift/live")
        assert res.status_code == 200
        data = res.json()
        assert "fresh" in data

        create_res = await client.post(
            "/api/drift/workflows",
            json={
                "identity": {"ordinal": 202, "performanceIndex": 750, "drivetrain": 0},
                "carName": "Test Drift Car",
                "event": {"name": "Test Zone", "format": "zone"},
            },
        )
        assert create_res.status_code == 200
        wf = create_res.json()
        assert wf["kind"] == "workflow"
