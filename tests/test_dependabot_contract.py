"""Contract tests for .github/dependabot.yml configuration."""

import re
from pathlib import Path


def _parse_yaml_basic(content: str) -> dict:
    """Basic YAML parser for dependabot.yml structure without external dependencies."""
    try:
        import yaml  # noqa: F401

        return yaml.safe_load(content)
    except ImportError:
        pass

    # Fallback light parser for verification
    parsed = {"version": None, "updates": []}
    current_entry = None
    current_section = None

    for line in content.splitlines():
        clean = line.strip()
        if not clean or clean.startswith("#"):
            continue

        if clean.startswith("version:"):
            parsed["version"] = int(clean.split(":", 1)[1].strip())
        elif clean == "updates:":
            current_section = "updates"
        elif current_section == "updates" and clean.startswith("- package-ecosystem:"):
            eco = clean.split(":", 1)[1].strip().strip('"').strip("'")
            current_entry = {"package-ecosystem": eco, "groups": {}, "labels": []}
            parsed["updates"].append(current_entry)
        elif current_entry:
            if clean.startswith("directory:"):
                current_entry["directory"] = (
                    clean.split(":", 1)[1].strip().strip('"').strip("'")
                )
            elif clean.startswith("target-branch:"):
                current_entry["target-branch"] = (
                    clean.split(":", 1)[1].strip().strip('"').strip("'")
                )
            elif clean.startswith("open-pull-requests-limit:"):
                current_entry["open-pull-requests-limit"] = int(
                    clean.split(":", 1)[1].strip()
                )
            elif clean.startswith("interval:"):
                current_entry["interval"] = (
                    clean.split(":", 1)[1].strip().strip('"').strip("'")
                )
            elif clean.startswith("- ") and not clean.startswith(
                "- package-ecosystem:"
            ):
                item = clean.lstrip("- ").strip().strip('"').strip("'")
                if "labels" in current_entry:
                    current_entry["labels"].append(item)

    return parsed


def test_dependabot_config_file_exists():
    """Verify that .github/dependabot.yml exists and is not empty."""
    root_dir = Path(__file__).resolve().parent.parent
    dependabot_file = root_dir / ".github" / "dependabot.yml"

    assert dependabot_file.exists(), ".github/dependabot.yml file must exist"
    content = dependabot_file.read_text(encoding="utf-8")
    assert len(content.strip()) > 0, ".github/dependabot.yml cannot be empty"


def test_dependabot_contract_and_ecosystems():
    """Verify that dependabot.yml covers all required ecosystems and file locations."""
    root_dir = Path(__file__).resolve().parent.parent
    dependabot_file = root_dir / ".github" / "dependabot.yml"
    content = dependabot_file.read_text(encoding="utf-8")

    # Verify version 2
    assert re.search(r"^version:\s*2\b", content, re.MULTILINE), (
        "Dependabot configuration must specify version: 2"
    )

    # Required ecosystems
    required_ecosystems = {
        "github-actions": {"directory": "/", "expected_file": ".github/workflows"},
        "pip": {"directory": "/", "expected_file": "requirements.txt"},
        "npm": {"directory": "/frontend", "expected_file": "frontend/package.json"},
        "cargo": {
            "directory": "/frontend/src-tauri",
            "expected_file": "frontend/src-tauri/Cargo.toml",
        },
    }

    for ecosystem, details in required_ecosystems.items():
        assert (
            f'package-ecosystem: "{ecosystem}"' in content
            or f"package-ecosystem: '{ecosystem}'" in content
            or f"package-ecosystem: {ecosystem}" in content
        ), f"Missing package-ecosystem: {ecosystem}"
        assert (
            f'directory: "{details["directory"]}"' in content
            or f"directory: '{details['directory']}'" in content
            or f"directory: {details['directory']}" in content
        ), f"Ecosystem {ecosystem} must specify directory {details['directory']}"

        expected_path = root_dir / details["expected_file"]
        assert expected_path.exists(), (
            f"Target manifest/workflow {expected_path} referenced by {ecosystem} must exist"
        )


def test_dependabot_groups_and_schedule():
    """Verify schedule, target-branch, and grouped updates configuration."""
    root_dir = Path(__file__).resolve().parent.parent
    dependabot_file = root_dir / ".github" / "dependabot.yml"
    content = dependabot_file.read_text(encoding="utf-8")

    # Verify schedule interval weekly
    assert (
        'interval: "weekly"' in content
        or "interval: 'weekly'" in content
        or "interval: weekly" in content
    )

    # Verify target branch main
    assert (
        'target-branch: "main"' in content
        or "target-branch: 'main'" in content
        or "target-branch: main" in content
    )

    # Verify group patterns
    assert "groups:" in content
    assert "github-actions:" in content
    assert "python-dependencies:" in content
    assert "frontend-dependencies:" in content
    assert "rust-dependencies:" in content
