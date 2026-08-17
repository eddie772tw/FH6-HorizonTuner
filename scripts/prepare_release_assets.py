"""Release assets preparation and Tauri v2 manifest generator.

This script packages the standalone executable, verifies signatures, and
generates a Tauri v2-compliant latest.json manifest for GitHub Releases.
"""

from __future__ import annotations

import argparse
import datetime
import json
import os
import zipfile
from pathlib import Path


def generate_latest_manifest(
    version: str,
    repo: str,
    tag: str,
    signature: str,
    notes: str = "",
    pub_date: str | None = None,
    download_filename: str = "FH6-HorizonTuner.exe",
) -> dict:
    """Generate Tauri v2 updater latest.json manifest dictionary."""
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
    sig_path: str | Path | None,
    output_dir: str | Path,
    tag: str,
    repo: str = "eddie772tw/FH6-HorizonTuner",
    notes: str = "",
) -> list[Path]:
    """Package binary, copy signature, generate portable ZIP and latest.json.

    Returns a list of generated artifact paths.
    """
    exe_file = Path(exe_path).resolve()
    out_dir = Path(output_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    if not exe_file.is_file():
        raise FileNotFoundError(f"Target executable does not exist: {exe_file}")

    created_files: list[Path] = []

    # 1. Target Executable in out_dir
    dest_exe = out_dir / "FH6-HorizonTuner.exe"
    if dest_exe != exe_file:
        import shutil

        shutil.copy2(exe_file, dest_exe)
    created_files.append(dest_exe)

    # 2. Signature Handling
    sig_content = ""
    dest_sig = out_dir / "FH6-HorizonTuner.exe.sig"
    if sig_path and Path(sig_path).is_file():
        sig_file = Path(sig_path).resolve()
        sig_content = sig_file.read_text(encoding="utf-8").strip()
        if dest_sig != sig_file:
            import shutil

            shutil.copy2(sig_file, dest_sig)
        created_files.append(dest_sig)
    elif dest_sig.is_file():
        sig_content = dest_sig.read_text(encoding="utf-8").strip()
        created_files.append(dest_sig)

    # 3. Create Portable ZIP
    zip_name = f"FH6-HorizonTuner-{tag}-Windows-Portable.zip"
    zip_dest = out_dir / zip_name
    with zipfile.ZipFile(zip_dest, "w", zipfile.ZIP_DEFLATED) as zip_f:
        zip_f.write(dest_exe, arcname="FH6-HorizonTuner.exe")
        if dest_sig.is_file():
            zip_f.write(dest_sig, arcname="FH6-HorizonTuner.exe.sig")
    created_files.append(zip_dest)

    # 4. Generate latest.json (if signature exists)
    if sig_content:
        manifest_data = generate_latest_manifest(
            version=tag,
            repo=repo,
            tag=tag,
            signature=sig_content,
            notes=notes,
        )
        manifest_dest = out_dir / "latest.json"
        manifest_dest.write_text(json.dumps(manifest_data, indent=2), encoding="utf-8")
        created_files.append(manifest_dest)

    return created_files


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Prepare Release Assets and Tauri Updater Manifest"
    )
    parser.add_argument("--exe", required=True, help="Path to FH6-HorizonTuner.exe")
    parser.add_argument("--sig", default=None, help="Path to FH6-HorizonTuner.exe.sig")
    parser.add_argument("--output-dir", default="dist/release", help="Output directory")
    parser.add_argument("--tag", required=True, help="Release Git tag (e.g. v1.5.0)")
    parser.add_argument(
        "--repo",
        default="eddie772tw/FH6-HorizonTuner",
        help="GitHub repository (owner/name)",
    )
    parser.add_argument("--notes", default="", help="Release notes markdown / summary")

    args = parser.parse_args()

    results = prepare_release_assets(
        exe_path=args.exe,
        sig_path=args.sig,
        output_dir=args.output_dir,
        tag=args.tag,
        repo=args.repo,
        notes=args.notes,
    )

    print(f"[SUCCESS] Prepared {len(results)} release artifacts:")
    for f in results:
        print(f"  - {f.name} ({f.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
