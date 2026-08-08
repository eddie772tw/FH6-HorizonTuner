import json
import os
import socket
import sqlite3
import subprocess
import sys
import time
from ctypes import wintypes

import pytest


def get_pe_string_info(filepath: str, key: str) -> str:
    """Read Windows PE Version String Resource using win32 API if available."""
    if sys.platform != "win32":
        return ""
    try:
        import ctypes
        from ctypes import wintypes

        size = ctypes.windll.version.GetFileVersionInfoSizeW(filepath, None)
        if size == 0:
            return ""

        buffer = ctypes.create_string_buffer(size)
        if not ctypes.windll.version.GetFileVersionInfoW(filepath, 0, size, buffer):
            return ""

        # Language 0409 (US English), Codepage 04b0 (Unicode) or 0409 04e4 / 0000 04b0
        for lang_codepage in ["040904b0", "040904e4", "000004b0"]:
            sub_block = f"\\StringFileInfo\\{lang_codepage}\\{key}"
            val_ptr = wintypes.LPWSTR()
            val_len = wintypes.UINT()
            if ctypes.windll.version.VerQueryValueW(
                buffer, sub_block, ctypes.byref(val_ptr), ctypes.byref(val_len)
            ):
                if val_ptr.value:
                    return val_ptr.value
        return ""
    except Exception:
        return ""


def find_executable_paths():
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    sidecar_path = os.path.join(
        root_dir,
        "frontend",
        "src-tauri",
        "bin",
        "server-sidecar-x86_64-pc-windows-msvc.exe",
    )
    if not os.path.exists(sidecar_path):
        sidecar_path = os.path.join(
            root_dir, "dist", "server-sidecar-x86_64-pc-windows-msvc.exe"
        )

    standalone_candidates = [
        os.path.join(root_dir, "dist", "FH6-HorizonTuner.exe"),
        os.path.join(
            root_dir,
            "frontend",
            "src-tauri",
            "target",
            "release",
            "FH6-HorizonTuner.exe",
        ),
    ]
    standalone_exe = next(
        (path for path in standalone_candidates if os.path.exists(path)),
        standalone_candidates[0],
    )
    return sidecar_path, standalone_exe


def test_sidecar_executable_existence_and_metadata():
    sidecar_path, standalone_exe = find_executable_paths()

    target_exe = None
    if os.path.exists(sidecar_path):
        target_exe = sidecar_path
    elif os.path.exists(standalone_exe):
        target_exe = standalone_exe

    if not target_exe:
        pytest.skip(
            "No compiled executable found to verify metadata. Build executable first."
        )

    assert os.path.exists(target_exe), f"Executable does not exist at {target_exe}"
    assert os.path.getsize(target_exe) > 100000, (
        f"Executable file {target_exe} is surprisingly small"
    )

    if sys.platform == "win32":
        company = get_pe_string_info(target_exe, "CompanyName")
        version = get_pe_string_info(target_exe, "FileVersion")
        if company:
            assert company == "eddie772tw", (
                f"Expected CompanyName 'eddie772tw', got '{company}'"
            )
        if version:
            assert version.startswith("11.45.14"), (
                f"Expected FileVersion starting with '11.45.14', got '{version}'"
            )


def test_executable_bootstrap_and_config_interaction(tmp_path):
    sidecar_path, standalone_exe = find_executable_paths()

    target_exe = standalone_exe if os.path.exists(standalone_exe) else None

    if not target_exe:
        pytest.skip("No portable Tauri executable found to run integration test.")

    test_data_dir = tmp_path / "test_data_root"
    test_data_dir.mkdir(parents=True, exist_ok=True)

    # Launch Executable as sidecar with --data-dir argument
    # The sidecar is a long-running server. Do not call communicate() here:
    # it waits for the server to exit and can hang on Windows when a frozen
    # child process still owns one of the inherited pipe handles.
    proc = subprocess.Popen(
        [target_exe, "--data-dir", str(test_data_dir)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        stdin=subprocess.PIPE,
        text=True,
    )

    settings_file = test_data_dir / "settings.json"
    startup_deadline = time.monotonic() + 15.0
    try:
        while not settings_file.exists() and time.monotonic() < startup_deadline:
            if proc.poll() is not None:
                break
            time.sleep(0.25)
    finally:
        # Closing stdin is the sidecar's graceful shutdown signal. Fall back
        # to terminate/kill so a failed startup can never leave CI hanging.
        if proc.stdin is not None and not proc.stdin.closed:
            proc.stdin.close()
        try:
            proc.wait(timeout=5.0)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5.0)

    # Assert 1: settings.json created and readable
    assert settings_file.exists(), (
        "settings.json was not created in --data-dir. "
        f"backend log: {test_data_dir / 'logs' / 'backend.log'}"
    )
    with open(settings_file, "r", encoding="utf-8") as f:
        settings = json.load(f)
        assert "units" in settings, "settings.json is missing 'units' key"
        assert "telemetry_port" in settings, "settings.json is missing 'telemetry_port'"

    # Assert 2: lang/ bootstrapped with default translations
    lang_dir = test_data_dir / "lang"
    assert lang_dir.exists(), "lang directory was not created"
    lang_files = list(lang_dir.glob("*.json"))
    assert len(lang_files) > 0, (
        "lang directory does not contain bootstrapped language files"
    )

    # Assert 3: car_params/, hud_overlay/, tunings/, drag_sessions/, user_configs/ created
    assert (test_data_dir / "car_params").exists(), "car_params directory missing"
    assert (test_data_dir / "hud_overlay").exists(), "hud_overlay directory missing"
    assert (test_data_dir / "tunings").exists(), "tunings directory missing"
    assert (test_data_dir / "drag_sessions").exists(), "drag_sessions directory missing"
    assert (test_data_dir / "user_configs").exists(), "user_configs directory missing"

    # Assert 4: sessions/ created and SQLite DB initialized
    sessions_dir = test_data_dir / "sessions"
    assert sessions_dir.exists(), "sessions directory missing"
    db_file = sessions_dir / "telemetry_sessions.db"
    assert db_file.exists(), "SQLite database telemetry_sessions.db was not created"

    # Verify SQLite schema integrity
    conn = sqlite3.connect(str(db_file))
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = [row[0] for row in cursor.fetchall()]
    conn.close()
    assert "sessions" in tables, "sessions table missing in SQLite DB"

    # Assert 5: logs/ created and backend.log written
    logs_dir = test_data_dir / "logs"
    assert logs_dir.exists(), "logs directory missing"
    log_file = logs_dir / "backend.log"
    assert log_file.exists(), "backend.log missing"
    with open(log_file, "r", encoding="utf-8") as f:
        log_content = f.read()
        assert len(log_content) > 0, "backend.log is empty"


def wait_for_process_exit(proc, timeout=10.0):
    try:
        proc.wait(timeout=timeout)
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
        pytest.fail("portable executable did not terminate within the timeout")


def close_portable_process(proc):
    if sys.platform == "win32":
        import ctypes

        user32 = ctypes.windll.user32
        window_handle = wintypes.HWND()
        enum_windows = user32.EnumWindows
        get_window_pid = user32.GetWindowThreadProcessId

        @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
        def find_main_window(hwnd, _lparam):
            process_id = wintypes.DWORD()
            get_window_pid(hwnd, ctypes.byref(process_id))
            if process_id.value == proc.pid and user32.IsWindowVisible(hwnd):
                window_handle.value = hwnd
                return False
            return True

        enum_windows(find_main_window, 0)
        if window_handle.value:
            user32.PostMessageW(window_handle, 0x0010, 0, 0)  # WM_CLOSE

    if proc.stdin is not None and not proc.stdin.closed:
        proc.stdin.close()
    wait_for_process_exit(proc)


@pytest.mark.skipif(sys.platform != "win32", reason="Portable lifecycle is Windows-specific")
def test_portable_executable_releases_udp_port_for_restart(tmp_path):
    _, standalone_exe = find_executable_paths()
    if not os.path.exists(standalone_exe):
        pytest.skip("No portable Tauri executable found to run lifecycle test.")

    telemetry_port = 8000
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as availability_probe:
        try:
            availability_probe.bind(("127.0.0.1", telemetry_port))
        except OSError as error:
            pytest.fail(f"UDP {telemetry_port} must be available for this test: {error}")

    environment = os.environ.copy()
    environment["TELEMETRY_IP"] = "127.0.0.1"
    environment["TELEMETRY_PORT"] = str(telemetry_port)

    for run_number in (1, 2):
        data_dir = tmp_path / f"lifecycle_run_{run_number}"
        data_dir.mkdir(parents=True, exist_ok=True)
        proc = subprocess.Popen(
            [standalone_exe, "--data-dir", str(data_dir)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            stdin=subprocess.PIPE,
            env=environment,
            text=True,
        )

        port_file = data_dir / "logs" / "web_port.txt"
        deadline = time.monotonic() + 15.0
        while not port_file.exists() and time.monotonic() < deadline:
            if proc.poll() is not None:
                break
            time.sleep(0.25)

        try:
            assert port_file.exists(), (
                f"backend did not publish a web port on lifecycle run {run_number}; "
                f"log: {data_dir / 'logs' / 'backend.log'}"
            )
        finally:
            close_portable_process(proc)

        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.bind(("127.0.0.1", telemetry_port))
