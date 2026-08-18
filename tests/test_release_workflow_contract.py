"""Contract and unit tests for release packaging workflows."""

import json
import zipfile
from pathlib import Path

import pytest

from scripts.prepare_release_assets import (
    generate_latest_manifest,
    prepare_release_assets,
)


def _create_packaging_fixtures(tmp_path: Path) -> tuple[Path, Path, Path]:
    source_dir = tmp_path / "src"
    source_dir.mkdir()
    mock_exe = source_dir / "FH6-HorizonTuner.exe"
    mock_exe.write_bytes(b"MOCK_PE_BINARY_CONTENT")

    updater_bundle = source_dir / "FH6-HorizonTuner_11.45.14_x64-setup.nsis.zip"
    with zipfile.ZipFile(updater_bundle, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("FH6-HorizonTuner_11.45.14_x64-setup.exe", b"MOCK_NSIS")

    updater_signature = source_dir / f"{updater_bundle.name}.sig"
    updater_signature.write_text("ED25519_SIGNATURE_BASE64_STRING\n", encoding="utf-8")
    return mock_exe, updater_bundle, updater_signature


def test_generate_latest_manifest_structure():
    manifest = generate_latest_manifest(
        version="11.45.14",
        repo="eddie772tw/FH6-HorizonTuner",
        tag="v1.5.0",
        signature="dGVzdHNpZ25hdHVyZQ==",
        download_filename="FH6-HorizonTuner_11.45.14_x64-setup.nsis.zip",
        notes="OTA upgrade release",
        pub_date="2026-08-17T12:00:00Z",
    )

    assert manifest["version"] == "11.45.14"
    assert manifest["notes"] == "OTA upgrade release"
    assert manifest["pub_date"] == "2026-08-17T12:00:00Z"
    win_platform = manifest["platforms"]["windows-x86_64"]
    assert win_platform["signature"] == "dGVzdHNpZ25hdHVyZQ=="
    assert win_platform["url"].endswith(
        "/v1.5.0/FH6-HorizonTuner_11.45.14_x64-setup.nsis.zip"
    )


def test_prepare_release_assets_creates_four_release_artifacts(tmp_path: Path):
    mock_exe, updater_bundle, updater_signature = _create_packaging_fixtures(tmp_path)
    out_dir = tmp_path / "dist_release"

    artifacts = prepare_release_assets(
        exe_path=mock_exe,
        updater_bundle_path=updater_bundle,
        updater_signature_path=updater_signature,
        output_dir=out_dir,
        tag="v1.5.0",
        version="11.45.14",
        repo="eddie772tw/FH6-HorizonTuner",
        notes="Changelog for v1.5.0",
    )

    artifact_names = [artifact.name for artifact in artifacts]
    assert artifact_names == [
        "FH6-HorizonTuner.exe",
        updater_bundle.name,
        updater_signature.name,
        "latest.json",
    ]
    assert not list(out_dir.glob("*-Windows-Portable.zip"))

    manifest = json.loads((out_dir / "latest.json").read_text(encoding="utf-8"))
    platform = manifest["platforms"]["windows-x86_64"]
    assert manifest["version"] == "11.45.14"
    assert platform["signature"] == "ED25519_SIGNATURE_BASE64_STRING"
    assert platform["url"].endswith(f"/{updater_bundle.name}")

    with zipfile.ZipFile(out_dir / updater_bundle.name) as archive:
        assert any(name.endswith(".exe") for name in archive.namelist())


def test_prepare_release_assets_requires_all_inputs(tmp_path: Path):
    mock_exe, updater_bundle, updater_signature = _create_packaging_fixtures(tmp_path)

    with pytest.raises(FileNotFoundError, match="Target executable"):
        prepare_release_assets(
            exe_path=tmp_path / "non_existent.exe",
            updater_bundle_path=updater_bundle,
            updater_signature_path=updater_signature,
            output_dir=tmp_path / "out",
            tag="v1.5.0",
            version="11.45.14",
        )

    with pytest.raises(FileNotFoundError, match="Tauri updater signature"):
        prepare_release_assets(
            exe_path=mock_exe,
            updater_bundle_path=updater_bundle,
            updater_signature_path=tmp_path / "missing.sig",
            output_dir=tmp_path / "out",
            tag="v1.5.0",
            version="11.45.14",
        )


def test_release_workflow_security_and_contract():
    repo_root = Path(__file__).resolve().parent.parent
    release_yml_path = repo_root / ".github" / "workflows" / "release.yml"
    assert release_yml_path.is_file(), "release.yml must exist"

    content = release_yml_path.read_text(encoding="utf-8")
    assert "${{ github.event.release.body }}" not in content
    assert "github.event.release.body" not in content
    assert "EVENT_NAME: ${{ github.event_name }}" in content
    assert "EVENT_TAG: ${{ github.event.release.tag_name }}" in content
    assert "INPUT_TAG: ${{ github.event.inputs.tag_name }}" in content
    assert "REF_NAME: ${{ github.ref_name }}" in content
    assert '"createUpdaterArtifacts": true' in (
        repo_root / "frontend" / "src-tauri" / "tauri.conf.json"
    ).read_text(encoding="utf-8")
    assert "--no-bundle" not in content
    assert "--updater-bundle" in content
    assert "*.nsis.zip" in content
    assert "latest.json" in content

    frontend_build_pos = content.find("Build Frontend Production Bundle")
    tauri_build_pos = content.find("Build and Sign Tauri Release Executable")
    assert frontend_build_pos != -1 and tauri_build_pos != -1
    assert frontend_build_pos < tauri_build_pos


def test_packaging_test_workflow_does_not_publish_release():
    workflow_path = (
        Path(__file__).resolve().parent.parent
        / ".github"
        / "workflows"
        / "release-packaging-test.yml"
    )
    content = workflow_path.read_text(encoding="utf-8")
    assert "workflow_dispatch:" in content
    assert "pull_request:" in content
    assert "prepare_release_assets.py" in content
    assert "softprops/action-gh-release" not in content
    assert "contents: write" not in content


def test_diagnostics_workflow_security_and_contract():
    repo_root = Path(__file__).resolve().parent.parent
    diag_yml_path = repo_root / ".github" / "workflows" / "diagnostics.yml"
    assert diag_yml_path.is_file(), "diagnostics.yml must exist"

    content = diag_yml_path.read_text(encoding="utf-8")
    assert "INPUT_REPEAT_COUNT: ${{ github.event.inputs.repeat_count }}" in content
    assert "INPUT_TIMEOUT: ${{ github.event.inputs.timeout }}" in content
