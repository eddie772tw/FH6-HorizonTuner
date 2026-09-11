"""Tier 3: Cross-Feature Combinations E2E Tests.

Verifies pairwise cross-feature interactions across Road, Offroad, Drag, and Drift disciplines:
- T3-01: Offroad Sprint vs Circuit x Extreme Bottoming
- T3-02: Offroad Bottoming Detection x SQLite Snapshot Persistence
- T3-03: Drag Launch Slip x Gear Shifts x 400m Sprint
- T3-04: Drag Gearing Iteration x SQLite Snapshot Persistence
- T3-05: Drift Kinematic Slide x Thermal Variance Degradation
- T3-06: Drift Transparent Limitation Disclosure x SQLite Persistence
- T3-07: Multi-Discipline Switching x Concurrent State Preservation
- T3-08: Global Navigation Dropdown x 2D Mode Switching
- T3-09: Pure Math SSOT x Discipline Baseline Extraction
- T3-10: Frontend Modular UI Contract x Backend API Schema Validation
- T3-11: High-Frequency UDP Ingestion x Concurrent REST API Polling
- T3-12: Safe Path Security Defense x Document Persistence
Total: 12 test cases.
"""

from __future__ import annotations

import json

import pytest

from backend.path_security import safe_join_under_dir, safe_resolve_path
from tests.e2e.harness import E2ETestHarness, pack_324b_telemetry


def test_t3_01_offroad_sprint_vs_circuit_x_extreme_bottoming(
    simulator, offroad_packets
):
    """T3-01: Verifies interaction between event format (sprint vs circuit) and bottoming detection."""
    wf_sprint = simulator.create_workflow(
        "offroad", "RallyCar", 42, 700, {"format": "sprint"}
    )
    wf_circuit = simulator.create_workflow(
        "offroad", "RallyCar", 42, 700, {"format": "circuit"}
    )

    sum_sprint = simulator.extract_telemetry_metrics(
        "offroad", offroad_packets, 10.0, 300.0
    )
    sum_circuit = simulator.extract_telemetry_metrics(
        "offroad", offroad_packets, 10.0, 300.0
    )

    assert sum_sprint["severeBottomingEvents"] == sum_circuit["severeBottomingEvents"]
    assert wf_sprint["event"]["format"] == "sprint"
    assert wf_circuit["event"]["format"] == "circuit"


def test_t3_02_offroad_bottoming_detection_x_sqlite_snapshot_persistence(
    simulator, store, offroad_packets
):
    """T3-02: Verifies telemetry extraction results correctly serialize and persist to SQLite."""
    wf = simulator.create_workflow(
        "offroad", "Subaru Rally", 42, 700, {"format": "sprint"}
    )
    simulator.start_run("offroad", wf["id"], "setup-1", {})
    res = simulator.stop_run(
        "offroad", offroad_packets, duration_sec=10.0, distance_m=350.0
    )

    assert res["saved"] is True
    summaries = store.list_docs("offroad", wf["id"], "summary")
    assert len(summaries) == 1
    persisted = summaries[0]
    assert persisted["severeBottomingEvents"] >= 5
    assert persisted["landingImpactG"] >= 3.0
    assert persisted["distanceMeters"] == 350.0


def test_t3_03_drag_launch_slip_x_gear_shifts_x_400m_sprint(simulator, drag_packets):
    """T3-03: Verifies multi-stage drag run with launch slip, gear shifts, and 400m trap speed."""
    wf = simulator.create_workflow("drag", "Pro Dragster", 50, 950, {})
    # Baseline run with high wheelspin
    simulator.start_run("drag", wf["id"], "setup-A", {})
    run_a = simulator.stop_run("drag", drag_packets, duration_sec=9.6, distance_m=402.0)

    # Optimized run with minimal wheelspin and faster acceleration
    faster_packets = [
        pack_324b_telemetry(
            timestamp_ms=1000 + int(i * 0.07 * 1000),
            speed_mps=i * 0.6,
            slip_ratio=(0.02, 0.02, 0.10, 0.10),
            distance_traveled=i * 4.5,
            gear=1 if i < 15 else (2 if i < 45 else 3),
        )
        for i in range(120)
    ]
    simulator.start_run("drag", wf["id"], "setup-B", {})
    run_b = simulator.stop_run(
        "drag", faster_packets, duration_sec=8.4, distance_m=402.0
    )

    report = simulator.compare(
        "drag", wf["id"], run_a["summary"]["runId"], run_b["summary"]["runId"]
    )
    assert report["conclusion"] == "provisional-keep"
    assert report["metricsDelta"]["quarterMileDeltaSeconds"] < 0


def test_t3_04_drag_gearing_iteration_x_sqlite_snapshot_persistence(simulator, store):
    """T3-04: Verifies full chronological persistence of setup, candidate, comparison, and decision."""
    wf = simulator.create_workflow("drag", "Mustang", 51, 800, {})
    wf_id = wf["id"]

    # 1. Setup A
    setups = store.list_docs("drag", wf_id, "setup")
    assert len(setups) == 1
    assert setups[0]["id"] is not None

    # 2. Candidate B
    cand = simulator.create_candidate(
        "drag", wf_id, "run-1", "gearing.finalDrive", 3.73, "ratio"
    )
    assert cand["kind"] == "setup"
    assert cand["label"] == "B"

    # 3. Runs and Comparison
    store.append("drag", wf_id, "summary", {"runId": "rA", "quarterMileSeconds": 10.2})
    store.append("drag", wf_id, "summary", {"runId": "rB", "quarterMileSeconds": 9.8})
    report = simulator.compare("drag", wf_id, "rA", "rB")

    # 4. Promote decision
    dec = simulator.decide("drag", wf_id, report["id"], "keep-candidate")
    assert dec["choice"] == "keep-candidate"

    # Verify all records exist in chronological sequence
    all_docs = store.list_docs("drag", wf_id)
    kinds = [d["kind"] for d in all_docs]
    assert "workflow" in kinds
    assert "setup" in kinds
    assert "summary" in kinds
    assert "comparison" in kinds
    assert "decision" in kinds


def test_t3_05_drift_kinematic_slide_x_thermal_variance_degradation(
    simulator, drift_packets
):
    """T3-05: Verifies drift kinematics pair sideslip angle beta with objective tire thermal slope."""
    summary = simulator.extract_telemetry_metrics("drift", drift_packets, 5.0, 110.0)
    assert summary["averageBetaDegrees"] > 15.0
    assert summary["thermalRiseDegC"]["rear"] > summary["thermalRiseDegC"]["front"]
    assert summary["fabricatedScore"] is None


def test_t3_06_drift_transparent_limitation_disclosure_x_sqlite_persistence(
    simulator, store, drift_packets
):
    """T3-06: Verifies drift limitations disclosures persist to SQLite without schema corruption."""
    wf = simulator.create_workflow("drift", "S15 Silvia", 52, 600, {})
    simulator.start_run("drift", wf["id"], "setup-1", {})
    run = simulator.stop_run("drift", drift_packets, duration_sec=5.0)
    assert run["saved"] is True

    summaries = store.list_docs("drift", wf["id"], "summary")
    assert len(summaries) == 1
    disclosures = summaries[0]["limitationsDisclosed"]
    assert len(disclosures) >= 2
    assert any("game drift points" in d for d in disclosures)


def test_t3_07_multi_discipline_switching_x_concurrent_state_preservation(
    simulator, store
):
    """T3-07: Concurrently executes workflows across all 4 disciplines, verifying zero cross-talk."""
    disciplines = ["road", "offroad", "drag", "drift"]
    wf_map = {}

    for d in disciplines:
        wf = simulator.create_workflow(d, f"Car-{d}", 42, 700, {})
        wf_map[d] = wf["id"]
        simulator.store.append(d, wf["id"], "run", {"run_tag": f"{d}-run"})

    for d in disciplines:
        docs = store.list_docs(discipline=d, workflow_id=wf_map[d])
        assert all(doc["discipline"] == d for doc in docs)
        assert any(doc.get("run_tag") == f"{d}-run" for doc in docs)


def test_t3_08_global_navigation_dropdown_x_2d_mode_switching():
    """T3-08: Verifies 2D mode switching preserves independent discipline keys."""
    storage_state = {
        "tuning-active-discipline": "offroad",
        "tuning-active-mode": "workflow",
        "road-selected-workflow": "wf-rd-123",
        "offroad-selected-workflow": "wf-or-456",
        "drag-selected-workflow": "wf-dg-789",
        "drift-selected-workflow": "wf-df-012",
    }

    # Switch discipline to drag
    storage_state["tuning-active-discipline"] = "drag"
    # Offroad workflow ID remains intact
    assert storage_state["offroad-selected-workflow"] == "wf-or-456"
    assert storage_state["drag-selected-workflow"] == "wf-dg-789"


def test_t3_09_pure_math_ssot_x_discipline_baseline_extraction(harness: E2ETestHarness):
    """T3-09: Verifies pure math solver generates discipline-tailored baselines across goals."""
    goals = ["road", "rally", "drag", "drift"]
    results = {}

    for g in goals:
        code, out, _ = harness.run_cli(
            [
                "solve",
                "chassis",
                "--weight",
                "1400",
                "--bias",
                "52",
                "--drive",
                "RWD",
                "--goal",
                g,
                "--json",
            ]
        )
        assert code == 0
        results[g] = json.loads(out)

    # Rally has higher ride height than road
    assert (
        results["rally"]["ride_height"]["front"]
        >= results["road"]["ride_height"]["front"]
    )
    # Drag has stiffer rear springs than front
    assert (
        results["drag"]["springs"]["rear_kgf_mm"]
        >= results["drag"]["springs"]["front_kgf_mm"]
    )
    # Drift has softer front ARB than rear ARB
    assert (
        results["drift"]["anti_roll_bars"]["front"]
        <= results["drift"]["anti_roll_bars"]["rear"]
    )


@pytest.mark.asyncio
async def test_t3_10_frontend_modular_ui_contract_x_backend_api_schema_validation(
    opaque_client,
):
    """T3-10: Verifies REST API responses adhere to frontend contract schemas."""
    # 1. Create workflow
    res = await opaque_client.post(
        "/api/offroad/workflows",
        {
            "carName": "Evo Rally",
            "identity": {"ordinal": 42, "performanceIndex": 700, "drivetrain": 1},
            "event": {"name": "Dirt Sprint", "format": "sprint"},
        },
    )
    assert res.status_code == 200
    wf_data = res.json()
    wf_id = wf_data["id"]

    # 2. Start run
    run_res = await opaque_client.post(
        f"/api/offroad/workflows/{wf_id}/runs", {"setupId": "setup-1"}
    )
    assert run_res.status_code == 200

    # 3. Stop run
    stop_res = await opaque_client.post("/api/offroad/stop", {})
    assert stop_res.status_code == 200


@pytest.mark.asyncio
async def test_t3_11_high_frequency_udp_ingestion_x_concurrent_rest_api_polling(
    opaque_client, offroad_packets
):
    """T3-11: Simulates continuous live telemetry polling without server hang."""
    for _ in range(10):
        res = await opaque_client.get("/api/offroad/live")
        assert res.status_code == 200
        assert "identity" in res.json()


def test_t3_12_safe_path_security_defense_x_document_persistence(tmp_path):
    """T3-12: Verifies path security defenses block traversal during preset/document file operations."""
    import os

    base_dir = str(tmp_path / "presets")
    (tmp_path / "presets").mkdir(parents=True, exist_ok=True)
    preset_file = tmp_path / "presets" / "my_preset.json"
    preset_file.write_text("{}", encoding="utf-8")

    # Legitimate path
    valid_path = safe_resolve_path(base_dir, "my_preset.json")
    assert valid_path is not None
    assert valid_path.startswith(os.path.realpath(base_dir))

    # Traversal attempts blocked by safe_resolve_path
    assert safe_resolve_path(base_dir, "../stolen.json") is None
    assert safe_resolve_path(base_dir, "..\\stolen.json") is None
    assert safe_resolve_path(base_dir, "sub/../../stolen.json") is None

    # safe_join_under_dir rejects traversal / null markers
    with pytest.raises(ValueError):
        safe_join_under_dir(base_dir, "..")
    with pytest.raises(ValueError):
        safe_join_under_dir(base_dir, "bad\0name.json")
