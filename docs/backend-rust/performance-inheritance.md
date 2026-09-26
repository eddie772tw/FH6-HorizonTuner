# Python 後端效能工作與 Rust 承接盤查

盤查日期：2026-09-26。歷史依據為 main ancestry 與 PR 實際 diff，Rust 修正前基準為 `8ed390d`；成果屬於尚未合併的 PR [#443](https://github.com/eddie772tw/FH6-HorizonTuner/pull/443)。已合併工作與尚未合併的 [#442](https://github.com/eddie772tw/FH6-HorizonTuner/pull/442) 分開判讀，不以 Rust 語言本身推論速度。

另見[Rust 後端 API 與配置成本盤查](performance-audit.md)：涵蓋歷史 PR 思路、API/module inventory、本輪 API/SQLite/MCP/Drag 差異與尚未量測候選；歷史前端/HUD 效能改動與 Rust 後端分開歸類。

## 歷史工作與目前實作

| 歷史 PR | 原有優化概念 | Rust 承接與證據 |
| --- | --- | --- |
| [#182](https://github.com/eddie772tw/FH6-HorizonTuner/pull/182) | profile 首讀非阻塞、按車合併快照；有界 recorder writer、丟樣指標、停止與關機 drain | 補回 `persistence.rs`、`profile_io.rs`。原 Rust 只隔離 UDP socket，processing worker 仍同步讀寫磁碟；現在 Race/Road 各有 FIFO writer，profile 首讀與寫入另由 worker 執行。Road 為後續功能，此處承接隔離概念。 |
| [#91](https://github.com/eddie772tw/FH6-HorizonTuner/pull/91) | lap summaries 以 executemany 合批提交，空 batch 早退 | `telemetry/sqlite.rs` 對 point batch 與 lap rows 各 prepare 一次並重用 statement。finalize 的 lap rows、metadata 與 session totals 在同一 transaction；第二列失敗時整批回滾。points 和 finalize 是依序執行的不同 transaction。 |
| [#108](https://github.com/eddie772tw/FH6-HorizonTuner/pull/108)、[#188](https://github.com/eddie772tw/FH6-HorizonTuner/pull/188) | 共用音訊／媒體 WS broadcast，無訂閱者時不輪詢 | `runtime.rs::overlay_worker` 檢查 receiver count；WASAPI/GSMTC 各由 worker 提供共用快取，GSMTC 有 single flight、timeout、stale grace。新連線收到初始快照，慢 WS consumer 使用有界通道。 |
| [#82](https://github.com/eddie772tw/FH6-HorizonTuner/pull/82)、[#193](https://github.com/eddie772tw/FH6-HorizonTuner/pull/193)、[#197](https://github.com/eddie772tw/FH6-HorizonTuner/pull/197)、[#385](https://github.com/eddie772tw/FH6-HorizonTuner/pull/385)、[#395](https://github.com/eddie772tw/FH6-HorizonTuner/pull/395) | settings/tuning/analysis 檔案 I/O 移出 async executor | `network.rs` 用 `spawn_blocking` 執行 HTTP `Backend::request`。底層檔案操作仍同步，但不阻塞 Tokio I/O thread；這與 telemetry writer 是不同邊界。 |
| [#196](https://github.com/eddie772tw/FH6-HorizonTuner/pull/196) | drag session listdir/JSON load 移至 threadpool | 同樣經 HTTP blocking pool。大量 session 的目錄掃描仍有成本；原 PR 也未建立目錄快取。 |
| [#199](https://github.com/eddie772tw/FH6-HorizonTuner/pull/199) | 避免每列 Row→dict→pop 重複映射與名稱查找 | `TelemetryStore::row_value` 以固定索引讀 SQL row；優先解析保存的 `raw_json`，舊資料才由欄位組建 Value。避免舊 Python 中間 dict，保留缺值／原始通道。回應仍需 `Vec<Value>`，不為減少配置而丟掉 raw JSON 契約；查詢吞吐未跨語言量測。 |
| [#387](https://github.com/eddie772tw/FH6-HorizonTuner/pull/387) | language parsed JSON cache | 補上 `languages.rs`：embedded JSON 以 `OnceLock` 解析一次，覆寫依 path、mtime、length 失效；list/get 共用快取，新增、更新、刪除均有測試。未知代碼不建立負快取。保留修改時間與長度的外部同大小改寫需重新啟動；一般儲存會使快取失效。 |
| [#73](https://github.com/eddie772tw/FH6-HorizonTuner/pull/73) | 近似 DFT 改為 FFT library | `native/audio.rs` 使用 `rustfft`，由 capture worker 計算，已承接演算法概念。planner/buffer 重用是後續可量測方向，未作本次改善宣稱。 |
| [#386](https://github.com/eddie772tw/FH6-HorizonTuner/pull/386) | path validity 的 X/Z/Yaw 單趟擷取與加總 | `telemetry/drag.rs::path_stats` 改為單個 tuple Vec，單趟擷取／加總；後續 OLS 與角度公式保留。FWD/RWD/AWD Python oracle 通過。其他 Drag filter vectors 在前代亦存在，不屬此 PR 漏移植。 |
| [#416](https://github.com/eddie772tw/FH6-HorizonTuner/pull/416) | exposure/weighted sum 單趟聚合，排序後單趟 percentile scan | `road/analysis.rs` 已補回，共用 end weights、一次抽取四輪資料，lap summary 不再 clone points；保留時間權重、缺值與分位數。加總順序改變可有浮點尾數差異，測試使用明確容差。 |
| [#328](https://github.com/eddie772tw/FH6-HorizonTuner/pull/328)、[#431](https://github.com/eddie772tw/FH6-HorizonTuner/pull/431) | 預編譯 struct pack/unpack，減少 interpreter/C 呼叫與 generator 成本 | Rust 使用靜態 byte offsets、`from_le_bytes` 與固定陣列，沒有動態 format 解析或 Python/C 呼叫，`iter().any` 無需配置 Python generator。保留 232/324-byte schemas、plausibility 與 frozen fixtures。[#328](https://github.com/eddie772tw/FH6-HorizonTuner/pull/328) 初次曾 revert，但 `73018ab` 重引入，退休前 `624a548^` 仍有預編譯 structs；不能僅由早期 revert 判斷最終狀態。未宣稱兩語言吞吐相等。 |
| [#437](https://github.com/eddie772tw/FH6-HorizonTuner/pull/437) | 固定四輪 scalar 化，減少每 frame padding/list 配置 | `telemetry::pack_binary` 的 `array4` 是 stack `[f64;4]`，輸出預留 128 bytes；`network::ws_binary` 使用此路徑。binary oracle 逐 byte 驗證。 |
| [#442](https://github.com/eddie772tw/FH6-HorizonTuner/pull/442) OPEN；[#441](https://github.com/eddie772tw/FH6-HorizonTuner/pull/441) CLOSED | Road matching 減少 list/closure 配置與重複 wheel lookup | 兩者未合併。Rust `matching.rs` 已一次讀各 wheel slice，移除 comparable-pair 二次走訪與 segment 重掃；保留短陣列中的有效輪位，沒有採用 [#442](https://github.com/eddie772tw/FH6-HorizonTuner/pull/442) 將短陣列整組丟棄的行為。不是本 PR 的合併依賴。 |
| [#418](https://github.com/eddie772tw/FH6-HorizonTuner/pull/418)、[#402](https://github.com/eddie772tw/FH6-HorizonTuner/pull/402)、[#409](https://github.com/eddie772tw/FH6-HorizonTuner/pull/409)、[#355](https://github.com/eddie772tw/FH6-HorizonTuner/pull/355) 等前端工作 | Canvas circular buffer、React interpolation/math/HUD 配置 | React/Canvas 路徑保持既有實作，不列為 Rust 後端承接項目。 |

## 持久化與可觀察行為

- Recorder queue 每個 writer 最多 64 個待排項目（含為 session 預留的 finalizer），另有至多一個執行中項目。create → points → finalize 保持 FIFO；樣本批次飽和可丟棄並累計 dropped batches/samples，finalizer 使用保留空間。啟動被拒絕不假裝成功。
- Race/Road stop 成功回覆前 drain；關機等待已接受工作。Road 身分切換把寫入與摘要計算交給 writer。明確 HTTP 控制仍可等待磁碟及 engine lock，不能推論所有 API 都沒有尾延遲。
- `POST /api/analysis/clear` 清除目前 recorder 前 finalize 已接受資料（`endReason=manual-clear`），避免遺留 recording metadata 與 finalizer reservation。
- profile 同車排隊寫入合併為最新快照；初始載入區分 missing、pending、failed，載入尚未完成或失敗不建立假定 default profile。慢載入不能覆寫較新的 cache；明確 car-params API 儲存與即時更新序列化，回覆前落盤。
- `/api/diagnostics/telemetry-pipeline` 與 support bundle 顯示實際 race/profile persistence 指標，新增 `roadRecorderPersistence`。丟樣／寫入失敗會在成功 finalize 時標示 session `incompletePersistence`；finalize 本身失敗則由錯誤與 failedWrites 回報。

## 驗證

Windows／Ryzen 7 5800XT／Rust 1.96.0；本機未啟動前端。

- `cargo test --locked -j 2 --manifest-path backend-rust/Cargo.toml`：80 passed，2 ignored（原生宿主驗收與 opt-in performance probe）。
- 同上加 `--no-default-features`：72 passed，1 ignored（performance probe）。
- `persistence_contract` 3 項：外部 `BEGIN IMMEDIATE` 鎖住 SQLite 時仍發布 120 個 frame，stop 後全部可讀；70 次 start/clear 不耗盡 finalizer 空間；Road 身分切換在鎖住 SQLite 時不等待，解除後摘要與原因正確落盤。
- library tests 覆蓋 queue saturation、finalizer 順序、write failure、Drop drain、慢 profile load、coalesced save、missing/failed 分離與 language invalidation。
- `telemetry_contract` 19 項，含 point/lap 第二列失敗的 transaction rollback；`road_contract` 9 項，含 short-wheel/missing data 與完整 workflow。

這些是契約及阻塞隔離證據，不是高負載尾延遲或遊戲實測。SQLite query JSON、parser、整體 Drag 與 FFT planner 的跨語言吞吐未量測；它們是後續量測方向，不能把尚未量測的百分比當成本次成果。

## Release probe

`tests/performance_probe.rs` 是明確 ignored 的 opt-in 測量，沒有 CI timing 門檻。使用固定生成資料，同機同 release profile，比較 `8ed390d` 基準與本次修正；每項 7 次樣本，Road/language 另先暖機一次，SQLite 每次使用新暫存資料庫並只計 insert 時間。這是 Rust before/after，不是 Python/Rust 百分比對照。

```powershell
cargo test --locked -j 2 --release --manifest-path backend-rust/Cargo.toml --test performance_probe -- --ignored --nocapture
```

原始 7 次樣本與摘要保存在 [performance-evidence.json](performance-evidence.json)。最初僅減少 matching 迴圈配置的版本測得 56.5471 ms，高於基準 49.7073 ms，沒有據此宣稱改善。進一步發現空間索引為每個 point 深複製完整 JSON；改以借用原始 point，省掉兩側最多 8,000 次深複製，輸出不變。同一獨立 release 程序交錯執行基準／最終 matching 各 14 次，先斷言完整 JSON 相同，中位數由 51.6646 ms 降至 14.04615 ms；這是補充診斷，正式相同 probe 結果列於下表。

| 工作量 | 修正前中位數 | 最終中位數 | 本次觀測耗時減少 |
| --- | ---: | ---: | ---: |
| Road summary 10,000 points | 123.2329 ms | 36.3805 ms | 70.5% |
| Road matching 4,000 points／側 | 49.7073 ms | 15.8460 ms | 68.1% |
| 語言 API handler 100 reads | 44.2104 ms | 18.9704 ms | 57.1% |
| SQLite batch 1,000 rows | 41.0120 ms | 36.1894 ms | 11.8% |

單機短測仍有作業系統排程與磁碟波動；SQLite 前後樣本區間有重疊，不把中位數差異宣稱為所有磁碟／負載的保證。語言 probe 呼叫 ConfigService handler，不含 HTTP 傳輸。完整 default gate 的程序案例另以最終 release sidecar／CLI 執行，覆蓋 75 個 HTTP method/path、MCP、UDP/WS、持久化與關機。

## 補充：Python v1.6 Release 對照

後續依使用者要求另完成 [Python v1.6 與 Rust 性能測量](release-performance-comparison.md)：實際發行的 PyInstaller sidecar 對目前 release sidecar，量測啟動、記憶體、HTTP／MCP 與 UDP→WS；另以 v1.6 tag 原始模組對 Rust library 量測 Road summary／matching，完整輸出一致。此對照不改寫上表 Rust before/after 的意義，也不把 v1.6 之後的所有歷史優化歸因於本次 commit。

API／Road 有改善，但第一輪 UDP→JSON WS 中位數由 0.398 ms 增至 1.268 ms；七輪兩端皆完整處理 130 frames，0 dropped。原始樣本與退步皆保留。進一步固定 60 Hz 調查發現 `App::process` 每幀深複製整份 Drag car database；改為初始化一次後，recorder 關閉／開啟的 30 秒 stream 中位數由 1.309／1.294 ms 降至 0.231／0.230 ms。前後均完整收到 1,800 frames，Rust queue 峰值 1、結束 0，沒有持久化丟樣／失敗。

最終完整 default gate 為 81 passed、3 ignored；no-default-features 為 73 passed、2 ignored。新增 App 車名回歸測試，另修正 Road lifecycle 在建立設定後、每次 start 前更新遙測，避免 CI 磁碟耗時令前置 frame 超過產品 2 秒有效窗，未放寬產品檢查。
