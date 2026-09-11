"""Drift run comparisons. All conclusions are descriptive only.
No causal drift optimum, grip coefficient, or fabricated composite score is produced.
Mandatory limitation disclosure is embedded in every comparison report.
"""

from statistics import median

from drift_models import DriftComparison
from telemetry_contract import finite

DRIFT_COMPARISON_VERSION = "drift-comparison/descriptive-v1"

MANDATORY_LIMITATIONS = [
    "Descriptive drift observations only; no causal model or optimum setup is claimed.",
    "Yaw rate and slip proxy are sensitive to driver input style and surface grip — neither is isolated from setup effects.",
    "Game drift score (if used) reflects game-engine scoring rules, not a physics-validated vehicle stability model.",
    "Repeated runs require verified unchanged vehicle, tires, driving conditions, and driver technique.",
    "No cross-vehicle or cross-condition calibration exists; thresholds are first-pass engineering heuristics.",
]


def compare_drift_runs(
    store, database, workflow_id: str, request: DriftComparison
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
            finish = finishes.get(run["id"])
            if not finish:
                reasons.append("finish-score-unknown")

    # --- Drift-specific: game score comparison (purely descriptive) ---
    def scores(run_ids: list[str]) -> list[float]:
        return [
            finishes[rid]["score"]
            for rid in run_ids
            if rid in finishes and finite(finishes[rid].get("score"))
        ]

    scores_a = scores(a_ids)
    scores_b = scores(b_ids)
    delta_score = median(scores_b) - median(scores_a) if scores_a and scores_b else None

    # --- Yaw rate proxy comparison ---
    def mean_yaw(run_ids: list[str]) -> list[float]:
        return [
            summaries[rid]["observations"]["yawRate"]["distribution"]["mean"]
            for rid in run_ids
            if summaries[rid]["observations"]["yawRate"]["distribution"]["mean"]
            is not None
        ]

    yaw_a = mean_yaw(a_ids)
    yaw_b = mean_yaw(b_ids)
    delta_yaw = median(yaw_b) - median(yaw_a) if yaw_a and yaw_b else None

    # --- Descriptive conclusion (conservative: insufficient-data unless very clear) ---
    if reasons:
        conclusion = "insufficient-data"
    elif delta_score is not None and delta_score > 1000:
        conclusion = "score-higher-descriptive"
    elif delta_score is not None and delta_score < -1000:
        conclusion = "score-lower-descriptive"
    else:
        conclusion = "difference-insufficient"

    return store.append(
        "comparison",
        workflow_id,
        {
            "methodVersion": DRIFT_COMPARISON_VERSION,
            "baselineRunIds": a_ids,
            "candidateRunIds": b_ids,
            "baselineSetupId": baseline["id"],
            "candidateSetupId": candidate["id"],
            "summaryIds": [summaries[i]["id"] for i in a_ids + b_ids],
            "finishIds": [finishes[i]["id"] for i in a_ids + b_ids if i in finishes],
            "conclusion": conclusion,
            "conclusionNote": "Score difference is a descriptive observation of the game scoring outcome, not a validated physical improvement.",
            "reasons": sorted(set(reasons)),
            "evidenceLevel": "descriptive",
            "independentRuns": {"baseline": len(a_ids), "candidate": len(b_ids)},
            "driftMetrics": {
                "baselineScores": scores_a,
                "candidateScores": scores_b,
                "deltaScore": delta_score,
                "baselineMeanYawRateRads": yaw_a,
                "candidateMeanYawRateRads": yaw_b,
                "deltaYawRateRads": delta_yaw,
            },
            "nextAction": "review-required-condition"
            if reasons
            else "keep-or-revisit-baseline",
            "limitations": MANDATORY_LIMITATIONS,
        },
    )
