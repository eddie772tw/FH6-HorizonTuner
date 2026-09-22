# Road domain handoff

The Rust Road domain is in `backend-rust/src/road/`. It keeps the Python wire
documents as `serde_json::Value`; no route or persisted document is converted to
a lossy Rust DTO.

## Integration API

`RoadService::new(Arc<TelemetryStore>, RoadStore)` owns the low-rate workflow
state. `handle(method, path, body)` accepts either `/api/road/...` or the path
after the `/api/road` prefix. `observe(&Value)` only updates memory and queues
frames; `maintain()` and `shutdown()` flush a batch through
`TelemetryStore::insert_points_batch`, so UDP/network receive paths do not wait
for SQLite. `live()` reports identity freshness, active run, queued/persisted
sample count and state. `record()` aliases `observe()` for runtime adapters.

The RoadStore schema is unchanged:

```sql
road_documents(id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL,
  kind TEXT NOT NULL, created_at REAL NOT NULL, document TEXT NOT NULL)
```

`RoadStore::document`, `append`, `append_documents`, `get`, `list`, and
`save_engine` preserve the Python IDs, `workflowId`, `kind`, `schema`,
`createdAt`, immutable engine evidence, ordering, and atomic linked writes.

`summarize_road_observations` and `summarize_laps` preserve the descriptive
`road-observations/v1` output, quality weights, wheel distributions/events,
lap attribution and per-lap quality fields. `local_comparison` implements the
bounded spatial matching contract (`road-spatial/v1`). `compare_road_runs`
persists descriptive comparison evidence. `capture_sample` and
`export_road_capture` preserve `tuning-capture/v1`, including explicit missing
channel lists and fixed four-wheel vectors.

## Golden and validation coverage

`backend-rust/tests/road_contract.rs` covers analysis/lap output shape against
the Python fixture, capture missing-channel semantics, append-only SQLite
behavior/atomic duplicate rollback, compatible spatial matching, a true
batched service lifecycle, candidate/comparison/decision/recovery links, and
immutable engine evidence/history/capture endpoints. The source oracle remains
`backend/road_analysis.py`, `backend/road_matching.py`,
`backend/road_comparison.py`, `backend/tuning_capture.py`, and
`tests/test_road_workflow.py`; compare JSON values from those tests before
claiming runtime compatibility. The repository fixture
`tests/fixtures/road_observation_contract.json` is a separate legacy
`session-observations/v2` contract and should not be used as the
`road-observations/v1` method-version assertion.

## Parent integration notes

The root runtime should call `maintain` from its existing periodic worker and
`shutdown` during process teardown. `TelemetryStore::finalize_session` returns
an aggregate result; Road reads metadata again after finalization to obtain the
persisted recording receipt. Root-owned `app.rs`/`motec.rs` still needs its own
compile/test fixes if `cargo check` reports errors outside `road/`.
