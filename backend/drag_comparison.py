"""Saved evidence comparisons for Drag runs. Reports descriptive outcomes without unverified causality."""

from statistics import median

from drag_models import DragComparison
from telemetry_contract import finite

DRAG_COMPARISON_VERSION = "drag-comparison/descriptive-v1"


def compare_drag_runs(
    store, database, workflow_id: str, request: DragComparison
) -> dict:
    a_ids, b_ids = request.baselineRunIds, request.candidateRunIds
    if len(set(a_ids + b_ids)) != len(a_ids + b_ids):
        raise ValueError("Each independent run can appear only once in a comparison")

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
            for field in ("otherSettings", "tires", "driverAssists"):
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

    # --- Drag-specific metric extraction ---
    def get_milestone(run_ids: list[str], key: str) -> list[float]:
        return [
            summaries[rid]["observations"]["milestones"].get(key)
            for rid in run_ids
            if summaries[rid]["observations"]["milestones"].get(key) is not None
        ]

    t100_a = get_milestone(a_ids, "zeroTo100KmhSeconds")
    t100_b = get_milestone(b_ids, "zeroTo100KmhSeconds")
    t400_a = get_milestone(a_ids, "zeroTo400mSeconds")
    t400_b = get_milestone(b_ids, "zeroTo400mSeconds")

    delta_t100 = median(t100_b) - median(t100_a) if t100_a and t100_b else None
    delta_t400 = median(t400_b) - median(t400_a) if t400_a and t400_b else None

    def get_launch_slip(run_ids: list[str]) -> list[float]:
        return [
            summaries[rid]["observations"]["launch"].get("peakSlipRatio")
            for rid in run_ids
            if summaries[rid]["observations"]["launch"].get("peakSlipRatio") is not None
        ]

    slip_a = get_launch_slip(a_ids)
    slip_b = get_launch_slip(b_ids)
    delta_slip = median(slip_b) - median(slip_a) if slip_a and slip_b else None

    # --- Finish time comparison ---
    times = [
        [finishes[r["id"]]["timeSeconds"] for r in group if r["id"] in finishes]
        for group in runs
    ]
    delta_time = median(times[1]) - median(times[0]) if all(times) else None

    repeated = min(len(group) for group in runs) >= 3
    direction_consistent = bool(
        repeated
        and all(times)
        and (max(times[1]) < min(times[0]) or min(times[1]) > max(times[0]))
    )

    # --- Descriptive conclusion ---
    if reasons:
        conclusion = "insufficient-data"
    elif delta_t100 is not None and delta_t100 < -0.05:
        conclusion = "provisional-keep"
    elif delta_t100 is not None and delta_t100 > 0.05:
        conclusion = "candidate-slower"
    elif delta_time is not None and delta_time < -0.05:
        conclusion = "provisional-keep"
    elif delta_time is not None and delta_time > 0.05:
        conclusion = "candidate-slower"
    else:
        conclusion = "difference-insufficient"

    return store.append(
        "comparison",
        workflow_id,
        {
            "methodVersion": DRAG_COMPARISON_VERSION,
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
                "medianChangeSeconds": delta_time,
                "source": "game-confirmed",
                "repeatedDirectionConsistent": direction_consistent,
            },
            "dragMetrics": {
                "baseline0To100Seconds": t100_a,
                "candidate0To100Seconds": t100_b,
                "delta0To100Seconds": delta_t100,
                "baseline0To400mSeconds": t400_a,
                "candidate0To400mSeconds": t400_b,
                "delta0To400mSeconds": delta_t400,
                "baselineLaunchPeakSlip": slip_a,
                "candidateLaunchPeakSlip": slip_b,
                "deltaLaunchPeakSlip": delta_slip,
            },
            "nextAction": "review-required-condition"
            if reasons
            else "keep-or-revisit-baseline",
            "limitations": [
                "Descriptive drag observations only; no calibrated optimum model is claimed.",
                "0-100 km/h and 0-400m times depend on race start detection accuracy.",
                "Launch slip analysis uses normalized rear-wheel slip; full tire grip characterization requires controlled conditions.",
                "Repeated runs require verified unchanged vehicle, tires, and launch assist settings.",
            ],
        },
    )
