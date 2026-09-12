"""Native audio calls must be bounded and independent of test-host hardware."""

import builtins
import sys
import threading
from contextlib import contextmanager
from types import SimpleNamespace

import audio_devices
import pytest


def test_soundcard_import_uses_native_version_fallback_and_restores_wmi(monkeypatch):
    provider = object()
    soundcard = object()
    monkeypatch.setattr(audio_devices.sys, "platform", "win32")
    monkeypatch.setattr(audio_devices.platform, "_wmi", provider, raising=False)

    original_import = builtins.__import__

    def import_soundcard(name, *args, **kwargs):
        if name == "soundcard":
            assert audio_devices.platform._wmi is None
            return soundcard
        return original_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", import_soundcard)
    assert audio_devices._load_soundcard() is soundcard
    assert audio_devices.platform._wmi is provider


def test_soundcard_import_restores_wmi_when_dependency_import_fails(monkeypatch):
    provider = object()
    monkeypatch.setattr(audio_devices.sys, "platform", "win32")
    monkeypatch.setattr(audio_devices.platform, "_wmi", provider, raising=False)

    original_import = builtins.__import__

    def import_soundcard(name, *args, **kwargs):
        if name == "soundcard":
            assert audio_devices.platform._wmi is None
            raise ImportError("soundcard unavailable")
        return original_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", import_soundcard)
    with pytest.raises(ImportError, match="soundcard unavailable"):
        audio_devices._load_soundcard()
    assert audio_devices.platform._wmi is provider


def test_soundcard_import_when_optional_wmi_is_absent(monkeypatch):
    soundcard = object()
    monkeypatch.delattr(audio_devices.platform, "_wmi", raising=False)
    monkeypatch.setitem(sys.modules, "soundcard", soundcard)
    assert audio_devices._load_soundcard() is soundcard
    assert not hasattr(audio_devices.platform, "_wmi")


def test_blocked_discovery_returns_default_without_spawning_retries():
    entered = threading.Event()
    release = threading.Event()
    calls = []

    def enumerate_devices():
        calls.append(1)
        entered.set()
        release.wait(3)
        return audio_devices.default_audio_devices()

    discovery = audio_devices.AudioDeviceDiscovery(enumerate_devices, wait_seconds=0.01)
    try:
        assert discovery.get_devices()[0]["id"] == "default"
        assert entered.wait(1)
        assert not release.is_set()
        for _ in range(3):
            assert discovery.get_devices()[0]["id"] == "default"
        assert calls == [1]
    finally:
        release.set()
        with discovery._lock:
            pending = discovery._pending
        if pending is not None:
            assert pending.wait(1)


def test_discovery_refreshes_expired_cache_and_returns_independent_snapshots():
    now = [1.0]
    calls = []

    def enumerate_devices():
        calls.append(1)
        return [{"id": str(len(calls)), "name": "Speaker", "is_default": True}]

    discovery = audio_devices.AudioDeviceDiscovery(
        enumerate_devices, clock=lambda: now[0]
    )
    devices = discovery.get_devices()
    assert devices[0]["id"] == "1"
    devices[0]["id"] = "modified by caller"
    assert discovery.get_devices()[0]["id"] == "1"
    now[0] += 31
    assert discovery.get_devices()[0]["id"] == "2"


def test_discovery_failure_retains_cache_and_recovers_after_backoff():
    now = [1.0]
    outcomes = iter(
        [
            [{"id": "old", "name": "Old", "is_default": False}],
            RuntimeError("driver unavailable"),
            [{"id": "new", "name": "New", "is_default": True}],
        ]
    )

    def enumerate_devices():
        result = next(outcomes)
        if isinstance(result, Exception):
            raise result
        return result

    discovery = audio_devices.AudioDeviceDiscovery(
        enumerate_devices, clock=lambda: now[0]
    )
    assert discovery.get_devices()[0]["id"] == "old"
    now[0] += 31
    assert discovery.get_devices()[0]["id"] == "old"
    now[0] += 1
    assert discovery.get_devices()[0]["id"] == "old"
    now[0] += 5
    assert discovery.get_devices()[0]["id"] == "new"


@pytest.mark.parametrize("result", [0, 1, -2147417850])
def test_soundcard_session_balances_thread_com_ownership(monkeypatch, result):
    actions = []
    fake_soundcard = SimpleNamespace()
    monkeypatch.setitem(sys.modules, "soundcard", fake_soundcard)

    def initialize(*_):
        actions.append("initialize")
        return result

    def uninitialize():
        actions.append("uninitialize")

    ole32 = SimpleNamespace(CoInitializeEx=initialize, CoUninitialize=uninitialize)
    monkeypatch.setattr(audio_devices.ctypes, "WinDLL", lambda _: ole32, raising=False)
    with pytest.raises(RuntimeError, match="capture failed"):
        with audio_devices.soundcard_session() as sc:
            assert sc is fake_soundcard
            actions.append("capture")
            raise RuntimeError("capture failed")
    expected = ["initialize", "capture"]
    if result in (0, 1):
        expected.append("uninitialize")
    assert actions == expected


def test_soundcard_session_rejects_failed_com_initialization(monkeypatch):
    monkeypatch.setitem(sys.modules, "soundcard", SimpleNamespace())

    def initialize(*_):
        return -2147024882

    def uninitialize():
        pytest.fail("A failed COM initialization must not be uninitialized")

    ole32 = SimpleNamespace(CoInitializeEx=initialize, CoUninitialize=uninitialize)
    monkeypatch.setattr(audio_devices.ctypes, "WinDLL", lambda _: ole32, raising=False)
    with pytest.raises(OSError, match="COM initialization failed"):
        with audio_devices.soundcard_session():
            pytest.fail("Capture must not run without COM")


def test_enumeration_maps_speakers_and_default_inside_session(monkeypatch):
    selected = SimpleNamespace(id="speaker-a", name="Speaker A")
    other = SimpleNamespace(id="speaker-b", name="Speaker B")
    active = []

    def all_speakers():
        assert active == [True]
        return [selected, other]

    @contextmanager
    def session():
        active.append(True)
        try:
            yield SimpleNamespace(
                default_speaker=lambda: selected, all_speakers=all_speakers
            )
        finally:
            active.clear()

    monkeypatch.setattr(audio_devices, "soundcard_session", session)
    assert audio_devices.enumerate_audio_devices() == [
        *audio_devices.default_audio_devices(),
        {"id": "speaker-a", "name": "Speaker A [Default]", "is_default": True},
        {"id": "speaker-b", "name": "Speaker B", "is_default": False},
    ]
    assert not active
