//! CVT foundation: bounded, replayable evidence hygiene, deliberately no solver.
//! These conservative gates are a versioned safety policy, not CVT calibration.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

pub const CAPTURE_VERSION: &str = "cvt-capture/v1";
pub const QUALIFICATION_VERSION: &str = "cvt-qualification/v1";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TransmissionType {
    Discrete,
    Cvt,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Capability {
    Unknown,
    Fixed,
    FinalDriveOnly,
    SimulatedGears,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Transmission {
    #[serde(rename = "type")]
    pub kind: TransmissionType,
    pub capability: Option<Capability>,
}
pub fn selected(profile: &Value) -> bool {
    // Presence also catches malformed/new selections; they must never fall back to ICE.
    profile
        .get("transmission")
        .is_some_and(|t| !t.is_null() && t["type"] != "discrete")
}
pub fn is_cvt(profile: &super::TuningCarParams) -> bool {
    profile
        .transmission
        .as_ref()
        .is_some_and(|t| t.kind == TransmissionType::Cvt)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Identity {
    pub ordinal: u32,
    pub performance_index: u32,
    pub car_class: u32,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Source {
    Unknown,
    GameVisible,
    Measurement,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SourcedValue {
    pub value: Option<f64>,
    pub source: Source,
    pub reference: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Configuration {
    pub id: Option<String>,
    pub source: Source,
    pub reference: Option<String>,
    pub installed_parts: Option<String>,
    pub final_drive: Option<SourcedValue>,
    pub final_drive_minimum: Option<SourcedValue>,
    pub final_drive_maximum: Option<SourcedValue>,
    pub tire_circumference_m: Option<SourcedValue>,
    pub ratio_minimum: Option<SourcedValue>,
    pub ratio_maximum: Option<SourcedValue>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Provenance {
    pub source: Option<String>,
    pub reference: Option<String>,
    pub captured_at: Option<String>,
    pub game_build: Option<String>,
    pub recorder_version: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Frame {
    pub timestamp_ms: Option<f64>,
    pub identity: Option<Identity>,
    pub configuration_id: Option<String>,
    pub speed_mps: Option<f64>,
    pub engine_rpm: Option<f64>,
    pub throttle: Option<f64>,
    pub brake: Option<f64>,
    pub clutch: Option<f64>,
    pub handbrake: Option<f64>,
    pub normalized_slip: Option<[f64; 4]>,
    pub gear: Option<u32>,
    pub is_race_on: Option<bool>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Capture {
    pub schema_version: String,
    pub car_id: Option<String>,
    pub identity: Option<Identity>,
    pub transmission: Option<Transmission>,
    pub configuration: Option<Configuration>,
    pub provenance: Option<Provenance>,
    pub units: Value,
    pub frames: Vec<Frame>,
}
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Status {
    Qualified,
    Missing,
    Invalid,
    Stale,
    Unsupported,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostic {
    pub status: Status,
    pub code: String,
    pub field: String,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FoundationResult {
    pub schema_version: &'static str,
    pub status: Status,
    pub capture_status: Status,
    pub diagnostics: Vec<Diagnostic>,
    pub longest_continuous_ms: f64,
    pub accepted_sample_count: usize,
    pub ratio_preview: Option<Value>,
}
impl FoundationResult {
    fn issue(&mut self, status: Status, code: &str, field: &str) {
        if !self
            .diagnostics
            .iter()
            .any(|d| d.code == code && d.field == field)
        {
            self.diagnostics.push(Diagnostic {
                status,
                code: code.into(),
                field: field.into(),
            });
        }
    }
    fn finish(mut self) -> Self {
        self.capture_status = [
            Status::Unsupported,
            Status::Stale,
            Status::Invalid,
            Status::Missing,
        ]
        .into_iter()
        .find(|s| self.diagnostics.iter().any(|d| &d.status == s))
        .unwrap_or(Status::Qualified);
        self.issue(
            Status::Unsupported,
            "solver-not-implemented",
            "ratioPreview",
        );
        self
    }
}
fn known(s: Option<&str>) -> bool {
    s.is_some_and(|s| !s.trim().is_empty() && !s.trim().eq_ignore_ascii_case("unknown"))
}
fn positive(n: f64) -> bool {
    n.is_finite() && n > 0.0
}
fn identity_valid(i: &Identity) -> bool {
    i.ordinal > 0 && (1..=999).contains(&i.performance_index) && i.car_class <= 7
}
fn same_identity(a: &Identity, b: &Identity) -> bool {
    a.ordinal == b.ordinal
        && a.performance_index == b.performance_index
        && a.car_class == b.car_class
}
fn sourced(result: &mut FoundationResult, v: Option<&SourcedValue>, field: &str) {
    match v {
        None => result.issue(Status::Missing, "value-missing", field),
        Some(v) => {
            if v.value.is_none() {
                result.issue(Status::Missing, "value-missing", field);
            } else if !v.value.is_some_and(positive) {
                result.issue(Status::Invalid, "value-invalid", field);
            }
            if matches!(v.source, Source::Unknown) || !known(v.reference.as_deref()) {
                result.issue(Status::Missing, "source-unknown", field);
            }
        }
    }
}
/// No wall clock, guessed settings, inferred transmission, or summary trust.
pub fn evaluate(profile: &Value, snapshot: &Value, raw: Option<&Value>) -> FoundationResult {
    let mut r = FoundationResult {
        schema_version: QUALIFICATION_VERSION,
        status: Status::Unsupported,
        capture_status: Status::Missing,
        diagnostics: vec![],
        longest_continuous_ms: 0.0,
        accepted_sample_count: 0,
        ratio_preview: None,
    };
    let selection: Transmission = match serde_json::from_value(profile["transmission"].clone()) {
        Ok(t) => t,
        Err(_) => {
            r.issue(Status::Unsupported, "transmission-unknown", "transmission");
            return r.finish();
        }
    };
    if selection.kind != TransmissionType::Cvt || profile["isElectric"] == true {
        r.issue(
            Status::Unsupported,
            "powertrain-transmission-combination",
            "transmission",
        );
    }
    match selection.capability {
        Some(Capability::FinalDriveOnly) => (),
        Some(Capability::Fixed) => r.issue(
            Status::Unsupported,
            "transmission-locked",
            "transmission.capability",
        ),
        Some(Capability::SimulatedGears) => r.issue(
            Status::Unsupported,
            "simulated-gears-not-supported",
            "transmission.capability",
        ),
        _ => r.issue(
            Status::Missing,
            "capability-unknown",
            "transmission.capability",
        ),
    }
    let Some(raw) = raw else {
        r.issue(Status::Missing, "raw-capture-required", "capture");
        return r.finish();
    };
    // Bound before allocating the typed capture. Persisted raw JSON is replayed identically.
    if !raw["frames"]
        .as_array()
        .is_some_and(|f| !f.is_empty() && f.len() <= 30000)
    {
        r.issue(Status::Invalid, "frames-out-of-bounds", "frames");
        return r.finish();
    }
    let c: Capture = match serde_json::from_value(raw.clone()) {
        Ok(c) => c,
        Err(_) => {
            r.issue(Status::Invalid, "capture-schema-invalid", "capture");
            return r.finish();
        }
    };
    if c.schema_version != CAPTURE_VERSION {
        r.issue(
            Status::Unsupported,
            "capture-version-unsupported",
            "schemaVersion",
        );
    }
    if c.units
        != json!({"timestamp":"ms","speed":"m/s","rpm":"rpm","controls":"byte","slip":"normalized-ratio"})
    {
        r.issue(Status::Invalid, "units-mismatch", "units");
    }
    if c.transmission.as_ref() != Some(&selection) {
        r.issue(Status::Stale, "transmission-changed", "transmission");
    }
    match (&c.identity, c.car_id.as_deref()) {
        (Some(i), Some(car)) if identity_valid(i) && i.ordinal.to_string() == car => {
            if snapshot["carId"] != car
                || !super::evidence::equivalent(
                    &snapshot["identity"],
                    &serde_json::to_value(i).unwrap(),
                )
            {
                r.issue(Status::Stale, "identity-changed", "identity");
            }
        }
        _ => r.issue(Status::Missing, "identity-incomplete", "identity"),
    }
    if !c.provenance.as_ref().is_some_and(|p| {
        matches!(
            p.source.as_deref(),
            Some("raw-udp" | "decoded-websocket" | "session-replay")
        ) && known(p.reference.as_deref())
    }) {
        r.issue(Status::Missing, "capture-source-unknown", "provenance");
    }
    let config_id = c.configuration.as_ref().and_then(|s| s.id.as_deref());
    if let Some(config) = &c.configuration {
        if !known(config_id)
            || matches!(config.source, Source::Unknown)
            || !known(config.reference.as_deref())
            || !known(config.installed_parts.as_deref())
        {
            r.issue(
                Status::Missing,
                "configuration-source-unknown",
                "configuration",
            );
        }
        if !super::evidence::equivalent(
            &snapshot["cvtConfiguration"],
            &serde_json::to_value(config).unwrap(),
        ) {
            r.issue(Status::Stale, "configuration-changed", "configuration");
        }
        sourced(
            &mut r,
            config.final_drive.as_ref(),
            "configuration.finalDrive",
        );
        sourced(
            &mut r,
            config.final_drive_minimum.as_ref(),
            "configuration.finalDriveMinimum",
        );
        sourced(
            &mut r,
            config.final_drive_maximum.as_ref(),
            "configuration.finalDriveMaximum",
        );
        if let (Some(fd), Some(min), Some(max)) = (
            config.final_drive.as_ref().and_then(|s| s.value),
            config.final_drive_minimum.as_ref().and_then(|s| s.value),
            config.final_drive_maximum.as_ref().and_then(|s| s.value),
        ) {
            if min >= max || fd < min || fd > max {
                r.issue(
                    Status::Invalid,
                    "final-drive-limits-invalid",
                    "configuration",
                );
            }
        }
        sourced(
            &mut r,
            config.tire_circumference_m.as_ref(),
            "configuration.tireCircumferenceM",
        );
        sourced(
            &mut r,
            config.ratio_minimum.as_ref(),
            "configuration.ratioMinimum",
        );
        sourced(
            &mut r,
            config.ratio_maximum.as_ref(),
            "configuration.ratioMaximum",
        );
        if let (Some(min), Some(max)) = (
            config.ratio_minimum.as_ref().and_then(|s| s.value),
            config.ratio_maximum.as_ref().and_then(|s| s.value),
        ) {
            if min >= max {
                r.issue(Status::Invalid, "ratio-limits-invalid", "configuration");
            }
        }
    } else {
        r.issue(Status::Missing, "configuration-missing", "configuration");
    }
    let (mut previous, mut since, mut segment_count, mut longest_count) = (None, None, 0, 0);
    let mut previous_loaded: Option<(f64, f64, u32)> = None;
    for f in &c.frames {
        if !f
            .identity
            .as_ref()
            .zip(c.identity.as_ref())
            .is_some_and(|(a, b)| identity_valid(a) && same_identity(a, b))
        {
            r.issue(Status::Stale, "frame-identity-changed", "frames.identity");
        }
        if f.configuration_id.as_deref() != config_id || !known(f.configuration_id.as_deref()) {
            r.issue(
                Status::Stale,
                "frame-configuration-changed",
                "frames.configurationId",
            );
        }
        let channels = [
            f.timestamp_ms,
            f.speed_mps,
            f.engine_rpm,
            f.throttle,
            f.brake,
            f.clutch,
            f.handbrake,
        ];
        if channels.iter().any(Option::is_none)
            || f.normalized_slip.is_none()
            || f.gear.is_none()
            || f.is_race_on.is_none()
        {
            r.issue(Status::Missing, "channel-missing", "frames");
            since = None;
            segment_count = 0;
            continue;
        }
        let [t, speed, rpm, throttle, brake, clutch, handbrake] = channels.map(Option::unwrap);
        let slip = f.normalized_slip.unwrap();
        if !channels
            .into_iter()
            .flatten()
            .chain(slip)
            .all(f64::is_finite)
            || t < 0.0
            || t.fract() != 0.0
            || speed < 0.0
            || rpm < 0.0
            || [throttle, brake, clutch, handbrake]
                .iter()
                .any(|v| !(0.0..=255.0).contains(v))
        {
            r.issue(Status::Invalid, "channel-invalid", "frames");
            since = None;
            segment_count = 0;
            continue;
        }
        if let Some(last) = previous {
            if t <= last {
                r.issue(
                    Status::Invalid,
                    "timestamp-not-increasing",
                    "frames.timestampMs",
                );
                since = None;
                segment_count = 0;
            } else if t - last > 250.0 {
                r.issue(
                    Status::Invalid,
                    "time-window-interrupted",
                    "frames.timestampMs",
                );
                since = None;
                segment_count = 0;
            }
        }
        previous = Some(t);
        let usable = speed >= 5.0
            && positive(rpm)
            && throttle >= 250.0
            && brake == 0.0
            && clutch == 0.0
            && handbrake == 0.0
            && slip.iter().all(|v| v.abs() <= 0.1)
            && f.is_race_on == Some(true)
            && f.gear.is_some_and(|g| (1..=10).contains(&g));
        if !usable {
            since = None;
            segment_count = 0;
            previous_loaded = None;
            continue;
        }
        if previous_loaded.is_some_and(|(last_rpm, last_speed, last_gear)| {
            (rpm - last_rpm).abs() > last_rpm * 0.1
                || speed < last_speed
                || f.gear != Some(last_gear)
        }) {
            since = None;
            segment_count = 0;
        }
        previous_loaded = Some((rpm, speed, f.gear.unwrap()));
        let start = *since.get_or_insert(t);
        segment_count += 1;
        if t - start >= r.longest_continuous_ms {
            r.longest_continuous_ms = t - start;
            longest_count = segment_count;
        }
    }
    r.accepted_sample_count = longest_count;
    if r.longest_continuous_ms < 1000.0 || longest_count < 30 {
        r.issue(
            Status::Missing,
            "continuous-loaded-window-required",
            "frames",
        );
    }
    r.finish()
}
