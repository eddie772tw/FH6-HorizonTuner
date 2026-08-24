"""Reject tracked paths that collide on case-insensitive file systems."""

from __future__ import annotations

import subprocess
import sys
from collections import defaultdict
from collections.abc import Iterable


def tracked_paths() -> list[str]:
    """Return repository paths from the Git index using Git's slash format."""
    result = subprocess.run(
        ["git", "ls-files", "-z"],
        check=True,
        capture_output=True,
    )
    return [path.decode("utf-8") for path in result.stdout.split(b"\0") if path]


def path_case_violations(paths: Iterable[str]) -> list[str]:
    """Return human-readable violations for a collection of Git paths."""
    violations: list[str] = []
    folded: defaultdict[str, list[str]] = defaultdict(list)

    for path in paths:
        folded[path.casefold()].append(path)
        components = path.split("/")
        if any(
            component.casefold() == ".jules" and component != ".jules"
            for component in components
        ):
            violations.append(
                f"non-canonical Jules path (use lowercase .jules): {path}"
            )

    for normalized, matches in sorted(folded.items()):
        if len(matches) > 1:
            violations.append(
                "case-insensitive path collision "
                f"({normalized}): {', '.join(sorted(matches))}"
            )

    return sorted(violations)


def main() -> int:
    violations = path_case_violations(tracked_paths())
    if violations:
        print("Tracked path case contract failed:", file=sys.stderr)
        for violation in violations:
            print(f"- {violation}", file=sys.stderr)
        return 1

    print("Tracked path case contract passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
