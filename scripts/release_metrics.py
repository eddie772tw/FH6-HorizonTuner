"""Run a release-build command and publish reproducible timing and size metrics."""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from pathlib import Path


def mib(path: Path) -> float:
    return path.stat().st_size / (1024 * 1024)


def append_summary(label: str, elapsed: float, artifacts: list[Path]) -> None:
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if not summary_path:
        return

    lines = [
        "## Release build metrics",
        "",
        "| Step | Duration | Artifact | Size |",
        "| :--- | ---: | :--- | ---: |",
    ]
    if artifacts:
        for artifact in artifacts:
            size = f"{mib(artifact):.2f} MiB" if artifact.is_file() else "missing"
            lines.append(f"| {label} | {elapsed:.2f}s | `{artifact}` | {size} |")
    else:
        lines.append(f"| {label} | {elapsed:.2f}s | — | — |")
    lines.append("")
    with Path(summary_path).open("a", encoding="utf-8") as summary:
        summary.write("\n".join(lines))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--label", required=True)
    parser.add_argument("--artifact", action="append", default=[], type=Path)
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()

    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    if not command:
        parser.error("a command must follow --")

    started = time.perf_counter()
    result = subprocess.run(command, check=False)
    elapsed = time.perf_counter() - started
    append_summary(args.label, elapsed, args.artifact)
    print(f"[release-metrics] {args.label}: {elapsed:.2f}s (exit {result.returncode})")
    for artifact in args.artifact:
        status = f"{mib(artifact):.2f} MiB" if artifact.is_file() else "missing"
        print(f"[release-metrics] {artifact}: {status}")
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
