"""Low-rate Offroad / Rally API. Database reads and analysis execute outside the event loop."""

import asyncio

from fastapi import APIRouter, HTTPException
from offroad_comparison import compare_offroad_runs
from offroad_models import (
    CreateOffroadCandidate,
    CreateOffroadWorkflow,
    OffroadComparison,
    OffroadDecision,
    OffroadFinish,
    OffroadInitialSetup,
    StartOffroadRun,
)


def create_offroad_router(service) -> APIRouter:
    router = APIRouter(prefix="/api/offroad", tags=["Offroad"])

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

    @router.get("/workflows")
    async def workflows():
        return await call(service.store.list, kind="workflow")

    @router.post("/workflows")
    async def create(request: CreateOffroadWorkflow):
        return await operation(service.create(request))

    @router.get("/workflows/{workflow_id}")
    async def documents(workflow_id: str):
        await call(service.store.get, workflow_id, "workflow")
        return await call(service.store.list, workflow_id)

    @router.post("/workflows/{workflow_id}/candidates")
    async def candidate(workflow_id: str, request: CreateOffroadCandidate):
        return await operation(service.candidate(workflow_id, request))

    @router.post("/workflows/{workflow_id}/initial-setups")
    async def initial_setup(workflow_id: str, request: OffroadInitialSetup):
        parent = await call(
            service.store.get, request.parentSetupId, "setup", workflow_id
        )
        if parent.get("baselineSetupId"):
            raise HTTPException(
                status_code=422,
                detail="Build initial settings from A, not from an experimental B",
            )
        workflow = await call(service.store.get, workflow_id, "workflow")
        engine = request.engineObservation
        if engine and (
            engine.carId != str(workflow["identity"]["ordinal"])
            or engine.performanceIndex != workflow["identity"]["performanceIndex"]
        ):
            raise HTTPException(
                status_code=422,
                detail="Engine evidence belongs to a different car or configuration",
            )
        inputs = service.store.document(
            "vehicle-inputs",
            workflow_id,
            {
                "fields": {
                    key: value.model_dump() for key, value in request.inputs.items()
                },
                "confirmationScope": "partial",
            },
        )
        setup = service.store.document(
            "setup",
            workflow_id,
            {
                "label": "A",
                "baselineSetupId": None,
                "basisSetupId": parent["id"],
                "fields": {
                    **parent["fields"],
                    **{
                        key: {**value.model_dump(), "source": "estimate"}
                        for key, value in request.fields.items()
                    },
                },
                "source": "initial-formula",
                "confirmationScope": "partial",
                "status": "draft",
                "vehicleInputsId": inputs["id"],
                "section": request.section,
                "formulaVersion": request.formulaVersion,
                "engineObservation": engine.model_dump() if engine else None,
            },
        )
        await call(service.store.append_documents, [inputs, setup])
        return setup

    @router.post("/workflows/{workflow_id}/runs")
    async def start(workflow_id: str, request: StartOffroadRun):
        return await operation(service.start_run(workflow_id, request))

    @router.post("/stop")
    async def stop():
        await operation(service.stop())
        return {"saved": True}

    @router.post("/workflows/{workflow_id}/runs/{run_id}/finish")
    async def finish(workflow_id: str, run_id: str, request: OffroadFinish):
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
    async def compare(workflow_id: str, request: OffroadComparison):
        return await call(
            compare_offroad_runs, service.store, service.database, workflow_id, request
        )

    @router.post("/workflows/{workflow_id}/decisions")
    async def decide(workflow_id: str, request: OffroadDecision):
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
                            "discipline",
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
