# 六階段調校工作流現行實作

文件日期：2026-09-12
適用分支：`codex/plan/tuning-workflow-iteration-20260912`
狀態：實作與本機／loopback 驗證說明；不代表已完成 FH6 實機或跨裝置驗收。

本文件描述目前工作區已落地的六階段入口、實測引擎資料、遙測保存與 Road 驗證閉環。公式、資料來源、保存紀錄與「已知／未知」狀態分開記錄，避免把資料完整性門檻寫成物理校準證據。

## 六個使用者階段

`frontend/src/features/tuning/tuningWorkflow.ts` 固定入口順序；`canOpenTuningStep` 依資料準備度限制進入，而不是依使用者是否點過頁面。

| 階段 | 目前入口 | 進入條件與結果 |
| --- | --- | --- |
| 1. Goal & Setup | `TuningView.tsx` 的工作流設定 | 選擇 Road／Rally／Drag／Drift、車輛與目標；建立輸入快照。 |
| 2. Tire baseline | 胎壓與輪胎基線組件 | 需要有效車輛機械資料；顯示既有胎壓推估，實際冷／熱胎壓仍須在遊戲確認。 |
| 3. Chassis platform | 底盤調校組件 | 沿用現有純函數結果；此階段沒有把單車觀察升格為通用常數。 |
| 4. Wheel alignment | 定位組件 | 需要機械資料；輸出值保留單位與來源。 |
| 5. Engine data & gearing | `EngineDataStep.tsx`／`TuningMeasurementStep.tsx` | 可在機械資料就緒後進入；齒比計算另需有效遊戲顯示功率與完成的實測引擎觀察。 |
| 6. Setup verification | `SetupVerificationStep.tsx` 與 Road workflow | 需要完整機械資料、遊戲回報功率及可重用的 measured engine observation；Road 可建立 baseline、run、描述性報告、單一變量 A/B 與決策。 |

舊五階段狀態以明確 schema 映射回讀；新編號不依賴舊數字猜測。工作流狀態為 `prepared`、`baseline-recorded`、`run-recorded`、`reported`、`ab-compared`、`decided`。每次建議、capture、套用確認、分析與決策都以 immutable snapshot 或 parent reference 保存。

Rally、Drag、Drift 在本輪只保留既有 `tuningMath` 輸出與相容性快照；它們沒有因為共用六階段入口而取得 Road 的原生驗證證據。Road 的 `tuningMath/measured-workflow-v1` 只是輸入／輸出傳輸版本，並沒有新增一套物理 solver。

## 實測引擎資料與完整性門檻

`frontend/src/features/tuning/tuningMeasurement.ts` 從解碼後 WebSocket frame 讀取 `EngineMaxRpm`、`PowerWatts`、`TorqueNewtons`、`CurrentEngineRpm` 及控制輸入。可接受的觀察必須同時符合：

- 累積至少 6,000 ms 的可接受取樣間隔；timestamp 必須前進，間隔大於 1,000 ms 的區段不計入累積時間。
- RPM 覆蓋 `EngineMaxRpm` 的低端不高於 40%，高端至少 90%。以 16 個等比例 RPM bins 分組，至少有 8 個非空 bins。
- 全油門 `AccelInput >= 250`（0–255），煞車、離合器、手煞車均為 0；檔位為前進檔 1–10。
- 換檔後等待 500 ms；車輛識別（`CarOrdinal`、`CarClass`、`CarPerformanceIndex`）或引擎上限改變時，觀察會失效並要求重新收集。

通過門檻後，`observedPeakPower` 與 `observedPeakTorque` 的 RPM 直接來自 WOT bins 的最大觀測值，`EngineMaxRpm` 直接來自遊戲 frame。輪胎 slip 只作診斷上下文，不能使引擎輸出觀察被拒絕，也不能由此推導道路抓地力、齒比性能或通用峰值曲線。這些是資料完整性與可重現性 gates，不是實體校準、最佳化或 FH6 物理真值的證明。

引擎 capture 使用既有 `tuning-capture/v1`：前端保留原始解碼 frame，單次最多 30,000 筆；完成後建立 `engine-observation/v1`，並以車輛與引擎輸入的 `dependencyKey` 限制可重用觀察。後端 `/api/road/engine-observations` 驗證 observation／capture 的 ID 與 dependencyKey 關聯、車輛與紅線、摘要 bins／peak 的完整性，並以 capture timestamp 限制可宣稱的採樣時間後，以 immutable document 保存。後端不獨立重算 WOT bins，以上是保存契約檢查。SQLite 是後端權威；localStorage (`tuning-engine-observations/v1`) 只是可重用清單的本機快取。舊 preset 可以繼續讀取與檢視，不能被缺少實測資料的推測悄悄改寫。

## 遙測來源、單位與保存

資料流分成四層：

1. FH6 Data Out 以固定 324-byte little-endian UDP 封包送到 `127.0.0.1:8000`（官方說明也指出可依遊戲 frame rate 發送到 localhost）。`backend/telemetry_listener.py` 負責長度、有限值與範圍檢查；HTTP/WebSocket backend 預設為 `127.0.0.1:8001`。
2. parser 輸出命名欄位；`backend/telemetry_contract.py` 將 scalar、四輪向量與 0–255 控制值整理成明確 decoded contract。未提供的欄位保持 `null`，不以數值大小猜單位。
3. `/ws/telemetry` 與前端 capture 只保存收到的解碼 frame；raw WebSocket capture 不做插值。`tuning-capture/v1` 的 metadata、`unknown` 欄位、來源 schema 與 samples 一起保存。
4. Road run 使用同一組 decoded points 經 `RaceRecorder` 保存，再由 `road_analysis.py` 產生描述性 summary；分析資料與原始點、session metadata、workflow/run/setup parent references 分開保存。

主要欄位的單位與語意如下；完整 offset 狀態見 [UDP packet format reference](../../.agents/skills/telemetry-udp-protocol/references/packet_format_reference.md)。

| canonical 欄位 | 單位／語意 | 來源與用途 |
| --- | --- | --- |
| `EngineMaxRpm`, `CurrentEngineRpm` | RPM | 遊戲 324-byte packet；引擎量測與 HUD。 |
| `PowerWatts`, `TorqueNewtons` | W、N·m | 遊戲 packet；WOT bins 與 capture。 |
| `AccelerationX/Y/Z` | m/s² | 遊戲局部座標；分析時可轉 G。 |
| `SpeedMetersPerSecond`, `PositionX/Y/Z`, `DistanceTraveled` | m/s、m、m | 解碼後保留 domain 單位；UI 才轉 km/h。 |
| `TireSlipRatio`, `TireSlipAngle`, `TireCombinedSlip` | normalized、無量綱；絕對值大於 1 代表失去抓地的官方語意 | 不是百分比，也不是度或弧度；目前報告使用 normalized ratio／angle 名稱。 |
| `TireTemp` | 沿用現有應用的 °F 解碼慣例 | Road 分析明確轉為 °C；沒有 IM／OM 或輪胎內部溫度，也不由遙測推論胎壓。 |
| `CurrentLap`, `LastLap`, `CurrentRaceTime` | 秒 | `CurrentLap` 是目前圈經過時間，`LastLap` 是遊戲回報上圈時間，`CurrentRaceTime` 是賽事時鐘。 |
| `LapNumber` | u16，已完成圈數 | 圈的識別欄位；不能用 `CurrentLap` 的秒數取整取代。 |
| `AccelInput` 等控制值 | 原生 0–255；contract 同時提供百分比 alias | WOT gate 與控制輸入 context。 |

資料保存的 storage schema 為 `decoded-fh6/v1`。Road／race session 以 SQLite `sessions`、`telemetry_channels`、`laps` 表保存，所有新列另存 `raw_json`，保留解碼欄位與缺值；舊列標為 `legacy-sqlite/unknown`，不藉 migration 補造不存在的觀測。SQLite 寫入由非同步 persistence worker 批次處理，不能阻塞 60 Hz UDP 接收。

## 多圈 race recorder 修正與時間證據

舊版以 `int(CurrentLap elapsed seconds)` 當圈識別，並用 `current_lap > 0` 判定可錄製；因此每圈前一秒被視為停止錄製，造成跨圈時錯誤 finalize。現行 `RaceRecorder` 使用遊戲的 `LapNumber`，並以 `TimestampMS` 做單調排序與 downsample：

- 一般 race session 每 0.1 秒最多取一點，最多保存 50,000 點；圈號改變或 `LastLap` 更新時，即使尚未到 downsample 間隔也保留 boundary point。資料直接來自 frame，不插值。
- identity 變更、timestamp regression、同時出現 lap 與 race-time regression，或停止／無遙測達 3 秒時才切 session。race clock 單獨倒退不切 session，因為 FH6 圈切換可能先更新時鐘再更新 `LapNumber`。
- 只有觀察到該圈的起點（`CurrentLap` 接近 0）並收到可歸屬的 `LastLap` 更新，才會給完整圈時間。未觀察到起點、`LastLap` 未變、或只有停車後的延遲 metadata 時，圈仍保留但時間為 `unavailable`；不把 `LastLap` 複製到下一圈。
- 所有圈、暖胎、緩衝與不完整資料都保留。缺乏證據時不自動合併歷史 split sessions；Data Out 沒有 event ID 所造成的歧義維持明示狀態。

Road 的 summary 會分別輸出 observed span、game-lastlap 時間、速度、輪胎溫度與 normalized slip。這些是描述性觀察與可比性篩選，並非因果效果、最佳胎溫或跨車通用校準。

## Road 驗證閉環與資料來源

Road workflow 透過 `backend/road_service.py`、`road_store.py` 與 `frontend/src/features/road/` 保存：建立 workflow identity／event／configuration，建立 A baseline，開始 manual run，保存 summary，建立只改一個遊戲 step 的 B candidate，完成多次獨立 race 後產生 descriptive comparison，再選擇 keep baseline、keep candidate 或 retest baseline。每次 run 必須有新鮮且 identity 相符的 telemetry，且需明確確認已套用表列值；建立單變量候選時，再要求該參數的遊戲 value、unit、range、step。

比較會檢查 route、駕駛條件、溫度起點、錄製完整性、timestamp gap、finish time 與 source schema；報告可以是 `insufficient-data` 或 `tradeoff`。重複圈不是獨立 race，較快時間與較差 normalized slip 會同時顯示。Rally／Drag／Drift 僅保存 compatibility snapshot，尚未因 Road report 而取得相同證據等級。

## 外部證據帶來的操作調整

社群與專業工程研究分別保存在[需求與偏好筆記](community-tuning-needs-20260912.md)與[順序證據](workflow-order-evidence-20260912.md)。本輪保留六階段順序，採用以下小幅變更：

- `WorkflowGuide.tsx` 依缺少的資料提供直接前往第 1／5／6 階段的捷徑，並可展開查看初始基準、底盤後再檢查定位、改輪胎尺寸後重算齒比等回訪說明。
- Road 單變量候選提供入彎推頭、彎中推頭、出彎車尾滑出、煞車不穩等筆記範本，保留使用者編輯權；症狀不會自動選擇參數或調整方向。候選清單由已保存的車輛可調控制項建立，含定位及齒比的正確單位；不展示已知不可調的前／後軸項目。
- 引擎量測自動保存／重用、遊戲步進檢查、來源與單位標籤、描述性比較與回復草稿延續本輪資料契約。

真車工作胎壓／setup-pad 姿態不新增為 FH6 強制輸入；引擎掃描不因僅修改輪胎尺寸而被刪除。社群的易駕駛／競技、方向盤／控制器、少量微調／深入調校偏好只記錄為後續研究方向。已退休論壇的搜尋快取證據有明示，不能當作目前可重開的官方頁面。

## 驗證狀態與限制

整合驗證如下（2026-09-12）：

- `cmd /c "pnpm -C frontend run test"`：94 files／621 tests passed。
- `uv run --no-project --python .venv\Scripts\python.exe python -m pytest tests/ -q`：315 passed，8 項 host／executable 驗收依專案預設排除。
- `cmd /c "pnpm -C frontend run build"`：TypeScript 與 Vite production build 通過。
- `ruff check .`、`ruff format --check .`：通過；`git diff --check` 亦通過。
- 瀏覽器使用隔離 SQLite 與 synthetic WebSocket：量測達標與保存、既有量測明確確認後重用、基準建立、錄製／停止、跨圈保留、重新開頁讀取報告均通過。測試未寫入實際使用者資料，也未綁定遊戲 UDP 8000。Default／Modern／Elegant 的深色與淺色樣式均已檢查；測試分頁與自有服務已關閉。
- reference manifest：1,259 entries checked，0 mismatch；只選擇性適配必要模組，沒有引用 reference 的另一套 neutral physics。

上述包含本機、synthetic 或 loopback evidence；本輪尚未用真實 FH6 遊戲重跑驗收，也未產生新的 release artifact；不宣稱實機圈速或跨車性能改善。官方封包語意以 [Forza Horizon 6 Data Out Documentation](https://support.forza.net/hc/en-us/articles/51744149102611-Forza-Horizon-6-Data-Out-Documentation) 為準，任何未被 parser 或 fixture 驗證的欄位都維持 unsupported／unknown。

## 本輪完整變更索引

共 81 個新增或修改檔案，工作樹未提交。起點 `b73732c`；未修改版本或新增第三方相依。

<details>
<summary>展開檔案清單</summary>

- [.agents/Journal.md](../../.agents/Journal.md)
- [.agents/skills/telemetry-udp-protocol/references/packet_format_reference.md](../../.agents/skills/telemetry-udp-protocol/references/packet_format_reference.md)
- [README.en.md](../../README.en.md)
- [README.md](../../README.md)
- [backend/main.py](../../backend/main.py)
- [backend/motec_exporter.py](../../backend/motec_exporter.py)
- [backend/race_recorder.py](../../backend/race_recorder.py)
- [backend/road_analysis.py](../../backend/road_analysis.py)
- [backend/road_comparison.py](../../backend/road_comparison.py)
- [backend/road_matching.py](../../backend/road_matching.py)
- [backend/road_models.py](../../backend/road_models.py)
- [backend/road_router.py](../../backend/road_router.py)
- [backend/road_service.py](../../backend/road_service.py)
- [backend/road_store.py](../../backend/road_store.py)
- [backend/telemetry_contract.py](../../backend/telemetry_contract.py)
- [backend/telemetry_listener.py](../../backend/telemetry_listener.py)
- [backend/telemetry_sqlite.py](../../backend/telemetry_sqlite.py)
- [backend/tuning_capture.py](../../backend/tuning_capture.py)
- [docs/tuning/README.md](../../docs/tuning/README.md)
- [docs/tuning/community-tuning-needs-20260912.md](../../docs/tuning/community-tuning-needs-20260912.md)
- [docs/tuning/tuning-workflow-implementation-20260912.md](../../docs/tuning/tuning-workflow-implementation-20260912.md)
- [docs/tuning/tuning-workflow-iteration-20260912.md](../../docs/tuning/tuning-workflow-iteration-20260912.md)
- [docs/tuning/workflow-order-evidence-20260912.md](../../docs/tuning/workflow-order-evidence-20260912.md)
- [frontend/src/App.tsx](../../frontend/src/App.tsx)
- [frontend/src/components/Navigation.tsx](../../frontend/src/components/Navigation.tsx)
- [frontend/src/context/CarParamsContext.tsx](../../frontend/src/context/CarParamsContext.tsx)
- [frontend/src/context/TelemetryRecorderContext.tsx](../../frontend/src/context/TelemetryRecorderContext.tsx)
- [frontend/src/domain/tuning/telemetryCapture.test.ts](../../frontend/src/domain/tuning/telemetryCapture.test.ts)
- [frontend/src/domain/tuning/telemetryCapture.ts](../../frontend/src/domain/tuning/telemetryCapture.ts)
- [frontend/src/features/analysis/AnalysisView.tsx](../../frontend/src/features/analysis/AnalysisView.tsx)
- [frontend/src/features/analysis/LapDeltaCanvas.tsx](../../frontend/src/features/analysis/LapDeltaCanvas.tsx)
- [frontend/src/features/analysis/SessionHealthDebrief.tsx](../../frontend/src/features/analysis/SessionHealthDebrief.tsx)
- [frontend/src/features/analysis/sessionDebriefMath.test.ts](../../frontend/src/features/analysis/sessionDebriefMath.test.ts)
- [frontend/src/features/analysis/sessionDebriefMath.ts](../../frontend/src/features/analysis/sessionDebriefMath.ts)
- [frontend/src/features/road/RoadCandidate.tsx](../../frontend/src/features/road/RoadCandidate.tsx)
- [frontend/src/features/road/RoadCompare.tsx](../../frontend/src/features/road/RoadCompare.tsx)
- [frontend/src/features/road/RoadLocalDetails.tsx](../../frontend/src/features/road/RoadLocalDetails.tsx)
- [frontend/src/features/road/RoadObservation.tsx](../../frontend/src/features/road/RoadObservation.tsx)
- [frontend/src/features/road/RoadPrepare.tsx](../../frontend/src/features/road/RoadPrepare.tsx)
- [frontend/src/features/road/RoadReportCard.tsx](../../frontend/src/features/road/RoadReportCard.tsx)
- [frontend/src/features/road/RoadResults.tsx](../../frontend/src/features/road/RoadResults.tsx)
- [frontend/src/features/road/RoadRunPanel.tsx](../../frontend/src/features/road/RoadRunPanel.tsx)
- [frontend/src/features/road/RoadWorkflowView.tsx](../../frontend/src/features/road/RoadWorkflowView.tsx)
- [frontend/src/features/road/roadPresentation.test.ts](../../frontend/src/features/road/roadPresentation.test.ts)
- [frontend/src/features/road/roadPresentation.ts](../../frontend/src/features/road/roadPresentation.ts)
- [frontend/src/features/road/roadTypes.ts](../../frontend/src/features/road/roadTypes.ts)
- [frontend/src/features/road/useRoadWorkflow.ts](../../frontend/src/features/road/useRoadWorkflow.ts)
- [frontend/src/features/tuning/TuningView.tsx](../../frontend/src/features/tuning/TuningView.tsx)
- [frontend/src/features/tuning/captureDownload.ts](../../frontend/src/features/tuning/captureDownload.ts)
- [frontend/src/features/tuning/components/EngineDataStep.tsx](../../frontend/src/features/tuning/components/EngineDataStep.tsx)
- [frontend/src/features/tuning/components/EngineObservationHistory.tsx](../../frontend/src/features/tuning/components/EngineObservationHistory.tsx)
- [frontend/src/features/tuning/components/GearingTuner.tsx](../../frontend/src/features/tuning/components/GearingTuner.tsx)
- [frontend/src/features/tuning/components/LegacyTuningHistory.tsx](../../frontend/src/features/tuning/components/LegacyTuningHistory.tsx)
- [frontend/src/features/tuning/components/SetupVerificationStep.tsx](../../frontend/src/features/tuning/components/SetupVerificationStep.tsx)
- [frontend/src/features/tuning/components/Step1GoalSetup.tsx](../../frontend/src/features/tuning/components/Step1GoalSetup.tsx)
- [frontend/src/features/tuning/components/TireBaselineStep.tsx](../../frontend/src/features/tuning/components/TireBaselineStep.tsx)
- [frontend/src/features/tuning/components/TuningMeasurementStep.tsx](../../frontend/src/features/tuning/components/TuningMeasurementStep.tsx)
- [frontend/src/features/tuning/components/TuningTelemetryCaptureView.tsx](../../frontend/src/features/tuning/components/TuningTelemetryCaptureView.tsx)
- [frontend/src/features/tuning/components/WheelAlignmentStep.tsx](../../frontend/src/features/tuning/components/WheelAlignmentStep.tsx)
- [frontend/src/features/tuning/components/WorkflowGuide.tsx](../../frontend/src/features/tuning/components/WorkflowGuide.tsx)
- [frontend/src/features/tuning/engineMeasurementArchive.test.ts](../../frontend/src/features/tuning/engineMeasurementArchive.test.ts)
- [frontend/src/features/tuning/engineMeasurementArchive.ts](../../frontend/src/features/tuning/engineMeasurementArchive.ts)
- [frontend/src/features/tuning/tuningMeasurement.test.ts](../../frontend/src/features/tuning/tuningMeasurement.test.ts)
- [frontend/src/features/tuning/tuningMeasurement.ts](../../frontend/src/features/tuning/tuningMeasurement.ts)
- [frontend/src/features/tuning/tuningWorkflow.test.ts](../../frontend/src/features/tuning/tuningWorkflow.test.ts)
- [frontend/src/features/tuning/tuningWorkflow.ts](../../frontend/src/features/tuning/tuningWorkflow.ts)
- [frontend/src/features/tuning/useEngineMeasurementArchive.ts](../../frontend/src/features/tuning/useEngineMeasurementArchive.ts)
- [frontend/src/features/tuning/workflowSnapshot.test.ts](../../frontend/src/features/tuning/workflowSnapshot.test.ts)
- [frontend/src/features/tuning/workflowSnapshot.ts](../../frontend/src/features/tuning/workflowSnapshot.ts)
- [frontend/src/hooks/useTelemetry.ts](../../frontend/src/hooks/useTelemetry.ts)
- [frontend/src/utils/tuningMath.ts](../../frontend/src/utils/tuningMath.ts)
- [lang/zh-tw.json](../../lang/zh-tw.json)
- [tests/fixtures/road_observation_contract.json](../../tests/fixtures/road_observation_contract.json)
- [tests/test_analysis_sqlite.py](../../tests/test_analysis_sqlite.py)
- [tests/test_motec_exporter.py](../../tests/test_motec_exporter.py)
- [tests/test_race_recorder.py](../../tests/test_race_recorder.py)
- [tests/test_road_workflow.py](../../tests/test_road_workflow.py)
- [tests/test_telemetry_contract.py](../../tests/test_telemetry_contract.py)
- [tests/test_telemetry_replay_contract.py](../../tests/test_telemetry_replay_contract.py)
- [tests/test_workflow_api.py](../../tests/test_workflow_api.py)
- [tests/test_workflow_recorder.py](../../tests/test_workflow_recorder.py)

</details>
