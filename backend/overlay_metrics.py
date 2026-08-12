"""Bounded diagnostics for the overlay audio and media pipeline."""

from __future__ import annotations

from collections import Counter, deque
from time import perf_counter
from typing import Any


class OverlayPerformanceMetrics:
    """Keep low-overhead counters and bounded timing samples for overlay work."""

    contract_version = "overlay-performance-metrics/v1"

    def __init__(self, sample_window: int = 120) -> None:
        self._sample_window = max(1, sample_window)
        self._counters: Counter[str] = Counter()
        self._durations_ms: dict[str, deque[float]] = {}

    def increment(self, name: str, amount: int = 1) -> None:
        """Increment a named counter without allowing negative values."""
        if amount > 0:
            self._counters[name] += amount

    def measure(self, name: str) -> "_OverlayTimer":
        """Return a context manager that records one bounded duration sample."""
        return _OverlayTimer(self, name)

    def record_duration(self, name: str, elapsed_seconds: float) -> None:
        """Record a non-negative duration in milliseconds."""
        samples = self._durations_ms.setdefault(name, deque(maxlen=self._sample_window))
        samples.append(max(0.0, elapsed_seconds * 1000.0))

    def snapshot(self, *, active_clients: int, render_mode: str) -> dict[str, Any]:
        """Return the stable bounded diagnostics contract."""
        return {
            "contractVersion": self.contract_version,
            "renderMode": render_mode,
            "activeClients": max(0, active_clients),
            "counters": dict(sorted(self._counters.items())),
            "durationsMs": {
                name: _summarize_samples(samples)
                for name, samples in sorted(self._durations_ms.items())
            },
        }


class _OverlayTimer:
    """Context manager used to measure one overlay operation."""

    def __init__(self, metrics: OverlayPerformanceMetrics, name: str) -> None:
        self._metrics = metrics
        self._name = name
        self._started_at = 0.0

    def __enter__(self) -> "_OverlayTimer":
        self._started_at = perf_counter()
        return self

    def __exit__(self, exc_type, exc_value, traceback) -> None:
        self._metrics.record_duration(self._name, perf_counter() - self._started_at)


def _summarize_samples(samples: deque[float]) -> dict[str, float | int]:
    """Summarize bounded timing samples without exposing the raw history."""
    if not samples:
        return {"count": 0, "last": 0.0, "avg": 0.0, "max": 0.0, "p95": 0.0}

    values = sorted(samples)
    percentile_index = min(len(values) - 1, max(0, (len(values) * 95 + 99) // 100 - 1))
    return {
        "count": len(samples),
        "last": round(samples[-1], 3),
        "avg": round(sum(samples) / len(samples), 3),
        "max": round(max(samples), 3),
        "p95": round(values[percentile_index], 3),
    }
