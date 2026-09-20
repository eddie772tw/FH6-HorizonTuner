# 盤點基準與證據

日期：2026-09-13；程式基準 `5891d21bca35161836d84c51d1b6e9c279ec4709`。以下保留當日的靜態程式核對，並非執行測試或實機證據。2026-09-14 後續測試與工作樹狀態見 [execution.md](execution.md)，不以下方歷史 not-run 覆蓋已執行結果。後續 SHA 改變時需重新核對相關段落，行號只對此基準有效。

## 來源與環境

- 附件：`C:/Users/eddie/Desktop/frontend-information-architecture-refactor-plan-20260913.md`。
- 原附件 SHA-256：`49f9c0a425222c4f7aa630b2a82a7a12c79f30becec0703b6afde743bfa6553a`。
- Repository 內的 [source-proposal.md](reference/source-proposal.md) 只正規化空白/換行；不把其中的 status 或指令當成當前授權或已完成證據。
- `git fetch origin main` 成功；`git rev-parse HEAD origin/main` 均為上述 SHA。
- 原 main 開始時 `git status --porcelain=v1` 無輸出。其他調校 worktree 保留且本輪未寫入。
- 三位唯讀 scout：`sessions_scout`（Terra/high）、`hud_scout`（Terra/high）、`variant_test_scout`（Luna/high）。Coordinator 對重要結論重新查碼；未採用未核實的推論。

## 程式現況

以下路徑以 repository root 為準，全部可在本規劃 worktree 的同基準程式中查閱。

| 證據位置 | 當前事實 | 計畫影響 |
| --- | --- | --- |
| `frontend/src/App.tsx:23–46` | root 持有 workspace 舊 aliases、Telemetry subtab、正式/Developer step、dead HUD category；存在 `subTarget?: any` | P1 typed contract、P2 Feature state ownership |
| `frontend/src/App.tsx:68–83` | Full 的主要頁以 CSS 隱藏，元件仍 mounted | 卸載前先保存 state/lifetime |
| `frontend/src/LiteApp.tsx:17–32` | Lite 條件 mount，Live 傳 `dashboardOnly`，Settings 用完整元件 | 不把 Full Launch Test 自動帶入 Lite |
| `frontend/src/AppProviders.tsx:14–22` | Full/Lite 已共用 Theme→Toast→Settings→CarParams→TelemetryRecorder | provider 不隨 workspace 重建 |
| `frontend/src/main.tsx:10–22`、`frontend/src/lite-main.tsx:1–24` | 實際 Lite entry 是 lite-main；Full 有 early theme restore，Lite 沒同樣 inline bootstrap | P2 記錄首幀差異，保持 backend-ready/transport/StrictMode，補驗證 Anti-FOUC |
| `frontend/src/components/Navigation.tsx:29–75,116–143,277–440` | 現有導航还管理 update、Data Out、UDP 健康與動態 MCP port notice | 搬到 AppMenu/AppStatus，逐項確認沒有漏功能 |
| `frontend/src/features/tuning/tuningWorkflow.ts:4–40` | 四步、v1/v2/v3 restore contract 已存在 | 不套用舊六階段計畫 |
| `frontend/src/features/tuning/TuningView.tsx:31–40,67–90` | goal/season、reviewHistory、engine hook 都在 Feature；history 將畫面換成 RoadWorkflowView | P2 草稿保留；D 取代 history swap |
| `frontend/src/features/tuning/TuningView_dev.tsx:26–33` | 目標、路面、速度、頻率、阻尼等為 local state | Developer 離頁也需保留，不能只搬正式 step |
| `frontend/src/features/tuning/useEngineMeasurementArchive.ts:12–22` | selected、pending、generation 等為 hook-local | 確認在途量測與保存的跨頁語意 |
| `frontend/src/features/telemetry/TelemetryView.tsx:80–92,166–182` | internal/controlled subtab；race 下降後固定 500ms 載入 latest，然後跳 analysis | latest 完成不能只憑 timeout，離開 Live 需考慮 completion observer |
| `frontend/src/features/analysis/AnalysisView.tsx:37–84` | selection/laps/compare local；mount 抓 current；錄製時每 4 秒 refresh，cleanup 清 timer | 明確 latest intent 不得被 mount current 覆蓋；await 後需防過期寫入 |
| `frontend/src/context/TelemetryRecorderContext.tsx:106–166` | app-level provider polling status 2 秒，backend 是資料權威，currentSession 前端固定空陣列 | 不假設它已提供「完成且已保存」事件或完整 current buffer |
| `frontend/src/features/road/useRoadWorkflow.ts:15–55` | `road-selected-workflow`、獨立 Road documents/live API、每秒 poll，unmount 清 timer | 不將 workflowId 當 analysis filename |
| `frontend/src/features/road/RoadWorkflowView.tsx:13–48` | prepare/drive/results 與 setupId/choiceSaved；null recommendation 限制部分動作，但 results 仍傳 perform | 歷史 review 與錄製編輯需顯式分界；保留合法結果動作 |
| `frontend/src/features/road/RoadPrepare.tsx:10–15`、`RoadRunPanel.tsx:8–13` | 事件/條件等未提交表單為 local state；run/setup/input 改變會重置確認 checkbox | 需保留草稿，但不能保留過期確認繞過 gating |
| `frontend/src/features/tuning/components/SetupVerificationStep.tsx:21–38` | Road 使用原生 workflow；非 Road 使用 compatibility snapshot | 不宣稱其他 purpose 已有原生驗證 |
| `frontend/src/features/overlay_control/OverlayView.tsx:40–61` | props 宣告 category，但元件不消費 | dead-state 清理有直接證據 |
| `frontend/src/features/overlay_control/OverlayView.tsx:105–124,241–258` | page channel cleanup 存在；save optimistic state/BC 後 POST，無完整成功/rollback/排序處理 | B 先定義 async 與權威設定策略，不能只搬 JSX |
| `frontend/src/hooks/useOverlayWebSocket.ts:20–81` | app-level WS/config relay，有 reconnect/channel cleanup | 不搬入 HudWorkspace |
| `frontend/src/hooks/useTelemetry.ts:107–136,313–338` | sharedWs/subscriber 機制；connect 內建立 HUD channel，per-hook 5Hz timer，最後 subscriber 釋放 WS/RAF | 區分 app connection 與 page subscription；另查 reconnect channel lifetime |
| `frontend/src-tauri/src/lib.rs:403,446,578` | native HUD 預建隱藏視窗，顯示/關閉涉及 navigate 與 hide | web mock 不能證明 native 開關行為 |

Component 大小：OverlayView 1611 行、AnalysisView 575 行、TelemetryView 476 行、SettingsView 109 行。前三者需要巨型元件技能；行數不作為驗收 KPI。

## 已確認需保留的生命周期

| 資源 | 目前 owner | 遷移要求 |
| --- | --- | --- |
| analysis status polling | TelemetryRecorderProvider | workspace 切換仍存活，避免重複 provider |
| analysis page refresh | AnalysisView | 離頁停止 timer，未完成 response 不覆寫新選擇 |
| Road live polling | useRoadWorkflow | 頁面離開停止；已存在 backend active run 不被停掉 |
| overlay config page channel | OverlayView | 離頁 close；重進重抓權威設定 |
| overlay WS relay | App/Lite root 的 useOverlayWebSocket | app lifetime 保留 |
| shared telemetry WS/RAF | useTelemetry subscriber 機制 | 頁面 subscriber 清理，仍需的 app/HUD stream 保留 |
| HUD native 視窗 | Tauri/backend/renderer | 不因設定頁卸載而 close/hide/navigate |
| Tune engine capture | Tune 元件與 hooks（含更深層 step） | G1 列完整 owner；不可默默丟棄在途測量/未保存結果 |

兩個容易誤判的細節：TelemetryView:178 的 `return () => clearTimeout(timer)` 確實是 effect cleanup，不是「沒有 cleanup」。仍需驗證 await 後的過期回應。`useTelemetry.ts:126` 的 channel 實際在 connect closure 內，不能因縮排誤認為 module-level singleton；目前 cleanup 未明確 close 該 channel，需在 G0/G1 確認 reconnect/StrictMode 下是否累積，若重現則由 Coordinator 以最小 lifecycle 修復處理。

## 額外缺口的處理，不自動擴大範圍

| 發現 | 證據強度 | 處置 |
| --- | --- | --- |
| Settings 初始 merge 沒回填部分 MCP/telemetry/forwarding 欄位；auto-check update 持久化也需核對 | `SettingsContext.tsx:263–278` 靜態觀察；未做重启實驗 | G0 用隔離測試設定重現，記錄既有 issue。C 不越權改 context/backend；若阻礙 preserve gate，Coordinator 拆出前置修復或獨立 proposal |
| HUD reset center-anchor frontend false/backend true | `hudConfig.ts:141`、`backend/main.py:2624` 靜態確認 | 本次保留現有 UI reset 語意，不順便更換 reset endpoint/預設 |
| Audio 選擇可能經 config POST 與專用 endpoint 重複操作 | OverlayView:134 與 backend main.py:2751 附近 | B 先追蹤副作用；只在能證明等效時做 GUI controller 的最小修正 |
| WIP HUD 讀取 developer_tuning_enabled | OverlayView:90 | Lite 只隱藏 Tune-only setting 不代表 WIP HUD 必須消失；保留現有 WIP 行為，能力解耦若必要由 Coordinator 決定 |
| renderer destroy 與 WebView navigation 清理層級不同 | `hud_overlay/shared/coordinator.js`、`hud-core.js` 與 Tauri close path 靜態觀察 | renderer 不在 B scope；量測結果分開列既有 runtime 資源與新增 page leak |
| SettingsLayout.test 以 source regex 固定三欄/順序 | `frontend/src/features/settings/SettingsLayout.test.ts:10–27` | C 可隨新 UX 替換過時測試，保留能力/設定可達性驗收；不能繼續把舊 markup 當新架構要求 |

## 實際驗證狀態

| 項目 | 本輪 |
| --- | --- |
| git branch/worktree/remote SHA 核對 | 已執行 |
| 原附件 hash、程式/規範、test/build scripts 閱讀 | 已執行 |
| frontend tests/build | `not-run`，使用者選擇純規劃，G0 補跑 |
| backend tests、原生 Full/Lite、HUD/MoTeC/遊戲驗收 | `not-run` |
| CPU/RSS/60Hz baseline | `not-run`，不能宣稱效能改善 |
| 文件路徑、來源內容、diff whitespace | 收尾驗證，結果記於 HANDOFF |

現有 `frontend/package.json`：test 是 `vitest run`，build 是 `tsc && vite build`。`vite.config.ts:174–184` 是 Full/Lite multi-entry，一次 web build 產生兩入口；沒有獨立 `build:lite` script。Vitest include 是 `src/**/*.test.ts` 及 HUD-owned tests；`.test.tsx` 不會被目前 glob 自動執行。
