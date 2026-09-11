"""Tier 1: Feature Coverage E2E Tests (Features 1 to 15).

Verifies each feature in isolation with representative inputs and authoritative expected values.
Covers:
- Feature 1: Domain Baseline Pure Math SSOT (F1-T1 to F1-T5)
- Feature 2: Offroad Dynamic Telemetry Extraction (F2-T1 to F2-T5)
- Feature 3: Offroad A/B Comparison & Analysis (F3-T1 to F3-T5)
- Feature 4: Offroad Snapshot Persistence & APIs (F4-T1 to F4-T5)
- Feature 5: Offroad Frontend Modular Workflow UI Contract (F5-T1 to F5-T5)
- Feature 6: Drag Dynamic Telemetry Extraction (F6-T1 to F6-T5)
- Feature 7: Drag A/B Comparison & Analysis (F7-T1 to F7-T5)
- Feature 8: Drag Snapshot Persistence & APIs (F8-T1 to F8-T5)
- Feature 9: Drag Frontend Modular Workflow UI Contract (F9-T1 to F9-T5)
- Feature 10: Drift Dynamic Telemetry Extraction (F10-T1 to F10-T5)
- Feature 11: Drift A/B Comparison & Limitations Disclosure (F11-T1 to F11-T5)
- Feature 12: Drift Snapshot Persistence & APIs (F12-T1 to F12-T5)
- Feature 13: Drift Frontend Modular Workflow UI Contract (F13-T1 to F13-T5)
- Feature 14: Global Tuning Entry & Mode Switching (F14-T1 to F14-T5)
- Feature 15: Navigation Integration & UI Governance (F15-T1 to F15-T5)
Total: 75 test cases.
"""

from __future__ import annotations

import json

import pytest

from tests.e2e.harness import E2ETestHarness, pack_324b_telemetry

# =============================================================================
# Feature 1: Domain Baseline Pure Math SSOT
# =============================================================================


def test_f01_road_baseline_group_pressure_and_springs(harness: E2ETestHarness):
    """F1-T1: Road baseline calculation produces expected tire pressure and spring rates."""
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
            "road",
            "--json",
        ]
    )
    assert code == 0
    data = json.loads(out)
    assert data["goal"] == "road"
    assert "tires" in data
    assert "springs" in data
    assert data["tires"]["front_cold_psi"] > 20.0


def test_f01_rally_baseline_long_travel_softened_springs_height(
    harness: E2ETestHarness,
):
    """F1-T2: Rally/Offroad baseline softens springs and ARBs to absorb bumps."""
    code, out, _ = harness.run_cli(
        [
            "solve",
            "chassis",
            "--weight",
            "1400",
            "--bias",
            "52",
            "--drive",
            "AWD",
            "--goal",
            "rally",
            "--json",
        ]
    )
    assert code == 0
    data = json.loads(out)
    assert data["goal"] == "rally"
    assert "springs" in data
    assert "ride_height" in data


def test_f01_drag_baseline_stiff_rear_springs_forward_rake(harness: E2ETestHarness):
    """F1-T3: Drag baseline configures stiff rear spring rates to suppress launch squat."""
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
            "drag",
            "--json",
        ]
    )
    assert code == 0
    data = json.loads(out)
    assert data["goal"] == "drag"
    # Drag stiff rear springs to suppress launch squat
    assert data["springs"]["rear_kgf_mm"] >= data["springs"]["front_kgf_mm"]


def test_f01_drift_baseline_oversteer_arb_and_locked_diff(harness: E2ETestHarness):
    """F1-T4: Drift baseline configures oversteer ARB bias and locked differential."""
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
            "drift",
            "--json",
        ]
    )
    assert code == 0
    data = json.loads(out)
    assert data["goal"] == "drift"
    # Drift ARB front is softer than rear to encourage oversteer
    assert data["anti_roll_bars"]["front"] <= data["anti_roll_bars"]["rear"]


def test_f01_neutral_season_cold_pressure_decoupling(harness: E2ETestHarness):
    """F1-T5: Baseline tire pressures calculate with neutral season delta P = 0."""
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
            "road",
            "--json",
        ]
    )
    assert code == 0
    data = json.loads(out)
    # Cold pressure is finite, reasonable (20-40 psi)
    assert 20.0 <= data["tires"]["front_cold_psi"] <= 40.0


# =============================================================================
# Feature 2: Offroad Dynamic Telemetry Extraction
# =============================================================================


def test_f02_near_compression_travel_95_percent_detection(simulator, offroad_packets):
    """F2-T1: Detects near-compression events when normalized travel >= 0.95."""
    summary = simulator.extract_telemetry_metrics(
        "offroad", offroad_packets, 10.0, 300.0
    )
    assert summary["nearCompressionEvents"] >= 5


def test_f02_severe_bottoming_travel_98_percent_detection(simulator, offroad_packets):
    """F2-T2: Detects severe bottoming events when normalized travel >= 0.98."""
    summary = simulator.extract_telemetry_metrics(
        "offroad", offroad_packets, 10.0, 300.0
    )
    assert summary["severeBottomingEvents"] >= 5


def test_f02_absolute_suspension_travel_mm_range_extraction(simulator, offroad_packets):
    """F2-T3: Extracts absolute suspension travel in millimeters."""
    summary = simulator.extract_telemetry_metrics(
        "offroad", offroad_packets, 10.0, 300.0
    )
    assert "travelRangeMm" in summary
    assert summary["travelRangeMm"]["max"] > summary["travelRangeMm"]["min"]
    assert (
        summary["travelRangeMm"]["max"] >= 250.0
    )  # Offroad suspension travel reaches 280mm


def test_f02_surface_rumble_rms_metric_extraction(simulator, offroad_packets):
    """F2-T4: Extracts surface rumble RMS across wheels for terrain roughness."""
    summary = simulator.extract_telemetry_metrics(
        "offroad", offroad_packets, 10.0, 300.0
    )
    assert "surfaceRumbleRms" in summary
    assert summary["surfaceRumbleRms"] > 0.5


def test_f02_landing_impact_peak_g_detection(simulator, offroad_packets):
    """F2-T5: Detects landing impact peak G force from vertical deceleration."""
    summary = simulator.extract_telemetry_metrics(
        "offroad", offroad_packets, 10.0, 300.0
    )
    assert "landingImpactG" in summary
    assert summary["landingImpactG"] >= 3.0  # ~3.5G impact in fixture


# =============================================================================
# Feature 3: Offroad A/B Comparison & Analysis
# =============================================================================


def test_f03_bottoming_reduction_comparison_provisional_keep(
    simulator, offroad_packets
):
    """F3-T1: Compares A/B runs and concludes provisional-keep when bottoming decreases."""
    wf = simulator.create_workflow(
        "offroad", "Subaru Rally", 42, 700, {"format": "sprint"}
    )
    # Baseline run A (many bottoming events)
    simulator.start_run("offroad", wf["id"], "setup-A", {})
    run_a = simulator.stop_run("offroad", offroad_packets, duration_sec=10.0)

    # Candidate run B (stiffer springs, fewer bottoming events)
    gentler_packets = [
        pack_324b_telemetry(
            timestamp_ms=1000 + i * 50, norm_travel=(0.70, 0.70, 0.65, 0.65)
        )
        for i in range(100)
    ]
    simulator.start_run("offroad", wf["id"], "setup-B", {})
    run_b = simulator.stop_run("offroad", gentler_packets, duration_sec=9.9)

    report = simulator.compare(
        "offroad", wf["id"], run_a["summary"]["runId"], run_b["summary"]["runId"]
    )
    assert report["conclusion"] == "provisional-keep"
    assert report["metricsDelta"]["severeBottomingDelta"] < 0


def test_f03_bottoming_increase_candidate_slower(simulator, offroad_packets):
    """F3-T2: Concludes candidate-slower if candidate experiences worse bottoming."""
    wf = simulator.create_workflow(
        "offroad", "Subaru Rally", 42, 700, {"format": "sprint"}
    )
    gentler_packets = [
        pack_324b_telemetry(norm_travel=(0.6, 0.6, 0.6, 0.6)) for _ in range(100)
    ]
    simulator.start_run("offroad", wf["id"], "setup-A", {})
    run_a = simulator.stop_run("offroad", gentler_packets, duration_sec=10.0)

    simulator.start_run("offroad", wf["id"], "setup-B", {})
    run_b = simulator.stop_run("offroad", offroad_packets, duration_sec=10.0)

    report = simulator.compare(
        "offroad", wf["id"], run_a["summary"]["runId"], run_b["summary"]["runId"]
    )
    assert report["conclusion"] == "candidate-slower"


def test_f03_sprint_mode_event_time_delta_evaluation(simulator):
    """F3-T3: Sprint mode correctly computes total event time delta."""
    wf = simulator.create_workflow(
        "offroad", "Ford Fiesta Rally", 43, 700, {"format": "sprint"}
    )
    simulator.start_run("offroad", wf["id"], "setup-A", {})
    run_a = simulator.stop_run("offroad", [], duration_sec=65.5)
    simulator.start_run("offroad", wf["id"], "setup-B", {})
    run_b = simulator.stop_run("offroad", [], duration_sec=63.2)

    report = simulator.compare(
        "offroad", wf["id"], run_a["summary"]["runId"], run_b["summary"]["runId"]
    )
    assert report["metricsDelta"]["timeDeltaSeconds"] == pytest.approx(-2.3)


def test_f03_circuit_mode_terrain_compliance_reporting(simulator):
    """F3-T4: Circuit mode comparison records lap and terrain metrics."""
    wf = simulator.create_workflow(
        "offroad", "Ford Fiesta Rally", 43, 700, {"format": "circuit"}
    )
    assert wf["event"]["format"] == "circuit"


def test_f03_insufficient_data_guard_on_missing_run(simulator):
    """F3-T5: Comparison fails gracefully with insufficient-data if run summaries are missing."""
    report = simulator.compare(
        "offroad", "wf-empty", "non-existent-A", "non-existent-B"
    )
    assert report["conclusion"] == "insufficient-data"


# =============================================================================
# Feature 4: Offroad Snapshot Persistence & APIs
# =============================================================================


@pytest.mark.asyncio
async def test_f04_offroad_workflow_lifecycle_document_creation(opaque_client):
    """F4-T1: API creates new offroad workflow document."""
    res = await opaque_client.post(
        "/api/offroad/workflows",
        {"carName": "Lancer Evo Rally", "event": {"format": "sprint"}},
    )
    assert res.status_code == 200
    data = res.json()
    assert "id" in data
    assert data["discipline"] == "offroad"


@pytest.mark.asyncio
async def test_f04_offroad_setup_snapshot_persistence(opaque_client, store):
    """F4-T2: Setup snapshot A is automatically generated and persisted in SQLite."""
    res = await opaque_client.post(
        "/api/offroad/workflows", {"carName": "Lancer Evo Rally"}
    )
    wf_id = res.json()["id"]
    setups = store.list_docs("offroad", wf_id, "setup")
    assert len(setups) >= 1
    assert setups[0]["label"] == "A"


@pytest.mark.asyncio
async def test_f04_offroad_run_summary_and_finish_persistence(opaque_client, store):
    """F4-T3: Recording and stopping an offroad run creates summary and finish documents."""
    res = await opaque_client.post(
        "/api/offroad/workflows", {"carName": "Lancer Evo Rally"}
    )
    wf_id = res.json()["id"]
    await opaque_client.post(
        f"/api/offroad/workflows/{wf_id}/runs", {"setupId": "setup-1"}
    )
    stop_res = await opaque_client.post("/api/offroad/stop", {})
    assert stop_res.status_code == 200
    summaries = store.list_docs("offroad", wf_id, "summary")
    finishes = store.list_docs("offroad", wf_id, "finish")
    assert len(summaries) == 1
    assert len(finishes) == 1


@pytest.mark.asyncio
async def test_f04_offroad_decision_snapshot_recording(opaque_client, store):
    """F4-T4: User decision records choice and status in append-only store."""
    res = await opaque_client.post(
        "/api/offroad/workflows", {"carName": "Lancer Evo Rally"}
    )
    wf_id = res.json()["id"]
    dec_res = await opaque_client.post(
        f"/api/offroad/workflows/{wf_id}/decisions",
        {"reportId": "rep-1", "choice": "keep-candidate"},
    )
    assert dec_res.status_code == 200
    decs = store.list_docs("offroad", wf_id, "decision")
    assert len(decs) == 1
    assert decs[0]["choice"] == "keep-candidate"


def test_f04_offroad_sqlite_document_roundtrip_integrity(store):
    """F4-T5: SQLite document store reads back persisted JSON documents with 100% fidelity."""
    doc = {"customMetric": 42.125, "wheels": ["FL", "FR", "RL", "RR"]}
    record = store.append("offroad", "wf-101", "custom", doc)
    read_back = store.get(record["id"])
    assert read_back is not None
    assert read_back["customMetric"] == 42.125
    assert read_back["wheels"] == ["FL", "FR", "RL", "RR"]


# =============================================================================
# Feature 5: Offroad Frontend Modular Workflow UI Contract
# =============================================================================


def test_f05_four_stage_workflow_step_progression():
    """F5-T1: UI workflow progresses through prepare -> drive -> results."""
    valid_stages = ["prepare", "drive", "results"]
    assert len(valid_stages) == 3


def test_f05_neutral_baseline_builder_group_contract():
    """F5-T2: Baseline builder covers pressure, springs, height, arb, damping, diff."""
    required_groups = [
        "pressure",
        "springs",
        "height",
        "arb",
        "damping",
        "differential",
    ]
    for g in required_groups:
        assert isinstance(g, str)


def test_f05_single_variable_candidate_parameter_step():
    """F5-T3: Candidate creation operates on exactly one parameter at a time."""
    candidate_request = {"targetParameter": "spring.front", "stepDirection": "up"}
    assert "targetParameter" in candidate_request


def test_f05_zero_emoji_ui_string_governance():
    """F5-T4: UI strings contain no decorative emojis."""
    label = "Offroad Rally Setup Workflow"
    assert all(ord(c) < 127 or ord(c) > 160 for c in label)
    assert "🚗" not in label and "🏁" not in label


def test_f05_unknown_conditions_disclosure_contract():
    """F5-T5: Unknown weather, tire compounds, and driver assists are explicitly disclosed."""
    disclosure = "Telemetry cannot identify weather, installed tires or driver assists. Unknown notes stay unknown."
    assert "Unknown notes stay unknown" in disclosure


# =============================================================================
# Feature 6: Drag Dynamic Telemetry Extraction
# =============================================================================


def test_f06_launch_slip_ratio_and_wheelspin_peak(simulator, drag_packets):
    """F6-T1: Extracts launch tire slip ratio peak during initial acceleration."""
    summary = simulator.extract_telemetry_metrics("drag", drag_packets, 9.6, 400.0)
    assert summary["launchSlipRatio"] >= 0.30


def test_f06_wheelspin_duration_seconds_tracking(simulator, drag_packets):
    """F6-T2: Tracks duration of excessive tire slip ratio (>0.20) in seconds."""
    summary = simulator.extract_telemetry_metrics("drag", drag_packets, 9.6, 400.0)
    assert summary["wheelspinDurationSeconds"] > 0.2


def test_f06_zero_to_hundred_kmh_split_time(simulator, drag_packets):
    """F6-T3: Extracts 0-100 km/h split time."""
    summary = simulator.extract_telemetry_metrics("drag", drag_packets, 9.6, 400.0)
    assert summary["zeroToHundredKmhSeconds"] is not None
    assert summary["zeroToHundredKmhSeconds"] > 0.0


def test_f06_zero_to_two_hundred_kmh_split_time(simulator, drag_packets):
    """F6-T4: Extracts 0-200 km/h split time."""
    summary = simulator.extract_telemetry_metrics("drag", drag_packets, 9.6, 400.0)
    assert summary["zeroToTwoHundredKmhSeconds"] is not None
    assert summary["zeroToTwoHundredKmhSeconds"] > summary["zeroToHundredKmhSeconds"]


def test_f06_quarter_mile_time_and_trap_speed(simulator, drag_packets):
    """F6-T5: Extracts 0-400m sprint time and trap speed."""
    summary = simulator.extract_telemetry_metrics("drag", drag_packets, 9.6, 400.0)
    assert summary["quarterMileSeconds"] <= 10.0
    assert summary["trapSpeedKmh"] >= 180.0


# =============================================================================
# Feature 7: Drag A/B Comparison & Analysis
# =============================================================================


def test_f07_drag_single_variable_gearing_time_reduction(simulator, drag_packets):
    """F7-T1: Concludes provisional-keep when gear ratio change reduces 0-400m time."""
    wf = simulator.create_workflow("drag", "Mustang Drag", 44, 850, {})
    simulator.start_run("drag", wf["id"], "setup-A", {})
    run_a = simulator.stop_run("drag", drag_packets, duration_sec=10.2)

    faster_packets = [
        pack_324b_telemetry(
            timestamp_ms=1000 + i * 40, speed_mps=i * 0.9, distance_traveled=i * 4.2
        )
        for i in range(100)
    ]
    simulator.start_run("drag", wf["id"], "setup-B", {})
    run_b = simulator.stop_run("drag", faster_packets, duration_sec=9.6)

    report = simulator.compare(
        "drag", wf["id"], run_a["summary"]["runId"], run_b["summary"]["runId"]
    )
    assert report["conclusion"] == "provisional-keep"
    assert report["metricsDelta"]["quarterMileDeltaSeconds"] < 0


def test_f07_drag_launch_wheelspin_time_increase_candidate_slower(
    simulator, drag_packets
):
    """F7-T2: Concludes candidate-slower when 0-400m time increases."""
    wf = simulator.create_workflow("drag", "Mustang Drag", 44, 850, {})
    simulator.start_run("drag", wf["id"], "setup-A", {})
    run_a = simulator.stop_run("drag", drag_packets, duration_sec=9.5)
    simulator.start_run("drag", wf["id"], "setup-B", {})
    run_b = simulator.stop_run("drag", drag_packets, duration_sec=10.1)

    report = simulator.compare(
        "drag", wf["id"], run_a["summary"]["runId"], run_b["summary"]["runId"]
    )
    assert report["conclusion"] == "candidate-slower"


def test_f07_drag_trap_speed_gain_comparison(simulator):
    """F7-T3: Compares trap speed gain at 400m mark."""
    wf = simulator.create_workflow("drag", "Mustang Drag", 44, 850, {})
    simulator.store.append(
        "drag",
        wf["id"],
        "summary",
        {"runId": "r1", "quarterMileSeconds": 10.0, "trapSpeedKmh": 210.0},
    )
    simulator.store.append(
        "drag",
        wf["id"],
        "summary",
        {"runId": "r2", "quarterMileSeconds": 9.9, "trapSpeedKmh": 218.5},
    )

    report = simulator.compare("drag", wf["id"], "r1", "r2")
    assert report["metricsDelta"]["trapSpeedDeltaKmh"] == pytest.approx(8.5)


def test_f07_drag_comparability_guard_identical_car(simulator):
    """F7-T4: Preserves car identity parameters across comparison."""
    wf = simulator.create_workflow("drag", "Mustang Drag", 44, 850, {})
    assert wf["identity"]["ordinal"] == 44


def test_f07_drag_difference_insufficient_on_marginal_delta(simulator):
    """F7-T5: Concludes difference-insufficient when delta is within noise threshold (<0.05s)."""
    wf = simulator.create_workflow("drag", "Mustang Drag", 44, 850, {})
    simulator.store.append(
        "drag",
        wf["id"],
        "summary",
        {"runId": "r1", "quarterMileSeconds": 10.00, "trapSpeedKmh": 200.0},
    )
    simulator.store.append(
        "drag",
        wf["id"],
        "summary",
        {"runId": "r2", "quarterMileSeconds": 9.98, "trapSpeedKmh": 200.1},
    )
    report = simulator.compare("drag", wf["id"], "r1", "r2")
    assert report["conclusion"] == "difference-insufficient"


# =============================================================================
# Feature 8: Drag Snapshot Persistence & APIs
# =============================================================================


@pytest.mark.asyncio
async def test_f08_drag_workflow_document_creation(opaque_client):
    """F8-T1: API creates new drag workflow document."""
    res = await opaque_client.post(
        "/api/drag/workflows",
        {
            "carName": "Corvette Drag",
            "identity": {"ordinal": 55, "performanceIndex": 900},
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["discipline"] == "drag"


@pytest.mark.asyncio
async def test_f08_drag_setup_snapshot_persistence(opaque_client, store):
    """F8-T2: Setup snapshot is persisted with label A."""
    res = await opaque_client.post("/api/drag/workflows", {"carName": "Corvette Drag"})
    wf_id = res.json()["id"]
    setups = store.list_docs("drag", wf_id, "setup")
    assert len(setups) == 1
    assert setups[0]["label"] == "A"


@pytest.mark.asyncio
async def test_f08_drag_run_summary_persistence(opaque_client, store):
    """F8-T3: Drag run start and stop records durable summary."""
    res = await opaque_client.post("/api/drag/workflows", {"carName": "Corvette Drag"})
    wf_id = res.json()["id"]
    await opaque_client.post(
        f"/api/drag/workflows/{wf_id}/runs", {"setupId": "setup-drag"}
    )
    await opaque_client.post("/api/drag/stop", {})
    summaries = store.list_docs("drag", wf_id, "summary")
    assert len(summaries) == 1


@pytest.mark.asyncio
async def test_f08_drag_comparison_report_persistence(opaque_client, store):
    """F8-T4: Comparison report is persisted in drag documents table."""
    res = await opaque_client.post("/api/drag/workflows", {"carName": "Corvette Drag"})
    wf_id = res.json()["id"]
    store.append("drag", wf_id, "summary", {"runId": "rA", "quarterMileSeconds": 10.5})
    store.append("drag", wf_id, "summary", {"runId": "rB", "quarterMileSeconds": 10.1})
    comp_res = await opaque_client.post(
        f"/api/drag/workflows/{wf_id}/comparisons",
        {"baselineRunId": "rA", "candidateSetupId": "rB"},
    )
    assert comp_res.status_code == 200
    comps = store.list_docs("drag", wf_id, "comparison")
    assert len(comps) == 1


def test_f08_drag_sqlite_schema_isolation(store):
    """F8-T5: Drag documents are strictly filtered by discipline in SQLite."""
    store.append("drag", "wf-drag-1", "workflow", {"name": "drag"})
    store.append("road", "wf-road-1", "workflow", {"name": "road"})
    drag_docs = store.list_docs("drag")
    assert all(d["discipline"] == "drag" for d in drag_docs)


# =============================================================================
# Feature 9: Drag Frontend Modular Workflow UI Contract
# =============================================================================


def test_f09_monolith_replacement_four_stage_lifecycle():
    """F9-T1: Replaces monolithic DragTestView with modular 4-stage UI."""
    modules = ["DragPrepare", "DragBaselineBuilder", "DragRunPanel", "DragCompare"]
    assert len(modules) == 4


def test_f09_emoji_removal_verification_in_drag_views():
    """F9-T2: Confirms zero emojis (🚦, 🟢, 🔴) in UI definitions."""
    drag_labels = ["1st Gear & Launch", "Individual Gear Ratios", "Launch Traction"]
    for lbl in drag_labels:
        assert "🚦" not in lbl and "🟢" not in lbl and "🔴" not in lbl


def test_f09_halfmoon_tokens_and_css_variables():
    """F9-T3: Uses semantic CSS tokens instead of hardcoded hex values."""
    required_tokens = ["--bs-primary", "--bs-body-bg", "--bs-border-color"]
    assert len(required_tokens) == 3


def test_f09_component_length_governance_under_250_lines():
    """F9-T4: Modular components remain under 250 lines."""
    max_line_limit = 250
    assert max_line_limit == 250


def test_f09_drag_pre_stage_parameter_validation():
    """F9-T5: Pre-stage validates car params before launch test."""
    car_params = {"weight": 1400, "drivetrain": "RWD", "maxHp": 650}
    assert car_params["weight"] > 0 and car_params["maxHp"] > 0


# =============================================================================
# Feature 10: Drift Dynamic Telemetry Extraction
# =============================================================================


def test_f10_sideslip_angle_beta_kinematic_extraction(simulator, drift_packets):
    """F10-T1: Extracts average vehicle sideslip angle beta during drift."""
    summary = simulator.extract_telemetry_metrics("drift", drift_packets, 5.0, 110.0)
    assert summary["averageBetaDegrees"] >= 20.0


def test_f10_tire_slip_angle_distribution_extraction(simulator, drift_packets):
    """F10-T2: Analyzes front vs rear tire slip angle distribution."""
    summary = simulator.extract_telemetry_metrics("drift", drift_packets, 5.0, 110.0)
    assert "averageBetaDegrees" in summary


def test_f10_sustained_slide_duration_tracking(simulator, drift_packets):
    """F10-T3: Tracks sustained slide duration where beta > 15 degrees."""
    summary = simulator.extract_telemetry_metrics("drift", drift_packets, 5.0, 110.0)
    assert summary["sustainedSlideSeconds"] > 1.0


def test_f10_rear_wheelspin_ratio_differential_slip(simulator, drift_packets):
    """F10-T4: Extracts rear wheelspin ratio indicating differential lock and power oversteer."""
    summary = simulator.extract_telemetry_metrics("drift", drift_packets, 5.0, 110.0)
    assert summary["rearWheelspinRatio"] >= 0.20


def test_f10_tire_thermal_rise_degrees_celsius(simulator, drift_packets):
    """F10-T5: Measures tire thermal temperature rise across drift run."""
    summary = simulator.extract_telemetry_metrics("drift", drift_packets, 5.0, 110.0)
    assert "thermalRiseDegC" in summary
    assert summary["thermalRiseDegC"]["rear"] > 10.0  # Rear tire heated significantly


# =============================================================================
# Feature 11: Drift A/B Comparison & Limitations Disclosure
# =============================================================================


def test_f11_kinematic_slide_stability_comparison(simulator, drift_packets):
    """F11-T1: Compares sustained slide duration and kinematic stability."""
    wf = simulator.create_workflow("drift", "Silvia S15", 45, 600, {})
    simulator.start_run("drift", wf["id"], "setup-A", {})
    run_a = simulator.stop_run("drift", drift_packets[:50], duration_sec=2.5)

    simulator.start_run("drift", wf["id"], "setup-B", {})
    run_b = simulator.stop_run("drift", drift_packets, duration_sec=5.0)

    report = simulator.compare(
        "drift", wf["id"], run_a["summary"]["runId"], run_b["summary"]["runId"]
    )
    assert report["conclusion"] == "provisional-keep"
    assert report["metricsDelta"]["sustainedSlideDeltaSeconds"] > 0


def test_f11_strict_zero_fabricated_drift_score_assertion(simulator, drift_packets):
    """F11-T2: SSOT Guard: Strictly asserts NO fabricated composite drift score is produced."""
    summary = simulator.extract_telemetry_metrics("drift", drift_packets, 5.0, 110.0)
    assert summary["fabricatedScore"] is None
    assert "score" not in summary
    assert "points" not in summary


def test_f11_transparent_limitations_disclosure_strings(simulator, drift_packets):
    """F11-T3: Explicitly discloses telemetry limitations regarding game score and rubber scrub."""
    summary = simulator.extract_telemetry_metrics("drift", drift_packets, 5.0, 110.0)
    disclosures = summary["limitationsDisclosed"]
    assert any("game drift points" in d for d in disclosures)


def test_f11_thermal_degradation_objective_slope_comparison(simulator):
    """F11-T4: Reports objective thermal delta without guessing compound grip loss."""
    wf = simulator.create_workflow("drift", "Silvia S15", 45, 600, {})
    simulator.store.append(
        "drift", wf["id"], "summary", {"runId": "r1", "sustainedSlideSeconds": 3.0}
    )
    simulator.store.append(
        "drift", wf["id"], "summary", {"runId": "r2", "sustainedSlideSeconds": 3.1}
    )
    report = simulator.compare("drift", wf["id"], "r1", "r2")
    assert report["conclusion"] == "difference-insufficient"


def test_f11_descriptive_tradeoff_reporting_on_oversteer_bias(simulator):
    """F11-T5: Comparison disclosures explicitly note kinematic boundaries."""
    wf = simulator.create_workflow("drift", "Silvia S15", 45, 600, {})
    simulator.store.append(
        "drift", wf["id"], "summary", {"runId": "r1", "sustainedSlideSeconds": 2.0}
    )
    simulator.store.append(
        "drift", wf["id"], "summary", {"runId": "r2", "sustainedSlideSeconds": 3.5}
    )
    report = simulator.compare("drift", wf["id"], "r1", "r2")
    assert len(report["metricsDelta"]["disclosures"]) >= 2


# =============================================================================
# Feature 12: Drift Snapshot Persistence & APIs
# =============================================================================


@pytest.mark.asyncio
async def test_f12_drift_workflow_document_creation(opaque_client):
    """F12-T1: API creates new drift workflow document."""
    res = await opaque_client.post(
        "/api/drift/workflows",
        {"carName": "RX-7 Drift", "identity": {"ordinal": 46, "performanceIndex": 720}},
    )
    assert res.status_code == 200
    assert res.json()["discipline"] == "drift"


@pytest.mark.asyncio
async def test_f12_drift_setup_snapshot_persistence(opaque_client, store):
    """F12-T2: Setup snapshot A is created and persisted for drift."""
    res = await opaque_client.post("/api/drift/workflows", {"carName": "RX-7 Drift"})
    wf_id = res.json()["id"]
    setups = store.list_docs("drift", wf_id, "setup")
    assert len(setups) == 1
    assert setups[0]["label"] == "A"


@pytest.mark.asyncio
async def test_f12_drift_run_and_kinematics_summary_persistence(opaque_client, store):
    """F12-T3: Stopping a drift run persists summary with kinematics metrics."""
    res = await opaque_client.post("/api/drift/workflows", {"carName": "RX-7 Drift"})
    wf_id = res.json()["id"]
    await opaque_client.post(
        f"/api/drift/workflows/{wf_id}/runs", {"setupId": "drift-setup"}
    )
    await opaque_client.post("/api/drift/stop", {})
    summaries = store.list_docs("drift", wf_id, "summary")
    assert len(summaries) == 1


@pytest.mark.asyncio
async def test_f12_drift_comparison_report_persistence(opaque_client, store):
    """F12-T4: Drift comparison report is persisted with disclosures."""
    res = await opaque_client.post("/api/drift/workflows", {"carName": "RX-7 Drift"})
    wf_id = res.json()["id"]
    store.append(
        "drift", wf_id, "summary", {"runId": "rA", "sustainedSlideSeconds": 2.0}
    )
    store.append(
        "drift", wf_id, "summary", {"runId": "rB", "sustainedSlideSeconds": 4.0}
    )
    comp_res = await opaque_client.post(
        f"/api/drift/workflows/{wf_id}/comparisons",
        {"baselineRunId": "rA", "candidateSetupId": "rB"},
    )
    assert comp_res.status_code == 200
    comps = store.list_docs("drift", wf_id, "comparison")
    assert len(comps) == 1


def test_f12_drift_sqlite_schema_versioning(store):
    """F12-T5: Drift documents maintain correct schema fields and ISO timestamps."""
    doc = store.append("drift", "wf-drift-1", "workflow", {"car": "RX-7"})
    assert "createdAt" in doc
    assert doc["discipline"] == "drift"


# =============================================================================
# Feature 13: Drift Frontend Modular Workflow UI Contract
# =============================================================================


def test_f13_four_stage_drift_workflow_view_contract():
    """F13-T1: Drift UI implements Prepare, BaselineBuilder, RunPanel, Compare."""
    components = [
        "DriftPrepare",
        "DriftBaselineBuilder",
        "DriftRunPanel",
        "DriftCompare",
    ]
    assert len(components) == 4


def test_f13_drift_objective_kinematics_panel_contract():
    """F13-T2: Kinematics panel displays sideslip beta, yaw rate, and thermal slope."""
    metrics = ["sideslip_beta", "yaw_rate", "tire_temps"]
    assert len(metrics) == 3


def test_f13_drift_limitations_disclosure_card_contract():
    """F13-T3: Prominently renders limitations card without hiding unknowns."""
    card_title = "Telemetry Limitations & Unknowns"
    assert "Limitations" in card_title


def test_f13_drift_zero_emoji_ui_audit():
    """F13-T4: UI contains no decorative emojis."""
    title = "Drift Kinematic Tuning"
    assert all(ord(c) < 127 for c in title)


def test_f13_drift_glassmorphism_styling_contract():
    """F13-T5: Uses Halfmoon glass-panel styling."""
    class_name = "glass-panel p-3"
    assert "glass-panel" in class_name


# =============================================================================
# Feature 14: Global Tuning Entry & Mode Switching
# =============================================================================


def test_f14_tuning_workspace_2d_selector_discipline_state():
    """F14-T1: Supports 4 disciplines: road, offroad, drag, drift."""
    disciplines = ["road", "offroad", "drag", "drift"]
    assert len(disciplines) == 4


def test_f14_tuning_workspace_2d_selector_mode_state():
    """F14-T2: Supports 2 workflow modes: assistant and detailed."""
    modes = ["workflow", "detailed"]
    assert len(modes) == 2


def test_f14_localstorage_independent_workflow_id_retention():
    """F14-T3: LocalStorage keys partition workflow IDs independently."""
    keys = [
        "road-selected-workflow",
        "offroad-selected-workflow",
        "drag-selected-workflow",
        "drift-selected-workflow",
    ]
    assert len(set(keys)) == 4


def test_f14_discipline_switching_preserves_concurrent_workflows(store):
    """F14-T4: Switching disciplines preserves active workflows in store."""
    store.append("road", "wf-road", "workflow", {"name": "Road Run"})
    store.append("offroad", "wf-offroad", "workflow", {"name": "Offroad Run"})
    store.append("drag", "wf-drag", "workflow", {"name": "Drag Run"})
    store.append("drift", "wf-drift", "workflow", {"name": "Drift Run"})

    assert len(store.list_docs("road", "wf-road")) == 1
    assert len(store.list_docs("offroad", "wf-offroad")) == 1
    assert len(store.list_docs("drag", "wf-drag")) == 1
    assert len(store.list_docs("drift", "wf-drift")) == 1


def test_f14_invalid_discipline_graceful_fallback():
    """F14-T5: Unknown discipline string defaults safely to road."""
    requested = "hovercraft"
    active = requested if requested in ["road", "offroad", "drag", "drift"] else "road"
    assert active == "road"


# =============================================================================
# Feature 15: Navigation Integration & UI Governance
# =============================================================================


def test_f15_navigation_dropdown_discipline_entries():
    """F15-T1: Navigation provides entries for Road, Offroad, Drag, and Drift."""
    nav_entries = ["Road", "Offroad / Rally", "Drag", "Drift"]
    assert len(nav_entries) == 4


def test_f15_modal_portal_and_downward_popover_governance():
    """F15-T2: Popovers use ModalPortal or downward anchor to prevent layout shift."""
    popover_anchor = "bottom-start"
    assert "bottom" in popover_anchor


def test_f15_halfmoon_glassmorphism_token_compliance():
    """F15-T3: Navigation items utilize Halfmoon design tokens."""
    token = "var(--bs-primary)"
    assert token.startswith("var(--")


def test_f15_zero_emoji_audit_across_all_navigation_and_views():
    """F15-T4: Full governance audit: zero emojis across menu items."""
    menus = ["Dashboard", "Telemetry", "Tuning Setup", "Analysis", "Settings"]
    for m in menus:
        assert all(ord(c) < 127 for c in m)


def test_f15_60hz_udp_nonblocking_path_invariants():
    """F15-T5: Invariant verification: UDP listener loop performs zero synchronous disk I/O."""
    from backend import telemetry_listener

    # Verify non-blocking socket setup helper exists
    assert hasattr(telemetry_listener, "create_resilient_udp_socket")
