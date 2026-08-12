import asyncio

import audio_spectrum


def _reset_audio_cache(monkeypatch):
    monkeypatch.setattr(
        audio_spectrum,
        "_audio_cache",
        {
            "spectrum": [0.0] * 32,
            "vu_left": 0.0,
            "vu_right": 0.0,
            "has_audio": False,
            "last_update": 0.0,
            "sequence": 0,
            "captured_at_ms": 0,
            "source": "unavailable",
        },
    )
    monkeypatch.setattr(audio_spectrum, "start_audio_spectrum_service", lambda: None)


def test_audio_snapshot_sequence_and_state_follow_sample_age(monkeypatch):
    now = {"value": 10.0}
    monkeypatch.setattr(audio_spectrum.time, "monotonic", lambda: now["value"])
    _reset_audio_cache(monkeypatch)

    audio_spectrum.update_audio_spectrum_buffer([0.25, -0.25] * 64)
    live = asyncio.run(audio_spectrum.get_audio_spectrum_data())

    now["value"] = 10.2
    stale = asyncio.run(audio_spectrum.get_audio_spectrum_data())
    now["value"] = 10.3
    unavailable = asyncio.run(audio_spectrum.get_audio_spectrum_data())

    assert live["sequence"] == 1
    assert live["state"] == "live"
    assert live["has_audio"] is True
    assert stale["sequence"] == live["sequence"]
    assert stale["state"] == "stale"
    assert stale["has_audio"] is False
    assert unavailable["state"] == "unavailable"
    assert unavailable["vu_left"] == 0.0
    assert unavailable["vu_right"] == 0.0

