"""Path security utilities for preventing directory traversal and path injection attacks."""

import os
from typing import Optional


def safe_resolve_path(
    base_dir: str,
    *path_segments: str,
    allow_create: bool = False,
) -> Optional[str]:
    """Safely resolve a path within a designated base directory.

    Ensures the resulting path is strictly contained inside `base_dir`.
    Prevents path traversal attacks (e.g. '../', absolute path escapes).

    Args:
        base_dir: The allowed root directory.
        *path_segments: The relative path segments or filenames to join.
        allow_create: If True, do not require the final path to exist on disk.

    Returns:
        The normalized real path as a string if valid and contained, or None if invalid.
    """
    if not path_segments:
        return None

    # Sanitize each segment: reject null bytes and extract safe filenames if single segment
    cleaned_segments = []
    for seg in path_segments:
        if not seg or "\0" in seg:
            return None
        # Remove leading slashes to prevent absolute path override in os.path.join
        cleaned_segments.append(seg.lstrip("/\\"))

    abs_base = os.path.realpath(os.path.abspath(base_dir))
    joined_target = os.path.join(abs_base, *cleaned_segments)
    abs_target = os.path.realpath(os.path.abspath(joined_target))

    try:
        # Strict containment check using commonpath
        if os.path.commonpath([abs_base, abs_target]) != abs_base:
            return None
    except ValueError:
        # Raised on Windows when paths are on different drives
        return None

    if not allow_create and not os.path.exists(abs_target):
        return None

    return abs_target


def safe_join_under_dir(base_dir: str, filename: str) -> str:
    """Strictly sanitize a filename using basename and ensure it resides within base_dir.

    Args:
        base_dir: The allowed root directory.
        filename: The filename or path parameter provided by user/client.

    Returns:
        The validated absolute path.

    Raises:
        ValueError: If path traversal or boundary escape is detected.
    """
    if not filename or "\0" in filename:
        raise ValueError("Invalid filename provided")

    clean_name = os.path.basename(filename)
    if not clean_name or clean_name in (".", ".."):
        raise ValueError("Invalid filename component")

    abs_base = os.path.realpath(os.path.abspath(base_dir))
    abs_target = os.path.realpath(os.path.abspath(os.path.join(abs_base, clean_name)))

    try:
        if os.path.commonpath([abs_base, abs_target]) != abs_base:
            raise ValueError(f"Path traversal detected: {filename}")
    except ValueError as e:
        raise ValueError(f"Invalid path containment: {e}") from e

    return abs_target
