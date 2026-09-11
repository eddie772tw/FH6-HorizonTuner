#!/usr/bin/env python3
"""Standalone E2E Test Suite Runner for FH6-HorizonTuner.

Usage:
  python tests/e2e/e2e_runner.py [--tier 1|2|3|4] [--all] [--json]
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

TIER_FILES = {
    1: "tests/e2e/test_tier1_features.py",
    2: "tests/e2e/test_tier2_boundaries.py",
    3: "tests/e2e/test_tier3_combinations.py",
    4: "tests/e2e/test_tier4_scenarios.py",
}


def run_tier(tier_num: int) -> dict:
    test_file = TIER_FILES[tier_num]
    start_time = time.time()
    cmd = [sys.executable, "-m", "pytest", test_file, "-q"]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    duration = time.time() - start_time

    passed = proc.returncode == 0
    # Parse short summary if available
    output = proc.stdout + proc.stderr
    return {
        "tier": tier_num,
        "file": test_file,
        "passed": passed,
        "exit_code": proc.returncode,
        "duration_seconds": round(duration, 2),
        "output_summary": output.strip().split("\n")[-1] if output else "",
    }


def main():
    parser = argparse.ArgumentParser(
        description="FH6-HorizonTuner E2E Test Suite Runner"
    )
    parser.add_argument(
        "--tier", type=int, choices=[1, 2, 3, 4], help="Run a specific tier (1-4)"
    )
    parser.add_argument(
        "--all", action="store_true", default=True, help="Run all tiers (default)"
    )
    parser.add_argument(
        "--json", action="store_true", help="Output summary in JSON format"
    )

    args = parser.parse_args()

    selected_tiers = [args.tier] if args.tier else [1, 2, 3, 4]
    results = []
    overall_success = True

    for t in selected_tiers:
        res = run_tier(t)
        results.append(res)
        if not res["passed"]:
            overall_success = False

    if args.json:
        print(json.dumps({"success": overall_success, "tiers": results}, indent=2))
    else:
        print("=" * 70)
        print("FH6-HorizonTuner E2E Test Suite Summary")
        print("=" * 70)
        for r in results:
            status = "PASSED" if r["passed"] else "FAILED"
            print(
                f"Tier {r['tier']} ({r['file']}): {status} in {r['duration_seconds']}s"
            )
            if r["output_summary"]:
                print(f"  Result: {r['output_summary']}")
        print("-" * 70)
        print(
            f"Overall Status: {'ALL PASSED' if overall_success else 'FAILURES DETECTED'}"
        )
        print("=" * 70)

    sys.exit(0 if overall_success else 1)


if __name__ == "__main__":
    main()
