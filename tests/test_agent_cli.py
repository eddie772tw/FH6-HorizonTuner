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
    TuningMathClient,
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
# 2. CLI delegation and serialization (physics parity is tested in Vitest)
# =============================================================================


@pytest.fixture
def solver_response(monkeypatch):
    # Deliberately arbitrary values: CLI must pass these through, not recalculate.
    applied = {
        "tirePressureFront": 27.3,
        "tirePressureRear": 28.7,
        "camberFront": -1.7,
        "camberRear": -0.9,
        "toeFront": 0.2,
        "toeRear": -0.1,
        "caster": 6.3,
        "arbFront": 3.1,
        "arbRear": 55.7,
        "springsFront": 11.7,
        "springsRear": 13.2,
        "rideHeightFront": 9.5,
        "rideHeightRear": 10.5,
        "reboundFront": 10.2,
        "reboundRear": 9.3,
        "bumpFront": 6.1,
        "bumpRear": 5.6,
        "diffAccelRear": 63,
        "diffDecelRear": 22,
        "diffAccelFront": 14,
        "diffDecelFront": 0,
        "diffCenterRear": 68,
    }
    chassis = {
        "schemaVersion": "tuning-dev/v1",
        "goal": "road",
        "drivetrain": "AWD",
        "anti_roll_bars": {"front": 3.1, "rear": 55.7},
        "appliedSetup": applied,
        "solverInput": {"params": {"weight": 1450, "drivetrain": "AWD"}},
    }
    gearing = {
        "final_drive": 4.21,
        "gears_count": 6,
        "gears": [{"gear": i, "ratio": 1.0} for i in range(1, 7)],
    }
    response = {
        "schemaVersion": "tuning-solver/v1",
        "chassis": chassis,
        "gearing": gearing,
        "appliedSetup": applied,
    }
    calls = []

    def fake_solve(request):
        calls.append(request)
        return response

    monkeypatch.setattr("backend.tuning_solver_client.solve_tuning", fake_solve)
    return response, calls


def test_chassis_delegates_inputs_without_own_formula(solver_response):
    response, calls = solver_response
    result = TuningMathClient.calculate_chassis(1300, 0.5, "RWD", "drift", 100, 200)
    assert result is response["chassis"]
    assert calls[0]["goal"] == "Drift"
    assert calls[0]["params"]["weight"] == 1300
    assert calls[0]["params"]["weight_distribution"] == 50
    assert calls[0]["ignoredLegacyAeroLbf"]["front"] == 100
    assert calls[0]["params"]["aero_downforce_front"] == 0


def test_gearing_delegates_explicit_target_and_goal(solver_response):
    response, calls = solver_response
    result = TuningMathClient.calculate_gearing(8000, 7200, 280, 6, purpose="rally")
    assert result is response["gearing"]
    assert calls[0]["goal"] == "Rally"
    assert calls[0]["correction"] == {"targetSpeedKmh": 280, "targetRpm": 7200}
    assert calls[0]["tireDiameterCm"] == 65


def test_export_applied_setup_preserves_shared_units_and_height(solver_response):
    response, _ = solver_response
    applied = TuningMathClient.export_applied_setup(
        response["chassis"], response["gearing"]
    )
    assert applied == {**response["appliedSetup"], "finalDrive": 4.21}
    assert "finalDrive" not in response["appliedSetup"]


def test_export_preset_format(solver_response):
    response, _ = solver_response
    preset = TuningMathClient.export_preset_format(
        "302", "S1", response["chassis"], response["gearing"]
    )
    assert preset["schemaVersion"] == "tuning-preset/v1"
    assert preset["gameBuild"] == "unknown"
    assert preset["vehicleClass"] == "S1"
    assert (
        preset["parameters"]["spring_front"] == response["appliedSetup"]["springsFront"]
    )
    assert (
        preset["parameters"]["ride_height_f"]
        == response["appliedSetup"]["rideHeightFront"]
    )
    assert preset["parameters"]["final_drive"] == response["gearing"]["final_drive"]


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


def test_cli_solve_chassis_json(capsys, solver_response):
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


def test_cli_solve_chassis_export_applied_setup(capsys, solver_response):
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


def test_cli_solve_gearing_json(capsys, solver_response):
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


def test_cli_solve_full_and_save(tmp_path, capsys, solver_response):
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
