"""Check that Windows platform fallback is inherited and scoped to a build."""

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from scripts.build_sidecar import build_environment, main


@pytest.mark.skipif(sys.platform != "win32", reason="Windows platform metadata")
def test_platform_metadata_in_build_and_child_without_changing_parent():
    original_path = os.environ.get("PYTHONPATH")
    probe = (
        "import json, platform; "
        "print(json.dumps([platform.system(), platform.win32_ver()[0], "
        "platform.machine()]))"
    )
    child_probe = (
        "import subprocess, sys; "
        f"subprocess.run([sys.executable, '-c', {probe!r}], check=True)"
    )
    with build_environment() as environment:
        temporary_path = Path(environment["PYTHONPATH"].split(os.pathsep)[0])
        for code in (probe, child_probe):
            result = subprocess.run(
                [sys.executable, "-c", code],
                env=environment,
                capture_output=True,
                text=True,
                timeout=10,
                check=True,
            )
            system, release, machine = json.loads(result.stdout)
            assert system == "Windows"
            assert release
            assert machine
    assert not temporary_path.exists()
    assert os.environ.get("PYTHONPATH") == original_path


def test_builder_preserves_arguments_exit_code_and_environment(tmp_path, monkeypatch):
    package = tmp_path / "PyInstaller"
    package.mkdir()
    (package / "__init__.py").touch()
    (package / "__main__.py").write_text(
        "import json, os, sys\n"
        "from pathlib import Path\n"
        "Path(os.environ['BUILD_PROBE']).write_text(json.dumps(sys.argv[1:]))\n"
        "raise SystemExit(23)\n",
        encoding="utf-8",
    )
    output = tmp_path / "arguments.json"
    monkeypatch.setenv("PYTHONPATH", str(tmp_path))
    monkeypatch.setenv("BUILD_PROBE", str(output))
    arguments = ["path with spaces/app.spec", "--clean", "--noconfirm"]
    assert main(arguments) == 23
    assert json.loads(output.read_text()) == arguments
    assert os.environ["PYTHONPATH"] == str(tmp_path)
