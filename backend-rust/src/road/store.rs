use crate::error::{ApiError, ApiResult};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

pub const ROAD_SCHEMA: &str = "road-workflow/v1";
#[derive(Clone)]
pub struct RoadStore {
    pub db_path: String,
}
impl RoadStore {
    pub fn new(path: impl Into<String>) -> ApiResult<Self> {
        let s = Self {
            db_path: path.into(),
        };
        let c = s.connect()?;
        c.execute_batch("CREATE TABLE IF NOT EXISTS road_documents (id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL, kind TEXT NOT NULL, created_at REAL NOT NULL, document TEXT NOT NULL); CREATE INDEX IF NOT EXISTS road_workflow_idx ON road_documents(workflow_id, created_at);")?;
        Ok(s)
    }
    fn connect(&self) -> ApiResult<Connection> {
        Ok(Connection::open(&self.db_path)?)
    }
    pub fn document(kind: &str, wf: &str, payload: &Value, id: Option<&str>) -> Value {
        let mut o = payload.as_object().cloned().unwrap_or_default();
        o.insert(
            "id".into(),
            Value::String(id.unwrap_or_else(|| "").to_owned()),
        );
        if id.is_none() {
            o.insert(
                "id".into(),
                Value::String(Uuid::new_v4().simple().to_string()),
            );
        }
        o.insert("workflowId".into(), Value::String(wf.to_owned()));
        o.insert("kind".into(), Value::String(kind.to_owned()));
        o.insert("schema".into(), Value::String(ROAD_SCHEMA.into()));
        o.insert(
            "createdAt".into(),
            json!(SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs_f64()),
        );
        Value::Object(o)
    }
    pub fn append(
        &self,
        kind: &str,
        wf: &str,
        payload: &Value,
        id: Option<&str>,
    ) -> ApiResult<Value> {
        let d = Self::document(kind, wf, payload, id);
        self.append_documents(std::slice::from_ref(&d))?;
        Ok(d)
    }
    pub fn append_documents(&self, docs: &[Value]) -> ApiResult<()> {
        let mut c = self.connect()?;
        let tx = c.transaction()?;
        for d in docs {
            let o = d
                .as_object()
                .ok_or_else(|| ApiError::invalid("Road document must be an object"))?;
            let id = o.get("id").and_then(Value::as_str).unwrap_or("");
            let wf = o.get("workflowId").and_then(Value::as_str).unwrap_or("");
            let kind = o.get("kind").and_then(Value::as_str).unwrap_or("");
            let at = o.get("createdAt").and_then(Value::as_f64).unwrap_or(0.0);
            let encoded = serde_json::to_string(d)?;
            tx.execute(
                "INSERT INTO road_documents VALUES (?1,?2,?3,?4,?5)",
                params![id, wf, kind, at, encoded],
            )?;
        }
        tx.commit()?;
        Ok(())
    }
    pub fn save_engine(&self, payload: &Value) -> ApiResult<Value> {
        let obs = &payload["observation"];
        let id = obs["id"]
            .as_str()
            .ok_or_else(|| ApiError::invalid("Observation ID is required"))?;
        let d = Self::document(
            "engine-observation",
            "engine-observations",
            payload,
            Some(id),
        );
        let mut c = self.connect()?;
        let tx = c.transaction()?;
        let old: Option<String> = tx
            .query_row(
                "SELECT document FROM road_documents WHERE id=?1",
                [id],
                |r| r.get(0),
            )
            .optional()?;
        if let Some(s) = old {
            let x: Value = serde_json::from_str(&s)?;
            if x["observation"] != *obs || x["capture"] != payload["capture"] {
                return Err(ApiError::conflict(
                    "An immutable observation already uses this ID",
                ));
            }
        } else {
            let o = d.as_object().unwrap();
            tx.execute(
                "INSERT INTO road_documents VALUES (?1,?2,?3,?4,?5)",
                params![
                    id,
                    "engine-observations",
                    "engine-observation",
                    o["createdAt"].as_f64().unwrap_or(0.0),
                    serde_json::to_string(&d)?
                ],
            )?;
        }
        tx.commit()?;
        Ok(obs.clone())
    }
    pub fn get(&self, id: &str, kind: Option<&str>, wf: Option<&str>) -> ApiResult<Value> {
        let c = self.connect()?;
        let s: String = c
            .query_row(
                "SELECT document FROM road_documents WHERE id=?1",
                [id],
                |r| r.get(0),
            )
            .optional()?
            .ok_or_else(|| ApiError::conflict("Saved Road item was not found"))?;
        let d: Value = serde_json::from_str(&s)?;
        if kind.is_some_and(|k| d["kind"].as_str() != Some(k))
            || wf.is_some_and(|w| d["workflowId"].as_str() != Some(w))
        {
            return Err(ApiError::conflict(
                "Saved item belongs to a different Road workflow or item type",
            ));
        }
        Ok(d)
    }
    pub fn list(
        &self,
        wf: Option<&str>,
        kind: Option<&str>,
        exclude_capture: bool,
    ) -> ApiResult<Vec<Value>> {
        let c = self.connect()?;
        let (q,args):(String,Vec<String>)=match (wf,kind){(Some(w),Some(k))=> ("SELECT document FROM road_documents WHERE workflow_id=?1 AND kind=?2 ORDER BY created_at,rowid".into(),vec![w.into(),k.into()]),(Some(w),None)=>("SELECT document FROM road_documents WHERE workflow_id=?1 ORDER BY created_at,rowid".into(),vec![w.into()]),(None,Some(k))=>("SELECT document FROM road_documents WHERE kind=?1 ORDER BY created_at,rowid".into(),vec![k.into()]),(None,None)=>("SELECT document FROM road_documents ORDER BY created_at,rowid".into(),vec![])};
        let mut st = c.prepare(&q)?;
        let rows = st.query_map(rusqlite::params_from_iter(args.iter()), |r| {
            r.get::<_, String>(0)
        })?;
        let mut out = Vec::new();
        for row in rows {
            let mut d: Value = serde_json::from_str(&row?)?;
            if exclude_capture {
                if let Some(o) = d.as_object_mut() {
                    o.remove("capture");
                }
            }
            out.push(d);
        }
        Ok(out)
    }
}
