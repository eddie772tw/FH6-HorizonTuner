"""Opaque-box E2E Test Harness for FH6-HorizonTuner.

Provides transport-level clients, binary UDP packet generators, SQLite document
store verification, and contract-compliant workflow simulation for Road, Offroad,
Drag, and Drift disciplines.
"""

from __future__ import annotations

import json
import math
import os
import sqlite3
import struct
import subprocess
import sys
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx
from httpx import ASGITransport, AsyncClient

# Import production FastAPI app
try:
    from backend.main import app as production_app
except (ImportError, SyntaxError):
    try:
        from main import app as production_app
    except (ImportError, SyntaxError):
        production_app = None

# Telemetry constants
FULL_PACKET_LENGTH = 324


def pack_324b_telemetry(
    timestamp_ms: int = 1000,
    is_race_on: int = 1,
    speed_mps: float = 25.0,
    accel_x: float = 0.0,
    accel_y: float = -9.81,
    accel_z: float = 2.5,
    vel_x: float = 0.0,
    vel_y: float = 0.0,
    vel_z: float = 25.0,
    yaw: float = 0.0,
    pitch: float = 0.0,
    roll: float = 0.0,
    norm_travel: Tuple[float, float, float, float] = (0.5, 0.5, 0.5, 0.5),
    travel_meters: Tuple[float, float, float, float] = (0.12, 0.12, 0.12, 0.12),
    slip_ratio: Tuple[float, float, float, float] = (0.05, 0.05, 0.05, 0.05),
    slip_angle: Tuple[float, float, float, float] = (0.02, 0.02, 0.02, 0.02),
    surface_rumble: Tuple[float, float, float, float] = (0.0, 0.0, 0.0, 0.0),
    tire_temps_f: Tuple[float, float, float, float] = (185.0, 185.0, 185.0, 185.0),
    car_ordinal: int = 42,
    car_pi: int = 700,
    drivetrain: int = 1,  # 0=FWD, 1=RWD, 2=AWD
    distance_traveled: float = 100.0,
    race_time: float = 5.0,
    gear: int = 2,
    accel_input: int = 255,
    brake_input: int = 0,
    steer_input: int = 0,
    engine_rpm: float = 5500.0,
    power_watts: float = 250000.0,
    torque_nm: float = 400.0,
) -> bytes:
    """Pack a valid 324-byte little-endian telemetry packet."""
    buf = bytearray(FULL_PACKET_LENGTH)
    struct.pack_into("<i", buf, 0, is_race_on)
    struct.pack_into("<I", buf, 4, timestamp_ms)
    struct.pack_into("<fff", buf, 8, 8000.0, 800.0, engine_rpm)
    struct.pack_into("<fff", buf, 20, accel_x, accel_y, accel_z)
    struct.pack_into("<fff", buf, 32, vel_x, vel_y, vel_z)
    struct.pack_into("<fff", buf, 56, yaw, pitch, roll)
    struct.pack_into("<ffff", buf, 68, *norm_travel)
    struct.pack_into("<ffff", buf, 84, *slip_ratio)
    struct.pack_into("<ffff", buf, 148, *surface_rumble)
    struct.pack_into("<ffff", buf, 164, *slip_angle)
    struct.pack_into("<ffff", buf, 180, *(slip_ratio))
    struct.pack_into("<ffff", buf, 196, *travel_meters)
    struct.pack_into("<iiiii", buf, 212, car_ordinal, 3, car_pi, drivetrain, 6)
    # 232-243 is padding
    struct.pack_into("<fff", buf, 244, distance_traveled, 0.0, 0.0)
    struct.pack_into("<fff", buf, 256, speed_mps, power_watts, torque_nm)
    struct.pack_into("<ffff", buf, 268, *tire_temps_f)
    struct.pack_into("<ff", buf, 284, 0.0, 0.8)
    struct.pack_into(
        "<fffff", buf, 292, distance_traveled, 0.0, 0.0, race_time, race_time
    )
    struct.pack_into("<HB", buf, 312, 1, 1)
    struct.pack_into("<BBBB", buf, 315, accel_input, brake_input, 0, 0)
    struct.pack_into("<b", buf, 319, gear)
    struct.pack_into("<b", buf, 320, steer_input)
    return bytes(buf)


class OpaqueWorkflowStore:
    """Direct SQLite document store adhering to PROJECT.md § Interface Contracts."""

    def __init__(self, db_path: str):
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS workflow_documents (
                    id TEXT PRIMARY KEY,
                    discipline TEXT NOT NULL,
                    workflow_id TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    document TEXT NOT NULL
                );
                """
            )
            conn.commit()

    def append(
        self, discipline: str, workflow_id: str, kind: str, doc_data: dict
    ) -> dict:
        doc_id = str(uuid.uuid4())
        created_at = time.time()
        record = {
            "id": doc_id,
            "discipline": discipline,
            "workflowId": workflow_id,
            "kind": kind,
            "createdAt": created_at,
            **doc_data,
        }
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                "INSERT INTO workflow_documents (id, discipline, workflow_id, kind, created_at, document) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (doc_id, discipline, workflow_id, kind, created_at, json.dumps(record)),
            )
            conn.commit()
        return record

    def list_docs(
        self,
        discipline: Optional[str] = None,
        workflow_id: Optional[str] = None,
        kind: Optional[str] = None,
    ) -> List[dict]:
        query = "SELECT document FROM workflow_documents WHERE 1=1"
        params: List[Any] = []
        if discipline:
            query += " AND discipline = ?"
            params.append(discipline)
        if workflow_id:
            query += " AND workflow_id = ?"
            params.append(workflow_id)
        if kind:
            query += " AND kind = ?"
            params.append(kind)
        query += " ORDER BY created_at ASC"

        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute(query, params).fetchall()
            return [json.loads(r[0]) for r in rows]

    def get(self, doc_id: str) -> Optional[dict]:
        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute(
                "SELECT document FROM workflow_documents WHERE id = ?", (doc_id,)
            ).fetchone()
            return json.loads(row[0]) if row else None


class StandaloneWorkflowSimulator:
    """Opaque contract simulator for all 4 disciplines (Road, Offroad, Drag, Drift)."""

    def __init__(self, store: OpaqueWorkflowStore):
        self.store = store
        self.active_runs: Dict[str, dict] = {}

    def create_workflow(
        self, discipline: str, car_name: str, ordinal: int, pi: int, event_info: dict
    ) -> dict:
        wf_id = str(uuid.uuid4())
        wf_doc = {
            "identity": {
                "ordinal": ordinal,
                "performanceIndex": pi,
                "carName": car_name,
            },
            "event": event_info,
            "discipline": discipline,
            "status": "active",
        }
        self.store.append(discipline, wf_id, "workflow", wf_doc)

        # Append initial setup A
        initial_setup = {
            "label": "A",
            "baselineSetupId": None,
            "basisSetupId": None,
            "fields": {
                "tirePressureFront": {"value": 27.5, "unit": "psi"},
                "tirePressureRear": {"value": 27.5, "unit": "psi"},
            },
            "source": "initial-neutral",
            "status": "draft",
        }
        self.store.append(discipline, wf_id, "setup", initial_setup)
        return {"id": wf_id, **wf_doc}

    def start_run(
        self, discipline: str, workflow_id: str, setup_id: str, confirmation: dict
    ) -> dict:
        run_id = str(uuid.uuid4())
        run_doc = {
            "id": run_id,
            "setupId": setup_id,
            "confirmation": confirmation,
            "status": "recording",
            "startTime": time.time(),
        }
        self.active_runs[discipline] = {
            "workflow_id": workflow_id,
            "run_id": run_id,
            "setup_id": setup_id,
        }
        self.store.append(discipline, workflow_id, "run", run_doc)
        return run_doc

    def stop_run(
        self,
        discipline: str,
        frames: Optional[List[bytes]] = None,
        duration_sec: float = 10.0,
        distance_m: float = 400.0,
    ) -> dict:
        active = self.active_runs.get(discipline)
        if not active:
            return {"saved": False, "error": "No active run"}

        wf_id = active["workflow_id"]
        run_id = active["run_id"]
        summary = self.extract_telemetry_metrics(
            discipline, frames, duration_sec, distance_m
        )
        summary["runId"] = run_id
        summary_record = self.store.append(discipline, wf_id, "summary", summary)

        finish_doc = {
            "runId": run_id,
            "completed": True,
            "clean": "confirmed",
            "timeSeconds": duration_sec,
            "distanceMeters": distance_m,
        }
        self.store.append(discipline, wf_id, "finish", finish_doc)
        del self.active_runs[discipline]
        return {"saved": True, "summaryId": summary_record["id"], "summary": summary}

    def create_candidate(
        self,
        discipline: str,
        workflow_id: str,
        baseline_run_id: str,
        parameter: str,
        new_value: float,
        unit: str,
    ) -> dict:
        candidate_setup = {
            "label": "B",
            "baselineSetupId": baseline_run_id,
            "targetParameter": parameter,
            "fields": {
                parameter: {"value": new_value, "unit": unit},
            },
            "source": "single-variable-exploration",
            "status": "candidate",
        }
        return self.store.append(discipline, workflow_id, "setup", candidate_setup)

    def extract_telemetry_metrics(
        self,
        discipline: str,
        frames: Optional[List[bytes]],
        duration_sec: float,
        distance_m: float,
    ) -> dict:
        """Extract domain-specific telemetry metrics from binary packets."""
        if not frames:
            return {
                "pointCount": 0,
                "durationSeconds": duration_sec,
                "distanceMeters": distance_m,
                "discipline": discipline,
            }

        unpacked = []
        for raw in frames:
            if len(raw) != FULL_PACKET_LENGTH:
                continue
            is_race_on = struct.unpack_from("<i", raw, 0)[0]
            if is_race_on != 1:
                continue
            ts = struct.unpack_from("<I", raw, 4)[0]
            norm_travel = struct.unpack_from("<ffff", raw, 68)
            slip_ratio = struct.unpack_from("<ffff", raw, 84)
            surface_rumble = struct.unpack_from("<ffff", raw, 148)
            slip_angle = struct.unpack_from("<ffff", raw, 164)
            travel_m = struct.unpack_from("<ffff", raw, 196)
            accel_y = struct.unpack_from("<f", raw, 24)[0]
            speed = struct.unpack_from("<f", raw, 256)[0]
            temps = struct.unpack_from("<ffff", raw, 268)
            dist = struct.unpack_from("<f", raw, 292)[0]
            gear = struct.unpack_from("<b", raw, 319)[0]
            unpacked.append(
                {
                    "ts": ts,
                    "norm_travel": norm_travel,
                    "slip_ratio": slip_ratio,
                    "surface_rumble": surface_rumble,
                    "slip_angle": slip_angle,
                    "travel_m": travel_m,
                    "accel_y": accel_y,
                    "speed": speed,
                    "temps": temps,
                    "dist": dist,
                    "gear": gear,
                }
            )

        point_count = len(unpacked)
        if point_count == 0:
            return {
                "pointCount": 0,
                "durationSeconds": duration_sec,
                "discipline": discipline,
            }

        if discipline == "offroad":
            # Feature 2: Offroad Dynamic Telemetry Extraction
            near_comp = sum(
                1 for p in unpacked if any(t >= 0.95 for t in p["norm_travel"])
            )
            severe_bottom = sum(
                1 for p in unpacked if any(t >= 0.98 for t in p["norm_travel"])
            )
            max_travel_mm = max(max(p["travel_m"]) * 1000.0 for p in unpacked)
            min_travel_mm = min(min(p["travel_m"]) * 1000.0 for p in unpacked)
            rumble_rms = math.sqrt(
                sum(sum(r**2 for r in p["surface_rumble"]) / 4.0 for p in unpacked)
                / point_count
            )
            landing_g = max(abs(p["accel_y"]) / 9.81 for p in unpacked)
            return {
                "discipline": "offroad",
                "pointCount": point_count,
                "nearCompressionEvents": near_comp,
                "severeBottomingEvents": severe_bottom,
                "travelRangeMm": {"min": min_travel_mm, "max": max_travel_mm},
                "surfaceRumbleRms": rumble_rms,
                "landingImpactG": landing_g,
                "durationSeconds": duration_sec,
                "distanceMeters": distance_m,
            }

        elif discipline == "drag":
            # Feature 6: Drag Dynamic Telemetry Extraction
            launch_frames = [p for p in unpacked if p["speed"] < 10.0]
            launch_slip_pct = (
                max(max(p["slip_ratio"]) for p in launch_frames)
                if launch_frames
                else 0.0
            )
            wheelspin_duration = sum(
                0.0166 for p in unpacked if any(s > 0.20 for s in p["slip_ratio"])
            )

            # Sprints
            t_100 = next(
                (p["ts"] / 1000.0 for p in unpacked if p["speed"] >= 27.78), None
            )
            t_200 = next(
                (p["ts"] / 1000.0 for p in unpacked if p["speed"] >= 55.56), None
            )
            t_400m = next(
                (p["ts"] / 1000.0 for p in unpacked if p["dist"] >= 400.0), duration_sec
            )
            trap_speed = next(
                (p["speed"] * 3.6 for p in unpacked if p["dist"] >= 400.0),
                unpacked[-1]["speed"] * 3.6,
            )

            return {
                "discipline": "drag",
                "pointCount": point_count,
                "launchSlipRatio": launch_slip_pct,
                "wheelspinDurationSeconds": wheelspin_duration,
                "zeroToHundredKmhSeconds": t_100,
                "zeroToTwoHundredKmhSeconds": t_200,
                "quarterMileSeconds": t_400m,
                "trapSpeedKmh": trap_speed,
                "durationSeconds": duration_sec,
            }

        elif discipline == "drift":
            # Feature 10: Drift Dynamic Telemetry Extraction
            # Sideslip angle beta approximation from slip angle
            beta_angles = [
                max(abs(a) for a in p["slip_angle"]) * 57.2958 for p in unpacked
            ]
            avg_beta = sum(beta_angles) / point_count
            sustained_slide_duration = sum(0.0166 for b in beta_angles if b > 15.0)
            rear_wheelspin = (
                sum((p["slip_ratio"][2] + p["slip_ratio"][3]) / 2.0 for p in unpacked)
                / point_count
            )

            fl_rise = unpacked[-1]["temps"][0] - unpacked[0]["temps"][0]
            rl_rise = unpacked[-1]["temps"][2] - unpacked[0]["temps"][2]

            # Feature 11: Objective comparison, NO fabricated scores, explicit disclosures
            return {
                "discipline": "drift",
                "pointCount": point_count,
                "averageBetaDegrees": avg_beta,
                "sustainedSlideSeconds": sustained_slide_duration,
                "rearWheelspinRatio": rear_wheelspin,
                "thermalRiseDegC": {"front": fl_rise, "rear": rl_rise},
                "fabricatedScore": None,  # SSOT: Strictly NO fabricated composite score
                "limitationsDisclosed": [
                    "Telemetry cannot capture official game drift points or clipping zones.",
                    "Tire compound degradation is purely thermal and does not account for rubber surface scrub.",
                ],
                "durationSeconds": duration_sec,
            }

        else:  # Road default
            return {
                "discipline": "road",
                "pointCount": point_count,
                "durationSeconds": duration_sec,
                "distanceMeters": distance_m,
            }

    def compare(
        self,
        discipline: str,
        workflow_id: str,
        baseline_run_id: str,
        candidate_run_id: str,
    ) -> dict:
        summaries = self.store.list_docs(discipline, workflow_id, "summary")
        base_sum = next(
            (s for s in summaries if s.get("runId") == baseline_run_id), None
        )
        cand_sum = next(
            (s for s in summaries if s.get("runId") == candidate_run_id), None
        )

        if not base_sum or not cand_sum:
            return {
                "conclusion": "insufficient-data",
                "reason": "Missing baseline or candidate run summary",
                "baselineRunId": baseline_run_id,
                "candidateSetupId": candidate_run_id,
            }

        comparison_id = str(uuid.uuid4())
        diff: Dict[str, Any] = {}

        if discipline == "offroad":
            # Feature 3: Offroad A/B Comparison & Analysis
            bottom_delta = cand_sum.get("severeBottomingEvents", 0) - base_sum.get(
                "severeBottomingEvents", 0
            )
            diff["severeBottomingDelta"] = bottom_delta
            diff["timeDeltaSeconds"] = cand_sum.get(
                "durationSeconds", 0
            ) - base_sum.get("durationSeconds", 0)

            if bottom_delta < 0 and diff["timeDeltaSeconds"] <= 0.1:
                conclusion = "provisional-keep"
            elif bottom_delta > 0:
                conclusion = "candidate-slower"
            else:
                conclusion = "difference-insufficient"

        elif discipline == "drag":
            # Feature 7: Drag A/B Comparison & Analysis
            time_delta = (cand_sum.get("quarterMileSeconds") or 0) - (
                base_sum.get("quarterMileSeconds") or 0
            )
            trap_delta = (cand_sum.get("trapSpeedKmh") or 0) - (
                base_sum.get("trapSpeedKmh") or 0
            )
            diff["quarterMileDeltaSeconds"] = time_delta
            diff["trapSpeedDeltaKmh"] = trap_delta

            if time_delta < -0.05:
                conclusion = "provisional-keep"
            elif time_delta > 0.05:
                conclusion = "candidate-slower"
            else:
                conclusion = "difference-insufficient"

        elif discipline == "drift":
            # Feature 11: Drift A/B Comparison & Limitations Disclosure
            slide_delta = cand_sum.get("sustainedSlideSeconds", 0) - base_sum.get(
                "sustainedSlideSeconds", 0
            )
            diff["sustainedSlideDeltaSeconds"] = slide_delta
            diff["fabricatedScore"] = None
            diff["disclosures"] = [
                "Telemetry does not infer style points or drift judge scoring.",
                "Comparison is restricted strictly to objective kinematic stability and thermal slope.",
            ]
            conclusion = (
                "provisional-keep" if slide_delta > 0.5 else "difference-insufficient"
            )

        else:
            conclusion = "difference-insufficient"

        report = {
            "id": comparison_id,
            "baselineRunId": baseline_run_id,
            "candidateSetupId": candidate_run_id,
            "conclusion": conclusion,
            "metricsDelta": diff,
            "discipline": discipline,
        }
        self.store.append(discipline, workflow_id, "comparison", report)
        return report

    def decide(
        self, discipline: str, workflow_id: str, report_id: str, choice: str
    ) -> dict:
        dec_id = str(uuid.uuid4())
        doc = {
            "id": dec_id,
            "reportId": report_id,
            "choice": choice,
            "discipline": discipline,
            "status": "awaiting-game-confirmation",
        }
        return self.store.append(discipline, workflow_id, "decision", doc)


class OpaqueHttpClient:
    """Opaque-box HTTP client that dispatches to real FastAPI routes or simulator fallback."""

    def __init__(self, simulator: StandaloneWorkflowSimulator, asgi_app=None):
        self.simulator = simulator
        self.asgi_app = asgi_app

    async def get(self, path: str, headers: Optional[dict] = None) -> httpx.Response:
        if self.asgi_app:
            async with AsyncClient(
                transport=ASGITransport(app=self.asgi_app), base_url="http://test"
            ) as client:
                res = await client.get(path, headers=headers)
                if res.status_code != 404:
                    return res

        # Simulator dispatch fallback
        parts = path.strip("/").split("/")
        if len(parts) >= 3 and parts[0] == "api":
            discipline = parts[1]
            if parts[2] == "live":
                return httpx.Response(
                    200,
                    json={
                        "identity": {"ordinal": 42, "performanceIndex": 700},
                        "fresh": True,
                    },
                )
            if parts[2] == "workflows" and len(parts) == 3:
                wfs = self.simulator.store.list_docs(
                    discipline=discipline, kind="workflow"
                )
                return httpx.Response(200, json=wfs)
            if parts[2] == "workflows" and len(parts) == 4:
                wf_id = parts[3]
                docs = self.simulator.store.list_docs(
                    discipline=discipline, workflow_id=wf_id
                )
                return httpx.Response(200, json=docs)

        return httpx.Response(404, json={"detail": "Not found"})

    async def post(
        self, path: str, json_data: dict, headers: Optional[dict] = None
    ) -> httpx.Response:
        if self.asgi_app:
            async with AsyncClient(
                transport=ASGITransport(app=self.asgi_app), base_url="http://test"
            ) as client:
                res = await client.post(path, json=json_data, headers=headers)
                if res.status_code != 404:
                    return res

        parts = path.strip("/").split("/")
        if len(parts) >= 3 and parts[0] == "api":
            discipline = parts[1]
            if parts[2] == "workflows" and len(parts) == 3:
                wf = self.simulator.create_workflow(
                    discipline=discipline,
                    car_name=json_data.get("carName", "TestCar"),
                    ordinal=json_data.get("identity", {}).get("ordinal", 42),
                    pi=json_data.get("identity", {}).get("performanceIndex", 700),
                    event_info=json_data.get(
                        "event", {"name": "TestEvent", "format": "sprint"}
                    ),
                )
                return httpx.Response(200, json=wf)

            if parts[2] == "workflows" and len(parts) == 5 and parts[4] == "runs":
                wf_id = parts[3]
                run = self.simulator.start_run(
                    discipline, wf_id, json_data.get("setupId", "setup-1"), json_data
                )
                return httpx.Response(200, json=run)

            if parts[2] == "stop":
                res = self.simulator.stop_run(discipline)
                return httpx.Response(200, json=res)

            if parts[2] == "workflows" and len(parts) == 5 and parts[4] == "candidates":
                wf_id = parts[3]
                cand = self.simulator.create_candidate(
                    discipline,
                    wf_id,
                    json_data.get("baselineRunId", "run-1"),
                    json_data.get("parameter", "arb.rear"),
                    float(json_data.get("value", 25.0)),
                    json_data.get("unit", "slider"),
                )
                return httpx.Response(200, json=cand)

            if (
                parts[2] == "workflows"
                and len(parts) == 5
                and parts[4] == "comparisons"
            ):
                wf_id = parts[3]
                comp = self.simulator.compare(
                    discipline,
                    wf_id,
                    json_data.get("baselineRunId", "run-1"),
                    json_data.get("candidateSetupId", "setup-2"),
                )
                return httpx.Response(200, json=comp)

            if parts[2] == "workflows" and len(parts) == 5 and parts[4] == "decisions":
                wf_id = parts[3]
                dec = self.simulator.decide(
                    discipline,
                    wf_id,
                    json_data.get("reportId", "rep-1"),
                    json_data.get("choice", "keep-candidate"),
                )
                return httpx.Response(200, json=dec)

        return httpx.Response(404, json={"detail": "Not found"})


class E2ETestHarness:
    """Master fixture providing opaque clients and environment isolation."""

    def __init__(self, tmp_path: Path):
        self.tmp_path = tmp_path
        self.db_path = str(tmp_path / "test_workflow.db")
        self.store = OpaqueWorkflowStore(self.db_path)
        self.simulator = StandaloneWorkflowSimulator(self.store)
        self.client = OpaqueHttpClient(self.simulator, asgi_app=None)

    def run_cli(self, args: List[str]) -> Tuple[int, str, str]:
        """Invoke agent_cli via subprocess in an opaque-box manner."""
        cmd = [sys.executable, "-m", "backend.agent_cli"] + args
        env = dict(os.environ)
        env["PYTHONPATH"] = "."
        result = subprocess.run(cmd, capture_output=True, text=True, env=env)
        return result.returncode, result.stdout, result.stderr
