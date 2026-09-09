"""Tests for FH6-HorizonTuner Agent CLI (backend/agent_cli.py)."""

from __future__ import annotations

import io
import json
import os
import sys
from unittest.mock import patch

import pytest

from backend.agent_cli import (
    BackendClient,
    CarDatabase,
    RuntimeContext,
    TuningMathSolver,
    main,
)

# =============================================================================
# 1. Runtime Context & Path Resolution Tests
# =============================================================================


def test_runtime_context_paths(tmp_path):
    ctx = RuntimeContext(data_dir=str(tmp_path), backend_url="http://127.0.0.1:9999")
    assert ctx.data_root == os.path.abspath(str(tmp_path))
    assert ctx.resolve_backend_url() == "http://127.0.0.1:9999"

    tunings_dir = ctx.resolve_tunings_dir()
    assert os.path.isdir(tunings_dir)
    assert tunings_dir.startswith(str(tmp_path))


def test_runtime_context_discovers_web_port(tmp_path):
    logs_dir = tmp_path / "logs"
    logs_dir.mkdir()
    port_file = logs_dir / "web_port.txt"
    port_file.write_text("8042", encoding="utf-8")

    ctx = RuntimeContext(data_dir=str(tmp_path))
    assert ctx.resolve_backend_url() == "http://127.0.0.1:8042"


# =============================================================================
# 2. Pure Math Solver Invariant Tests
# =============================================================================


def test_chassis_solver_road_awd():
    res = TuningMathSolver.calculate_chassis(
        weight_kg=1500.0,
        front_weight_bias=54.0,
        drivetrain="AWD",
        purpose="road",
    )
    assert res["schemaVersion"] == "tuning-dev/v1"
    assert res["goal"] == "road"
    assert res["drivetrain"] == "AWD"
    assert res["anti_roll_bars"]["front"] <= 5.0
    assert res["anti_roll_bars"]["rear"] >= 50.0
    assert res["springs"]["front_lbs_in"] > 0
    assert res["springs"]["rear_lbs_in"] > 0
    assert res["dampers"]["bump_front"] == round(
        res["dampers"]["rebound_front"] * 0.60, 1
    )
    assert res["differential"]["center_balance"] == 65


def test_chassis_solver_drift_rwd():
    res = TuningMathSolver.calculate_chassis(
        weight_kg=1300.0,
        front_weight_bias=50.0,
        drivetrain="RWD",
        purpose="drift",
    )
    assert res["goal"] == "drift"
    assert res["anti_roll_bars"]["front"] == 10.0
    assert res["anti_roll_bars"]["rear"] == 50.0
    assert res["dampers"]["rebound_front"] == 6.0
    assert res["dampers"]["rebound_rear"] == 6.0
    assert res["differential"]["rear_accel"] == 100
    assert res["differential"]["rear_decel"] == 100
    assert res["alignment"]["camber_front_deg"] == -3.5


def test_gearing_solver():
    res = TuningMathSolver.calculate_gearing(
        max_rpm=8000.0,
        peak_hp_rpm=7200.0,
        top_speed_kmh=280.0,
        gears_count=6,
    )
    assert "error" not in res
    assert res["gears_count"] == 6
    assert res["final_drive"] > 0
    assert len(res["gears"]) == 6
    assert res["gears"][0]["ratio"] > res["gears"][-1]["ratio"]
    assert (
        res["gears"][0]["speed_at_redline_kmh"]
        < res["gears"][-1]["speed_at_redline_kmh"]
    )


def test_export_applied_setup():
    chassis = TuningMathSolver.calculate_chassis(1400.0, 52.0, "AWD", "road")
    gearing = TuningMathSolver.calculate_gearing(8000.0, 7200.0, 300.0, 6)
    applied = TuningMathSolver.export_applied_setup(chassis, gearing)

    assert "tirePressureFront" in applied
    assert "camberFront" in applied
    assert "arbFront" in applied
    assert "springsFront" in applied
    assert "diffAccelRear" in applied
    assert "diffCenterRear" in applied
    assert applied["finalDrive"] == gearing["final_drive"]


def test_export_preset_format():
    chassis = TuningMathSolver.calculate_chassis(1400.0, 52.0, "RWD", "road")
    gearing = TuningMathSolver.calculate_gearing(8000.0, 7200.0, 300.0, 6)
    preset = TuningMathSolver.export_preset_format("302", "S1", chassis, gearing)

    assert preset["schemaVersion"] == "tuning-preset/v1"
    assert preset["vehicleClass"] == "S1"
    assert preset["profileUsed"] == "road"
    assert "arb_front" in preset["parameters"]
    assert "final_drive" in preset["parameters"]
    assert "chassis" in preset["solverOutputSnapshot"]


# =============================================================================
# 3. Car Database Offline Reader Tests
# =============================================================================


def test_car_database_search(tmp_path):
    ctx = RuntimeContext(data_dir=str(tmp_path))
    db = CarDatabase(ctx)
    results = db.search("Toyota", limit=5)
    assert isinstance(results, list)
    if results:
        assert any(
            "Toyota" in c.get("make", "") or "Toyota" in c.get("display_name", "")
            for c in results
        )


# =============================================================================
# 4. End-to-End CLI Invocation & Output Contracts
# =============================================================================


def test_cli_solve_chassis_json(capsys):
    cmd = [
        "solve",
        "chassis",
        "--weight",
        "1450",
        "--bias",
        "52",
        "--drive",
        "AWD",
        "--goal",
        "road",
        "--json",
    ]
    code = main(cmd)
    assert code == 0
    captured = capsys.readouterr()
    data = json.loads(captured.out)
    assert data["drivetrain"] == "AWD"
    assert data["goal"] == "road"
    assert data["anti_roll_bars"]["front"] == 3.1


def test_cli_solve_chassis_export_applied_setup(capsys):
    cmd = [
        "solve",
        "chassis",
        "--weight",
        "1300",
        "--bias",
        "50",
        "--drive",
        "RWD",
        "--export-applied-setup",
        "--json",
    ]
    code = main(cmd)
    assert code == 0
    captured = capsys.readouterr()
    data = json.loads(captured.out)
    assert "tirePressureFront" in data
    assert "arbFront" in data
    assert "springsFront" in data


def test_cli_solve_gearing_json(capsys):
    cmd = [
        "solve",
        "gearing",
        "--max-rpm",
        "8500",
        "--peak-hp-rpm",
        "7800",
        "--top-speed",
        "320",
        "--gears",
        "6",
        "--json",
    ]
    code = main(cmd)
    assert code == 0
    captured = capsys.readouterr()
    data = json.loads(captured.out)
    assert data["gears_count"] == 6
    assert data["final_drive"] > 0
    assert len(data["gears"]) == 6


def test_cli_solve_full_and_save(tmp_path, capsys):
    cmd = [
        "solve",
        "full",
        "--car-id",
        "test_car",
        "--save",
        "test_setup",
        "--data-dir",
        str(tmp_path),
        "--json",
    ]
    code = main(cmd)
    assert code == 0
    captured = capsys.readouterr()
    data = json.loads(captured.out)
    assert data["schemaVersion"] == "tuning-preset/v1"
    assert data["saved_to_disk"] is True
    assert os.path.isfile(data["saved_path"])


def test_cli_status_offline(capsys):
    cmd = ["status", "--backend-url", "http://127.0.0.1:59999", "--json"]
    code = main(cmd)
    assert code == 0
    captured = capsys.readouterr()
    data = json.loads(captured.out)
    assert data["backend_running"] is False
    assert data["mode"] == "offline"


def test_cli_mcp_config_json(capsys):
    cmd = [
        "mcp-config",
        "--client",
        "all",
        "--backend-url",
        "http://127.0.0.1:8001",
        "--json",
    ]
    code = main(cmd)
    assert code == 0
    captured = capsys.readouterr()
    data = json.loads(captured.out)
    assert "mcp_url" in data
    assert "codex" in data
    assert "claude_desktop" in data
    assert "cursor" in data


def test_cli_cars_search_json(capsys):
    cmd = ["cars", "search", "Civic", "--limit", "3", "--json"]
    code = main(cmd)
    assert code == 0
    captured = capsys.readouterr()
    data = json.loads(captured.out)
    assert data["query"] == "Civic"
    assert isinstance(data["cars"], list)


def test_cli_preset_list_and_get(tmp_path, capsys):
    tunings_dir = tmp_path / "tunings"
    tunings_dir.mkdir()
    preset_file = tunings_dir / "100-baseline.json"
    mock_content = {"schemaVersion": "tuning-preset/v1", "notes": "unit-test"}
    preset_file.write_text(json.dumps(mock_content), encoding="utf-8")

    # 1. Test preset list
    code_list = main(["preset", "list", "--data-dir", str(tmp_path), "--json"])
    assert code_list == 0
    data_list = json.loads(capsys.readouterr().out)
    assert "100-baseline" in data_list["presets"]

    # 2. Test preset get
    code_get = main(
        ["preset", "get", "100", "baseline", "--data-dir", str(tmp_path), "--json"]
    )
    assert code_get == 0
    data_get = json.loads(capsys.readouterr().out)
    assert data_get["notes"] == "unit-test"


def test_cli_telemetry_diagnose_offline_fallback(capsys):
    cmd = [
        "telemetry",
        "diagnose",
        "--symptom",
        "understeer_entry",
        "--tire-temps",
        "95.0",
        "95.0",
        "82.0",
        "82.0",
        "--backend-url",
        "http://127.0.0.1:59999",
        "--json",
    ]
    code = main(cmd)
    assert code == 0
    captured = capsys.readouterr()
    data = json.loads(captured.out)
    assert data["axle_delta_t_c"] > 5.0
    assert any("Front axle overheat" in act for act in data["actionable_directives"])
    assert any("Entry Understeer" in act for act in data["actionable_directives"])
