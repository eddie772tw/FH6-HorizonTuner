"""Process diagnostics retain relationships without collecting command lines."""

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from scripts.windows_process_snapshot import rooted_process_tree


def test_rooted_tree_includes_descendants_and_excludes_unrelated_processes():
    processes = [
        {"ProcessId": 30, "ParentProcessId": 20, "Name": "child.exe"},
        {"ProcessId": 40, "ParentProcessId": 30, "Name": "grandchild.exe"},
        {"ProcessId": 20, "ParentProcessId": 10, "Name": "root.exe"},
        {"ProcessId": 50, "ParentProcessId": 10, "Name": "other.exe"},
    ]
    result = rooted_process_tree(processes, 20)
    assert [process["ProcessId"] for process in result] == [20, 30, 40]
    result[0]["Name"] = "changed"
    assert processes[2]["Name"] == "root.exe"


def test_rooted_tree_retains_children_when_root_has_exited():
    processes = [{"ProcessId": 30, "ParentProcessId": 20, "Name": "child.exe"}]
    assert rooted_process_tree(processes, 20) == processes
    assert rooted_process_tree(processes, 99) == []


def test_rooted_tree_handles_cyclic_parent_relationships():
    processes = [
        {"ProcessId": 20, "ParentProcessId": 30, "Name": "root.exe"},
        {"ProcessId": 30, "ParentProcessId": 20, "Name": "child.exe"},
    ]
    assert rooted_process_tree(processes, 20) == processes


@pytest.mark.skipif(sys.platform != "win32", reason="Windows Toolhelp API")
def test_native_snapshot_finds_controlled_child_and_its_parent():
    code = """
import json, os, sys
from scripts.windows_process_snapshot import rooted_process_tree, snapshot_processes
processes = snapshot_processes()
own = next(process for process in processes if process['ProcessId'] == os.getpid())
root_pid = int(sys.argv[1])
tree_ids = {process['ProcessId'] for process in rooted_process_tree(processes, root_pid)}
print(json.dumps({'own': own, 'native_parent': os.getppid(), 'root_and_child_in_tree': {root_pid, os.getpid()} <= tree_ids}))
"""
    result = subprocess.run(
        [sys.executable, "-c", code, str(os.getpid())],
        cwd=Path(__file__).resolve().parents[2],
        capture_output=True,
        text=True,
        timeout=5,
        check=True,
        creationflags=subprocess.CREATE_NO_WINDOW,
    )
    captured = json.loads(result.stdout)
    # The uv-managed venv may insert a Python launcher between these processes.
    assert captured["own"]["ParentProcessId"] == captured["native_parent"]
    assert captured["own"]["ProcessId"] != os.getpid()
    assert captured["own"]["Name"].lower() == Path(sys.executable).name.lower()
    assert captured["root_and_child_in_tree"]
    assert set(captured["own"]) == {"ProcessId", "ParentProcessId", "Name"}
