use super::super::types::GearingResult;

/// Explicit caller-owned numeric constraints. A range does not establish its provenance.
#[derive(Debug, Clone, Copy, serde::Serialize, serde::Deserialize)]
pub struct RatioRange {
    pub min: f64,
    pub max: f64,
    pub step: f64,
}

#[derive(Debug, Clone, Copy, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RatioBounds {
    pub final_drive: RatioRange,
    pub gears: RatioRange,
}

/// Candidate diagnostics must name target/actual/rounding error, constraint and
/// evidence source. The model owns those semantics, not the allocation helper.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CandidateGearingResult {
    pub gearing: GearingResult,
    pub diagnostics: serde_json::Value,
}
