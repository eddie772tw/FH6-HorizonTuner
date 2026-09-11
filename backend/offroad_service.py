"""Offroad / Rally orchestration. Telemetry handling only updates memory and enqueues capture work."""

import asyncio
import time
from uuid import uuid4

from offroad_analysis import summarize_offroad_observations
from offroad_models import (
    CreateOffroadCandidate,
    CreateOffroadWorkflow,
    StartOffroadRun,
)
from race_recorder import AsyncRacePersistence, RaceRecorder
from telemetry_contract import finite
from workflow_store import WorkflowStore


def frame_identity(data: dict) -> dict | None:
    values = [
        data.get(k) for k in ("CarOrdinal", "CarPerformanceIndex", "DrivetrainType")
    ]
    if (
        not all(finite(v) and int(v) == v for v in values)
        or values[0] <= 0
        or values[2] not in (0, 1, 2)
    ):
        return None
    return dict(zip(("ordinal", "performanceIndex", "drivetrain"), values))


class OffroadService:
    def __init__(self, database, store: WorkflowStore):
        self.database, self.store = database, store
        self.persistence = AsyncRacePersistence(database)
        self.recorder = RaceRecorder(self.persistence, {}, {}, automatic=False)
        self.lock = asyncio.Lock()
        self.active: dict | None = None
        self.latest_identity: dict | None = None
        self.latest_timestamp: float | None = None
        self.progress_at = 0.0
        self.stable_frames = 0
        self.sequence = 0
        self.last_error: str | None = None

    def live(self) -> dict:
        fresh = time.monotonic() - self.progress_at < 2 and self.stable_frames >= 2
        return {
            "identity": self.latest_identity,
            "fresh": fresh,
            "source": "measured" if fresh else "unknown",
            "activeRun": self.active,
            "sampleCount": self.recorder.total_count,
            "state": "saving"
            if self.active and not self.recorder.is_recording
            else "recording"
            if self.active and self.recorder.total_count
            else "waiting-for-race"
            if self.active
            else "idle",
            "error": self.last_error,
        }

    def observe(self, data: dict) -> None:
        identity, timestamp = frame_identity(data), data.get("TimestampMS")
        progressed = finite(timestamp) and timestamp != self.latest_timestamp
        if identity and progressed:
            self.stable_frames = (
                self.stable_frames + 1
                if identity == self.latest_identity
                and (self.latest_timestamp is None or timestamp > self.latest_timestamp)
                else 1
            )
            self.latest_identity, self.latest_timestamp = identity, timestamp
            self.progress_at = time.monotonic()
            self.sequence += 1
        if (
            not self.active
            or not self.recorder.is_recording
            or self.sequence <= self.active["armedSequence"]
        ):
            return
        if identity is not None and identity != self.active["identity"]:
            self.recorder.save_latest_and_clear("identity-changed")
            return
        if identity is None or not progressed:
            return
        if not self.recorder.total_count and not (
            data.get("IsRaceOn") == 1
            and finite(data.get("CurrentRaceTime"))
            and data["CurrentRaceTime"] > 0
        ):
            return
        self.recorder.record(data)

    async def create(self, request: CreateOffroadWorkflow) -> dict:
        workflow_id = uuid4().hex
        identity = request.identity.model_dump()
        payload = {
            **request.model_dump(),
            "identitySource": "measured"
            if self.live()["fresh"] and identity == self.latest_identity
            else "game-confirmed",
        }
        workflow = self.store.document(
            "workflow", workflow_id, payload, document_id=workflow_id
        )
        setup = self.store.document(
            "setup",
            workflow_id,
            {
                "label": "A",
                "fields": {},
                "confirmationScope": "observation-only",
                "formulaVersion": None,
                "source": "unknown",
                "baselineSetupId": None,
            },
        )
        await asyncio.to_thread(self.store.append_documents, [workflow, setup])
        return workflow

    async def candidate(
        self, workflow_id: str, request: CreateOffroadCandidate
    ) -> dict:
        run = await asyncio.to_thread(
            self.store.get, request.baselineRunId, "run", workflow_id
        )
        documents = await asyncio.to_thread(self.store.list, workflow_id)
        if not any(
            d["kind"] == "summary" and d["runId"] == run["id"] for d in documents
        ):
            raise ValueError("Save the baseline run before preparing a candidate")
        basis = await asyncio.to_thread(
            self.store.get, run["setupId"], "setup", workflow_id
        )
        if basis.get("baselineSetupId"):
            raise ValueError(
                "Keep a candidate as the new baseline before preparing another change"
            )
        known = basis["fields"].get(request.parameter)
        if known and (
            known["unit"] != request.baseline.unit
            or abs(known["value"] - request.baseline.value) > 1e-6
        ):
            raise ValueError(
                "Use the same saved unit and value for A, or record a new baseline after changing them"
            )
        baseline = self.store.document(
            "setup",
            workflow_id,
            {
                "label": "A",
                "fields": {
                    **basis["fields"],
                    request.parameter: request.baseline.model_dump(),
                },
                "confirmationScope": "partial",
                "source": "game-confirmed",
                "baselineSetupId": None,
                "basisSetupId": basis["id"],
                "basisRunId": run["id"],
                "readbackTiming": "after-run-unchanged",
                "formulaVersion": basis.get("formulaVersion"),
            },
        )
        proposal = self.store.document(
            "feedback",
            workflow_id,
            {
                **request.model_dump(),
                "baselineSetupId": baseline["id"],
                "methodVersion": "offroad-exploration/v1",
                "evidenceLevel": "exploratory",
                "status": "draft",
            },
        )
        setting = {
            **request.baseline.model_dump(),
            "value": request.candidateValue,
            "source": "estimate",
        }
        candidate = self.store.document(
            "setup",
            workflow_id,
            {
                "label": "B",
                "fields": {**baseline["fields"], request.parameter: setting},
                "confirmationScope": "partial",
                "source": request.source,
                "baselineSetupId": baseline["id"],
                "feedbackId": proposal["id"],
                "targetParameter": request.parameter,
                "formulaVersion": None,
                "status": "draft",
            },
        )
        await asyncio.to_thread(
            self.store.append_documents, [baseline, proposal, candidate]
        )
        return candidate

    async def start_run(self, workflow_id: str, request: StartOffroadRun) -> dict:
        async with self.lock:
            if self.active:
                raise ValueError("Save the current Offroad run before starting another")
            workflow = await asyncio.to_thread(self.store.get, workflow_id, "workflow")
            setup = await asyncio.to_thread(
                self.store.get, request.setupId, "setup", workflow_id
            )
            if not self.live()["fresh"] or self.latest_identity != workflow["identity"]:
                raise ValueError(
                    "Fresh progressing telemetry from the selected car and configuration is required"
                )
            self.persistence.start()
            session_id = self.recorder.start_manual()
            try:
                run = await asyncio.to_thread(
                    self.store.append,
                    "run",
                    workflow_id,
                    {
                        **request.model_dump(),
                        "sessionId": session_id,
                        "identity": workflow["identity"],
                        "setupConfirmationScope": setup["confirmationScope"],
                        "event": workflow["event"],
                        "settingsSource": "game-confirmed",
                        "armedTimestamp": self.latest_timestamp,
                    },
                )
            except Exception:
                self.recorder.save_latest_and_clear("start-failed")
                raise
            self.active = {
                "id": run["id"],
                "workflowId": workflow_id,
                "sessionId": session_id,
                "identity": workflow["identity"],
                "armedSequence": self.sequence,
            }
            self.last_error = None
            return run

    async def stop(self, reason: str = "manual-stop") -> None:
        async with self.lock:
            if self.active:
                self.recorder.save_latest_and_clear(reason)
                await self._finish_active()

    async def maintain(self) -> None:
        self.recorder.tick()
        if self.active and not self.recorder.is_recording and not self.lock.locked():
            async with self.lock:
                try:
                    await self._finish_active()
                except Exception:
                    self.last_error = "The Offroad result could not be saved. Retry saving; captured data is retained."

    async def _finish_active(self):
        if not self.active:
            return
        await self.persistence.flush()
        active = self.active
        await asyncio.to_thread(
            self._summarize, active["id"], active["workflowId"], active["sessionId"]
        )
        self.active = None
        self.last_error = None

    def _summarize(self, run_id: str, workflow_id: str, session_id: str):
        if any(d["runId"] == run_id for d in self.store.list(workflow_id, "summary")):
            return
        points = self.database.get_telemetry_points(session_id)
        metadata = self.database.get_session_metadata(session_id)
        if metadata.get("state") != "finalized":
            self.database.finalize_session(
                session_id,
                {
                    **metadata,
                    "endReason": "application-interrupted",
                    "incompletePersistence": True,
                },
            )
            metadata = self.database.get_session_metadata(session_id)
        race_times = [
            p["CurrentRaceTime"]
            for p in points
            if finite(p.get("CurrentRaceTime")) and p.get("IsRaceOn") == 1
        ]
        return self.store.append(
            "summary",
            workflow_id,
            {
                "runId": run_id,
                "sessionId": session_id,
                "observations": summarize_offroad_observations(points),
                "recording": metadata,
                "raceTimeCoverage": {
                    "firstSeconds": race_times[0] if race_times else None,
                    "lastSeconds": race_times[-1] if race_times else None,
                },
                "sourceSchemas": sorted(
                    {p.get("sourceSchema", "unknown") for p in points}
                ),
            },
        )

    async def recover(self):
        self.persistence.start()
        documents = await asyncio.to_thread(self.store.list)
        completed = {d["runId"] for d in documents if d["kind"] == "summary"}
        for run in (
            d for d in documents if d["kind"] == "run" and d["id"] not in completed
        ):
            await asyncio.to_thread(
                self._summarize, run["id"], run["workflowId"], run["sessionId"]
            )

    async def shutdown(self):
        await self.stop("application-shutdown")
        await self.persistence.shutdown()
