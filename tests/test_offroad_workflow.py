"""Offroad / Rally workflow lifecycle through durable snapshots and synthetic decoded frames."""

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from offroad_analysis import summarize_offroad_observations
from offroad_comparison import compare_offroad_runs
from offroad_models import (
    CreateOffroadCandidate,
    CreateOffroadWorkflow,
    OffroadComparison,
    OffroadInitialSetup,
    StartOffroadRun,
)
from offroad_router import create_offroad_router
from offroad_service import OffroadService
from pydantic import ValidationError
from telemetry_sqlite import TelemetrySQLite
from workflow_store import WorkflowStore


def offroad_frame(timestamp, elapsed=0.1, **overrides):
    return {
        "TimestampMS": timestamp,
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
        "TireTemp": [180.0] * 4,
        "NormalizedSuspensionTravel": [0.45, 0.45, 0.45, 0.45],
        "SuspensionTravelMeters": [0.12, 0.12, 0.12, 0.12],
        "SurfaceRumble": [0.2, 0.2, 0.2, 0.2],
        "DistanceTraveled": elapsed * 25.0,
        "AccelInput": 220,
        "BrakeInput": 0,
        "SteerInput": 0,
        **overrides,
    }


@pytest.fixture
def service(tmp_path):
    database = TelemetrySQLite(str(tmp_path / "offroad_sessions.sqlite"))
    store = WorkflowStore(database.db_path, default_discipline="offroad")
    return OffroadService(database, store)


async def record_offroad_run(
    service, workflow_id, setup_id, offset, seconds=4, finish_time=None, **overrides
):
    service.observe(offroad_frame(offset - 100, 0))
    service.observe(offroad_frame(offset, 0))
    run = await service.start_run(
        workflow_id,
        StartOffroadRun(
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
            offroad_frame(
                offset + i * 100,
                elapsed=elapsed,
                DistanceTraveled=elapsed * 25.0,
                PositionX=elapsed * 25.0,
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
            "timeSeconds": finish_time if finish_time is not None else float(seconds),
            "source": "game-confirmed",
        },
    )
    return run


@pytest.mark.asyncio
async def test_workflow_store_persistence(tmp_path):
    store = WorkflowStore(
        str(tmp_path / "test_store.sqlite"), default_discipline="offroad"
    )
    doc1 = store.append("workflow", "wf-1", {"name": "Test Workflow"})
    assert doc1["schema"] == "offroad-workflow/v1"
    assert doc1["discipline"] == "offroad"

    retrieved = store.get(doc1["id"], "workflow")
    assert retrieved["name"] == "Test Workflow"

    listed = store.list(workflow_id="wf-1")
    assert len(listed) == 1
    assert listed[0]["id"] == doc1["id"]


@pytest.mark.asyncio
async def test_offroad_analysis_metrics():
    frames = []
    # Frame 0 to 9: normal rough gravel driving
    for i in range(10):
        frames.append(
            offroad_frame(
                100 * (i + 1),
                elapsed=0.1 * (i + 1),
                NormalizedSuspensionTravel=[0.5, 0.5, 0.5, 0.5],
                SuspensionTravelMeters=[0.15, 0.15, 0.15, 0.15],
                SurfaceRumble=[0.3, 0.35, 0.25, 0.3],
                AccelerationY=-9.8,
            )
        )
    # Frame 10 to 12: jump (airborne: all travel <= 0.05)
    for i in range(10, 13):
        frames.append(
            offroad_frame(
                100 * (i + 1),
                elapsed=0.1 * (i + 1),
                NormalizedSuspensionTravel=[0.02, 0.02, 0.03, 0.03],
                SuspensionTravelMeters=[0.01, 0.01, 0.01, 0.01],
                SurfaceRumble=[0.0, 0.0, 0.0, 0.0],
                AccelerationY=0.0,
            )
        )
    # Frame 13 to 14: landing impact (severe bottoming >= 0.98, high vertical G)
    for i in (13, 14):
        frames.append(
            offroad_frame(
                100 * (i + 1),
                elapsed=0.1 * (i + 1),
                NormalizedSuspensionTravel=[0.99, 0.99, 0.80, 0.80],
                SuspensionTravelMeters=[0.28, 0.28, 0.22, 0.22],
                SurfaceRumble=[0.8, 0.8, 0.4, 0.4],
                AccelerationY=-39.2,
            )
        )
    # Frame 15: post-landing driving
    frames.append(
        offroad_frame(
            1600,
            elapsed=1.6,
            NormalizedSuspensionTravel=[0.5, 0.5, 0.5, 0.5],
            SuspensionTravelMeters=[0.15, 0.15, 0.15, 0.15],
            SurfaceRumble=[0.3, 0.3, 0.3, 0.3],
            AccelerationY=-9.8,
        )
    )

    summary = summarize_offroad_observations(frames)
    assert summary["sampleCount"] == 16
    assert summary["quality"]["observedSeconds"] > 1.0

    # Wheels travel & bottoming
    fl = summary["wheels"]["FL"]
    assert fl["nearCompression"]["count"] == 1
    assert fl["severeBottoming"]["count"] == 1
    assert fl["nearExtension"]["count"] == 1
    assert fl["peakTravelPct"] == pytest.approx(99.0)

    # Airborne metrics
    assert summary["airborne"]["count"] >= 1
    assert summary["airborne"]["totalAirtimeSeconds"] > 0

    # Landing impact G
    assert summary["landing"]["maxImpactG"] is not None
    assert summary["landing"]["maxImpactG"] > 3.5

    # Terrain roughness RMS
    assert summary["terrain"]["surfaceRoughnessRms"] > 0


@pytest.mark.asyncio
async def test_offroad_workflow_lifecycle_sprint(service):
    # Prime live telemetry
    service.observe(offroad_frame(100, 0))
    service.observe(offroad_frame(200, 0))
    assert service.live()["fresh"] is True

    # 1. Create Offroad sprint workflow
    create_req = CreateOffroadWorkflow(
        identity=service.live()["identity"],
        carName="Subaru Rally WRX",
        configuration="S1 800 Dirt",
        event={
            "name": "Barranca Trail",
            "format": "sprint",
            "driverAssists": "manual",
            "conditions": "dry",
        },
    )
    workflow = await service.create(create_req)
    assert workflow["kind"] == "workflow"
    assert workflow["schema"] == "offroad-workflow/v1"

    # Verify initial A setup draft exists
    docs = service.store.list(workflow["id"])
    setup_a = next(d for d in docs if d["kind"] == "setup" and d["label"] == "A")
    assert setup_a["confirmationScope"] == "observation-only"

    # 2. Add Initial Setup section (Ride height)
    setup_req = OffroadInitialSetup(
        parentSetupId=setup_a["id"],
        section="height",
        inputs={
            "height_front_min": {
                "value": 12.0,
                "unit": "cm",
                "source": "game-confirmed",
            },
            "height_front_max": {
                "value": 24.0,
                "unit": "cm",
                "source": "game-confirmed",
            },
            "height_rear_min": {
                "value": 12.0,
                "unit": "cm",
                "source": "game-confirmed",
            },
            "height_rear_max": {
                "value": 24.0,
                "unit": "cm",
                "source": "game-confirmed",
            },
        },
        fields={
            "height.front": {
                "value": 20.0,
                "unit": "cm",
                "minimum": 12.0,
                "maximum": 24.0,
                "step": 0.5,
                "source": "game-confirmed",
            },
            "height.rear": {
                "value": 20.0,
                "unit": "cm",
                "minimum": 12.0,
                "maximum": 24.0,
                "step": 0.5,
                "source": "game-confirmed",
            },
        },
        gameRangesConfirmed=True,
        formulaVersion="offroad-initial/neutral-v1",
    )
    app = FastAPI()
    app.include_router(create_offroad_router(service))
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        res = await client.post(
            f"/api/offroad/workflows/{workflow['id']}/initial-setups",
            json=setup_req.model_dump(),
        )
        assert res.status_code == 200
        setup_a2 = res.json()
        assert setup_a2["fields"]["height.front"]["value"] == 20.0

    # 3. Record Baseline Run A (with bottoming on frames 10, 11)
    run_a = await record_offroad_run(
        service,
        workflow["id"],
        setup_a2["id"],
        1000,
        seconds=4,
        NormalizedSuspensionTravel=[0.99] * 4,
    )

    # 4. Create Single-Variable Candidate B (Raise ride height from 20.0 to 22.0)
    cand_req = CreateOffroadCandidate(
        baselineRunId=run_a["id"],
        parameter="height.front",
        baseline={
            "value": 20.0,
            "unit": "cm",
            "minimum": 12.0,
            "maximum": 24.0,
            "step": 0.5,
            "source": "game-confirmed",
        },
        candidateValue=22.0,
        baselineValueUnchanged=True,
        hypothesis="Increase front ride height to reduce severe bottoming on trail jumps.",
        source="user-specified",
    )
    cand_b = await service.candidate(workflow["id"], cand_req)
    assert cand_b["label"] == "B"
    assert cand_b["fields"]["height.front"]["value"] == 22.0

    # 5. Record Candidate Run B (no bottoming, slightly faster: 3.9s vs 4.0s)
    run_b = await record_offroad_run(
        service,
        workflow["id"],
        cand_b["id"],
        10000,
        seconds=4,
        finish_time=3.9,
        NormalizedSuspensionTravel=[0.60] * 4,
    )

    # 6. Compare A vs B
    comp_req = OffroadComparison(
        baselineRunIds=[run_a["id"]], candidateRunIds=[run_b["id"]]
    )
    comparison = compare_offroad_runs(
        service.store, service.database, workflow["id"], comp_req
    )
    assert comparison["conclusion"] == "bottoming-reduced"
    assert comparison["offroadMetrics"]["bottomingCountChange"] < 0
    assert comparison["time"]["medianChangeSeconds"] == pytest.approx(-0.1)

    # 7. Decide (Keep candidate B as promoted new baseline)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        decide_res = await client.post(
            f"/api/offroad/workflows/{workflow['id']}/decisions",
            json={"reportId": comparison["id"], "choice": "keep-candidate"},
        )
        assert decide_res.status_code == 200
        decision = decide_res.json()
        assert decision["choice"] == "keep-candidate"
        assert decision["status"] == "awaiting-game-confirmation"


@pytest.mark.asyncio
async def test_offroad_tradeoff_comparison(service):
    # Test conclusion 'tradeoff' when candidate is faster but bottoming increases
    service.observe(offroad_frame(100, 0))
    service.observe(offroad_frame(200, 0))

    workflow = await service.create(
        CreateOffroadWorkflow(
            identity=service.live()["identity"],
            carName="Rally Car",
            event={"name": "Trail", "format": "sprint"},
        )
    )
    setup_a = service.store.list(workflow["id"], "setup")[0]

    # Baseline run (no bottoming, 4.0s)
    run_a = await record_offroad_run(
        service,
        workflow["id"],
        setup_a["id"],
        1000,
        seconds=4,
        NormalizedSuspensionTravel=[0.5] * 4,
    )

    # Candidate run (softer springs -> severe bottoming, but faster: 3.5s)
    cand_b = await service.candidate(
        workflow["id"],
        CreateOffroadCandidate(
            baselineRunId=run_a["id"],
            parameter="spring.front",
            baseline={
                "value": 100.0,
                "unit": "kgf/mm",
                "minimum": 50.0,
                "maximum": 150.0,
                "step": 1.0,
            },
            candidateValue=80.0,
            baselineValueUnchanged=True,
            hypothesis="Softer springs for trail grip",
            source="user-specified",
        ),
    )

    run_b = await record_offroad_run(
        service,
        workflow["id"],
        cand_b["id"],
        10000,
        seconds=4,
        finish_time=3.5,
        NormalizedSuspensionTravel=[0.99] * 4,
    )

    comp = compare_offroad_runs(
        service.store,
        service.database,
        workflow["id"],
        OffroadComparison(baselineRunIds=[run_a["id"]], candidateRunIds=[run_b["id"]]),
    )
    assert comp["conclusion"] == "tradeoff"
    assert comp["offroadMetrics"]["bottomingCountChange"] > 0
    assert comp["time"]["medianChangeSeconds"] == pytest.approx(-0.5)


@pytest.mark.asyncio
async def test_offroad_candidate_slower_comparison(service):
    service.observe(offroad_frame(100, 0))
    service.observe(offroad_frame(200, 0))

    workflow = await service.create(
        CreateOffroadWorkflow(
            identity=service.live()["identity"],
            carName="Rally Car",
            event={"name": "Circuit", "format": "circuit"},
        )
    )
    setup_a = service.store.list(workflow["id"], "setup")[0]

    # Baseline run (4.0s)
    run_a = await record_offroad_run(
        service,
        workflow["id"],
        setup_a["id"],
        1000,
        seconds=4,
        NormalizedSuspensionTravel=[0.5] * 4,
    )

    # Candidate run
    cand_b = await service.candidate(
        workflow["id"],
        CreateOffroadCandidate(
            baselineRunId=run_a["id"],
            parameter="arb.rear",
            baseline={
                "value": 30.0,
                "unit": "slider",
                "minimum": 1.0,
                "maximum": 65.0,
                "step": 0.1,
            },
            candidateValue=40.0,
            baselineValueUnchanged=True,
            hypothesis="Stiffer rear ARB",
            source="user-specified",
        ),
    )

    # Slower run (4.5s)
    run_b = await record_offroad_run(
        service,
        workflow["id"],
        cand_b["id"],
        10000,
        seconds=4,
        finish_time=4.5,
        NormalizedSuspensionTravel=[0.5] * 4,
    )

    comp = compare_offroad_runs(
        service.store,
        service.database,
        workflow["id"],
        OffroadComparison(baselineRunIds=[run_a["id"]], candidateRunIds=[run_b["id"]]),
    )
    assert comp["conclusion"] == "candidate-slower"
    assert comp["time"]["medianChangeSeconds"] == pytest.approx(0.5)


@pytest.mark.asyncio
async def test_offroad_models_validation():
    # Test setting validation
    with pytest.raises(ValidationError):
        CreateOffroadCandidate(
            baselineRunId="run-1",
            parameter="height.front",
            baseline={
                "value": 30.0,
                "unit": "cm",
                "minimum": 10.0,
                "maximum": 25.0,
                "step": 0.5,
            },
            candidateValue=22.0,
            baselineValueUnchanged=True,
            hypothesis="test",
            source="user-specified",
        )

    # Test candidate must change value
    with pytest.raises(ValidationError):
        CreateOffroadCandidate(
            baselineRunId="run-1",
            parameter="height.front",
            baseline={
                "value": 20.0,
                "unit": "cm",
                "minimum": 10.0,
                "maximum": 25.0,
                "step": 0.5,
            },
            candidateValue=20.0,
            baselineValueUnchanged=True,
            hypothesis="test",
            source="user-specified",
        )
