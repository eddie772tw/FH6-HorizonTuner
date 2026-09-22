"""Build and stage a native Rust sidecar without HUD or Python runtime."""

import argparse
import json
import platform
import shutil
import subprocess
from pathlib import Path

TARGETS = {
    "macos": ("Darwin", "arm64", "aarch64-apple-darwin"),
    "linux": ("Linux", "x86_64", "x86_64-unknown-linux-gnu"),
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--platform", required=True, choices=TARGETS)
    args = parser.parse_args()
    system, arch, target = TARGETS[args.platform]
    if (platform.system(), platform.machine()) != (system, arch):
        raise ValueError(f"{target} requires a native {system} {arch} runner")
    subprocess.run(
        [
            "cargo",
            "build",
            "--locked",
            "--release",
            "--no-default-features",
            "--manifest-path",
            "backend-rust/Cargo.toml",
            "--target",
            target,
        ],
        check=True,
    )
    binary = Path("backend-rust/target") / target / "release/server-sidecar"
    info = json.loads(subprocess.check_output([str(binary), "--build-info"]))
    if info["hudEnabled"] or info["embeddedHudFiles"]:
        raise ValueError("Native sidecar unexpectedly contains HUD")
    destination = Path("frontend/src-tauri/bin/sidecar")
    destination.mkdir(parents=True, exist_ok=True)
    shutil.copy2(binary, destination / "server-sidecar")
    (destination / "server-sidecar").chmod(0o755)
    print(json.dumps(info))


if __name__ == "__main__":
    main()
