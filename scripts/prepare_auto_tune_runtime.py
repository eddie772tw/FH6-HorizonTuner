"""Build the Windows x64 offline controller payload from hash-pinned upstream files.

Only this build tool downloads files. The distributed application never downloads
models or probes a user's Python installation. Run using the repository uv venv.
"""

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import tarfile
import tempfile
import urllib.request
import uuid
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "native/auto_tune_ocr/sources.lock.json"
OUTPUT = ROOT / "frontend/src-tauri/auto-tune-runtime"


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def acquire(spec, cache, offline):
    target = cache / spec["sha256"]
    if target.is_file() and digest(target) == spec["sha256"]:
        return target
    if offline:
        raise RuntimeError(f"Missing verified build input: {spec['url']}")
    partial = target.with_suffix(".partial")
    with urllib.request.urlopen(spec["url"], timeout=90) as response:
        with partial.open("wb") as output:
            shutil.copyfileobj(response, output)
    if digest(partial) != spec["sha256"]:
        partial.unlink()
        raise RuntimeError(f"Source checksum changed: {spec['url']}")
    partial.replace(target)
    return target


def unpack_python(archive, destination):
    # The upstream embeddable ZIP is flat; reject unexpected traversal and links.
    with zipfile.ZipFile(archive) as bundle:
        for entry in bundle.infolist():
            if entry.is_dir() or Path(entry.filename).name != entry.filename:
                raise ValueError(f"Unexpected Python archive entry: {entry.filename}")
            if (
                entry.filename.endswith((".exe", ".dll", ".pyd", ".zip", "._pth"))
                or entry.filename == "LICENSE.txt"
            ):
                (destination / entry.filename).write_bytes(bundle.read(entry))
    # Keep Python isolated from PYTHONPATH, registry and site-packages. Worker
    # imports its package explicitly from the sibling auto_tune directory.
    (destination / "python313._pth").write_text(
        "python313.zip\n.\n..\n", encoding="ascii"
    )


def prepare(cache, offline=False):
    if os.name != "nt":
        raise RuntimeError("The automated game controller is built on Windows x64.")
    sources = json.loads(SOURCES.read_text(encoding="utf-8"))
    cache.mkdir(parents=True, exist_ok=True)
    inputs = {
        name: acquire(spec, cache, offline)
        for name, spec in sources.items()
        if name != "schema"
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="auto-tune-build-", dir=cache) as temp:
        work = Path(temp)
        payload, sdk, models = work / "payload", work / "sdk", work / "models"
        native, python = payload / "auto_tune/native", payload / "python"
        notices = payload / "licenses"
        for directory in (native, python, sdk, models, notices):
            directory.mkdir(parents=True)
        unpack_python(inputs["python"], python)
        with zipfile.ZipFile(inputs["ort"]) as package:
            for name in package.namelist():
                if (
                    name.startswith("build/native/include/")
                    and name.endswith(".h")
                    or name.startswith("runtimes/win-x64/native/")
                    and name.endswith((".dll", ".lib"))
                ):
                    (sdk / Path(name).name).write_bytes(package.read(name))
            for name in ("LICENSE", "ThirdPartyNotices.txt"):
                (notices / f"ONNXRuntime-{name}.txt").write_bytes(package.read(name))
        for name in ("det", "rec"):
            with tarfile.open(inputs[name]) as archive:
                member = archive.getmember(sources[name]["member"])
                if not member.isfile():
                    raise ValueError("Model must be a regular file")
                with archive.extractfile(member) as stream:
                    (models / f"{name}.onnx").write_bytes(stream.read())
        shutil.copyfile(inputs["keys"], models / "keys.txt")
        shutil.copyfile(inputs["paddle_license"], notices / "PaddleOCR-LICENSE.txt")
        shutil.copyfile(SOURCES, notices / "sources.lock.json")
        subprocess.run(
            [
                "powershell.exe",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(ROOT / "native/auto_tune_ocr/build.ps1"),
                "-RuntimeSdk",
                str(sdk),
                "-ModelDirectory",
                str(models),
                "-OutputDirectory",
                str(native),
            ],
            check=True,
        )
        for path in native.iterdir():
            if path.suffix not in (".dll", ".onnx", ".txt", ".json"):
                path.unlink()
        files = {
            p.relative_to(payload).as_posix(): digest(p)
            for p in sorted(payload.rglob("*"))
            if p.is_file()
        }
        (payload / "manifest.json").write_text(
            json.dumps(files, indent=2) + "\n", encoding="utf-8"
        )
        # Preserve a previous good payload if acquisition or compilation failed.
        previous = OUTPUT.with_name(f".auto-tune-previous-{uuid.uuid4().hex}")
        if OUTPUT.exists():
            OUTPUT.rename(previous)
        try:
            payload.rename(OUTPUT)
        except OSError:
            if previous.exists():
                previous.rename(OUTPUT)
            raise
        if previous.exists():
            try:
                shutil.rmtree(previous)
            except OSError:
                print(
                    f"Previous build is in use; retained for later cleanup: {previous}"
                )
    print(
        f"Prepared {len(files)} files ({sum(p.stat().st_size for p in OUTPUT.rglob('*') if p.is_file()):,} bytes): {OUTPUT}"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--cache", type=Path, default=ROOT / "scratch/auto-tune-downloads"
    )
    parser.add_argument(
        "--offline", action="store_true", help="Use verified cached build inputs only"
    )
    args = parser.parse_args()
    prepare(args.cache.resolve(), args.offline)
