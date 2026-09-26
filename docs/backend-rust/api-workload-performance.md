# 大型 API／MCP 實測與 JSON 複製修正

2026-09-26，同一 Windows 11 build 26200／Ryzen 7 5800XT；Python v1.6 為官方 portable 中抽出的未修改 PyInstaller sidecar，基準與 hash 繼承 [Release 對照](release-performance-comparison.md)。Rust 修正前為 `3cf6bb0`，修正後為本文件所在 commit 的產品程式。此輪未啟動前端。

## 方法與等價性

24 個 workload，每個版本三輪、每輪 3 次暖機＋30 次計時，共 90 個樣本。順序為 Python→Rust before→Rust after，第二輪反轉，第三輪恢復；沒有同時編譯或執行其他 benchmark。計時涵蓋 HTTP/1.1 keep-alive request 至完整 response bytes，排除 client JSON decode、fixture 建立、啟動與暖機。OS cache 未清除。

固定資料：1,001 個 session，其中 `bench` 有 10,000 個 canonical telemetry points；20 個 Road observation document，各含 1,000 點 capture；3 個 capture JSON，各含 10,000 個帶巢狀 channels 的 samples；Drag 用 UDP＋JSON WS 確認收齊 1,200 點後才量 status/data。MCP sparse 固定 downsample=60，保留 time 與 SpeedMetersPerSecond；capture window 上限參數為 100，保留 timestampMs／speedKmh。每個 process 使用新資料目錄、相同 fixture bytes、獨立 UDP port，stdin EOF 結束必須 exit 0。

Python v1.6 HTTP analysis 使用 `sessions/telemetry_sessions.db`，其 MCP 使用 root `telemetry_sessions.db`；測試在兩處放入相同資料，避免把舊路徑分歧量成空結果。Rust 使用 root database。

九個 process 的 23 個可比較回應全部核對一致：先解開 MCP content text JSON，JSON shape／陣列順序／離散值一致，數值 abs/rel 容差 `1e-6`，MoTeC CSV text（含 CRLF）精確一致。唯一正規化為 capture summary 的隔離目錄前綴。Storage overview 因兩版啟動產生不同檔案，只列觀察值、排除等價與加速比例。

## 完整結果

單位 ms，欄位為合併 90 樣本的 **p50 / p95**；最後一欄為 Rust 本輪 p50 耗時減少，負值代表增加。小型端點的幾十微秒變動不視為通用加速。

| Workload | Python v1.6 | Rust before | Rust after | 本輪耗時減少 |
| --- | ---: | ---: | ---: | ---: |
| settings | 0.525 / 0.626 | 0.165 / 0.196 | 0.152 / 0.212 | 8.2% |
| cars | 11.329 / 12.693 | 2.016 / 2.319 | 2.018 / 2.630 | -0.1% |
| language | 4.114 / 4.807 | 0.576 / 0.633 | 0.583 / 0.638 | -1.1% |
| sessions | 13.895 / 15.009 | 8.300 / 9.346 | 6.786 / 7.799 | 18.2% |
| points | 1401.182 / 1482.150 | 451.922 / 478.029 | 258.375 / 276.388 | 42.8% |
| latest_points | 1412.102 / 1557.384 | 407.062 / 441.633 | 224.957 / 266.206 | 44.7% |
| laps | 1.636 / 2.083 | 2.671 / 3.210 | 2.679 / 3.217 | -0.3% |
| debrief | 359.092 / 395.711 | 242.290 / 270.463 | 201.209 / 243.869 | 17.0% |
| motec | 532.750 / 571.417 | 308.182 / 352.060 | 261.976 / 312.793 | 15.0% |
| road_observations | 30.701 / 37.744 | 127.336 / 136.804 | 33.826 / 41.711 | 73.4% |
| road_capture | 50.534 / 64.109 | 12.359 / 15.025 | 12.202 / 15.008 | 1.3% |
| storage | 5.716 / 6.415 | 2.406 / 3.076 | 2.341 / 2.711 | 不比較 |
| analysis_status | 0.591 / 0.633 | 0.186 / 0.219 | 0.194 / 0.221 | -4.4% |
| hud_config | 0.748 / 1.014 | 0.385 / 0.437 | 0.371 / 0.411 | 3.6% |
| mcp_sessions | 3.699 / 4.468 | 5.341 / 6.507 | 3.914 / 4.871 | 26.7% |
| mcp_summary | 4.590 / 5.327 | 7.522 / 9.464 | 5.081 / 5.864 | 32.5% |
| mcp_sparse | 112.471 / 121.928 | 209.204 / 237.407 | 31.903 / 38.327 | 84.8% |
| mcp_full | 508.506 / 559.959 | 439.450 / 497.793 | 257.330 / 279.458 | 41.4% |
| mcp_snapshot | 287.785 / 344.260 | 212.641 / 240.540 | 5.424 / 6.136 | 97.4% |
| capture_summary | 300.095 / 343.216 | 203.665 / 258.278 | 171.764 / 204.445 | 15.7% |
| capture_window | 293.675 / 317.021 | 200.931 / 226.592 | 170.226 / 193.570 | 15.3% |
| mcp_tools | 0.872 / 1.076 | 0.421 / 0.473 | 0.378 / 0.407 | 10.3% |
| drag_status | 0.614 / 0.816 | 1.499 / 2.123 | 0.199 / 0.234 | 86.7% |
| drag_data | 24.915 / 39.795 | 1.936 / 2.503 | 1.909 / 2.646 | 1.4% |

## 改善原因與限制

- **Road observation 清單**：恢復 Python 已有的 SQLite `json_remove(document, '$.capture')` 投影，避免 Rust 解析 20,000 個隨即丟棄的 samples。完整 capture endpoint 與 immutable document 仍完整保留。
- **MCP sparse／snapshot／session**：按篩選後 ordinal stride 決定是否解碼 row、owned map 原地 retain channels；latest snapshot 只讀最後一點，分頁和 metadata 使用對應 SQL。仍會遍歷 selected session/lap 的 SQL rows；沒有宣稱 sparse 查詢已只讀 167 個磁碟 row。
- **SQLite 排序**：原查詢計畫用 session/distance index，對 `ORDER BY id` 建立暫存 B-tree；新增 `(session_id,id)` index 避免搬動大型 raw JSON 排序。索引增加磁碟／寫入及首次建索引成本；HTTP latency 排除啟動，因此不能用這些數字宣稱遷移啟動加速。
- **JSON ownership**：analysis 與 MCP 改用 `Value::Array` 移交已擁有的 tree，MCP protocol 移交 result；`json!(owned_value)` 會透過借用 Serialize 重建 Value，並不等同 move。Capture summary 借用 samples，window 移出 owned samples 並 retain 欄位；Drag status 直接讀 len，save 的序列化／磁碟 I/O 移到 engine lock 外。
- **仍有限制**：laps／小型 session 查詢仍有獨立連線、PRAGMA 與 SQLite 關閉成本；capture 仍每次掃描並 parse 文件，完整 telemetry／CSV 仍須 decode／encode 全資料。沒有以改變公式、刪除 channels、減少回傳內容或放寬路徑安全換取速度。

本測量是單一 in-flight request、固定合成資料、同機 loopback，不是多 client、真實遊戲、慢磁碟、100k points 或 cold-cache 驗收。API inventory 的 75 個 method/path 是另一組功能 gate；這裡沒有對未量測端點宣稱性能改善。其他配置、鎖內 I/O、native／Companion 候選與損壞 DB 抽樣邊界見 [全面盤查](performance-audit.md)。

## 新增索引後的 60 Hz 錄製驗證

同一 after binary 另與 Python v1.6 各跑一個 30 秒 stream：獨立 sender 依固定 deadline 送 1,800 個 324-byte UDP packets，不等待 WS 回覆；20 個 priming frames、單一 JSON consumer、recorder 開啟、5 Hz pipeline 觀察。這是新增讀取索引的寫入回歸檢查，並非上表單 request API latency 的一部分。

| 指標 | Python v1.6 | Rust after |
| --- | ---: | ---: |
| UDP→JSON WS p50 / p95 | 0.452 / 0.602 ms | 0.229 / 0.269 ms |
| 前／後十秒 p50 | 0.462 / 0.451 ms | 0.229 / 0.229 ms |
| sent / received | 1,800 / 1,800 | 1,800 / 1,800 |
| 含 priming 的 processed / dropped | 1,820 / 0 | 1,820 / 0 |
| telemetry queue peak / end | 0 / 0 | 1 / 0 |
| writer batches / queue peak / end | 6 / 1 / 0 | 6 / 1 / 0 |
| writer dropped samples / failed writes | 0 / 0 | 0 / 0 |

Rust 最大觀測 latency 0.766 ms，sender lateness p95 0.513 ms；沒有發現隨時間增加的延遲或佇列積壓。不能只靠平均延遲低於 16.67 ms 判定 60 Hz 安全，本次同時核對 timestamps、接收數及 writer 指標。這個負載未顯示新增索引造成錄製塞車，但不涵蓋既有大型 DB 首次建索引、遊戲滿載、多個慢 consumer 或慢磁碟。先前每幀 Drag 車庫深複製的原因及修正前後比較保留於 [Release 報告](release-performance-comparison.md)。

[本輪完整 60 Hz 樣本與 pipeline 觀察](api-workload-udp60.json)。重現命令：

```powershell
uv run --no-project --python .venv/Scripts/python.exe python scripts/benchmark_release_sidecars.py --bundle scratch/python-release-benchmark/FH6-HorizonTuner-Portable-Bundle.zip --rust backend-rust/target/release/server-sidecar.exe --output scratch/api-perf/new-udp60.json --rounds 1 --requests 10 --frames 10 --stream-seconds 30 --record
```

## 重現

先準備官方 v1.6 portable bundle 與 release Rust before/after binaries。before 可在 `3cf6bb0` 的獨立 worktree 以 `cargo build --release --locked -j 2 --manifest-path backend-rust/Cargo.toml --bin server-sidecar` 建置；不要在目前 checkout 覆寫分支來回切換。腳本需有 v1.6 commit 的 Git objects，並使用 repository Python 3.13／既有 websockets dependency 作測試客戶端，產品仍不依賴 Python。

```powershell
uv run --no-project --python .venv/Scripts/python.exe python scripts/benchmark_api_workloads.py --bundle scratch/python-release-benchmark/FH6-HorizonTuner-Portable-Bundle.zip --before scratch/api-perf/rust-before-3cf6bb0.exe --after backend-rust/target/release/server-sidecar.exe --output scratch/api-perf/new-run.json --rounds 3 --requests 30
```

[原始樣本、每輪統計、fixture／binary／source hashes](api-workload-evidence.json)；[runner](../../scripts/benchmark_api_workloads.py)。完整 response 留在 ignored run 目錄供本地比對，公開 evidence 不包含使用者 session／Spotify 資料。
