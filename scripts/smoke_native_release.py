"""Exercise the sidecar extracted from a real Linux AppImage.

This verifies the native package/backend boundary, not a game or GUI session.
"""

import argparse
import json
import os
import shutil
import socket
import struct
import subprocess
import tempfile
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

from platform_release import exactly_one


def inspect_backend(binary, expected_platform, expected_arch):
    info = json.loads(subprocess.check_output([str(binary), "--build-info"]))
    if (info["platform"], info["arch"]) != (expected_platform, expected_arch):
        raise ValueError(f"Unexpected backend architecture: {info}")
    if info["hudEnabled"] or info["embeddedHudFiles"]:
        raise ValueError("Native package contains HUD")
    return info


def exercise(binary: Path, data_root: Path):
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
        probe.bind(("127.0.0.1", 0))
        udp = probe.getsockname()[1]
    # Hold the requested port so release startup must publish a different one.
    with socket.socket() as occupied:
        occupied.bind(("127.0.0.1", 0))
        preferred = occupied.getsockname()[1]
        occupied.listen()
        env = dict(os.environ, TELEMETRY_PORT=str(udp))
        with (data_root / "smoke-stdout.log").open("w") as output:
            process = subprocess.Popen(
                [str(binary), "--port", str(preferred), "--data-dir", str(data_root)],
                stdin=subprocess.PIPE,
                stdout=output,
                stderr=subprocess.STDOUT,
                env=env,
            )
            try:
                deadline = time.monotonic() + 20
                port = None
                while time.monotonic() < deadline:
                    if process.poll() is not None:
                        raise RuntimeError("Packaged backend exited before readiness")
                    try:
                        port = int((data_root / "logs/web_port.txt").read_text())
                        with urlopen(
                            f"http://127.0.0.1:{port}/api/health", timeout=1
                        ) as response:
                            assert json.load(response)["status"] == "ready"
                        break
                    except (OSError, ValueError, URLError):
                        time.sleep(0.1)
                else:
                    raise RuntimeError("Packaged backend readiness timed out")
                assert port != preferred
                with urlopen(
                    f"http://127.0.0.1:{port}/api/runtime", timeout=3
                ) as response:
                    runtime = json.load(response)
                assert runtime["capabilities"]["hudOverlay"] is False
                assert runtime["telemetry"]["port"] == udp
                for endpoint, expected in [
                    ("/api/overlay/config", 501),
                    ("/hud/index.html", 404),
                ]:
                    try:
                        urlopen(f"http://127.0.0.1:{port}{endpoint}", timeout=3)
                        raise AssertionError(
                            f"HUD endpoint unexpectedly enabled: {endpoint}"
                        )
                    except HTTPError as error:
                        assert error.code == expected
                packet = bytearray(324)
                struct.pack_into("<i", packet, 0, 1)
                struct.pack_into("<f", packet, 8, 8000)
                struct.pack_into("<f", packet, 16, 4200)
                struct.pack_into("<i", packet, 212, 42)
                with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sender:
                    for _ in range(10):
                        sender.sendto(packet, ("127.0.0.1", udp))
                        time.sleep(0.03)
                with urlopen(
                    f"http://127.0.0.1:{port}/api/diagnostics/telemetry-pipeline",
                    timeout=3,
                ) as response:
                    metrics = json.load(response)
                assert metrics["framesProcessed"] > 0
                process.stdin.close()
                assert process.wait(timeout=10) == 0
                with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as rebound:
                    rebound.bind(("127.0.0.1", udp))
                assert not (data_root / "hud_overlay").exists()
                evidence = {
                    "runtime": runtime,
                    "httpPort": port,
                    "requestedHttpPort": preferred,
                    "framesProcessed": metrics["framesProcessed"],
                    "shutdown": "clean",
                }
                (data_root / "smoke-result.json").write_text(
                    json.dumps(evidence, indent=2), encoding="utf-8"
                )
                print(json.dumps(evidence))
            finally:
                if process.poll() is None:
                    process.kill()
                    process.wait(timeout=5)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--platform", choices=["linux"], required=True)
    parser.add_argument("--bundle-root", type=Path, required=True)
    parser.add_argument("--evidence-dir", type=Path, required=True)
    args = parser.parse_args()
    root = args.bundle_root.resolve()
    with tempfile.TemporaryDirectory(prefix="fh6-package-smoke-") as work:
        work = Path(work)
        appimage = exactly_one(root, "appimage/*.AppImage")
        subprocess.run(
            [str(appimage), "--appimage-extract"],
            cwd=work,
            check=True,
            stdout=subprocess.DEVNULL,
        )
        binaries = list((work / "squashfs-root").rglob("sidecar/server-sidecar"))
        if len(binaries) != 1:
            raise ValueError(f"Expected one packaged sidecar, found {len(binaries)}")
        binary = binaries[0]
        inspect_backend(binary, "linux", "x86_64")
        data = work / "user-data"
        data.mkdir()
        try:
            exercise(binary, data)
        finally:
            args.evidence_dir.mkdir(parents=True, exist_ok=True)
            for filename in [
                "smoke-result.json",
                "smoke-stdout.log",
                "logs/backend.log",
            ]:
                source = data / filename
                if source.is_file():
                    shutil.copy2(source, args.evidence_dir / source.name)


if __name__ == "__main__":
    main()
