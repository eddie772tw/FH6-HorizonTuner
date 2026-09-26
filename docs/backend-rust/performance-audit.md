# Rust 後端 API 與配置成本盤查

盤查快照：2026-09-26。本文記錄 PR #443 當前 Rust 實作、指定工作樹差異與定向歷史 PR 檢查。這不是所有效能 PR 的逐一完整審查，也不宣稱已全面消除 JSON 配置、複製或 I/O 成本。歷史 Python PR 的數字只是作者在各自 workload 的主張；不能代替同機、同資料、同傳輸範圍的 Rust 實測。

關於已繼承 Python 效能工作的背景與 Rust before/after probe，見[效能繼承盤查](performance-inheritance.md)。本文件補充 API/模組覆蓋、目前差異與待量測項目。

## 歷史優化思路與狀態

歷史來源以 `.jules/bolt.md`、GitHub 上標題或分支名含 `perf`／`bolt` 的 PR、部分 `pref` 拼字及代表性實際 diff 為線索；以下是分類盤點，不是每個相關 PR 的完整審查。PR 狀態依 2026-09-26 GitHub 快照，關閉不等於 revert，也不等於合併。

| 思路 | 代表 PR 與狀態 | 可移植的設計原則 | 遷移限制 |
| --- | --- | --- | --- |
| 隔離高頻資料路徑中的慢 I/O | [#182](https://github.com/eddie772tw/FH6-HorizonTuner/pull/182) merged | 有界 FIFO writer、coalesced profile I/O、可觀察丟樣與 drain。 | Rust 已有 recorder/profile worker；維持 queue 限額、順序、失敗可見性與關閉耐久性。 |
| 批次資料庫寫入與直接 row mapping | [#91](https://github.com/eddie772tw/FH6-HorizonTuner/pull/91)、[#199](https://github.com/eddie772tw/FH6-HorizonTuner/pull/199) merged；[#194](https://github.com/eddie772tw/FH6-HorizonTuner/pull/194)、[#195](https://github.com/eddie772tw/FH6-HorizonTuner/pull/195) closed、屬驗證既有批次能力 | 避免 N+1 寫入與 Row→dict→pop 等中間映射。 | Rust `Value`/raw JSON 保留 API、舊資料及 channel 契約；須分開測 SQL、decode 與序列化。 |
| 預編譯 UDP schema、固定欄位 scalar 化 | [#328](https://github.com/eddie772tw/FH6-HorizonTuner/pull/328)、[#431](https://github.com/eddie772tw/FH6-HorizonTuner/pull/431)、[#437](https://github.com/eddie772tw/FH6-HorizonTuner/pull/437) merged | 固定 wire format 直接解碼；小型固定陣列避免不必要的堆配置。 | Python Struct/iterator 成本不能直接套用 Rust。Rust parser 已用固定 offsets、`from_le_bytes` 及固定大小輸出；應量實際配置與端到端流量。 |
| 固定預設陣列重用 | [#149](https://github.com/eddie772tw/FH6-HorizonTuner/pull/149)、[#166](https://github.com/eddie772tw/FH6-HorizonTuner/pull/166) merged | Python 每列建立的 default list 改為 immutable tuple，減少短生命週期配置。 | Rust 固定四輪 stack array 是對應機制；不要把無配置 iterator 當作 Python list 來手動展開。 |
| 分析聚合單趟化、減少重複查找 | [#386](https://github.com/eddie772tw/FH6-HorizonTuner/pull/386)、[#416](https://github.com/eddie772tw/FH6-HorizonTuner/pull/416) merged | 合併同一資料集的重複遍歷、聚合與 percentile scan。 | 不得改加權、缺值、輪位、分位數及 OLS 小樣本語義。 |
| 語言資源快取 | [#387](https://github.com/eddie772tw/FH6-HorizonTuner/pull/387) merged；[#377](https://github.com/eddie772tw/FH6-HorizonTuner/pull/377) closed | 靜態內嵌資料可一次解析；可修改 override 要按版本失效。 | #387 實際 diff 對 unknown/error 有永久負快取；現行 Rust 使用 embedded `OnceLock`，override 依 metadata 變更並處理刪除 fallback，沒有照搬該負快取。 |
| 非同步 API 的阻塞檔案操作移出 event loop | [#82](https://github.com/eddie772tw/FH6-HorizonTuner/pull/82)、[#193](https://github.com/eddie772tw/FH6-HorizonTuner/pull/193)、[#196](https://github.com/eddie772tw/FH6-HorizonTuner/pull/196)、[#197](https://github.com/eddie772tw/FH6-HorizonTuner/pull/197)、[#385](https://github.com/eddie772tw/FH6-HorizonTuner/pull/385)、[#395](https://github.com/eddie772tw/FH6-HorizonTuner/pull/395) merged | 避免 Python `async def` 直接執行阻塞檔案操作。 | 這是 Python event-loop 邊界問題；Rust 需確認實際 HTTP/runtime worker、mutex 與 I/O 邊界，不應機械式為每個 handler 加 thread。 |
| NumPy FFT/library 算法替換 | [#73](https://github.com/eddie772tw/FH6-HorizonTuner/pull/73) merged | 用成熟 FFT 算法取代手寫高複雜度運算。 | Rust 已用 `rustfft` 與獨立 audio worker；planner/buffer 只在 audio profile 證明有收益時再考慮。 |
| Canvas、React、HUD 繪製與瀏覽器配置 | [#418](https://github.com/eddie772tw/FH6-HorizonTuner/pull/418)、[#409](https://github.com/eddie772tw/FH6-HorizonTuner/pull/409)、[#402](https://github.com/eddie772tw/FH6-HorizonTuner/pull/402)、[#357](https://github.com/eddie772tw/FH6-HorizonTuner/pull/357) merged | 限定固定 render loop 的 DOM/陣列/迭代成本。 | 這些是 frontend/HUD 路徑，不列為 Rust backend 效能繼承。 |
| Road matching/aggregate 再優化提案 | [#441](https://github.com/eddie772tw/FH6-HorizonTuner/pull/441) closed；[#442](https://github.com/eddie772tw/FH6-HorizonTuner/pull/442) 當時 open/draft | 可把四輪資料讀取、逐點分析與比較配對視為候選。 | 未合併提案不是 PR #443 依賴或已驗證結果；Rust 的目前 matching 實作與 probe 需獨立比較。 |

PR 內文的百分比與微基準只描述其原有 Python/前端程式、資料與測法。Rust 是不同 runtime/資料表示；此處不將歷史數字換算為 Rust 預期收益。

## 本輪確認的實作差異

下列變更列出程式行為與成本移除；正式效能結果見[大型 API／MCP 實測](api-workload-performance.md)。該實驗使用官方 Python v1.6 sidecar、Rust `3cf6bb0` 及本輪 release binary，24 個 workload 各三輪共 90 樣本，23 個可比較回應在九個 process 全部核對一致。

| 區域 | 本輪程式差異 | 維持的邊界 |
| --- | --- | --- |
| Analysis/MCP session 查詢 | `telemetry/sqlite.rs` 加入 session page/count/latest/specific-ID 查詢、latest point 查詢及 `(session_id,id)` 索引；MCP 先按 lap 查詢，在逐列讀取時按 ordinal stride 決定是否 decode，僅保留的 owned object 執行 channel retain。 | 排序與 stride、可選欄位、raw JSON 與舊 channel alias 契約。仍掃描選定 session/lap 的 SQL rows，沒有宣稱 SQL 已直接跳過所有未選列。 |
| Road document list | `road/store.rs` 在 `exclude_capture` 時由 SQLite `json_remove` 投影後再 decode，避免讀入後才移除 capture。 | JSON1、缺欄/Null 語義、文件順序和 immutable document 規則。 |
| MCP capture | `capture_summary` 借用 samples slice；`capture_window` 移出 owned document 的 samples，再就地 filter/retain channels，避免整個 samples array clone 和另建 Value object。 | 窗口端點、stride/order、缺值預設、channel 欄位與回應 JSON。 |
| Drag | `/api/drag/status` 改用 `point_count()`，不為取得數量複製整個 session；save 先取得 owned snapshot 再釋放 engine lock，檔案組裝與寫入在 lock 外完成。 | data/analysis 與存檔內容完整，snapshot 仍須擁有資料。 |
| JSON arrays / MCP response | API 和 MCP array 回應直接用 `Value::Array`，避免 `json!(Vec<Value>)` 的額外轉換；MCP protocol 將 owned result 直接移入 response，避免再次複製大型 text 字串。 | 對外 JSON shape 與 null/id/error 規則相同。 |

涉及檔案：[`app.rs`](../../backend-rust/src/app.rs)、[`sqlite.rs`](../../backend-rust/src/telemetry/sqlite.rs)、[`road/store.rs`](../../backend-rust/src/road/store.rs)、[`mcp/service.rs`](../../backend-rust/src/mcp/service.rs)、[`mcp/tools.rs`](../../backend-rust/src/mcp/tools.rs)、[`mcp/protocol.rs`](../../backend-rust/src/mcp/protocol.rs)、[`drag.rs`](../../backend-rust/src/telemetry/drag.rs)。相關契約測試差異位於 [`telemetry_contract.rs`](../../backend-rust/tests/telemetry_contract.rs)，另新增 `query_cost_contract.rs` 與 `road_projection_contract.rs`。

查詢邊界：session 維持原本 `ORDER BY start_time DESC`，沒有新增或改變相同時間的排序規則；測試核對 bundled SQLite 的分頁與完整查詢 tie 順序相同。採樣查詢只 decode 被選中的 rows：若未選中列的 SQLite 型別已損壞，現在不會因該列而讓整次 MCP 查詢回空陣列。SQL 執行／讀取錯誤及被選中列的 decode 錯誤仍傳回，完整查詢也保留錯誤；這個針對損壞資料庫的邊界已有明確測試。正常 raw/legacy rows 的輸出契約不變。

## Backend 模組覆蓋矩陣

這是程式碼路徑與 payload ownership 的盤點。覆蓋表示有閱讀/追蹤實作；除「本輪差異」欄所述外，不表示做過效能量測或已最佳化。

| 模組 | 已追蹤路徑與成本 | 目前判斷 |
| --- | --- | --- |
| `bin/*`、`main.rs` | Thin binary wrappers 將啟動導向 library/runtime。 | 業務邏輯不在 wrapper；沒有可單獨歸因的熱路徑。 |
| `runtime.rs`、`network.rs` | UDP 收包、settings watch、parse/metrics、有界 processing queue、HTTP `spawn_blocking` 邊界、WebSocket telemetry/overlay。 | 每 datagram/frame 的 settings snapshot clone 是候選；WebSocket `Arc<Value>` clone 是 refcount 淺複製，wire JSON/binary 序列化是傳輸需要的成本。 |
| `app.rs` | API dispatcher、每 frame engine/profile/dyno、Drag/Road、presence、analysis/MoTeC。 | 本輪有 SQLite session/read 投影、Drag status/save、Value array 等差異。先前移除的 Drag car database 深 clone 已不列缺口；settings、profile、Discord 等高頻路徑保留為未量測候選。 |
| `telemetry/packet.rs` | 232/324-byte UDP 契約、plausibility、公開 owned `Value` frame 與固定 wheel arrays。 | JSON fields 是共用 API/recorder 表示；未量 typed-frame 替換，不宣稱可免費消除。 |
| `telemetry/race.rs`、`persistence.rs` | Session state、sample downsample/batch、bounded FIFO writer、flush/finalize/drop drain。 | 已有 worker；sample clone 在 accepted point 需要長存與補時間欄位，不能與每 frame clone 混為一談。 |
| `telemetry/sqlite.rs`、`contract.rs` | batch insert、row decode、session lookup/page、latest point、filtered telemetry、finalize。 | 本輪 SQL 下推及索引/lookup 差異屬已改；全 session 的 raw JSON decode/`Vec<Value>`/response encode 仍是大 payload 候選。Finalize 會在 writer 慢路徑讀點聚合。 |
| `telemetry/drag.rs` | Session samples、cached analysis、save/status snapshot。 | 本輪 direct point count 與 lock 外 save；完整 data API/save 仍需 owned result。 |
| `telemetry/dyno.rs` | Gate delta median、profile curve neighbor checks、history aggregation。 | median 小型且上限 8；品質與輸入條件通過後存在 dyno curve map clone 候選。需依真實 profile 大小量測。 |
| `road/*` | Live observe gates、pending point persistence、store list/get、matching、analysis/summary、capture export。 | 本輪 Road list projection 已改。有效 active capture 才需保存 full frame；ownership 有用途。首次 finish 仍可能在 finalize 前後重讀 points，是待量測候選。 |
| `mcp/*` | JSON-RPC protocol、tool dispatch、SQLite telemetry/session reads、capture/preset/Drag 檔案掃描與 JSON/text 封裝。 | 本輪直接移交 arrays/result、session SQL 查詢、逐列 stride decode 與 capture 就地篩選已改。必要的 JSON text parse／serialize 是協議成本；正式 sparse 中位數由 Rust 209.204 降至 31.903 ms，Python 同輪為 112.471 ms。仍未量各階段獨立耗時。 |
| `companion_workflow.rs` | enqueue 對 command stringify 並限 64 KiB；exchange 對 snapshot stringify 限 256 KiB，再 clone snapshot 存為 latest。 | size/validation 必須在保存前發生；跨 request latest snapshot 需要 ownership，但從 owned request 移出 snapshot 可能省掉 clone。state 回應仍需獨立 snapshot。此輪未量測，不改限額或 host/ack 契約。 |
| `companion.rs`、`companion_usb.rs`、`companion_usb_runtime.rs` | Pairing/device state、小型列表/manifest、ADB process output capped at 64 KiB、資產 manifest 計算與持久化。 | pairing 和 list/manifest 是低頻文件/程序路徑；重複掃描/雜湊可量後快取，需保留檔案更新、新增刪除、path containment 與 process output limit。 |
| `tuning/*`、`agent_cli.rs` | 純數值調校公式、preset schema、CLI tool execution。 | 參數 JSON clone 小且非高頻 frame 路徑；不改公式以追求微基準。維持型別/序列化契約。 |
| `mcp/protocol.rs`、`agent_cli.rs` JSON text | MCP tool result 要序列化為 protocol text；CLI 接受 JSON `text` 參數需 parse。 | 這些是協議邊界必要成本；本輪只移除周邊 Value clone/array wrapping，不省略合法文字 payload。Structured fallback 的 Value clone 屬低頻，可先量。 |
| `assets.rs`、`config.rs`、`languages.rs` | 內嵌 assets/defaults、JSON parse、語言 override metadata cache。 | 語言已有 parsed cache；一般 `assets::json` 與 `config::defaults` 仍逐次 parse，其中 defaults 也用於 HUD/config 正規化。屬小型低頻候選；本輪不加未量測快取。 |
| `diagnostics.rs`、`error.rs`、`platform.rs`、native unsupported façade | bounded stage window、response error/header、runtime capabilities 與非原生平台 fallback。 | 小型計數／狀態與平台分流；support bundle 的檔案讀取／壓縮屬低頻成本，本輪未量測。 |
| `storage.rs`、`config_service.rs` | Safe rooted path、symlink/junction 約束、atomic JSON/settings writes、檔案列表和 config reads。 | 安全 canonicalization、atomic replace/backup 及外部可變檔 freshness 都是功能約束。低頻 file-list/HUD/settings 路徑，不得單憑 Rust 同步 I/O 宣稱阻塞 telemetry；settings mutex 持有 I/O 仍列候選。 |
| `native/discord.rs`、`native/mod.rs` | Per-frame Discord input、presence latest state、change/heartbeat 序列化與 IPC。 | Discord 未設定時 process 仍建立完整 presence frame 是高頻候選；每次實際更新的 payload stringify/nonce/send 可能重複，並非每 frame。候選需保持 disabled fast path、latest-wins/stale/heartbeat。 |
| `native/audio.rs` | WASAPI/PCM worker、channel split、FFT planner/buffers、device discovery。 | COM buffer 在 ReleaseBuffer 前轉為 owned samples 有必要；後續 left/right Vec、planner/buffer reuse 是未量測候選。audio worker 不在 engine lock，獨立測，不混入 UDP 結論。 |
| `native/media.rs` | GSMTC worker、TTL/stale cache、metadata snapshot 與 thumbnail bytes。 | 小 metadata clone 和 COM worker不是高頻主路徑；conditional thumbnail 304 先 clone 最大 10 MiB bytes 是低頻但高 payload 候選。 |
| `profile_io.rs` | bounded/coalesced profile read/write queue 與 cache。 | I/O 在 queue/cache lock 外；miss 僅 enqueue。cache hit 每 frame owned profile clone，以及 App cache 回寫 clone 為候選，需按 profile size、writer schedule/queue 狀態量。 |

## 未量測候選及優先順序

以下是程式碼審查/工作樹 diff 的候選，不是確定會改善的承諾。優先順序按每秒頻率、payload 成長與是否持有 telemetry engine lock 排列。

1. **P1 每 frame Discord snapshot：** App 先複製整個 telemetry `Value`，presence worker 只讀少數欄位，且 Discord disabled 時複製仍發生。先以 disabled/enabled 各跑固定 60 Hz，量 clone bytes/CPU，再決定是否直接建立小型 snapshot。
2. **P1 profile/dyno：** profile cache hit 深 clone，以及 eligible dyno update 時整個 curve map clone。以 default、長歷史 profile 和 eligible/ineligible frame 分組；保留 profile cache ownership、更新/寫入 coalescing 與 dyno quality 行為。
3. **P2 settings snapshots：** UDP receive 與 App/Race 每 frame 可能重複複製小 settings JSON。雖小但高頻；以 forwarding/settings toggles 與 concurrent POST 驗證一致快照和無 lost update。
4. **P2 active Road full-frame copy：** 只有有效 armed/race frame 會複製，但錄製期間可每個 frame 發生。和 inactive、recording、stop/identity change 分開量；精簡 point 前先證明完整 raw/API schema 可維持。
5. **P2 API/SQLite/file/capture：** Road list、MCP sparse/session/capture、session data、MoTeC debrief/export、Drag save/list、preset/capture tree、storage overview、support bundle。這些多數不是 telemetry 每幀成本；以資料量/檔案數、cold/warm、phase timing 量，避免把 request microbench 擴大成整體效能 claim。
   MCP 大型 result 的 pretty JSON text 仍由 `json!` 放進 content block，尚有一次可避免的字串複製；`tools/list` 每次解析 immutable registry。與 SQL row／Value tree 的成本分開列為後續候選，不把必要的 MCP text 編碼和多餘複製混為一談。Capture/preset 目錄仍每次掃描解析，沒有加入會隱藏外部檔案更新的快取。
   小型 SQLite 查詢仍逐次 open、設定 PRAGMA 並 close。本地 rusqlite／SQLite source 確認最後一條 WAL connection 關閉會嘗試 checkpoint／清理，這是固定成本的候選解釋，尚非 profiler 歸因。此輪維持獨立連線：共用一把查詢 mutex 會使長查詢阻塞 writer；idle keeper 雖可避免反覆 teardown，卻延長 Windows 檔案 handle 壽命並改變外部替換資料庫的行為，也不能省掉每次 open／PRAGMA。需另以受控 keeper A/B 拆解，不從低毫秒 API 數字直接決定架構。
6. **P3 audio/thumbnail/小型 median/字串：** audio planner/channel vectors、conditional thumbnail 大 bytes、最多 8 項的 quality median、car name truncation。先看 profiler attribution，避免以可讀性換取難維護的手動 unroll。

最初 pilot 發現的 Road list、MCP sparse 與 Drag status 退步已以正式 workload 重現並改善；本輪相對 Rust `3cf6bb0` 的中位數耗時分別減少 73.4%、84.8%、86.7%，Debrief／MoTeC 減少 17.0%／15.0%。仍不能宣稱所有端點快於 Python：Road list 33.826 vs 30.701 ms、laps 2.679 vs 1.636 ms、MCP sessions 3.914 vs 3.699 ms、MCP summary 5.081 vs 4.590 ms。完整 p50／p95、每輪分布與未改善項目一併保存在[正式報告](api-workload-performance.md)與[原始證據](api-workload-evidence.json)。

## 測量與結果限制

- 使用同一 commit/build mode 和機器，固定 JSON/SQLite/filesystem fixture；把初始化、server startup、native hardware、game/UI 和首次檔案產生排除於 handler latency，另行報告 startup 若是問題。
- 對小 endpoint 固定 payload/request mix；大資料本輪量 10k telemetry points，100k、cold cache 與併發屬未驗收範圍。raw／legacy rows、不同 downsample/channel 篩選另有語義契約測試；Road docs、capture、sessions 固定文件／樣本數。
- 先 warm up 2–3 次，之後交錯執行各版本至少 30 次；報 median 與 p95、spread、fixture SHA、process/build/OS、資料列/檔案/回應 bytes。每案例至少反轉一次執行順序。小試驗若未達此標準，標成 pilot。
- 同時比較 API/domain 輸出：JSON shape、順序、離散值、缺值/null、channel alias、範圍端點及 sampling stride；MoTeC export byte-compare；DB/file side effects 和 failure/atomicity 另驗。數值容差需事先明確。
- 分別呈現 handler、SQLite、JSON decode/transform/stringify、HTTP/WS encode、worker/queue wait 與 end-to-end；MCP response text 的 stringify 是協議成本，不應從一側排除。
- Contract gate（包括 75 個 method/path route inventory）證明行為覆蓋，不是 workload benchmark。Python 歷史 PR 的微基準與 Rust release probe 不可直接互換。任何未量候選都維持候選狀態，退步與噪音一併報告。

主要程式入口見上表實作連結；API fixture 是 [`http_inventory.json`](../../backend-rust/tests/fixtures/http_inventory.json)，目前已有的 Rust before/after 方法與 evidence 見[效能繼承盤查](performance-inheritance.md)。
