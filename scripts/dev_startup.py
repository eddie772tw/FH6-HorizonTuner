"""Bounded, visible checks for the Windows DEV launchers."""

import argparse
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

# Keep aligned with the direct requirements, including actual WinRT modules.
MODULES = (
    "fastapi",
    "httpx",
    "numpy",
    "pydantic",
    "pytest",
    "pytest_asyncio",
    "ruff",
    "soundcard",
    "uvicorn",
    "websockets",
    "multipart",
    "winrt.windows.foundation",
    "winrt.windows.foundation.collections",
    "winrt.windows.media",
    "winrt.windows.media.control",
    "winrt.windows.storage",
    "winrt.windows.storage.streams",
)


def check_imports(modules=MODULES, timeout=30.0):
    """Show the last attempted import and stop a hung import without repairing."""
    program = (
        "import importlib, sys\n"
        "for name in sys.argv[1:]:\n"
        " print('[INFO] Importing ' + name + ' ...', flush=True)\n"
        " importlib.import_module(name)\n"
    )
    try:
        result = subprocess.run(
            [sys.executable, "-u", "-c", program, *modules], timeout=timeout
        )
    except subprocess.TimeoutExpired:
        print(
            "[ERROR] Python import check timed out; see the last module above. "
            "The existing environment has been preserved.",
            flush=True,
        )
        return 2
    return 0 if result.returncode == 0 else 1


def check_python(timeout=30.0):
    """Check installed package metadata and runtime imports with visible output."""
    print("[INFO] Checking installed package compatibility ...", flush=True)
    try:
        result = subprocess.run(
            ["uv", "pip", "check", "--python", sys.executable], timeout=timeout
        )
    except subprocess.TimeoutExpired:
        print("[ERROR] uv pip check timed out; environment preserved.", flush=True)
        return 2
    if result.returncode:
        return 1
    return check_imports(timeout=timeout)


def wait_backend(root: Path, timeout=30.0):
    """Wait for the advertised backend to actually serve HTTP successfully."""
    deadline = time.monotonic() + timeout
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    while time.monotonic() < deadline:
        for path in (root / "backend/logs/web_port.txt", root / "logs/web_port.txt"):
            try:
                port = int(path.read_text().strip())
                if not 1 <= port <= 65535:
                    continue
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    break
                with opener.open(
                    f"http://127.0.0.1:{port}/api/settings",
                    timeout=min(1.0, remaining),
                ) as response:
                    if response.status == 200:
                        print(f"[SUCCESS] Backend HTTP is ready on port {port}.")
                        return 0
            except (OSError, ValueError, urllib.error.URLError):
                pass
        time.sleep(min(0.25, max(0, deadline - time.monotonic())))
    print("[ERROR] Backend readiness timed out. Check the backend window/logs.")
    return 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("check-python", "wait-backend"))
    args = parser.parse_args()
    sys.exit(
        check_python()
        if args.action == "check-python"
        else wait_backend(Path(__file__).resolve().parents[1])
    )
