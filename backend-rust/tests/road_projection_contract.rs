use fh6_backend::road::RoadStore;
use rusqlite::{params, Connection};
use serde_json::{json, Value};

#[test]
fn road_list_projection_preserves_document_contract_and_get_capture() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("road.sqlite");
    let store = RoadStore::new(path.to_string_lossy()).unwrap();

    let large_capture = Value::String("x".repeat(256 * 1024));
    let mut with_capture = RoadStore::document(
        "setup",
        "workflow-a",
        &json!({"label":"with-capture", "capture":large_capture}),
        Some("with-capture"),
    );
    with_capture["createdAt"] = json!(1.0);
    let mut missing_capture = RoadStore::document(
        "setup",
        "workflow-a",
        &json!({"label":"missing-capture"}),
        Some("missing-capture"),
    );
    missing_capture["createdAt"] = json!(2.0);
    let mut null_capture = RoadStore::document(
        "setup",
        "workflow-a",
        &json!({"label":"null-capture", "capture":null}),
        Some("null-capture"),
    );
    null_capture["createdAt"] = json!(3.0);
    let mut other_workflow = RoadStore::document(
        "setup",
        "workflow-b",
        &json!({"label":"other-workflow"}),
        Some("other-workflow"),
    );
    other_workflow["createdAt"] = json!(0.0);
    store
        .append_documents(&[
            with_capture.clone(),
            missing_capture.clone(),
            null_capture,
            other_workflow,
        ])
        .unwrap();

    // Legacy/corrupt-but-valid JSON roots can exist in the document column; projection must
    // leave scalar and array roots intact just as SQLite json_remove did in the Python store.
    let connection = Connection::open(&path).unwrap();
    for (id, created_at, document) in [
        ("root-scalar", 4.0, "17"),
        ("root-array", 5.0, r#"["kept",null]"#),
    ] {
        connection
            .execute(
                "INSERT INTO road_documents VALUES (?1, ?2, ?3, ?4, ?5)",
                params![id, "workflow-a", "setup", created_at, document],
            )
            .unwrap();
    }
    drop(connection);

    assert_eq!(
        store
            .get("with-capture", Some("setup"), Some("workflow-a"))
            .unwrap(),
        with_capture
    );
    let projected = store.list(Some("workflow-a"), Some("setup"), true).unwrap();
    assert_eq!(
        projected
            .iter()
            .map(|document| document["label"].as_str().unwrap_or("root"))
            .collect::<Vec<_>>(),
        [
            "with-capture",
            "missing-capture",
            "null-capture",
            "root",
            "root"
        ]
    );
    assert!(projected[0].get("capture").is_none());
    assert!(projected[1].get("capture").is_none());
    assert!(projected[2].get("capture").is_none());
    assert_eq!(projected[3], json!(17));
    assert_eq!(projected[4], json!(["kept", null]));

    let full = store
        .list(Some("workflow-a"), Some("setup"), false)
        .unwrap();
    assert_eq!(full[0]["capture"], with_capture["capture"]);
    assert_eq!(full[1].get("capture"), None);
    assert_eq!(full[2]["capture"], Value::Null);
}
