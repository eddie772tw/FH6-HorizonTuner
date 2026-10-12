"""Behavioral coverage gates; fixture rows are not real repository extraction."""

import json
import subprocess
import zipfile
from pathlib import Path

import pytest

from scripts.codeql_source_coverage import compare, inventory, main, sha256


def git(repo, *args):
    return subprocess.run(
        ["git", *args], cwd=repo, check=True, capture_output=True, text=True
    ).stdout.strip()


@pytest.fixture
def repo(tmp_path):
    git(tmp_path, "init")
    git(tmp_path, "config", "user.name", "Coverage test")
    git(tmp_path, "config", "user.email", "test@example.invalid")
    files = {
        "companion/app/src/main/kotlin/App.kt": "class App\n",
        "companion/theme/src/main/kotlin/Theme.kt": "class Theme\n",
        "companion/protocol-core/src/main/kotlin/Protocol.kt": "class Protocol\n",
        "companion/theme/src/test/kotlin/ThemeTest.kt": "class ThemeTest\n",
        "companion/build.gradle.kts": "plugins {}\n",
        "companion/scripts/VerifyFontApk.java": "class VerifyFontApk {}\n",
        "companion/scripts/MakeMissingFontFixture.java": "class MakeMissingFontFixture {}\n",
    }
    for name, content in files.items():
        path = tmp_path / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
    git(tmp_path, "add", ".")
    git(tmp_path, "commit", "-m", "Test source inventory")
    return tmp_path


def evidence(repo, tmp_path):
    expected = inventory(repo, "HEAD")
    root = "/home/runner/work/Horizon/Horizon"
    archive = tmp_path / "src.zip"
    rows = []
    with zipfile.ZipFile(archive, "w") as source_zip:
        for item in expected["sources"]:
            path = item["path"]
            source_zip.writestr(
                f"{root}/{path}".lstrip("/"), (repo / path).read_bytes()
            )
            if item["category"] != "kotlin_build_script":
                java = item["category"] == "java"
                rows.append(
                    {
                        "language": "java" if java else "kotlin",
                        "path": f"{root}/{path}",
                        "status": "compilation_unit" if java else "successful",
                    }
                )
    return expected, rows, root, archive


def test_inventory_uses_commit_bytes_and_excludes_untracked(repo):
    baseline = inventory(repo, "HEAD")
    (repo / "companion/app/src/main/kotlin/App.kt").write_text("changed\n")
    (repo / "Untracked.kt").write_text("class Untracked\n")
    assert inventory(repo, "HEAD") == baseline
    assert baseline["status"] == "NOT_RUN"
    assert baseline["counts"] == {
        "java": 2,
        "kotlin_build_script": 1,
        "kotlin_production_app": 1,
        "kotlin_production_theme": 1,
        "kotlin_production_protocol-core": 1,
        "kotlin_test": 1,
    }
    assert baseline["sources"][0]["sha256"] == sha256(b"class App\n")


def test_complete_extraction_requires_java_and_tests_but_not_gradle(repo, tmp_path):
    args = evidence(repo, tmp_path)
    report = compare(*args)
    assert report["status"] == "PASS_SOURCE_COVERAGE"
    gradle = next(
        s for s in report["sources"] if s["category"] == "kotlin_build_script"
    )
    assert not gradle["required"] and not gradle["processed"]


@pytest.mark.parametrize("category", ["java", "kotlin_test", "kotlin_production_app"])
def test_missing_required_file_fails(repo, tmp_path, category):
    expected, rows, root, archive = evidence(repo, tmp_path)
    missing = next(s["path"] for s in expected["sources"] if s["category"] == category)
    rows = [row for row in rows if row["path"] != f"{root}/{missing}"]
    report = compare(expected, rows, root, archive)
    assert report["failures"] == [missing]
    assert report["status"] == "FAIL_SOURCE_COVERAGE"


def test_archive_presence_alone_is_not_extraction(repo, tmp_path):
    expected, _, root, archive = evidence(repo, tmp_path)
    report = compare(expected, [], root, archive)
    assert len(report["failures"]) == 6


def test_empty_inventory_cannot_pass(repo, tmp_path):
    expected, rows, root, archive = evidence(repo, tmp_path)
    expected["sources"] = []
    with pytest.raises(ValueError, match="no required"):
        compare(expected, rows, root, archive)


def test_duplicate_compilations_deduplicate_but_errors_still_fail(repo, tmp_path):
    expected, rows, root, archive = evidence(repo, tmp_path)
    kotlin = next(row for row in rows if row["language"] == "kotlin")
    assert compare(expected, rows + [kotlin], root, archive)["failures"] == []
    report = compare(
        expected, rows + [{**kotlin, "status": "recoverable_errors"}], root, archive
    )
    assert len(report["failures"]) == 1


def test_wrong_root_does_not_match_same_basename(repo, tmp_path):
    expected, rows, root, archive = evidence(repo, tmp_path)
    rows = [{**row, "path": row["path"].replace(root, root + "-other")} for row in rows]
    report = compare(expected, rows, root, archive)
    assert len(report["failures"]) == 6
    assert len(report["outside_source_root"]) == 6


def test_stale_source_archive_fails(repo, tmp_path):
    expected, rows, root, archive = evidence(repo, tmp_path)
    stale = tmp_path / "stale.zip"
    with (
        zipfile.ZipFile(archive) as original,
        zipfile.ZipFile(stale, "w") as destination,
    ):
        for name in original.namelist():
            destination.writestr(
                name, b"stale" if name.endswith("/App.kt") else original.read(name)
            )
    report = compare(expected, rows, root, stale)
    assert len(report["failures"]) == 1


@pytest.mark.parametrize("path", ["relative/App.kt", "/root/../App.kt"])
def test_ambiguous_paths_rejected(repo, tmp_path, path):
    expected, rows, root, archive = evidence(repo, tmp_path)
    rows[0]["path"] = path
    with pytest.raises(ValueError):
        compare(expected, rows, root, archive)


def test_missing_source_archive_entry_rejected(repo, tmp_path):
    expected, rows, root, _ = evidence(repo, tmp_path)
    empty = tmp_path / "empty.zip"
    with zipfile.ZipFile(empty, "w"):
        pass
    with pytest.raises(ValueError, match="Missing or duplicate"):
        compare(expected, rows, root, empty)


def test_generated_sources_are_reported_without_becoming_expected(repo, tmp_path):
    expected, rows, root, archive = evidence(repo, tmp_path)
    rows.append(
        {
            "language": "kotlin",
            "path": f"{root}/build/Generated.kt",
            "status": "successful",
        }
    )
    report = compare(expected, rows, root, archive)
    assert report["untracked_or_generated"] == ["build/Generated.kt"]
    assert report["failures"] == []


def test_cli_inventory_and_invalid_database_fail_closed(repo, tmp_path, monkeypatch):
    output = tmp_path / "inventory.json"
    assert main(["inventory", "--repo", str(repo), "--output", str(output)]) == 0
    assert json.loads(output.read_text())["status"] == "NOT_RUN"
    monkeypatch.setattr(
        "scripts.codeql_source_coverage.run",
        lambda *a, **kw: (_ for _ in ()).throw(OSError("invalid database")),
    )
    assert (
        main(
            [
                "verify",
                "--database",
                str(tmp_path / "missing"),
                "--output",
                str(tmp_path / "proof"),
            ]
        )
        == 2
    )


@pytest.mark.parametrize("fail_query", [False, True])
def test_verify_cli_runs_query_and_retains_status(
    repo, tmp_path, monkeypatch, fail_query
):
    expected, rows, root, archive = evidence(repo, tmp_path)
    from scripts import codeql_source_coverage as tool

    actual_run = tool.run
    commands = []

    def command_runner(command, cwd=None):
        if command[0] != "test-codeql":
            return actual_run(command, cwd)
        commands.append(command)
        if command[1:3] == ["resolve", "database"]:
            return json.dumps(
                {
                    "languages": ["java"],
                    "sourceLocationPrefix": root,
                    "sourceArchiveZip": str(archive),
                }
            ).encode()
        if command[1] == "version":
            return b"Fixture CLI version\n"
        if command[1:3] == ["query", "run"]:
            if fail_query:
                raise subprocess.CalledProcessError(2, command)
            return b""
        if command[1:3] == ["bqrs", "decode"]:
            return (
                "language,path,status\n"
                + "\n".join(
                    f"{row['language']},{row['path']},{row['status']}" for row in rows
                )
            ).encode()
        raise AssertionError(f"Unexpected command: {command}")

    monkeypatch.setattr(tool, "run", command_runner)
    output = tmp_path / "proof"
    exit_code = main(
        [
            "verify",
            "--repo",
            str(repo),
            "--database",
            str(tmp_path / "database"),
            "--codeql",
            "test-codeql",
            "--common-caches",
            str(tmp_path / "cache"),
            "--output",
            str(output),
        ]
    )
    assert exit_code == (2 if fail_query else 0)
    assert any(c[1:3] == ["query", "run"] for c in commands)
    assert all(c[-1].startswith("--common-caches=") for c in commands)
    report = json.loads((output / "coverage.json").read_text())
    assert report["status"] == ("NOT_RUN" if fail_query else "PASS_SOURCE_COVERAGE")
    if not fail_query:
        assert report["revision"] == expected["revision"]
    preserved = (output / "coverage.json").read_bytes()
    assert (
        main(
            [
                "verify",
                "--repo",
                str(repo),
                "--database",
                "unused",
                "--output",
                str(output),
            ]
        )
        == 2
    )
    assert (output / "coverage.json").read_bytes() == preserved
