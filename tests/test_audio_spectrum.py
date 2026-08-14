import sys
from pathlib import Path

# Add backend directory to sys.path for test execution
backend_path = Path(__file__).parents[1] / "backend"
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

import audio_spectrum  # noqa: E402


def test_get_available_audio_devices_returns_default():
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
