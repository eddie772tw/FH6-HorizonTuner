import json
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CAPABILITY = (
    REPOSITORY_ROOT / "frontend" / "src-tauri" / "capabilities" / "default.json"
)


def test_default_capability_does_not_reference_removed_opener_plugin():
    capability = json.loads(DEFAULT_CAPABILITY.read_text(encoding="utf-8"))

    assert "opener:default" not in capability["permissions"]
