//! Local EV discovery and immutable raw replay. Metadata never qualifies a capture.
use super::evidence::{EvidenceRequest, EvidenceService};
use crate::error::{ApiError, ApiResult};
use rusqlite::{Connection, OpenFlags};
use serde_json::{json, Value};

pub fn powertrain(profile: &Value) -> Value {
    json!({"drivetrain":profile["drivetrain"],"maxHp":profile["maxHp"],"maxTorque":profile["maxTorque"]})
}
pub fn valid_powertrain(p: &Value) -> bool {
    p.as_object().is_some_and(|p| p.len() == 3)
        && matches!(p["drivetrain"].as_str(), Some("AWD" | "RWD" | "FWD"))
        && ["maxHp", "maxTorque"].iter().all(|key| {
            p.get(key).is_some_and(|v| {
                v.is_null() || v.as_f64().is_some_and(|n| n.is_finite() && n >= 0.0)
            })
        })
}
impl EvidenceService {
    /// Bounded, parameterized metadata-only query; a cold lookup cannot create a store.
    pub fn list_ev(&self, car_id: &str) -> ApiResult<Value> {
        if !std::path::Path::new(&self.store.db_path).exists() {
            return Ok(json!([]));
        }
        let c = Connection::open_with_flags(&self.store.db_path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
        let mut query = c.prepare("SELECT json_object('evidenceId', id, 'carId', json_extract(document,'$.car_id'), 'identity', json_extract(document,'$.identity'), 'setup', json_extract(document,'$.setup'), 'powertrain', json_extract(document,'$.ev_powertrain'), 'savedAt', created_at) FROM road_documents WHERE kind='tuning-evidence/v1' AND json_extract(document,'$.powertrain')='ev' AND json_extract(document,'$.car_id')=?1 ORDER BY created_at DESC, rowid DESC LIMIT 100")?;
        let rows = query.query_map([car_id], |r| r.get::<_, String>(0))?;
        let mut result = vec![];
        for row in rows {
            result.push(serde_json::from_str::<Value>(&row?)?);
        }
        Ok(json!(result))
    }
    pub fn read_ev(&self, evidence_id: &str) -> ApiResult<Value> {
        let proof = self.resolve(&EvidenceRequest::SavedEv {
            evidence_id: evidence_id.into(),
        })?;
        Ok(json!({"metadata":proof.ev_metadata(),"state":serde_json::to_value(&proof)?["summary"]}))
    }
    pub fn select_ev(&self, input: &Value) -> ApiResult<Value> {
        let id = input["evidenceId"]
            .as_str()
            .ok_or_else(|| ApiError::invalid("EV evidenceId required"))?;
        let proof = self.resolve(&EvidenceRequest::SavedEv {
            evidence_id: id.into(),
        })?;
        proof
            .confirm_ev(&input["confirmation"])
            .map_err(|e| ApiError::conflict(&e))?;
        let metadata = proof.ev_metadata();
        let saved: Value = serde_json::to_value(&proof)?;
        let raw = self.store.get_read_only(
            saved["observation"]["id"].as_str().unwrap(),
            Some("ev-observation/v1"),
            Some("ev-observations"),
        )?;
        let batch = super::ev_measurement::batch(
            &json!({"schemaVersion":"ev-batch/v1","state":saved["summary"],"frames":[]}),
        )
        .map_err(|e| ApiError::invalid(&e))?;
        Ok(
            json!({"evidenceId":id,"metadata":metadata,"capture":raw["capture"],"state":batch["state"],"readyGears":batch["readyGears"],"diagnostics":batch["diagnostics"]}),
        )
    }
    /// Accept only bounded raw recordings. Export summaries/results are intentionally ignored.
    pub fn import_ev(&self, input: &Value) -> ApiResult<Value> {
        if input.get("schemaVersion").is_some() {
            return Err(ApiError::invalid("Unsupported raw EV capture schema"));
        }
        let raw = if input["schema"] == "ev-capture/v1" {
            let car = input
                .get("carId")
                .or_else(|| input["measurement"].get("carId"))
                .and_then(Value::as_str)
                .ok_or_else(|| ApiError::invalid("EV capture carId required"))?;
            json!({"kind":"ev-capture","carId":car,"setup":input["setup"],"frames":input["frames"],"powertrain":input["powertrain"],"recording":input["recording"]})
        } else if input.get("schema").is_none() && input["kind"] == "ev-capture" {
            input.clone()
        } else {
            return Err(ApiError::invalid("Unsupported raw EV capture schema"));
        };
        self.save_ev(&raw)
    }
}
