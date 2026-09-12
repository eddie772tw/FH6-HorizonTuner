"""Run PyInstaller using CPython's native Windows platform fallback.

Python 3.13's optional WMI queries can hang before PyInstaller starts. Make
that optional module unavailable only to this build and its hook subprocesses.
The stdlib then obtains OS metadata through its existing Win32 fallback.
"""

import os
import subprocess
import sys
import tempfile
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path


@contextmanager
def build_environment() -> Iterator[dict[str, str]]:
    environment = os.environ.copy()
    if sys.platform != "win32":
        yield environment
        return

    with tempfile.TemporaryDirectory(prefix="fh6-build-platform-") as directory:
        (Path(directory) / "_wmi.py").write_text(
            'raise ImportError("FH6 build uses the native Windows platform fallback")\n',
            encoding="utf-8",
        )
        environment["PYTHONPATH"] = os.pathsep.join(
            item for item in (directory, environment.get("PYTHONPATH")) if item
        )
        yield environment


def main(arguments: list[str]) -> int:
    with build_environment() as environment:
        return subprocess.call(
            [sys.executable, "-m", "PyInstaller", *arguments], env=environment
        )


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
