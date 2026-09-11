"""Descriptive Drift telemetry observations.
All metrics are kinematic descriptions only; no causal drift optimum is claimed.
Unmodeled variables (surface grip, aerodynamics, driver input style) are declared explicitly.
"""

import math
from typing import Any

from telemetry_contract import finite

DRIFT_ANALYSIS_VERSION = "drift-observations/v1"
MAX_OBSERVATION_GAP_SECONDS = 0.5
SLIP_ANGLE_THRESHOLD_DEG = 5.0  # above which rear is considered in sustained slide
WHEELS = ("FL", "FR", "RL", "RR")
GRAVITY = 9.80665

UNMODELED_VARIABLES = [
    "Surface grip coefficient is not measured; telemetry SlipRatio is a normalized signal, not a full tire curve.",
    "Driver input style (throttle modulation, steering angle) is not isolated from setup effects.",
    "Aerodynamic loads and weight transfer dynamics are not reconstructed from telemetry.",
    "No cross-vehicle or cross-condition calibration exists for slip angle thresholds.",
]


def point_time(point: dict) -> float | None:
    value = point.get("TimestampMS")
    if finite(value):
        return value / 1000
    value = point.get("time")
    return value if finite(value) else None


def observation_weights(points: list[dict]) -> tuple[list[float], dict]:
    weights = [0.0] * len(points)
    gaps = 0.0
    duplicates = 0
    regressions = 0
    missing_time = 0
    for index in range(len(points) - 1):
        a, b = points[index], points[index + 1]
        start, end = point_time(a), point_time(b)
        if start is None or end is None:
            missing_time += 1
            continue
        elapsed = end - start
        if elapsed == 0:
            duplicates += 1
        elif elapsed < 0:
            regressions += 1
        elif elapsed > MAX_OBSERVATION_GAP_SECONDS:
            gaps += elapsed
        else:
            speed = a.get("SpeedMetersPerSecond")
            if finite(speed) and speed > 2:
                weights[index] = elapsed
    return weights, {
        "observedSeconds": sum(weights),
        "gapSeconds": gaps,
        "duplicateTimestamps": duplicates,
        "timestampRegressions": regressions,
        "missingTimeIntervals": missing_time,
    }


def _distribution(values: list[float | None], weights: list[float]) -> dict:
    pairs = sorted(
        (value, weight)
        for value, weight in zip(values, weights)
        if finite(value) and weight > 0
    )
    exposure = sum(weight for _, weight in pairs)
    result: dict = {
        "observedSeconds": exposure,
        "mean": None,
        "p05": None,
        "p50": None,
        "p95": None,
    }
    if not exposure:
        return result
    result["mean"] = sum(v * w for v, w in pairs) / exposure
    for key, fraction in (("p05", 0.05), ("p50", 0.5), ("p95", 0.95)):
        accumulated = 0.0
        for value, weight in pairs:
            accumulated += weight
            if accumulated >= fraction * exposure:
                result[key] = value
                break
    return result


def _events(
    values: list[float | None],
    weights: list[float],
    *,
    above: float | None = None,
    below: float | None = None,
) -> dict:
    count = 0
    total = 0.0
    longest = 0.0
    current = 0.0
    valid = 0.0
    for value, weight in zip(values, weights):
        if weight <= 0 or not finite(value):
            current = 0.0
            continue
        valid += weight
        active = (above is not None and value >= above) or (
            below is not None and value <= below
        )
        if not active:
            current = 0.0
            continue
        if current == 0:
            count += 1
        current += weight
        total += weight
        longest = max(longest, current)
    return {
        "count": count if valid else None,
        "seconds": total if valid else None,
        "longestSeconds": longest if valid else None,
        "observedSeconds": valid,
    }


def _yaw_rate_analysis(points: list[dict], weights: list[float]) -> dict:
    """Compute yaw rate distribution from AngularVelocityZ (rad/s)."""
    yaw_rates = [
        abs(p.get("AngularVelocityZ")) if finite(p.get("AngularVelocityZ")) else None
        for p in points
    ]
    dist = _distribution(yaw_rates, weights)
    high_yaw = _events(yaw_rates, weights, above=0.5)
    return {
        "distribution": dist,
        "highYawEvents": high_yaw,
        "note": "AngularVelocityZ in rad/s; absolute value used. Threshold 0.5 rad/s is an engineering heuristic, not a calibrated grip limit.",
    }


def _sideslip_proxy(points: list[dict], weights: list[float]) -> dict:
    """Approximate sideslip using rear slip vs front slip differential.
    This is a proxy observation, not a validated sideslip model.
    """
    proxy_values = []
    for point in points:
        slips = point.get("TireSlipRatio") or point.get("TireCombinedSlip")
        if not isinstance(slips, (list, tuple)) or len(slips) < 4:
            proxy_values.append(None)
            continue
        fl, fr, rl, rr = slips[:4]
        front = (fl + fr) / 2 if finite(fl) and finite(fr) else None
        rear = (rl + rr) / 2 if finite(rl) and finite(rr) else None
        if front is not None and rear is not None:
            proxy_values.append(rear - front)
        else:
            proxy_values.append(None)
    dist = _distribution(proxy_values, weights)
    slide_events = _events(proxy_values, weights, above=0.1)
    return {
        "rearMinusFrontSlipDistribution": dist,
        "sustainedSlideEvents": slide_events,
        "note": "Rear-minus-front slip ratio is a coarse proxy. Not a validated sideslip angle. Unmodeled variables include surface grip, load transfer, and driver inputs.",
    }


def _wheel_analysis(points: list[dict], weights: list[float]) -> dict:
    result = {}
    for index, wheel in enumerate(WHEELS):
        temperatures = [
            (v - 32) * 5 / 9
            if finite(v := (p.get("TireTemp") or [None, None, None, None])[index])
            else None
            for p in points
        ]
        slips = [
            s[index]
            if isinstance(s := p.get("TireSlipRatio"), (list, tuple))
            and len(s) > index
            and finite(s[index])
            else None
            for p in points
        ]
        result[wheel] = {
            "temperatureC": _distribution(temperatures, weights),
            "slipRatio": _distribution(slips, weights),
        }
    return result


def summarize_drift_observations(points: list[dict]) -> dict[str, Any]:
    weights, quality = observation_weights(points)
    race_times = [
        p["CurrentRaceTime"]
        for p in points
        if finite(p.get("CurrentRaceTime")) and p.get("IsRaceOn") == 1
    ]
    return {
        "methodVersion": DRIFT_ANALYSIS_VERSION,
        "sampleCount": len(points),
        "quality": quality,
        "yawRate": _yaw_rate_analysis(points, weights),
        "sideslipProxy": _sideslip_proxy(points, weights),
        "wheels": _wheel_analysis(points, weights),
        "raceTimeCoverage": {
            "firstSeconds": race_times[0] if race_times else None,
            "lastSeconds": race_times[-1] if race_times else None,
        },
        "unmodeledVariables": UNMODELED_VARIABLES,
        "limitationNote": "All drift observations are descriptive kinematic summaries. No causal relationship between telemetry and drift score is established.",
    }
