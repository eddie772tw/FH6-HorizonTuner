use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Drivetrain {
    AWD,
    RWD,
    FWD,
}

impl Default for Drivetrain {
    fn default() -> Self {
        Self::RWD
    }
}

impl Drivetrain {
    pub fn from_str_loose(s: &str) -> Self {
        match s.trim().to_uppercase().as_str() {
            "AWD" => Self::AWD,
            "FWD" => Self::FWD,
            _ => Self::RWD,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RaceGoal {
    Road,
    Drift,
    Rally,
    Drag,
    DangerSign,
}

impl Default for RaceGoal {
    fn default() -> Self {
        Self::Road
    }
}

impl RaceGoal {
    pub fn from_str_loose(s: &str) -> Self {
        match s.trim().to_lowercase().as_str() {
            "drift" => Self::Drift,
            "rally" => Self::Rally,
            "drag" => Self::Drag,
            "dangersign" | "danger_sign" => Self::DangerSign,
            _ => Self::Road,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum RallyProfile {
    #[serde(rename = "mixed-surface")]
    MixedSurface,
    #[serde(rename = "cross-country")]
    CrossCountry,
}

impl Default for RallyProfile {
    fn default() -> Self {
        Self::MixedSurface
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GearingSecondaryCorrection {
    pub simulated_top_speed: Option<f64>,
    pub soft_max_speed: Option<f64>,
    pub drag_finish_speed_kmh: Option<f64>,
    pub drag_finish_speed_provenance: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TuningCarParams {
    pub weight: Option<f64>,
    #[serde(alias = "weightDistribution")]
    pub weight_distribution: Option<f64>,
    pub drivetrain: Option<String>,
    #[serde(alias = "roadAwdRearPercent")]
    pub road_awd_rear_percent: Option<f64>,
    pub induction: Option<String>,
    #[serde(alias = "max_hp", alias = "maxHp")]
    pub max_hp: Option<f64>,
    #[serde(alias = "max_torque", alias = "maxTorque")]
    pub max_torque: Option<f64>,
    #[serde(alias = "max_hp_rpm", alias = "maxHpRpm")]
    pub max_hp_rpm: Option<f64>,
    #[serde(alias = "max_torque_rpm", alias = "maxTorqueRpm")]
    pub max_torque_rpm: Option<f64>,
    #[serde(alias = "drag_finish_speed_kmh", alias = "dragFinishSpeedKmh")]
    pub drag_finish_speed_kmh: Option<f64>,
    #[serde(
        alias = "drag_finish_speed_provenance",
        alias = "dragFinishSpeedProvenance"
    )]
    pub drag_finish_speed_provenance: Option<String>,
    #[serde(alias = "aero_efficiency", alias = "aeroEfficiency")]
    pub aero_efficiency: Option<f64>,
    #[serde(alias = "aeroDownforceFront")]
    pub aero_downforce_front: Option<f64>,
    #[serde(alias = "aeroDownforceRear")]
    pub aero_downforce_rear: Option<f64>,
    #[serde(alias = "front_tire_width", alias = "frontTireWidth")]
    pub front_tire_width: Option<f64>,
    #[serde(alias = "front_tire_aspect", alias = "frontTireAspect")]
    pub front_tire_aspect: Option<f64>,
    #[serde(alias = "front_tire_rim", alias = "frontTireRim")]
    pub front_tire_rim: Option<f64>,
    #[serde(alias = "rear_tire_width", alias = "rearTireWidth")]
    pub rear_tire_width: Option<f64>,
    #[serde(alias = "rear_tire_aspect", alias = "rearTireAspect")]
    pub rear_tire_aspect: Option<f64>,
    #[serde(alias = "rear_tire_rim", alias = "rearTireRim")]
    pub rear_tire_rim: Option<f64>,
    #[serde(alias = "rallyProfile")]
    pub rally_profile: Option<RallyProfile>,
    pub spring_front_min: Option<f64>,
    pub spring_front_max: Option<f64>,
    pub spring_rear_min: Option<f64>,
    pub spring_rear_max: Option<f64>,
    pub height_front_min: Option<f64>,
    pub height_front_max: Option<f64>,
    pub height_rear_min: Option<f64>,
    pub height_rear_max: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ArbResult {
    pub front: f64,
    pub rear: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SpringsResult {
    pub front: f64,
    pub rear: f64,
    pub height_f: f64,
    pub height_r: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DampingResult {
    pub rebound_f: f64,
    pub rebound_r: f64,
    pub bump_f: f64,
    pub bump_r: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DiffResult {
    pub accel_f: f64,
    pub decel_f: f64,
    pub accel_r: f64,
    pub decel_r: f64,
    pub center_rear: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ChassisTuningResult {
    pub arb: ArbResult,
    pub springs: SpringsResult,
    pub damping: DampingResult,
    pub diff: DiffResult,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GearingResult {
    pub final_drive: f64,
    pub gears: Vec<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unsupported: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unsupported_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AeroDownforceResult {
    pub front: f64,
    pub rear: f64,
}
