# 調校開發入口

本頁是程式導航與驗證順序，不是功能完成清單。以下結構於 2026-09-12 依工作區程式核對；修改前仍需確認實際呼叫路徑與對應測試。

本次下一迭代的落地藍圖見[調校工作流下一迭代落地規畫](tuning-workflow-iteration-20260912.md)。它以 `ref/fh6-tuning-restart-20260912` 為參考輸入，規畫先固定契約與一條 Road 端到端流程；不代表參考包內容已全部移植或驗收。

## 先確認影響哪一條路徑

| 範圍 | 程式入口 | 閱讀重點 |
| --- | --- | --- |
| 模式選擇 | [App.tsx](../../frontend/src/App.tsx) | `developer_tuning_enabled` 選擇一般或開發者調校介面 |
| 一般調校 | [TuningView.tsx](../../frontend/src/features/tuning/TuningView.tsx)、[tuningMath.ts](../../frontend/src/utils/tuningMath.ts) | 既有使用者流程與純函數 |
| 開發者調校 | [TuningView_dev.tsx](../../frontend/src/features/tuning/TuningView_dev.tsx)、[tuningMath_dev.ts](../../frontend/src/utils/tuningMath_dev.ts)、[domain/tuning](../../frontend/src/domain/tuning/) | 開發者計算入口及其領域模組；不可直接視為一般模式的替代品 |
| CLI | [agent_cli.py](../../backend/agent_cli.py) | Python 內另有計算實作；與前端結果是否一致需獨立驗證 |
| MCP | [tools.py](../../backend/mcp/tools.py)、[service.py](../../backend/mcp/service.py) | 工具介面與 Python service 計算，不能僅因名稱相同就假定共用 TypeScript solver |
| 遙測採樣 | [TuningTelemetryCaptureView.tsx](../../frontend/src/features/tuning/components/TuningTelemetryCaptureView.tsx)、[telemetryCapture.ts](../../frontend/src/domain/tuning/telemetryCapture.ts) | 錄製介面、資料契約與匯出內容 |

此表描述現況，不是授權新增平行計算實作。既有實作與治理中的單一來源目標仍須分開看待；未經比對，不宣稱一般模式、開發者模式、CLI 與 MCP 已有數值一致性保證。

## 驗證與接續順序

1. 限定一個問題及受影響的介面／計算模組，先檢查同目錄的測試與呼叫端。
2. 依 [專案技能索引](../../.agents/skills/README.md) 選取相關技能；公式變更須遵循物理規範，資料或介面變更須交代單位與契約。
3. 依 [人工審核與實機測試計畫](../calibration/human-review-and-telemetry-test-plan.md) 定義驗收條件，再用 [採樣 SOP](../calibration/in-game-telemetry-collection-guide.md) 及 [測試矩陣](../calibration/in-game-test-schedule-and-matrix.md) 收集資料。
4. 分開記錄單元測試結果、實機採樣結果與未驗證假設。實驗先驗、模擬資料與單一車輛觀測不能直接升格為通用校準常數。
5. 保存資料來源、車輛／改裝與測試情境；缺少資訊時標明未知，不用歷史報告補成已知。

工具使用另見 [CLI 指南](../guides/agent-cli-guide.md) 與 [MCP 指南](../guides/mcp-setup-guide.md)；校準資料的位置與置信度規則見 [calibration](../calibration/README.md)。

舊交接、Phase 路線圖、外部證據與 MCP 評估集中在 [歷史索引](../archive/README.md)。它們用於理解過去的選擇，不提供目前進度或新工作的自動授權。
