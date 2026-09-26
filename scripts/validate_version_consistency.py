"""Validate the application version contract before packaging."""

from __future__ import annotations

import json
import re
from pathlib import Path

import tomllib

ROOT_DIR = Path(__file__).resolve().parent.parent
VERSION_PATTERN = re.compile(r"^\d+\.\d+\.\d+$")


def read_runtime_version(root_dir: Path = ROOT_DIR) -> str:
    """Read the Tauri runtime version, which is the updater version source."""
    config_path = root_dir / "frontend" / "src-tauri" / "tauri.conf.json"
    config = json.loads(config_path.read_text(encoding="utf-8"))
    version = config.get("version")
    if not isinstance(version, str) or not VERSION_PATTERN.fullmatch(version):
        raise ValueError(
            f"Tauri runtime version must be numeric SemVer in {config_path}."
        )
    return version


def read_version_contract(root_dir: Path = ROOT_DIR) -> dict[str, str]:
    """Read every packaged runtime version that must remain synchronized."""
    tauri_version = read_runtime_version(root_dir)
    cargo_path = root_dir / "frontend" / "src-tauri" / "Cargo.toml"
    cargo_version = tomllib.loads(cargo_path.read_text(encoding="utf-8"))["package"][
        "version"
    ]
    cargo_lock_path = root_dir / "frontend" / "src-tauri" / "Cargo.lock"
    cargo_lock_packages = tomllib.loads(cargo_lock_path.read_text(encoding="utf-8"))[
        "package"
    ]
    cargo_lock_version = next(
        package["version"]
        for package in cargo_lock_packages
        if package.get("name") == "FH6-HorizonTuner"
    )

    return {
        "rust_backend": tomllib.loads(
            (root_dir / "backend-rust" / "Cargo.toml").read_text(encoding="utf-8")
        )["package"]["version"],
        "rust_backend_lock": next(
            package["version"]
            for package in tomllib.loads(
                (root_dir / "backend-rust" / "Cargo.lock").read_text(encoding="utf-8")
            )["package"]
            if package.get("name") == "fh6-backend"
        ),
        "tauri": tauri_version,
        "cargo": cargo_version,
        "cargo_lock": cargo_lock_version,
    }


def validate_version_contract(root_dir: Path = ROOT_DIR) -> dict[str, str]:
    versions = read_version_contract(root_dir)
    expected = {
        "rust_backend": versions["tauri"],
        "rust_backend_lock": versions["tauri"],
        "tauri": versions["tauri"],
        "cargo": versions["tauri"],
        "cargo_lock": versions["tauri"],
    }
    mismatches = [
        f"{key}: expected {expected[key]}, got {versions[key]}"
        for key in expected
        if versions[key] != expected[key]
    ]
    if mismatches:
        raise ValueError(
            "Application version contract failed:\n- " + "\n- ".join(mismatches)
        )
    return versions


def main() -> None:
    versions = validate_version_contract()
    print(f"Application version contract OK: {versions['tauri']}")


if __name__ == "__main__":
    main()
