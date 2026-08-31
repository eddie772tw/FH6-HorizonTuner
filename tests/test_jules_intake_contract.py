from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPT = (
    Path(__file__).parents[1]
    / ".agents"
    / "skills"
    / "jules_coding"
    / "scripts"
    / "validate_jules_intake.py"
)
SPEC = importlib.util.spec_from_file_location("validate_jules_intake", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def manual_prompt() -> str:
    return """FH6-JULES-INTENT v2
Source: manual
Task-Key: test/manual-contract
Goal: Validate the manual handoff contract.
In scope: frontend/src/utils
Out of scope: .jules
Baseline SHA: abc123
Owned files: frontend/src/utils/example.ts
Forbidden files: .jules/bolt.md
Acceptance tests: uv run pytest tests/test_jules_intake_contract.py
Expected branch/PR: codex/jules-contract
Risk and rollback: Revert the single documentation change.
"""


@pytest.mark.parametrize(
    ("persona", "canonical"),
    [
        ("Bolt", "bolt"),
        ("Palette", "palette"),
        ("pallete", "palette"),
        ("Narrator", "narrator"),
        ("Sentinel", "sentinel"),
    ],
)
def test_known_personas_are_scheduled_likely(persona: str, canonical: str) -> None:
    result = MODULE.classify_session(
        {
            "id": "sessions/123",
            "prompt": f"Persona: {persona}\nOptimize the repository.",
        },
        {
            "body": "PR created automatically by Jules for task https://jules.google.com/task/task-123"
        },
    )

    assert result["source"] == "scheduled_likely"
    assert result["confidence"] == "likely"
    assert result["persona"] == canonical
    assert result["task_id"] == "task-123"
    assert "prompt" not in result


def test_manual_marker_is_confirmed_without_echoing_prompt() -> None:
    result = MODULE.classify_session(
        {"id": "sessions/manual-1", "prompt": manual_prompt()}
    )

    assert result["source"] == "manual"
    assert result["confidence"] == "confirmed"
    assert MODULE.validate_manual_prompt(manual_prompt()) == []
    assert "Risk and rollback" not in json.dumps(result)


def test_manual_marker_and_persona_are_a_conflict() -> None:
    result = MODULE.classify_session(
        {
            "id": "sessions/conflict",
            "prompt": "Source: manual\nPersona: Bolt\nGoal: conflicting source",
        }
    )

    assert result["source"] == "unknown"
    assert result["stop_reason"] == "source_conflict"


def test_explicit_schedule_metadata_has_confirmed_confidence() -> None:
    result = MODULE.classify_session(
        {
            "id": "sessions/scheduled-1",
            "prompt": "Routine maintenance",
            "source": "scheduled_task",
        }
    )

    assert result["source"] == "scheduled_likely"
    assert result["confidence"] == "confirmed"
    assert result["persona"] is None


def test_manual_marker_and_schedule_metadata_are_a_conflict() -> None:
    result = MODULE.classify_session(
        {
            "id": "sessions/conflict-metadata",
            "prompt": manual_prompt(),
            "source": "scheduled_task",
        }
    )

    assert result["source"] == "unknown"
    assert result["stop_reason"] == "source_conflict"


def test_missing_source_is_unknown() -> None:
    result = MODULE.classify_session(
        {"id": "sessions/unknown", "prompt": "Implement a small fix."}
    )

    assert result["source"] == "unknown"
    assert result["confidence"] == "unknown"
    assert result["stop_reason"] == "unknown_provenance"


def test_manual_handoff_requires_all_fields() -> None:
    issues = MODULE.validate_manual_prompt(
        "FH6-JULES-INTENT v2\nSource: manual\nGoal: incomplete"
    )

    assert "missing_handoff_field:Baseline SHA" in issues
    assert "missing_handoff_field:Risk and rollback" in issues


@pytest.mark.parametrize(
    ("name", "candidate", "expected"),
    [
        (
            "pr253-pr258-pr262-custom-math",
            {
                "task_key": "perf custom math",
                "changed_paths": ["frontend/src/utils/customMathEngine.ts"],
            },
            "duplicate_task",
        ),
        (
            "pr255-pr260-advanced-hud",
            {
                "task_key": "perf/advanced-hud-dom-cache",
                "changed_paths": ["hud_overlay/advanced/index.html"],
            },
            "overlapping_scope",
        ),
        (
            "pr273-pr274-pr283-telemetry-math",
            {
                "task_key": "perf/telemetry-math",
                "changed_paths": [
                    "frontend/src/features/telemetry/telemetryDetailMath.ts"
                ],
            },
            "overlapping_scope",
        ),
    ],
)
def test_historical_overlaps_are_blocked(
    name: str, candidate: dict, expected: str
) -> None:
    active = [
        {
            "task_key": "perf/custom-math",
            "changed_paths": ["frontend/src/utils/customMathEngine.ts"],
        }
    ]
    if name == "pr255-pr260-advanced-hud":
        active = [
            {
                "task_key": "perf/old",
                "changed_paths": ["hud_overlay/advanced/index.html"],
            }
        ]
    if name == "pr273-pr274-pr283-telemetry-math":
        active = [
            {
                "task_key": "perf/old",
                "changed_paths": [
                    "frontend/src/features/telemetry/telemetryDetailMath.ts"
                ],
            }
        ]

    assert expected in MODULE.overlap_issues(candidate, active)


def test_case_collision_is_blocked() -> None:
    assert MODULE.path_issues([".Jules/palette.md", ".jules/palette.md"]) == [
        "case_collision",
        "unrequested_jules_log",
    ]


def test_unrequested_jules_log_is_blocked() -> None:
    assert MODULE.path_issues([".jules/bolt.md"], ["frontend/src"]) == [
        "unrequested_jules_log",
        "out_of_scope",
    ]
    assert MODULE.path_issues([".jules/bolt.md"], [".jules/bolt.md"]) == []


def test_adoption_gate_blocks_empty_not_solved_scope_and_stale_ci() -> None:
    result = MODULE.validate_adoption(
        {
            "source": "scheduled_likely",
            "changed_paths": ["frontend/src/features/telemetryDetailMath.ts"],
            "allowed_paths": ["frontend/src/utils"],
            "resolved": False,
            "tests": [{"command": "pytest", "status": "fail"}],
            "head_sha": "new",
            "ci_sha": "old",
        }
    )

    assert result["ok"] is False
    assert {"out_of_scope", "not_solved", "missing_test_evidence", "stale_ci"}.issubset(
        result["issues"]
    )


def test_empty_diff_is_blocked() -> None:
    result = MODULE.validate_adoption(
        {"source": "unknown", "changed_paths": [], "tests": []}
    )

    assert result["issues"] == ["empty_diff", "missing_test_evidence"]


def test_cli_emits_safe_classification(tmp_path: Path) -> None:
    fixture = tmp_path / "session.json"
    fixture.write_text(
        json.dumps(
            {
                "session": {"id": "sessions/cli-1", "prompt": "Bolt\nMaintenance"},
                "pr": {"task_id": "cli-task", "number": 283},
            }
        ),
        encoding="utf-8",
    )

    completed = subprocess.run(
        [sys.executable, str(SCRIPT), "--mode", "classify", "--input", str(fixture)],
        capture_output=True,
        text=True,
        check=True,
    )
    output = json.loads(completed.stdout)
    assert output["source"] == "scheduled_likely"
    assert "Maintenance" not in completed.stdout
