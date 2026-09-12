"""Exercise the Windows build entry using tools with controlled outcomes."""

import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
pytestmark = pytest.mark.skipif(sys.platform != "win32", reason="Windows batch entry")


@pytest.fixture
def build_workspace(tmp_path):
    root = tmp_path / "checkout with spaces"
    root.mkdir()
    shutil.copyfile(ROOT / "build_all.bat", root / "build_all.bat")
    for relative in (
        ".venv/Scripts/python.exe",
        "frontend/node_modules/.bin/tauri.cmd",
    ):
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.touch()
    tools = tmp_path / "fake tools"
    tools.mkdir()
    (tools / "uv.cmd").write_text(
        "@echo off\n"
        'echo uv %*>>"%TRACE%"\n'
        'if "%FAIL_STAGE%"=="python" exit /b 7\n'
        'if not exist "%FIXTURE%\\dist" mkdir "%FIXTURE%\\dist"\n'
        'echo backend>"%FIXTURE%\\dist\\server-sidecar-x86_64-pc-windows-msvc.exe"\n'
        "exit /b 0\n",
        encoding="utf-8",
    )
    (tools / "pnpm.cmd").write_text(
        "@echo off\n"
        'echo pnpm %*>>"%TRACE%"\n'
        'if "%FAIL_STAGE%"=="frontend" exit /b 9\n'
        'if not exist "%FIXTURE%\\frontend\\src-tauri\\target\\release" mkdir "%FIXTURE%\\frontend\\src-tauri\\target\\release"\n'
        'echo host>"%FIXTURE%\\frontend\\src-tauri\\target\\release\\FH6-HorizonTuner.exe"\n'
        "exit /b 0\n",
        encoding="utf-8",
    )
    env = os.environ.copy()
    env.update(
        PATH=str(tools) + os.pathsep + env["PATH"],
        FIXTURE=str(root),
        TRACE=str(tmp_path / "commands.txt"),
        FH6_RUN_PNPM_AUDIT="0",
    )
    return root, env


@pytest.mark.parametrize("failure", ["", "python", "frontend"])
def test_build_exit_and_artifacts_from_an_unrelated_directory(
    build_workspace, tmp_path, failure
):
    root, env = build_workspace
    env["FAIL_STAGE"] = failure
    result = subprocess.run(
        f'"{os.environ["COMSPEC"]}" /d /s /c ""{root / "build_all.bat"}""',
        cwd=tmp_path,
        env=env,
        capture_output=True,
        text=True,
        timeout=15,
    )
    assert (result.returncode == 0) is (not failure), result.stdout + result.stderr
    for name in ("FH6-HorizonTuner.exe", "FH6-HorizonTuner_lite.exe"):
        assert (root / "dist" / name).exists() is (not failure)
    commands = Path(env["TRACE"]).read_text()
    assert "pip install" not in commands
    assert " install " not in commands
