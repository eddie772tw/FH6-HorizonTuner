use super::store::RoadStore;
use crate::error::{ApiError, ApiResult};
use crate::telemetry::TelemetryStore;
use serde_json::{json, Map, Value};

fn scalar(
    point: &Value,
    target: &str,
    source: &str,
    missing: &mut Vec<Value>,
    out: &mut Map<String, Value>,
) {
    match point.get(source) {
        Some(v) if !v.is_null() => {
            out.insert(target.into(), v.clone());
        }
        _ => {
            out.insert(target.into(), Value::from(0));
            missing.push(Value::String(source.into()));
        }
    }
}
fn vector(
    point: &Value,
    target: &str,
    source: &str,
    missing: &mut Vec<Value>,
    out: &mut Map<String, Value>,
) {
    let values = point.get(source).and_then(Value::as_array);
    let mut result = Vec::with_capacity(4);
    for i in 0..4 {
        match values.and_then(|x| x.get(i)).filter(|x| !x.is_null()) {
            Some(v) => result.push(v.clone()),
            None => {
                result.push(Value::from(0));
                missing.push(Value::String(format!("{source}.{i}")));
            }
        }
    }
    out.insert(target.into(), Value::Array(result));
}
fn optional_extra(
    point: &Value,
    target: &str,
    source: &str,
    missing: &mut Vec<Value>,
    out: &mut Map<String, Value>,
) {
    match point.get(source) {
        Some(v) if !v.is_null() => {
            out.insert(target.into(), v.clone());
        }
        _ => {
            out.insert(target.into(), Value::Null);
            missing.push(Value::String(source.into()));
        }
    }
}
fn optional_extra_vector(
    point: &Value,
    target: &str,
    source: &str,
    missing: &mut Vec<Value>,
    out: &mut Map<String, Value>,
) {
    let values = point.get(source).and_then(Value::as_array);
    let mut result = Vec::with_capacity(4);
    for i in 0..4 {
        let v = values
            .and_then(|x| x.get(i))
            .cloned()
            .unwrap_or(Value::Null);
        if v.is_null() {
            missing.push(Value::String(format!("{source}.{i}")));
        }
        result.push(v);
    }
    out.insert(target.into(), Value::Array(result));
}

/// Preserve the existing tuning-capture/v1 channel names and explicit missing data.
pub fn capture_sample(point: &Value) -> Value {
    let mut out = Map::new();
    let mut missing = Vec::new();
    for (target, source) in [
        ("timestampMS", "TimestampMS"),
        ("isRaceOn", "IsRaceOn"),
        ("carOrdinal", "CarOrdinal"),
        ("speedMps", "SpeedMetersPerSecond"),
        ("rpm", "CurrentEngineRpm"),
        ("gear", "Gear"),
        ("accelInput", "AccelInput"),
        ("brakeInput", "BrakeInput"),
        ("clutchInput", "ClutchInput"),
        ("handBrakeInput", "HandBrakeInput"),
        ("steerInput", "SteerInput"),
        ("accelerationX", "AccelerationX"),
        ("accelerationY", "AccelerationY"),
        ("accelerationZ", "AccelerationZ"),
        ("velocityX", "VelocityX"),
        ("velocityY", "VelocityY"),
        ("velocityZ", "VelocityZ"),
        ("positionX", "PositionX"),
        ("positionY", "PositionY"),
        ("positionZ", "PositionZ"),
        ("lapNumber", "LapNumber"),
        ("currentRaceTime", "CurrentRaceTime"),
    ] {
        scalar(point, target, source, &mut missing, &mut out);
    }
    for (target, source) in [
        ("normalizedSuspensionTravel", "NormalizedSuspensionTravel"),
        ("tireSlipRatio", "TireSlipRatio"),
        ("tireSlipAngle", "TireSlipAngle"),
        ("tireTemp", "TireTemp"),
        ("tireCombinedSlip", "TireCombinedSlip"),
        ("surfaceRumble", "SurfaceRumble"),
    ] {
        vector(point, target, source, &mut missing, &mut out);
    }
    for (target, source) in [
        ("powerWatts", "PowerWatts"),
        ("torqueNewtons", "TorqueNewtons"),
        ("engineMaxRpm", "EngineMaxRpm"),
        ("engineIdleRpm", "EngineIdleRpm"),
        ("performanceIndex", "CarPerformanceIndex"),
        ("carClass", "CarClass"),
        ("drivetrainType", "DrivetrainType"),
        ("currentLap", "CurrentLap"),
        ("lastLap", "LastLap"),
        ("distanceTraveled", "DistanceTraveled"),
        ("yaw", "Yaw"),
        ("pitch", "Pitch"),
        ("roll", "Roll"),
    ] {
        optional_extra(point, target, source, &mut missing, &mut out);
    }
    for (target, source) in [
        ("suspensionTravelMeters", "SuspensionTravelMeters"),
        ("wheelRotationSpeed", "WheelRotationSpeed"),
        ("wheelOnRumbleStrip", "WheelOnRumbleStrip"),
    ] {
        optional_extra_vector(point, target, source, &mut missing, &mut out);
    }
    let mut angular = Vec::new();
    for axis in ["X", "Y", "Z"] {
        let key = format!("AngularVelocity{axis}");
        let v = point.get(&key).cloned().unwrap_or(Value::Null);
        if v.is_null() {
            missing.push(Value::String(key));
        }
        angular.push(v);
    }
    out.insert("angularVelocity".into(), Value::Array(angular));
    out.insert("missingChannels".into(), Value::Array(missing));
    out.insert(
        "sourceSchema".into(),
        point
            .get("TelemetrySchema")
            .cloned()
            .filter(|v| !v.is_null())
            .unwrap_or_else(|| Value::String("unknown".into())),
    );
    Value::Object(out)
}

pub fn export_road_capture(
    service: &TelemetryStore,
    store: &RoadStore,
    workflow_id: &str,
    run_id: &str,
) -> ApiResult<Value> {
    let workflow = store.get(workflow_id, Some("workflow"), None)?;
    let run = store.get(run_id, Some("run"), Some(workflow_id))?;
    let sid = run["sessionId"].as_str().unwrap_or("");
    let points = service
        .get_telemetry_points(sid, None)
        .map_err(|e| ApiError::new(500, e))?;
    let created = run["createdAt"].as_f64().unwrap_or(0.0);
    let captured_at = chrono::DateTime::from_timestamp(
        created.trunc() as i64,
        (created.fract().abs() * 1_000_000_000.0) as u32,
    )
    .map(|x| x.to_rfc3339())
    .unwrap_or_else(|| created.to_string());
    let event = workflow.get("event").cloned().unwrap_or_else(|| json!({}));
    let identity = workflow
        .get("identity")
        .cloned()
        .unwrap_or_else(|| json!({}));
    Ok(
        json!({"schemaVersion":"tuning-capture/v1","capturedAt":captured_at,"metadata":{"label":run_id,"purpose":"road-setup-verification","carId":identity.get("ordinal").map(Value::to_string).unwrap_or_else(||"null".into()),"gameBuild":workflow.get("gameBuild").cloned().unwrap_or_else(||Value::String("unknown".into())),"installedParts":workflow.get("configuration").cloned().unwrap_or_else(||Value::String("unknown".into())),"tireType":"unknown","surface":"unknown","weather":event.get("conditions").cloned().unwrap_or_else(||Value::String("unknown".into())),"eventType":event.get("format").cloned().unwrap_or(Value::Null),"track":event.get("name").cloned().unwrap_or(Value::Null),"shareCode":"unknown","driverAssists":event.get("driverAssists").cloned().unwrap_or_else(||Value::String("unknown".into())),"notes":"Decoded samples; see recording and parent references."},"samples":points.iter().map(|p|capture_sample(p)).collect::<Vec<_>>(),"recording":service.get_session_metadata(sid).map_err(|e|ApiError::new(500,e))?,"references":{"workflowId":workflow_id,"runId":run_id,"setupId":run["setupId"].clone(),"calibrationSchema":"tuning-calibration/v1"}}),
    )
}
