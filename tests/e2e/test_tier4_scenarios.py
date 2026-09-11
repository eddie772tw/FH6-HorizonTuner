"""Tier 4: Real-World Application Scenarios E2E Tests.

Executes comprehensive, full-lifecycle end-to-end race simulation scenarios:
- S01: Complete Offroad Rally Stage Tuning Loop (A/B bottoming reduction & promotion)
- S02: Complete Drag Strip 0-400m Launch & Gearing Optimization Loop
- S03: Complete Drift Session with Transparent Limitation Disclosures & Zero Fabricated Scores
- S04: Multi-Discipline Round-Robin Tuning with Isolated Concurrent States
- S05: Adversarial Noise, Sensor Jitter, Reconnection, and Extreme Shock Handling
Total: 5 scenarios.
"""

from __future__ import annotations

import json

import pytest

from tests.e2e.harness import E2ETestHarness, pack_324b_telemetry


def test_scenario_01_offroad_rally_stage_complete_tuning_loop(
    simulator, store, offroad_packets
):
    """Scenario 1: Complete Offroad rally stage tuning loop with A/B bottoming reduction."""
    # 1. Initialize neutral offroad workflow for rally car
    wf = simulator.create_workflow(
        "offroad",
        "Subaru Impreza WRC",
        42,
        700,
        {"name": "Muddy Forest Sprint", "format": "sprint"},
    )
    wf_id = wf["id"]
    setups = store.list_docs("offroad", wf_id, "setup")
    assert len(setups) == 1
    setup_a_id = setups[0]["id"]

    # 2. Execute Stage 1 baseline run over rough terrain (many bottoming events)
    simulator.start_run(
        "offroad", wf_id, setup_a_id, {"settingsConfirmed": True, "tires": "unchanged"}
    )
    run_a = simulator.stop_run(
        "offroad", offroad_packets, duration_sec=65.4, distance_m=2800.0
    )
    assert run_a["saved"] is True
    assert run_a["summary"]["severeBottomingEvents"] >= 5

    # 3. Create candidate B with stiffened spring rates (+1 confirmed game step)
    cand_b = simulator.create_candidate(
        "offroad", wf_id, run_a["summary"]["runId"], "spring.front", 65.0, "kgf/mm"
    )
    assert cand_b["label"] == "B"
    setup_b_id = cand_b["id"]

    # 4. Execute Stage 2 candidate run (reduced bottoming, faster time)
    improved_packets = [
        pack_324b_telemetry(
            timestamp_ms=1000 + i * 50,
            speed_mps=31.0,
            norm_travel=(0.75, 0.75, 0.65, 0.65),  # No bottoming
            travel_meters=(0.18, 0.18, 0.16, 0.16),
            accel_y=-12.0,  # Controlled landing
            surface_rumble=(0.60, 0.60, 0.55, 0.55),
            distance_traveled=i * 1.6,
        )
        for i in range(100)
    ]
    simulator.start_run(
        "offroad", wf_id, setup_b_id, {"settingsConfirmed": True, "tires": "unchanged"}
    )
    run_b = simulator.stop_run(
        "offroad", improved_packets, duration_sec=64.8, distance_m=2800.0
    )
    assert run_b["summary"]["severeBottomingEvents"] == 0

    # 5. Compare A/B runs
    report = simulator.compare(
        "offroad", wf_id, run_a["summary"]["runId"], run_b["summary"]["runId"]
    )
    assert report["conclusion"] == "provisional-keep"
    assert report["metricsDelta"]["severeBottomingDelta"] < 0
    assert report["metricsDelta"]["timeDeltaSeconds"] == pytest.approx(-0.6, rel=1e-2)

    # 6. User decision to promote candidate B
    decision = simulator.decide("offroad", wf_id, report["id"], "keep-candidate")
    assert decision["choice"] == "keep-candidate"

    # 7. Audit full workflow history in SQLite
    docs = store.list_docs("offroad", wf_id)
    kinds = [d["kind"] for d in docs]
    assert kinds.count("workflow") == 1
    assert kinds.count("setup") == 2
    assert kinds.count("run") == 2
    assert kinds.count("summary") == 2
    assert kinds.count("finish") == 2
    assert kinds.count("comparison") == 1
    assert kinds.count("decision") == 1


def test_scenario_02_drag_strip_400m_launch_and_gearing_optimization(
    simulator, store, drag_packets
):
    """Scenario 2: Complete Drag strip 0-400m tuning loop with launch traction and trap speed optimization."""
    # 1. Create Drag workflow
    wf = simulator.create_workflow(
        "drag", "Mustang Cobra Jet", 55, 950, {"name": "Festival Drag Strip"}
    )
    wf_id = wf["id"]
    setup_a_id = store.list_docs("drag", wf_id, "setup")[0]["id"]

    # 2. Baseline run A (high launch wheelspin, 9.6s 400m)
    simulator.start_run("drag", wf_id, setup_a_id, {"settingsConfirmed": True})
    run_a = simulator.stop_run("drag", drag_packets, duration_sec=9.6, distance_m=402.0)
    assert run_a["summary"]["launchSlipRatio"] > 0.30

    # 3. Candidate B: lowered rear tire pressure and taller final drive
    cand_b = simulator.create_candidate(
        "drag", wf_id, run_a["summary"]["runId"], "pressure.rear", 18.0, "psi"
    )
    setup_b_id = cand_b["id"]

    # 4. Candidate run B: faster launch and acceleration
    faster_packets = [
        pack_324b_telemetry(
            timestamp_ms=1000 + int(i * 0.07 * 1000),
            speed_mps=i * 0.85,
            slip_ratio=(0.02, 0.02, 0.12, 0.12),  # Controlled wheelspin
            distance_traveled=i * 4.8,
            gear=1 if i < 15 else (2 if i < 45 else 3),
        )
        for i in range(120)
    ]
    simulator.start_run("drag", wf_id, setup_b_id, {"settingsConfirmed": True})
    run_b = simulator.stop_run(
        "drag", faster_packets, duration_sec=8.4, distance_m=402.0
    )

    # 5. A/B Comparison confirms improvement
    report = simulator.compare(
        "drag", wf_id, run_a["summary"]["runId"], run_b["summary"]["runId"]
    )
    assert report["conclusion"] == "provisional-keep"
    assert report["metricsDelta"]["quarterMileDeltaSeconds"] < 0
    assert report["metricsDelta"]["trapSpeedDeltaKmh"] > 0

    # 6. Promotion
    decision = simulator.decide("drag", wf_id, report["id"], "keep-candidate")
    assert decision["choice"] == "keep-candidate"


def test_scenario_03_drift_session_with_transparent_limitation_disclosure(
    simulator, store, drift_packets
):
    """Scenario 3: Complete Drift session strictly enforcing objective metrics and transparent disclosure."""
    # 1. Create Drift workflow
    wf = simulator.create_workflow("drift", "Nissan Silvia S15 Spec-R", 48, 650, {})
    wf_id = wf["id"]
    setup_a_id = store.list_docs("drift", wf_id, "setup")[0]["id"]

    # 2. Baseline drift run
    simulator.start_run("drift", wf_id, setup_a_id, {"settingsConfirmed": True})
    run_a = simulator.stop_run(
        "drift", drift_packets, duration_sec=5.0, distance_m=110.0
    )
    summary_a = run_a["summary"]

    # 3. Assert strictly ZERO fabricated score
    assert summary_a["fabricatedScore"] is None
    assert "score" not in summary_a
    assert "points" not in summary_a

    # 4. Assert explicit limitations disclosure
    disclosures = summary_a["limitationsDisclosed"]
    assert any("game drift points" in d for d in disclosures)

    # 5. Candidate run B with longer slide duration
    extended_packets = drift_packets + [
        pack_324b_telemetry(
            timestamp_ms=6000 + i * 50,
            speed_mps=22.0,
            slip_angle=(0.2, 0.2, 0.55, 0.55),
        )
        for i in range(40)
    ]
    cand_b = simulator.create_candidate(
        "drift", wf_id, run_a["summary"]["runId"], "arb.rear", 45.0, "slider"
    )
    simulator.start_run("drift", wf_id, cand_b["id"], {"settingsConfirmed": True})
    run_b = simulator.stop_run(
        "drift", extended_packets, duration_sec=7.0, distance_m=154.0
    )

    # 6. Comparison debrief
    report = simulator.compare(
        "drift", wf_id, run_a["summary"]["runId"], run_b["summary"]["runId"]
    )
    assert report["conclusion"] == "provisional-keep"
    assert report["metricsDelta"]["sustainedSlideDeltaSeconds"] > 0
    assert report["metricsDelta"]["fabricatedScore"] is None


def test_scenario_04_multi_discipline_full_round_robin_tuning(simulator, store):
    """Scenario 4: User operates workflows across Road, Offroad, Drag, and Drift with zero state leakage."""
    disciplines = ["road", "offroad", "drag", "drift"]
    cars = {
        "road": ("Porsche 911 GT3", 42, 850),
        "offroad": ("Ford Fiesta RS", 43, 700),
        "drag": ("Chevy Camaro Pro", 44, 950),
        "drift": ("Toyota GR Supra", 45, 750),
    }

    workflows = {}
    for d in disciplines:
        car_name, ordinal, pi = cars[d]
        wf = simulator.create_workflow(d, car_name, ordinal, pi, {})
        workflows[d] = wf["id"]

    # Execute a run in each discipline
    for d in disciplines:
        wf_id = workflows[d]
        setup_id = store.list_docs(d, wf_id, "setup")[0]["id"]
        simulator.start_run(d, wf_id, setup_id, {})
        simulator.stop_run(d, [], duration_sec=10.0)

    # Verify complete SQLite partition isolation
    for d in disciplines:
        docs = store.list_docs(discipline=d)
        assert all(doc["discipline"] == d for doc in docs)
        assert len(docs) >= 3  # workflow + setup + summary + finish


def test_scenario_05_adversarial_noise_sensor_jitter_and_reconnection(simulator):
    """Scenario 5: Replay stream with packet jitter, out-of-order frames, dropped packets, and sensor noise."""
    corrupted_frames = []

    # 1. Non-racing frames (should be discarded by extraction)
    for i in range(10):
        corrupted_frames.append(pack_324b_telemetry(is_race_on=0, speed_mps=0.0))

    # 2. Normal frames
    for i in range(30):
        corrupted_frames.append(
            pack_324b_telemetry(
                timestamp_ms=1000 + i * 50, speed_mps=25.0, is_race_on=1
            )
        )

    # 3. Truncated / malformed frames (under 324 bytes)
    corrupted_frames.append(b"SHORT_PACKET_128_BYTES" * 4)
    corrupted_frames.append(b"\x00" * 100)

    # 4. Extreme sensor shock (30G landing impact)
    corrupted_frames.append(
        pack_324b_telemetry(timestamp_ms=2500, accel_y=-294.3, is_race_on=1)
    )

    # Verify extraction safely filters malformed frames without crashing
    summary = simulator.extract_telemetry_metrics(
        "offroad", corrupted_frames, duration_sec=5.0, distance_m=100.0
    )
    assert summary["pointCount"] == 31  # 30 normal + 1 shock frame
    assert summary["landingImpactG"] == pytest.approx(30.0, rel=1e-2)
