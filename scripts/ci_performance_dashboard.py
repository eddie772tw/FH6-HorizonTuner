"""Aggregate structured CI build metrics into a GitHub job-summary dashboard."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path


def load_metrics(metrics_dir: Path) -> list[dict[str, object]]:
    if not metrics_dir.is_dir():
        return []
    metrics: list[dict[str, object]] = []
    for path in sorted(metrics_dir.rglob("*.json")):
        try:
            metrics.append(json.loads(path.read_text(encoding="utf-8")))
        except json.JSONDecodeError as error:
            raise ValueError(f"Invalid metrics JSON: {path}") from error
    return metrics


def markdown(metrics: list[dict[str, object]]) -> str:
    lines = [
        "# CI Performance Dashboard",
        "",
        "| Build | Outcome | Cache | Duration | Artifact | Size |",
        "| :--- | :---: | :---: | ---: | :--- | ---: |",
    ]
    if not metrics:
        lines.append("| No build metrics published | — | — | — | — | — |")
    for item in metrics:
        artifacts = item.get("artifacts", []) or [{"path": "—", "size_mib": None}]
        for artifact in artifacts:
            size = artifact.get("size_mib")
            size_text = (
                f"{size:.2f} MiB" if isinstance(size, (float, int)) else "missing"
            )
            outcome = "✅" if item.get("outcome") == "success" else "❌"
            lines.append(
                "| {label} | {outcome} | {cache} | {duration:.2f}s | `{path}` | {size} |".format(
                    label=item.get("label", "unknown"),
                    outcome=outcome,
                    cache=item.get("cache_status", "unknown"),
                    duration=float(item.get("duration_seconds", 0)),
                    path=artifact.get("path", "—"),
                    size=size_text,
                )
            )
    lines.extend(
        [
            "",
            "> Cache `hit` means an exact Rust cache-key match; `miss` is a cold or changed-key build.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--metrics-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    metrics = load_metrics(args.metrics_dir)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps({"schema_version": 1, "build_metrics": metrics}, indent=2) + "\n",
        encoding="utf-8",
    )

    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with Path(summary_path).open("a", encoding="utf-8") as summary:
            summary.write(markdown(metrics))
    else:
        print(markdown(metrics))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
