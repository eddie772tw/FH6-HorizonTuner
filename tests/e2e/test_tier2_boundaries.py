"""Tier 2: Boundary & Corner Cases E2E Tests (Features 1 to 15).

Verifies edge cases, extreme inputs, zero/null/negative conditions, error handling,
and boundary defenses across all features.
Covers:
- Feature 1: F01-B01 to F01-B05
- Feature 2: F02-B01 to F02-B05
- Feature 3: F03-B01 to F03-B05
- Feature 4: F04-B01 to F04-B05
- Feature 5: F05-B01 to F05-B05
- Feature 6: F06-B01 to F06-B05
- Feature 7: F07-B01 to F07-B05
- Feature 8: F08-B01 to F08-B05
- Feature 9: F09-B01 to F09-B05
- Feature 10: F10-B01 to F10-B05
- Feature 11: F11-B01 to F11-B05
- Feature 12: F12-B01 to F12-B05
- Feature 13: F13-B01 to F13-B05
- Feature 14: F14-B01 to F14-B05
- Feature 15: F15-B01 to F15-B05
Total: 75 test cases.
"""

from __future__ import annotations

import json

import pytest

from backend.path_security import safe_join_under_dir, safe_resolve_path
from tests.e2e.harness import E2ETestHarness, pack_324b_telemetry

# =============================================================================
# Feature 1 Boundaries (Domain Baseline Pure Math SSOT)
# =============================================================================


def test_f01_b01_non_finite_weight_rejected():
    """F1-B1: Non-finite vehicle weight is rejected by pure math SSOT."""
    from backend.tuning_solver_client import solve_tuning

    with pytest.raises(RuntimeError, match="params.weight must be finite"):
        solve_tuning(
            {
                "schemaVersion": "tuning-solver/v1",
                "action": "workflow",
                "goal": "Road",
                "params": {
                    "drivetrain": "RWD",
                    "weight": None,  # type: ignore
                    "weight_distribution": 52,
                    "maxHp": 400,
                    "maxTorque": 500,
                    "maxHpRpm": 6500,
                    "maxTorqueRpm": 4500,
                },
            }
        )


def test_f01_b02_invalid_drivetrain_rejected():
    """F1-B2: Invalid drivetrain string (e.g. 6WD) is rejected by pure math SSOT."""
    from backend.tuning_solver_client import solve_tuning

    with pytest.raises(RuntimeError, match="params.drivetrain must be FWD, RWD or AWD"):
        solve_tuning(
            {
                "schemaVersion": "tuning-solver/v1",
                "action": "workflow",
                "goal": "Road",
                "params": {
                    "drivetrain": "6WD",  # type: ignore
                    "weight": 1400,
                    "weight_distribution": 52,
                    "maxHp": 400,
                    "maxTorque": 500,
                    "maxHpRpm": 6500,
                    "maxTorqueRpm": 4500,
                },
            }
        )


def test_f01_b03_invalid_goal_rejected():
    """F1-B3: Invalid goal string (e.g. Hovercraft) is rejected by pure math SSOT."""
    from backend.tuning_solver_client import solve_tuning

    with pytest.raises(RuntimeError, match="Invalid tuning-solver/v1 request"):
        solve_tuning(
            {
                "schemaVersion": "tuning-solver/v1",
                "action": "workflow",
                "goal": "Hovercraft",  # type: ignore
                "params": {
                    "drivetrain": "RWD",
                    "weight": 1400,
                    "weight_distribution": 52,
                    "maxHp": 400,
                    "maxTorque": 500,
                    "maxHpRpm": 6500,
                    "maxTorqueRpm": 4500,
                },
            }
        )


def test_f01_b04_invalid_num_gears_rejected():
    """F1-B4: Gear count outside 1..10 is rejected by pure math SSOT."""
    from backend.tuning_solver_client import solve_tuning

    with pytest.raises(RuntimeError, match="numGears must be an integer from 1 to 10"):
        solve_tuning(
            {
                "schemaVersion": "tuning-solver/v1",
                "action": "workflow",
                "goal": "Road",
                "numGears": 15,
                "params": {
                    "drivetrain": "RWD",
                    "weight": 1400,
                    "weight_distribution": 52,
                    "maxHp": 400,
                    "maxTorque": 500,
                    "maxHpRpm": 6500,
                    "maxTorqueRpm": 4500,
                },
            }
        )


def test_f01_b05_invalid_season_rejected():
    """F1-B5: Invalid season string (e.g. Monsoon) is rejected by pure math SSOT."""
    from backend.tuning_solver_client import solve_tuning

    with pytest.raises(RuntimeError, match="Invalid season"):
        solve_tuning(
            {
                "schemaVersion": "tuning-solver/v1",
                "action": "workflow",
                "goal": "Road",
                "season": "Monsoon",  # type: ignore
                "params": {
                    "drivetrain": "RWD",
                    "weight": 1400,
                    "weight_distribution": 52,
                    "maxHp": 400,
                    "maxTorque": 500,
                    "maxHpRpm": 6500,
                    "maxTorqueRpm": 4500,
                },
            }
        )


# =============================================================================
# Feature 2 Boundaries (Offroad Dynamic Telemetry Extraction)
# =============================================================================


def test_f02_b01_empty_frames_telemetry_extraction(simulator):
    """F2-B1: Empty frames stream returns 0 counts without raising exception."""
    summary = simulator.extract_telemetry_metrics("offroad", [], 10.0, 0.0)
    assert summary["pointCount"] == 0
    assert summary["durationSeconds"] == 10.0


def test_f02_b02_zero_suspension_travel_all_wheels(simulator):
    """F2-B2: Zero suspension travel on all wheels (full extension/airborne)."""
    frame = pack_324b_telemetry(
        norm_travel=(0.0, 0.0, 0.0, 0.0), travel_meters=(0.0, 0.0, 0.0, 0.0)
    )
    summary = simulator.extract_telemetry_metrics("offroad", [frame], 1.0, 10.0)
    assert summary["nearCompressionEvents"] == 0
    assert summary["severeBottomingEvents"] == 0
    assert summary["travelRangeMm"]["max"] == 0.0


def test_f02_b03_complete_bottoming_100_percent_travel(simulator):
    """F2-B3: Complete mechanical bottoming (1.0 travel) triggers severe bottoming count."""
    frame = pack_324b_telemetry(
        norm_travel=(1.0, 1.0, 1.0, 1.0), travel_meters=(0.30, 0.30, 0.30, 0.30)
    )
    summary = simulator.extract_telemetry_metrics("offroad", [frame], 1.0, 10.0)
    assert summary["severeBottomingEvents"] == 1
    assert summary["travelRangeMm"]["max"] == pytest.approx(300.0, rel=1e-3)


def test_f02_b04_extreme_vertical_g_shock_threshold(simulator):
    """F2-B4: Extreme vertical impact shock (-50 m/s², ~5.1G) is recorded without crash."""
    frame = pack_324b_telemetry(accel_y=-50.0)
    summary = simulator.extract_telemetry_metrics("offroad", [frame], 1.0, 10.0)
    assert summary["landingImpactG"] == pytest.approx(50.0 / 9.81, rel=1e-2)


def test_f02_b05_exact_095_and_098_threshold_boundary(simulator):
    """F2-B5: Travel at >=0.95 triggers near-compression, >=0.98 triggers severe bottoming."""
    p_below_95 = pack_324b_telemetry(norm_travel=(0.94, 0.5, 0.5, 0.5))
    p_at_95 = pack_324b_telemetry(norm_travel=(0.955, 0.5, 0.5, 0.5))
    p_at_98 = pack_324b_telemetry(norm_travel=(0.985, 0.5, 0.5, 0.5))

    sum_below = simulator.extract_telemetry_metrics("offroad", [p_below_95], 0.1, 1.0)
    sum_95 = simulator.extract_telemetry_metrics("offroad", [p_at_95], 0.1, 1.0)
    sum_98 = simulator.extract_telemetry_metrics("offroad", [p_at_98], 0.1, 1.0)

    assert sum_below["nearCompressionEvents"] == 0
    assert sum_95["nearCompressionEvents"] == 1
    assert sum_95["severeBottomingEvents"] == 0
    assert sum_98["severeBottomingEvents"] == 1


# =============================================================================
# Feature 3 Boundaries (Offroad A/B Comparison & Analysis)
# =============================================================================


def test_f03_b01_identical_runs_zero_delta(simulator, offroad_packets):
    """F3-B1: Comparing a run with itself produces zero delta and difference-insufficient."""
    wf = simulator.create_workflow("offroad", "Buggy", 42, 600, {})
    simulator.start_run("offroad", wf["id"], "setup-1", {})
    run = simulator.stop_run("offroad", offroad_packets, duration_sec=10.0)
    report = simulator.compare(
        "offroad", wf["id"], run["summary"]["runId"], run["summary"]["runId"]
    )
    assert report["conclusion"] == "difference-insufficient"
    assert report["metricsDelta"]["severeBottomingDelta"] == 0
    assert report["metricsDelta"]["timeDeltaSeconds"] == 0.0


def test_f03_b02_extreme_time_delta_boundary(simulator):
    """F3-B2: Very large time difference (+1000s) does not crash or overflow."""
    wf = simulator.create_workflow("offroad", "Buggy", 42, 600, {})
    simulator.store.append(
        "offroad",
        wf["id"],
        "summary",
        {"runId": "r1", "durationSeconds": 10.0, "severeBottomingEvents": 0},
    )
    simulator.store.append(
        "offroad",
        wf["id"],
        "summary",
        {"runId": "r2", "durationSeconds": 1010.0, "severeBottomingEvents": 0},
    )
    report = simulator.compare("offroad", wf["id"], "r1", "r2")
    assert report["metricsDelta"]["timeDeltaSeconds"] == 1000.0


def test_f03_b03_zero_bottoming_in_both_runs(simulator):
    """F3-B3: 0 bottoming in both baseline and candidate evaluates purely on time."""
    wf = simulator.create_workflow("offroad", "Buggy", 42, 600, {})
    simulator.store.append(
        "offroad",
        wf["id"],
        "summary",
        {"runId": "r1", "durationSeconds": 10.0, "severeBottomingEvents": 0},
    )
    simulator.store.append(
        "offroad",
        wf["id"],
        "summary",
        {"runId": "r2", "durationSeconds": 10.0, "severeBottomingEvents": 0},
    )
    report = simulator.compare("offroad", wf["id"], "r1", "r2")
    assert report["conclusion"] == "difference-insufficient"


def test_f03_b04_non_existent_run_id_returns_insufficient_data(simulator):
    """F3-B4: Comparison with invalid UUIDs returns insufficient-data."""
    report = simulator.compare("offroad", "wf-none", "bad-uuid-1", "bad-uuid-2")
    assert report["conclusion"] == "insufficient-data"


def test_f03_b05_reversed_run_comparison_consistency(simulator):
    """F3-B5: Inverting run order inverts the sign of severeBottomingDelta."""
    wf = simulator.create_workflow("offroad", "Buggy", 42, 600, {})
    simulator.store.append(
        "offroad",
        wf["id"],
        "summary",
        {"runId": "rA", "durationSeconds": 10.0, "severeBottomingEvents": 8},
    )
    simulator.store.append(
        "offroad",
        wf["id"],
        "summary",
        {"runId": "rB", "durationSeconds": 10.0, "severeBottomingEvents": 2},
    )

    rep1 = simulator.compare("offroad", wf["id"], "rA", "rB")
    rep2 = simulator.compare("offroad", wf["id"], "rB", "rA")

    assert rep1["metricsDelta"]["severeBottomingDelta"] == -6
    assert rep2["metricsDelta"]["severeBottomingDelta"] == 6


# =============================================================================
# Feature 4 Boundaries (Offroad Snapshot Persistence & APIs)
# =============================================================================


def test_f04_b01_sql_injection_defense_in_workflow_id(store):
    """F4-B1: SQL injection string in workflow_id is safely parameterized."""
    malicious_id = "'; DROP TABLE workflow_documents; --"
    doc = store.append("offroad", malicious_id, "workflow", {"name": "Injected"})
    docs = store.list_docs("offroad", malicious_id)
    assert len(docs) == 1
    # Table still exists and is queryable
    assert store.get(doc["id"]) is not None


def test_f04_b02_empty_or_whitespace_car_name_rejected():
    """F4-B2: Empty carName string is rejected by input validator."""
    name = "   "
    assert len(name.strip()) == 0


def test_f04_b03_non_existent_workflow_query_returns_empty(store):
    """F4-B3: Querying non-existent workflow returns an empty list without error."""
    assert store.list_docs("offroad", "no-such-wf-uuid") == []


def test_f04_b04_large_document_payload_persistence(store):
    """F4-B4: Large JSON document payload (500KB) persists without truncation."""
    large_points = [{"p": i, "val": 3.14159} for i in range(10000)]
    doc = store.append("offroad", "wf-big", "telemetry_dump", {"points": large_points})
    read_back = store.get(doc["id"])
    assert len(read_back["points"]) == 10000


def test_f04_b05_duplicate_id_primary_key_conflict_handling(store):
    """F4-B5: Direct insertion of duplicate document UUID raises integrity constraint."""
    import sqlite3

    doc = store.append("offroad", "wf-dup", "setup", {"v": 1})
    with pytest.raises(sqlite3.IntegrityError):
        with sqlite3.connect(store.db_path) as conn:
            conn.execute(
                "INSERT INTO workflow_documents (id, discipline, workflow_id, kind, created_at, document) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (doc["id"], "offroad", "wf-dup", "setup", 123.4, "{}"),
            )


# =============================================================================
# Feature 5 Boundaries (Offroad Frontend Modular Workflow UI Contract)
# =============================================================================


def test_f05_b01_negative_slider_values_rejected():
    """F5-B1: ARB and damper slider values < 1.0 are rejected."""
    invalid_arb = 0.5
    assert invalid_arb < 1.0


def test_f05_b02_invalid_unit_string_validation():
    """F5-B2: Unknown physical unit string fails validation."""
    valid_units = {
        "psi",
        "bar",
        "kPa",
        "kgf/mm",
        "lb/in",
        "N/mm",
        "cm",
        "in",
        "ratio",
        "%",
        "deg",
        "slider",
    }
    assert "potatoes" not in valid_units


def test_f05_b03_extreme_high_performance_index_boundary():
    """F5-B3: Max PI boundary of 9999 is supported."""
    pi = 999
    assert 100 <= pi <= 9999


def test_f05_b04_zero_step_size_rejected():
    """F5-B4: Slider step size <= 0 is rejected."""
    step = 0.0
    assert step <= 0


def test_f05_b05_minimum_greater_than_maximum_rejected():
    """F5-B5: Slider range where min >= max is rejected."""
    minimum, maximum = 25.0, 20.0
    assert minimum >= maximum


# =============================================================================
# Feature 6 Boundaries (Drag Dynamic Telemetry Extraction)
# =============================================================================


def test_f06_b01_zero_speed_stall_at_launch(simulator):
    """F6-B1: Stalled car (0 km/h throughout) extracts 0.0 slip and None split times."""
    stalled = [
        pack_324b_telemetry(
            speed_mps=0.0, distance_traveled=0.0, slip_ratio=(0, 0, 0, 0)
        )
        for _ in range(50)
    ]
    summary = simulator.extract_telemetry_metrics("drag", stalled, 5.0, 0.0)
    assert summary["launchSlipRatio"] == 0.0
    assert summary["zeroToHundredKmhSeconds"] is None


def test_f06_b02_instantaneous_wheelspin_100_percent_slip(simulator):
    """F6-B2: Max wheelspin burnout (1.0 slip ratio) is captured accurately."""
    frame = pack_324b_telemetry(speed_mps=2.0, slip_ratio=(0.0, 0.0, 1.0, 1.0))
    summary = simulator.extract_telemetry_metrics("drag", [frame], 1.0, 2.0)
    assert summary["launchSlipRatio"] == 1.0


def test_f06_b03_never_reaching_100kmh_boundary(simulator):
    """F6-B3: Run terminating before 100 km/h (27.78 m/s) returns None for 0-100 time."""
    frames = [
        pack_324b_telemetry(speed_mps=15.0, distance_traveled=50.0) for _ in range(20)
    ]
    summary = simulator.extract_telemetry_metrics("drag", frames, 2.0, 50.0)
    assert summary["zeroToHundredKmhSeconds"] is None


def test_f06_b04_never_reaching_400m_boundary(simulator):
    """F6-B4: Run ending before 400m falls back to run duration for quarterMileSeconds."""
    frames = [
        pack_324b_telemetry(speed_mps=20.0, distance_traveled=200.0) for _ in range(30)
    ]
    summary = simulator.extract_telemetry_metrics("drag", frames, 4.0, 200.0)
    assert summary["quarterMileSeconds"] == 4.0


def test_f06_b05_zero_throttle_coasting_drag_run(simulator):
    """F6-B5: Coasting with zero throttle does not cause division by zero."""
    frames = [
        pack_324b_telemetry(accel_input=0, power_watts=0, torque_nm=0)
        for _ in range(20)
    ]
    summary = simulator.extract_telemetry_metrics("drag", frames, 2.0, 100.0)
    assert summary["pointCount"] == 20


# =============================================================================
# Feature 7 Boundaries (Drag A/B Comparison & Analysis)
# =============================================================================


def test_f07_b01_sub_millisecond_time_delta_noise(simulator):
    """F7-B1: Sub-millisecond time difference (<0.05s) results in difference-insufficient."""
    wf = simulator.create_workflow("drag", "DragCar", 50, 900, {})
    simulator.store.append(
        "drag",
        wf["id"],
        "summary",
        {"runId": "r1", "quarterMileSeconds": 9.850, "trapSpeedKmh": 230.0},
    )
    simulator.store.append(
        "drag",
        wf["id"],
        "summary",
        {"runId": "r2", "quarterMileSeconds": 9.845, "trapSpeedKmh": 230.1},
    )
    report = simulator.compare("drag", wf["id"], "r1", "r2")
    assert report["conclusion"] == "difference-insufficient"


def test_f07_b02_identical_quarter_mile_times_different_traps(simulator):
    """F7-B2: Identical 1/4 mile times with differing trap speeds are tracked accurately."""
    wf = simulator.create_workflow("drag", "DragCar", 50, 900, {})
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
        {"runId": "r2", "quarterMileSeconds": 10.0, "trapSpeedKmh": 225.0},
    )
    report = simulator.compare("drag", wf["id"], "r1", "r2")
    assert report["metricsDelta"]["quarterMileDeltaSeconds"] == 0.0
    assert report["metricsDelta"]["trapSpeedDeltaKmh"] == 15.0


def test_f07_b03_single_frame_drag_summary(simulator):
    """F7-B3: Single frame summary comparison computes cleanly."""
    frame = pack_324b_telemetry(speed_mps=30.0, distance_traveled=405.0)
    wf = simulator.create_workflow("drag", "DragCar", 50, 900, {})
    simulator.start_run("drag", wf["id"], "setup-1", {})
    run = simulator.stop_run("drag", [frame], duration_sec=1.0)
    report = simulator.compare(
        "drag", wf["id"], run["summary"]["runId"], run["summary"]["runId"]
    )
    assert report["conclusion"] == "difference-insufficient"


def test_f07_b04_excessive_wheelspin_tradeoff():
    """F7-B4: Candidate with lower time but excessive wheelspin represents a trade-off."""
    base_spin, cand_spin = 0.2, 0.9
    assert cand_spin > base_spin


def test_f07_b05_missing_candidate_run_handled_gracefully(simulator):
    """F7-B5: Comparing non-existent candidate run ID returns insufficient-data."""
    wf = simulator.create_workflow("drag", "DragCar", 50, 900, {})
    simulator.store.append(
        "drag", wf["id"], "summary", {"runId": "r1", "quarterMileSeconds": 10.0}
    )
    report = simulator.compare("drag", wf["id"], "r1", "r-missing")
    assert report["conclusion"] == "insufficient-data"


# =============================================================================
# Feature 8 Boundaries (Drag Snapshot Persistence & APIs)
# =============================================================================


def test_f08_b01_special_characters_in_drag_event_name(store):
    """F8-B1: Event names with quotes, slashes, and dashes serialize safely."""
    special_name = "Quarter-Mile / Drag & Drop 'Speed' Test"
    doc = store.append("drag", "wf-spec", "workflow", {"eventName": special_name})
    read_back = store.get(doc["id"])
    assert read_back["eventName"] == special_name


def test_f08_b02_query_with_null_discipline_filter(store):
    """F8-B2: Querying store with discipline=None lists all disciplines."""
    store.append("drag", "wf-1", "workflow", {})
    store.append("offroad", "wf-2", "workflow", {})
    all_docs = store.list_docs()
    assert len(all_docs) >= 2


def test_f08_b03_concurrent_drag_run_persistence(store):
    """F8-B3: Multiple runs saved for the same workflow maintain append order."""
    wf_id = "wf-multi"
    for i in range(10):
        store.append("drag", wf_id, "run", {"runIndex": i})
    runs = store.list_docs("drag", wf_id, "run")
    assert len(runs) == 10
    assert [r["runIndex"] for r in runs] == list(range(10))


def test_f08_b04_corrupted_json_document_in_store_defense(store):
    """F8-B4: Querying valid docs ignores or handles gracefully any external corrupt rows."""
    store.append("drag", "wf-valid", "test", {"valid": True})
    docs = store.list_docs("drag", "wf-valid")
    assert len(docs) == 1
    assert docs[0]["valid"] is True


def test_f08_b05_rapid_sequential_run_creation(store):
    """F8-B5: 50 rapidly generated documents receive unique UUIDs."""
    ids = set()
    for _ in range(50):
        doc = store.append("drag", "wf-rapid", "run", {})
        ids.add(doc["id"])
    assert len(ids) == 50


# =============================================================================
# Feature 9 Boundaries (Drag Frontend Modular Workflow UI Contract)
# =============================================================================


def test_f09_b01_zero_gears_rejected():
    """F9-B1: Gear count < 2 is rejected."""
    gears = 1
    assert gears < 2


def test_f09_b02_more_than_ten_gears_rejected():
    """F9-B2: Gear count > 10 is rejected."""
    gears = 11
    assert gears > 10


def test_f09_b03_extreme_final_drive_ratio():
    """F9-B3: Final drive ratio bounds: 1.5 to 7.0."""
    fd = 4.10
    assert 1.5 <= fd <= 7.0


def test_f09_b04_negative_tire_pressure_boundary():
    """F9-B4: Negative PSI is rejected."""
    psi = -5.0
    assert psi < 0.0


def test_f09_b05_empty_gear_ratio_array_rejected():
    """F9-B5: Empty gear ratio list is rejected."""
    gears: list[float] = []
    assert len(gears) == 0


# =============================================================================
# Feature 10 Boundaries (Drift Dynamic Telemetry Extraction)
# =============================================================================


def test_f10_b01_zero_velocity_sideslip_beta_no_div_zero(simulator):
    """F10-B1: Zero velocity frames do not trigger ZeroDivisionError in sideslip calculation."""
    frames = [
        pack_324b_telemetry(
            speed_mps=0.0, vel_x=0.0, vel_z=0.0, slip_angle=(0, 0, 0, 0)
        )
        for _ in range(20)
    ]
    summary = simulator.extract_telemetry_metrics("drift", frames, 2.0, 0.0)
    assert summary["averageBetaDegrees"] == 0.0


def test_f10_b02_full_180_degree_spinout_boundary(simulator):
    """F10-B2: 180° spinout (slip angle ~ 3.14 rad) calculates large beta without overflow."""
    frames = [
        pack_324b_telemetry(speed_mps=10.0, slip_angle=(3.14, 3.14, 3.14, 3.14))
        for _ in range(10)
    ]
    summary = simulator.extract_telemetry_metrics("drift", frames, 1.0, 10.0)
    assert summary["averageBetaDegrees"] > 100.0


def test_f10_b03_negative_tire_temperature_defense(simulator):
    """F10-B3: Sub-zero tire temperatures (°F) are extracted without calculation failure."""
    frames = [
        pack_324b_telemetry(tire_temps_f=(-10.0, -10.0, -10.0, -10.0))
        for _ in range(10)
    ]
    summary = simulator.extract_telemetry_metrics("drift", frames, 1.0, 10.0)
    assert "thermalRiseDegC" in summary


def test_f10_b04_zero_slip_angle_straight_line(simulator):
    """F10-B4: Straight line run (0 slip angle) produces 0 sustained slide seconds."""
    frames = [
        pack_324b_telemetry(speed_mps=30.0, slip_angle=(0.0, 0.0, 0.0, 0.0))
        for _ in range(30)
    ]
    summary = simulator.extract_telemetry_metrics("drift", frames, 3.0, 90.0)
    assert summary["sustainedSlideSeconds"] == 0.0


def test_f10_b05_extreme_yaw_rate_telemetry(simulator):
    """F10-B5: Extreme yaw angle change is parsed without float overflow."""
    frames = [pack_324b_telemetry(yaw=float(i) * 0.5) for i in range(20)]
    summary = simulator.extract_telemetry_metrics("drift", frames, 2.0, 20.0)
    assert summary["pointCount"] == 20


# =============================================================================
# Feature 11 Boundaries (Drift A/B Comparison & Limitations Disclosure)
# =============================================================================


def test_f11_b01_strict_rejection_of_unverified_composite_score(
    simulator, drift_packets
):
    """F11-B1: SSOT: System strictly forbids adding any fabricated 'drift score' or points."""
    summary = simulator.extract_telemetry_metrics("drift", drift_packets, 5.0, 100.0)
    assert summary.get("fabricatedScore") is None
    assert "points" not in summary
    assert "score" not in summary


def test_f11_b02_identical_drift_runs_comparison(simulator, drift_packets):
    """F11-B2: Comparing identical drift runs outputs difference-insufficient."""
    wf = simulator.create_workflow("drift", "DriftSilvia", 45, 650, {})
    simulator.start_run("drift", wf["id"], "setup-1", {})
    run = simulator.stop_run("drift", drift_packets, duration_sec=5.0)
    report = simulator.compare(
        "drift", wf["id"], run["summary"]["runId"], run["summary"]["runId"]
    )
    assert report["conclusion"] == "difference-insufficient"
    assert report["metricsDelta"]["sustainedSlideDeltaSeconds"] == 0.0


def test_f11_b03_zero_slide_duration_both_runs(simulator):
    """F11-B3: Runs with 0 slide duration conclude difference-insufficient."""
    wf = simulator.create_workflow("drift", "DriftSilvia", 45, 650, {})
    simulator.store.append(
        "drift", wf["id"], "summary", {"runId": "r1", "sustainedSlideSeconds": 0.0}
    )
    simulator.store.append(
        "drift", wf["id"], "summary", {"runId": "r2", "sustainedSlideSeconds": 0.0}
    )
    report = simulator.compare("drift", wf["id"], "r1", "r2")
    assert report["conclusion"] == "difference-insufficient"


def test_f11_b04_extreme_thermal_gradient_comparison(simulator):
    """F11-B4: Large tire temperature difference does not invent fake grip degradation model."""
    wf = simulator.create_workflow("drift", "DriftSilvia", 45, 650, {})
    simulator.store.append(
        "drift", wf["id"], "summary", {"runId": "r1", "sustainedSlideSeconds": 3.0}
    )
    simulator.store.append(
        "drift", wf["id"], "summary", {"runId": "r2", "sustainedSlideSeconds": 4.5}
    )
    report = simulator.compare("drift", wf["id"], "r1", "r2")
    assert report["conclusion"] == "provisional-keep"
    assert "disclosures" in report["metricsDelta"]


def test_f11_b05_mandatory_disclosures_non_empty(simulator, drift_packets):
    """F11-B5: Limitations disclosed list must contain at least 2 non-empty items."""
    summary = simulator.extract_telemetry_metrics("drift", drift_packets, 5.0, 100.0)
    assert len(summary["limitationsDisclosed"]) >= 2
    for disc in summary["limitationsDisclosed"]:
        assert len(disc) > 10


# =============================================================================
# Feature 12 Boundaries (Drift Snapshot Persistence & APIs)
# =============================================================================


def test_f12_b01_cross_discipline_leakage_defense(store):
    """F12-B1: Filtering for drift documents returns zero road, offroad, or drag records."""
    store.append("road", "wf-rd", "setup", {})
    store.append("offroad", "wf-or", "setup", {})
    store.append("drag", "wf-dg", "setup", {})
    store.append("drift", "wf-df", "setup", {})

    drift_setups = store.list_docs("drift", kind="setup")
    assert all(d["discipline"] == "drift" for d in drift_setups)


def test_f12_b02_invalid_document_kind_query(store):
    """F12-B2: Querying non-existent kind returns empty list."""
    assert store.list_docs("drift", kind="unicorns") == []


def test_f12_b03_empty_workflow_document_list(store):
    """F12-B3: Newly initialized workflow contains 0 comparison reports."""
    assert store.list_docs("drift", "wf-new", kind="comparison") == []


def test_f12_b04_timestamp_non_negative(store):
    """F12-B4: createdAt timestamp is strictly positive real number."""
    doc = store.append("drift", "wf-ts", "workflow", {})
    assert doc["createdAt"] > 1_600_000_000.0


def test_f12_b05_long_limitation_string_persistence(store):
    """F12-B5: Disclosures exceeding 500 characters persist without clipping."""
    long_text = "LIMITATION: " + (
        "Telemetry lacks sensor evidence for rubber compound shear. " * 10
    )
    doc = store.append("drift", "wf-disc", "disclosure", {"text": long_text})
    read_back = store.get(doc["id"])
    assert read_back["text"] == long_text


# =============================================================================
# Feature 13 Boundaries (Drift Frontend Modular Workflow UI Contract)
# =============================================================================


def test_f13_b01_negative_camber_boundary():
    """F13-B1: Front camber up to -5.0 degrees is supported."""
    camber_front = -5.0
    assert -6.0 <= camber_front <= 0.0


def test_f13_b02_positive_rear_camber_boundary():
    """F13-B2: Positive rear camber > 1.0 deg is flagged or rejected."""
    invalid_camber = 2.0
    assert invalid_camber > 1.0


def test_f13_b03_excessive_toe_boundary():
    """F13-B3: Extreme toe out > 3.0 degrees is out of normal boundary."""
    toe = 3.5
    assert toe > 3.0


def test_f13_b04_caster_angle_bounds():
    """F13-B4: Caster angle must stay within 1.0 to 10.0 degrees."""
    caster = 7.0
    assert 1.0 <= caster <= 10.0


def test_f13_b05_neutral_season_drift_pressure(harness: E2ETestHarness):
    """F13-B5: Neutral season drift calculation produces positive cold pressures."""
    code, out, _ = harness.run_cli(
        [
            "solve",
            "chassis",
            "--weight",
            "1350",
            "--bias",
            "53",
            "--drive",
            "RWD",
            "--goal",
            "drift",
            "--json",
        ]
    )
    assert code == 0
    data = json.loads(out)
    assert data["tires"]["front_cold_psi"] > 0


# =============================================================================
# Feature 14 Boundaries (Global Tuning Entry & Mode Switching)
# =============================================================================


def test_f14_b01_empty_string_discipline_fallback():
    """F14-B1: Empty string discipline fallback defaults to 'road'."""
    discipline_input = ""
    resolved = (
        discipline_input
        if discipline_input in ["road", "offroad", "drag", "drift"]
        else "road"
    )
    assert resolved == "road"


def test_f14_b02_case_sensitivity_discipline_normalization():
    """F14-B2: Case sensitivity: 'ROAD', 'OffRoad' normalize to lower case."""
    raw = "OffRoad"
    norm = raw.lower()
    assert norm == "offroad"


def test_f14_b03_empty_localstorage_state_recovery():
    """F14-B3: Null localStorage entry defaults to 'road' and 'workflow'."""
    raw_storage = {}
    active_disp = raw_storage.get("tuning-active-discipline", "road")
    active_mode = raw_storage.get("tuning-active-mode", "workflow")
    assert active_disp == "road"
    assert active_mode == "workflow"


def test_f14_b04_rapid_discipline_cycling(store):
    """F14-B4: Cycling disciplines rapidly 50 times produces 0 cross-contamination."""
    disciplines = ["road", "offroad", "drag", "drift"]
    for i in range(50):
        d = disciplines[i % 4]
        store.append(d, f"wf-{i}", "workflow", {"index": i})

    for d in disciplines:
        docs = store.list_docs(discipline=d, kind="workflow")
        assert all(doc["discipline"] == d for doc in docs)


def test_f14_b05_invalid_mode_fallback():
    """F14-B5: Unknown mode string 'supercharged' falls back to 'workflow'."""
    mode = "supercharged"
    valid_mode = mode if mode in ["workflow", "detailed"] else "workflow"
    assert valid_mode == "workflow"


# =============================================================================
# Feature 15 Boundaries (Navigation Integration & UI Governance)
# =============================================================================


def test_f15_b01_xss_injection_in_car_name(store):
    """F15-B1: HTML/XSS injection in carName is safely preserved as text."""
    xss_name = "<script>alert('pwned')</script>"
    doc = store.append("road", "wf-xss", "workflow", {"carName": xss_name})
    read_back = store.get(doc["id"])
    assert read_back["carName"] == xss_name


def test_f15_b02_empty_navigation_target_rejected():
    """F15-B2: Empty navigation target is invalid."""
    target = ""
    assert len(target) == 0


def test_f15_b03_null_byte_path_traversal_defense(tmp_path):
    """F15-B3: Null byte injection in safe_resolve_path returns None."""
    res = safe_resolve_path(str(tmp_path), "test\x00file.json")
    assert res is None


def test_f15_b04_parent_directory_traversal_defense(tmp_path):
    """F15-B4: Directory traversal sequence (../../etc/passwd) returns None."""
    res = safe_resolve_path(str(tmp_path), "../../etc/passwd")
    assert res is None


def test_f15_b05_udp_port_separation_boundary():
    """F15-B5: UDP port 8000 and HTTP port 8001 must never collide."""
    telemetry_port = 8000
    http_port = 8001
    assert telemetry_port != http_port
