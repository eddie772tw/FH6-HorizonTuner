"""Runtime helpers that keep telemetry ingestion responsive."""

import asyncio
import copy
import math
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass
from time import perf_counter
from typing import Any, Literal

Profile = dict[str, Any]
ProfileLoader = Callable[[str], Profile | None]
ProfileSaver = Callable[[str, Profile], None]
ProfileLoadState = Literal["ready", "loading", "missing", "failed"]


@dataclass(frozen=True)
class ProfileLookup:
    """The non-blocking state of a requested car profile."""

    state: ProfileLoadState
    profile: Profile | None = None


class AsyncCarParamsCache:
    """Resolve car profiles without awaiting disk work from the telemetry loop."""

    def __init__(self, load_profile: ProfileLoader):
        self._load_profile = load_profile
        self._load_tasks: dict[str, asyncio.Task[Profile | None]] = {}
        self._missing_keys: set[str] = set()
        self._failed_keys: set[str] = set()

    def resolve(self, cache: dict[str, Profile], car_id: str) -> ProfileLookup:
        """Return a cached profile or begin a background load for it."""
        if car_id in cache:
            self.mark_ready(car_id)
            return ProfileLookup("ready", cache[car_id])

        if car_id in self._missing_keys:
            return ProfileLookup("missing")
        if car_id in self._failed_keys:
            return ProfileLookup("failed")

        task = self._load_tasks.get(car_id)
        if task is None:
            self._load_tasks[car_id] = asyncio.create_task(
                asyncio.to_thread(self._load_profile, car_id)
            )
            return ProfileLookup("loading")

        if not task.done():
            return ProfileLookup("loading")

        self._load_tasks.pop(car_id, None)
        try:
            profile = task.result()
        except Exception:
            self._failed_keys.add(car_id)
            return ProfileLookup("failed")

        if profile is None:
            self._missing_keys.add(car_id)
            return ProfileLookup("missing")

        cache[car_id] = profile
        return ProfileLookup("ready", profile)

    def mark_ready(self, car_id: str) -> None:
        """Discard stale loader state after another path has updated the cache."""
        self._missing_keys.discard(car_id)
        self._failed_keys.discard(car_id)
        task = self._load_tasks.pop(car_id, None)
        if task and not task.done():
            task.cancel()
        elif task:
            try:
                task.result()
            except Exception:
                pass

    async def cancel_pending(self) -> None:
        """Stop awaiting unfinished profile loads during application shutdown."""
        tasks = list(self._load_tasks.values())
        self._load_tasks.clear()
        for task in tasks:
            if not task.done():
                task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)


class AsyncCarParamsWriter:
    """Coalesce profile writes so disk I/O never runs in the telemetry loop."""

    def __init__(self, save_profile: ProfileSaver):
        self._save_profile = save_profile
        self._pending: dict[str, Profile] = {}
        self._write_tasks: dict[str, asyncio.Task[None]] = {}
        self.failed_writes = 0

    def schedule(self, car_id: str, profile: Profile) -> None:
        """Queue the newest profile snapshot for a car."""
        self._pending[car_id] = copy.deepcopy(profile)
        task = self._write_tasks.get(car_id)
        if task is None or task.done():
            self._write_tasks[car_id] = asyncio.create_task(self._drain(car_id))

    @property
    def pending_write_count(self) -> int:
        """Return the number of profiles with an outstanding save operation."""
        return len(self._write_tasks)

    async def _drain(self, car_id: str) -> None:
        while car_id in self._pending:
            profile = self._pending.pop(car_id)
            try:
                await asyncio.to_thread(self._save_profile, car_id, profile)
            except Exception:
                self.failed_writes += 1
        self._write_tasks.pop(car_id, None)

    async def flush(self) -> None:
        """Wait for the last scheduled version of every profile to be persisted."""
        while self._write_tasks:
            await asyncio.gather(
                *list(self._write_tasks.values()), return_exceptions=True
            )


class TelemetryPipelineMetrics:
    """Keep a bounded, low-overhead view of telemetry pipeline health."""

    contract_version = "telemetry-pipeline-metrics/v1"

    def __init__(self, sample_window: int = 240):
        self._sample_window = sample_window
        self._stage_samples: dict[str, deque[float]] = {}
        self._frames_processed = 0
        self._frames_dropped = 0
        self._queue_peak = 0

    def measure_stage(self, stage: str):
        """Return a context manager that stores one stage duration in milliseconds."""
        return _StageTimer(self, stage)

    def record_stage(self, stage: str, elapsed_seconds: float) -> None:
        """Record one stage duration without allocating an unbounded history."""
        samples = self._stage_samples.setdefault(
            stage, deque(maxlen=self._sample_window)
        )
        samples.append(max(0.0, elapsed_seconds * 1000.0))

    def record_frame(self, elapsed_seconds: float) -> None:
        """Record a completed telemetry frame."""
        self._frames_processed += 1
        self.record_stage("total", elapsed_seconds)

    def record_dropped_frames(self, count: int) -> None:
        """Record intentional queue drops caused by backpressure handling."""
        self._frames_dropped += max(0, count)

    def observe_queue_depth(self, queue_depth: int) -> None:
        """Track the highest observed queue depth since process start."""
        self._queue_peak = max(self._queue_peak, max(0, queue_depth))

    def snapshot(
        self, *, queue_depth: int, json_clients: int, binary_clients: int
    ) -> dict[str, Any]:
        """Return the stable diagnostics contract exposed by the backend API."""
        return {
            "contractVersion": self.contract_version,
            "framesProcessed": self._frames_processed,
            "framesDropped": self._frames_dropped,
            "queue": {
                "current": max(0, queue_depth),
                "peak": self._queue_peak,
            },
            "clients": {
                "json": max(0, json_clients),
                "binary": max(0, binary_clients),
            },
            "stagesMs": {
                name: _summarize_samples(samples)
                for name, samples in sorted(self._stage_samples.items())
            },
        }


class _StageTimer:
    """Context manager used to measure a telemetry pipeline stage."""

    def __init__(self, metrics: TelemetryPipelineMetrics, stage: str):
        self._metrics = metrics
        self._stage = stage
        self._started_at = 0.0

    def __enter__(self):
        self._started_at = perf_counter()
        return self

    def __exit__(self, exc_type, exc_value, traceback) -> None:
        self._metrics.record_stage(self._stage, perf_counter() - self._started_at)


def _summarize_samples(samples: deque[float]) -> dict[str, float | int]:
    if not samples:
        return {"count": 0, "last": 0.0, "avg": 0.0, "max": 0.0, "p95": 0.0}

    values = sorted(samples)
    percentile_index = min(len(values) - 1, math.ceil(len(values) * 0.95) - 1)
    return {
        "count": len(samples),
        "last": round(samples[-1], 3),
        "avg": round(sum(samples) / len(samples), 3),
        "max": round(max(samples), 3),
        "p95": round(values[percentile_index], 3),
    }
