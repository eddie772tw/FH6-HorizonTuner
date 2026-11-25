"""Compare OCR engines on manually transcribed, immutable DB5 game frames.

Run as a module, e.g. python -m scripts.benchmark_auto_tune_ocr --engine windows.
Cold samples start independent Python processes with a warm OS file cache.
Warm samples include decoding one PNG and all requested regions on that frame.
"""

import argparse
import hashlib
import json
import math
import os
import shutil
import subprocess
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from time import perf_counter

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "scratch" / "onnx-ocr-comparison"
RUN = (
    ROOT
    / "scratch/auto-tune-desktop-20261124-110513/desktop/auto-tune"
    / "run-1795491341768189-76112"
)
FRAMES = {
    "0005-current-car.png": "898cadb191a4810fd63720d40ebc96257c87b3fcc671ee6c710f8d850b37acd4",
    "0007-garage.png": "b6b85bc7e1e59e3f4a65a809644f37d0e15cdbc761bfefecb540c04439062ca4",
    "0010-throttle.png": "5e4ab9fe76c2ecf5ee5815e166911d47fb4f361a0bd7b8bd0ddde8c9113a1c95",
    "0015-installed-compound.png": "f6e6e6918e464f2a750507dd1c7407882f8b31d2245cfada715034f34237f8f3",
    "0017-installed-front.png": "a282723fe439b4b77d421d11bf4f7b6f2411f4ad6a1a852060ada68cb00968de",
    "0019-installed-rear.png": "da0ad0eb88c33fa8cf8e606064bea70e7760117a9ab79785227b8db0c4387009",
    "0030-discard-prompt.png": "6c3234a5c07c473fd2df1a3b29a8de07c2491a662c1c1760205d38c9c3cd10fe",
    "0046-confirm.png": "55763be9fa96d394523900288f9b9c295f5dd3981a4028c001060aa64e7f5bc2",
    "0069-____.png": "d400d08c17b7d59aac2096c5de53e4f1d655205707beff1b6fa25f61c21a807b",
    "0070-_______.png": "28d3b8949454994fbacf8a2a4d17be415021f6252b7671e07da8cc2e0f00c520",
    "0106-tyres.png": "f01a625fd3887dc90c492a692a325384294ce78d3d3153037fb13fd67ba00b46",
    "0107-alignment.png": "2e36aa355c27b44f77c1915f34f8b12bbc2979cacf2372bef86637e1ece7b4c1",
    "0108-arb.png": "ce751d4944e05f559e2ea1ca2092eaf1998c181714093d9cd209f95f486f568e",
    "0109-springs.png": "b2ec0206621a817720625bdcb1cc432244471cc0287f7076fe725fdb8bef38d6",
    "0110-damping.png": "43ccd352a6cc8a4ffd8bb0934d0b3f9a0c4b8a9b8fa4ad2c0810e1ad5d7cb084",
    "0111-diff.png": "5419ff89d02af9b25e8a81335093cfeadbb3b78ca252f562a1612dfd75ba4c3b",
    "0112-gears.png": "f2419dc400c0e59cf5747308b265660a94c71989cf0db1b74b2c7f02e8fa21ad",
}


def corpus():
    cases = []
    filenames = {int(name[:4]): name for name in FRAMES}

    def add(
        frame, name, category, box, expected, lang="zh-Hant-TW", mode="", block=False
    ):
        cases.append(
            dict(
                frame=filenames[frame],
                name=name,
                category=category,
                box=list(box),
                expected=expected,
                language=lang,
                mode=mode,
                layout="block" if block else "line",
            )
        )

    add(5, "car", "card", (80, 20, 415, 40), "1964 Aston Martin DB5", "en-US")
    add(5, "current", "card", (217, 76, 346, 102), "目前車輛")
    add(5, "drive", "card", (124, 414, 199, 443), "RWD", "en-US")
    add(5, "pi", "card", (16, 16, 73, 44), "B 600", "en-US", "light")
    add(
        5,
        "car_card",
        "multiline",
        (205, 104, 368, 150),
        "DB5 1964 ASTON MARTIN",
        "en-US",
        block=True,
    )
    add(
        5,
        "stats",
        "multiline",
        (49, 240, 201, 365),
        "馬力 316 hp 扭力 316 ft·lb 車重 2,700 lb 前端重量比 51% 排氣量 4.00 l",
        block=True,
    )
    add(5, "empty_card", "empty", (45, 369, 193, 402), "", "en-US")
    add(
        7,
        "options",
        "multiline",
        (33, 236, 222, 350),
        "自訂升級 自動升級 升級預設集 自訂調校",
        block=True,
    )
    add(10, "engine", "menu", (43, 55, 208, 92), "引擎", mode="light")
    add(10, "throttle", "menu", (49, 326, 260, 353), "進氣歧管/節氣門")
    add(15, "compound", "tires", (49, 320, 278, 354), "跑車版踏面膠料")
    for frame, axle, heading, size in (
        (17, "front", "前輪胎寬", "255/60R15"),
        (19, "rear", "後輪胎寬", "285/55R15"),
    ):
        add(frame, axle + "_title", "tires", (43, 55, 208, 90), heading, mode="light")
        add(frame, axle + "_badge", "tires", (48, 166.5, 126, 189.5), "已安裝")
        add(frame, axle + "_size", "tires", (48, 220.5, 125, 242.5), size, "en-US")
    for frame, prefix, title, prompt in (
        (30, "discard", "設定已變更", "你目前的設定已變更。是否立即套用？"),
        (46, "apply", "套用設定", "是否要套用目前的設定？"),
    ):
        add(frame, prefix + "_title", "menu", (314, 206, 647, 244), title)
        add(frame, prefix + "_prompt", "menu", (314, 248, 647, 276), prompt)
        add(frame, prefix + "_yes", "menu", (314, 280, 647, 306), "是")
        add(frame, prefix + "_no", "menu", (314, 311, 647, 335), "不")
    add(46, "empty_dialog", "empty", (675, 325, 780, 347), "")
    add(69, "map_decoy", "map", (236, 161, 390, 186), "地平線攀爬賽")
    add(70, "map_target", "map", (263, 77, 417, 102), "嘉年華一公里")
    rows = {
        106: [(0, "pressure_front", "29.5"), (1, "pressure_rear", "28.0")],
        107: [
            (0, "camber_front", "-2.1°"),
            (1, "camber_rear", "-1.3°"),
            (3, "toe_front", "0.1°"),
            (4, "toe_rear", "-0.1°"),
            (6, "caster", "6.0°"),
        ],
        108: [(0, "arb_front", "33.60"), (1, "arb_rear", "32.40")],
        109: [
            (0, "spring_front", "851.2"),
            (1, "spring_rear", "829.0"),
            (3, "height_front", "5.7"),
            (4, "height_rear", "7.0"),
        ],
        110: [
            (0, "rebound_front", "10.7"),
            (1, "rebound_rear", "10.3"),
            (3, "bump_front", "6.4"),
            (4, "bump_rear", "6.2"),
        ],
        111: [(0, "acceleration", "40%"), (1, "deceleration", "20%")],
        112: [
            (i, "gear_" + str(i), value)
            for i, value in enumerate(
                ["3.99", "1.84", "1.43", "1.15", "0.96", "0.82", "0.72"]
            )
        ],
    }
    for frame, labels in rows.items():
        for row, name, expected in labels:
            y = 144.5 + 27 * row
            add(frame, name, "numeric", (664, y - 11, 698, y + 11), expected, "en-US")
    return cases


def prepare(source, output):
    frames = output / "frames"
    frames.mkdir(parents=True, exist_ok=True)
    for filename, expected_hash in FRAMES.items():
        target = frames / filename
        if not target.exists():
            shutil.copyfile(source / filename, target)
        with target.open("rb") as f:
            if hashlib.file_digest(f, "sha256").hexdigest() != expected_hash:
                raise ValueError(f"Screenshot SHA-256 mismatch: {target}")
    (output / "corpus.json").write_text(
        json.dumps(
            {"frames": FRAMES, "reference_size": [960, 540], "cases": corpus()},
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )


def normalize(text):
    # Ignore layout whitespace and equivalent Unicode width/minus forms only.
    return "".join(unicodedata.normalize("NFKC", text).replace("−", "-").split())


def requests(cases, engine):
    result = []
    for case in cases:
        x, y, right, bottom = case["box"]
        request = dict(
            name=case["name"],
            language=case["language"],
            bounds=dict(
                x=x / 960, y=y / 540, width=(right - x) / 960, height=(bottom - y) / 540
            ),
        )
        if case["mode"]:
            request.update(mode=case["mode"], scale=2)
        if engine == "native-lines":
            request["only_rec"] = case["layout"] == "line"
        result.append(request)
    return result


def open_session(engine, runtime):
    if engine == "windows":
        from scripts.auto_tune.ocr_session import OcrSession

        return OcrSession()
    from scripts.auto_tune.native_ocr import NativeOcrSession

    return NativeOcrSession(runtime)


def capture(session, path, cases, engine):
    reads = session.read(path, requests(cases, engine))
    if set(reads) != {c["name"] for c in cases}:
        raise RuntimeError(f"Unexpected reply fields on {path.name}")
    return {
        name: {
            "text": region.get("text", ""),
            "status": region["status"],
            **({"error": region["error"]} if "error" in region else {}),
        }
        for name, region in reads.items()
    }


def summary(samples):
    values = sorted(samples)
    # Empirical nearest rank, including the observed maximum for n < 20.
    return {
        "n": len(values),
        **{
            label: round(values[math.ceil(len(values) * q) - 1], 3)
            for label, q in (("p50_ms", 0.50), ("p95_ms", 0.95))
        },
    }


def score(cases, outputs):
    if not outputs:
        raise ValueError("At least one measured OCR pass is required")
    totals = Counter()
    correct = Counter()
    misses = {}
    for case in cases:
        name, category = case["name"], case["category"]
        totals[category] += 1
        variants = [o[name] for o in outputs]
        if all(
            v["status"] == "ok" and normalize(v["text"]) == normalize(case["expected"])
            for v in variants
        ):
            correct[category] += 1
        else:
            misses[name] = {
                "expected": case["expected"],
                "observed": [
                    json.loads(v)
                    for v in sorted({json.dumps(r, sort_keys=True) for r in variants})
                ],
            }
    return {
        "exact": correct.total(),
        "total": totals.total(),
        "by_category": {
            k: {"exact": correct[k], "total": n} for k, n in totals.items()
        },
        "misses": misses,
    }


def evaluate(args):
    all_cases = corpus()
    by_frame = defaultdict(list)
    for case in all_cases:
        by_frame[case["frame"]].append(case)
    frames = args.output / "frames"
    first = next(iter(by_frame))
    if args.cold_worker:
        start = perf_counter()
        session = open_session(args.engine, args.runtime)
        try:
            capture(session, frames / first, by_frame[first], args.engine)
            print(json.dumps((perf_counter() - start) * 1000))
        finally:
            session.close()
        return
    prepare(args.source, args.output)
    cold = []
    for _ in range(args.cold_runs):
        cmd = [
            sys.executable,
            "-m",
            "scripts.benchmark_auto_tune_ocr",
            "--cold-worker",
            "--engine",
            args.engine,
            "--output",
            str(args.output.resolve()),
            "--runtime",
            str(args.runtime.resolve()),
        ]
        cold.append(
            float(subprocess.check_output(cmd, cwd=ROOT, text=True, timeout=90))
        )
    session = open_session(args.engine, args.runtime)
    frame_ms, pass_ms, measured = [], [], []
    try:
        # Warm up every frame geometry once before timekeeping.
        for shot, cases in by_frame.items():
            capture(session, frames / shot, cases, args.engine)
        for _ in range(args.rounds):
            readings = {}
            t0 = perf_counter()
            for shot, cases in by_frame.items():
                start = perf_counter()
                readings.update(capture(session, frames / shot, cases, args.engine))
                frame_ms.append((perf_counter() - start) * 1000)
            pass_ms.append((perf_counter() - t0) * 1000)
            measured.append(readings)
    finally:
        session.close()
    result = {
        "engine": args.engine,
        "cold_first_card": summary(cold),
        "warm_frame_batch": summary(frame_ms),
        "warm_corpus_pass": summary(pass_ms),
        "score": score(all_cases, measured),
        "raw": measured,
        "elapsed_ms": {"cold": cold, "frame": frame_ms, "pass": pass_ms},
    }
    path = args.output / f"{args.engine}.json"
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {k: v for k, v in result.items() if k not in ("raw", "elapsed_ms")},
            ensure_ascii=True,
        )
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--engine", choices=("windows", "native", "native-lines"), required=True
    )
    parser.add_argument("--source", type=Path, default=RUN)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument(
        "--runtime",
        type=Path,
        default=os.environ.get("FH6_OCR_RUNTIME") or OUTPUT / "runtime",
    )
    parser.add_argument("--rounds", type=int, default=7)
    parser.add_argument("--cold-runs", type=int, default=7)
    parser.add_argument("--cold-worker", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if min(args.rounds, args.cold_runs) <= 0:
        parser.error("Measured run counts must be positive.")
    evaluate(args)


if __name__ == "__main__":
    main()
