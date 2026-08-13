"""Run a release-build command and publish reproducible timing and size metrics."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import UTC, datetime
from pathlib import Path


def mib(path: Path) -> float:
    return path.stat().st_size / (1024 * 1024)


def artifact_metrics(artifacts: list[Path]) -> list[dict[str, object]]:
    return [
        {
            "path": str(artifact),
            "exists": artifact.is_file(),
            "size_mib": round(mib(artifact), 2) if artifact.is_file() else None,
        }
        for artifact in artifacts
    ]


def append_summary(
    label: str, elapsed: float, artifacts: list[dict[str, object]], exit_code: int
) -> None:
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if not summary_path:
        return

    lines = [
        "## Release build metrics",
        "",
        "| Step | Duration | Artifact | Size |",
        "| :--- | ---: | :--- | ---: |",
    ]
    outcome = "✅ success" if exit_code == 0 else f"❌ failed ({exit_code})"
    if artifacts:
        for artifact in artifacts:
            size = (
                f"{artifact['size_mib']:.2f} MiB"
                if artifact["size_mib"] is not None
                else "missing"
            )
            lines.append(
                f"| {label} ({outcome}) | {elapsed:.2f}s | `{artifact['path']}` | {size} |"
            )
    else:
        lines.append(f"| {label} | {elapsed:.2f}s | — | — |")
    lines.append("")
    with Path(summary_path).open("a", encoding="utf-8") as summary:
        summary.write("\n".join(lines))


def write_metrics(path: Path, metrics: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(metrics, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--label", required=True)
    parser.add_argument("--artifact", action="append", default=[], type=Path)
    parser.add_argument(
        "--metrics-file",
        type=Path,
        help="Write a structured JSON record for cross-job CI reporting.",
    )
    parser.add_argument(
        "--cache-status",
        default="unknown",
        choices=("hit", "miss", "unknown"),
        help="Cache state observed by the surrounding workflow.",
    )
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()

    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    if not command:
        parser.error("a command must follow --")

    started = time.perf_counter()
    result = subprocess.run(command, check=False)
    elapsed = time.perf_counter() - started
    artifacts = artifact_metrics(args.artifact)
    metrics = {
        "schema_version": 1,
        "label": args.label,
        "duration_seconds": round(elapsed, 2),
        "exit_code": result.returncode,
        "outcome": "success" if result.returncode == 0 else "failure",
        "cache_status": args.cache_status,
        "timestamp_utc": datetime.now(UTC).isoformat(),
        "artifacts": artifacts,
    }
    append_summary(args.label, elapsed, artifacts, result.returncode)
    if args.metrics_file:
        write_metrics(args.metrics_file, metrics)
    print(f"[release-metrics] {args.label}: {elapsed:.2f}s (exit {result.returncode})")
    for artifact in artifacts:
        status = (
            f"{artifact['size_mib']:.2f} MiB"
            if artifact["size_mib"] is not None
            else "missing"
        )
        print(f"[release-metrics] {artifact['path']}: {status}")
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
