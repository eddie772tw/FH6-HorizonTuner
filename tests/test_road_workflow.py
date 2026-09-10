"""Road workflow lifecycle through durable snapshots and synthetic decoded frames."""

import asyncio
import copy
import sqlite3

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError
from road_comparison import compare_road_runs
from road_matching import local_comparison
from road_models import (
    CreateRoadCandidate,
    CreateRoadWorkflow,
    RoadComparison,
    StartRoadRun,
)
from road_router import create_road_router
from road_service import RoadService
from road_store import RoadStore
from telemetry_sqlite import TelemetrySQLite


def frame(timestamp, elapsed=0.1, **overrides):
    return {
        "TimestampMS": timestamp,
        "IsRaceOn": 1,
        "CurrentRaceTime": elapsed,
        "CurrentLap": elapsed,
        "LapNumber": 0,
        "CarOrdinal": 42,
        "CarPerformanceIndex": 700,
        "DrivetrainType": 1,
        "SpeedMetersPerSecond": 20,
        "PositionX": elapsed * 20,
        "PositionZ": 0,
        "TireTemp": [185] * 4,
        "TireSlipAngle": [0.1] * 4,
        "AccelInput": 200,
        "BrakeInput": 0,
        "SteerInput": 0,
        **overrides,
    }


@pytest.fixture
def service(tmp_path):
    database = TelemetrySQLite(str(tmp_path / "sessions.sqlite"))
    return RoadService(database, RoadStore(database.db_path))


async def workflow(service):
    service.observe(frame(100, 0))
    service.observe(frame(200, 0))
    request = CreateRoadWorkflow(
        identity=service.live()["identity"],
        carName="Test car",
        event={"name": "Road event", "format": "sprint"},
    )
    result = await service.create(request)
    return result, service.store.list(result["id"], "setup")[0]


def confirmation(setup_id):
    return StartRoadRun(
        setupId=setup_id,
        settingsConfirmed=True,
        otherSettings="unchanged",
        tires="unchanged",
        conditions="unchanged",
        driverAssists="unchanged",
    )


async def record_run(service, workflow_id, setup_id, offset, seconds=5, **overrides):
    service.observe(frame(offset - 100, 0))
    service.observe(frame(offset, 0))
    run = await service.start_run(workflow_id, confirmation(setup_id))
    for i in range(1, seconds * 10 + 1):
        service.observe(frame(offset + i * 100, i / 10, **overrides))
    await service.stop()
    service.store.append(
        "finish",
        workflow_id,
        {
            "runId": run["id"],
            "completed": True,
            "clean": "confirmed",
            "timeSeconds": seconds,
            "source": "game-confirmed",
        },
    )
    return run


def candidate_request(run_id):
    return CreateRoadCandidate(
        baselineRunId=run_id,
        parameter="pressure.front",
        baseline={
            "value": 28,
            "unit": "psi",
            "minimum": 15,
            "maximum": 55,
            "step": 0.5,
        },
        candidateValue=28.5,
        baselineValueUnchanged=True,
        hypothesis="Compare one confirmed pressure step",
        source="one-game-step-exploration",
    )


@pytest.mark.asyncio
async def test_road_observation_requires_no_engine_profile_and_only_new_frames(service):
    work, setup = await workflow(service)
    run = await service.start_run(work["id"], confirmation(setup["id"]))
    service.observe(frame(200, 5))  # old frame may not verify the new run
    service.observe(frame(300, 0))  # a zero driving clock cannot start the run
    assert service.recorder.total_count == 0
    service.observe(frame(400, 0.1))
    assert service.recorder.total_count == 1
    await service.stop()
    summary = service.store.list(work["id"], "summary")[0]
    assert summary["runId"] == run["id"]
    assert summary["observations"]["sampleCount"] == 1
    assert setup["confirmationScope"] == "observation-only"
    assert setup["fields"] == {}
    await service.shutdown()


@pytest.mark.asyncio
async def test_candidate_and_saved_report_survive_restart_without_mutating_baseline(
    service,
):
    work, setup = await workflow(service)
    baseline_copy = copy.deepcopy(setup)
    a = await record_run(service, work["id"], setup["id"], 1000)
    candidate = await service.candidate(work["id"], candidate_request(a["id"]))
    assert candidate["status"] == "draft"
    b = await record_run(service, work["id"], candidate["id"], 10000)
    report = compare_road_runs(
        service.store,
        service.database,
        work["id"],
        RoadComparison(baselineRunIds=[a["id"]], candidateRunIds=[b["id"]]),
    )
    assert report["conclusion"] == "difference-insufficient"
    assert report["time"]["medianChangeSeconds"] == 0
    assert report["independentRuns"] == {"baseline": 1, "candidate": 1}
    assert service.store.get(setup["id"]) == baseline_copy
    await service.shutdown()
    reopened = RoadService(service.database, RoadStore(service.database.db_path))
    await reopened.recover()
    assert reopened.store.get(report["id"]) == report
    assert len(reopened.store.list(work["id"], "summary")) == 2
    assert reopened.active is None
    await reopened.shutdown()


@pytest.mark.asyncio
async def test_identity_change_saves_and_never_silently_starts_another_road_run(
    service,
):
    work, setup = await workflow(service)
    await service.start_run(work["id"], confirmation(setup["id"]))
    service.observe(frame(300, 0.1))
    service.observe(frame(400, 0.2, CarOrdinal=43))
    await service.maintain()
    assert service.active is None
    assert (
        service.store.list(work["id"], "summary")[0]["recording"]["endReason"]
        == "identity-changed"
    )
    service.observe(frame(500, 0.3, CarOrdinal=43))
    assert not service.recorder.is_recording
    await service.shutdown()


@pytest.mark.asyncio
async def test_recovery_retains_interrupted_points_and_does_not_invent_completion(
    service,
):
    work, setup = await workflow(service)
    run = await service.start_run(work["id"], confirmation(setup["id"]))
    for i in range(1, 51):
        service.observe(frame(200 + i * 100, i / 10))
    await service.persistence.flush()
    # Simulate the process ending before finalization, preserving already committed batches.
    await service.persistence.shutdown()
    reopened = RoadService(service.database, RoadStore(service.database.db_path))
    await reopened.recover()
    summary = reopened.store.list(work["id"], "summary")[0]
    assert summary["runId"] == run["id"]
    assert summary["observations"]["sampleCount"] == 50
    assert summary["recording"]["endReason"] == "application-interrupted"
    assert summary["recording"]["incompletePersistence"] is True
    assert not reopened.store.list(work["id"], "finish")
    await reopened.shutdown()


def test_candidate_rejects_out_of_range_unconfirmed_and_non_grid_values():
    request = candidate_request("run").model_dump()
    for change in (
        {"candidateValue": 100},
        {"candidateValue": 28.2},
        {"candidateValue": float("nan")},
        {"baselineValueUnchanged": False},
        {"candidateValue": 29},
        {"parameter": "arb.front"},  # pressure unit is invalid for an ARB
    ):
        with pytest.raises(ValidationError):
            CreateRoadCandidate.model_validate({**request, **change})


@pytest.mark.asyncio
async def test_api_rejects_missing_fresh_data_and_cross_workflow_references(service):
    work, setup = await workflow(service)
    app = FastAPI()
    app.include_router(create_road_router(service))
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        service.progress_at = 0
        response = await client.post(
            f"/api/road/workflows/{work['id']}/runs",
            json=confirmation(setup["id"]).model_dump(),
        )
        assert response.status_code == 409
        response = await client.get("/api/road/workflows/not-a-workflow")
        assert response.status_code == 422
        response = await client.post(
            f"/api/road/workflows/{work['id']}/candidates",
            json=candidate_request("../../outside").model_dump(),
        )
        assert response.status_code == 409
    await service.shutdown()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "overrides,reason",
    [
        ({"TireTemp": [185, None, 185, 185]}, "thermal-start-unknown"),
        ({"TireTemp": [220] * 4}, "thermal-start-different"),
        ({"PositionZ": 1000}, "route-different-or-incomplete"),
        ({"AccelInput": 0}, "driving-conditions-insufficient"),
        ({"CurrentRaceTime": 3}, "recording-start-incomplete"),
    ],
)
async def test_unmatched_conditions_never_produce_a_setting_conclusion(
    service, overrides, reason
):
    work, setup = await workflow(service)
    a = await record_run(service, work["id"], setup["id"], 1000)
    candidate = await service.candidate(work["id"], candidate_request(a["id"]))
    b = await record_run(service, work["id"], candidate["id"], 10000, **overrides)
    report = compare_road_runs(
        service.store,
        service.database,
        work["id"],
        RoadComparison(baselineRunIds=[a["id"]], candidateRunIds=[b["id"]]),
    )
    assert report["conclusion"] == "insufficient-data"
    assert reason in report["reasons"]
    assert report["independentRuns"] == {"baseline": 1, "candidate": 1}
    assert len(service.store.list(work["id"], "summary")) == 2
    await service.shutdown()


@pytest.mark.asyncio
async def test_every_repeat_is_checked_and_reports_keep_their_original_evidence(
    service,
):
    work, setup = await workflow(service)
    a = await record_run(service, work["id"], setup["id"], 1000)
    candidate = await service.candidate(work["id"], candidate_request(a["id"]))
    b = await record_run(service, work["id"], candidate["id"], 10000)
    good = compare_road_runs(
        service.store,
        service.database,
        work["id"],
        RoadComparison(baselineRunIds=[a["id"]], candidateRunIds=[b["id"]]),
    )
    other = await record_run(
        service, work["id"], candidate["id"], 20000, PositionZ=1000
    )
    report = compare_road_runs(
        service.store,
        service.database,
        work["id"],
        RoadComparison(
            baselineRunIds=[a["id"]], candidateRunIds=[b["id"], other["id"]]
        ),
    )
    assert "repetition-route-incompatible" in report["reasons"]
    assert report["conclusion"] == "insufficient-data"
    assert report["independentRuns"] == {"baseline": 1, "candidate": 2}
    assert report["evidenceLevel"] == "descriptive"
    assert service.store.get(good["id"]) == good
    with pytest.raises(ValueError, match="only once"):
        compare_road_runs(
            service.store,
            service.database,
            work["id"],
            RoadComparison(
                baselineRunIds=[a["id"], a["id"]], candidateRunIds=[b["id"]]
            ),
        )
    await service.shutdown()


def test_linked_documents_roll_back_as_one_operation(service):
    first = service.store.document("setup", "work", {"label": "A"})
    conflicting = {**first, "label": "B"}
    with pytest.raises(sqlite3.IntegrityError):
        service.store.append_documents([first, conflicting])
    assert service.store.list("work") == []


def test_local_sections_keep_thermal_changes_and_reject_an_overlapping_elevated_route():
    a = [frame(i * 100, i / 10, PositionY=0) for i in range(201)]
    b = [
        {**p, "TireSlipAngle": [0.3] * 4, "TireTemp": [194, None, 194, 194]} for p in a
    ]
    report = local_comparison(a, b, circuit=True)
    assert report["routeStatus"] == "compatible"
    assert 1 <= len(report["segments"]) <= 10
    assert report["segments"][0]["meanNormalizedAngleChange"] == pytest.approx(0.2)
    assert report["segments"][0]["meanTemperatureChangeC"] == [5, None, 5, 5]
    elevated = [{**p, "PositionY": 10} for p in b]
    assert (
        local_comparison(a, elevated, circuit=True)["routeStatus"]
        == "different-or-incomplete"
    )
    other_lap = [{**p, "LapNumber": 1} for p in b]
    assert local_comparison(a, other_lap, circuit=True)["matchedLocations"] == 0


@pytest.mark.asyncio
async def test_keep_candidate_creates_a_new_baseline_and_initial_inputs_are_saved(
    service,
):
    work, setup = await workflow(service)
    a = await record_run(service, work["id"], setup["id"], 1000)
    candidate = await service.candidate(work["id"], candidate_request(a["id"]))
    b = await record_run(service, work["id"], candidate["id"], 10000)
    with pytest.raises(ValueError, match="new baseline"):
        await service.candidate(work["id"], candidate_request(b["id"]))
    report = compare_road_runs(
        service.store,
        service.database,
        work["id"],
        RoadComparison(baselineRunIds=[a["id"]], candidateRunIds=[b["id"]]),
    )
    app = FastAPI()
    app.include_router(create_road_router(service))
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        prefix = f"/api/road/workflows/{work['id']}"
        response = await client.post(
            prefix + "/decisions",
            json={"reportId": report["id"], "choice": "keep-candidate"},
        )
        assert response.status_code == 200
        decision = response.json()
        promoted = service.store.get(decision["setupId"], "setup")
        assert promoted["baselineSetupId"] is None
        assert promoted["basisSetupId"] == candidate["id"]
        assert promoted["fields"]["pressure.front"]["value"] == 28.5
        assert service.store.get(candidate["id"]) == candidate
        next_a = await record_run(service, work["id"], promoted["id"], 20000)
        with pytest.raises(ValueError, match="same saved unit and value"):
            await service.candidate(work["id"], candidate_request(next_a["id"]))
        next_request = candidate_request(next_a["id"]).model_dump()
        next_request["baseline"]["value"] = 28.5
        next_request["candidateValue"] = 29
        next_b = await service.candidate(
            work["id"], CreateRoadCandidate.model_validate(next_request)
        )
        assert next_b["fields"]["pressure.front"]["value"] == 29
        body = {
            "parentSetupId": promoted["id"],
            "section": "arb",
            "inputs": {"weight_distribution": {"value": 55, "unit": "%"}},
            "fields": {
                "arb.front": {
                    "value": 20,
                    "minimum": 1,
                    "maximum": 65,
                    "step": 1,
                    "unit": "slider",
                }
            },
            "gameRangesConfirmed": True,
            "formulaVersion": "road-initial/neutral-v1",
        }
        response = await client.post(prefix + "/initial-setups", json=body)
        assert response.status_code == 200
        initial = response.json()
        assert initial["confirmationScope"] == "partial"
        assert initial["fields"]["arb.front"]["source"] == "estimate"
        inputs = service.store.get(initial["vehicleInputsId"], "vehicle-inputs")
        assert inputs["fields"]["weight_distribution"]["source"] == "game-confirmed"
        body["section"] = "gearing"
        body["fields"] = {
            "gearing.finalDrive": {
                "value": 3,
                "minimum": 2,
                "maximum": 6,
                "step": 0.1,
                "unit": "ratio",
            }
        }
        response = await client.post(prefix + "/initial-setups", json=body)
        assert response.status_code == 422  # engine provenance cannot be omitted
    await service.shutdown()
