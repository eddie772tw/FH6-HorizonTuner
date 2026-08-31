#!/usr/bin/env python3
"""Offline contract validator for manual and scheduled Jules output intake."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import PurePosixPath
from typing import Any

PERSONA_ALIASES = {
    "bolt": "bolt",
    "palette": "palette",
    "pallete": "palette",
    "narrator": "narrator",
    "sentinel": "sentinel",
}

PERSONA_LOGS = {
    "bolt": ".jules/bolt.md",
    "palette": ".jules/palette.md",
    "narrator": ".jules/narrator.md",
    "sentinel": ".jules/sentinel.md",
}

REQUIRED_HANDOFF_FIELDS = (
    "Goal",
    "In scope",
    "Out of scope",
    "Baseline SHA",
    "Owned files",
    "Forbidden files",
    "Acceptance tests",
    "Expected branch/PR",
    "Risk and rollback",
)

SOURCE_VALUES = {"manual", "scheduled_likely", "unknown"}


def _text(value: Any) -> str:
    return value if isinstance(value, str) else ""


def normalize_persona(value: str | None) -> str | None:
    """Normalize known persona names without exposing arbitrary prompt text."""
    normalized = re.sub(r"[^a-z]", "", (value or "").lower())
    return PERSONA_ALIASES.get(normalized)


def _detect_persona(prompt: str) -> tuple[str | None, str | None]:
    opening = prompt[:1000]
    for alias, canonical in PERSONA_ALIASES.items():
        escaped = re.escape(alias)
        patterns = (
            rf"(?im)^\s*(?:jules\s+)?{escaped}\b",
            rf"(?im)^\s*(?:persona|agent|role)\s*[:=-]\s*{escaped}\b",
        )
        if any(re.search(pattern, opening) for pattern in patterns):
            return canonical, alias
    return None, None


def _session_id(session: dict[str, Any]) -> str | None:
    for key in ("session_id", "id", "name"):
        value = _text(session.get(key))
        if value:
            return value.rsplit("/", 1)[-1]
    return None


def _task_id(session: dict[str, Any], pr: dict[str, Any]) -> str | None:
    for source in (session, pr):
        for key in ("task_id", "taskId", "jules_task_id"):
            value = _text(source.get(key))
            if value:
                return value
        body = _text(source.get("body"))
        match = re.search(r"jules\.google\.com/task/([A-Za-z0-9_-]+)", body)
        if match:
            return match.group(1)
    return None


def _pr_number(session: dict[str, Any], pr: dict[str, Any]) -> int | None:
    for source in (pr, session):
        value = source.get("pr_number", source.get("number"))
        if isinstance(value, int):
            return value
        if isinstance(value, str) and value.isdigit():
            return int(value)
        url = _text(source.get("url"))
        match = re.search(r"/pull/(\d+)(?:$|[?#])", url)
        if match:
            return int(match.group(1))
    return None


def _explicitly_scheduled(session: dict[str, Any], pr: dict[str, Any]) -> bool:
    for source in (session, pr):
        if source.get("scheduled") is True:
            return True
        if _text(source.get("source")).casefold() in {
            "scheduled",
            "scheduled_task",
        }:
            return True
    return False


def classify_session(
    session: dict[str, Any], pr: dict[str, Any] | None = None
) -> dict[str, Any]:
    """Classify a session without returning its prompt or other sensitive text."""
    pr = pr or {}
    prompt = _text(session.get("prompt"))
    manual_marker = bool(re.search(r"(?im)^\s*Source\s*:\s*manual\s*$", prompt))
    persona, matched_signature = _detect_persona(prompt)
    explicitly_scheduled = _explicitly_scheduled(session, pr)
    has_task_or_pr = bool(
        _task_id(session, pr) or _session_id(session) or _pr_number(session, pr)
    )

    if manual_marker and (persona or explicitly_scheduled):
        source, confidence, stop_reason = "unknown", "unknown", "source_conflict"
    elif manual_marker:
        source, confidence, stop_reason = "manual", "confirmed", None
    elif explicitly_scheduled:
        source, confidence, stop_reason = "scheduled_likely", "confirmed", None
    elif persona and has_task_or_pr:
        source, confidence, stop_reason = "scheduled_likely", "likely", None
    else:
        source, confidence, stop_reason = "unknown", "unknown", "unknown_provenance"

    result: dict[str, Any] = {
        "source": source,
        "confidence": confidence,
        "persona": persona,
        "session_id": _session_id(session),
        "task_id": _task_id(session, pr),
        "pr_number": _pr_number(session, pr),
        "matched_signature": matched_signature,
    }
    if stop_reason:
        result["stop_reason"] = stop_reason
    return result


def validate_manual_prompt(prompt: str) -> list[str]:
    """Return missing manual handoff requirements without echoing prompt content."""
    issues: list[str] = []
    if "FH6-JULES-INTENT v2" not in prompt:
        issues.append("missing_manual_marker")
    if not re.search(r"(?im)^\s*Source\s*:\s*manual\s*$", prompt):
        issues.append("missing_manual_source")
    for field in REQUIRED_HANDOFF_FIELDS:
        if not re.search(rf"(?im)^\s*{re.escape(field)}\s*:\s*\S+", prompt):
            issues.append(f"missing_handoff_field:{field}")
    return issues


def _normalize_path(path: str) -> str:
    return str(PurePosixPath(path.replace("\\", "/"))).lstrip("/").rstrip("/")


def path_issues(
    changed_paths: list[str], allowed_paths: list[str] | None = None
) -> list[str]:
    normalized = [_normalize_path(path) for path in changed_paths]
    folded: dict[str, set[str]] = {}
    for original, path in zip(changed_paths, normalized):
        folded.setdefault(path.casefold(), set()).add(path)
        if "\x00" in original:
            return ["invalid_path"]
    issues: list[str] = []
    if any(len(values) > 1 for values in folded.values()):
        issues.append("case_collision")
    allowed_jules_log = any(
        (
            _normalize_path(path).casefold() == ".jules"
            or _normalize_path(path).casefold().startswith(".jules/")
        )
        for path in (allowed_paths or [])
    )
    if (
        any(
            path.casefold() == ".jules" or path.casefold().startswith(".jules/")
            for path in normalized
        )
        and not allowed_jules_log
    ):
        issues.append("unrequested_jules_log")
    if allowed_paths is not None:
        scopes = [_normalize_path(path).casefold() for path in allowed_paths]
        for path in normalized:
            if not any(
                path.casefold() == scope or path.casefold().startswith(scope + "/")
                for scope in scopes
            ):
                issues.append("out_of_scope")
                break
    return issues


def _normalize_task_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-")


def overlap_issues(
    candidate: dict[str, Any], active_items: list[dict[str, Any]]
) -> list[str]:
    task_key = _normalize_task_key(_text(candidate.get("task_key")))
    candidate_paths = {
        _normalize_path(path).casefold() for path in candidate.get("changed_paths", [])
    }
    for active in active_items:
        active_key = _normalize_task_key(_text(active.get("task_key")))
        active_paths = {
            _normalize_path(path).casefold() for path in active.get("changed_paths", [])
        }
        if task_key and task_key == active_key:
            return ["duplicate_task"]
        if candidate_paths & active_paths:
            return ["overlapping_scope"]
    return []


def validate_adoption(payload: dict[str, Any]) -> dict[str, Any]:
    """Validate an observed PR/adoption record offline."""
    issues: list[str] = []
    changed_paths = payload.get("changed_paths", [])
    if not changed_paths:
        issues.append("empty_diff")
    if payload.get("resolved") is False or payload.get("not_solved") is True:
        issues.append("not_solved")
    issues.extend(path_issues(changed_paths, payload.get("allowed_paths")))
    issues.extend(overlap_issues(payload, payload.get("active_items", [])))

    tests = payload.get("tests", [])
    if not tests or any(
        not _text(test.get("command")) or _text(test.get("status")).lower() != "pass"
        for test in tests
    ):
        issues.append("missing_test_evidence")
    if (
        payload.get("head_sha")
        and payload.get("ci_sha")
        and payload["head_sha"] != payload["ci_sha"]
    ):
        issues.append("stale_ci")
    if payload.get("source") not in SOURCE_VALUES:
        issues.append("unknown_provenance")

    unique_issues = list(dict.fromkeys(issues))
    return {"ok": not unique_issues, "issues": unique_issues}


def _load_json(path: str) -> dict[str, Any]:
    with open(path, encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError("input JSON must be an object")
    return value


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input",
        required=True,
        help="JSON fixture containing session, PR, or adoption data",
    )
    parser.add_argument(
        "--mode", choices=("classify", "handoff", "adoption"), default="classify"
    )
    args = parser.parse_args(argv)
    payload = _load_json(args.input)
    if args.mode == "classify":
        result = classify_session(
            payload.get("session", payload), payload.get("pr", {})
        )
    elif args.mode == "handoff":
        issues = validate_manual_prompt(_text(payload.get("prompt")))
        result = {"ok": not issues, "issues": issues}
    else:
        result = validate_adoption(payload)
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0 if result.get("ok", True) else 1


if __name__ == "__main__":
    sys.exit(main())
