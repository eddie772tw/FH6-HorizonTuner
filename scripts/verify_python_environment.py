"""Verify the optional repository maintenance and diagnostics environment."""

from __future__ import annotations

import importlib
import importlib.metadata
import importlib.util
import sys

REQUIRED_MODULES = ("pytest", "ruff", "websockets")


def main() -> int:
    """Verify the requested Python environment and its dependencies."""
    if sys.argv[1:] == ["--version-only"]:
        version = sys.version_info[:2]
        print(
            f"[INFO] Selected Python version: {version[0]}.{version[1]}",
            flush=True,
        )
        if version != (3, 13):
            print("[ERROR] The project requires Python 3.13.", flush=True)
            return 1
        return 0

    print(
        f"[INFO] Probing {len(REQUIRED_MODULES)} Python modules "
        "for optional repository tools ...",
        flush=True,
    )
    for module_name in REQUIRED_MODULES:
        print(f"[INFO] Importing {module_name} ...", flush=True)
        try:
            importlib.import_module(module_name)
        except Exception as exc:  # pragma: no cover - depends on host wheels
            print(
                f"[ERROR] Import failed for {module_name}: {type(exc).__name__}: {exc}",
                flush=True,
            )
            return 1

    print("[SUCCESS] Optional Python tooling dependency probe passed.", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
