"""Race recording state and asynchronous SQLite persistence helpers."""

import asyncio
import logging
import time
from collections.abc import Mapping
from dataclasses import dataclass
from time import perf_counter
from typing import Any, Protocol

logger = logging.getLogger(__name__)


class TelemetrySessionStore(Protocol):
    """The synchronous storage operations used by the persistence worker."""

    def create_session(self, **kwargs: Any) -> None: ...

    def insert_points_batch(
        self, session_id: str, points: list[dict[str, Any]]
    ) -> None: ...

    def finalize_session(self, session_id: str) -> dict[str, Any]: ...


@dataclass(frozen=True)
class _CreateSession:
    session_id: str
    car_ordinal: int
    car_name: str
    car_class: int
    car_pi: int
    start_time: float


@dataclass(frozen=True)
class _WritePoints:
    session_id: str
    points: list[dict[str, Any]]


@dataclass(frozen=True)
class _FinalizeSession:
    session_id: str


PersistenceWork = _CreateSession | _WritePoints | _FinalizeSession


class AsyncRacePersistence:
    """Serialize SQLite work without ever awaiting it from the telemetry loop."""

    def __init__(self, store: TelemetrySessionStore, max_pending_work: int = 64):
        self._store = store
        self._max_pending_work = max_pending_work
        self._queue: asyncio.Queue[PersistenceWork] = asyncio.Queue(
            maxsize=max_pending_work
        )
        self._worker_task: asyncio.Task[None] | None = None
        self._deferred_submissions: set[asyncio.Task[None]] = set()
        self._is_writing = False
        self._queue_peak = 0
        self._completed_batches = 0
        self._dropped_batches = 0
        self._dropped_samples = 0
        self._failed_writes = 0
        self._rejected_control_work = 0
        self._last_write_duration_ms = 0.0

    def start(self) -> None:
        """Start the single writer task for the current application event loop."""
        if self._worker_task is None or self._worker_task.done():
            self._worker_task = asyncio.create_task(self._run())

    def enqueue_session_start(
        self,
        *,
        session_id: str,
        car_ordinal: int,
        car_name: str,
        car_class: int,
        car_pi: int,
        start_time: float,
    ) -> bool:
        """Queue creation of a session before its point batches are submitted."""
        return self._enqueue(
            _CreateSession(
                session_id=session_id,
                car_ordinal=car_ordinal,
                car_name=car_name,
                car_class=car_class,
                car_pi=car_pi,
                start_time=start_time,
            ),
            sample_count=0,
        )

    def enqueue_points(self, session_id: str, points: list[dict[str, Any]]) -> bool:
        """Queue one immutable batch, dropping it rather than delaying telemetry."""
        if not points:
            return True
        return self._enqueue(
            _WritePoints(session_id=session_id, points=points), sample_count=len(points)
        )

    def enqueue_finalize(self, session_id: str) -> None:
        """Queue finalization after every earlier batch, even during temporary saturation."""
        work = _FinalizeSession(session_id=session_id)
        if self._enqueue(work, sample_count=0):
            return

        # A finalizer must not be dropped. It is submitted by a tiny background
        # task so the telemetry loop still never waits for a full queue.
        task = asyncio.create_task(self._enqueue_when_capacity_is_available(work))
        self._deferred_submissions.add(task)
        task.add_done_callback(self._deferred_submissions.discard)

    def snapshot(self) -> dict[str, int | float]:
        """Return bounded diagnostics suitable for the telemetry API contract."""
        return {
            "pendingWork": self._queue.qsize()
            + len(self._deferred_submissions)
            + int(self._is_writing),
            "queuePeak": self._queue_peak,
            "completedBatches": self._completed_batches,
            "droppedBatches": self._dropped_batches,
            "droppedSamples": self._dropped_samples,
            "failedWrites": self._failed_writes,
            "rejectedControlWork": self._rejected_control_work,
            "lastWriteDurationMs": round(self._last_write_duration_ms, 3),
        }

    async def flush(self) -> None:
        """Wait for deferred control work and every already submitted DB write."""
        while self._deferred_submissions:
            await asyncio.gather(
                *list(self._deferred_submissions), return_exceptions=True
            )
        await self._queue.join()

    async def shutdown(self) -> None:
        """Drain outstanding work and release loop-bound queue state."""
        await self.flush()
        if self._worker_task is not None:
            self._worker_task.cancel()
            await asyncio.gather(self._worker_task, return_exceptions=True)
            self._worker_task = None
        self._queue = asyncio.Queue(maxsize=self._max_pending_work)

    def _enqueue(self, work: PersistenceWork, *, sample_count: int) -> bool:
        try:
            self._queue.put_nowait(work)
        except asyncio.QueueFull:
            if sample_count:
                self._dropped_batches += 1
                self._dropped_samples += sample_count
            else:
                self._rejected_control_work += 1
            return False

        self._queue_peak = max(self._queue_peak, self._queue.qsize())
        return True

    async def _enqueue_when_capacity_is_available(self, work: PersistenceWork) -> None:
        await self._queue.put(work)
        self._queue_peak = max(self._queue_peak, self._queue.qsize())

    async def _run(self) -> None:
        while True:
            work = await self._queue.get()
            self._is_writing = True
            started_at = perf_counter()
            try:
                await asyncio.to_thread(self._write, work)
                if isinstance(work, _WritePoints):
                    self._completed_batches += 1
            except Exception:
                self._failed_writes += 1
                logger.exception(
                    "Failed to persist race recorder work: %s", type(work).__name__
                )
            finally:
                self._last_write_duration_ms = (perf_counter() - started_at) * 1000.0
                self._is_writing = False
                self._queue.task_done()

    def _write(self, work: PersistenceWork) -> None:
        if isinstance(work, _CreateSession):
            self._store.create_session(
                session_id=work.session_id,
                car_ordinal=work.car_ordinal,
                car_name=work.car_name,
                car_class=work.car_class,
                car_pi=work.car_pi,
                start_time=work.start_time,
            )
        elif isinstance(work, _WritePoints):
            self._store.insert_points_batch(work.session_id, work.points)
        else:
            self._store.finalize_session(work.session_id)


class RaceRecorder:
    """Maintain race recording state while delegating all database work."""

    def __init__(
        self,
        persistence: AsyncRacePersistence,
        app_settings: Mapping[str, Any],
        car_database: Mapping[str, Mapping[str, Any]],
    ):
        self._persistence = persistence
        self._app_settings = app_settings
        self._car_database = car_database
        self.is_recording = False
        self.manual_mode = False
        self.current_session_id: str | None = None
        self.in_memory_batch: list[dict[str, Any]] = []
        self.first_timestamp: float | None = None
        self.last_sample_time = 0.0
        self.max_samples = 50000
        self.downsample_interval = 0.1
        self.lap_start_times: dict[int, float] = {}
        self.total_count = 0

    def clear(self) -> None:
        """Discard only in-memory recorder state; queued database work is retained."""
        self.is_recording = False
        self.manual_mode = False
        self.current_session_id = None
        self.in_memory_batch = []
        self.first_timestamp = None
        self.last_sample_time = 0.0
        self.lap_start_times = {}
        self.total_count = 0

    def start_manual(self) -> str:
        """Start a manual recording session and submit its session metadata."""
        self.clear()
        self.manual_mode = True
        self.is_recording = True
        self.current_session_id = f"session_{int(time.time())}"
        self._persistence.enqueue_session_start(
            session_id=self.current_session_id,
            car_ordinal=0,
            car_name="Manual Session",
            car_class=0,
            car_pi=0,
            start_time=time.time(),
        )
        return self.current_session_id

    def record(self, data: dict[str, Any]) -> None:
        """Capture a downsampled point without synchronously touching SQLite."""
        if not self._app_settings.get("race_recording", True):
            if self.is_recording:
                self.clear()
            return

        is_race_on = data.get("IsRaceOn", 0) == 1
        current_race_time = data.get("CurrentRaceTime", 0.0)
        current_lap = data.get("CurrentLap", data.get("LapNumber", 0))
        is_race_active = self.manual_mode or (
            is_race_on and current_race_time > 0.0 and current_lap > 0
        )

        if not is_race_active:
            if self.is_recording:
                self.save_latest_and_clear()
            return

        if not self.is_recording:
            self._start_automatic_session(data)

        now = time.time()
        if now - self.last_sample_time < self.downsample_interval:
            return
        if self.total_count >= self.max_samples:
            self.is_recording = False
            return

        timestamp_ms = data.get("TimestampMS", 0)
        if self.first_timestamp is None:
            self.first_timestamp = timestamp_ms
        relative_time = (timestamp_ms - self.first_timestamp) / 1000.0
        current_lap = data.get("CurrentLap", 1)
        self.lap_start_times.setdefault(current_lap, relative_time)

        point = dict(data)
        point["time"] = round(relative_time, 2)
        self.in_memory_batch.append(point)
        self.total_count += 1
        self.last_sample_time = now

        if len(self.in_memory_batch) >= 50:
            self._flush_batch()

    def save_latest_and_clear(self) -> None:
        """Queue the final batch and SQLite summary work, then clear local state."""
        session_id = self.current_session_id
        if not session_id:
            self.clear()
            return
        self._flush_batch()
        self._persistence.enqueue_finalize(session_id)
        self.clear()

    def _start_automatic_session(self, data: Mapping[str, Any]) -> None:
        self.clear()
        self.is_recording = True
        self.current_session_id = f"session_{int(time.time())}"
        car_ordinal = data.get("CarOrdinal", 0)
        car_info = self._car_database.get(str(car_ordinal), {})
        car_name = " ".join(
            str(car_info.get(field, "")) for field in ("year", "make", "model")
        ).strip()
        if not car_name:
            car_name = f"Car #{car_ordinal}" if car_ordinal > 0 else "Unknown Car"
        self._persistence.enqueue_session_start(
            session_id=self.current_session_id,
            car_ordinal=car_ordinal,
            car_name=car_name,
            car_class=data.get("CarClass", 0),
            car_pi=data.get("CarPerformanceIndex", 0),
            start_time=time.time(),
        )
        logger.info(
            "Started new telemetry recording session: %s", self.current_session_id
        )

    def _flush_batch(self) -> None:
        if not self.in_memory_batch or not self.current_session_id:
            return
        batch_to_write = self.in_memory_batch
        self.in_memory_batch = []
        self._persistence.enqueue_points(self.current_session_id, batch_to_write)
