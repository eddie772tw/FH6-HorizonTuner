import sys
from contextlib import contextmanager
from pathlib import Path

# Add backend directory to sys.path for test execution
backend_path = Path(__file__).parents[1] / "backend"
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

import audio_spectrum  # noqa: E402
from audio_devices import AudioDeviceDiscovery, default_audio_devices  # noqa: E402


def test_get_available_audio_devices_returns_default(monkeypatch):
    monkeypatch.setattr(
        audio_spectrum, "_device_discovery", AudioDeviceDiscovery(default_audio_devices)
    )
    devices = audio_spectrum.get_available_audio_devices()
    assert isinstance(devices, list)
    assert len(devices) >= 1
    assert devices[0]["id"] == "default"
    assert devices[0]["is_default"] is True


def test_set_audio_capture_device_updates_state():
    initial_device = audio_spectrum._selected_device_id
    try:
        audio_spectrum.set_audio_capture_device("custom_speaker_id_123")
        assert audio_spectrum._selected_device_id == "custom_speaker_id_123"

        audio_spectrum.set_audio_capture_device("default")
        assert audio_spectrum._selected_device_id == "default"
    finally:
        audio_spectrum.set_audio_capture_device(initial_device)


def test_capture_worker_uses_com_session_and_clears_running_on_failure(monkeypatch):
    active = []
    fake_soundcard = object()

    @contextmanager
    def session():
        active.append(True)
        try:
            yield fake_soundcard
        finally:
            active.clear()

    def capture(sc):
        assert sc is fake_soundcard
        assert active == [True]
        raise RuntimeError("device disconnected")

    monkeypatch.setattr(audio_spectrum.sys, "platform", "win32")
    monkeypatch.setattr(audio_spectrum, "soundcard_session", session)
    monkeypatch.setattr(audio_spectrum, "_capture_loopback", capture)
    monkeypatch.setattr(audio_spectrum, "_listener_running", True)
    audio_spectrum._wasapi_loopback_worker()
    assert not audio_spectrum._listener_running
    assert not active


def test_capture_worker_on_unsupported_platform_clears_running(monkeypatch):
    monkeypatch.setattr(audio_spectrum.sys, "platform", "linux")
    monkeypatch.setattr(audio_spectrum, "_listener_running", True)
    audio_spectrum._wasapi_loopback_worker()
    assert not audio_spectrum._listener_running
