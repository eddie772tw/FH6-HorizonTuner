#!/usr/bin/env python3
"""Compare v1.6 release-tag Road algorithms with the current Rust library."""

import argparse
import hashlib
import json
import math
import os
import platform
import statistics
import subprocess
import sys
import tempfile
from pathlib import Path

TAG = "cd96d86f017fa43f4f3d429155a08aa77dc74bac"
ROOT = Path(__file__).resolve().parents[1]
WORKER = r"""
import json, os, sys, time
from road_analysis import summarize_road_observations
from road_matching import local_comparison
assert sys.version_info[:2] == (3, 13), "Use the repository Python 3.13 environment"
with open(os.environ["FH6_BENCH_FIXTURE"], encoding="utf-8") as f:
    points = json.load(f)
matching_points = points[:4000]
def measure(f):
    f()
    samples=[]
    for _ in range(int(os.environ["FH6_BENCH_SAMPLES"])):
        start=time.perf_counter(); f(); samples.append((time.perf_counter()-start)*1000)
    return samples
summary=None
summary_ms=measure(lambda: globals().__setitem__("summary", summarize_road_observations(points)))
matching=None
matching_ms=measure(lambda: globals().__setitem__("matching", local_comparison(matching_points, matching_points, True)))
with open(os.environ["FH6_BENCH_RESULT"], "w", encoding="utf-8") as f:
    json.dump({"version":"python-release-tag","python_version":sys.version,
               "summary":summary,"matching":matching,
               "summary_ms":summary_ms,"matching_ms":matching_ms}, f)
"""


def points(count):
    return [
        {
            "TimestampMS": i * 16,
            "time": i * 0.016,
            "IsRaceOn": 1,
            "LapNumber": 0,
            "CurrentLap": i * 0.016,
            "LastLap": 0,
            "SpeedMetersPerSecond": 30.0 + math.sin(i / 30.0),
            "PositionX": i * 0.5,
            "PositionY": 0.0,
            "PositionZ": 0.0,
            "CurrentEngineRpm": 4500.0,
            "PowerWatts": 180000.0,
            "TorqueNewtons": 400.0,
            "Gear": 3,
            "AccelInput": 220,
            "BrakeInput": 0,
            "SteerInput": 0,
            "TireTemp": [185.0 + math.sin(i / 30.0), 190.0, 175.0, 180.0],
            "NormalizedSuspensionTravel": [0.5, 0.6, 0.4, 0.5],
            "TireSlipRatio": [0.1, 0.2, 0.3, 0.4],
            "TireSlipAngle": [0.2, 0.3, 0.1, 0.2],
            "AccelerationX": math.sin(i / 30.0),
            "AccelerationY": 0.0,
            "AccelerationZ": 0.0,
        }
        for i in range(count)
    ]


def compare(a, b, path="$", diffs=None):
    diffs = [] if diffs is None else diffs
    if isinstance(a, (int, float)) and not isinstance(a, bool):
        if (
            isinstance(b, bool)
            or not isinstance(b, (int, float))
            or not math.isclose(a, b, rel_tol=1e-6, abs_tol=1e-6)
        ):
            diffs.append((path, a, b))
    elif a.__class__ is not b.__class__:
        diffs.append((path, a, b))
    elif isinstance(a, dict):
        if a.keys() != b.keys():
            diffs.append((path + ".keys", sorted(a), sorted(b)))
        for key in a.keys() & b.keys():
            compare(a[key], b[key], f"{path}.{key}", diffs)
    elif isinstance(a, list):
        if len(a) != len(b):
            diffs.append((path + ".length", len(a), len(b)))
        for i, (x, y) in enumerate(zip(a, b)):
            compare(x, y, f"{path}[{i}]", diffs)
    elif a != b:
        diffs.append((path, a, b))
    return diffs


def run(command, env):
    subprocess.run(command, env=env, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--rust-test-exe",
        required=True,
        type=Path,
        help="prebuilt release_comparison_probe test executable",
    )
    parser.add_argument(
        "--python",
        default=sys.executable,
        help="Python 3.13 interpreter selected by uv",
    )
    parser.add_argument(
        "--output",
        required=True,
        type=Path,
        help="persistent JSON file for raw samples, results, and differences",
    )
    args = parser.parse_args()
    samples = int(os.environ.get("FH6_BENCH_SAMPLES", "3"))
    if samples not in (1, 3):
        raise SystemExit("FH6_BENCH_SAMPLES must be 1 or 3")

    with tempfile.TemporaryDirectory(prefix="fh6-release-bench-") as td:
        tmp = Path(td)
        fixture = tmp / "points.json"
        fixture.write_text(
            json.dumps(points(10_000), separators=(",", ":")), encoding="utf-8"
        )
        fixture_sha = hashlib.sha256(fixture.read_bytes()).hexdigest()
        py_dir = tmp / "python"
        py_dir.mkdir()
        for name in ("road_analysis.py", "road_matching.py", "telemetry_contract.py"):
            source = subprocess.run(
                ["git", "-C", str(ROOT), "show", f"{TAG}:backend/{name}"],
                check=True,
                capture_output=True,
                text=True,
            ).stdout
            (py_dir / name).write_text(source, encoding="utf-8")
        worker = py_dir / "worker.py"
        worker.write_text(WORKER, encoding="utf-8")

        env = os.environ.copy()
        env.update(
            FH6_BENCH_FIXTURE=str(fixture),
            FH6_BENCH_SAMPLES=str(samples),
            PYTHONPATH=str(py_dir),
        )
        results = {"python": [], "rust": []}
        for round_index in range(7):
            order = ("python", "rust") if round_index % 2 == 0 else ("rust", "python")
            for side in order:
                result_path = tmp / f"{side}-{round_index}.json"
                env["FH6_BENCH_RESULT"] = str(result_path)
                if side == "python":
                    command = [
                        "uv",
                        "run",
                        "--no-project",
                        "--python",
                        args.python,
                        str(worker),
                    ]
                else:
                    command = [
                        str(args.rust_test_exe),
                        "--ignored",
                        "--exact",
                        "release_comparison_probe",
                        "--nocapture",
                    ]
                run(command, env)
                result = json.loads(result_path.read_text(encoding="utf-8"))
                result["round"] = round_index + 1
                results[side].append(result)

        diffs = []
        for side in ("python", "rust"):
            baseline = results[side][0]
            for result in results[side][1:]:
                for key in ("summary", "matching"):
                    compare(
                        baseline[key],
                        result[key],
                        f"{side}.{key}.round{result['round']}",
                        diffs,
                    )
        for key in ("summary", "matching"):
            compare(results["python"][0][key], results["rust"][0][key], key, diffs)
        rust_head = subprocess.run(
            ["git", "-C", str(ROOT), "rev-parse", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
        report = {
            "baseline_release_tag_source_sha": TAG,
            "rust_checkout_head_sha": rust_head,
            "rust_test_exe_sha256": hashlib.sha256(
                args.rust_test_exe.resolve().read_bytes()
            ).hexdigest(),
            "fixture_sha256": fixture_sha,
            "platform": platform.platform(),
            "python_version": results["python"][0]["python_version"],
            "fixture_points": 10_000,
            "matching_points": 4_000,
            "rounds": 7,
            "samples_per_function_per_round": samples,
            "numeric_tolerance": {"absolute": 1e-6, "relative": 1e-6},
            "results": results,
            "semantic_differences": diffs,
        }
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
        for side in ("python", "rust"):
            report_side = results[side]
            for operation in ("summary", "matching"):
                timings = [
                    ms for result in report_side for ms in result[operation + "_ms"]
                ]
                print(
                    f"{side} {operation}: median {statistics.median(timings):.3f} ms "
                    f"({len(timings)} samples)"
                )
        print(f"Saved raw results to {args.output}")
        if diffs:
            print(f"Semantic differences: {len(diffs)}; details saved in output JSON")
            for path, left, right in diffs[:50]:
                print(f"  {path}: release-tag={left!r}; Rust={right!r}")
            return 1
        print("Semantic outputs match (tolerance abs/rel 1e-6).")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
