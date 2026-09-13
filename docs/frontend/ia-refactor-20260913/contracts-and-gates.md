# 介面、開工條件與 PR 出口

更新：2026-09-14。Owner：Coordinator。狀態：public `CONTRACT_SHA` 已 freeze @ `54165303f12c9598872905571f7162cc5f80effa`；最新 Shell implementation source `2cb2983c763cce4ca86e2d4c79b0d7bfba3295fe` 只調整 Context 內部重入輪詢，不改此公開 contract。A-D 不包含在 freeze；G2 為 partial，最小剩餘是 C5/H5 native，G5 必要證據另待取得。本文件細化 [主計畫](README.md)，不取代 [實際狀態](execution.md) 或 [行為驗收](acceptance.md)。

## 1. G1-core 公開介面確認表

已凍結的逐項 producer/consumer、精確 SHA 與證據見 [G1-core 紀錄](evidence/g1-shell-freeze-20260914.md)。`2cb2983` 的 [受控 mounted 證據](https://github.com/eddie772tw/FH6-HorizonTuner/blob/2cb2983c763cce4ca86e2d4c79b0d7bfba3295fe/docs/frontend/ia-refactor-20260913/evidence/g2-mounted-reentry-20260914.md) 已完成操作 1–3；G2 最小 native 缺項獨立列於 [剩餘操作](evidence/g2-remaining-20260914.md)，不以 code contract freeze 抹去行為驗收。

G1-core 是 P2 前置：包含 workspace/capability/intent、四個狀態前置、資料來源與生命週期契約。C4 在此只凍結 analysis filename 與 Road workflowId 的分界；ValidationReviewSlot、A_FOUNDATION_SHA、AD_INTERFACE_SHA 屬於後續 A→D 接點確認，不是 P2/G2 前置。後期 review export 尚未存在，不阻擋共用 Shell 開工。

下表的 owner/consumer 是功能責任，不是共享寫入 lease。W2/A 的精確檔案分界以 [工作單 A](work-orders.md) 為準：SessionsRuntime、race lifecycle/status/completion、Shell intent preflight 及其測試由 Coordinator 保留；selection/provider/workspace 由 A 具名接手。B 的 Luna 面板協作僅依 [B2-panel 移交紀錄](handoffs/w2-b-design-preflight-20260914.md) 放行，不繼承 B 全目錄 lease。

下表的名稱區分「已有分支實作」與「提議」。只有 Coordinator 與 reviewer 核對 producer、consumer、生命週期及測試後，才能填入精確 `CONTRACT_SHA` 並標為 frozen；不得把表中提議名稱當成已存在 API。

| 介面 | 擁有者 / 消費者 | 現況 | freeze 前必須核對 |
| --- | --- | --- | --- |
| WorkspaceId / AppVariant / AppCapabilities / AppSurface | Coordinator / Shell、各 workspace | P1 `fc79608` 純契約；候選 #340 `16aa79aed0eeaa6653f86a72e21a0301f0517619` non-draft、12 checks SUCCESS | Full 四區、Lite 兩區；launchTest 差異；實際 entry gate；component registry 不滲入純 manifest |
| SessionIntent / AppIntent | Coordinator / Shell、A、D | P1 已有 latest-analysis、analysis filename、road workflowId；候選 #340 經 local review PASS | capability 拒絕、單次消費、資料選擇與導航分離、失敗不搶焦點 |
| TuneSessionProvider / useTuneSession | W1 Tune owner / 正式與 Developer Tune、root 掛載 | aggregate state-base `373c0b81add4b80786617c1b1358ce22ca78944d` 已含前置整合；CUA 觀察 goal/weight/Developer 301 跨頁，T3 1080 frames / 18 seconds sweep 與 save POST pending 往返成功 | 下節 state 表與既有量測失效/重測語意；Lite 不掛載；pending save 能完成但不得污染新 identity |
| RoadValidationProvider / useRoadValidation | W1 Road owner / Tune Step 4、D | aggregate state-base 已含候選前置；T3 save evidence 已有；Road snapshot fix 完成，Terra 獨立 review 9 tests/tsc PASS，UI baseline 建立成功；backend immutable guard 已拒絕帶 capture snapshot | selected workflow、所有未保存草稿、active run reconcile、pending operation 跨頁結算；完整 state/identity matrix 尚缺 |
| SessionsStateProvider / SessionsWorkspace / SessionsRuntime / LiveWorkspace | W1 A0 owner，後交 A / root | [aggregate state-base `373c0b81add4b80786617c1b1358ce22ca78944d`](https://github.com/eddie772tw/FH6-HorizonTuner/commit/373c0b81add4b80786617c1b1358ce22ca78944d) 已 push；`2cb2983` 已受控驗證 archive/Road identity、A/B 第二段交接與重入不累積，Terra G2 reconciliation PASS | 結果資料 identity、current/latest/saved/local、離頁返回、bounded retry、Full-only runtime；G2 不再列新的 browser matrix，僅保留 C5/H5 native |
| OverlayControlRuntimeProvider / useOverlayControlRuntime | W1 B0 owner，後交 B / HUD page、root | aggregate/Shell 已有 HUD offset 5 跨頁與 backend readback、raw capture 120 → HUD → 240 evidence；C5/H5 native 待完成 | Full/Lite app-session boundary；typed nested patch、未知欄位保留、序列化寫入與權威回讀 |
| ValidationReviewSlot 或同用途型別（非 G1-core） | Coordinator + A / D review export | 提議，W3 開工前確認 | workflowId 分界、selected review、onReturnToTune、結果 actions 的 owner、無第二條錄製 |

G1-core 記錄至少包含：實際 export 路徑與名稱、producer/consumer、BASE_SHA、CONTRACT_SHA、測試證據、owner 的交接狀態。public contract 的 `CONTRACT_SHA` 已登記為 [`54165303f12c9598872905571f7162cc5f80effa`](https://github.com/eddie772tw/FH6-HorizonTuner/commit/54165303f12c9598872905571f7162cc5f80effa)，authoritative race 修正與 terminal measurement force-publish 已完成且 Terra 最後整合 review PASS、無 P1/P2 blocker；新 race handoff 修正另經 Terra 獨立複查，guard 保留至 Shell 第二段 preflight 與 Retry。此 freeze 只涵蓋 G1-core public contract，不涵蓋 A-D，也不等於 G2 pass。A→D 接點依第 3 節獨立確認，不回頭阻擋 G1-core。

### 1.1 恢復後候選紀錄

aggregate state-base [`373c0b81add4b80786617c1b1358ce22ca78944d`](https://github.com/eddie772tw/FH6-HorizonTuner/commit/373c0b81add4b80786617c1b1358ce22ca78944d) 已 push；public Shell contract 仍是 [commit `54165303f12c9598872905571f7162cc5f80effa`](https://github.com/eddie772tw/FH6-HorizonTuner/commit/54165303f12c9598872905571f7162cc5f80effa)。最新 source [commit `2cb2983c763cce4ca86e2d4c79b0d7bfba3295fe`](https://github.com/eddie772tw/FH6-HorizonTuner/commit/2cb2983c763cce4ca86e2d4c79b0d7bfba3295fe) 的 Context blob `4b53495569904fb95a19d6195037834f3f8f14ca` 未改 public API；119 files／794 frontend tests、Full/Lite build、334 backend tests、8 backend test modules、Ruff 214 files 與 version `11.45.17` 均為該受控交付記錄。native cargo debug compile 是 c5 歷史證據。Shell [PR #345](https://github.com/eddie772tw/FH6-HorizonTuner/pull/345) 為 draft；精確 head/checks 只在 execution 登記。

精確 PR head/checks 與依賴條件統一見 [execution.md](execution.md)，不在本契約文件維護第二份 current table。root-owned [g0-lite-browser-20260914.md](evidence/g0-lite-browser-20260914.md) 是基準證據，沒有 native/三次效能結論。

## 2. 狀態存活與失效表

這是驗收契約；未在候選分支驗證前，不宣稱已實現。既有 persistence schema/key 不變；「app session」表示程式仍開著時保留，不承諾程序重啟後恢復未保存草稿。

| 狀態 | owner / 存活期 / 版本 | 重啟恢復 | identity、回讀與非同步規則 |
| --- | --- | --- | --- |
| active workspace / app surface | Shell / app session / Full+Lite | 不新增 storage；未知或禁用目標回 Live | 只持有工作區/surface/窄 intent，不持有 feature step 或 lap |
| telemetry、overlay relay、recorder | 現有全域 runtime/provider / app lifetime | 沿既有 backend-ready 連線流程 | provider 順序不變；最後 owner 釋放資源；reconnect 不重複累積 channel |
| 正式 Tune step | Tune controller / app session / Full | 沿 `tuning-workflow-state` v3 與 v1/v2 restore | 車輛/設定與 readiness 改變沿既有規則 reconcile，不恢復成非法 step |
| goal / season、Developer step 與輸入 | Tune controller / app session / Full | 只保留既有已持久化部分 | 正式/Developer 各自保存，不合併 solver；切工作區不重置 |
| engine selection / measurement | Tune controller / app session / Full | 既有 archive 可讀；不新增未保存樣本恢復 | 盤點並維持既有 car/profile/PI/class/RPM 等適用性判定；ready、重測、暫停、換車與斷線不可混同 |
| capture metadata / buffer / status | Tune capture owner / 活動 capture / Full | 不新增 capture schema | UI 卸載不默默停止；identity 失效明確標示；保持既有樣本上限，不保留重型 UI |
| engine archive pending save / reuse | Tune async owner / 操作結束前 / Full | 只以 backend 已確認保存為準 | 晚回應不覆蓋新車或新 selection；成功與失敗可見，重試避免重複保存 |
| Road selected workflow / step / setupId / choiceSaved | Road controller / app session / Full | 沿 `road-selected-workflow`；storage 不可用安全回退 | backend active run 開始/結束才 reconcile；重掛載載入舊 summary 不覆蓋手動 step |
| Road prepare / candidate / finish / result selection 草稿 | Road controller / app session / Full | 已送出 documents 由 backend 恢復；未保存草稿不承諾重啟 | 草稿綁 workflow/setup/summary identity；包含子元件表單，不只保留 show/hide |
| Road confirmed / unchanged gating | Road controller / 有效 run/setup/input identity / Full | 不新增確認持久化 | 新 run、setup、車輛或 input 改變須重新確認，不能用舊 checkbox 繞過 gating |
| Road pending mutation | Road operation owner / settlement 前 / Full | 以 backend document/active run 為準 | 切頁不發 start/stop；新頁顯示 busy；settle 通知刷新；晚 callback 不切換新 selection |
| Sessions selection / lap / compare / metric | Sessions controller / app session / Full | 不新增 schema；已存資料由 backend 讀取 | 普通返回保留；明確 intent 才覆寫；filename 與 workflowId 不互換；generation guard 先於 shared state 寫入 |
| Sessions imported MoTeC / current refresh | Sessions owner / app session 與當前頁 / Full | 不新增匯入資料 schema | 匯入後重入可重建可視資料；page refresh 離頁停止，不重疊請求或覆蓋 saved/local |
| latest-completion notification / retry | Sessions runtime / app lifetime / Full | 不新增儲存承諾 | 有界重試、成功讀取與 identity 證據；僅 Live active 可自動開啟；Tune/HUD 保留入口，Lite 不掛載 |
| HUD config / pending writes | HUD feature runtime / app session / Full+Lite | backend 權威設定 | 每次修改使用 typed patch；巢狀/未知欄位保留；串行保存、失敗處理、晚 GET/POST/BC 不回退新值；重入不強制 disable |
| HUD page metadata / panel / page channel | HUD page / UI mount / Full+Lite | panel 不新增持久化 | page reads/listeners 清理；pending writes 與外部 native HUD 不跟著關閉 |
| settings values | 既有 SettingsContext / app lifetime / Full+Lite | 既有 key/schema | C 只處理呈現與已確認能力；baseline persistence 缺陷分開記錄 |

每列 G1 確認記錄另填 `implemented export`、`reviewed SHA`、`pass/fail/not-run`、證據路徑與未解問題。只有 pure state 測試不能證明 React provider 沒有重建；G2 必須有實際跨頁行為證據。

## 3. A → D 介面 freeze

開工 D 前由 A 停寫，Coordinator 記錄以下資料：

```text
A_FOUNDATION_SHA: <D 開工前已將 Shell + A Sessions foundation 接線的完整 SHA>
AD_INTERFACE_SHA: <D 開工前 review slot 型別、intent 與 return callback 已凍結的完整 SHA>
Shell parent / A foundation parent: <對應完整 SHA；上兩個 SHA 可相同>
Review slot / Props / Planned consumer: <已存在的接點與型別；D export 尚待實作>
Data semantics: road workflowId 與 analysis filename 分離
Selection owner: Sessions
Review document/action owner: Road
Return action: 明確返回 Tune，不傳 step index 或 generic subTarget
Active run owner: 既有 backend + 單一 Road controller
Locale/shared-file requests: <已處理或待處理明細>
Review and evidence: <路徑>
Owner transfer: A 已停筆；D 可寫 tuning/road；Coordinator 後續寫 D-to-Sessions 接線
```

D export 歷史 review 後，Coordinator 接入 A 留下的 slot，另記 `AD_INTEGRATION_SHA` 作為後續整合與驗收候選。此 SHA 是 D 的出口，不是 D 的開工前置；開工時不要求尚未存在的 D component。準備/開始/錄製保留 Tune；結果 accept/revert/draft 操作各有入口。沒有 pre-D 確認記錄，不以「A 測試綠燈」啟動 D。

## 4. 相容程式移除表

以下部分是已知 WIP，部分是預定 adapter；恢復時先核對是否仍存在，補上精確路徑和 SHA。Controller 本身是正式長駐狀態邊界，不因清除 adapter 而刪除。

| 項目 / 路徑 | 暫留行為與風險 | owner / 最晚出口 | 移除條件與證據 |
| --- | --- | --- | --- |
| `app/legacyNavigation.ts`、Navigation/LiteNavigation 舊入口 | P1 過渡型別仍知道 feature subtab | Coordinator / P2-G2 | 新 Shell 承接導航與所有舊 status/menu 能力；C1–C5；無 legacy consumer |
| Tune `currentStep/setCurrentStep` 相容 props | 舊 App 控制入口與新 state owner 可能並存 | Coordinator + Tune owner / P2-G2 | Full entry 改用 session provider；T1–T4；不存在兩個 step owner |
| `TuneSessionBoundary` / `RoadValidationBoundary` fallback | 單獨舊頁可用；錯誤雙層 provider 有重置風險 | Feature owner / W4-G5 | 每個正式入口有明確 provider；必要測試/獨立 consumer 若保留需具名證據；C3、T、R |
| W1 Live/Sessions 薄 wrapper | 先保留 Analysis 的完整功能，不代表已拆分完成 | A / W2-G3 | A2 composition 完成、L1–L4/S1–S4 可達；不要求刪除有用途的 facade |
| Road reviewHistory 舊入口 | 在新 review 接線前避免歷史失去入口 | D + Coordinator / W3-G4 | Sessions 可開所有舊結果與既有 actions，R1–R5 通過後移除 |
| P2 `SettingsView allowDeveloperTuning` 薄呈現 | 暫時能力過濾，尚非完整 SettingsSurface | C + Coordinator / W2-G3 | C 接手 SettingsSurface、分類與 U1–U3；避免雙重 modal |

新增任何暫存 wrapper，需同步登記 path、保留理由、測試、移除 owner、最晚 gate。到期仍保留必須寫明具體 consumer 與必要性，不能只以「之後清理」關單。

## 5. 每波出口與依賴

以下是目前實作順序。W1 與 Shell 已提交，G1-core code contract 已更新；G0 observability 與 G2 完整行為仍未通過。

G0-code（固定 SHA、dirty ownership、inventory、baseline test/build）是 P1/W1 開工條件。G0-observability（Full/Lite native baseline、三次效能基準）以固定 source SHA 保留，作為 X3/G5 比較前置；尚缺時可進行純契約與狀態前置，但不能宣稱效能改善或 G5 通過。G2 明列的 native HUD lifecycle 子項仍須在 G2 取得，不能延後冒充已完成。

| 工作 / 進入條件 | 可交付 PR 單位 | 完成依據 | 仍不可宣稱 |
| --- | --- | --- | --- |
| W0/G0：確認 source SHA 與 ownership | docs/baseline | G0-code 開工基準與 G0-observability 量測分開登記；保留原 baseline 可重測 | baseline 測試不證明 candidate 正確或真實 FH6 已驗收 |
| W1/P1：G0-code、共享契約範圍確認 | pure contracts / dead state | 純能力/intent 測試、舊 props consumer 清查、完整 frontend gates | P1 helper 存在不等於新 Shell 已採用 |
| W1 狀態前置：P1 精確 SHA | Tune、Road、Sessions A0、HUD B0 可分 commit/PR | 第 1、2 節確認；identity/late response、pending writes、草稿測試；獨立 review | 未接線的 provider 不等於跨頁行為通過 |
| W1/P2：前置整合、G1-core freeze | 共用 Shell + root wiring | 既有 UI + W1 foundation 的 C1–C5、T1–T4、L3/L4/S1、H4/H5、U1/U2 與 X1 前置子項；owner/範圍依下段，native 不以 mock 代替 | 未完成 G2 不開 W2；不要求此時完成 A2/B2/C/D 重構 |
| W2 A/B/C：G2、共同 WAVE2_BASE_SHA | A1/A2、B1/B2、C 分工 PR | 各工作單 L/S、H、U 與 X1/X2；Coordinator 接線與實際 consumer；A-D slot freeze | 隱藏選項不等於禁用能力不會 mount；B 的 native 控制須有 native 結果 |
| W3/D：A_FOUNDATION_SHA + AD_INTERFACE_SHA | Road review export + root wiring | 產生 AD_INTEGRATION_SHA；R1–R5、T1–T4、S1/S2 整合；移除 history fallback | 無 backend 新 schema、非 Road 原生錄製擴張 |
| W4/P7：所有 lane 已接線 | lifecycle 清理、必要回歸修復 | X1–X4、adapter register 到期處理、組合驗證 | 沒有量測不可承諾效能提升 |
| W4/P8：候選固定 | 架構/README 文件與 G5 evidence PR | Full/Lite 最終矩陣、native/遊戲/效能證據及其來源；Journal 僅已重現學習 | 缺 G5 必要證據保留 draft，不能宣告整體 done |

G2 只驗證既有 UI 加上 W1 狀態前置的跨頁行為：T1–T4 由 Coordinator + W1 Tune/Road；L3/L4/S1 由 Coordinator + A0；H4/H5 由 Coordinator + B0；U1/U2 由 Coordinator 的薄入口負責。A/B/C/D 在各自遷移後重新驗證完整 lane 範圍，不能引用 G2 局部證據當作完成整個重構。

G2 前置的實際 native HUD 離頁行為若尚未驗證，G2 就保持未通過；缺項的相關 Shell/HUD PR 保留 draft，不影響已獨立完成的純契約 PR。不能將前置缺項改名成 G5 來放行 W2。G5 最終完整驗收則要求 acceptance 指定的最低環境與全組合證據；不要求每一個 pure contract 都另外用真實遊戲證明。

目前 gate record：G0 為 `partial`（含 root-owned [g0-lite-browser-20260914.md](evidence/g0-lite-browser-20260914.md) 與 Shell exact-SHA native handoff/X1 局部量測；完整 native baseline/三次效能仍缺）；G1-core public contract 已 freeze @ [`54165303f12c9598872905571f7162cc5f80effa`](https://github.com/eddie772tw/FH6-HorizonTuner/commit/54165303f12c9598872905571f7162cc5f80effa)，不包含 A-D；G2 為 `partial`，`2cb2983` 已取得操作 1–3 的受控 mounted evidence，[原生產物與視窗紀錄](evidence/g2-native-artifacts-20260914.md) 的 Full AX 局部成功與兩次前景啟用失敗不構成 C5/H5 結果，最小 remaining 仍僅 Full/Lite C5/H5 native，仍不啟動 W2。完整資源生命週期、真實 FH6 與三次效能比較屬 W2–W4/G5，不能把它們回填為新的 G2 blocker 或把 C5/H5 缺項升格為 G5 pass。

## 6. PR-ready 判定

每個 PR 交付檢查同一份清單，欄位不能空白；不適用項目寫原因。

1. 記錄實際 base branch、BASE_SHA、head SHA、CONTRACT_SHA、直接前置 PR 與合併順序。
2. diff 只含 allowed paths，shared-file owner 的接線已完成；公開 export 有真實 consumer 或明確「未啟用 foundation」範圍。
3. frontend 程式 PR 在精確候選上完成 test/build/diff-check；docs-only 完成文件/whitespace 驗證。沒有最後修改後驗證的 WIP 不能繼承先前綠燈。
4. 指定 acceptance 子項有環境、步驟、結果與 artifact；單元、受控 UI、native、遊戲、效能各自標示，不合併成一個 pass。
5. 獨立 reviewer 檢查 diff、狀態與 async/lifetime；有阻塞的 findings 已修正並複查。作者自述不是獨立 approval。
6. 推送後重查精確 head 的所有 required checks、分支保護與 unresolved review；`MERGEABLE/CLEAN` 與 non-draft 都不是單獨充分條件。
7. PR body 符合專案模板、列出最新變更/驗證/依賴；handoff 可讀；locale/contract requests 無未處理 blocker；回退順序與 adapter 移除條件明確。

狀態用語：

- **WIP / draft**：程式或驗證尚未完成。
- **Validated on dependency base**：在指定前置 branch 驗證，但前置尚未合併到最終目標；不能稱為可立即合併 main。
- **Ready to Merge**：目前目標分支、前置條件、檢查及審查均滿足，無待處理 blocker；仍不代表已 merged 或整體 G5 通過。
- **G5 evidence incomplete / draft**：相關 PR 尚欠必要真實證據時必須保持 draft，並保留缺項、owner 與取得方法。不能為了把 PR 設非 draft 刪掉其驗收責任。

若 source branch/head 或 base 改變，重新判斷受影響證據，不沿用過期 PR-ready 標記。實作目標已恢復；Coordinator 依每個精確候選建立及更新 PR，未獲合併要求不合併 main。

## 7. 組合驗證與回退

相依 PR 模式先記錄 integration head；前置合併後才對齊新的 main。A/B/C 從同一已通過 G2 的 SHA 開始，Coordinator 預設依 A→B→C 整合，再加 D 與最終接線。

若聲稱 A/B/C 獨立可整合，在隔離 worktree 檢查 AB、AC、BC 與 ABC 的衝突/範圍及交互行為；每個實際程式組合跑 frontend test/build/diff-check。只有承諾任意順序時才擴至七子集、十二轉移的 Git 演練。純 Git tree 相同不能取代 runtime 驗證。

rebase/cherry-pick 等改寫提交時以 range-diff 和實際 diff 檢查行為未遺失；普通 merge 檢查 merge diff 與 shared contract consumers。沒有新變更、錯誤或疑慮時不重複相同測試。

D 只能基於含 Shell + A foundation 的精確 parent；不宣稱 D 可獨立於 A 合併。回退先 consumer/wiring、後 foundation/contract，保留使用者資料與 schema；不使用 reset/clean 抹除別人的工作。
