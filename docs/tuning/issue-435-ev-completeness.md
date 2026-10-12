# Issue #435：EV 證據生命週期補齊

## 範圍與可重現缺口

起點為 main `6451e56857a888deef3f9c6b45ac217a4a457ab5`，分支 `codex/issue-435-ev-completeness`。技能：`physics-tuning-math`、`modular-refactoring`、`halfmoon-design-system`、`cross-agent-collaboration`、`pr-author-maintainer`。Codex 主代理持有全部寫入，`ev_review` 只讀審查。

#435 原始需求是處理 EV 輸出與傳統引擎不同造成的 AEGO 失效。研究留言涵蓋單速／雙速、零怠速、恆功率平台與四種賽事，但 μ、傳動效率及固定速度倍率沒有遊戲校準來源。#445 只交付基礎模型，#470 驗收既有 Taycan 回放與保存，#515 更新底盤 owner；已關閉的 #510 沒有交付差異。不能由這些歷史推論廣泛 EV 最佳化已完成。

實作前以 main 編譯的 Rust sidecar、隔離 scratch 與實際 HTTP 重播 Taycan A1；之後僅修改該隔離 SQLite：

| 條件 | main 的可重現結果 | 修補 |
| --- | --- | --- |
| 保存後刪空原始 observation frames，再用 saved-ev workflow | `gearingAvailable=true`，仍信任 qualified moments | 每次重新讀 raw 並由 Rust 資格審核；缺／壞 raw unavailable |
| 同 evidence 改 drivetrain／HP／torque | 仍可取得 EV 建議，沒有 profile binding | 新 capture 保存動力配置並比對；舊 capture 缺值保持 unknown |
| App 重啟後再使用歷史 EV 證據 | 只有 export，沒有選取／匯入入口 | metadata discovery、raw import 與獨立目前配置確認 |
| 正常前端版本與 browser gate | HTTP 回覆 v2／EV 推薦 v2，腳本仍要求 EV v1 | 新 UI 明確使用 EV v3；檢查 workflow／推薦／chassis owner |
| 負向量測與傳輸失敗 | 多項只測 frozen TS；batch error 靜默重試 | Rust owner 負向矩陣、資格原因與可恢復 transport 狀態 |
| 設定 A→B→A 後重新確認同 raw | stale ID registry 仍拒絕 | 明確重新選取／確認才建立新 evidence lifetime |
| 延遲 selection、短時間 decoded A→B→A、導航後斷線 | 可能保留舊確認 | provider-scope generation、decoded 身分事件與 connectivity 取消 |

實作前 HTTP 證據為 `schema=tuning-workflow-result/v2`、`formula=rust/ev-measured-workflow-v2`、`emptyRawStillReady=true`、`changedPowertrainStillReady=true`。這是既有錄製重播，不是新增實機量測。

## 版本與確認合約

- `tuning-workflow-result/v3` 只供 fixed-ratio EV；底盤仍是 #515 的 `rust/chassis-load-baseline/v1`，動力模型仍是 `ev/v1`。新推薦為 `rust/ev-measured-workflow-v3`。
- v3 有 qualified evidence 時，必須提供 `inputSnapshot.evEvidenceConfirmation`：`schemaVersion=ev-context/v1`、目前 carId、ordinal／PI／Class、目前 evGearbox 與 `{drivetrain,maxHp,maxTorque}`。Rust 比對身分、setup、已記錄 profile 與目前 profile；無 evidence 只能提供機械基準，measured readiness 為 false。
- 新 live capture 開始前獨立確認 setup，使用實際 decoded 身分與目前 profile。保存／匯入選取不把 metadata 抄到目前設定；fresh live 才提供 PI／Class，離線欄位預設留空。使用者另外確認原車、改裝與配置相符。
- v1/v2 request shape、推薦與底盤數值保留，不偷偷加入新的必要欄位。歷史推薦驗證只能使用庫中 evidenceId，仍重新資格審核 raw；不相信 supplied moments。歷史數值重播／推薦移轉不是新的 current-confirmation。v3 缺確認時，workflow 與 Road 保存／compatibility 均拒絕，不能借用歷史驗證入口繞過。
- 未記錄的 HP／torque／drive、時間、遊戲版本、session／parts provenance 不會由目前設定補成歷史事實。新 `powertrain` 是 capture metadata，不是物理係數；0 是既有 profile 未輸入的 sentinel，不生成扭矩曲線。獨立確認是使用者聲明，不是原始來源證明。

## 保存與匯入

| 本機 API | 合約 |
| --- | --- |
| `GET /api/tuning/ev-evidence?carId=…` | 最新 100 份同車 metadata；SQLite readonly、參數化查詢；不返回 frames |
| `GET /api/tuning/ev-evidence/{id}` | 重新資格審核 raw 後返回 metadata／摘要 |
| `POST /api/tuning/ev-import` | 最多 8 MiB、30,000 frames；接受 `ev-capture/v1` export 或原生 `kind=ev-capture`；忽略 supplied summary／result |
| `POST /api/tuning/ev-selection` | 必須附獨立 confirmation；重算後回傳 raw、Rust readiness／diagnostics |

未知 schema、錯車／PI／Class／setup／profile、ICE／CVT 混用、缺／壞 raw 都不能取得新 v3 measured readiness。cold discovery 返回空清單，不建立 DB；壞 DB 回報 error。已選取 immutable raw 不可接續 live 錄製，須重新收集；可重新 export，原來源未知就保持 null，不補成 decoded-websocket。

8 MiB 匯入與 30,000-frame 收集是不同界線；數值較長的完整 export 可能超過匯入限制，此時 UI 拒絕，不截斷。`exportedAt` 是匯出時間，不是 capture time。

Rust 資格原因涵蓋連續時間、正輸出樣本、低／高 RPM、曲線、穩定低打滑速度與輪速；沒有 gear aggregate 時另回報缺通道／正輸出條件。batch 失敗保留 pending frames 並顯示重試，恢復後清除錯誤。不改原門檻或物理模型。

Road 保存／compatibility 的 raw 重算在 receiver mutex 外，包含尾斜線／重複斜線入口；重複 `/api/road` 前綴直接拒絕。只有 private `VerifiedRecommendation` token 精確比對 rec 與 identity 才跳過鎖內重播；外部 JSON 無法提供此 token。

## 驗證與剩餘範圍

Rust：`ev_archive_contract.rs`、`ev_measurement_contract.rs`、`ev_contract.rs`、`workflow_calculation_contract.rs`。前端：mounted hook／provider／panel 回歸。保存、export-import、restart、HTTP／CLI／MCP 的三版本結果一致；readonly 重播前後 DB bytes 相同。單速用 Taycan 第一檔投影，只證明單檔契約；unknown／locked 不造 1.00，不列待套用設定。原 EV golden／Taycan replay／ICE fixtures 不改。

完整 gate 與 exact-head CI 數據附 PR body。browser 腳本已更新為 v3，但保留 sandbox 的 Chromium 啟動因既有 `/usr/lib/chromium/chrome-sandbox` 配置失敗。未停用 sandbox 或更動安全權限；完整 browser、窄畫面、主題與原生 UI 驗收為 **NOT_RUN**。React/jsdom 互動測試不冒充瀏覽器／Tauri。

**NOT_RUN／未完成**：真正單速 EV 可見 FD A→B→A、fresh game／設備驗收、Taycan 原始 NDJSON hash 重驗、逐檔 candidate／target-speed solver、launch／shift／lap 最佳化與四賽事校準。Taycan G2 2.00→2.20→2.00 全程 FD 4.03，不是單速 FD 驗收。Issue #435 保持 OPEN。

#518 offline selection 與 #519 CVT evidence 為獨立 Draft。本分支不重做選車／CVT archive／安全白名單；整合須保留 #518 selectionGeneration／saved-profile 採集禁用與 #519 CVT current-context 分流。文字接線重疊主要為 `TuneSessionProvider` snapshot 與三語檔。`useWorkflowCalculation` 的 v3 僅適用 `isElectric && !usesCvt(profile)`，EV+CVT 維持 CVT unavailable。
