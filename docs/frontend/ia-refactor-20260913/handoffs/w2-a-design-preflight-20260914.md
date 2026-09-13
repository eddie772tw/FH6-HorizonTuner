# W2-A 拆分設計交接

日期：2026-09-14。設計盤點：Terra；整理與 ownership：IA Coordinator as Codex。狀態：**proposed / read-only preflight**，沒有啟動 W2。仍須 G2 通過、Coordinator 指定 WAVE2_BASE_SHA 與寫入範圍後才可派發實作。

程式盤點來源為 Shell c5e7fdf 加上 race handoff 修正，最終固定於 `54165303f12c9598872905571f7162cc5f80effa`。盤點沒有操作服務、native 或 browser。這份文件補充 [工作單 A](../work-orders.md) 與 [A-D 介面條件](../contracts-and-gates.md)，不是新的完成紀錄。

## 保留的資料與生命週期責任

| 現有 owner | 已核對的符號／行為 | 拆分限制 |
| --- | --- | --- |
| Sessions selection | SessionsStateProvider、SessionLoadGate、SessionOperationGate、applySessionIntent、prepareAnalysisSessionIntent | current/latest/saved/local、lap/compare 與 recorder data 寫入維持同一 owner；presentation 不拿 recorder setter。 |
| Shell / race | AppShell、SessionsRuntime | 狹窄 intent、race ownership guard、自動／明確導頁及 Retry 不由 A 重造。 |
| Live | LiveWorkspace、TelemetryView、TelemetryHistoryStore 與既有 canvas | Full 保留 Dashboard/Drag，Lite 只有 Dashboard；不新增逐影格 React state 或 subscription。 |
| Drag | DragTestView 與現有 `/api/drag/*` | status poll、prepare/save/delete/compare 留在 feature root；Drag 不成為 analysis selection 的另一來源。 |
| Road | RoadValidationController、RoadWorkflowView、useRoadWorkflow | A 只讀接點；不改 document、active run、驗證動作或既有 selection key。 |

## G2 通過後的順序

| 子步驟 | 現有檔案與預定新增檔案 | 驗收焦點 |
| --- | --- | --- |
| A1 Sessions/Analysis | `features/analysis/AnalysisView.tsx` 保留 effects、IO 與唯一 recorder/Sessions consumer；預定抽 `AnalysisSessionToolbar.tsx`、`AnalysisSessionVisuals.tsx`。若抽現有 track transformation，才新增 `analysisTrackPresentation.ts` 及其純測試。 | 來源切換、latest/explicit、lap/compare、debrief/map/metric、import/export/template/open/delete 與離頁清理；所有 late response guards 保留。 |
| A2 Dashboard | `features/telemetry/TelemetryView.tsx` 保留 subscription、HUD pause、units、expanded-card 與 render state；僅把語意完整的卡片區域抽至既有 `components/`。`LiveWorkspace.tsx` 保持小型 adapter。 | Full/Lite、units、pause、expanded card、各圖表與卸載清理；不改 history/Canvas/DPR 路徑。 |
| A3 Drag | 先將 `DragTestView.tsx` 現有 types 移至 `dragTestTypes.ts`；若抽 series transformation，以 characterization test 保護 `dragChartData.ts`；再抽 Controls/Comparison/Results。 | 保留既有 200 ms cadence、1200-point downsampling、驅動形式 slip 計算、排序、API 與寫入 owner；只搬移，不改公式或閾值。 |

以上名稱是提議，不能當成已存在 export。每步只有一個作者寫 composition root；語意分界優先，不依行數機械拆檔。既有純邏輯測試不重複搬到 facade，UI 不新增 DOM/Canvas 微觀斷言。

## A-D 接點提議

`SessionsWorkspace` 可接受由 Coordinator 接線的可選 Road review slot。最小 props 為 `workflowId: string` 與 `onReturnToTune: () => void`；只在獨立的 `roadWorkflowId` 有值時呈現，其他情況繼續 analysis。Props 名稱、export 路徑與使用方式仍需正式 freeze。

workflowId 不得進入 SessionsIo、analysis filename 或 saved-session selection。Sessions 保留分析選取；D/Road 保留歷史 review 的 accept/revert/draft actions 及 active run owner。返回 callback 不攜带 Tune step、generic subtarget 或錄製資料，也不建立第二個 controller。

A 完成並停寫後，Coordinator 才登記 A_FOUNDATION_SHA、AD_INTERFACE_SHA、exact slot/consumer 與 callback；D export 接線完成後另登記 AD_INTEGRATION_SHA。本次不填這些 SHA，避免把設計提議當成已完成介面。

共享 App/Shell、contexts、hooks、services、locales、backend、Tauri、HUD renderer/config、Tune/Road source 均不在 A 的 write scope；具體例外由 Coordinator 依最小 patch 處理。實際開工候選與交接狀態見 [execution](../execution.md)。
