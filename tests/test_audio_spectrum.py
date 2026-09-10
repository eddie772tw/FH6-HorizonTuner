import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

# Add backend directory to sys.path for test execution
backend_path = Path(__file__).parents[1] / "backend"
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

import audio_spectrum  # noqa: E402


@pytest.mark.host_diagnostics
def test_get_available_audio_devices_returns_default_on_host():
    devices = audio_spectrum.get_available_audio_devices()
    assert isinstance(devices, list)
    assert len(devices) >= 1
    assert devices[0]["id"] == "default"
    assert devices[0]["is_default"] is True


def test_get_available_audio_devices_maps_speakers_without_host_access(monkeypatch):
    default = SimpleNamespace(id="speaker-a", name="Primary")
    other = SimpleNamespace(id="speaker-b", name="Secondary")
    monkeypatch.setattr(audio_spectrum.sys, "platform", "win32")
    monkeypatch.setitem(
        sys.modules,
        "soundcard",
        SimpleNamespace(
            default_speaker=lambda: default, all_speakers=lambda: [default, other]
        ),
    )
    devices = audio_spectrum.get_available_audio_devices()
    assert devices[0]["id"] == "default"
    assert devices[0]["is_default"] is True
    assert devices[1:] == [
        {"id": "speaker-a", "name": "Primary [Default]", "is_default": True},
        {"id": "speaker-b", "name": "Secondary", "is_default": False},
    ]


def test_set_audio_capture_device_updates_state():
    initial_device = audio_spectrum._selected_device_id
    try:
        audio_spectrum.set_audio_capture_device("custom_speaker_id_123")
        assert audio_spectrum._selected_device_id == "custom_speaker_id_123"

        audio_spectrum.set_audio_capture_device("default")
        assert audio_spectrum._selected_device_id == "default"
    finally:
        audio_spectrum.set_audio_capture_device(initial_device)
