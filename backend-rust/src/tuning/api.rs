//! Desktop-local calculation dispatch. Called before acquiring receiver locks.
use crate::{
    error::{ApiError, ApiResult},
    network::{ApiRequest, ApiResponse},
};
use serde_json::json;
pub fn request(
    request: &ApiRequest,
    evidence: &super::evidence::EvidenceService,
) -> ApiResult<Option<ApiResponse>> {
    if request.method == "POST" && request.path == "/api/tuning/engine-archive" {
        return Ok(Some(ApiResponse::json(
            crate::tuning::measurement::parse_archive(&request.json()?),
        )));
    }
    if request.method == "POST" && request.path == "/api/tuning/profile" {
        return Ok(Some(ApiResponse::json(crate::tuning::profile::normalize(
            &request.json()?,
        ))));
    }
    if request.method == "POST" && request.path == "/api/tuning/ev-profile" {
        return Ok(Some(ApiResponse::json(
            json!({"ready":crate::tuning::profile::ev_ready(&request.json()?)}),
        )));
    }
    if request.method == "POST" && request.path == "/api/tuning/exploration" {
        return Ok(Some(ApiResponse::json(
            json!({"value":crate::tuning::profile::exploration(&request.json()?)}),
        )));
    }
    if request.method == "POST" && request.path == "/api/tuning/developer" {
        let input = request.json()?;
        let output =
            crate::tuning::developer::calculate(&input).map_err(|e| ApiError::invalid(&e))?;
        return Ok(Some(ApiResponse::json(
            json!({"modelVersion":crate::tuning::developer::MODEL_VERSION,"output":output,"capabilityContract":crate::tuning::capabilities::contract(&input["car"])}),
        )));
    }
    if request.method == "POST" && request.path == "/api/tuning/ev-batch" {
        let result = crate::tuning::ev_measurement::batch(&request.json()?)
            .map_err(|e| ApiError::invalid(&e))?;
        return Ok(Some(ApiResponse::json(result)));
    }
    if request.method == "POST" && request.path == "/api/tuning/tire-evidence" {
        let input = request.json()?;
        let samples = input["samples"]
            .as_array()
            .filter(|s| s.len() <= 30000)
            .ok_or_else(|| ApiError::invalid("Bounded samples are required"))?;
        return Ok(Some(ApiResponse::json(
            crate::tuning::tire_evidence::observe(samples, &input["identity"]),
        )));
    }
    if request.method == "POST" && request.path == "/api/tuning/engine-analysis" {
        return Ok(Some(ApiResponse::json(
            crate::tuning::measurement::analyze(&request.json()?),
        )));
    }
    if request.method == "POST" && request.path == "/api/tuning/engine-batch" {
        let result = crate::tuning::measurement::batch(&request.json()?)
            .map_err(|e| ApiError::invalid(&e))?;
        return Ok(Some(ApiResponse::json(result)));
    }
    if request.method == "POST" && request.path == "/api/tuning/workflow" {
        let input: crate::tuning::workflow::WorkflowRequest =
            serde_json::from_value(request.json()?)
                .map_err(|error| ApiError::invalid(&error.to_string()))?;
        let result = evidence.calculate(input)?;
        return Ok(Some(ApiResponse::json(serde_json::to_value(result)?)));
    }
    if request.method == "POST" && request.path == "/api/tuning/ev-gearing" {
        return Ok(Some(ApiResponse::json(
            evidence.ev_gearing(&request.json()?)?,
        )));
    }
    if request.method == "POST" && request.path == "/api/tuning/ev-preview" {
        let input: crate::tuning::ev::EvGearingInput = serde_json::from_value(request.json()?)
            .map_err(|e| ApiError::invalid(&e.to_string()))?;
        return Ok(Some(ApiResponse::json(
            json!({"evidenceStatus":"unverified-preview","result":crate::tuning::ev::calculate_ev_gearing(&input)}),
        )));
    }
    if request.method == "POST" && request.path == "/api/tuning/mechanical" {
        let input: crate::tuning::calculation::MechanicalRequest =
            serde_json::from_value(request.json()?)
                .map_err(|error| ApiError::invalid(&error.to_string()))?;
        let result =
            crate::tuning::calculation::calculate_mechanical(&input).map_err(ApiError::invalid)?;
        return Ok(Some(ApiResponse::json(serde_json::to_value(result)?)));
    }
    if request.method == "POST" && request.path == "/api/tuning/dyno-peaks" {
        return Ok(Some(ApiResponse::json(super::dyno_guidance::import_peaks(
            &request.json()?,
        ))));
    }
    if request.method == "POST" && request.path == "/api/tuning/dyno-gear" {
        return Ok(Some(ApiResponse::json(
            super::dyno_guidance::recommended_gear(&request.json()?),
        )));
    }
    if request.method == "POST" && request.path == "/api/tuning/ev-evidence" {
        return Ok(Some(ApiResponse::json(evidence.save_ev(&request.json()?)?)));
    }
    Ok(None)
}
