# 調校實作與實測證據索引

本分支 `codex/chassis-sevenlap` 整理從量測導向 AEGO 工作流到七圈底盤驗證的累積成果。目標是用遊戲可查資料與遙測產生可驗證的初始設定，確認調整方向與近似可用性；沒有完成通用最佳解，也沒有把 MX-5 的候選參數寫成產品常數。

## 已實作功能

|範圍|目前行為|主要入口|
|---|---|---|
|六階段工作流|目標與資料 → 輪胎基準 → 底盤平台 → 定位 → 動力／傳動 → 實際驗證；機械頁不需引擎量測，按資料開放直接跳轉。輪胎名義半徑作上游結果傳入 AEGO。|`tuningWorkflow.ts`、`calculateWorkflowTuning`；[工程依據與依賴圖](tuning-workflow-dependencies-20260910.md)|
|車輛資料與單位|檔案維持 kg、hp、lb-ft；頁面輸入與顯示依有效單位轉換，進 solver 時才將扭力轉成 N·m。保留前／後空力可調能力及舊檔相容行為。|`CarParamsContext.tsx`、`profileUnitConversions.ts`、`aeroAdjustability.ts`|
|量測導向工作流|接收未插值的解碼 WebSocket 封包，按身分、時間進展、油門與换檔穩定條件收集引擎輸出；支援追加收集，完成後凍結摘要供算牌。|`useTelemetry.ts`、`tuningMeasurement.ts`、`TuningMeasurementStep.tsx`、`TuningView.tsx`|
|AEGO|自動模式不沿用進階目標；事件目標獨立提供速度／RPM 幾何擬合與 matched/limited/invalid 狀態，保留 legacy 模式。修正捨入後檔位間距，避免以峰值功率 RPM 強制破壞最高檔解。|`tuningMath.ts`、`GearingTargetInputs.tsx`、`GearingTuner.tsx`|
|一般底盤公式|移除下壓力彈簧補償，以及一般 AEGO 中 aeroEfficiency 的速度倍率。既有 Road 滑桿範圍／配重先驗仍保留；新自然頻率與分驅動阻尼材料目前屬研究候選。|`tuningMath.ts`、`Step3ChassisTuner.tsx`|
|實際設定與校準|可填底盤與全套齒比，确认後只接受同車的新駕駛資料；編輯、套用建議或重置撤銷確認。表格不會操作遊戲。|`AppliedSetupTable.tsx`、`AppliedGearingTable.tsx`、`calibrationReadiness.ts`、`Step5TelemetryCalibration.tsx`|
|遙測診斷|ANG／RAT保持正規化係數；四輪資料不完整不當作零滑移。單筆滑移、行程或低轉訊號改為情境觀察，不直接發出高信心彈簧／ARB／終傳修正。|`telemetrySlipMetrics.ts`、`tuningDiagnosis.ts`|
|桌面與後端|主視窗預設1600×900並依螢幕工作區縮放定位；音訊裝置列舉移出事件迴圈，以單一在途工作、快取、逾時及失敗退避回應 API。|`frontend/src-tauri/src/main_window.rs`、`backend/main.py`|
|七圈分析工具|保留所有圈、捕捉缺口、延遲末圈回報及逐輪時間加權描述，產出原始SHA與結構化報告，不補造缺圈或自動宣稱設定因果。|`scripts/analyze_chassis_race.py`、`scripts/tests/test_analyze_chassis_race.py`|

前端入口位於 `frontend/src/`；表內簡寫按模組搜尋。未新增第三方相依套件，未更動 UDP 封包 offset。一般公式排除空力輸入不代表遊戲沒有空力，也不代表實驗 domain solver 已同步改寫。

## 實測研究與採納邊界

|研究|已觀察結果|證據入口|
|---|---|---|
|Integra FWD 七圈／彈簧探索|固定條件下較軟前彈簧有局部優勢；不能由行程映射直接推導最佳圈速。八場 A/E/G/H 區塊已完成，阻尼平方根縮放沒有一致額外收益。|[七圈迭代](chassis-seven-lap-iteration-20260910.md)、[八場區塊](chassis-spring-damping-block-20260910.md)、[簡約模型分析](chassis-formula-parsimony-20260910.md)|
|泛用模型|自然頻率、簧上質量與明確定義的 MR 提供彈簧初值；驅動形式比例與阻尼滑桿值是待驗證先驗，不能把滑桿14直接視為固定阻尼比。|[泛用模型](chassis-general-model-20260910.md)、[社群範圍縮減](chassis-community-formula-screening-20260910.md)|
|MX-5 RF RWD|A6/S1/SD1/A7主窗口均值60.184427/60.101051/60.109450/60.190122秒。S與SD方向正向，候選間無決定性差異；同圈序觀測不是獨立實驗。|[頻率與阻尼驗證](mx5-frequency-damping-validation-20260910.md)、[局部模型可辨識性](mx5-rwd-identifiability-20260910.md)|
|MX-5 定位後重測|新A/S/SD主窗口60.184334/60.096376/60.106614秒。未支持原定位使先前結論失真的明顯證據；S符合最小變動的優先基準，SD近伸展代理改善但圈速標準差未改善。|[定位重測](mx5-alignment-retest-20260910.md)|

主窗口為第2～7圈，另外保留3～6及2～6敏感度、靜止起跑第一圈和遊戲獨立末圈回報。歷史初期以3～6為主要窗口的文件保留原設計，不能追溯宣稱一開始就採同一窗口。定位重測固定A→S→SD各一場且沒有末端A，新S/SD前彈簧570.1而舊場570.0 lb/in，跨區塊差不得全歸因定位。

胎溫只有每輪單值，沒有胎面內中外溫差或磨耗；SurfaceRumble、行程與滑移不是直接輪荷或接地旗標。ANNA输入可描述控制需求，不直接代表內部信心。FWD與AWD尚未完成最新整套頻率／阻尼候選的跨車驗證；Dark Horse的靜態讀回不代替有效實測。

## 本次提交前驗證

後續產品化方案見[調校工作流與賽後分析回饋提案](tuning-post-race-feedback-proposal.md)：盤點本次全部主要方法、现有錄製與單位缺口、版本化資料契約、P0～P3交付及驗收。此為設計提案，尚未實作。

使用者回饋後新增[流程簡化與遙測輔助可行性](tuning-workflow-simplification-proposal-20260910.md)，範圍限定 Road。後續依啟用的實作目標完成按需輸入、無季節補正的初值、不可變 A/B 與記錄、離線報告及比較助手；操作與本地／合成遙測證據見 [Road 實作紀錄](road-workflow-implementation-20260910.md)。取消季節輸入不代表已量測胎壓；沒有新增真實遊戲實測或把描述性比較升格為因果證明。

本地使用 `D:/FH6-HorizonTuner/.venv/Scripts/python.exe`，下列 Python 命令均透過 `uv run --no-project --python <該路徑>`。

|檢查|結果|
|---|---|
|`python -m pytest tests/ scripts/tests/ -q`|300 passed，9 deselected；包含分析器6項測試|
|`cmd /c "pnpm -C frontend run test"`|96 files，673 passed|
|`cmd /c "pnpm -C frontend run build"`|TypeScript／Vite通過|
|`ruff check .`、`ruff format --check .`|通過，192 files already formatted|
|`cargo check --manifest-path frontend/src-tauri/Cargo.toml`|通過；不是release打包驗收|
|`python scripts/validate_version_consistency.py`|11.45.17一致|

`host_diagnostics` 依既有預設排除；這些測試不代表音訊驅動、跨裝置、release打包或所有UI路徑實機驗收。量測快照尚未跨重啟保存，同PI零件更換需主動重新收集；幾何目標符合不代表可達極速或賽道表現保證。

## 資料保存與重現

PR提交程式、測試、研究方法、報告及日誌。完整JSONL、收據、探索腳本、圖形與執行log保留在本地ignored `scratch/`，沒有隨Git推送；檔名與SHA見各場報告。Git checkout本身不足以重算所有實測結論，須另外取得對應原始素材及探索腳本；不以合成資料冒充真實capture。

一般分析器用法見 `uv run --no-project --python <python.exe> python scripts/analyze_chassis_race.py --help`；其輸入必須是對應的已解碼capture，搭配核對過的官方時間、車輛與圈數。日期文件及Journal中的「尚未提交／下一場」均為當時快照，以本索引與最新專題報告辨識後續進度。

本次整理沒有增加遊戲實測。遊戲停於MX-5賽前，保存SD與公式定位；擷取器及本任務backend停止。分支送交PR審查，不包含合併或發行。
