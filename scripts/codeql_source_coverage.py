"""Inventory committed sources and compare them with actual CodeQL extraction.

Inventory never reports extraction coverage. Verify runs the QL query itself and
compares source-archive bytes with the requested Git revision, without uploading.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import subprocess
import sys
import zipfile
from collections import Counter
from pathlib import Path, PurePosixPath

QUERY = (
    Path(__file__).resolve().parents[1]
    / "docs/codeql/kotlin-coverage/queries/ExtractedSources.ql"
)


def run(command: list[str], cwd: Path | None = None) -> bytes:
    return subprocess.run(command, cwd=cwd, check=True, stdout=subprocess.PIPE).stdout


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def classify(path: str) -> str:
    parts = PurePosixPath(path).parts
    if path.endswith(".kts"):
        return "kotlin_build_script"
    if path.endswith(".java"):
        return "java"
    if "src" in parts and any(
        p in {"test", "androidTest", "testFixtures"} for p in parts
    ):
        return "kotlin_test"
    if len(parts) > 3 and parts[0] == "companion" and parts[2:4] == ("src", "main"):
        return f"kotlin_production_{parts[1]}"
    return "kotlin_other"


def inventory(repo: Path, ref: str) -> dict:
    revision = (
        run(["git", "rev-parse", "--verify", f"{ref}^{{commit}}"], repo)
        .decode()
        .strip()
    )
    entries = run(["git", "ls-tree", "-rz", "--full-tree", revision], repo)
    sources = []
    for entry in entries.split(b"\0"):
        if not entry:
            continue
        metadata, raw_path = entry.split(b"\t", 1)
        mode, kind, blob = metadata.decode().split()
        path = raw_path.decode("utf-8")
        if not path.endswith((".kt", ".kts", ".java")):
            continue
        if kind != "blob" or mode not in {"100644", "100755"}:
            raise ValueError(f"Source must be a regular tracked file: {path}")
        sources.append(
            {
                "path": path,
                "category": classify(path),
                "git_blob": blob,
                "sha256": sha256(run(["git", "cat-file", "blob", blob], repo)),
            }
        )
    return {
        "schema_version": 1,
        "status": "NOT_RUN",
        "evidence_kind": "tracked_source_inventory",
        "revision": revision,
        "tree": run(["git", "rev-parse", f"{revision}^{{tree}}"], repo)
        .decode()
        .strip(),
        "counts": dict(sorted(Counter(s["category"] for s in sources).items())),
        "sources": sources,
    }


def relative_source(path: str, source_root: str) -> str | None:
    """Use the database's original absolute prefix, never a basename/suffix match."""
    absolute = PurePosixPath(path)
    root = PurePosixPath(source_root)
    if not absolute.is_absolute() or not root.is_absolute():
        raise ValueError(
            "Database source paths and source root must be absolute POSIX paths"
        )
    if ".." in absolute.parts or ".." in root.parts:
        raise ValueError("Database source paths must not contain parent traversal")
    try:
        return str(absolute.relative_to(root))
    except ValueError:
        return None


def compare(expected: dict, rows: list[dict], source_root: str, archive: Path) -> dict:
    if not any(s["category"] != "kotlin_build_script" for s in expected["sources"]):
        raise ValueError("Inventory has no required Java/Kotlin sources")
    observed: dict[str, set[tuple[str, str]]] = {}
    outside = []
    for row in rows:
        if set(row) != {"language", "path", "status"} or row["language"] not in {
            "java",
            "kotlin",
        }:
            raise ValueError("Unexpected extraction query row")
        path = relative_source(row["path"], source_root)
        if path is None:
            outside.append(row)
        else:
            observed.setdefault(path, set()).add((row["language"], row["status"]))

    sources = []
    with zipfile.ZipFile(archive) as source_zip:
        names = source_zip.namelist()
        for item in expected["sources"]:
            path = item["path"]
            states = observed.get(path, set())
            language = "java" if item["category"] == "java" else "kotlin"
            success = "compilation_unit" if language == "java" else "successful"
            processed = (language, success) in states
            errors = bool(states - {(language, success)})
            archived_hash = None
            if states:
                # CodeQL src.zip uses the original absolute path without leading '/'.
                name = str(PurePosixPath(source_root) / path).lstrip("/")
                if names.count(name) != 1:
                    raise ValueError(
                        f"Missing or duplicate database source archive entry: {name}"
                    )
                archived_hash = sha256(source_zip.read(name))
            required = item["category"] != "kotlin_build_script"
            sources.append(
                {
                    **item,
                    "required": required,
                    "processed": processed,
                    "extraction_errors": errors,
                    "extraction_states": sorted([list(state) for state in states]),
                    "archive_sha256": archived_hash,
                    "source_matches_revision": archived_hash == item["sha256"],
                }
            )
    failures = [
        s["path"]
        for s in sources
        if s["required"]
        and (
            not s["processed"]
            or s["extraction_errors"]
            or not s["source_matches_revision"]
        )
    ]
    return {
        "schema_version": 1,
        "evidence_kind": "database_extraction_comparison",
        "status": "FAIL_SOURCE_COVERAGE" if failures else "PASS_SOURCE_COVERAGE",
        "revision": expected["revision"],
        "tree": expected["tree"],
        "counts": expected["counts"],
        "failures": failures,
        "sources": sources,
        "untracked_or_generated": sorted(set(observed) - {s["path"] for s in sources}),
        "outside_source_root": outside,
        "limitations": [
            "Source presence and matching bytes do not establish dependency semantics or upload success.",
            "Java CompilationUnit proves source representation; Kotlin requires successful per-file Compilation extraction.",
            "Gradle .kts are inventoried separately and are not required production/test coverage.",
        ],
    }


def verify(args: argparse.Namespace, expected: dict) -> dict:
    database = args.database.resolve()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    commands = []

    def codeql(*arguments: str) -> bytes:
        command = [args.codeql, *arguments]
        if args.common_caches:
            command.append(f"--common-caches={args.common_caches}")
        commands.append(command)
        (output / "commands.json").write_text(json.dumps(commands, indent=2) + "\n")
        return run(command)

    metadata_bytes = codeql("resolve", "database", str(database), "--format=json")
    (output / "database.json").write_bytes(metadata_bytes)
    metadata = json.loads(metadata_bytes)
    if metadata["languages"] != ["java"]:
        raise ValueError(
            "Expected a Java/Kotlin database, not another language database"
        )
    root = metadata["sourceLocationPrefix"]
    (output / "codeql-version.txt").write_bytes(codeql("version"))
    (output / "inventory.json").write_text(json.dumps(expected, indent=2) + "\n")
    bqrs = output / "extracted.bqrs"
    arguments = [
        "query",
        "run",
        str(QUERY),
        f"--database={database}",
        f"--output={bqrs}",
    ]
    if args.search_path:
        arguments.append(f"--additional-packs={args.search_path}")
    codeql(*arguments)
    csv_bytes = codeql("bqrs", "decode", str(bqrs), "--format=csv")
    (output / "extracted.csv").write_bytes(csv_bytes)
    reader = csv.DictReader(io.StringIO(csv_bytes.decode("utf-8")))
    if reader.fieldnames != ["language", "path", "status"]:
        raise ValueError("Unexpected extraction query columns")
    rows = list(reader)
    archive = Path(metadata["sourceArchiveZip"])
    result = compare(expected, rows, root, archive)
    result["database"] = str(database)
    result["database_source_root"] = root
    with archive.open("rb") as source_archive:
        result["archive_sha256"] = hashlib.file_digest(
            source_archive, "sha256"
        ).hexdigest()
    result["query_sha256"] = sha256(QUERY.read_bytes())
    result["extracted_csv_sha256"] = sha256(csv_bytes)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["inventory", "verify"])
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--ref", default="HEAD")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--database", type=Path)
    parser.add_argument("--codeql", default="codeql")
    parser.add_argument(
        "--common-caches", type=Path, help="Writable CodeQL cache directory"
    )
    parser.add_argument(
        "--search-path", help="Additional local QL packs, for offline verification"
    )
    args = parser.parse_args(argv)
    output_existed = args.output.exists()
    if args.mode == "verify" and args.database is None:
        parser.error(
            "verify requires --database (a finalized extracted Java/Kotlin database)"
        )
    try:
        expected = inventory(args.repo.resolve(), args.ref)
        if args.mode == "inventory":
            args.output.write_text(
                json.dumps(expected, indent=2) + "\n", encoding="utf-8"
            )
            print(json.dumps(expected["counts"], sort_keys=True))
            return 0
        result = verify(args, expected)
        (args.output / "coverage.json").write_text(
            json.dumps(result, indent=2) + "\n", encoding="utf-8"
        )
        print(f"{result['status']}: {len(result['failures'])} required source failures")
        return 1 if result["failures"] else 0
    except (
        OSError,
        ValueError,
        KeyError,
        subprocess.CalledProcessError,
        zipfile.BadZipFile,
    ) as error:
        if args.mode == "verify" and not output_existed and args.output.is_dir():
            (args.output / "coverage.json").write_text(
                json.dumps(
                    {"schema_version": 1, "status": "NOT_RUN", "error": str(error)},
                    indent=2,
                )
                + "\n",
                encoding="utf-8",
            )
        print(f"ERROR (coverage not established): {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
