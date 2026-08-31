"""Timestamp-led data quality gate for dyno sampling.

The gate deliberately reports collection quality rather than vehicle truth.  Its
only clock is the telemetry packet timestamp; persistence and UI clocks do not
participate in acceptance decisions.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import dist, isfinite, sqrt
from statistics import median
from typing import Any

TIMESTAMP_CADENCE_MULTIPLIER = 5
POSITION_MEASUREMENT_FLOOR_METERS = 0.5
POSITION_SPEED_TOLERANCE_MULTIPLIER = 2
CONFIDENT_SAMPLE_COUNT = 8


def _finite_number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    return numeric if isfinite(numeric) else None


def vehicle_profile_fingerprint(frame: dict[str, Any]) -> tuple[int, int, int] | None:
    """Return only parser-observable vehicle identity fields, or ``None``.

    This is an identity boundary for collected samples, not an assertion that
    the fields uniquely identify an FH6 build or installed parts.
    """
    values = (
        _finite_number(frame.get("CarOrdinal")),
        _finite_number(frame.get("CarClass")),
        _finite_number(frame.get("CarPerformanceIndex")),
    )
    if any(value is None for value in values):
        return None
    return tuple(int(value) for value in values)  # type: ignore[arg-type]


@dataclass(frozen=True)
class DynoQualityAssessment:
    status: str
    confidence: float
    reasons: tuple[str, ...]
    can_collect: bool
    segment_reset: bool = False
    segment_id: int = 0
    previous_fingerprint: tuple[int, int, int] | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "confidence": self.confidence,
            "reasons": list(self.reasons),
            "canCollect": self.can_collect,
            "segmentId": self.segment_id,
            "segmentReset": self.segment_reset,
        }


class DynoQualityGate:
    """Track one telemetry stream without relying on wall-clock timing.

    Timestamp discontinuity is detected relative to the stream's own observed
    cadence.  Position discontinuity compares travelled position against the
    parser's SI speed fields, using a small measurement floor rather than a
    game-specific speed, latency, or tuning threshold.
    """

    def __init__(self) -> None:
        self._fingerprint: tuple[int, int, int] | None = None
        self._previous_timestamp_ms: float | None = None
        self._previous_position: tuple[float, float, float] | None = None
        self._previous_speed_mps: float | None = None
        self._positive_deltas_ms: list[float] = []
        self._stable_samples = 0
        self._segment_id = 0
        self._last_gear: int | None = None
        self._last_gear_change_timestamp_ms: float | None = None

    def observe(self, frame: dict[str, Any]) -> DynoQualityAssessment:
        fingerprint = vehicle_profile_fingerprint(frame)
        if (
            fingerprint is not None
            and self._fingerprint is not None
            and fingerprint != self._fingerprint
        ):
            previous = self._fingerprint
            self._start_segment(fingerprint)
            return DynoQualityAssessment(
                status="unavailable",
                confidence=0.0,
                reasons=("vehicle-profile-changed",),
                can_collect=False,
                segment_reset=True,
                segment_id=self._segment_id,
                previous_fingerprint=previous,
            )
        if fingerprint is not None and self._fingerprint is None:
            self._fingerprint = fingerprint

        timestamp_ms = _finite_number(frame.get("TimestampMS"))
        if timestamp_ms is None:
            return DynoQualityAssessment(
                status="unavailable",
                confidence=0.0,
                reasons=("timestamp-unavailable",),
                can_collect=False,
                segment_id=self._segment_id,
            )

        reasons: list[str] = []
        if self._previous_timestamp_ms is not None:
            delta_ms = timestamp_ms - self._previous_timestamp_ms
            if delta_ms <= 0:
                reasons.append("timestamp-non-monotonic")
            elif (
                self._positive_deltas_ms
                and delta_ms
                > median(self._positive_deltas_ms) * TIMESTAMP_CADENCE_MULTIPLIER
            ):
                reasons.append("timestamp-discontinuity")
            else:
                self._positive_deltas_ms = (self._positive_deltas_ms + [delta_ms])[-8:]

        position = self._position(frame)
        speed_mps = self._speed_mps(frame)
        if not reasons and self._previous_position is not None and position is not None:
            elapsed_seconds = (
                (timestamp_ms - self._previous_timestamp_ms) / 1000
                if self._previous_timestamp_ms is not None
                else 0
            )
            if elapsed_seconds > 0 and self._position_jump(
                position, speed_mps, elapsed_seconds
            ):
                reasons.append("position-discontinuity")

        self._previous_timestamp_ms = timestamp_ms
        self._previous_position = position
        self._previous_speed_mps = speed_mps
        self._observe_gear(frame, timestamp_ms)

        if reasons:
            self._stable_samples = 0
            return DynoQualityAssessment(
                status="suspect",
                confidence=0.0,
                reasons=tuple(reasons),
                can_collect=False,
                segment_id=self._segment_id,
            )

        self._stable_samples += 1
        confidence = round(min(1.0, self._stable_samples / CONFIDENT_SAMPLE_COUNT), 2)
        return DynoQualityAssessment(
            status="confident"
            if self._stable_samples >= CONFIDENT_SAMPLE_COUNT
            else "observing",
            confidence=confidence,
            reasons=(),
            can_collect=True,
            segment_id=self._segment_id,
        )

    def milliseconds_since_gear_change(self, timestamp_ms: Any) -> float | None:
        timestamp = _finite_number(timestamp_ms)
        if timestamp is None or self._last_gear_change_timestamp_ms is None:
            return None
        return timestamp - self._last_gear_change_timestamp_ms

    def _start_segment(self, fingerprint: tuple[int, int, int]) -> None:
        self._fingerprint = fingerprint
        self._previous_timestamp_ms = None
        self._previous_position = None
        self._previous_speed_mps = None
        self._positive_deltas_ms = []
        self._stable_samples = 0
        self._last_gear = None
        self._last_gear_change_timestamp_ms = None
        self._segment_id += 1

    def _observe_gear(self, frame: dict[str, Any], timestamp_ms: float) -> None:
        gear = _finite_number(frame.get("Gear"))
        if gear is None:
            return
        rounded_gear = int(gear)
        if self._last_gear is not None and rounded_gear != self._last_gear:
            self._last_gear_change_timestamp_ms = timestamp_ms
        self._last_gear = rounded_gear

    @staticmethod
    def _position(frame: dict[str, Any]) -> tuple[float, float, float] | None:
        values = tuple(
            _finite_number(frame.get(key))
            for key in ("PositionX", "PositionY", "PositionZ")
        )
        return values if all(value is not None for value in values) else None  # type: ignore[return-value]

    @staticmethod
    def _speed_mps(frame: dict[str, Any]) -> float | None:
        speed = _finite_number(frame.get("SpeedMetersPerSecond"))
        if speed is not None and speed >= 0:
            return speed
        velocity = tuple(
            _finite_number(frame.get(key))
            for key in ("VelocityX", "VelocityY", "VelocityZ")
        )
        if all(value is not None for value in velocity):
            return sqrt(sum(value * value for value in velocity))  # type: ignore[operator]
        return None

    def _position_jump(
        self,
        position: tuple[float, float, float],
        speed_mps: float | None,
        elapsed_seconds: float,
    ) -> bool:
        if self._previous_position is None:
            return False
        speeds = [
            speed
            for speed in (self._previous_speed_mps, speed_mps)
            if speed is not None
        ]
        if not speeds:
            return False
        expected_distance = max(speeds) * elapsed_seconds
        permitted_distance = max(
            POSITION_MEASUREMENT_FLOOR_METERS,
            expected_distance * POSITION_SPEED_TOLERANCE_MULTIPLIER,
        )
        return dist(self._previous_position, position) > permitted_distance


class DynoQualityGateRegistry:
    """Keep timestamp and fingerprint state isolated by persisted car profile."""

    def __init__(self) -> None:
        self._gates: dict[str, DynoQualityGate] = {}

    def observe(self, car_id: str, frame: dict[str, Any]) -> DynoQualityAssessment:
        return self._gates.setdefault(car_id, DynoQualityGate()).observe(frame)

    def milliseconds_since_gear_change(
        self, car_id: str, timestamp_ms: Any
    ) -> float | None:
        gate = self._gates.get(car_id)
        return gate.milliseconds_since_gear_change(timestamp_ms) if gate else None

    def discard(self, car_id: str) -> None:
        self._gates.pop(car_id, None)


def reconcile_dyno_profile_segment(
    profile: dict[str, Any], quality: DynoQualityAssessment
) -> bool:
    """Apply a same-profile reset and retain the bounded prior curve.

    This remains a segmentation boundary even while dyno collection is paused.
    """
    profile["dyno_quality"] = quality.as_dict()
    if not quality.segment_reset:
        return False

    previous_curve = profile.get("dyno_curve", {})
    if previous_curve:
        segments = profile.setdefault("dyno_curve_segments", [])
        segments.append(
            {
                "fingerprint": list(quality.previous_fingerprint or ()),
                "curve": previous_curve,
                "ended_reason": "vehicle-profile-changed",
            }
        )
        del segments[:-5]
    profile["dyno_curve"] = {}
    return True
