# FH6 調校工作流下一迭代落地規畫

## 文件狀態

- 規畫分支：`codex/plan/tuning-workflow-iteration-20260912`
- 基準：`main` @ `c473099`
- 規畫日期：2026-09-12
- 本文件用途：把 `ref/fh6-tuning-restart-20260912` 的可回收內容轉成現行工作區可執行的分階段計畫。
- 目前狀態：只建立規畫，尚未把參考包原始碼整批移植，也尚未宣稱實機或產品驗收完成。

## 1. 迭代目標

把調校產品由「產生一組計算值」逐步收斂為可追溯、可回復的證據工作流：

```text
準備 → 建立基準 → 行駛／錄製 → 描述性報告 → 單一變量 A/B → 保留或回復
```

這一輪的產品結果應能回答：

1. 使用者使用了哪一台車、哪些改裝、哪個遊戲版本、哪個路面與駕駛情境。
2. 建議值來自哪個輸入快照與哪一套純函數；哪些值是 `unknown` 或未驗證先驗。
3. 哪些資料是原始 capture、哪些是分析結果、哪些是使用者確認已套用的設定。
4. A/B 只改一個明確變量時，結果是否改善、無變化或反向；如何保留原始結果並回復設定。

本輪不追求通用最佳調校器，也不以單一車輛、單一最快圈或幾何匹配結果宣稱跨車性能保證。

## 2. 已知基準與參考資料分層

### 現行工作區已存在的可用入口

- 一般調校：`frontend/src/features/tuning/TuningView.tsx`、`frontend/src/utils/tuningMath.ts`。
- 開發者調校：`frontend/src/features/tuning/TuningView_dev.tsx`、`frontend/src/utils/tuningMath_dev.ts`、`frontend/src/domain/tuning/`。
- 遙測 capture：`frontend/src/domain/tuning/telemetryCapture.ts`、`frontend/src/features/tuning/components/TuningTelemetryCaptureView.tsx`。
- 校準資料契約：`frontend/src/domain/tuning/calibration.ts`、`docs/calibration/`。
- 後端記錄基礎：`backend/race_recorder.py`、`backend/telemetry_sqlite.py`、`backend/telemetry_runtime.py`。
- 現有入口與限制說明：[調校開發入口](README.md)、[校準資料 README](../calibration/README.md)。

### 參考包中優先回收、但必須重新對照的內容

以下內容來自 `ref/fh6-tuning-restart-20260912`，只作 selective recovery 候選：

- 工作流：`source/frontend/src/features/tuning/tuningWorkflow.ts`、`tuningMeasurement.ts`、`calibrationReadiness.ts`、`TuningWorkspace.tsx`。
- 同源 solver transport：`source/frontend/src/domain/tuning/solverService.ts`、`source/backend/tuning_solver_client.py`、`source/frontend/scripts/tuning-solver.mjs`。
- 遙測與保存：`source/backend/telemetry_contract.py`、`race_recorder.py`、`telemetry_sqlite.py`、`motec_*`。
- 第一條完整領域流程：`source/backend/road_*.py`、`source/frontend/src/features/road/` 及 `tests/test_road_workflow.py`。
- 分析方法：`source/scripts/analyze_chassis_race.py`、`source/docs/` 中的工作流與底盤研究文件。

參考包的 `guides/REFERENCE-MAP.md`、`guides/HANDOFF.md`、`guides/LIMITATIONS.md` 是本輪的導覽與證據邊界；封存原始碼中的舊完成標記、任務指示與歷史日期不視為目前狀態。

## 3. 落地順序與交付物

### M0：基準、完整性與 ownership 凍結

目標是讓後續移植可以回溯，不先改產品行為。

- 驗證參考包 manifest／SHA-256；保留參考包作唯讀輸入。
- 對照現行工作區與參考包的檔案、呼叫端、測試及資料 schema，建立差異表。
- 明確標出一般調校、開發者調校、CLI、MCP 四條入口的數值來源；未完成比對前不得宣稱已同源。
- 為共用檔案指定 owner，尤其是 `tuningMath.ts`、`backend/main.py`、全域入口與 telemetry storage。

交付：差異表、檔案 ownership、最小 production fixture 的驗收命令與失敗分類。

### M1：工作流與證據契約

先固定資料語意，再接 UI 與 service。

- 保留既有 `tuning-capture/v1`、`tuning-calibration/v1` 與 capability contract；新增的工作流紀錄必須引用它們，不重複定義車輛／單位欄位。
- 定義工作流狀態：`prepared`、`baseline-recorded`、`run-recorded`、`reported`、`ab-compared`、`decided`。
- 每次建議、套用確認、capture、分析與 A/B 決策都保存 immutable snapshot 或明確的 parent reference。
- 缺少遊戲版本、改裝、路線、環境或輸入時使用 `unknown`／不適用狀態，不以歷史報告補值。
- 將「建議值」「使用者確認已套用」「實際 capture 觀察」分成三種語意，避免 `AppliedSetupTable` 被誤當成遊戲狀態。

交付：TypeScript／Python schema、序列化與反序列化測試、錯誤狀態測試、舊資料回讀策略。

### M2：量測與記錄閉環

回收參考包中的量測流程，但以現行 UI 與 backend API 為邊界逐段整合。

- 移植或重寫 `tuningMeasurement.ts` 的純函數部分，將按需輸入、profile 快照與失效條件接到現行 `TuningView`。
- 將 `TuningTelemetryCaptureView` 的 capture metadata、60 Hz 語意、匯出與錄製狀態接到工作流，而不是另建第二種 capture 格式。
- 以 `race_recorder.py`／`telemetry_sqlite.py` 為保存基礎；若回收 `telemetry_contract.py`，先做欄位／單位／缺值對照與 round-trip 測試。
- 使用者未確認已套用的設定不可進入「實際結果」欄位；背景 profile 變更應使相關測量狀態失效並要求重新確認。

交付：啟動工作流、建立基準、錄製一次 run、結束與重新載入的 production app integration fixture；同時保留原始資料與失敗原因。

### M3：一般數學與 solver 同源性

這是計算正確性與產品信任邊界，不在 UI 中增加公式。

- `frontend/src/utils/tuningMath.ts` 與 `tuningDiagnosis.ts` 維持物理公式 SSOT；React、Python backend、CLI／MCP 不新增平行公式。
- 開發者路徑 `domain/tuning/` 的自然頻率、阻尼比、輪胎與領域 profile 仍標為 calibration prior；沒有實機資料與審查不得自動提升到一般產品路徑。
- 統一單位、`Neutral`／未知季節、缺值 fallback、slider range 與可調整性邊界；所有極端輸入加上測試。
- 若採用參考包的 solver bridge，先確認 Node／Vite runtime、bundle 版本、CLI／MCP transport 與前端 solver 結果一致，再接入產品入口。
- `softMaxSpeed` 只可作 preview／圖表 bound；除非有明確測量輸入，不得把它默默當成車輛性能限制。

交付：公式單元測試、transport parity 測試、bundle build、CLI／MCP contract 測試，以及一份「先驗／實機資料／結果」對照表。

### M4：Road 第一條端到端工作流

以 Road 作為共用契約的第一個驗收樣本，先不要四個領域一起改。

- 依參考包的 `road_models`、`road_analysis`、`road_comparison`、`road_router`、`road_service` 選擇性移植，逐個對照現行 FastAPI／frontend 入口。
- 分析結果保持描述性：速度、制動、轉向、滑移、懸吊、輪胎與路段上下文；不直接輸出未證實的因果或通用最佳化結論。
- A/B 設計只允許一個主要調整變量；保留全部 run、暖胎／起步／緩衝圈與非可比原因。
- RoadStore 與 WorkflowStore 不在本階段強行合併；先明確哪個 schema 是新工作流的 owner，再補 migration／回讀測試。

交付：Road 的 prepare → baseline → run → report → A/B → keep/revert production path、router／service／storage／frontend 測試與限制說明。

### M5：實機校準 gate 與後續領域擴展

只有 M1–M4 的資料契約與 Road fixture 穩定後才開始。

- 依 `docs/calibration/in-game-telemetry-collection-guide.md`、`in-game-test-schedule-and-matrix.md` 與 `human-review-and-telemetry-test-plan.md` 重新收集可比較資料。
- 每個車輛／改裝／遊戲版本／路線／環境組合保留 capture manifest；至少做單一變量、重複採樣與反向結果記錄。
- 先處理跨車可辨識的輸入與報告，再評估哪些係數可進入 calibration fixture；局部 Integra、MX-5 或社群資料不直接成為通用常數。
- 依序評估 Offroad／Rally、Drag、Drift；每個領域各自交付測試、限制與實機證據，不因 Road 通過而自動視為其他領域通過。

交付：經人工審核的 fixtures、失敗／無改善結果、校準狀態與領域分級報告。

## 4. 主要 ownership 與建議後續分支

本規畫分支只承載藍圖；後續實作採短生命週期分支，避免同時修改同一入口：

| 後續分支 | Ownership | 主要輸出 |
|---|---|---|
| `codex/feat/tuning-verification-base` | 測試環境與 production fixture | 依賴、測試分層、真實 app fixture |
| `codex/feat/tuning-telemetry-recording` | telemetry contract、recorder、SQLite、capture round-trip | 時間、單位、缺值與保存契約 |
| `codex/feat/tuning-workflow-foundation` | workflow schema、store、migration／回讀 | M1 工作流狀態與 immutable records |
| `codex/feat/tuning-measurement` | `features/tuning` 量測／確認流程 | M2 UI 閉環 |
| `codex/feat/tuning-math-contract` | `tuningMath`、units、diagnosis 與純函數測試 | M3 數學契約與 priors 邊界 |
| `codex/feat/tuning-solver-bridge` | solver bundle、CLI／MCP transport | 同源 parity 與 build contract |
| `codex/feat/road-tuning-workflow` | Road service、router、analysis、前端與專屬測試 | M4 第一條完整領域流程 |

`backend/main.py`、`frontend/src/App.tsx`、`Navigation.tsx`、`TuningWorkspace` 與共用 matching／storage 若被多個分支需要，應由單一 integration owner 集中接線；其他分支只提供可獨立驗證的模組與測試。

## 5. 驗收 gates

### G0：可重現基準

- 工作樹、分支與參考包完整性已記錄。
- 依賴、Node／Python／Rust 工具版本與測試入口可重現。
- 已區分 simulator、局部 router、production app、真實 FH6 與 release 證據。

### G1：契約與純函數

- schema validation、unknown／缺值、單位與 immutable snapshot 測試通過。
- `tuningMath.test.ts`、相關 domain tests、backend contract tests 通過。
- 不存在未標示來源的重複物理公式。

### G2：產品工作流

- 真實 app fixture 能完成 M1–M4 的狀態轉移與保存／重載。
- API、frontend hook、storage 的欄位與錯誤狀態一致。
- A/B 報告保留全部資料，且只改一個主要變量。

### G3：實機證據

- capture 含車輛、改裝、遊戲版本、路線、環境、輔助與設定快照。
- 有可比較的重複採樣及未改善／反向結果記錄。
- 只有通過人工審核的資料才可產生 fixture；其餘維持 `unverified` 或 `in-calibration`。

### G4：發行前邊界

- solver bundle、sidecar、installer 與乾淨 Windows runtime 另外驗收。
- 未完成跨車實機或 release 驗收前，不更新「已完成」「通用最佳」或「實機驗證」字樣。

## 6. 本輪明確不做

- 不直接把 `ref` 參考包整批覆蓋現行工作區。
- 不在 Python backend、React UI、CLI／MCP 各自重寫物理公式。
- 不把歷史 Integra／MX-5 結果、社群 meta、試算表或幾何齒比結果當成通用 FH6 真理。
- 不在 Road gate 前同時完成 Offroad、Drag、Drift，也不移除舊 DragTest 入口。
- 不以 synthetic telemetry、simulator、FFmpeg／局部 API 或單機測試代替真實 FH6 與完整產品驗收。
- 不在本規畫分支直接承諾 release、PR 或版本升級；完成實作後另依當時驗證結果決定。

## 7. 第一個執行批次

下一個工作批次建議只做以下範圍：

1. 執行參考包完整性檢查並保存結果。
2. 完成現行工作區與參考包的 M0 差異表，確認真正需要回收的檔案與未解 ownership。
3. 建立 M1 最小 `TuningWorkflow` contract 與 round-trip tests，不接四領域 UI。
4. 建立一個 production app fixture，證明它不是 simulator-only 流程。
5. 完成後再決定是否開 `tuning-telemetry-recording` 或 `tuning-workflow-foundation` 實作分支。

第一批的完成條件是「契約與驗收邊界可重現」，不是「所有調校公式已完成」。
