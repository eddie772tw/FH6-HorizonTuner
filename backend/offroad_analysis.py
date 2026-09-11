"""Descriptive Offroad / Rally observations. No vehicle optimum or causal score is inferred."""

import math
from collections import defaultdict
from typing import Any

from telemetry_contract import finite

OFFROAD_ANALYSIS_VERSION = "offroad-observations/v1"
MAX_OBSERVATION_GAP_SECONDS = 0.5
LAP_START_TOLERANCE_SECONDS = 0.5
WHEELS = ("FL", "FR", "RL", "RR")
GRAVITY = 9.80665


def point_time(point: dict) -> float | None:
    value = point.get("TimestampMS")
    if finite(value):
        return value / 1000
    value = point.get("time")
    return value if finite(value) else None


def wheel_value(point: dict, field: str, wheel: int) -> float | None:
    values = point.get(field)
    if field == "NormalizedSuspensionTravel" and not isinstance(values, (list, tuple)):
        values = point.get("SuspTravel")
    if (
        isinstance(values, (list, tuple))
        and wheel < len(values)
        and finite(values[wheel])
    ):
        return values[wheel]
    return None


def driving(point: dict) -> bool:
    return (
        point.get("IsRaceOn") != 0
        and finite(point.get("SpeedMetersPerSecond"))
        and point["SpeedMetersPerSecond"] > 2
    )


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
        elif driving(a) and driving(b):
            weights[index] = elapsed
    return weights, {
        "observedSeconds": sum(weights),
        "gapSeconds": gaps,
        "duplicateTimestamps": duplicates,
        "timestampRegressions": regressions,
        "missingTimeIntervals": missing_time,
    }


def distribution(values: list[float | None], weights: list[float]) -> dict:
    pairs = sorted(
        (value, weight)
        for value, weight in zip(values, weights)
        if finite(value) and weight > 0
    )
    exposure = sum(weight for _, weight in pairs)
    result = {
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


def events(
    values: list[float | None],
    weights: list[float],
    *,
    above: float | None = None,
    below: float | None = None,
    strict: bool = False,
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
        active = (
            above is not None and (value > above if strict else value >= above)
        ) or (below is not None and value <= below)
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


def summarize_laps(points: list[dict]) -> list[dict]:
    groups: dict[int, list[dict]] = defaultdict(list)
    starts: set[int] = set()
    times: dict[int, float] = {}
    pending: int | None = None
    previous_lap: int | None = None
    previous_last: float | None = None
    for point in points:
        index = point.get("LapNumber")
        if not finite(index) or index < 0 or int(index) != index:
            continue
        index = int(index)
        current = point.get("CurrentLap")
        last = point.get("LastLap")
        if previous_lap is not None and index < previous_lap:
            break
        if previous_lap is not None and index > previous_lap:
            pending = previous_lap if index == previous_lap + 1 else None
        if pending is not None and finite(last) and last > 0 and last != previous_last:
            times[pending] = last
            pending = None
        if finite(last):
            previous_last = last
        previous_lap = index
        if point.get("IsRaceOn") == 0:
            continue
        groups[index].append(point)
        if finite(current) and 0 <= current <= LAP_START_TOLERANCE_SECONDS:
            starts.add(index)
    result = []
    for index, group in sorted(groups.items()):
        times_seen = [
            time for point in group if (time := point_time(point)) is not None
        ]
        speeds = [
            p["SpeedMetersPerSecond"] * 3.6
            for p in group
            if finite(p.get("SpeedMetersPerSecond"))
        ]
        weights, quality = observation_weights(group)
        weighted_speed = distribution(
            [p.get("SpeedMetersPerSecond") for p in group], weights
        )["mean"]
        result.append(
            {
                "lapIndex": index,
                "lapNumber": index + 1,
                "lapTimeSeconds": times.get(index),
                "lapTimeSource": "game-lastlap" if index in times else "unavailable",
                "startObserved": index in starts,
                "endObserved": index in times,
                "complete": index in starts and index in times,
                "observedSpanSeconds": max(times_seen) - min(times_seen)
                if times_seen
                else None,
                "maxSpeedKmh": max(speeds) if speeds else None,
                "meanSpeedKmh": weighted_speed * 3.6
                if weighted_speed is not None
                else None,
                **quality,
            }
        )
    return result


def summarize_sprint(points: list[dict], weights: list[float]) -> dict:
    times_seen = [
        time
        for p, w in zip(points, weights)
        if w > 0 and (time := point_time(p)) is not None
    ]
    speeds = [
        p["SpeedMetersPerSecond"] * 3.6
        for p, w in zip(points, weights)
        if w > 0 and finite(p.get("SpeedMetersPerSecond"))
    ]
    distances = [
        p["DistanceTraveled"]
        for p, w in zip(points, weights)
        if w > 0 and finite(p.get("DistanceTraveled"))
    ]
    race_times = [
        p["CurrentRaceTime"]
        for p in points
        if finite(p.get("CurrentRaceTime")) and p.get("IsRaceOn") == 1
    ]
    mean_speed = distribution([p.get("SpeedMetersPerSecond") for p in points], weights)[
        "mean"
    ]

    return {
        "observedSpanSeconds": max(times_seen) - min(times_seen)
        if times_seen
        else None,
        "distanceTraveledMeters": max(distances) - min(distances)
        if distances
        else None,
        "startObserved": bool(race_times and race_times[0] <= 0.5),
        "endObserved": bool(points and points[-1].get("IsRaceOn") in (0, 1)),
        "maxSpeedKmh": max(speeds) if speeds else None,
        "meanSpeedKmh": mean_speed * 3.6 if mean_speed is not None else None,
    }


def summarize_offroad_observations(points: list[dict]) -> dict[str, Any]:
    weights, quality = observation_weights(points)
    initial_index = next((i for i, weight in enumerate(weights) if weight > 0), None)
    wheels = {}

    for index, wheel in enumerate(WHEELS):
        temperatures = [wheel_value(p, "TireTemp", index) for p in points]
        temperatures_c = [
            (value - 32) * 5 / 9 if value is not None else None
            for value in temperatures
        ]
        travel = [wheel_value(p, "NormalizedSuspensionTravel", index) for p in points]
        travel_m = [wheel_value(p, "SuspensionTravelMeters", index) for p in points]

        valid_travel = [v for v, w in zip(travel, weights) if w > 0 and finite(v)]
        peak_travel_pct = max(valid_travel) * 100 if valid_travel else None

        total = sum(weights)
        edge = min(10.0, total / 3)
        end_weights = []
        cumulative = 0.0
        for weight in weights:
            end_weights.append(
                max(0.0, min(weight, cumulative + weight - (total - edge)))
            )
            cumulative += weight

        start = temperatures_c[initial_index] if initial_index is not None else None
        end = distribution(temperatures_c, end_weights)
        change = (
            end["mean"] - start
            if start is not None and end["mean"] is not None
            else None
        )

        wheels[wheel] = {
            "temperatureC": distribution(temperatures_c, weights),
            "startTemperatureC": start,
            "endTemperatureC": end["mean"],
            "temperatureChangeC": change,
            "normalizedTravel": distribution(travel, weights),
            "travelMeters": distribution(travel_m, weights),
            "peakTravelPct": peak_travel_pct,
            "nearCompression": events(travel, weights, above=0.95),
            "severeBottoming": events(travel, weights, above=0.98),
            "nearExtension": events(travel, weights, below=0.05),
        }

    # Terrain roughness RMS from SurfaceRumble
    rumble_sq_sum = 0.0
    rumble_weight_sum = 0.0
    impact_gs = []
    airborne_flags = []
    pitch_values = []
    roll_values = []

    for point, weight in zip(points, weights):
        if weight <= 0:
            airborne_flags.append(None)
            continue

        rumbles = [wheel_value(point, "SurfaceRumble", w) for w in range(4)]
        valid_rumbles = [r for r in rumbles if r is not None]
        if valid_rumbles:
            mean_r = sum(valid_rumbles) / len(valid_rumbles)
            rumble_sq_sum += (mean_r**2) * weight
            rumble_weight_sum += weight

        acc_y = point.get("AccelerationY")
        if finite(acc_y):
            impact_gs.append(abs(acc_y) / GRAVITY)

        # Airborne detection: all 4 wheels extended (mean travel <= 0.08)
        travels = [
            wheel_value(point, "NormalizedSuspensionTravel", w) for w in range(4)
        ]
        valid_t = [t for t in travels if t is not None]
        if valid_t and (sum(valid_t) / len(valid_t)) <= 0.08:
            airborne_flags.append(1.0)
        else:
            airborne_flags.append(0.0)

        pitch = point.get("Pitch")
        if finite(pitch):
            pitch_values.append(pitch * 180 / math.pi)
        roll = point.get("Roll")
        if finite(roll):
            roll_values.append(roll * 180 / math.pi)

    rumble_rms = (
        math.sqrt(rumble_sq_sum / rumble_weight_sum) if rumble_weight_sum > 0 else 0.0
    )
    max_impact_g = max(impact_gs) if impact_gs else None
    avg_impact_g = sum(impact_gs) / len(impact_gs) if impact_gs else None

    airborne_events = events(airborne_flags, weights, above=0.5)

    def std_dev(vals: list[float]) -> float:
        if len(vals) < 2:
            return 0.0
        m = sum(vals) / len(vals)
        return math.sqrt(sum((v - m) ** 2 for v in vals) / (len(vals) - 1))

    return {
        "methodVersion": OFFROAD_ANALYSIS_VERSION,
        "sampleCount": len(points),
        "quality": quality,
        "wheels": wheels,
        "airborne": {
            "count": airborne_events["count"] or 0,
            "totalAirtimeSeconds": airborne_events["seconds"] or 0.0,
            "longestAirtimeSeconds": airborne_events["longestSeconds"] or 0.0,
        },
        "landing": {
            "maxImpactG": max_impact_g,
            "averageImpactG": avg_impact_g,
        },
        "terrain": {
            "surfaceRoughnessRms": rumble_rms,
            "pitchStdDevDeg": std_dev(pitch_values),
            "rollStdDevDeg": std_dev(roll_values),
        },
        "laps": summarize_laps(points),
        "sprint": summarize_sprint(points, weights),
    }
