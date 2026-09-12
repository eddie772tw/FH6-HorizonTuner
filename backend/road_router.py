"""Low-rate Road API. Database reads and analysis execute outside the event loop."""

import asyncio

from fastapi import APIRouter, HTTPException
from road_comparison import compare_road_runs
from road_models import (
    CompatibilitySnapshot,
    CreateRoadCandidate,
    CreateRoadWorkflow,
    EngineArchiveRequest,
    RoadComparison,
    RoadDecision,
    RoadFinish,
    StartRoadRun,
)
from tuning_capture import export_road_capture


def create_road_router(service_provider) -> APIRouter:
    router = APIRouter(prefix="/api/road", tags=["Road"])

    # Resolve at request time so production app fixtures can isolate storage.
    class ServiceProxy:
        def __getattr__(self, name):
            target = (
                service_provider() if callable(service_provider) else service_provider
            )
            return getattr(target, name)

    service = ServiceProxy()

    async def call(function, *args, **kwargs):
        try:
            return await asyncio.to_thread(function, *args, **kwargs)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    async def operation(awaitable):
        try:
            return await awaitable
        except (ValueError, RuntimeError) as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @router.get("/live")
    async def live():
        return service.live()

    @router.get("/engine-observations")
    async def engine_history():
        documents = await call(
            service.store.list, kind="engine-observation", exclude_capture=True
        )
        return [d["observation"] for d in documents]

    @router.post("/engine-observations")
    async def save_engine(request: EngineArchiveRequest):
        return await call(service.store.save_engine, request.model_dump())

    @router.get("/engine-observations/{observation_id}/capture")
    async def engine_capture(observation_id: str):
        document = await call(service.store.get, observation_id, "engine-observation")
        return document["capture"]

    @router.get("/compatibility")
    async def compatibility_history():
        return await call(service.store.list, kind="compatibility")

    @router.post("/compatibility")
    async def save_compatibility(request: CompatibilitySnapshot):
        await operation(service.validate_recommendation(request.recommendation))
        return await call(
            service.store.append,
            "compatibility",
            "compatibility",
            {**request.model_dump(), "status": "compatibility-only"},
        )

    @router.get("/workflows")
    async def workflows():
        return await call(service.store.list, kind="workflow")

    @router.post("/workflows")
    async def create(request: CreateRoadWorkflow):
        return await operation(service.create(request))

    @router.get("/workflows/{workflow_id}")
    async def documents(workflow_id: str):
        await call(service.store.get, workflow_id, "workflow")
        return await call(service.store.list, workflow_id)

    @router.get("/workflows/{workflow_id}/runs/{run_id}/capture")
    async def capture(workflow_id: str, run_id: str):
        return await call(export_road_capture, service, workflow_id, run_id)

    @router.post("/workflows/{workflow_id}/candidates")
    async def candidate(workflow_id: str, request: CreateRoadCandidate):
        return await operation(service.candidate(workflow_id, request))

    @router.post("/workflows/{workflow_id}/runs")
    async def start(workflow_id: str, request: StartRoadRun):
        return await operation(service.start_run(workflow_id, request))

    @router.post("/stop")
    async def stop():
        await operation(service.stop())
        return {"saved": True}

    @router.post("/workflows/{workflow_id}/runs/{run_id}/finish")
    async def finish(workflow_id: str, run_id: str, request: RoadFinish):
        await call(service.store.get, run_id, "run", workflow_id)
        summaries = await call(service.store.list, workflow_id, "summary")
        if not any(d["runId"] == run_id for d in summaries):
            raise HTTPException(
                status_code=409,
                detail="Save the recorded run before confirming its result",
            )
        return await call(
            service.store.append,
            "finish",
            workflow_id,
            {**request.model_dump(), "runId": run_id},
        )

    @router.post("/workflows/{workflow_id}/comparisons")
    async def compare(workflow_id: str, request: RoadComparison):
        return await call(
            compare_road_runs, service.store, service.database, workflow_id, request
        )

    @router.post("/workflows/{workflow_id}/decisions")
    async def decide(workflow_id: str, request: RoadDecision):
        report = await call(
            service.store.get, request.reportId, "comparison", workflow_id
        )
        setup_id = (
            report["candidateSetupId"]
            if request.choice == "keep-candidate"
            else report["baselineSetupId"]
        )
        setup = await call(service.store.get, setup_id, "setup", workflow_id)
        promoted = None
        if request.choice == "keep-candidate":
            promoted = service.store.document(
                "setup",
                workflow_id,
                {
                    **{
                        key: value
                        for key, value in setup.items()
                        if key
                        not in (
                            "id",
                            "createdAt",
                            "schema",
                            "workflowId",
                            "kind",
                            "feedbackId",
                            "targetParameter",
                        )
                    },
                    "label": "A",
                    "baselineSetupId": None,
                    "basisSetupId": setup_id,
                    "source": "user-selected-candidate",
                    "status": "draft",
                    "reportId": report["id"],
                },
            )
            setup = promoted
        decision = service.store.document(
            "decision",
            workflow_id,
            {
                **request.model_dump(),
                "setupId": setup["id"],
                "selectedSetupId": setup_id,
                "draft": setup,
                "status": "awaiting-game-confirmation",
            },
        )
        await call(
            service.store.append_documents,
            ([promoted] if promoted else []) + [decision],
        )
        return decision

    return router
