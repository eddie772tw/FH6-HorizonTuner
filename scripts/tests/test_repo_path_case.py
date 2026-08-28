from scripts.check_repo_path_case import path_case_violations


def test_rejects_noncanonical_jules_directory() -> None:
    violations = path_case_violations([".Jules/palette.md"])

    assert violations == [
        "non-canonical Jules path (use lowercase .jules): .Jules/palette.md"
    ]


def test_rejects_case_insensitive_duplicate_paths() -> None:
    violations = path_case_violations([".jules/palette.md", ".JULES/PALETTE.md"])

    assert any(
        "case-insensitive path collision" in violation for violation in violations
    )


def test_accepts_canonical_jules_paths() -> None:
    assert path_case_violations([".jules/README.md", ".jules/palette.md"]) == []
