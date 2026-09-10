"""Describe one captured race without ranking laps or inferring setup causality."""

import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np

WHEELS = ("FL", "FR", "RL", "RR")
SCALARS = {
    "speedKmh": ("SpeedMetersPerSecond", 3.6),
    "powerKw": ("PowerWatts", 0.001),
    "rpm": ("CurrentEngineRpm", 1),
    "throttleRaw": ("AccelInput", 1),
    "brakeRaw": ("BrakeInput", 1),
    "steerRaw": ("SteerInput", 1),
    "lateralAccelerationMps2": ("AccelerationX", 1),
    "longitudinalAccelerationMps2": ("AccelerationZ", 1),
    "verticalAccelerationMps2": ("AccelerationY", 1),
    "rollRaw": ("Roll", 1),
    "pitchRaw": ("Pitch", 1),
    "torqueNm": ("TorqueNewtons", 1),
}
VECTORS = {
    "temperatureRawF": "TireTemp",
    "normalizedAngle": "TireSlipAngle",
    "normalizedRatio": "TireSlipRatio",
    "combinedSlip": "TireCombinedSlip",
    "normalizedTravel": "NormalizedSuspensionTravel",
    "travelMeters": "SuspensionTravelMeters",
}


def finite(value):
    return isinstance(value, (int, float)) and math.isfinite(value)


def describe(values, weights):
    """Time-weighted observed quantiles; missing values retain coverage evidence."""
    pairs = sorted(
        (value, weight)
        for value, weight in zip(values, weights)
        if finite(value) and weight > 0
    )
    total = sum(weight for _, weight in pairs)
    if not total:
        return {"observedSeconds": 0, "p05": None, "p50": None, "p95": None}
    cumulative = np.cumsum([weight for _, weight in pairs])
    return {
        "observedSeconds": total,
        **{
            label: pairs[
                min(int(np.searchsorted(cumulative, q * total)), len(pairs) - 1)
            ][0]
            for label, q in (("p05", 0.05), ("p50", 0.5), ("p95", 0.95))
        },
    }


def phase(frame):
    """Descriptive input bins, not proof of steady state or corner boundaries."""
    brake, throttle, lateral = (
        frame.get(k) for k in ("BrakeInput", "AccelInput", "AccelerationX")
    )
    if not all(finite(v) for v in (brake, throttle, lateral)):
        return "unknown"
    if brake > 0:
        return "braking"
    if abs(lateral) >= 0.3 * 9.80665:
        return "turning_power" if throttle >= 200 else "turning_partial_or_coast"
    return "low_lateral_power" if throttle >= 200 else "other"


def summary(frames, weights):
    result = {"frames": len(frames), "observedSeconds": sum(weights)}
    for label, (field, scale) in SCALARS.items():
        values = [f.get(field) for f in frames]
        result[label] = describe(
            [v * scale if finite(v) else None for v in values], weights
        )
    result["wheels"] = {}
    for i, wheel in enumerate(WHEELS):
        data = {}
        for label, field in VECTORS.items():
            values = [
                f[field][i]
                if isinstance(f.get(field), list) and len(f[field]) == 4
                else None
                for f in frames
            ]
            if label in ("normalizedAngle", "normalizedRatio"):
                values = [abs(v) if finite(v) else None for v in values]
            data[label] = describe(values, weights)
            if label == "normalizedTravel":
                covered = data[label]["observedSeconds"]
                for name, predicate in (
                    ("nearExtensionFraction", lambda v: v <= 0.05),
                    ("nearCompressionFraction", lambda v: v >= 0.95),
                ):
                    data[name] = (
                        sum(
                            w
                            for v, w in zip(values, weights)
                            if finite(v) and predicate(v)
                        )
                        / covered
                        if covered
                        else None
                    )
        result["wheels"][wheel] = data
    return result


def analyze(records, finish_seconds, ordinal, pi, expected_laps=7):
    """Retain every observed lap; separate capture gaps from observed exposure."""
    frames, issues, finish_reports = [], [], []
    previous_time = None
    for record in records:
        f = record.get("frame", {})
        if not isinstance(f, dict):
            issues.append("non_object_frame")
            continue
        t = f.get("CurrentRaceTime")
        if not finite(t) or t <= 0 or f.get("IsRaceOn") != 1:
            continue
        if f.get("CarOrdinal") != ordinal or f.get("CarPerformanceIndex") != pi:
            issues.append("identity_mismatch")
            continue
        if previous_time is not None and t < previous_time - 1:
            issues.append("following_race_reset_stop")
            break
        previous_time = t
        if t > finish_seconds:
            if (
                frames
                and frames[-1].get("LapNumber") == expected_laps - 1
                and f.get("LapNumber") == expected_laps
                and finite(f.get("LastLap"))
                and f["LastLap"] > 0
            ):
                finish_reports.append(
                    {k: f.get(k) for k in ("CurrentRaceTime", "LastLap", "BestLap")}
                )
            continue
        if frames and t <= frames[-1]["CurrentRaceTime"]:
            issues.append("duplicate_or_reordered_timestamp")
            continue
        frames.append(f)
    if not frames:
        raise ValueError("No matching race frames")
    times = [f["CurrentRaceTime"] for f in frames]
    deltas = np.diff(times).tolist() + [finish_seconds - times[-1]]
    # 100 ms flags missing exposure; it is not a lap exclusion or handling limit.
    weights = [dt if 0 <= dt <= 0.1 else 0 for dt in deltas]
    if max(deltas) > 0.1:
        issues.append("capture_gap_above_100ms")
    laps = list(dict.fromkeys(f.get("LapNumber") for f in frames))
    if laps != list(range(expected_laps)):
        issues.append("unexpected_lap_sequence")
    clock_resets = []
    for previous, current in zip(frames, frames[1:]):
        before, after = previous.get("CurrentLap"), current.get("CurrentLap")
        if (
            previous.get("LapNumber") == current.get("LapNumber")
            and finite(before)
            and finite(after)
            and after < before - 0.1
        ):
            clock_resets.append(
                {
                    "lapNumberRaw": current.get("LapNumber"),
                    "raceTimeBefore": previous["CurrentRaceTime"],
                    "raceTimeAfter": current["CurrentRaceTime"],
                    "lapClockBefore": before,
                    "lapClockAfter": after,
                }
            )
    if clock_resets:
        issues.append("lap_clock_reset_without_lap_increment")
    out = {
        "experimentalUnits": 1,
        "finishSecondsExternal": finish_seconds,
        "issues": sorted(set(issues)),
        "lapClockResets": clock_resets,
        "postFinishReports": finish_reports,
        "firstRaceTime": times[0],
        "lastRaceTime": times[-1],
        "finishGapSeconds": finish_seconds - times[-1],
        "maxSampleGapSeconds": max(deltas),
        "unobservedSeconds": finish_seconds - sum(weights),
        "wholeRace": summary(frames, weights),
        "laps": [],
        "phases": {},
        "windows": {},
    }
    for lap in laps:
        indices = [i for i, f in enumerate(frames) if f.get("LapNumber") == lap]
        first, last = indices[0], indices[-1]
        fs, ws = [frames[i] for i in indices], [weights[i] for i in indices]
        following = frames[last + 1] if last + 1 < len(frames) else None
        out["laps"].append(
            {
                "lap": lap + 1 if isinstance(lap, int) else lap,
                "role": "standing_start" if lap == 0 else "race_lap",
                "gameCompletedLapSeconds": following.get("LastLap")
                if following
                else None,
                "finishRemainderSeconds": finish_seconds - times[first]
                if not following
                else None,
                "start": {
                    k: fs[0].get(k)
                    for k in (
                        "CurrentRaceTime",
                        "CurrentLap",
                        "SpeedMetersPerSecond",
                        "TireTemp",
                        "PositionX",
                        "PositionY",
                        "PositionZ",
                        "AccelInput",
                        "BrakeInput",
                        "SteerInput",
                        "PowerWatts",
                        "Gear",
                    )
                },
                "summary": summary(fs, ws),
            }
        )
    for name in sorted({phase(f) for f in frames}):
        indices = [i for i, f in enumerate(frames) if phase(f) == name]
        out["phases"][name] = summary(
            [frames[i] for i in indices], [weights[i] for i in indices]
        )
    for name, window in (
        ("predeclared_laps_3_to_6", range(2, 6)),
        ("sensitivity_laps_2_to_6", range(1, 6)),
        ("sensitivity_laps_2_to_7", range(1, 7)),
    ):
        indices = [i for i, f in enumerate(frames) if f.get("LapNumber") in window]
        out["windows"][name] = summary(
            [frames[i] for i in indices], [weights[i] for i in indices]
        )
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("capture", type=Path)
    parser.add_argument("--finish-seconds", required=True, type=float)
    parser.add_argument("--ordinal", required=True, type=int)
    parser.add_argument("--pi", required=True, type=int)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    if not finite(args.finish_seconds) or args.finish_seconds <= 0:
        parser.error("finish-seconds must be finite and positive")
    raw = args.capture.read_bytes()
    records = [json.loads(line) for line in raw.splitlines() if line.strip()]
    result = analyze(records, args.finish_seconds, args.ordinal, args.pi)
    result["captureSha256"] = hashlib.sha256(raw).hexdigest()
    result["capture"] = str(args.capture.resolve())
    result["interpretation"] = (
        "One race is one experimental unit. All laps retained. Lap order and input "
        "bins do not remove temperature, speed, line, power or driver confounding. "
        "Travel endpoints are proxies, not proof of wheel lift or bottoming. "
        "Last-lap finish remainder is not an official lap time. No setup ranking."
    )
    # Exclusive creation protects prior reports and the source capture.
    with args.output.open("x", encoding="utf-8") as stream:
        json.dump(result, stream, indent=2, allow_nan=False)
    print(
        json.dumps(
            {
                k: result[k]
                for k in (
                    "captureSha256",
                    "experimentalUnits",
                    "issues",
                    "unobservedSeconds",
                )
            }
        )
    )


if __name__ == "__main__":
    main()
