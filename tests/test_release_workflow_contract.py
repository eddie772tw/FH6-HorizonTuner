"""Contract and unit tests for release packaging workflows."""

import json
import subprocess
import zipfile
from pathlib import Path

import pytest

from scripts.prepare_release_assets import (
    FULL_INSTALLER_NAME,
    FULL_PORTABLE_NAME,
    FULL_SIGNATURE_NAME,
    LITE_INSTALLER_NAME,
    LITE_PORTABLE_NAME,
    LITE_SIGNATURE_NAME,
    PORTABLE_ARCHIVE_NAME,
    generate_latest_manifest,
    prepare_release_assets,
)


def test_no_gradle_cache_committed():
    repo_root = Path(__file__).resolve().parent.parent
    result = subprocess.run(
        ["git", "ls-files", "--", "companion/.gradle"],
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=True,
    )
    assert result.stdout.strip() == "", (
        f"Found committed .gradle cache files: {result.stdout.strip()}"
    )


def _create_packaging_fixtures(
    tmp_path: Path,
) -> tuple[Path, Path, Path, Path, Path, Path]:
    source_dir = tmp_path / "src"
    source_dir.mkdir()
    mock_exe = source_dir / "FH6-HorizonTuner.exe"
    mock_exe.write_bytes(b"MOCK_PE_BINARY_CONTENT")
    mock_lite_exe = source_dir / "FH6-HorizonTuner_lite.exe"
    mock_lite_exe.write_bytes(b"MOCK_LITE_PE_BINARY_CONTENT")

    updater_bundle = source_dir / "FH6-HorizonTuner_11.45.15_x64-setup.exe"
    updater_bundle.write_bytes(b"MOCK_NSIS_INSTALLER")

    updater_signature = source_dir / f"{updater_bundle.name}.sig"
    updater_signature.write_text("ED25519_SIGNATURE_BASE64_STRING\n", encoding="utf-8")
    lite_updater_bundle = source_dir / "FH6-HorizonTuner_lite_11.45.15_x64-setup.exe"
    lite_updater_bundle.write_bytes(b"MOCK_LITE_NSIS_INSTALLER")
    lite_updater_signature = source_dir / f"{lite_updater_bundle.name}.sig"
    lite_updater_signature.write_text(
        "LITE_ED25519_SIGNATURE_BASE64_STRING\n", encoding="utf-8"
    )
    return (
        mock_exe,
        mock_lite_exe,
        updater_bundle,
        updater_signature,
        lite_updater_bundle,
        lite_updater_signature,
    )


def test_generate_latest_manifest_structure():
    manifest = generate_latest_manifest(
        version="11.45.15",
        repo="eddie772tw/FH6-HorizonTuner",
        tag="v1.5.0",
        signature="dGVzdHNpZ25hdHVyZQ==",
        download_filename="FH6-HorizonTuner_11.45.15_x64-setup.exe",
        notes="OTA upgrade release",
        pub_date="2026-08-17T12:00:00Z",
    )

    assert manifest["version"] == "11.45.15"
    assert manifest["notes"] == "OTA upgrade release"
    assert manifest["pub_date"] == "2026-08-17T12:00:00Z"
    win_platform = manifest["platforms"]["windows-x86_64"]
    assert win_platform["signature"] == "dGVzdHNpZ25hdHVyZQ=="
    assert win_platform["url"].endswith(
        "/v1.5.0/FH6-HorizonTuner_11.45.15_x64-setup.exe"
    )


def test_prepare_release_assets_creates_full_and_lite_ota_artifacts(tmp_path: Path):
    (
        mock_exe,
        mock_lite_exe,
        updater_bundle,
        updater_signature,
        lite_updater_bundle,
        lite_updater_signature,
    ) = _create_packaging_fixtures(tmp_path)
    out_dir = tmp_path / "dist_release"

    artifacts = prepare_release_assets(
        exe_path=mock_exe,
        lite_exe_path=mock_lite_exe,
        updater_bundle_path=updater_bundle,
        updater_signature_path=updater_signature,
        lite_updater_bundle_path=lite_updater_bundle,
        lite_updater_signature_path=lite_updater_signature,
        output_dir=out_dir,
        tag="v1.5.0",
        version="11.45.15",
        repo="eddie772tw/FH6-HorizonTuner",
        notes="Changelog for v1.5.0",
    )

    artifact_names = [artifact.name for artifact in artifacts]
    assert artifact_names == [
        FULL_PORTABLE_NAME,
        LITE_PORTABLE_NAME,
        PORTABLE_ARCHIVE_NAME,
        FULL_INSTALLER_NAME,
        FULL_SIGNATURE_NAME,
        LITE_INSTALLER_NAME,
        LITE_SIGNATURE_NAME,
        "latest.json",
        "latest-lite.json",
    ]
    with zipfile.ZipFile(out_dir / PORTABLE_ARCHIVE_NAME) as archive:
        assert set(archive.namelist()) == {
            FULL_PORTABLE_NAME,
            LITE_PORTABLE_NAME,
        }
    assert (out_dir / FULL_INSTALLER_NAME).read_bytes() == updater_bundle.read_bytes()
    assert (
        out_dir / LITE_INSTALLER_NAME
    ).read_bytes() == lite_updater_bundle.read_bytes()
    assert (out_dir / FULL_SIGNATURE_NAME).read_text(
        encoding="utf-8"
    ) == updater_signature.read_text(encoding="utf-8")
    assert (out_dir / LITE_SIGNATURE_NAME).read_text(
        encoding="utf-8"
    ) == lite_updater_signature.read_text(encoding="utf-8")

    manifest = json.loads((out_dir / "latest.json").read_text(encoding="utf-8"))
    platform = manifest["platforms"]["windows-x86_64"]
    assert manifest["version"] == "11.45.15"
    assert platform["signature"] == "ED25519_SIGNATURE_BASE64_STRING"
    assert platform["url"].endswith(f"/{FULL_INSTALLER_NAME}")
    lite_manifest = json.loads(
        (out_dir / "latest-lite.json").read_text(encoding="utf-8")
    )
    lite_platform = lite_manifest["platforms"]["windows-x86_64"]
    assert lite_platform["signature"] == "LITE_ED25519_SIGNATURE_BASE64_STRING"
    assert lite_platform["url"].endswith(f"/{LITE_INSTALLER_NAME}")
    assert lite_platform["url"] != platform["url"]
    assert lite_platform["signature"] != platform["signature"]


def test_prepare_release_assets_requires_all_inputs(tmp_path: Path):
    (
        mock_exe,
        mock_lite_exe,
        updater_bundle,
        updater_signature,
        lite_updater_bundle,
        lite_updater_signature,
    ) = _create_packaging_fixtures(tmp_path)

    with pytest.raises(FileNotFoundError, match="Target executable"):
        prepare_release_assets(
            exe_path=tmp_path / "non_existent.exe",
            lite_exe_path=mock_lite_exe,
            updater_bundle_path=updater_bundle,
            updater_signature_path=updater_signature,
            lite_updater_bundle_path=lite_updater_bundle,
            lite_updater_signature_path=lite_updater_signature,
            output_dir=tmp_path / "out",
            tag="v1.5.0",
            version="11.45.15",
        )

    with pytest.raises(FileNotFoundError, match="Tauri updater signature"):
        prepare_release_assets(
            exe_path=mock_exe,
            lite_exe_path=mock_lite_exe,
            updater_bundle_path=updater_bundle,
            updater_signature_path=tmp_path / "missing.sig",
            lite_updater_bundle_path=lite_updater_bundle,
            lite_updater_signature_path=lite_updater_signature,
            output_dir=tmp_path / "out",
            tag="v1.5.0",
            version="11.45.15",
        )


def test_diagnostics_workflow_security_and_contract():
    repo_root = Path(__file__).resolve().parent.parent
    diag_yml_path = repo_root / ".github" / "workflows" / "diagnostics.yml"
    assert diag_yml_path.is_file(), "diagnostics.yml must exist"

    content = diag_yml_path.read_text(encoding="utf-8")
    assert "INPUT_REPEAT_COUNT: ${{ github.event.inputs.repeat_count }}" in content
    assert "INPUT_TIMEOUT: ${{ github.event.inputs.timeout }}" in content
