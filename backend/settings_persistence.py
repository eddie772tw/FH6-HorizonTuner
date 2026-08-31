"""Durable, versioned persistence for application settings.

The service deliberately owns only the settings JSON document.  It does not
attempt to migrate telemetry/session storage, which has separate compatibility
contracts.
"""

from __future__ import annotations

import asyncio
import copy
import json
import os
import tempfile
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Protocol

# Every application-managed directory that can be written beneath DATA_ROOT.
# `backend.main` uses this manifest to create the directories, while the storage
# overview uses it to calculate capacity. Keep new durable data locations here.
DATA_ROOT_WRITABLE_DIRECTORIES = (
    "logs",
    "lang",
    "tunings",
    "car_params",
    "hud_overlay",
    "sessions",
    "drag_sessions",
    "user_configs",
    "captures",
)

DATA_ROOT_STORAGE_ENTRIES = (
    "settings.json",
    "settings.json.bak",
    "layout.json",
    "hud_config.json",
    "car_learning.json",
    *DATA_ROOT_WRITABLE_DIRECTORIES,
)


class SettingsSaver(Protocol):
    """Minimal persistence contract used by serialized settings updates."""

    def save(self, value: dict[str, Any]) -> None:
        """Persist a complete settings document."""


class SettingsPersistence:
    """Store settings with a schema marker, atomic replacement, and one backup."""

    CURRENT_SCHEMA_VERSION = 2

    def __init__(self, settings_file: str | Path) -> None:
        self.settings_file = Path(settings_file)
        self.backup_file = self.settings_file.with_suffix(
            f"{self.settings_file.suffix}.bak"
        )

    @staticmethod
    def _read_json(path: Path) -> dict[str, Any]:
        with path.open("r", encoding="utf-8") as source:
            value = json.load(source)
        if not isinstance(value, dict):
            raise ValueError("Settings document must be a JSON object")
        return value

    def _upgrade(self, value: dict[str, Any]) -> tuple[dict[str, Any], bool]:
        upgraded = copy.deepcopy(value)
        version = upgraded.get("settings_schema_version", 1)
        if not isinstance(version, int) or version < 1:
            raise ValueError("Unsupported settings schema version")
        if version > self.CURRENT_SCHEMA_VERSION:
            raise ValueError("Settings file was created by a newer application")
        changed = version != self.CURRENT_SCHEMA_VERSION
        upgraded["settings_schema_version"] = self.CURRENT_SCHEMA_VERSION
        return upgraded, changed

    def _atomic_write(self, destination: Path, value: dict[str, Any]) -> None:
        destination.parent.mkdir(parents=True, exist_ok=True)
        descriptor, temporary_name = tempfile.mkstemp(
            prefix=f".{destination.name}.", suffix=".tmp", dir=destination.parent
        )
        temporary_path = Path(temporary_name)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as target:
                json.dump(value, target, indent=2, sort_keys=True)
                target.write("\n")
                target.flush()
                os.fsync(target.fileno())
            os.replace(temporary_path, destination)
        except Exception:
            temporary_path.unlink(missing_ok=True)
            raise

    def load(self, defaults: dict[str, Any]) -> tuple[dict[str, Any], bool]:
        """Load settings, recovering the primary document from its backup if needed."""
        if not self.settings_file.exists():
            created, _ = self._upgrade(defaults)
            self.save(created)
            return created, True

        try:
            loaded, changed = self._upgrade(self._read_json(self.settings_file))
        except (OSError, ValueError, json.JSONDecodeError):
            try:
                loaded, _ = self._upgrade(self._read_json(self.backup_file))
            except (OSError, ValueError, json.JSONDecodeError) as backup_error:
                raise ValueError(
                    "Neither settings file nor backup is recoverable"
                ) from backup_error
            self._atomic_write(self.settings_file, loaded)
            return loaded, True

        if changed:
            self.save(loaded)
        return loaded, changed

    def save(self, value: dict[str, Any]) -> None:
        """Atomically persist value after atomically retaining the last known good file."""
        upgraded, _ = self._upgrade(value)
        if self.settings_file.exists():
            self._atomic_write(self.backup_file, self._read_json(self.settings_file))
        self._atomic_write(self.settings_file, upgraded)

    def storage_overview(self) -> dict[str, Any]:
        """Return a non-sensitive overview: all paths are relative to the data root."""
        data_root = self.settings_file.parent
        entries: list[dict[str, Any]] = []
        total_bytes = 0
        for relative_path in DATA_ROOT_STORAGE_ENTRIES:
            target = data_root / relative_path
            if target.is_file():
                size = target.stat().st_size
            elif target.is_dir():
                size = sum(
                    item.stat().st_size for item in target.rglob("*") if item.is_file()
                )
            else:
                size = 0
            total_bytes += size
            entries.append({"relative_path": relative_path, "bytes": size})

        last_backup = None
        if self.backup_file.exists():
            last_backup = datetime.fromtimestamp(
                self.backup_file.stat().st_mtime, tz=UTC
            ).isoformat()

        return {
            "format": "fh6-settings/v2",
            "schema_version": self.CURRENT_SCHEMA_VERSION,
            "data_root": "Application data directory",
            "total_bytes": total_bytes,
            "entries": entries,
            "last_backup": last_backup,
            "capabilities": {
                "settings_backup_recovery": "available",
                "settings_export": "not_available",
                "settings_restore": "not_available",
                "sqlite_migration": "not_planned",
            },
        }


class SerializedSettingsUpdate:
    """Serialize candidate settings writes and commit only after a successful save."""

    def __init__(self, settings: dict[str, Any], persistence: SettingsSaver) -> None:
        self._settings = settings
        self._persistence = persistence
        self._lock = asyncio.Lock()

    async def merge_save_commit(
        self,
        merge: Callable[[dict[str, Any]], None],
        persistence: SettingsSaver | None = None,
    ) -> dict[str, Any]:
        """Serialize merge/save/commit so a failed older write cannot roll back a newer one."""
        async with self._lock:
            candidate = copy.deepcopy(self._settings)
            merge(candidate)
            target_persistence = persistence or self._persistence
            await asyncio.to_thread(target_persistence.save, candidate)
            self._settings.clear()
            self._settings.update(candidate)
            return copy.deepcopy(candidate)
