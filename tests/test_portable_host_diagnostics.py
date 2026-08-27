import hashlib
import json
import os
import socket
import sqlite3
import subprocess
import sys
import time
import traceback
import urllib.request
from ctypes import wintypes
from pathlib import Path

import pytest


def get_pe_string_info(filepath: str, key: str) -> str:
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


def find_lite_executable_path():
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    candidates = [
        os.path.join(root_dir, "dist", "FH6-HorizonTuner_lite.exe"),
        os.path.join(
            root_dir,
            "frontend",
            "src-tauri",
            "target",
            "release",
            "FH6-HorizonTuner_lite.exe",
        ),
    ]
    return next((path for path in candidates if os.path.exists(path)), candidates[0])


def get_available_udp_port():
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


def get_file_sha256(filepath: str) -> str:
    sha256_hash = hashlib.sha256()
    with open(filepath, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()


def collect_diagnostics(
    target_exe, proc, data_dir, cmdline, run_label, stdout_file, stderr_file
):
    diag_dir = Path("diagnostics_output") / run_label
    diag_dir.mkdir(parents=True, exist_ok=True)

    diag_info = {
        "command_line": cmdline,
        "executable_path": str(target_exe),
        "executable_sha256": get_file_sha256(target_exe),
        "parent_pid": proc.pid,
        "exit_code": proc.poll(),
    }

    with open(diag_dir / "info.json", "w", encoding="utf-8") as f:
        json.dump(diag_info, f, indent=4)

    try:
        ps_cmd = (
            "Get-CimInstance Win32_Process | "
            "Select-Object ProcessId, ParentProcessId, Name, CommandLine | "
            "ConvertTo-Json -Depth 2"
        )
        ps_proc = subprocess.run(
            ["powershell", "-Command", ps_cmd], capture_output=True, text=True
        )
        with open(diag_dir / "process_tree.json", "w", encoding="utf-8") as f:
            f.write(ps_proc.stdout)

        tree_script = f"""
$all = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name, CommandLine
$root_pid = {proc.pid}
$visited = New-Object System.Collections.Generic.HashSet[int]
function Get-Tree($pid) {{
    if ($visited.Contains($pid)) {{ return }}
    $visited.Add($pid) | Out-Null
    $proc = $all | Where-Object ProcessId -eq $pid
    if ($proc) {{
        $proc
    }}
    $children = $all | Where-Object ParentProcessId -eq $pid
    foreach ($child in $children) {{
        Get-Tree $child.ProcessId
    }}
}}
Get-Tree $root_pid | ConvertTo-Json -Depth 2
"""
        ps_tree_proc = subprocess.run(
            ["powershell", "-Command", tree_script], capture_output=True, text=True
        )
        with open(diag_dir / "process_tree_rooted.json", "w", encoding="utf-8") as f:
            f.write(ps_tree_proc.stdout)
    except Exception as e:
        with open(diag_dir / "process_tree_error.txt", "w", encoding="utf-8") as f:
            f.write(str(e))

    log_dir = Path(data_dir) / "logs"
    if log_dir.exists():
        for log_file in log_dir.glob("*"):
            try:
                content = log_file.read_text(encoding="utf-8")
                (diag_dir / log_file.name).write_text(content, encoding="utf-8")
            except Exception:
                pass

    if stdout_file and os.path.exists(stdout_file):
        try:
            (diag_dir / "stdout.txt").write_text(
                Path(stdout_file).read_text(encoding="utf-8"), encoding="utf-8"
            )
        except Exception:
            pass

    if stderr_file and os.path.exists(stderr_file):
        try:
            (diag_dir / "stderr.txt").write_text(
                Path(stderr_file).read_text(encoding="utf-8"), encoding="utf-8"
            )
        except Exception:
            pass


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
        try:
            proc.wait(timeout=5.0)
        except subprocess.TimeoutExpired:
            pytest.fail("portable executable did not terminate within the timeout")


def close_portable_process(proc, expected_window_title=None):
    if proc.poll() is not None:
        return

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
                if expected_window_title is not None:
                    title_buffer = ctypes.create_unicode_buffer(512)
                    user32.GetWindowTextW(hwnd, title_buffer, len(title_buffer))
                    if expected_window_title not in title_buffer.value:
                        return True
                window_handle.value = hwnd
                return False
            return True

        enum_windows(find_main_window, 0)
        if window_handle.value:
            user32.PostMessageW(window_handle, 0x0010, 0, 0)  # WM_CLOSE

    if proc.stdin is not None and not proc.stdin.closed:
        proc.stdin.close()
    wait_for_process_exit(proc)


def has_visible_window_title(process_id, expected_title):
    if sys.platform != "win32":
        return False

    import ctypes

    user32 = ctypes.windll.user32
    found = False

    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def find_window(hwnd, _lparam):
        nonlocal found
        owner_pid = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(owner_pid))
        if owner_pid.value != process_id or not user32.IsWindowVisible(hwnd):
            return True

        title_buffer = ctypes.create_unicode_buffer(512)
        user32.GetWindowTextW(hwnd, title_buffer, len(title_buffer))
        if expected_title in title_buffer.value:
            found = True
            return False
        return True

    user32.EnumWindows(find_window, 0)
    return found


def get_readiness_timeout():
    try:
        timeout = float(os.environ.get("DIAGNOSTICS_TIMEOUT", "120.0"))
        return max(15.0, min(120.0, timeout))
    except ValueError:
        return 120.0


def wait_for_http_get(url, deadline, timeout=5.0):
    last_error = None
    while time.monotonic() < deadline:
        try:
            return urllib.request.urlopen(url, timeout=timeout)
        except OSError as error:
            last_error = error
            time.sleep(0.25)
    raise AssertionError(f"HTTP endpoint did not become ready: {url}; {last_error}")


def get_repeat_count():
    try:
        count = int(os.environ.get("DIAGNOSTICS_REPEAT_COUNT", "1"))
        return max(1, min(10, count))
    except ValueError:
        return 1


@pytest.mark.host_diagnostics
@pytest.mark.skipif(
    sys.platform != "win32", reason="Portable lifecycle is Windows-specific"
)
def test_executable_bootstrap_and_config_interaction(tmp_path):
    sidecar_path, standalone_exe = find_executable_paths()

    target_exe = standalone_exe if os.path.exists(standalone_exe) else None

    if not target_exe:
        pytest.skip("No portable Tauri executable found to run integration test.")

    repeat_count = get_repeat_count()

    for i in range(repeat_count):
        run_label = f"bootstrap_run_{i}"
        test_data_dir = tmp_path / f"test_data_root_{i}"
        test_data_dir.mkdir(parents=True, exist_ok=True)
        custom_hud_dir = test_data_dir / "hud_overlay" / "portable_custom_hud"
        custom_hud_dir.mkdir(parents=True)
        (custom_hud_dir / "index.html").write_text(
            "<html><body>Portable custom HUD</body></html>", encoding="utf-8"
        )

        stdout_path = str(tmp_path / f"stdout_bootstrap_{i}.txt")
        stderr_path = str(tmp_path / f"stderr_bootstrap_{i}.txt")
        environment = os.environ.copy()
        environment["TELEMETRY_IP"] = "127.0.0.1"
        environment["TELEMETRY_PORT"] = str(get_available_udp_port())

        cmd = [target_exe, "--data-dir", str(test_data_dir)]

        with (
            open(stdout_path, "w", encoding="utf-8") as stdout_f,
            open(stderr_path, "w", encoding="utf-8") as stderr_f,
        ):
            proc = subprocess.Popen(
                cmd,
                stdout=stdout_f,
                stderr=stderr_f,
                stdin=subprocess.PIPE,
                text=True,
                env=environment,
            )

        settings_file = test_data_dir / "settings.json"
        startup_deadline = time.monotonic() + get_readiness_timeout()

        try:
            while not settings_file.exists() and time.monotonic() < startup_deadline:
                if proc.poll() is not None:
                    break
                time.sleep(0.25)

            assert settings_file.exists(), (
                "settings.json was not created in --data-dir. "
                f"backend log: {test_data_dir / 'logs' / 'backend.log'}"
            )
            with open(settings_file, "r", encoding="utf-8") as f:
                settings = json.load(f)
                assert "units" in settings, "settings.json is missing 'units' key"
                assert "telemetry_port" in settings, (
                    "settings.json is missing 'telemetry_port'"
                )

            lang_dir = test_data_dir / "lang"
            assert lang_dir.exists(), "lang directory was not created"
            lang_files = list(lang_dir.glob("*.json"))
            assert len(lang_files) > 0, (
                "lang directory does not contain bootstrapped language files"
            )

            assert (test_data_dir / "car_params").exists(), (
                "car_params directory missing"
            )
            assert (test_data_dir / "hud_overlay").exists(), (
                "hud_overlay directory missing"
            )

            port_file = test_data_dir / "logs" / "web_port.txt"
            while not port_file.exists() and time.monotonic() < startup_deadline:
                time.sleep(0.1)
            assert port_file.exists(), "sidecar did not publish its HTTP port"
            backend_port = port_file.read_text(encoding="utf-8").strip()

            with wait_for_http_get(
                f"http://127.0.0.1:{backend_port}/api/hud/styles", startup_deadline
            ) as response:
                styles = json.loads(response.read().decode("utf-8"))["styles"]
            custom_style = next(
                style for style in styles if style["id"] == "portable_custom_hud"
            )
            assert custom_style["source"] == "user"
            assert custom_style["urlPrefix"] == "/hud_user"

            with urllib.request.urlopen(
                f"http://127.0.0.1:{backend_port}/hud_user/portable_custom_hud/index.html",
                timeout=5,
            ) as response:
                assert b"Portable custom HUD" in response.read()
            assert (test_data_dir / "tunings").exists(), "tunings directory missing"
            assert (test_data_dir / "drag_sessions").exists(), (
                "drag_sessions directory missing"
            )
            assert (test_data_dir / "user_configs").exists(), (
                "user_configs directory missing"
            )

            sessions_dir = test_data_dir / "sessions"
            assert sessions_dir.exists(), "sessions directory missing"
            db_file = sessions_dir / "telemetry_sessions.db"
            assert db_file.exists(), (
                "SQLite database telemetry_sessions.db was not created"
            )

            conn = sqlite3.connect(str(db_file))
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
            tables = [row[0] for row in cursor.fetchall()]
            conn.close()
            assert "sessions" in tables, "sessions table missing in SQLite DB"

            logs_dir = test_data_dir / "logs"
            assert logs_dir.exists(), "logs directory missing"
            log_file = logs_dir / "backend.log"
            assert log_file.exists(), "backend.log missing"
            with open(log_file, "r", encoding="utf-8") as f:
                log_content = f.read()
                assert len(log_content) > 0, "backend.log is empty"

        except Exception:
            collect_diagnostics(
                target_exe,
                proc,
                test_data_dir,
                cmd,
                run_label,
                stdout_path,
                stderr_path,
            )
            raise
        finally:
            if proc.stdin is not None and not proc.stdin.closed:
                proc.stdin.close()
            try:
                proc.wait(timeout=5.0)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=5.0)


@pytest.mark.host_diagnostics
@pytest.mark.skipif(
    sys.platform != "win32", reason="Portable lifecycle is Windows-specific"
)
def test_portable_executable_releases_udp_port_for_restart(tmp_path):
    _, standalone_exe = find_executable_paths()
    if not os.path.exists(standalone_exe):
        pytest.skip("No portable Tauri executable found to run lifecycle test.")

    telemetry_port = 8000
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as availability_probe:
        try:
            availability_probe.bind(("127.0.0.1", telemetry_port))
        except OSError as error:
            pytest.fail(
                f"UDP {telemetry_port} must be available for this test: {error}"
            )

    environment = os.environ.copy()
    environment["TELEMETRY_IP"] = "127.0.0.1"
    environment["TELEMETRY_PORT"] = str(telemetry_port)

    repeat_count = get_repeat_count()
    for run_number in range(repeat_count * 2):
        data_dir = tmp_path / f"lifecycle_run_{run_number}"
        data_dir.mkdir(parents=True, exist_ok=True)

        stdout_path = str(tmp_path / f"stdout_lifecycle_{run_number}.txt")
        stderr_path = str(tmp_path / f"stderr_lifecycle_{run_number}.txt")

        cmd = [standalone_exe, "--data-dir", str(data_dir)]

        with (
            open(stdout_path, "w", encoding="utf-8") as stdout_f,
            open(stderr_path, "w", encoding="utf-8") as stderr_f,
        ):
            proc = subprocess.Popen(
                cmd,
                stdout=stdout_f,
                stderr=stderr_f,
                stdin=subprocess.PIPE,
                env=environment,
                text=True,
            )

        port_file = data_dir / "logs" / "web_port.txt"
        deadline = time.monotonic() + get_readiness_timeout()

        try:
            while not port_file.exists() and time.monotonic() < deadline:
                if proc.poll() is not None:
                    break
                time.sleep(0.25)

            assert port_file.exists(), (
                f"backend did not publish a web port on lifecycle run {run_number}; "
                f"log: {data_dir / 'logs' / 'backend.log'}"
            )
        except Exception:
            run_label = f"lifecycle_run_{run_number}"
            collect_diagnostics(
                standalone_exe, proc, data_dir, cmd, run_label, stdout_path, stderr_path
            )
            raise
        finally:
            close_portable_process(proc)

        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.bind(("127.0.0.1", telemetry_port))


@pytest.mark.host_diagnostics
@pytest.mark.skipif(
    sys.platform != "win32", reason="Portable lifecycle is Windows-specific"
)
@pytest.mark.parametrize(
    ("variant", "executable_name", "window_title"),
    [
        ("full", "FH6-HorizonTuner.exe", "FH6-Horizon Tuner"),
        ("lite", "FH6-HorizonTuner_lite.exe", "FH6 HorizonTuner Lite"),
    ],
    ids=["full", "lite"],
)
@pytest.mark.parametrize(
    ("block_preferred_port", "expected_port"),
    [(False, 8001), (True, None)],
    ids=["preferred-port", "dynamic-port"],
)
def test_portable_variants_use_expected_backend_port_and_release_resources(
    tmp_path,
    variant,
    executable_name,
    window_title,
    block_preferred_port,
    expected_port,
):
    _, full_exe = find_executable_paths()
    lite_exe = find_lite_executable_path()
    standalone_exe = full_exe if variant == "full" else lite_exe
    if not os.path.exists(standalone_exe):
        pytest.skip(
            f"No {variant} portable Tauri executable found to run lifecycle test."
        )

    telemetry_port = 8000
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as availability_probe:
        try:
            availability_probe.bind(("127.0.0.1", telemetry_port))
        except OSError as error:
            pytest.fail(
                f"UDP {telemetry_port} must be available for this test: {error}"
            )

    run_label = (
        f"{variant}_dynamic_port"
        if block_preferred_port
        else f"{variant}_preferred_port"
    )
    data_dir = tmp_path / run_label
    data_dir.mkdir(parents=True, exist_ok=True)
    stdout_path = tmp_path / f"stdout_{variant}.txt"
    stderr_path = tmp_path / f"stderr_{variant}.txt"
    environment = os.environ.copy()
    environment["TELEMETRY_IP"] = "127.0.0.1"
    environment["TELEMETRY_PORT"] = str(telemetry_port)

    http_blocker = None
    if block_preferred_port:
        # Occupy the preferred HTTP port so the sidecar must publish and the
        # host must consume a dynamic port instead of silently falling back.
        http_blocker = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        http_blocker.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        http_blocker.bind(("127.0.0.1", 8001))
        http_blocker.listen(1)

    cmd = [standalone_exe, "--data-dir", str(data_dir)]
    with (
        stdout_path.open("w", encoding="utf-8") as stdout_f,
        stderr_path.open("w", encoding="utf-8") as stderr_f,
    ):
        proc = subprocess.Popen(
            cmd,
            stdout=stdout_f,
            stderr=stderr_f,
            stdin=subprocess.PIPE,
            env=environment,
            text=True,
        )

    port_file = data_dir / "logs" / "web_port.txt"
    deadline = time.monotonic() + get_readiness_timeout()
    try:
        while not port_file.exists() and time.monotonic() < deadline:
            if proc.poll() is not None:
                break
            time.sleep(0.25)

        assert port_file.exists(), f"{variant} sidecar did not publish its HTTP port"
        backend_port = int(port_file.read_text(encoding="utf-8").strip())
        if expected_port is None:
            assert backend_port != 8001
        else:
            assert backend_port == expected_port

        with wait_for_http_get(
            f"http://127.0.0.1:{backend_port}/api/overlay/config", deadline
        ) as response:
            assert response.status == 200

        window_deadline = time.monotonic() + get_readiness_timeout()
        while (
            not has_visible_window_title(proc.pid, window_title)
            and time.monotonic() < window_deadline
        ):
            if proc.poll() is not None:
                break
            time.sleep(0.25)
        assert has_visible_window_title(proc.pid, window_title)
    except Exception:
        collect_diagnostics(
            standalone_exe,
            proc,
            data_dir,
            cmd,
            run_label,
            str(stdout_path),
            str(stderr_path),
        )
        raise
    finally:
        if http_blocker is not None:
            http_blocker.close()
        close_portable_process(proc, window_title)

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as http_probe:
        http_probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        http_probe.bind(("127.0.0.1", backend_port))
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as udp_probe:
        udp_probe.bind(("127.0.0.1", telemetry_port))


def test_diagnostics_configuration_parsing(monkeypatch):

    # Test repeat_count
    monkeypatch.delenv("DIAGNOSTICS_REPEAT_COUNT", raising=False)
    assert get_repeat_count() == 1

    monkeypatch.setenv("DIAGNOSTICS_REPEAT_COUNT", "5")
    assert get_repeat_count() == 5

    monkeypatch.setenv("DIAGNOSTICS_REPEAT_COUNT", "0")
    assert get_repeat_count() == 1

    monkeypatch.setenv("DIAGNOSTICS_REPEAT_COUNT", "15")
    assert get_repeat_count() == 10

    monkeypatch.setenv("DIAGNOSTICS_REPEAT_COUNT", "invalid")
    assert get_repeat_count() == 1

    # Test readiness_timeout
    monkeypatch.delenv("DIAGNOSTICS_TIMEOUT", raising=False)
    assert get_readiness_timeout() == 120.0

    monkeypatch.setenv("DIAGNOSTICS_TIMEOUT", "45.5")
    assert get_readiness_timeout() == 45.5

    monkeypatch.setenv("DIAGNOSTICS_TIMEOUT", "10.0")
    assert get_readiness_timeout() == 15.0

    monkeypatch.setenv("DIAGNOSTICS_TIMEOUT", "150.0")
    assert get_readiness_timeout() == 120.0

    monkeypatch.setenv("DIAGNOSTICS_TIMEOUT", "invalid")
    assert get_readiness_timeout() == 120.0
