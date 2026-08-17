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
