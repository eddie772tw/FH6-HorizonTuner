"""Bounded spatial matching for descriptive Road comparisons, run off the packet path."""

import math
from collections import defaultdict

from road_analysis import observation_weights, wheel_value
from telemetry_contract import finite

MATCH_VERSION = "road-spatial/v1"
# Conservative observation tolerances, not a calibrated handling model. The
# report exposes these rules and withheld samples; no causal claim follows.
CELL_METERS = 20
MATCH_METERS = 8
ROUTE_COVERAGE_MIN = 0.8
MAX_MATCH_POINTS = 4000


def spatial_points(points: list[dict], circuit: bool) -> list[dict]:
    weights, _ = observation_weights(points)
    result = []
    # Full input determines weights. A stride bounds offline matching cost;
    # matched durations are exposure estimates, not event reconstruction.
    stride = max(1, math.ceil(len(points) / MAX_MATCH_POINTS))
    distance_along = 0.0
    for i in range(len(points) - 1):
        a, b = points[i], points[i + 1]
        if weights[i] <= 0 or not all(
            finite(p.get(k)) for p in (a, b) for k in ("PositionX", "PositionZ")
        ):
            continue
        dx, dz = b["PositionX"] - a["PositionX"], b["PositionZ"] - a["PositionZ"]
        length = math.hypot(dx, dz)
        if length <= 0.01:
            continue
        distance = distance_along
        distance_along += length
        if i % stride:
            continue
        lap = a.get("LapNumber") if circuit else 0
        if not finite(lap):
            continue
        result.append(
            {
                "point": a,
                "x": a["PositionX"],
                "z": a["PositionZ"],
                "y": a.get("PositionY"),
                "distance": distance,
                "dx": dx / length,
                "dz": dz / length,
                "lap": lap,
            }
        )
    return result


def matched_pairs(left: list[dict], right: list[dict]) -> list[tuple[dict, dict]]:
    grid = defaultdict(list)
    for i, p in enumerate(right):
        grid[
            (
                math.floor(p["x"] / CELL_METERS),
                math.floor(p["z"] / CELL_METERS),
                p["lap"],
            )
        ].append((i, p))
    pairs, used = [], set()
    for a in left:
        cx, cz = math.floor(a["x"] / CELL_METERS), math.floor(a["z"] / CELL_METERS)
        candidates = []
        for x in (cx - 1, cx, cx + 1):
            for z in (cz - 1, cz, cz + 1):
                for i, b in grid.get((x, z, a["lap"]), []):
                    if i in used or a["dx"] * b["dx"] + a["dz"] * b["dz"] < 0.9:
                        continue
                    if finite(a["y"]) and finite(b["y"]) and abs(a["y"] - b["y"]) > 3:
                        continue
                    distance = math.hypot(a["x"] - b["x"], a["z"] - b["z"])
                    if distance <= MATCH_METERS:
                        candidates.append((distance, i, b))
        if candidates:
            _, i, b = min(candidates, key=lambda item: (item[0], item[1]))
            used.add(i)
            pairs.append((a, b))
    return pairs


def local_comparison(a_points: list[dict], b_points: list[dict], circuit: bool) -> dict:
    a, b = spatial_points(a_points, circuit), spatial_points(b_points, circuit)
    pairs = matched_pairs(a, b)
    a_coverage, b_coverage = (
        len(pairs) / len(a) if a else 0,
        len(pairs) / len(b) if b else 0,
    )
    route_status = (
        "compatible"
        if min(a_coverage, b_coverage) >= ROUTE_COVERAGE_MIN and len(pairs) >= 20
        else "insufficient"
        if not a or not b
        else "different-or-incomplete"
    )
    comparable = []
    segments = {}
    segment_length = max(100.0, max((p["distance"] for p in a), default=0) / 10)
    for left, right in pairs:
        p, q = left["point"], right["point"]
        keys = ("SpeedMetersPerSecond", "AccelInput", "BrakeInput", "SteerInput")
        if not all(finite(s.get(k)) for s in (p, q) for k in keys):
            continue
        if abs(p[keys[0]] - q[keys[0]]) > max(2, p[keys[0]] * 0.08):
            continue
        if any(
            abs(p[k] - q[k]) > limit
            for k, limit in (("AccelInput", 25), ("BrakeInput", 25), ("SteerInput", 10))
        ):
            continue
        comparable.append((p, q))
        index = min(9, int(left["distance"] / segment_length))
        segment = segments.setdefault(
            index,
            {
                "index": index + 1,
                "fromMeters": index * segment_length,
                "toMeters": (index + 1) * segment_length,
                "matchedLocations": 0,
                "angles": [],
                "thermal": [[] for _ in range(4)],
            },
        )
        segment["matchedLocations"] += 1
        av = [wheel_value(p, "TireSlipAngle", i) for i in range(4)]
        bv = [wheel_value(q, "TireSlipAngle", i) for i in range(4)]
        if all(finite(v) for v in av + bv):
            segment["angles"].append(
                sum(abs(v) for v in bv) / 4 - sum(abs(v) for v in av) / 4
            )
        for i in range(4):
            at, bt = wheel_value(p, "TireTemp", i), wheel_value(q, "TireTemp", i)
            if at is not None and bt is not None:
                segment["thermal"][i].append((bt - at) * 5 / 9)
    changes = []
    for p, q in comparable:
        av, bv = (
            [wheel_value(p, "TireSlipAngle", i) for i in range(4)],
            [wheel_value(q, "TireSlipAngle", i) for i in range(4)],
        )
        if all(finite(v) for v in av + bv):
            changes.append(sum(abs(v) for v in bv) / 4 - sum(abs(v) for v in av) / 4)
    return {
        "methodVersion": MATCH_VERSION,
        "routeStatus": route_status,
        "baselineCoverage": a_coverage,
        "candidateCoverage": b_coverage,
        "matchedLocations": len(pairs),
        "matchedDrivingConditions": len(comparable),
        "meanNormalizedAngleChange": sum(changes) / len(changes) if changes else None,
        "angleLocations": len(changes),
        "segments": [
            {
                "index": s["index"],
                "fromMeters": s["fromMeters"],
                "toMeters": s["toMeters"],
                "matchedLocations": s["matchedLocations"],
                "angleLocations": len(s["angles"]),
                "meanNormalizedAngleChange": sum(s["angles"]) / len(s["angles"])
                if s["angles"]
                else None,
                "meanTemperatureChangeC": [
                    sum(v) / len(v) if v else None for v in s["thermal"]
                ],
            }
            for _, s in sorted(segments.items())
        ],
        "independentRuns": 2,
        "limitations": [
            "Position matching does not establish weather, traffic or clean driving.",
            "Matched locations are not independent repeated races.",
            "Matching speed and inputs describes local behavior and may omit part of a setting's effect.",
        ],
        "rules": {
            "maxPositionDifferenceMeters": MATCH_METERS,
            "minimumRouteCoverage": ROUTE_COVERAGE_MIN,
            "minimumHeadingCosine": 0.9,
            "maxVerticalDifferenceMeters": 3,
            "maxSpeedDifferenceMps": 2,
            "maxRelativeSpeedDifference": 0.08,
            "maxPedalDifferenceRaw": 25,
            "maxSteeringDifferenceRaw": 10,
            "pointLimitPerRun": MAX_MATCH_POINTS,
        },
    }
