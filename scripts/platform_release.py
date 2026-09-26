"""Native Full release assets and per-platform Tauri updater manifests."""

from __future__ import annotations

import argparse
import json
import shutil
from dataclasses import dataclass
from pathlib import Path

if __package__:
    from .prepare_release_assets import generate_latest_manifest
else:
    from prepare_release_assets import generate_latest_manifest


@dataclass(frozen=True)
class PlatformRelease:
    target: str
    manifest: str
    payload_name: str
    download_name: str


PLATFORMS = {
    "linux": PlatformRelease(
        "linux-x86_64",
        "latest-linux.json",
        "FH6-HorizonTuner-Full-Linux-x86_64.AppImage",
        "FH6-HorizonTuner-Full-Linux-x86_64.AppImage",
    ),
}


def exactly_one(root: Path, pattern: str) -> Path:
    files = sorted(root.glob(pattern))
    if len(files) != 1:
        raise ValueError(f"Expected one {pattern} under {root}, found {len(files)}")
    return files[0]


def stage_platform(
    platform: str, bundle_root: Path, output: Path, version: str, tag: str, repo: str
) -> list[Path]:
    """Stage already signed bytes without modifying/repacking the OTA payload."""
    profile = PLATFORMS[platform]
    payload = download = exactly_one(bundle_root, "appimage/*.AppImage")
    signature = Path(str(payload) + ".sig")
    signature_text = signature.read_text(encoding="utf-8").strip()
    if not signature_text or not payload.stat().st_size or not download.stat().st_size:
        raise ValueError(
            "Release payload, download and updater signature must not be empty"
        )
    output.mkdir(parents=True, exist_ok=True)
    sources = {
        profile.download_name: download,
        profile.payload_name: payload,
        profile.payload_name + ".sig": signature,
    }
    artifacts = []
    for name, source in sources.items():
        destination = output / name
        shutil.copy2(source, destination)
        artifacts.append(destination)
    manifest = generate_latest_manifest(
        version,
        repo,
        tag,
        signature_text,
        profile.payload_name,
        notes=f"FH6-HorizonTuner Full {tag}",
        platform=profile.target,
    )
    manifest_file = output / profile.manifest
    manifest_file.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return [*artifacts, manifest_file]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--platform", required=True, choices=PLATFORMS)
    parser.add_argument("--bundle-root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--tag", required=True)
    parser.add_argument("--repo", required=True)
    args = parser.parse_args()
    for path in stage_platform(
        args.platform,
        args.bundle_root,
        args.output_dir,
        args.version,
        args.tag,
        args.repo,
    ):
        print(path.name)


if __name__ == "__main__":
    main()
