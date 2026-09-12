"""Adapters to the existing tuning-capture/v1 evidence file (no solver math)."""

from datetime import datetime, timezone

SCALAR_FIELDS = {
    "timestampMS": "TimestampMS",
    "isRaceOn": "IsRaceOn",
    "carOrdinal": "CarOrdinal",
    "speedMps": "SpeedMetersPerSecond",
    "rpm": "CurrentEngineRpm",
    "gear": "Gear",
    "accelInput": "AccelInput",
    "brakeInput": "BrakeInput",
    "clutchInput": "ClutchInput",
    "handBrakeInput": "HandBrakeInput",
    "steerInput": "SteerInput",
    "accelerationX": "AccelerationX",
    "accelerationY": "AccelerationY",
    "accelerationZ": "AccelerationZ",
    "velocityX": "VelocityX",
    "velocityY": "VelocityY",
    "velocityZ": "VelocityZ",
    "positionX": "PositionX",
    "positionY": "PositionY",
    "positionZ": "PositionZ",
    "lapNumber": "LapNumber",
    "currentRaceTime": "CurrentRaceTime",
}
VECTOR_FIELDS = {
    "normalizedSuspensionTravel": "NormalizedSuspensionTravel",
    "tireSlipRatio": "TireSlipRatio",
    "tireSlipAngle": "TireSlipAngle",
    "tireTemp": "TireTemp",
    "tireCombinedSlip": "TireCombinedSlip",
    "surfaceRumble": "SurfaceRumble",
}
EXTRA_FIELDS = {
    "powerWatts": "PowerWatts",
    "torqueNewtons": "TorqueNewtons",
    "engineMaxRpm": "EngineMaxRpm",
    "engineIdleRpm": "EngineIdleRpm",
    "performanceIndex": "CarPerformanceIndex",
    "carClass": "CarClass",
    "drivetrainType": "DrivetrainType",
    "currentLap": "CurrentLap",
    "lastLap": "LastLap",
    "distanceTraveled": "DistanceTraveled",
    "yaw": "Yaw",
    "pitch": "Pitch",
    "roll": "Roll",
}
EXTRA_VECTORS = {
    "suspensionTravelMeters": "SuspensionTravelMeters",
    "wheelRotationSpeed": "WheelRotationSpeed",
    "wheelOnRumbleStrip": "WheelOnRumbleStrip",
}


def capture_sample(point: dict) -> dict:
    missing = []
    result = {}
    for target, source in SCALAR_FIELDS.items():
        value = point.get(source)
        if value is None:
            missing.append(source)
        result[target] = value if value is not None else 0
    for target, source in VECTOR_FIELDS.items():
        values = point.get(source) or []
        result[target] = []
        for index in range(4):
            value = values[index] if index < len(values) else None
            if value is None:
                missing.append(f"{source}.{index}")
            result[target].append(value if value is not None else 0)
    for target, source in EXTRA_FIELDS.items():
        result[target] = point.get(source)
        if result[target] is None:
            missing.append(source)
    for target, source in EXTRA_VECTORS.items():
        values = point.get(source) or []
        result[target] = [values[i] if i < len(values) else None for i in range(4)]
        missing.extend(
            f"{source}.{i}" for i, value in enumerate(result[target]) if value is None
        )
    result["angularVelocity"] = [point.get("AngularVelocity" + axis) for axis in "XYZ"]
    missing.extend(
        "AngularVelocity" + axis
        for axis, value in zip("XYZ", result["angularVelocity"])
        if value is None
    )
    result["missingChannels"] = missing
    result["sourceSchema"] = point.get("TelemetrySchema", "unknown")
    return result


def export_road_capture(service, workflow_id: str, run_id: str) -> dict:
    workflow = service.store.get(workflow_id, "workflow")
    run = service.store.get(run_id, "run", workflow_id)
    event = workflow["event"]
    metadata = {
        "label": run_id,
        "purpose": "road-setup-verification",
        "carId": str(workflow["identity"]["ordinal"]),
        "gameBuild": workflow.get("gameBuild", "unknown"),
        "installedParts": workflow["configuration"],
        "tireType": "unknown",
        "surface": "unknown",
        "weather": event["conditions"],
        "eventType": event["format"],
        "track": event["name"],
        "shareCode": "unknown",
        "driverAssists": event["driverAssists"],
        "notes": "Decoded samples; see recording and parent references.",
    }
    return {
        "schemaVersion": "tuning-capture/v1",
        "capturedAt": datetime.fromtimestamp(
            run["createdAt"], timezone.utc
        ).isoformat(),
        "metadata": metadata,
        "samples": [
            capture_sample(p)
            for p in service.database.get_telemetry_points(run["sessionId"])
        ],
        "recording": {
            **service.database.get_session_metadata(run["sessionId"]),
            "source": "decoded-backend-downsampled",
            "sessionId": run["sessionId"],
        },
        "references": {
            "workflowId": workflow_id,
            "runId": run_id,
            "setupId": run["setupId"],
            "calibrationSchema": "tuning-calibration/v1",
        },
    }
