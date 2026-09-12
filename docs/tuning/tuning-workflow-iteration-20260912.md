# FH6 調校工作流下一迭代落地規畫

## 文件狀態

- 規畫分支：`codex/plan/tuning-workflow-iteration-20260912`
- 基準：`main` @ `c473099`
- 規畫日期：2026-09-12
- 本文件用途：把 `ref/fh6-tuning-restart-20260912` 的可回收內容轉成現行工作區可執行的分階段計畫。
- 第一階段邊界：以最小六階段可驗證工作流取代目前五階段工作流；Road 原生接入，Rally／Drag／Drift 只做最小相容性調整。
- 目前狀態：六階段工作流、實測引擎輸入、Road 記錄與多圈修正已在本分支實作；詳細範圍與本機驗證見[實作紀錄](tuning-workflow-implementation-20260912.md)。參考包僅選擇性適配，實機驗收仍待真實 FH6 資料。

## 1. 迭代目標

第一階段先把調校產品由目前五階段流程收斂為六階段可驗證工作流；六個使用者可見階段沿用參考包已核對的順序：

```text
1 Goal & Setup → 2 Tire baseline → 3 Chassis platform →
4 Wheel alignment → 5 Engine data & gearing → 6 Setup verification
```

第 6 階段承載可追溯、可回復的最小驗證閉環：

```text
準備 → 建立基準 → 行駛／錄製 → 描述性報告 → 單一變量 A/B → 保留或回復
```

這一輪的產品結果應能回答：

1. 使用者使用了哪一台車、哪些改裝、哪個遊戲版本、哪個路面與駕駛情境。
2. 建議值來自哪個輸入快照與哪一套純函數；哪些值是 `unknown` 或未驗證先驗。
3. 哪些資料是原始 capture、哪些是分析結果、哪些是使用者確認已套用的設定。
4. A/B 只改一個明確變量時，結果是否改善、無變化或反向；如何保留原始結果並回復設定。

第一階段不追求通用最佳調校器，也不以單一車輛、單一最快圈或幾何匹配結果宣稱跨車性能保證。Road 會先擁有完整的原生工作流行為；其他三種賽事只需要能在共用六階段契約下正常進入、顯示既有結果、保存相容資料並通過回歸測試，不在本階段大幅改動公式。

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
- 六階段導航與 readiness：`source/frontend/src/features/tuning/tuningWorkflow.ts`；其階段定義是本階段 UI／狀態遷移的參考，不代表整包檔案可直接覆蓋。
- 第一條原生領域流程：`source/backend/road_*.py`、`source/frontend/src/features/road/` 及 `tests/test_road_workflow.py`。
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

### M1：第一階段 — 六階段工作流最小基礎

先固定六階段順序與可進入條件，再接 Road 行為；不先做完整四賽事架構。

- 將目前五階段入口映射成六階段，不破壞既有設定資料：目前 Goal／Setup 保留為第 1 階段；現有輪胎／定位拆為第 2、4 階段；底盤保留為第 3 階段；現有變速箱移到第 5 階段並與引擎資料並列；現有 telemetry calibration 收斂為第 6 階段 Setup verification。
- 回收 `TUNING_WORKFLOW_STEPS`、readiness、step guard 與 resolver 的純函數概念，先以現行資料模型提供最小狀態機，不一次移植所有領域畫面。
- 保留既有 `tuning-capture/v1`、`tuning-calibration/v1` 與 capability contract；新增的工作流紀錄必須引用它們，不重複定義車輛／單位欄位。
- 定義最小工作流狀態：`prepared`、`baseline-recorded`、`run-recorded`、`reported`、`ab-compared`、`decided`；第 6 階段可在資料不足時呈現 blocked／需要補測，而不是假裝完成。
- 每次建議、套用確認、capture、分析與 A/B 決策都保存 immutable snapshot 或明確的 parent reference。
- 缺少遊戲版本、改裝、路線、環境或輸入時使用 `unknown`／不適用狀態，不以歷史報告補值。
- 將「建議值」「使用者確認已套用」「實際 capture 觀察」分成三種語意，避免 `AppliedSetupTable` 被誤當成遊戲狀態。

交付：六階段 TypeScript contract、step guard／resolver 測試、五階段舊狀態的回讀／降級策略，以及最小 production app fixture。

### M2：第一階段 — Road 原生最小工作流

Road 是第一個真正實作六階段行為的賽事類型；先完成可驗證閉環，再擴展其他賽事。

- 以 `source/frontend/src/features/road/`、`source/backend/road_*.py` 與 Road 專屬測試為 selective recovery 候選，逐段對照現行 FastAPI／frontend 入口。
- Road 的最小流程必須能完成：建立設定／基準、記錄一次 run、產生描述性報告、建立單一變量 A/B、保留或回復；不要求本階段完成所有局部路段模型。
- 優先沿用現行 `TuningTelemetryCaptureView`、`tuning-capture/v1`、`race_recorder.py`／`telemetry_sqlite.py`；只有遇到 contract 缺口才補最小 adapter，不另建第二種 capture 格式。
- 使用者未確認已套用的設定不可進入「實際結果」欄位；背景 profile 變更應使相關驗證狀態失效並要求重新確認。
- Road 分析結果保持描述性；時間、滑移、懸吊、輪胎與控制輸入要分別呈現，不合成未驗證的總分或因果結論。

交付：Road 原生六階段 UI／service／storage 最小閉環、保存／重載 fixture、單一變量 A/B 測試與失敗原因保存。

### M3：第一階段 — 其他賽事最小相容性

Rally／Drag／Drift 在第一階段只接六階段契約與共用入口，不進行公式重寫或領域流程大改。

- 讓三種賽事能使用相同的六階段導航、資料 contract、snapshot／回讀與 readiness 顯示；如個別賽事尚無原生第 6 階段，顯示明確的 compatibility／未支援細節狀態。
- 保留現有 Rally／Drag／Drift 公開公式與輸出形狀；本階段只補 adapter、型別、入口接線與回歸測試。
- `frontend/src/utils/tuningMath.ts` 與既有 domain profile 維持公式 SSOT；不因六階段遷移而調整 ARB、彈簧、阻尼、胎壓、齒比或 Drift／Drag 特定係數。
- 未經實機資料與審查，開發者路徑 `domain/tuning/` 的自然頻率、阻尼比、輪胎與領域 profile 仍標為 calibration prior。
- 若 solver bridge 或 `softMaxSpeed` 不是六階段最小閉環的必要依賴，延後到後續階段；不得為了接線把 preview bound 升格為車輛性能限制。

交付：三種賽事的 compatibility adapter、既有公式 regression tests、六階段入口 smoke tests，以及「本階段未改公式」的 diff／測試證據。

### M4：第一階段驗收與後續切分

完成 M1–M3 後才進行本階段的產品與證據驗收；solver bridge、完整量測模型與其他賽事原生流程留待後續迭代。

- production app fixture 能完成六階段 guard、Road run 與保存／重載。
- A/B 設計只允許一個主要調整變量；保留全部 run、暖胎／起步／緩衝圈與非可比原因。
- 其他三種賽事的既有公式輸出與既有測試維持通過；若只因相容性接線而變更行為，必須有明確回歸測試與理由。
- RoadStore 與 WorkflowStore 不在本階段強行合併；先明確新六階段工作流紀錄的 owner，再補 migration／回讀測試。
- 驗收後才決定是否另開完整 telemetry／solver bridge、Offroad／Rally、Drag、Drift 原生分支。

交付：第一階段驗收報告、未完成項目清單、後續分支切分與限制說明。

### 後續階段：實機校準與其他賽事原生擴展

只有第一階段資料契約與 Road fixture 穩定後才開始；這些不是目前第一階段的必要交付。

- 依 `docs/calibration/in-game-telemetry-collection-guide.md`、`in-game-test-schedule-and-matrix.md` 與 `human-review-and-telemetry-test-plan.md` 重新收集可比較資料。
- 每個車輛／改裝／遊戲版本／路線／環境組合保留 capture manifest；至少做單一變量、重複採樣與反向結果記錄。
- 先處理跨車可辨識的輸入與報告，再評估哪些係數可進入 calibration fixture；局部 Integra、MX-5 或社群資料不直接成為通用常數。
- 依序評估 Offroad／Rally、Drag、Drift；每個領域各自交付測試、限制與實機證據，不因 Road 通過而自動視為其他領域通過。

交付：經人工審核的 fixtures、失敗／無改善結果、校準狀態與領域分級報告。

## 4. 主要 ownership 與建議後續分支

本規畫分支只承載藍圖；後續實作採短生命週期分支，避免同時修改同一入口：

| 後續分支 | Ownership | 主要輸出 |
|---|---|---|
| `codex/feat/tuning-six-stage-foundation` | 六階段 contract、step guard、舊五階段回讀 | M1 最小工作流基礎 |
| `codex/feat/road-six-stage-workflow` | Road service、router、analysis、前端與專屬測試 | M2 Road 原生最小閉環 |
| `codex/feat/tuning-compatibility-regression` | Rally／Drag／Drift adapter 與既有公式回歸 | M3 最小相容性 |
| `codex/feat/tuning-verification-base` | production fixture、測試分層與整合驗收 | M4 第一階段驗收 |
| `codex/feat/tuning-telemetry-recording` | telemetry contract、recorder、SQLite、capture round-trip | 後續量測／保存深化 |
| `codex/feat/tuning-solver-bridge` | solver bundle、CLI／MCP transport | 後續同源 parity 與 build contract |

`backend/main.py`、`frontend/src/App.tsx`、`Navigation.tsx`、`TuningWorkspace` 與共用 matching／storage 若被多個分支需要，應由單一 integration owner 集中接線；其他分支只提供可獨立驗證的模組與測試。

## 5. 驗收 gates

### G0：可重現基準

- 工作樹、分支與參考包完整性已記錄。
- 依賴、Node／Python／Rust 工具版本與測試入口可重現。
- 已區分 simulator、局部 router、production app、真實 FH6 與 release 證據。

### G1：六階段契約與純函數

- schema validation、unknown／缺值、單位與 immutable snapshot 測試通過。
- 六階段順序、readiness guard、五階段舊狀態回讀與第 6 階段 blocked／補測狀態測試通過。
- `tuningMath.test.ts`、相關 domain tests、backend contract tests 通過。
- 不存在未標示來源的重複物理公式。

### G2：Road 原生產品工作流

- 真實 app fixture 能完成六階段狀態轉移，並以 Road 完成 baseline、run、report、A/B、keep/revert 與保存／重載。
- API、frontend hook、storage 的欄位與錯誤狀態一致。
- A/B 報告保留全部資料，且只改一個主要變量。

### G3：其他賽事相容性

- Rally／Drag／Drift 可進入六階段共用入口並保存相容資料。
- 既有三種賽事的公式輸出與回歸測試維持一致；沒有未被說明的公式漂移。
- 任何新增的差異都限於 adapter／入口／契約，不以「支援六階段」暗示已完成該賽事原生工作流。

### G4：實機證據

- capture 含車輛、改裝、遊戲版本、路線、環境、輔助與設定快照。
- 有可比較的重複採樣及未改善／反向結果記錄。
- 只有通過人工審核的資料才可產生 fixture；其餘維持 `unverified` 或 `in-calibration`。

### G5：發行前邊界

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
2. 完成現行五階段與參考六階段的 M0 差異表，確認資料遷移與未解 ownership。
3. 建立六階段 `TuningWorkflow` contract、step guard、舊狀態回讀與 round-trip tests。
4. 建立 Road 原生最小閉環的 production app fixture；不接三種賽事的原生新公式。
5. 為 Rally／Drag／Drift 建立只涵蓋入口／契約／既有公式回歸的 compatibility tests。
6. 第一階段完成後，再決定是否開完整 telemetry recording、solver bridge 或其他賽事原生實作分支。

第一階段的完成條件是「六階段工作流可驗證、Road 原生閉環可用、其他三種賽事相容且公式未大幅漂移」，不是「四種賽事都完成原生工作流」或「所有調校公式已完成」。
