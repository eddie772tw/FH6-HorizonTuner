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
    for relative in ("frontend/node_modules/.bin/tauri.cmd",):
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.touch()
    tools = tmp_path / "fake tools"
    tools.mkdir()
    (tools / "cargo.cmd").write_text("@exit /b 0\n", encoding="utf-8")
    (root / "scripts").mkdir()
    (root / "scripts/build_backend.ps1").write_text(
        "Add-Content -LiteralPath $env:TRACE -Value 'Rust backend'\n"
        "if ($env:FAIL_STAGE -eq 'backend') { exit 7 }\n"
        "$output = Join-Path $env:FIXTURE 'dist'\n"
        "New-Item -ItemType Directory -Force -Path $output | Out-Null\n"
        "Set-Content -LiteralPath (Join-Path $output 'server-sidecar-x86_64-pc-windows-msvc.exe') -Value 'backend'\n",
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


@pytest.mark.parametrize("failure", ["", "backend", "frontend"])
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
    assert ("Rust backend" in commands) is (failure != "frontend")
    assert ("tauri build" in commands) is (not failure)
