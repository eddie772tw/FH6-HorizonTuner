# Telemetry Rust handoff

## 公開邊界

`backend-rust/src/telemetry/mod.rs` 匯出 parser、decoded point、dyno quality/collection、drag recorder、race recorder 與 SQLite store。root 只需在 `backend-rust/src/lib.rs` 保持 `pub mod telemetry;`，UDP/API adapter 再使用這些邊界。

- `parse_packet(&[u8]) -> Result<Value, String>`：接受 232-byte legacy 與 324-byte FH6 V2，固定回傳既有欄位名、schema、原生單位；拒絕理由為 `too_short`、`partial_schema`、`unsupported_length`、`not_racing`、`non_finite`、`out_of_range`。
- `pack_binary(&Value) -> Vec<u8>`：維持 128-byte little-endian 前端封包，速度 m/s→km/h、功率 W→hp、Boost Pa→psi、加速度 m/s²→G、滑移角 radians→degrees；輸入無法使用時回傳 128 個零位元組。
- `decoded_point(&Value) -> Value`：維持 `decoded-fh6/v1`，個別缺失值為 null，補上 controls 百分比和既有 aliases。
- `DynoQualityGateRegistry` 與 `collect_dyno_sample`：以 telemetry timestamp、車輛 fingerprint、位置/速度連續性、WOT/gear/brake/slip/transient gate 更新 profile；不在 UDP 路徑做檔案 I/O。
- `DragRecorder`：`prepare`、`clear`、`record`、`status`、`data`、`analysis`；只保留記憶體資料，分析包括 launch、shift、final drive、path/yaw、slip stability。
- `RaceRecorder`：`new_with_context(config, settings, car_database)`、`update_settings`、`set_car_database`、`start_manual`、`record`、`tick(now)`、`save_latest_and_clear`、`drain_commands`。`RecorderCommand` 將 create/write/finalize 交給 root worker。
- `TelemetryStore::new(&Path)`、`create_session`、`insert_points_batch`、`get_telemetry_points`、`get_session_metadata`、`finalize_session`、`list_all_sessions`、`delete_session`。每次操作獨立 rusqlite connection，使用 WAL、foreign keys、既有 sessions/laps/telemetry_channels schema、migration-compatible columns、raw_json 與 legacy fallback。

## 高頻路徑與責任

UDP loop 只呼叫 parser、quality/recorder 純資料 API；不能直接呼叫 `TelemetryStore`。root worker 應消費 `RecorderCommand`，並對 dyno profile 變更及 race batches 做節流寫入。Rust store 使用 `decoded_point` 後才寫入兼容欄位，因此舊 SQLite row 沒有被推測或補造測量值。

## 測試與狀態

`backend-rust/tests/telemetry_contract.rs` 覆蓋完整 324-byte/232-byte parser fixture、拒絕理由（含 NaN/length）、Python oracle exact 128-byte encoder、decoded null/alias、dyno quality lifecycle/collection、race injected clock/worker commands、drag FWD/RWD/AWD 完整 data/analysis、temp SQLite round trip/migration/laps/delete。`tests/fixtures/telemetry/*.json` 由 `scripts/generate_telemetry_contract_fixtures.py` 使用既有 Python API 產生；所有 JSON 比較遞迴容忍合理浮點誤差並保持欄位/陣列形狀。`rustfmt`、`git diff --check` 已通過；`cargo test --test telemetry_contract -- --nocapture` 為 16/16，`cargo test --tests` 全部通過（config 5、mcp 2、motec 1、native 6、process 2、road 7、telemetry 16）。

## 後續接線

root 需把 HTTP/WebSocket response 接到 `Value`，將 `RecorderCommand` 交給單一 SQLite worker，並在整合後執行完整 Rust tests。若需要 Python race persistence 的 queue saturation metrics，可在 worker 層擴充，不應將 blocking SQLite 呼叫放回 `RaceRecorder::record`。
