"""Read-only, network-disabled verification of the exact embedded controller.

Never constructs Device or sends keyboard/mouse input. Expected results and PNG
digests come from a separately captured and manually transcribed corpus.
"""

import argparse
import hashlib
import importlib
import json
import os
import sys
import time
from pathlib import Path

if __name__ == "__main__" and not __package__:
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    __package__ = "auto_tune"


def replay(case, root):
    from .car_card import read_card_stats
    from .collect import _classify_scene, _read_card
    from .shop import read_tire_size
    from .vision import read_tuning_page

    path = (root / case["file"]).resolve()
    if not path.is_relative_to(root.resolve()):
        raise ValueError("Capture path leaves corpus")
    with path.open("rb") as stream:
        if hashlib.file_digest(stream, "sha256").hexdigest() != case["sha256"]:
            raise ValueError(f"Frame digest mismatch: {path.name}")
    kind = case["kind"]
    if kind == "ocr":
        from .ocr_session import read

        return read(path, case["regions"])
    if kind == "card":
        data = _read_card(path)
        return {
            "car": data["carName"],
            "class": data["carClass"],
            "pi": data["performanceIndex"],
            "drive": data["drivetrain"],
            "stats": {k: list(pair) for k, pair in read_card_stats(path).items()},
            "canonical": {
                k: round(data[k], 6)
                for k in ("weight", "maxTorque", "displacementLiters")
            },
        }
    if kind == "preview":
        try:
            _read_card(path)
        except ValueError as exc:
            if "車卡與目前車輛不符" in str(exc):
                return "rejected: selected card is not the active car"
            raise
        return "accepted"
    if kind == "scene":
        return _classify_scene(path)
    if kind == "tire":
        return list(read_tire_size(path, case["axle"]))
    if kind == "tuning":
        page = read_tuning_page(path)
        return {
            "page": page["page"],
            "car": page["car"],
            "values": {k: [v, page["units"][k]] for k, v in page["fields"].items()},
            "locked": [k for k, row in page["rows"].items() if row["locked"]],
        }
    raise ValueError(f"Unknown replay kind {kind!r}")


def verify(corpus, manifest, rounds):
    def offline(event, _args):
        if event in (
            "socket.connect",
            "socket.getaddrinfo",
            "subprocess.Popen",
            "os.system",
        ):
            raise RuntimeError(f"Offline verification forbids {event}")

    sys.addaudithook(offline)
    os.environ["FH6_OCR_ENGINE"] = "onnx"
    os.environ["FH6_OCR_RUNTIME"] = str(Path(__file__).with_name("native"))
    from . import ocr_session

    # Check all controller imports in the shipped isolated runtime, without input.
    for path in Path(__file__).parent.glob("*.py"):
        importlib.import_module(f"{__package__}.{path.stem}")
    cases = json.loads(manifest.read_text(encoding="utf-8"))["cases"]
    if not cases or not 1 <= rounds <= 10:
        raise ValueError("Expected a nonempty corpus and 1-10 replay rounds")
    results = []
    for index in range(rounds):
        start = time.perf_counter()
        failures = []
        for case in cases:
            try:
                actual = replay(case, corpus)
                if actual != case["expected"]:
                    failures.append(
                        {
                            "file": case["file"],
                            "actual": actual,
                            "expected": case["expected"],
                        }
                    )
            except Exception as exc:
                failures.append({"file": case["file"], "error": str(exc)})
        results.append(
            {
                "round": index + 1,
                "seconds": time.perf_counter() - start,
                "cases": len(cases),
                "failures": failures,
            }
        )
    ocr_session.close()
    return {
        "python": sys.version,
        "isolated": bool(sys.flags.isolated),
        "network": "denied by audit hook",
        "engine": "PP-OCRv6 small / ONNX Runtime CPU",
        "rounds": results,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--corpus", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--rounds", type=int, default=2)
    args = parser.parse_args()
    report = verify(args.corpus, args.manifest, args.rounds)
    print(json.dumps(report, ensure_ascii=False))
    raise SystemExit(int(any(r["failures"] for r in report["rounds"])))
