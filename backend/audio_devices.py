"""Bounded playback-device discovery and per-thread Windows COM ownership."""

import ctypes
import logging
import platform
import sys
import threading
import time
from collections.abc import Callable
from contextlib import contextmanager
from typing import TypedDict

logger = logging.getLogger(__name__)
_soundcard_import_lock = threading.Lock()


class AudioDevice(TypedDict):
    id: str
    name: str
    is_default: bool


def default_audio_devices() -> list[AudioDevice]:
    return [
        {
            "id": "default",
            "name": "System Default Speaker / 系統預設輸出裝置",
            "is_default": True,
        }
    ]


@contextmanager
def soundcard_session():
    """Keep COM initialized on the thread that actually uses WASAPI.

    SoundCard initializes only its importing thread. Later discovery/capture
    threads must own their own apartment, even when the module is already cached.
    Import first because SoundCard 0.4.6 rejects CoInitializeEx's S_FALSE result.
    """
    sc = _load_soundcard()

    ole32 = ctypes.WinDLL("ole32")
    ole32.CoInitializeEx.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
    ole32.CoInitializeEx.restype = ctypes.c_long
    ole32.CoUninitialize.argtypes = []
    ole32.CoUninitialize.restype = None
    result = ole32.CoInitializeEx(None, 0)
    # An existing STA also permits WASAPI; its owner must retain COM ownership.
    if result not in (0, 1, -2147417850):  # S_OK, S_FALSE, RPC_E_CHANGED_MODE
        raise OSError(f"COM initialization failed: 0x{result & 0xFFFFFFFF:08x}")
    try:
        yield sc
    finally:
        if result in (0, 1):
            ole32.CoUninitialize()


def _load_soundcard():
    """Use CPython's native Windows-version fallback during SoundCard import.

    SoundCard 0.4.6 queries win32_ver only to select Windows 8's COM mode.
    CPython 3.13 otherwise sends that query to WMI, which can wait indefinitely.
    Its existing fallback uses getwindowsversion, ver and the registry; retain
    that version mapping and restore the optional WMI provider after import.
    No package files or process-wide platform functions are replaced.
    """
    with _soundcard_import_lock:
        wmi = getattr(platform, "_wmi", None)
        use_fallback = sys.platform == "win32" and wmi is not None
        if use_fallback:
            platform._wmi = None
        try:
            # Keep a static import so PyInstaller discovers SoundCard normally.
            import soundcard as sc

            return sc
        finally:
            if use_fallback:
                platform._wmi = wmi


def enumerate_audio_devices() -> list[AudioDevice]:
    """Enumerate within one COM apartment; called only on a background thread."""
    devices = default_audio_devices()
    with soundcard_session() as sc:
        default_speaker = sc.default_speaker()
        default_id = default_speaker.id if default_speaker else None
        for speaker in sc.all_speakers():
            is_default = speaker.id == default_id
            devices.append(
                {
                    "id": str(speaker.id),
                    "name": speaker.name + (" [Default]" if is_default else ""),
                    "is_default": is_default,
                }
            )
    return devices


class AudioDeviceDiscovery:
    """Share one in-flight native call and return a snapshot within a deadline.

    Native driver calls cannot be cancelled safely. Retain a blocked daemon
    instead of spawning more workers on retries.
    """

    def __init__(
        self,
        enumerate_devices: Callable[[], list[AudioDevice]] = enumerate_audio_devices,
        *,
        wait_seconds: float = 1.0,
        cache_seconds: float = 30.0,
        retry_seconds: float = 5.0,
        clock: Callable[[], float] = time.monotonic,
    ):
        self._enumerate_devices = enumerate_devices
        self._wait_seconds = wait_seconds
        self._cache_seconds = cache_seconds
        self._retry_seconds = retry_seconds
        self._clock = clock
        self._lock = threading.Lock()
        self._devices = default_audio_devices()
        self._refresh_after = 0.0
        self._pending: threading.Event | None = None
        self._timeout_reported = False

    def get_devices(self) -> list[AudioDevice]:
        with self._lock:
            if self._pending is None and self._clock() >= self._refresh_after:
                self._timeout_reported = False
                self._pending = threading.Event()
                threading.Thread(
                    target=self._refresh,
                    args=(self._pending,),
                    name="audio-device-discovery",
                    daemon=True,
                ).start()
            pending = self._pending
        if pending is not None:
            finished = pending.wait(self._wait_seconds)
            with self._lock:
                if not finished and not self._timeout_reported:
                    self._timeout_reported = True
                    logger.warning(
                        "Audio device discovery timed out; returning cached devices"
                    )
        with self._lock:
            return [dict(device) for device in self._devices]

    def _refresh(self, completed: threading.Event) -> None:
        try:
            devices = self._enumerate_devices()
        except Exception:
            logger.warning("Audio device discovery failed; retaining cached devices")
            with self._lock:
                self._refresh_after = self._clock() + self._retry_seconds
        else:
            with self._lock:
                self._devices = devices
                self._refresh_after = self._clock() + self._cache_seconds
        finally:
            with self._lock:
                self._pending = None
                completed.set()
