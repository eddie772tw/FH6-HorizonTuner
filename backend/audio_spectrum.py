import logging
import math
import sys
import threading
import time
import warnings

import numpy as np

# Suppress expected runtime warnings from the soundcard module (e.g. "data discontinuity in recording")
warnings.filterwarnings("ignore", category=RuntimeWarning, module="soundcard")

logger = logging.getLogger(__name__)

# Cache for audio spectrum state
_audio_cache = {
    "spectrum": [0.0] * 32,
    "vu_left": 0.0,
    "vu_right": 0.0,
    "has_audio": False,
    "last_update": 0.0,
    "sequence": 0,
    "captured_at_ms": 0,
    "source": "unavailable",
}

_listener_thread = None
_listener_running = False
_lock = threading.Lock()
_last_start_attempt = 0.0
RESTART_BACKOFF_SECONDS = 5.0
AUDIO_STALE_AFTER_SECONDS = 0.15
AUDIO_SILENT_AFTER_SECONDS = 0.25
AUDIO_BAND_COUNT = 32


def _compute_fft_bands(
    pcm_samples: list[float], num_bands: int = 32
) -> tuple[list[float], float, float]:
    """Compute 32 logarithmic frequency bands and L/R channel VU meters from PCM float samples (-1.0 to 1.0)."""
    if not pcm_samples or len(pcm_samples) < 32:
        return [0.0] * num_bands, 0.0, 0.0

    samples = np.array(pcm_samples, dtype=np.float32)
    m_len = len(samples) // 2
    if m_len < 16:
        return [0.0] * num_bands, 0.0, 0.0

    left = samples[0::2]
    right = samples[1::2] if len(samples) > 1 else left

    rms_l = float(np.sqrt(np.mean(left**2))) if len(left) > 0 else 0.0
    rms_r = float(np.sqrt(np.mean(right**2))) if len(right) > 0 else 0.0

    vu_l = max(0.0, rms_l * 2.8)
    vu_r = max(0.0, rms_r * 2.8)

    mono = (left + right[: len(left)]) * 0.5

    # 使用快速傅立葉轉換 (FFT) 替代手動三層迴圈
    windowed = mono * np.hanning(len(mono))
    fft_mags = np.abs(np.fft.rfft(windowed))
    data_len = len(fft_mags)

    spectrum = [0.0] * num_bands
    for b in range(num_bands):
        start_idx = int((b / num_bands) ** 2.0 * data_len)
        end_idx = max(start_idx + 1, int(((b + 1) / num_bands) ** 2.0 * data_len))
        avg_mag = float(np.mean(fft_mags[start_idx:end_idx]))
        spectrum[b] = max(0.0, (avg_mag * 6.0) ** 0.75)

    return spectrum, vu_l, vu_r


def _wasapi_loopback_worker():
    """Worker thread that continuously captures live system audio via WASAPI Loopback."""
    global _listener_running

    if sys.platform != "win32":
        return

    try:
        import numpy as np
        import soundcard as sc

        spk = sc.default_speaker()
        if not spk:
            logger.debug("No default WASAPI speaker found")
            return

        loopback_mic = sc.get_microphone(id=spk.id, include_loopback=True)
        if not loopback_mic:
            logger.debug("No WASAPI loopback mic found")
            return

        samplerate = 44100
        numframes = 1470  # ~30FPS buffer size

        with loopback_mic.recorder(samplerate=samplerate) as recorder:
            while _listener_running:
                try:
                    data = recorder.record(numframes=numframes)
                    if data is None or len(data) == 0:
                        time.sleep(0.033)
                        continue

                    num_channels = data.shape[1] if len(data.shape) > 1 else 1
                    left = data[:, 0] if num_channels >= 1 else data
                    right = data[:, 1] if num_channels > 1 else left

                    # Calculate L/R channel RMS VU levels with boosted sensitivity gain
                    rms_l = float(np.sqrt(np.mean(left**2))) if len(left) > 0 else 0.0
                    rms_r = float(np.sqrt(np.mean(right**2))) if len(right) > 0 else 0.0

                    vu_l = max(0.0, float(math.pow(rms_l * 30.0, 0.65)))
                    vu_r = max(0.0, float(math.pow(rms_r * 30.0, 0.65)))

                    # Mono FFT analysis
                    mono = (left + right) * 0.5
                    m_len = len(mono)

                    has_audio = vu_l > 0.005 or vu_r > 0.005
                    spectrum = [0.0] * AUDIO_BAND_COUNT

                    if has_audio and m_len > 32:
                        windowed = mono * np.hanning(m_len)
                        fft_mags = np.abs(np.fft.rfft(windowed))
                        data_len = len(fft_mags)

                        bands = 32
                        for b in range(bands):
                            start_idx = int(math.pow(b / bands, 2.0) * data_len)
                            end_idx = max(
                                start_idx + 1,
                                int(math.pow((b + 1) / bands, 2.0) * data_len),
                            )
                            avg_mag = float(np.mean(fft_mags[start_idx:end_idx]))
                            val = max(0.0, math.pow(avg_mag * 4.5, 0.75))
                            spectrum[b] = val

                    with _lock:
                        _audio_cache["spectrum"] = spectrum
                        _audio_cache["vu_left"] = vu_l
                        _audio_cache["vu_right"] = vu_r
                        _audio_cache["has_audio"] = has_audio
                        _audio_cache["last_update"] = time.monotonic()
                        _audio_cache["captured_at_ms"] = int(time.time() * 1000)
                        _audio_cache["sequence"] += 1
                        _audio_cache["source"] = "wasapi"

                except Exception as e:
                    logger.debug(f"WASAPI loopback frame record notice: {e}")
                    time.sleep(0.05)

    except Exception as e:
        logger.debug(f"WASAPI loopback service error: {e}")
        _listener_running = False
    finally:
        _listener_running = False


def start_audio_spectrum_service():
    """Start background system audio spectrum listener if not already running."""
    global _last_start_attempt, _listener_thread, _listener_running
    now = time.monotonic()
    if _listener_running or (
        _listener_thread is not None and _listener_thread.is_alive()
    ):
        return
    if now - _last_start_attempt < RESTART_BACKOFF_SECONDS:
        return

    _last_start_attempt = now
    _listener_running = True
    _listener_thread = threading.Thread(target=_wasapi_loopback_worker, daemon=True)
    _listener_thread.start()


def stop_audio_spectrum_service() -> None:
    """Ask the background capture worker to stop when no HUD needs audio."""
    global _last_start_attempt, _listener_running
    _listener_running = False
    _last_start_attempt = 0.0


def update_audio_spectrum_buffer(pcm_samples: list[float]):
    """Update current system audio spectrum buffer from PCM audio feed."""
    spectrum, vu_l, vu_r = _compute_fft_bands(pcm_samples, 32)
    has_audio = (vu_l > 0.01 or vu_r > 0.01) or any(v > 0.02 for v in spectrum)

    with _lock:
        _audio_cache["spectrum"] = spectrum
        _audio_cache["vu_left"] = vu_l
        _audio_cache["vu_right"] = vu_r
        _audio_cache["has_audio"] = has_audio
        _audio_cache["last_update"] = time.monotonic()
        _audio_cache["captured_at_ms"] = int(time.time() * 1000)
        _audio_cache["sequence"] += 1
        _audio_cache["source"] = "external"


async def get_audio_spectrum_data() -> dict:
    """Get latest system audio spectrum frequency bands and L/R VU meters."""
    start_audio_spectrum_service()
    now = time.monotonic()
    with _lock:
        age = (
            now - _audio_cache["last_update"]
            if _audio_cache["sequence"]
            else float("inf")
        )
        if age > AUDIO_SILENT_AFTER_SECONDS:
            state = "unavailable"
        elif age > AUDIO_STALE_AFTER_SECONDS:
            state = "stale"
        elif _audio_cache["has_audio"]:
            state = "live"
        else:
            state = "silence"

        has_audio = bool(_audio_cache["has_audio"]) and state == "live"
        return {
            "spectrum": list(_audio_cache["spectrum"]),
            "vu_left": float(_audio_cache["vu_left"])
            if state != "unavailable"
            else 0.0,
            "vu_right": float(_audio_cache["vu_right"])
            if state != "unavailable"
            else 0.0,
            "has_audio": has_audio,
            "state": state,
            "sequence": int(_audio_cache["sequence"]),
            "captured_at_ms": int(_audio_cache["captured_at_ms"]),
            "source": _audio_cache["source"],
            "success": True,
        }
