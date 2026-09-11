"""Saved evidence comparisons for Offroad / Rally runs. Reports descriptive outcomes without unverified causality."""

from statistics import median

from offroad_models import OffroadComparison
from road_matching import local_comparison
from telemetry_contract import finite

OFFROAD_COMPARISON_VERSION = "offroad-comparison/descriptive-v1"


def compare_offroad_runs(
    store, database, workflow_id: str, request: OffroadComparison
) -> dict:
    a_ids, b_ids = request.baselineRunIds, request.candidateRunIds
    if len(set(a_ids + b_ids)) != len(a_ids + b_ids):
        raise ValueError("Each independent race can appear only once in a comparison")

    workflow = store.get(workflow_id, "workflow")
    docs = store.list(workflow_id)
    runs = [[store.get(i, "run", workflow_id) for i in ids] for ids in (a_ids, b_ids)]
    setups = [
        [store.get(r["setupId"], "setup", workflow_id) for r in group] for group in runs
    ]

    if len({s["id"] for s in setups[1]}) != 1:
        raise ValueError("Compare one candidate setting version at a time")

    candidate = setups[1][0]
    if not candidate.get("baselineSetupId"):
        raise ValueError("The candidate does not reference a frozen baseline")

    baseline = store.get(candidate["baselineSetupId"], "setup", workflow_id)
    allowed_baselines = {baseline["id"], baseline.get("basisSetupId")}
    if any(s["id"] not in allowed_baselines for s in setups[0]):
        raise ValueError(
            "The baseline runs do not match the candidate's frozen baseline"
        )

    if any(
        s["id"] == baseline.get("basisSetupId")
        and r["id"] != baseline.get("basisRunId")
        for r, s in zip(runs[0], setups[0])
    ):
        raise ValueError(
            "Confirm the frozen baseline again for additional independent runs"
        )

    summaries, finishes = {}, {}
    for d in docs:
        if d["kind"] == "summary":
            summaries[d["runId"]] = d
        if d["kind"] == "finish":
            finishes[d["runId"]] = d

    if any(i not in summaries for i in a_ids + b_ids):
        raise ValueError("Finish saving every run before comparing")

    reasons = []
    for group in runs:
        for run in group:
            if run["identity"] != workflow["identity"]:
                reasons.append("identity-different")
            for field in ("otherSettings", "tires", "conditions", "driverAssists"):
                if run.get(field) != "unchanged":
                    reasons.append(field + "-" + str(run.get(field)))
            receipt = summaries[run["id"]]["recording"]
            if (
                receipt.get("droppedSamples")
                or receipt.get("failedWrites")
                or receipt.get("incompletePersistence")
            ):
                reasons.append("recording-incomplete")
            if receipt.get("endReason") in (
                "identity-changed",
                "timestamp-regressed",
                "race-restarted",
                "sample-limit",
            ):
                reasons.append(receipt["endReason"])
            finish = finishes.get(run["id"])
            if not finish:
                reasons.append("finish-time-unknown")
            elif finish["clean"] != "confirmed":
                reasons.append("incident-" + finish["clean"])
            summary = summaries[run["id"]]
            coverage = summary.get("raceTimeCoverage", {})
            first, last = coverage.get("firstSeconds"), coverage.get("lastSeconds")
            if not finite(first) or first > 0.5:
                reasons.append("recording-start-incomplete")
            if finish and (not finite(last) or abs(last - finish["timeSeconds"]) > 1):
                reasons.append("recording-finish-incomplete")
            if summary["observations"]["quality"]["gapSeconds"] > 0:
                reasons.append("telemetry-gaps")
            if summary["sourceSchemas"] != ["decoded-fh6/v1"]:
                reasons.append("source-not-decoded")

    first_a, first_b = runs[0][0], runs[1][0]
    spatial = local_comparison(
        database.get_telemetry_points(first_a["sessionId"]),
        database.get_telemetry_points(first_b["sessionId"]),
        workflow["event"]["format"] == "circuit",
    )
    if spatial["routeStatus"] != "compatible":
        reasons.append("route-" + spatial["routeStatus"])
    if spatial["matchedDrivingConditions"] < 20:
        reasons.append("driving-conditions-insufficient")

    thermal = []
    for wheel in ("FL", "FR", "RL", "RR"):
        a = summaries[first_a["id"]]["observations"]["wheels"][wheel][
            "startTemperatureC"
        ]
        b = summaries[first_b["id"]]["observations"]["wheels"][wheel][
            "startTemperatureC"
        ]
        thermal.append(None if a is None or b is None else b - a)

    thermal_status = (
        "unknown"
        if any(v is None for v in thermal)
        else "different"
        if any(abs(v) > 5 for v in thermal)
        else "similar-start"
    )
    if thermal_status != "similar-start":
        reasons.append("thermal-start-" + thermal_status)

    repetition_checks = []
    reference_points = database.get_telemetry_points(first_a["sessionId"])
    for run in runs[0][1:] + runs[1][1:]:
        local = local_comparison(
            reference_points,
            database.get_telemetry_points(run["sessionId"]),
            workflow["event"]["format"] == "circuit",
        )
        changes = []
        for wheel in ("FL", "FR", "RL", "RR"):
            start = summaries[first_a["id"]]["observations"]["wheels"][wheel][
                "startTemperatureC"
            ]
            other = summaries[run["id"]]["observations"]["wheels"][wheel][
                "startTemperatureC"
            ]
            changes.append(None if start is None or other is None else other - start)
        thermal_ok = all(v is not None and abs(v) <= 5 for v in changes)
        if local["routeStatus"] != "compatible":
            reasons.append("repetition-route-incompatible")
        if local["matchedDrivingConditions"] < 20:
            reasons.append("driving-conditions-insufficient")
        if not thermal_ok:
            reasons.append("repetition-thermal-incompatible")
        repetition_checks.append(
            {
                "runId": run["id"],
                "referenceRunId": first_a["id"],
                "local": local,
                "thermalStartChangeC": changes,
            }
        )

    times = [
        [finishes[r["id"]]["timeSeconds"] for r in group if r["id"] in finishes]
        for group in runs
    ]
    delta = median(times[1]) - median(times[0]) if all(times) else None
    repeated = min(len(group) for group in runs) >= 3
    direction_consistent = bool(
        repeated
        and all(times)
        and (max(times[1]) < min(times[0]) or min(times[1]) > max(times[0]))
    )

    # Offroad-specific metrics comparison (severe bottoming, landing impact, terrain compliance)
    def sum_bottoming(run_ids):
        counts = []
        durations = []
        for rid in run_ids:
            obs = summaries[rid]["observations"]
            total_count = sum(
                wheel["severeBottoming"]["count"] or 0
                for wheel in obs["wheels"].values()
            )
            total_dur = sum(
                wheel["severeBottoming"]["seconds"] or 0.0
                for wheel in obs["wheels"].values()
            )
            counts.append(total_count)
            durations.append(total_dur)
        return median(counts) if counts else 0, median(durations) if durations else 0.0

    a_bottoming_count, a_bottoming_dur = sum_bottoming(a_ids)
    b_bottoming_count, b_bottoming_dur = sum_bottoming(b_ids)
    delta_bottoming_count = b_bottoming_count - a_bottoming_count
    delta_bottoming_dur = b_bottoming_dur - a_bottoming_dur

    def median_landing_g(run_ids):
        vals = [
            summaries[rid]["observations"]["landing"]["maxImpactG"]
            for rid in run_ids
            if summaries[rid]["observations"]["landing"]["maxImpactG"] is not None
        ]
        return median(vals) if vals else None

    landing_g_a = median_landing_g(a_ids)
    landing_g_b = median_landing_g(b_ids)
    delta_landing_g = (
        landing_g_b - landing_g_a
        if landing_g_a is not None and landing_g_b is not None
        else None
    )

    def median_roughness(run_ids):
        vals = [
            summaries[rid]["observations"]["terrain"]["surfaceRoughnessRms"]
            for rid in run_ids
        ]
        return median(vals) if vals else 0.0

    roughness_a = median_roughness(a_ids)
    roughness_b = median_roughness(b_ids)
    delta_roughness = roughness_b - roughness_a

    # Descriptive conclusion logic
    if reasons:
        conclusion = "insufficient-data"
    elif delta_bottoming_count < 0 and (delta is None or delta <= 0.005):
        conclusion = "bottoming-reduced"
    elif delta is not None and delta < -0.001 and delta_bottoming_count > 0:
        conclusion = "tradeoff"
    elif delta is not None and delta < -0.001:
        conclusion = "provisional-keep"
    elif delta is not None and delta > 0.001 and delta_bottoming_count >= 0:
        conclusion = "candidate-slower"
    elif delta_bottoming_count == 0 and (delta is None or abs(delta) < 0.001):
        conclusion = "difference-insufficient"
    elif delta is not None and delta > 0.001:
        conclusion = "candidate-slower"
    else:
        conclusion = "difference-insufficient"

    return store.append(
        "comparison",
        workflow_id,
        {
            "methodVersion": OFFROAD_COMPARISON_VERSION,
            "baselineRunIds": a_ids,
            "candidateRunIds": b_ids,
            "baselineSetupId": baseline["id"],
            "candidateSetupId": candidate["id"],
            "summaryIds": [summaries[i]["id"] for i in a_ids + b_ids],
            "finishIds": [finishes[i]["id"] for i in a_ids + b_ids if i in finishes],
            "conclusion": conclusion,
            "reasons": sorted(set(reasons)),
            "evidenceLevel": "descriptive",
            "independentRuns": {"baseline": len(a_ids), "candidate": len(b_ids)},
            "time": {
                "baselineSeconds": times[0],
                "candidateSeconds": times[1],
                "medianChangeSeconds": delta,
                "source": "game-confirmed",
                "repeatedDirectionConsistent": direction_consistent,
            },
            "offroadMetrics": {
                "baselineBottomingCount": a_bottoming_count,
                "candidateBottomingCount": b_bottoming_count,
                "bottomingCountChange": delta_bottoming_count,
                "baselineBottomingSeconds": a_bottoming_dur,
                "candidateBottomingSeconds": b_bottoming_dur,
                "bottomingSecondsChange": delta_bottoming_dur,
                "baselineLandingImpactG": landing_g_a,
                "candidateLandingImpactG": landing_g_b,
                "landingImpactGChange": delta_landing_g,
                "baselineRoughnessRms": roughness_a,
                "candidateRoughnessRms": roughness_b,
                "roughnessRmsChange": delta_roughness,
            },
            "thermalStart": {
                "status": thermal_status,
                "changeC": thermal,
                "screeningDifferenceC": 5,
            },
            "local": spatial,
            "localRunIds": [first_a["id"], first_b["id"]],
            "repetitionChecks": repetition_checks,
            "nextAction": "review-required-condition"
            if reasons
            else "keep-or-revisit-baseline",
            "limitations": [
                "Descriptive offroad observations only; no calibrated practical-difference or vehicle optimum model is claimed.",
                "Telemetry does not measure ground clearance directly; suspension travel and bottoming events are empirical indicators.",
                "Repeated runs require verified unchanged vehicle, tires, and terrain conditions.",
            ],
        },
    )
