# Road 簡化流程實作與驗證

2026-09-10；分支 `codex/chassis-sevenlap`，基底 `ffc728e`。依[Road 流程提案](tuning-workflow-simplification-proposal-20260910.md)交付第一版產品流程。此文件描述工作樹實作與本地證據，未發行、未新增真實遊戲賽事。

## 使用流程

1. 在「調校設定」預設進入 Road 比較助手，確認遙測車輛，填寫 Road 賽事名稱並選擇環道或衝刺。觀察現有設定不需馬力、扭力、輪胎配方、季節或齒比。
2. 建立 A，啟動記錄後在遊戲跑所選賽事。開始新一場必須有本車持續前進的新遙測，並重新確認遊戲設定。其餘設定、輪胎、條件與輔助是否相同另作聲明。
3. 記錄停止後自動保存；離開遊戲、返回選單或重啟後可查閱。需要比較時間時，輸入遊戲結果畫面的整場時間與完賽／干擾聲明。
4. 可直接保留 A 結束，也可只選一個可調參數。遊戲已知值、範圍與刻度會沿用；未確認的值需讀回。B 只增減一格，測試備註選填，沒有宣稱最佳方向。
5. 套用並確認 B，再跑同一事件。報告顯示改動、時間差、起始熱狀態、局部滑移、比較限制與下一步。追加場次會逐場檢查，圈數或封包數不增加獨立場數。
6. 「回復 A」建立原 A 的套用草稿。「保留 B」保存選擇並複製為下一輪新的 A；歷史 A、B、報告不被覆寫。這些操作不會寫入遊戲。

「從零建立」可依序補齊胎壓、彈簧、車高、防傾桿、阻尼、定位、差速器、齒比。每個領域只要求其公式真正消費的資料，遊戲上下限與刻度確認後才顯示合法的初始估計。每次保存仍為局部快照，未列出的項目維持未知；沒有自動升格為全車核對完成。詳細六領域頁面仍可開啟。

## 輸入與來源

- Road 輪胎配方不是必填；中性初值使用明確 `Neutral` 模式，季節偏移為 0 PSI。既有具名季節計算仍保留於詳細頁面，其他用途不因 Road 預設而改成中性。
- 舊 profile 數值顯示為沿用紀錄，需遊戲確認；遙測身分、遊戲讀回、估計與未知分開保存。相同 PI 不保證零件相同，換配置應另開工作階段並重新核對。
- 引擎掃描摘要按依賴保存。修改車重、輪胎幾何或懸吊範圍不刪除掃描；動力條件變更後需重新確認或量測。歷史摘要重用要求確認，齒比快照包含本次量測的身分、峰值、有效時間與分箱來源。
- 引擎歷史保存的是既有掃描的聚合觀測，並非全部原始 60 Hz 封包；Road 場次另保存所錄製的每個取樣。兩種資料不可互稱。

官方封包提供四輪胎溫、正規化滑移、懸吊行程、位置與控制輸入，沒有季節、配方、胎壓、車重、調校滑桿值或 TrackOrdinal。`CurrentRaceTime` 是行駛計時，不能單獨辨識 Road 賽事；事件及完賽仍需使用者確認。Boost 為 PSI，ANG 是正規化訊號，LapNumber 是已完成圈數。[FH6 Data Out 官方文件](https://support.forza.net/hc/en-us/articles/51744149102611-Forza-Horizon-6-Data-Out-Documentation)

胎溫依本專案既有原生 Fahrenheit 契約轉為 Celsius；官方文件未明列胎溫單位。沒有用大小猜測單位，也沒有由胎溫反推胎壓或輪胎材質。

## 資料與方法邊界

|領域|實作行為|限制|
|---|---|---|
|保存|SQLite 附加式快照；工作階段／A、候選／A／提案、領域輸入／草稿等關聯文件以單一交易寫入；錄製批次在背景執行|中斷只能恢復已提交資料，未寫入部分明示不足|
|取樣|遊戲時間戳、圈界與延遲 LastLap 保留；停止／斷流／切車／時間倒退／容量上限收尾|約 10 Hz 常規錄製無法保證重建短暫動態|
|缺值／單位|逐輪 null；raw 控制與百分比具名轉換；CSV 按欄名及單位解析；只修復已知舊 FH6 ANG 誤編碼|舊 SQLite／CSV 的遺失資訊不補造，也不取得與新錄製相同的比較資格|
|圈時間|LapNumber 0 顯示第 1 圈；需可歸屬 LastLap 才有完整圈時間|缺開頭、未知末圈與未變的 LastLap 不假定完整；取樣跨度不作完賽時間|
|曝光與事件|有效行駛時間加權；缺口／倒退不加曝光；連續近壓縮區段作事件|近最大壓縮不等於已證實物理觸底；滑移不直接診斷操控原因|
|起始熱狀態|第一個有效行駛影格逐輪取值，缺輪維持未知；尾段平均與全程分布保留|不平均掉起跑後候選造成的升溫，也不設定通用最佳胎溫|
|空間比較|同位置、方向、環道同圈序的一對一配對；已知高度不同時排除；另篩速度及操控|沒有交通／天候／完整改裝的自動辨識；相近操作是描述性條件，可能略去部分設定效果|
|路段解釋|沿 A 觀測路徑累積距離，最多 10 段，最小分段尺度 100 m；顯示配對數、滑移與逐輪胎溫差|距離是錄製路徑，不是官方賽道里程；局部表以報告的第一組 A/B 為參考，追加場次另列檢查|
|結論|單次及重複結果均為描述性；列時間中位差、獨立場數與限制，可保留／回復／補測|尚無跨車校準的實用差異、誤差範圍或因果信心模型；不輸出 0–100 綜合分數|

版本為 `road-workflow/v1`、`decoded-fh6/v1`、`road-observations/v1`、`road-spatial/v1`、`road-comparison/descriptive-v1`、`road-initial/neutral-v1`。報告保存引用的快照、場次、摘要與完賽紀錄 ID。

目前規則刻意公開：有效相鄰時間差不超過 0.5 秒；行駛速度大於 2 m/s；起始胎溫差以 5 °C 作可比篩選。空間距離不超過 8 m、可用高度差不超過 3 m、方向 cosine 至少 0.9、雙側路線覆蓋至少 80% 且至少 20 處；局部速度差不超過 max(2 m/s, A 速度的 8%)、油門／煞車 raw 差不超過 25、轉向 raw 差不超過 10。每場最多選 4000 個位置作離線配對。這些是第一版工程觀測門檻，需真實 Road 場次校準，並非已證實物理常數。

時間小於 0.001 秒的差異不區分方向；局部滑移變化依顯示精度避免浮點雜訊被當成代價。這些精度處理不是「玩家可感知」的效果門檻。記錄開始／結束計時與人工完賽時間的相容性也有保守門檻；官方行駛計時在實際遊戲賽前／賽後的行為仍需實機驗證。

## 本地驗證

隔離資料目錄為 `%TEMP%/fh6-road-qa-20260910`。合成資料只送至 UDP 18000，未把它當作遊戲流量送往 UDP 8000，沒有改動使用者既有調校／場次資料。

實際瀏覽器操作完成：無引擎資料建立 Road A → 合成衝刺 A 20 秒／B 19 秒 → 輸入完賽時間 → 描述性比較 −1.000 秒 → 回復 A 保留 28 PSI（B 為 28.5 PSI）→ 重啟後恢復報告 → 保留 B 產生新 A → ARB 僅填前重比例 55% 及遊戲範圍，保存局部估計。這些數值是測試輸入，不是任何真車建議。

深色／淺色 1280 px 及 Road 表單 640 px 檢查完成。窄視窗下既有全站導覽仍有擠壓，本輪沒有把桌面殼改為手機版。主題與臨時 viewport 已恢復。測試期間手動停止後端造成的 WebSocket 斷線已與功能錯誤區分。

最終本地驗證：

|命令|結果|
|---|---|
|`cmd /c "pnpm -C frontend run test"`|103 個測試檔、767 項通過|
|`uv run --no-project --python .venv\Scripts\python.exe python -m pytest tests/`|322 passed、9 deselected（依既有測試分層）|
|`cmd /c "pnpm -C frontend run build"`|TypeScript、Vite 前端與 solver bundle 通過|
|`uv run --no-project --python .venv\Scripts\python.exe ruff check .`|通過|
|`uv run --no-project --python .venv\Scripts\python.exe ruff format --check .`|225 個檔案格式通過|
|`git -c core.safecrlf=false diff --check`|通過|

核心情境涵蓋缺輪、小 raw 控制、正負 ANG、間隔／倒退／延遲圈界、範圍／刻度／單位、凍結 A、離線恢復、交易回滾、錯誤路線與高度、不同操控／起始熱狀態、追加場次及新基準。整套測試中的 sidecar 啟動案例會占用 HTTP 8001，需先停掉本地 QA 後端；最終在釋放該埠後完整通過。

舊分析 API 的全部圈數選擇改為省略 `lap` 或 `lap=-1`，`lap=0` 現在正確代表遊戲第一圈。外部腳本若過去把 `lap=0` 當全部資料，需更新此呼叫；未改封包 offset。

## 尚待真實使用驗證

沒有新增 FH6 Road 實際駕駛、跨車對照、首次準備時間、重填次數或新手無協助完成率；未聲稱節省比例或圈速改善。正式候選方向、跨場不確定度、實際遊戲計時邊界與工程篩選門檻仍需受控實測。本次交付是可操作的比較助手及證據保存，不是自動最佳調校器。

採用技能：`physics-tuning-math`、`halfmoon-design-system`、`modular-refactoring`、`huge-component-refactoring`、`telemetry-udp-protocol`。沒有新增依賴、修改封包 offset、提交、推送或發布。

## 工作樹變更清單

此清單包含本次提案、實作、測試與文件，未提交。

- [.agents/Journal.md](../.agents/Journal.md)
- [.agents/skills/telemetry-udp-protocol/references/packet_format_reference.md](../.agents/skills/telemetry-udp-protocol/references/packet_format_reference.md)
- [README.en.md](../README.en.md)
- [README.md](../README.md)
- [backend/main.py](../backend/main.py)
- [backend/mcp/service.py](../backend/mcp/service.py)
- [backend/motec_channels.py](../backend/motec_channels.py)
- [backend/motec_exporter.py](../backend/motec_exporter.py)
- [backend/race_recorder.py](../backend/race_recorder.py)
- [backend/road_analysis.py](../backend/road_analysis.py)
- [backend/road_comparison.py](../backend/road_comparison.py)
- [backend/road_matching.py](../backend/road_matching.py)
- [backend/road_models.py](../backend/road_models.py)
- [backend/road_router.py](../backend/road_router.py)
- [backend/road_service.py](../backend/road_service.py)
- [backend/road_store.py](../backend/road_store.py)
- [backend/telemetry_contract.py](../backend/telemetry_contract.py)
- [backend/telemetry_listener.py](../backend/telemetry_listener.py)
- [backend/telemetry_sqlite.py](../backend/telemetry_sqlite.py)
- [docs/road-workflow-implementation-20260910.md](../docs/road-workflow-implementation-20260910.md)
- [docs/tuning-implementation-and-evidence-20260910.md](../docs/tuning-implementation-and-evidence-20260910.md)
- [docs/tuning-post-race-feedback-proposal.md](../docs/tuning-post-race-feedback-proposal.md)
- [docs/tuning-workflow-simplification-proposal-20260910.md](../docs/tuning-workflow-simplification-proposal-20260910.md)
- [frontend/src/App.tsx](../frontend/src/App.tsx)
- [frontend/src/context/TelemetryRecorderContext.tsx](../frontend/src/context/TelemetryRecorderContext.tsx)
- [frontend/src/domain/tuning/solverService.ts](../frontend/src/domain/tuning/solverService.ts)
- [frontend/src/features/analysis/AnalysisView.tsx](../frontend/src/features/analysis/AnalysisView.tsx)
- [frontend/src/features/analysis/LapDeltaCanvas.tsx](../frontend/src/features/analysis/LapDeltaCanvas.tsx)
- [frontend/src/features/analysis/SessionHealthDebrief.tsx](../frontend/src/features/analysis/SessionHealthDebrief.tsx)
- [frontend/src/features/analysis/TrackMapCanvas.tsx](../frontend/src/features/analysis/TrackMapCanvas.tsx)
- [frontend/src/features/analysis/analysisChannels.test.ts](../frontend/src/features/analysis/analysisChannels.test.ts)
- [frontend/src/features/analysis/analysisChannels.ts](../frontend/src/features/analysis/analysisChannels.ts)
- [frontend/src/features/analysis/sessionDebriefMath.test.ts](../frontend/src/features/analysis/sessionDebriefMath.test.ts)
- [frontend/src/features/analysis/sessionDebriefMath.ts](../frontend/src/features/analysis/sessionDebriefMath.ts)
- [frontend/src/features/road/RoadBaselineBuilder.tsx](../frontend/src/features/road/RoadBaselineBuilder.tsx)
- [frontend/src/features/road/RoadCandidate.tsx](../frontend/src/features/road/RoadCandidate.tsx)
- [frontend/src/features/road/RoadCompare.tsx](../frontend/src/features/road/RoadCompare.tsx)
- [frontend/src/features/road/RoadGameRanges.tsx](../frontend/src/features/road/RoadGameRanges.tsx)
- [frontend/src/features/road/RoadLocalDetails.tsx](../frontend/src/features/road/RoadLocalDetails.tsx)
- [frontend/src/features/road/RoadObservation.tsx](../frontend/src/features/road/RoadObservation.tsx)
- [frontend/src/features/road/RoadPrepare.tsx](../frontend/src/features/road/RoadPrepare.tsx)
- [frontend/src/features/road/RoadReportCard.tsx](../frontend/src/features/road/RoadReportCard.tsx)
- [frontend/src/features/road/RoadResults.tsx](../frontend/src/features/road/RoadResults.tsx)
- [frontend/src/features/road/RoadRunPanel.tsx](../frontend/src/features/road/RoadRunPanel.tsx)
- [frontend/src/features/road/RoadWorkflowView.tsx](../frontend/src/features/road/RoadWorkflowView.tsx)
- [frontend/src/features/road/roadBaselineInputs.ts](../frontend/src/features/road/roadBaselineInputs.ts)
- [frontend/src/features/road/roadPresentation.test.ts](../frontend/src/features/road/roadPresentation.test.ts)
- [frontend/src/features/road/roadPresentation.ts](../frontend/src/features/road/roadPresentation.ts)
- [frontend/src/features/road/roadTypes.ts](../frontend/src/features/road/roadTypes.ts)
- [frontend/src/features/road/useRoadWorkflow.ts](../frontend/src/features/road/useRoadWorkflow.ts)
- [frontend/src/features/tuning/TuningView.tsx](../frontend/src/features/tuning/TuningView.tsx)
- [frontend/src/features/tuning/TuningWorkspace.tsx](../frontend/src/features/tuning/TuningWorkspace.tsx)
- [frontend/src/features/tuning/components/EngineObservationHistory.tsx](../frontend/src/features/tuning/components/EngineObservationHistory.tsx)
- [frontend/src/features/tuning/components/Step1GoalSetup.tsx](../frontend/src/features/tuning/components/Step1GoalSetup.tsx)
- [frontend/src/features/tuning/engineMeasurementArchive.test.ts](../frontend/src/features/tuning/engineMeasurementArchive.test.ts)
- [frontend/src/features/tuning/engineMeasurementArchive.ts](../frontend/src/features/tuning/engineMeasurementArchive.ts)
- [frontend/src/features/tuning/useEngineMeasurementArchive.ts](../frontend/src/features/tuning/useEngineMeasurementArchive.ts)
- [frontend/src/hooks/useTelemetry.ts](../frontend/src/hooks/useTelemetry.ts)
- [frontend/src/utils/tuningMath.test.ts](../frontend/src/utils/tuningMath.test.ts)
- [frontend/src/utils/tuningMath.ts](../frontend/src/utils/tuningMath.ts)
- [lang/zh-tw.json](../lang/zh-tw.json)
- [tests/fixtures/road_observation_contract.json](../tests/fixtures/road_observation_contract.json)
- [tests/fixtures/telemetry_replay/synthetic-v1.json](../tests/fixtures/telemetry_replay/synthetic-v1.json)
- [tests/test_mcp_service.py](../tests/test_mcp_service.py)
- [tests/test_motec_exporter.py](../tests/test_motec_exporter.py)
- [tests/test_race_recorder.py](../tests/test_race_recorder.py)
- [tests/test_road_analysis.py](../tests/test_road_analysis.py)
- [tests/test_road_workflow.py](../tests/test_road_workflow.py)
- [tests/test_telemetry_contract.py](../tests/test_telemetry_contract.py)
- [tests/test_telemetry_replay_contract.py](../tests/test_telemetry_replay_contract.py)
