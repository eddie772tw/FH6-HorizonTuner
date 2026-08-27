"""Prepare portable and Tauri updater assets for a GitHub Release."""

from __future__ import annotations

import argparse
import datetime
import json
import shutil
import zipfile
from pathlib import Path


def generate_latest_manifest(
    version: str,
    repo: str,
    tag: str,
    signature: str,
    download_filename: str,
    notes: str = "",
    pub_date: str | None = None,
) -> dict:
    """Generate a Tauri v2 static updater manifest."""
    clean_version = version.lstrip("v")
    if not pub_date:
        pub_date = datetime.datetime.now(datetime.timezone.utc).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )

    download_url = (
        f"https://github.com/{repo}/releases/download/{tag}/{download_filename}"
    )

    return {
        "version": clean_version,
        "notes": notes or f"FH6-HorizonTuner Release {tag}",
        "pub_date": pub_date,
        "platforms": {
            "windows-x86_64": {
                "signature": signature.strip(),
                "url": download_url,
            }
        },
    }


def prepare_release_assets(
    exe_path: str | Path,
    lite_exe_path: str | Path,
    updater_bundle_path: str | Path,
    updater_signature_path: str | Path,
    output_dir: str | Path,
    tag: str,
    version: str,
    repo: str = "eddie772tw/FH6-HorizonTuner",
    notes: str = "",
) -> list[Path]:
    """Stage both portable binaries and signed Tauri updater artifacts.

    The updater bundle and signature are mandatory. A release must never be
    published without a manifest that points at a verifiable OTA payload.
    """
    exe_file = Path(exe_path).resolve()
    lite_exe_file = Path(lite_exe_path).resolve()
    updater_bundle_file = Path(updater_bundle_path).resolve()
    updater_signature_file = Path(updater_signature_path).resolve()
    out_dir = Path(output_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    required_files = (
        (exe_file, "Target executable"),
        (lite_exe_file, "Lite target executable"),
        (updater_bundle_file, "Tauri updater bundle"),
        (updater_signature_file, "Tauri updater signature"),
    )
    for path, label in required_files:
        if not path.is_file():
            raise FileNotFoundError(f"{label} does not exist: {path}")

    dest_exe = out_dir / "FH6-HorizonTuner.exe"
    dest_lite_exe = out_dir / "FH6-HorizonTuner_lite.exe"
    dest_bundle = out_dir / updater_bundle_file.name
    dest_signature = out_dir / updater_signature_file.name
    for source, destination in (
        (exe_file, dest_exe),
        (lite_exe_file, dest_lite_exe),
        (updater_bundle_file, dest_bundle),
        (updater_signature_file, dest_signature),
    ):
        if source != destination:
            shutil.copy2(source, destination)

    signature = dest_signature.read_text(encoding="utf-8").strip()
    if not signature:
        raise ValueError(f"Tauri updater signature is empty: {dest_signature}")

    manifest_data = generate_latest_manifest(
        version=version,
        repo=repo,
        tag=tag,
        signature=signature,
        download_filename=dest_bundle.name,
        notes=notes,
    )
    manifest_dest = out_dir / "latest.json"
    manifest_dest.write_text(
        json.dumps(manifest_data, indent=2) + "\n", encoding="utf-8"
    )

    portable_archive = out_dir / "FH6-HorizonTuner-portable.zip"
    with zipfile.ZipFile(
        portable_archive, "w", compression=zipfile.ZIP_DEFLATED
    ) as archive:
        archive.write(dest_exe, dest_exe.name)
        archive.write(dest_lite_exe, dest_lite_exe.name)

    return [
        dest_exe,
        dest_lite_exe,
        portable_archive,
        dest_bundle,
        dest_signature,
        manifest_dest,
    ]


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Prepare portable assets and a Tauri updater manifest"
    )
    parser.add_argument("--exe", required=True, help="Path to FH6-HorizonTuner.exe")
    parser.add_argument(
        "--lite-exe", required=True, help="Path to FH6-HorizonTuner_lite.exe"
    )
    parser.add_argument(
        "--updater-bundle",
        required=True,
        help="Path to the signed Tauri updater bundle (-setup.exe or .nsis.zip)",
    )
    parser.add_argument(
        "--updater-signature",
        required=True,
        help="Path to the updater bundle signature (.sig)",
    )
    parser.add_argument("--output-dir", default="dist/release", help="Output directory")
    parser.add_argument("--tag", required=True, help="Git release tag (e.g. v1.5.0)")
    parser.add_argument(
        "--version",
        required=True,
        help="Tauri/Cargo runtime SemVer used by the updater manifest",
    )
    parser.add_argument(
        "--repo",
        default="eddie772tw/FH6-HorizonTuner",
        help="GitHub repository (owner/name)",
    )
    parser.add_argument("--notes", default="", help="Release notes markdown / summary")
    args = parser.parse_args()

    results = prepare_release_assets(
        exe_path=args.exe,
        lite_exe_path=args.lite_exe,
        updater_bundle_path=args.updater_bundle,
        updater_signature_path=args.updater_signature,
        output_dir=args.output_dir,
        tag=args.tag,
        version=args.version,
        repo=args.repo,
        notes=args.notes,
    )

    print(f"[SUCCESS] Prepared {len(results)} release artifacts:")
    for artifact in results:
        print(f"  - {artifact.name} ({artifact.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
