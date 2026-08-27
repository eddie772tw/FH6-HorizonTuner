import os
import sys
from ctypes import wintypes

import pytest


def get_pe_string_info(filepath: str, key: str) -> str:
    """Read Windows PE Version String Resource using win32 API if available."""
    if sys.platform != "win32":
        return ""
    try:
        import ctypes
        from ctypes import wintypes

        size = ctypes.windll.version.GetFileVersionInfoSizeW(filepath, None)
        if size == 0:
            return ""

        buffer = ctypes.create_string_buffer(size)
        if not ctypes.windll.version.GetFileVersionInfoW(filepath, 0, size, buffer):
            return ""

        # Language 0409 (US English), Codepage 04b0 (Unicode) or 0409 04e4 / 0000 04b0
        for lang_codepage in ["040904b0", "040904e4", "000004b0"]:
            sub_block = f"\\StringFileInfo\\{lang_codepage}\\{key}"
            val_ptr = wintypes.LPWSTR()
            val_len = wintypes.UINT()
            if ctypes.windll.version.VerQueryValueW(
                buffer, sub_block, ctypes.byref(val_ptr), ctypes.byref(val_len)
            ):
                if val_ptr.value:
                    return val_ptr.value
        return ""
    except Exception:
        return ""


def find_executable_paths():
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    sidecar_path = os.path.join(
        root_dir,
        "frontend",
        "src-tauri",
        "bin",
        "server-sidecar-x86_64-pc-windows-msvc.exe",
    )
    if not os.path.exists(sidecar_path):
        sidecar_path = os.path.join(
            root_dir, "dist", "server-sidecar-x86_64-pc-windows-msvc.exe"
        )

    standalone_candidates = [
        os.path.join(root_dir, "dist", "FH6-HorizonTuner.exe"),
        os.path.join(
            root_dir,
            "frontend",
            "src-tauri",
            "target",
            "release",
            "FH6-HorizonTuner.exe",
        ),
    ]
    standalone_exe = next(
        (path for path in standalone_candidates if os.path.exists(path)),
        standalone_candidates[0],
    )
    return sidecar_path, standalone_exe


def find_lite_executable_path():
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    candidates = [
        os.path.join(root_dir, "dist", "FH6-HorizonTuner_lite.exe"),
        os.path.join(
            root_dir,
            "frontend",
            "src-tauri",
            "target",
            "release",
            "FH6-HorizonTuner_lite.exe",
        ),
    ]
    return next((path for path in candidates if os.path.exists(path)), candidates[0])


@pytest.mark.executable_bundle
def test_sidecar_executable_existence_and_metadata():
    sidecar_path, standalone_exe = find_executable_paths()

    target_exe = None
    if os.path.exists(sidecar_path):
        target_exe = sidecar_path
    elif os.path.exists(standalone_exe):
        target_exe = standalone_exe

    if not target_exe:
        pytest.skip(
            "No compiled executable found to verify metadata. Build executable first."
        )

    assert os.path.exists(target_exe), f"Executable does not exist at {target_exe}"
    assert os.path.getsize(target_exe) > 100000, (
        f"Executable file {target_exe} is surprisingly small"
    )

    if sys.platform == "win32":
        company = get_pe_string_info(target_exe, "CompanyName")
        version = get_pe_string_info(target_exe, "FileVersion")
        if company:
            assert company == "eddie772tw", (
                f"Expected CompanyName 'eddie772tw', got '{company}'"
            )
        if version:
            assert version.startswith("11.45.15"), (
                f"Expected FileVersion starting with '11.45.15', got '{version}'"
            )


@pytest.mark.executable_bundle
def test_lite_executable_existence_and_metadata():
    lite_exe = find_lite_executable_path()
    if not os.path.exists(lite_exe):
        pytest.skip(
            "No compiled Lite executable found to verify metadata. Build executable first."
        )

    assert os.path.getsize(lite_exe) > 100000, (
        f"Lite executable file {lite_exe} is surprisingly small"
    )
    if sys.platform == "win32":
        company = get_pe_string_info(lite_exe, "CompanyName")
        version = get_pe_string_info(lite_exe, "FileVersion")
        if company:
            assert company == "eddie772tw", (
                f"Expected CompanyName 'eddie772tw', got '{company}'"
            )
        if version:
            assert version.startswith("11.45.15"), (
                f"Expected FileVersion starting with '11.45.15', got '{version}'"
            )
