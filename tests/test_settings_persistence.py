import json
from pathlib import Path

import pytest

from backend.settings_persistence import SettingsPersistence


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
    overview = store.storage_overview()

    serialized = json.dumps(overview)
    assert str(tmp_path) not in serialized
    assert all(
        not Path(entry["relative_path"]).is_absolute() for entry in overview["entries"]
    )
    assert overview["capabilities"]["sqlite_migration"] == "not_planned"


def test_load_rejects_when_primary_and_backup_cannot_be_recovered(tmp_path):
    store = SettingsPersistence(tmp_path / "settings.json")
    store.settings_file.write_text("broken", encoding="utf-8")
    with pytest.raises(ValueError, match="Neither settings file nor backup"):
        store.load(defaults())
