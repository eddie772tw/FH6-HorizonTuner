"""Exercise the shipped EXE's offline extraction and native CPU OCR on a blank PNG.

This is packaging evidence, not game accuracy evidence. Full real-frame replay is
available through --auto-tune-verify with an independently labelled corpus.
"""

import argparse
import hashlib
import json
import os
import shutil
import struct
import subprocess
import zlib
from pathlib import Path


def blank_png():
    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", 512, 192, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress((b"\x00" + b"\xff" * 512 * 3) * 192))
        + chunk(b"IEND", b"")
    )


def smoke(executable, evidence):
    evidence.mkdir(parents=True, exist_ok=False)
    target = evidence / "FH6-HorizonTuner.exe"
    shutil.copyfile(executable, target)
    frame = blank_png()
    (evidence / "blank.png").write_bytes(frame)
    manifest = {
        "cases": [
            {
                "file": "blank.png",
                "sha256": hashlib.sha256(frame).hexdigest(),
                "kind": "ocr",
                "regions": [
                    {
                        "name": "blank",
                        "bounds": {"x": 0, "y": 0, "width": 1, "height": 1},
                    },
                    {
                        "name": "empty_right",
                        "bounds": {"x": 1, "y": 0, "width": 1e-6, "height": 1},
                        "only_rec": True,
                    },
                    {
                        "name": "empty_bottom",
                        "bounds": {"x": 0, "y": 1, "width": 1, "height": 1e-6},
                        "only_rec": True,
                    },
                ],
                "expected": {
                    "blank": {"status": "ok", "text": "", "confidence": 0.0},
                    "empty_right": {
                        "status": "unknown",
                        "text": "",
                        "error": "Empty normalized crop",
                    },
                    "empty_bottom": {
                        "status": "unknown",
                        "text": "",
                        "error": "Empty normalized crop",
                    },
                },
            }
        ]
    }
    specification = evidence / "manifest.json"
    specification.write_text(json.dumps(manifest), encoding="utf-8")
    report = evidence / "report.json"
    env = dict(
        os.environ,
        PATH="",
        FH6_OCR_ENGINE="invalid",
        FH6_OCR_RUNTIME="Z:/absent",
        PYTHONHOME="Z:/absent",
        PYTHONPATH="Z:/absent",
    )
    result = subprocess.run(
        [
            str(target),
            "--auto-tune-verify",
            str(evidence),
            str(specification),
            report.name,
        ],
        cwd=evidence,
        env=env,
        timeout=120,
        capture_output=True,
    )
    data = json.loads(report.read_text(encoding="utf-8"))
    if result.returncode or not data["success"] or not data["result"]["isolated"]:
        raise RuntimeError(json.dumps(data, ensure_ascii=False))
    print(json.dumps(data, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--exe", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    args = parser.parse_args()
    smoke(args.exe.resolve(), args.evidence.resolve())
