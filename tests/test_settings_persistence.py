import asyncio
import json
import threading
from pathlib import Path

import pytest

from backend.settings_persistence import (
    DATA_ROOT_WRITABLE_DIRECTORIES,
    SerializedSettingsUpdate,
    SettingsPersistence,
)


def defaults() -> dict:
    return {"language": "en-us", "units": {"speed": "kmh"}}


def test_save_uses_atomic_replacement_and_retains_recoverable_backup(
    tmp_path, monkeypatch
):
    settings_file = tmp_path / "settings.json"
    store = SettingsPersistence(settings_file)
    store.save(defaults())

    replacements: list[tuple[Path, Path]] = []
    original_replace = __import__("os").replace

    def record_replace(source, destination):
        replacements.append((Path(source), Path(destination)))
        return original_replace(source, destination)

    monkeypatch.setattr("backend.settings_persistence.os.replace", record_replace)
    store.save({"language": "zh-tw"})

    assert settings_file.exists()
    assert store.backup_file.exists()
    assert (
        json.loads(store.backup_file.read_text(encoding="utf-8"))["language"] == "en-us"
    )
    assert json.loads(settings_file.read_text(encoding="utf-8"))["language"] == "zh-tw"
    assert {destination for _, destination in replacements} == {
        settings_file,
        store.backup_file,
    }


def test_load_recovers_corrupt_primary_from_backup(tmp_path):
    store = SettingsPersistence(tmp_path / "settings.json")
    store.save(defaults())
    store.save({"language": "zh-tw"})
    store.settings_file.write_text("not json", encoding="utf-8")

    recovered, changed = store.load(defaults())

    assert changed is True
    assert recovered["language"] == "en-us"
    assert (
        json.loads(store.settings_file.read_text(encoding="utf-8"))["language"]
        == "en-us"
    )


def test_load_upgrades_legacy_schema_and_persists_the_marker(tmp_path):
    store = SettingsPersistence(tmp_path / "settings.json")
    store.settings_file.write_text(json.dumps({"language": "zh-tw"}), encoding="utf-8")

    loaded, changed = store.load(defaults())

    assert changed is True
    assert (
        loaded["settings_schema_version"] == SettingsPersistence.CURRENT_SCHEMA_VERSION
    )
    assert (
        json.loads(store.settings_file.read_text(encoding="utf-8"))[
            "settings_schema_version"
        ]
        == 2
    )


def test_storage_overview_hides_absolute_paths_and_marks_sqlite_migration_unplanned(
    tmp_path,
):
    store = SettingsPersistence(tmp_path / "sensitive-data-root" / "settings.json")
    store.save(defaults())
    expected_directory_bytes = {}
    for index, relative_path in enumerate(DATA_ROOT_WRITABLE_DIRECTORIES, start=1):
        directory = store.settings_file.parent / relative_path
        directory.mkdir(parents=True)
        size = index * 3
        (directory / "tracked.bin").write_bytes(b"x" * size)
        expected_directory_bytes[relative_path] = size

    overview = store.storage_overview()

    serialized = json.dumps(overview)
    entry_bytes = {
        entry["relative_path"]: entry["bytes"] for entry in overview["entries"]
    }
    assert str(tmp_path) not in serialized
    assert all(
        not Path(entry["relative_path"]).is_absolute() for entry in overview["entries"]
    )
    assert all(
        entry_bytes[relative_path] == size
        for relative_path, size in expected_directory_bytes.items()
    )
    assert overview["total_bytes"] == sum(entry_bytes.values())
    assert overview["capabilities"]["sqlite_migration"] == "not_planned"


def test_load_rejects_when_primary_and_backup_cannot_be_recovered(tmp_path):
    store = SettingsPersistence(tmp_path / "settings.json")
    store.settings_file.write_text("broken", encoding="utf-8")
    with pytest.raises(ValueError, match="Neither settings file nor backup"):
        store.load(defaults())


def test_serialized_update_does_not_roll_back_a_newer_success_when_an_older_save_fails():
    class FirstWriteFails:
        def __init__(self):
            self.first_write_started = threading.Event()
            self.release_first_write = threading.Event()
            self.saved: list[dict] = []

        def save(self, value: dict) -> None:
            if value["language"] == "zh-tw":
                self.first_write_started.set()
                self.release_first_write.wait(timeout=5)
                raise OSError("simulated old write failure")
            self.saved.append(value.copy())

    async def exercise() -> None:
        current = {"language": "en-us", "dyno_recording": False}
        persistence = FirstWriteFails()
        updates = SerializedSettingsUpdate(current, persistence)

        old_request = asyncio.create_task(
            updates.merge_save_commit(
                lambda candidate: candidate.update(language="zh-tw")
            )
        )
        assert await asyncio.to_thread(persistence.first_write_started.wait, 5)
        newer_request = asyncio.create_task(
            updates.merge_save_commit(
                lambda candidate: candidate.update(dyno_recording=True)
            )
        )
        persistence.release_first_write.set()

        with pytest.raises(OSError, match="simulated old write failure"):
            await old_request
        await newer_request

        assert current == {"language": "en-us", "dyno_recording": True}
        assert persistence.saved == [current]

    asyncio.run(exercise())
