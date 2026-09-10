"""Shared solver transport failures and CLI forwarding, independent of JS installation."""

import json
import subprocess
from types import SimpleNamespace

import pytest

from backend import tuning_solver_client as client
from backend.agent_cli import main


def test_no_runtime_does_not_fall_back_to_python(monkeypatch, capsys):
    monkeypatch.setattr(client.shutil, "which", lambda _: None)
    assert main(["solve", "chassis", "--weight", "1400", "--json"]) == 1
    assert "No Python fallback" in json.loads(capsys.readouterr().out)["error"]


def test_transport_sends_json_and_preserves_response(monkeypatch):
    monkeypatch.setattr(client.shutil, "which", lambda _: "node")
    request = {"schemaVersion": "tuning-solver/v1", "action": "chassis"}
    response = {"schemaVersion": "tuning-solver/v1", "workflow": {"value": 123}}

    def run(command, **kwargs):
        assert command[0] == "node"
        assert json.loads(kwargs["input"]) == request
        assert kwargs["timeout"] == 30
        assert kwargs.get("shell", False) is False
        return SimpleNamespace(returncode=0, stdout=json.dumps(response), stderr="")

    monkeypatch.setattr(client.subprocess, "run", run)
    assert client.solve_tuning(request) == response


@pytest.mark.parametrize("failure", ["timeout", "exit", "protocol"])
def test_transport_failure_is_explicit(monkeypatch, failure):
    monkeypatch.setattr(client.shutil, "which", lambda _: "node")

    def run(*args, **kwargs):
        if failure == "timeout":
            raise subprocess.TimeoutExpired("node", 30)
        return SimpleNamespace(
            returncode=1 if failure == "exit" else 0,
            stderr="solver failed",
            stdout='{"schemaVersion":"wrong"}',
        )

    monkeypatch.setattr(client.subprocess, "run", run)
    with pytest.raises(RuntimeError):
        client.solve_tuning({})


def test_workflow_passes_complete_input_without_defaults(tmp_path, monkeypatch, capsys):
    request = {
        "schemaVersion": "tuning-solver/v1",
        "action": "workflow",
        "goal": "Rally",
        "params": {"spring_front_max": 14.2},
        "engine": None,
    }
    file = tmp_path / "input.json"
    file.write_text(json.dumps(request), encoding="utf-8")

    def solve(payload):
        assert payload == request
        return {"schemaVersion": "tuning-solver/v1", "workflow": {"gearing": None}}

    monkeypatch.setattr("backend.agent_cli.solve_tuning", solve)
    assert main(["solve", "workflow", "--input", str(file), "--json"]) == 0
    assert json.loads(capsys.readouterr().out)["workflow"]["gearing"] is None
