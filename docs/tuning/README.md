# 調校開發入口

v1.7.1：正式調校公式、資格審查與數值診斷之唯一 owner 已全面收攏至 Rust (`backend-rust/src/tuning/`)，最新入口與架構劃分見[責任契約](../contracts/tuning_responsibilities.md)；前端 TypeScript 舊模型凍結並僅作為測試參考，不得用作 production runtime fallback。

本頁是程式導航與驗證順序，不是功能完成清單。修改前需確認實際呼叫路徑與對應測試。

## 現行模型與調校參考

- **中性基準預覽與就地證據**：[Issue #487 P1 契約](neutral-baseline-preview-p1.md)，記錄草稿／明確套用、未知來源與單位界線。
- **AEGO Road v3 起步與運動學診斷**：[AEGO Road Launch v3 報告與邊界分析](aego-road-launch-v3.md)，說明有效紅線修正、Rspeed 先驗與多檔扭力分配。
- **AEGO 低功率與斷油特徵閉環**：[AEGO 低功率修正紀錄](aego-low-power-20260927.md)，記錄低打滑起步瞬態過濾、斷油自動辨識與 2026-09-28 六項實車驗收基準。
- **EV 獨立模型基礎**：[EV 獨立量測與齒比基礎模型](../calibration/ev-foundation.md)，記錄 `ev-measurement/v1` 專屬流程與單速/多速齒比契約。

## 先確認影響哪一條路徑

| 範圍 | 程式入口 | 閱讀重點 |
| --- | --- | --- |
| 正式調校核心 (Rust SSOT) | [backend-rust/src/tuning/](../../backend-rust/src/tuning/) | 物理懸吊、彈簧、ARB、阻尼、AEGO 齒比求解器與資格判定 |
| 前端調校介面 | [TuningView.tsx](../../frontend/src/features/tuning/TuningView.tsx) | 既有使用者流程、草稿管理與 Rust API 渲染對接 |
| 開發者調校介面 | [TuningView_dev.tsx](../../frontend/src/features/tuning/TuningView_dev.tsx)、[domain/tuning](../../frontend/src/domain/tuning/) | 開發者輔助流程；計算結果以 Rust 調校端點為唯一準據 |
| CLI 工具 | [agent_cli.rs](../../backend-rust/src/agent_cli.rs)、[legacy_cli.rs](../../backend-rust/src/tuning/legacy_cli.rs) | `solve workflow --args-file` 使用正式 Rust workflow；`solve chassis/gearing/full` 保留 legacy-cli/v1 數值 |
| MCP 求解器 | [tools.rs](../../backend-rust/src/mcp/tools.rs)、[service.rs](../../backend-rust/src/mcp/service.rs) | `calculate_tuning_workflow` 使用正式 owner；quick solver 維持獨立 legacy-mcp/v1 |
| 遙測採樣 | [TuningTelemetryCaptureView.tsx](../../frontend/src/features/tuning/components/TuningTelemetryCaptureView.tsx)、[telemetryCapture.ts](../../frontend/src/domain/tuning/telemetryCapture.ts) | 錄製介面、資料契約與匯出內容 |

桌面、Companion、workflow CLI／MCP 共用正式 owner；實驗模式與 legacy 指令維持自己的版本契約。產品純型別位於 `frontend/src/domain/tuning/types.ts`，凍結模型與測試位於 `frontend/test-reference/tuning/`。本次收尾的驗收範圍見 [v1.7.1 候選驗收](../releases/v1.7.1-acceptance.md)。

## 驗證與接續順序

1. 限定一個問題及受影響的介面／計算模組，先檢查同目錄的測試與呼叫端。
2. 依 [專案技能索引](../../.agents/skills/README.md) 選取相關技能；公式變更須遵循物理規範，資料或介面變更須交代單位與契約。
3. 依 [人工審核與實機測試計畫](../calibration/human-review-and-telemetry-test-plan.md) 定義驗收條件，再用 [採樣 SOP](../calibration/in-game-telemetry-collection-guide.md) 及 [測試矩陣](../calibration/in-game-test-schedule-and-matrix.md) 收集資料。
4. 分開記錄單元測試結果、實機採樣結果與未驗證假設。實驗先驗、模擬資料與單一車輛觀測不能直接升格為通用校準常數。
5. 保存資料來源、車輛／改裝與測試情境；缺少資訊時標明未知，不用歷史報告補成已知。

工具使用另見 [CLI 指南](../guides/agent-cli-guide.md) 與 [MCP 指南](../guides/mcp-setup-guide.md)；校準資料的位置與置信度規則見 [calibration](../calibration/README.md)。

## 歷史研究與已結束階段封存

早期工作流規畫、六階段演進、賽事 meta 研究與交接文件已封存至 [歷史索引](../archive/README.md)：

- [調校工作流下一迭代落地規畫](../archive/tuning/tuning-workflow-iteration-20260912.md) 與 [六階段調校工作流現行實作](../archive/tuning/tuning-workflow-implementation-20260912.md)（PR #330 前身）
- [社群需求、痛點與 meta 偏好](../archive/tuning/community-tuning-needs-20260912.md) 與 [專業工程與教程順序證據](../archive/tuning/workflow-order-evidence-20260912.md)
- 2026-09-13 賽事研究：[Road](../archive/tuning/road-meta-iteration-20260913.md)、[Rally](../archive/tuning/rally-meta-iteration-20260913.md)、[Drift](../archive/tuning/drift-meta-iteration-20260913.md)、[Drag](../archive/tuning/drag-meta-iteration-20260913.md) 與 [輪胎量測評估](../archive/tuning/tire-measurement-assessment-20260913.md)
