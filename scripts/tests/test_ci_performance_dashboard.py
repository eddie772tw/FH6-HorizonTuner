import importlib.util
import json
from pathlib import Path

SCRIPT_PATH = (
    Path(__file__).resolve().parents[2] / "scripts" / "ci_performance_dashboard.py"
)
SPEC = importlib.util.spec_from_file_location("ci_performance_dashboard", SCRIPT_PATH)
dashboard = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(dashboard)


def test_dashboard_renders_metrics_and_artifact_size(tmp_path):
    metrics_dir = tmp_path / "metrics"
    metrics_dir.mkdir()
    (metrics_dir / "tauri.json").write_text(
        json.dumps(
            {
                "label": "Tauri portable executable",
                "outcome": "success",
                "cache_status": "hit",
                "duration_seconds": 12.34,
                "artifacts": [{"path": "app.exe", "size_mib": 47.3}],
            }
        ),
        encoding="utf-8",
    )

    rendered = dashboard.markdown(dashboard.load_metrics(metrics_dir))

    assert "Tauri portable executable" in rendered
    assert "hit" in rendered
    assert "12.34s" in rendered
    assert "47.30 MiB" in rendered


def test_dashboard_renders_a_useful_empty_state(tmp_path):
    assert "No build metrics published" in dashboard.markdown(
        dashboard.load_metrics(tmp_path / "missing")
    )
