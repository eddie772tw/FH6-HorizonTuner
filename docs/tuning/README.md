# 調校開發入口

本頁是程式導航與驗證順序，不是功能完成清單。以下結構於 2026-09-12 依工作區程式核對；修改前仍需確認實際呼叫路徑與對應測試。

本次下一迭代的落地藍圖見[調校工作流下一迭代落地規畫](tuning-workflow-iteration-20260912.md)；目前工作區的實作與證據邊界見[六階段調校工作流現行實作](tuning-workflow-implementation-20260912.md)。藍圖以 `ref/fh6-tuning-restart-20260912` 為參考輸入，不代表參考包內容已全部移植或驗收。

現行工作流是六階段 `Goal & Setup → Tire baseline → Chassis platform → Wheel alignment → Engine data & gearing → Setup verification`。引擎資料來自遊戲解碼 frame 的 `EngineMaxRpm`、功率與扭力；至少 6 秒、8/16 RPM bins、低端不高於 40%、高端至少 90%、全油門與控制輸入門檻只是觀察完整性 gate，不是實體校準。Road session 以 `LapNumber` 與 `TimestampMS` 保存全部圈，0.1 秒 downsample、最多 50,000 點；引擎 capture 最多 30,000 frame。需要 offset、單位或欄位狀態時，參考 [324-byte packet reference](../../.agents/skills/telemetry-udp-protocol/references/packet_format_reference.md)。

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

### 2026-09-12 外部證據與操作體驗

- [社群需求、痛點與 meta 偏好](community-tuning-needs-20260912.md)：FH6 與 FH5 來源分開，記錄來源可用性與反例。
- [專業工程與教程順序證據](workflow-order-evidence-20260912.md)：維持主順序，補上初始基準與回訪語意；真車程序不直接變成 FH6 強制輸入。
