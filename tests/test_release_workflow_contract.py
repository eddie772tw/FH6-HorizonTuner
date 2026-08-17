"""Contract and unit tests for the Release workflow asset preparation tool."""

import json
import zipfile
from pathlib import Path

import pytest

from scripts.prepare_release_assets import (
    generate_latest_manifest,
    prepare_release_assets,
)


def test_generate_latest_manifest_structure():
    manifest = generate_latest_manifest(
        version="v1.5.0",
        repo="eddie772tw/FH6-HorizonTuner",
        tag="v1.5.0",
        signature="dGVzdHNpZ25hdHVyZQ==",
        notes="OTA upgrade release",
        pub_date="2026-08-17T12:00:00Z",
    )

    assert manifest["version"] == "1.5.0"
    assert manifest["notes"] == "OTA upgrade release"
    assert manifest["pub_date"] == "2026-08-17T12:00:00Z"
    assert "windows-x86_64" in manifest["platforms"]

    win_platform = manifest["platforms"]["windows-x86_64"]
    assert win_platform["signature"] == "dGVzdHNpZ25hdHVyZQ=="
    assert (
        win_platform["url"]
        == "https://github.com/eddie772tw/FH6-HorizonTuner/releases/download/v1.5.0/FH6-HorizonTuner.exe"
    )


def test_prepare_release_assets_creates_zip_and_manifest(tmp_path: Path):
    source_dir = tmp_path / "src"
    source_dir.mkdir()
    mock_exe = source_dir / "FH6-HorizonTuner.exe"
    mock_exe.write_bytes(b"MOCK_PE_BINARY_CONTENT")

    mock_sig = source_dir / "FH6-HorizonTuner.exe.sig"
    mock_sig.write_text("ED25519_SIGNATURE_BASE64_STRING\n", encoding="utf-8")

    out_dir = tmp_path / "dist_release"

    artifacts = prepare_release_assets(
        exe_path=mock_exe,
        sig_path=mock_sig,
        output_dir=out_dir,
        tag="v1.5.0",
        repo="eddie772tw/FH6-HorizonTuner",
        notes="Changelog for v1.5.0",
    )

    artifact_names = [f.name for f in artifacts]
    assert "FH6-HorizonTuner.exe" in artifact_names
    assert "FH6-HorizonTuner.exe.sig" in artifact_names
    assert "FH6-HorizonTuner-v1.5.0-Windows-Portable.zip" in artifact_names
    assert "latest.json" in artifact_names

    # Verify Portable ZIP internal layout
    zip_path = out_dir / "FH6-HorizonTuner-v1.5.0-Windows-Portable.zip"
    with zipfile.ZipFile(zip_path, "r") as z:
        names = z.namelist()
        assert "FH6-HorizonTuner.exe" in names
        assert "FH6-HorizonTuner.exe.sig" in names

    # Verify latest.json structure and contents
    manifest_path = out_dir / "latest.json"
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert data["version"] == "1.5.0"
    assert (
        data["platforms"]["windows-x86_64"]["signature"]
        == "ED25519_SIGNATURE_BASE64_STRING"
    )


def test_prepare_release_assets_missing_exe_raises(tmp_path: Path):
    with pytest.raises(FileNotFoundError):
        prepare_release_assets(
            exe_path=tmp_path / "non_existent.exe",
            sig_path=None,
            output_dir=tmp_path / "out",
            tag="v1.5.0",
        )


def test_release_workflow_security_and_contract():
    repo_root = Path(__file__).resolve().parent.parent
    release_yml_path = repo_root / ".github" / "workflows" / "release.yml"
    assert release_yml_path.is_file(), "release.yml must exist"

    content = release_yml_path.read_text(encoding="utf-8")

    # Ensure dangerous multi-line body template expansion in shell run script is eliminated
    assert "${{ github.event.release.body }}" not in content
    assert "github.event.release.body" not in content

    # Verify that Determine Release Tag uses env mapping
    assert "EVENT_NAME: ${{ github.event_name }}" in content
    assert "EVENT_TAG: ${{ github.event.release.tag_name }}" in content
    assert "INPUT_TAG: ${{ github.event.inputs.tag_name }}" in content
    assert "REF_NAME: ${{ github.ref_name }}" in content

    # Verify frontend production bundle is built before tauri packaging
    assert "Build Frontend Production Bundle" in content
    assert "pnpm --prefix frontend run build" in content
    frontend_build_pos = content.find("Build Frontend Production Bundle")
    tauri_build_pos = content.find("Build and Sign Tauri Release Executable")
    assert frontend_build_pos != -1 and tauri_build_pos != -1
    assert frontend_build_pos < tauri_build_pos, (
        "Frontend build must precede Tauri executable packaging"
    )


def test_diagnostics_workflow_security_and_contract():
    repo_root = Path(__file__).resolve().parent.parent
    diag_yml_path = repo_root / ".github" / "workflows" / "diagnostics.yml"
    assert diag_yml_path.is_file(), "diagnostics.yml must exist"

    content = diag_yml_path.read_text(encoding="utf-8")

    # Verify that Set configuration from input uses env mapping
    assert "INPUT_REPEAT_COUNT: ${{ github.event.inputs.repeat_count }}" in content
    assert "INPUT_TIMEOUT: ${{ github.event.inputs.timeout }}" in content
