use fh6_backend::{
    app::App,
    network::{ApiRequest, Backend},
};
use serde_json::{json, Value};

fn call(app: &App, method: &str, path: &str, body: Value) -> fh6_backend::error::ApiResult<Value> {
    let request = ApiRequest {
        method: method.into(),
        path: path.into(),
        query: Default::default(),
        headers: Default::default(),
        upload_filename: None,
        body: serde_json::to_vec(&body).unwrap(),
    };
    let response = app.request(request)?;
    serde_json::from_slice(&response.body)
        .map_err(|e| fh6_backend::error::ApiError::invalid(&e.to_string()))
}

#[test]
fn archives_preserve_original_records_and_database_across_reads_and_restart() {
    let temp = tempfile::tempdir().unwrap();
    let app = App::new(temp.path()).unwrap();
    let mut originals = Vec::new();
    for (index, formula) in [
        "tuningMath/measured-workflow-v1",
        "ev/measured-workflow-v1",
        "rust/ice-measured-workflow-v1",
        "rust/ice-measured-workflow-v2",
        "rust/ice-measured-workflow-v3",
    ]
    .iter()
    .enumerate()
    {
        originals.push(app.tuning_evidence.store.append("compatibility", "compatibility", &json!({"discipline":"Rally","capture":{"frames":[{"rpm":3000}]},"recommendation":{"formulaVersion":formula,"inputSnapshot":{"carId":"1435","goal":"Rally"},"fields":{"gearing.finalDrive":{"value":3.52,"unit":"ratio"}}}}), Some(&format!("retired-{index}"))).unwrap());
    }
    app.tuning_evidence.store.append("compatibility", "compatibility", &json!({"recommendation":{"formulaVersion":"rust/ice-measured-workflow-v4","inputSnapshot":{"gearingModelVersion":"aego-rally-joint/v1"}}}), Some("current")).unwrap();
    originals.push(app.tuning_evidence.store.append("compatibility", "compatibility", &json!({"recommendation":{"formulaVersion":"rust/ice-measured-workflow-v4","inputSnapshot":{"gearingModelVersion":"aego-rally/v1"}}}), Some("old-model-new-envelope")).unwrap());
    let active = call(&app, "GET", "/api/road/compatibility", Value::Null).unwrap();
    assert_eq!(active.as_array().unwrap().len(), 1);
    assert_eq!(active[0]["id"], "current");
    let db_path = app.tuning_evidence.store.db_path.clone();
    let before = std::fs::read(&db_path).unwrap();
    for _ in 0..2 {
        let archive = call(&app, "GET", "/api/road/archives", Value::Null).unwrap();
        assert_eq!(archive.as_array().unwrap().len(), originals.len());
        for original in &originals {
            let item = archive
                .as_array()
                .unwrap()
                .iter()
                .find(|item| item["record"]["id"] == original["id"])
                .unwrap();
            assert_eq!(item["record"], *original);
            assert_eq!(item["validated"], false);
            assert_eq!(item["status"], "retired");
        }
        assert_eq!(std::fs::read(&db_path).unwrap(), before);
    }
    drop(app);
    let restarted = App::new(temp.path()).unwrap();
    assert_eq!(
        call(&restarted, "GET", "/api/road/archives", Value::Null)
            .unwrap()
            .as_array()
            .unwrap()
            .len(),
        originals.len()
    );
    assert_eq!(std::fs::read(&db_path).unwrap(), before);
}

#[test]
fn archived_workflows_cannot_start_runs() {
    let temp = tempfile::tempdir().unwrap();
    let app = App::new(temp.path()).unwrap();
    app.tuning_evidence.store.append("workflow", "old-road", &json!({"recommendation":{"formulaVersion":"rust/ice-measured-workflow-v2","inputSnapshot":{"goal":"Road"}}}), Some("old-road")).unwrap();
    let child = app
        .tuning_evidence
        .store
        .append(
            "setup",
            "old-road",
            &json!({"fields":{"gearing.finalDrive":3.52},"capture":{"frames":[{"rpm":3000}]}}),
            Some("old-setup"),
        )
        .unwrap();
    let before = std::fs::read(&app.tuning_evidence.store.db_path).unwrap();
    let archive = call(&app, "GET", "/api/road/archives", Value::Null).unwrap();
    assert!(archive[0]["documents"]
        .as_array()
        .unwrap()
        .iter()
        .any(|doc| doc == &child));
    assert!(call(&app, "GET", "/api/road/workflows", Value::Null)
        .unwrap()
        .as_array()
        .unwrap()
        .is_empty());
    assert_eq!(
        call(&app, "POST", "/api/road/workflows/old-road/runs", json!({}))
            .unwrap_err()
            .status,
        410
    );
    assert_eq!(
        std::fs::read(&app.tuning_evidence.store.db_path).unwrap(),
        before
    );
    assert!(
        !call(&app, "GET", "/api/road/workflows/old-road", Value::Null)
            .unwrap()
            .as_array()
            .unwrap()
            .is_empty()
    );
}
