"""Stage the configured Discord Application ID for a PyInstaller build."""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

APPLICATION_ID_PATTERN = re.compile(r"^[0-9]{17,20}$")


def _read_configured_id(path: Path) -> str | None:
    try:
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, TypeError, ValueError):
        return None
    if not isinstance(payload, dict):
        return None
    value = payload.get("discord_application_id")
    candidate = str(value).strip() if value is not None else ""
    return candidate if APPLICATION_ID_PATTERN.fullmatch(candidate) else None


def resolve_discord_application_id(project_root: Path) -> str | None:
    """Resolve the same sources used by the running sidecar."""
    environment_id = os.environ.get("DISCORD_APPLICATION_ID", "").strip()
    if APPLICATION_ID_PATTERN.fullmatch(environment_id):
        return environment_id
    return _read_configured_id(project_root / "config" / "discord.local.json")


def stage_discord_application_id(project_root: Path) -> bool:
    """Write the temporary PyInstaller resource, or remove a stale one."""
    target = project_root / "backend" / "discord_application_id.json"
    application_id = resolve_discord_application_id(project_root)
    if application_id is None:
        target.unlink(missing_ok=True)
        return False

    target.write_text(
        json.dumps(
            {"discord_application_id": application_id},
            ensure_ascii=True,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    return True


def main() -> int:
    project_root = Path(__file__).resolve().parents[1]
    staged = stage_discord_application_id(project_root)
    print(
        "[INFO] Discord Application ID staged for sidecar packaging."
        if staged
        else "[INFO] No valid Discord Application ID configured; building without Rich Presence."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
