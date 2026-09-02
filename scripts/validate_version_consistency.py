"""Validate the application version contract before packaging."""

from __future__ import annotations

import ast
import json
import re
from pathlib import Path

import tomllib

ROOT_DIR = Path(__file__).resolve().parent.parent
VERSION_PATTERN = re.compile(r"^\d+\.\d+\.\d+$")
PYINSTALLER_VERSION_PATTERN = re.compile(
    r"StringStruct\(u'(FileVersion|ProductVersion)', u'([^']+)'\)"
)


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


def _read_python_string_assignment(path: Path, name: str) -> str:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    for node in ast.walk(tree):
        if not isinstance(node, ast.Assign):
            continue
        if not any(
            isinstance(target, ast.Name) and target.id == name
            for target in node.targets
        ):
            continue
        if isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
            return node.value.value
    raise ValueError(f"Could not find string assignment {name} in {path}.")


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

    backend_path = root_dir / "backend" / "main.py"
    app_version = _read_python_string_assignment(backend_path, "APP_VERSION")
    backend_version = _read_python_string_assignment(backend_path, "BACKEND_VERSION")

    version_info_path = root_dir / "backend" / "version_info.txt"
    version_info_matches = dict(
        PYINSTALLER_VERSION_PATTERN.findall(
            version_info_path.read_text(encoding="utf-8")
        )
    )
    if len(version_info_matches) != 2 or set(version_info_matches) != {
        "FileVersion",
        "ProductVersion",
    }:
        raise ValueError(
            "PyInstaller version_info.txt must contain exactly one FileVersion "
            "and one ProductVersion."
        )

    return {
        "tauri": tauri_version,
        "cargo": cargo_version,
        "cargo_lock": cargo_lock_version,
        "backend_app": app_version,
        "backend": backend_version,
        "pyinstaller_file": version_info_matches["FileVersion"],
        "pyinstaller_product": version_info_matches["ProductVersion"],
    }


def validate_version_contract(root_dir: Path = ROOT_DIR) -> dict[str, str]:
    versions = read_version_contract(root_dir)
    expected_backend_version = f"{versions['tauri']}.0"
    expected = {
        "tauri": versions["tauri"],
        "cargo": versions["tauri"],
        "cargo_lock": versions["tauri"],
        "backend_app": versions["tauri"],
        "backend": expected_backend_version,
        "pyinstaller_file": expected_backend_version,
        "pyinstaller_product": expected_backend_version,
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
