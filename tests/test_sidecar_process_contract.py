"""Fast process-level contract tests for the unfrozen backend sidecar.

These tests intentionally run ``backend/main.py`` directly.  They catch the
``--data-dir`` bootstrap, readiness and stdin-EOF shutdown contract before CI
spends time building the PyInstaller and Tauri executables.  The executable
bundle suite remains responsible for verifying that the same contract survives
packaging.
"""

import os
import socket
import subprocess
import sys
import time
from pathlib import Path

import pytest

ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"


def get_available_udp_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


def get_available_tcp_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


def stop_process(proc: subprocess.Popen[bytes]) -> None:
    if proc.stdin is not None and not proc.stdin.closed:
        proc.stdin.close()
    try:
        proc.wait(timeout=5.0)
    except subprocess.TimeoutExpired:
        if sys.platform == "win32":
            subprocess.run(
                ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        else:
            proc.kill()
        proc.wait(timeout=5.0)
        pytest.fail("source sidecar did not exit after stdin was closed")


@pytest.mark.windows_contract
def test_source_sidecar_bootstraps_and_releases_udp_port(tmp_path):
    """The Release Build sidecar contract works before packaging it into an EXE."""
    data_dir = tmp_path / "portable-data"
    udp_port = get_available_udp_port()
    environment = os.environ.copy()
    environment.update(
        {
            "TELEMETRY_IP": "127.0.0.1",
            "TELEMETRY_PORT": str(udp_port),
        }
    )

    proc = subprocess.Popen(
        [sys.executable, "-u", "main.py", "--data-dir", str(data_dir)],
        cwd=BACKEND_DIR,
        stdin=subprocess.PIPE,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        env=environment,
    )

    port_file = data_dir / "logs" / "web_port.txt"
    deadline = time.monotonic() + 10.0
    try:
        while not port_file.exists() and time.monotonic() < deadline:
            if proc.poll() is not None:
                break
            time.sleep(0.1)

        assert port_file.exists(), (
            "source sidecar did not publish logs/web_port.txt; "
            f"backend log: {data_dir / 'logs' / 'backend.log'}"
        )
    finally:
        stop_process(proc)

    assert proc.returncode == 0
    assert port_file.read_text(encoding="utf-8").strip() == "8001"
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
        probe.bind(("127.0.0.1", udp_port))


@pytest.mark.windows_contract
def test_source_sidecar_falls_back_when_preferred_http_port_is_occupied(tmp_path):
    """Fallback publishes the actual dynamic port, never the preferred port."""
    data_dir = tmp_path / "release-data"
    udp_port = get_available_udp_port()
    environment = os.environ.copy()
    environment.update(
        {
            "TELEMETRY_IP": "127.0.0.1",
            "TELEMETRY_PORT": str(udp_port),
        }
    )

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as occupied_port:
        try:
            occupied_port.bind(("127.0.0.1", 8001))
            occupied_port.listen(1)
        except OSError:
            pytest.skip("HTTP port 8001 is already occupied by another process")

        proc = subprocess.Popen(
            [sys.executable, "-u", "main.py", "--data-dir", str(data_dir)],
            cwd=BACKEND_DIR,
            stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            env=environment,
        )

        port_file = data_dir / "logs" / "web_port.txt"
        deadline = time.monotonic() + 10.0
        try:
            while not port_file.exists() and time.monotonic() < deadline:
                if proc.poll() is not None:
                    break
                time.sleep(0.1)

            assert port_file.exists(), "sidecar did not publish fallback HTTP port"
            assert int(port_file.read_text(encoding="utf-8").strip()) != 8001
        finally:
            stop_process(proc)

        assert proc.returncode == 0
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
        probe.bind(("127.0.0.1", udp_port))
