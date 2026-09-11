"""Descriptive Drag telemetry observations. No vehicle optimum or causal score is inferred."""

import math
from typing import Any

from telemetry_contract import finite

DRAG_ANALYSIS_VERSION = "drag-observations/v1"
MAX_OBSERVATION_GAP_SECONDS = 0.5
MIN_DRIVING_SPEED_MS = 0.5  # lower threshold for launch detection


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
            if finite(speed) and speed >= MIN_DRIVING_SPEED_MS:
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
    result["mean"] = sum(value * weight for value, weight in pairs) / exposure
    for key, fraction in (("p05", 0.05), ("p50", 0.5), ("p95", 0.95)):
        accumulated = 0.0
        for value, weight in pairs:
            accumulated += weight
            if accumulated >= fraction * exposure:
                result[key] = value
                break
    return result


def _launch_analysis(points: list[dict]) -> dict:
    """Analyse launch slip and wheelspin during the first 2 s of forward movement."""
    launch_slips: list[float] = []
    wheelspin_seconds = 0.0
    launch_window_end: float | None = None

    for index, point in enumerate(points):
        speed = point.get("SpeedMetersPerSecond")
        race_time = point.get("CurrentRaceTime")
        if not finite(speed) or not finite(race_time):
            continue
        # Detect start of race
        if race_time is not None and race_time < 0:
            launch_window_end = None
            continue
        if launch_window_end is None and race_time is not None and race_time >= 0:
            launch_window_end = race_time + 2.0
        if (
            launch_window_end is not None
            and race_time is not None
            and race_time > launch_window_end
        ):
            break
        slips = point.get("TireSlipRatio") or point.get("TireCombinedSlip")
        if isinstance(slips, (list, tuple)) and len(slips) >= 2:
            # rear wheels for RWD, all for AWD
            rear_slips = [s for s in slips[2:] if finite(s)]
            if rear_slips:
                mean_slip = sum(rear_slips) / len(rear_slips)
                launch_slips.append(mean_slip)
                if index < len(points) - 1:
                    t_a = point_time(point)
                    t_b = point_time(points[index + 1])
                    if t_a is not None and t_b is not None:
                        dt = t_b - t_a
                        if 0 < dt <= MAX_OBSERVATION_GAP_SECONDS and mean_slip > 0.1:
                            wheelspin_seconds += dt

    peak_slip = max(launch_slips) if launch_slips else None
    mean_slip = sum(launch_slips) / len(launch_slips) if launch_slips else None
    return {
        "peakSlipRatio": peak_slip,
        "meanSlipRatio": mean_slip,
        "wheelspinDurationSeconds": wheelspin_seconds,
        "sampleCount": len(launch_slips),
    }


def _gear_acceleration_curves(points: list[dict]) -> list[dict]:
    """Per-gear mean speed and acceleration samples."""
    gear_samples: dict[int, list[tuple[float, float]]] = {}
    prev_speed: float | None = None
    prev_time: float | None = None

    for point in points:
        gear = point.get("Gear")
        speed = point.get("SpeedMetersPerSecond")
        t = point_time(point)
        accel_input = point.get("Accel")
        if not finite(gear) or not finite(speed) or t is None:
            prev_speed, prev_time = None, None
            continue
        gear = int(gear)
        if gear <= 0:
            prev_speed, prev_time = speed, t
            continue
        if (
            prev_speed is not None
            and prev_time is not None
            and t > prev_time
            and t - prev_time <= MAX_OBSERVATION_GAP_SECONDS
            and accel_input is not None
            and accel_input > 200  # raw accel input > ~78% throttle
        ):
            accel = (speed - prev_speed) / (t - prev_time)
            gear_samples.setdefault(gear, []).append((speed * 3.6, accel))
        prev_speed, prev_time = speed, t

    result = []
    for gear in sorted(gear_samples):
        samples = gear_samples[gear]
        speeds = [s for s, _ in samples]
        accels = [a for _, a in samples]
        result.append(
            {
                "gear": gear,
                "meanSpeedKmh": sum(speeds) / len(speeds) if speeds else None,
                "meanAccelerationMss": sum(accels) / len(accels) if accels else None,
                "sampleCount": len(samples),
            }
        )
    return result


def _shift_analysis(points: list[dict]) -> list[dict]:
    """Detect gear changes and measure RPM drop and power continuity."""
    shifts = []
    for index in range(1, len(points)):
        prev_p, curr_p = points[index - 1], points[index]
        prev_gear = prev_p.get("Gear")
        curr_gear = curr_p.get("Gear")
        if not finite(prev_gear) or not finite(curr_gear):
            continue
        prev_gear, curr_gear = int(prev_gear), int(curr_gear)
        if curr_gear != prev_gear + 1:
            continue
        t_prev = point_time(prev_p)
        t_curr = point_time(curr_p)
        if t_prev is None or t_curr is None or t_curr - t_prev > 0.5:
            continue
        rpm_before = prev_p.get("CurrentEngineRpm")
        rpm_after = curr_p.get("CurrentEngineRpm")
        if not finite(rpm_before) or not finite(rpm_after):
            continue
        rpm_drop = rpm_before - rpm_after
        retention = rpm_after / rpm_before if rpm_before > 0 else None
        shifts.append(
            {
                "fromGear": prev_gear,
                "toGear": curr_gear,
                "rpmBefore": rpm_before,
                "rpmAfter": rpm_after,
                "rpmDrop": rpm_drop,
                "rpmRetentionRatio": retention,
                "shiftDurationSeconds": t_curr - t_prev,
            }
        )
    return shifts


def _sprint_milestones(points: list[dict]) -> dict:
    """0-100 km/h, 0-200 km/h, and 0-400m timing."""
    race_start: float | None = None
    t_100: float | None = None
    t_200: float | None = None
    t_400m: float | None = None
    dist_start: float | None = None

    for point in points:
        speed = point.get("SpeedMetersPerSecond")
        race_time = point.get("CurrentRaceTime")
        distance = point.get("DistanceTraveled")
        t = point_time(point)
        if not finite(speed) or not finite(race_time) or t is None:
            continue
        if race_time < 0:
            continue
        if race_start is None and race_time >= 0 and speed is not None and speed < 1.0:
            race_start = t
            if finite(distance):
                dist_start = distance
        if race_start is None:
            continue
        elapsed = t - race_start
        speed_kmh = speed * 3.6 if speed is not None else 0.0
        if t_100 is None and speed_kmh >= 100:
            t_100 = elapsed
        if t_200 is None and speed_kmh >= 200:
            t_200 = elapsed
        if t_400m is None and dist_start is not None and finite(distance):
            if distance - dist_start >= 400:
                t_400m = elapsed

    return {
        "zeroTo100KmhSeconds": t_100,
        "zeroTo200KmhSeconds": t_200,
        "zeroTo400mSeconds": t_400m,
    }


def summarize_drag_observations(points: list[dict]) -> dict[str, Any]:
    weights, quality = observation_weights(points)

    speeds_kmh = [
        p.get("SpeedMetersPerSecond", 0) * 3.6
        if finite(p.get("SpeedMetersPerSecond"))
        else None
        for p in points
    ]
    speed_dist = _distribution(speeds_kmh, weights)

    rpms = [p.get("CurrentEngineRpm") for p in points]
    rpm_dist = _distribution(rpms, weights)

    race_times = [
        p["CurrentRaceTime"]
        for p in points
        if finite(p.get("CurrentRaceTime")) and p.get("IsRaceOn") == 1
    ]

    return {
        "methodVersion": DRAG_ANALYSIS_VERSION,
        "sampleCount": len(points),
        "quality": quality,
        "launch": _launch_analysis(points),
        "gearCurves": _gear_acceleration_curves(points),
        "shifts": _shift_analysis(points),
        "milestones": _sprint_milestones(points),
        "speed": speed_dist,
        "engineRpm": rpm_dist,
        "raceTimeCoverage": {
            "firstSeconds": race_times[0] if race_times else None,
            "lastSeconds": race_times[-1] if race_times else None,
        },
        "maxSpeedKmh": max((s for s in speeds_kmh if s is not None), default=None),
    }
