"""Exercise native asset staging with signed fixture bytes, not workflow text."""

import json

import pytest

from scripts.platform_release import PLATFORMS, stage_platform


def test_signed_payload_is_unchanged_and_manifest_targets_only_its_platform(
    tmp_path,
):
    platform = "linux"
    bundle = tmp_path / "bundle"
    payload = bundle / "appimage/Tuner.AppImage"
    payload.parent.mkdir(parents=True)
    payload.write_bytes(b"already-signed-native-payload")
    payload.with_name(payload.name + ".sig").write_bytes(b"updater-signature\n")
    output = tmp_path / "output"
    artifacts = stage_platform(
        platform, bundle, output, "11.45.18", "v2-launch", "owner/repo"
    )
    profile = PLATFORMS[platform]
    assert (output / profile.payload_name).read_bytes() == payload.read_bytes()
    assert (
        output / (profile.payload_name + ".sig")
    ).read_bytes() == b"updater-signature\n"
    manifest = json.loads((output / profile.manifest).read_bytes())
    assert manifest["version"] == "11.45.18"
    assert manifest["platforms"] == {
        profile.target: {
            "signature": "updater-signature",
            "url": f"https://github.com/owner/repo/releases/download/v2-launch/{profile.payload_name}",
        }
    }
    assert len(artifacts) == 3


def test_missing_or_ambiguous_native_artifact_is_rejected(tmp_path):
    with pytest.raises(ValueError, match="Expected one"):
        stage_platform("linux", tmp_path, tmp_path / "out", "1.0.0", "v1", "owner/repo")
    (tmp_path / "appimage").mkdir()
    for name in ("old.AppImage", "new.AppImage"):
        (tmp_path / "appimage" / name).write_bytes(b"payload")
    with pytest.raises(ValueError, match="found 2"):
        stage_platform("linux", tmp_path, tmp_path / "out", "1.0.0", "v1", "owner/repo")
