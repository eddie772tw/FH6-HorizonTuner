import importlib.util
import json
from pathlib import Path

SCRIPT_PATH = Path(__file__).resolve().parent.parent / "scripts" / "release_metrics.py"
SPEC = importlib.util.spec_from_file_location("release_metrics", SCRIPT_PATH)
release_metrics = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(release_metrics)


def test_write_metrics_creates_machine_readable_json(tmp_path):
    target = tmp_path / "metrics" / "build.json"
    metrics = {"schema_version": 1, "outcome": "success", "duration_seconds": 1.25}

    release_metrics.write_metrics(target, metrics)

    assert json.loads(target.read_text(encoding="utf-8")) == metrics


def test_artifact_metrics_reports_missing_and_existing_files(tmp_path):
    existing = tmp_path / "artifact.bin"
    existing.write_bytes(b"metrics")

    metrics = release_metrics.artifact_metrics([existing, tmp_path / "missing.bin"])

    assert metrics[0]["exists"] is True
    assert metrics[0]["size_mib"] is not None
    assert metrics[1] == {
        "path": str(tmp_path / "missing.bin"),
        "exists": False,
        "size_mib": None,
    }
