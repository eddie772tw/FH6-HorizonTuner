# 歷史文件索引

本區保存已結束階段或具時效性的計畫、研究、交接與調查。原撰寫日期、方案、測試紀錄及未完成項目保留，不把歷史敘述改成目前進度。開始新工作請回到 [文件索引](../README.md)。

## 內容分類

| 主題 | 文件 | 查閱用途 |
| --- | --- | --- |
| 調校 | [開發者調校交接](tuning/tuning-dev-handoff.md) | 早期分流實驗與當時的後續工作 |
| 調校 | [實作路線圖](tuning/tuning-math-implementation-roadmap.md) | 各 Phase 的原始目標與驗證邊界 |
| 調校 | [外部證據報告](tuning/tuning-math-external-evidence-report.md) | 公式及社群來源的研究脈絡 |
| 調校 | [FH6 meta 評估](tuning/tuning-math-fh6-meta-evaluation-report.md) | 實驗先驗、適用性與未驗證假設 |
| 調校 | [MCP 整合評估](tuning/tuning-mcp-integration-evaluation.md) | 當時的工具需求與整合方案 |
| 調校 | [工作流下一迭代規畫](tuning/tuning-workflow-iteration-20260912.md) | 2026-09-12 四/六階段調校工作流藍圖 |
| 調校 | [六階段工作流現行實作](tuning/tuning-workflow-implementation-20260912.md) | PR #330 整合前的實作邊界與演進背景 |
| 調校 | [社群需求與痛點](tuning/community-tuning-needs-20260912.md) | 早期社群反饋與痛點調查 |
| 調校 | [專業工程順序證據](tuning/workflow-order-evidence-20260912.md) | 專業教程與真車調校程序對比 |
| 調校 | [賽事 Meta 迭代研究](tuning/road-meta-iteration-20260913.md) | 2026-09-13 Road, Rally, Drift, Drag 及輪胎量測評估 |
| HUD | [TelemetryView v1.5 路線圖](hud/telemetryview-v1.5-roadmap.md) | 歷史版本的架構規劃 |
| HUD | [Drift HUD 實作計畫](hud/telemetry-hud-implementation-plan.md) | PR 階段的範圍與驗收切片 |
| HUD | [副儀表重映射實作](hud/drift-secondary-advanced-remap-implementation.md) | Drift 儀表映射與實作紀錄 |
| HUD | [副儀表需求迭代](hud/drift-secondary-instrument-user-needs-iteration-report.md) | 使用需求與視覺方案比較 |
| HUD | [高幀率卡頓調查](hud/high-fps-hud-stutter-investigation.md) | 當時的症狀、推論及改善目標，不是效能保證 |
| HUD | [5 款 HUD 視覺合規報告](hud/hud-5-styles-visual-compliance-report.md) | PR #319 五款新儀表視覺審查報告 |
| HUD | [5 款 HUD 視覺迭代量測](hud/hud-5-styles-visual-iteration-20260910.md) | 45 組定位量測與狀態驗證 |
| HUD | [5 款 HUD 視覺複審與修正方案](hud/hud-5-styles-visual-review-20260910.md) | 定位證據與重排方案 |
| 前端 | [前端 IA 重構與交接全案](frontend/ia-refactor-20260913/README.md) | W1~W4 重構計畫、各階段驗收帳本與交付紀錄（PR #407/#408 已合併） |
| 後端 | [Rust 後端遷移協作](backend-rust/coordination.md) | `codex/rust-backend` 遷移分支的子代理邊界與協作規劃 |
| 後端 | [Rust 後端模組交接](backend-rust/handoffs/mcp.md) | MCP, Native, Road, Telemetry 早期模組交接文件 |
| 發行 | [OTA 研究報告](releases/OTA_RESEARCH_REPORT.md) | 早期更新機制的方案比較，不是目前打包契約 |

歷史文件中的分支、PR、commit、測試數量與「下一步」僅是當時記錄，不要求重新切回那些工作環境。引用其結論時應保留日期，並以目前程式與重新執行的驗證確認適用性。

## 舊路徑對照

以下舊路徑僅供搜尋歷史 Journal 或外部連結時定位。新文件連結請使用右欄；不新增相同內容的舊路徑副本。

| 舊路徑 | 新位置 |
| --- | --- |
| `docs/agent-cli-guide.md` | [`docs/guides/agent-cli-guide.md`](../guides/agent-cli-guide.md) |
| `docs/mcp-setup-guide.md` | [`docs/guides/mcp-setup-guide.md`](../guides/mcp-setup-guide.md) |
| `docs/portable-custom-hud.md` | [`docs/guides/portable-custom-hud.md`](../guides/portable-custom-hud.md) |
| `docs/fh6-ui-safe-zones.md` | [`docs/hud/fh6-ui-safe-zones.md`](../hud/fh6-ui-safe-zones.md) |
| `docs/s650-media-properties-contract.md` | [`docs/hud/s650-media-properties-contract.md`](../hud/s650-media-properties-contract.md) |
| `docs/tuning-math-human-review-and-telemetry-test-plan.md` | [`docs/calibration/human-review-and-telemetry-test-plan.md`](../calibration/human-review-and-telemetry-test-plan.md) |
| `docs/tuning-dev-handoff.md` | [`docs/archive/tuning/tuning-dev-handoff.md`](tuning/tuning-dev-handoff.md) |
| `docs/tuning-math-implementation-roadmap.md` | [`docs/archive/tuning/tuning-math-implementation-roadmap.md`](tuning/tuning-math-implementation-roadmap.md) |
| `docs/tuning-math-external-evidence-report.md` | [`docs/archive/tuning/tuning-math-external-evidence-report.md`](tuning/tuning-math-external-evidence-report.md) |
| `docs/tuning-math-fh6-meta-evaluation-report.md` | [`docs/archive/tuning/tuning-math-fh6-meta-evaluation-report.md`](tuning/tuning-math-fh6-meta-evaluation-report.md) |
| `docs/tuning-mcp-integration-evaluation.md` | [`docs/archive/tuning/tuning-mcp-integration-evaluation.md`](tuning/tuning-mcp-integration-evaluation.md) |
| `docs/telemetryview-v1.5-roadmap.md` | [`docs/archive/hud/telemetryview-v1.5-roadmap.md`](hud/telemetryview-v1.5-roadmap.md) |
| `docs/telemetry-hud-implementation-plan.md` | [`docs/archive/hud/telemetry-hud-implementation-plan.md`](hud/telemetry-hud-implementation-plan.md) |
| `docs/drift-secondary-advanced-remap-implementation.md` | [`docs/archive/hud/drift-secondary-advanced-remap-implementation.md`](hud/drift-secondary-advanced-remap-implementation.md) |
| `docs/drift-secondary-instrument-user-needs-iteration-report.md` | [`docs/archive/hud/drift-secondary-instrument-user-needs-iteration-report.md`](hud/drift-secondary-instrument-user-needs-iteration-report.md) |
| `docs/high-fps-hud-stutter-investigation.md` | [`docs/archive/hud/high-fps-hud-stutter-investigation.md`](hud/high-fps-hud-stutter-investigation.md) |
| `docs/OTA_RESEARCH_REPORT.md` | [`docs/archive/releases/OTA_RESEARCH_REPORT.md`](releases/OTA_RESEARCH_REPORT.md) |
| `docs/hud-5-styles-visual-compliance-report.md` | [`docs/archive/hud/hud-5-styles-visual-compliance-report.md`](hud/hud-5-styles-visual-compliance-report.md) |
| `docs/hud-5-styles-visual-iteration-20260910.md` | [`docs/archive/hud/hud-5-styles-visual-iteration-20260910.md`](hud/hud-5-styles-visual-iteration-20260910.md) |
| `docs/hud-5-styles-visual-review-20260910.md` | [`docs/archive/hud/hud-5-styles-visual-review-20260910.md`](hud/hud-5-styles-visual-review-20260910.md) |
| `docs/tuning/community-tuning-needs-20260912.md` | [`docs/archive/tuning/community-tuning-needs-20260912.md`](tuning/community-tuning-needs-20260912.md) |
| `docs/tuning/tuning-workflow-implementation-20260912.md` | [`docs/archive/tuning/tuning-workflow-implementation-20260912.md`](tuning/tuning-workflow-implementation-20260912.md) |
| `docs/tuning/tuning-workflow-iteration-20260912.md` | [`docs/archive/tuning/tuning-workflow-iteration-20260912.md`](tuning/tuning-workflow-iteration-20260912.md) |
| `docs/tuning/workflow-order-evidence-20260912.md` | [`docs/archive/tuning/workflow-order-evidence-20260912.md`](tuning/workflow-order-evidence-20260912.md) |
| `docs/tuning/drag-meta-iteration-20260913.md` | [`docs/archive/tuning/drag-meta-iteration-20260913.md`](tuning/drag-meta-iteration-20260913.md) |
| `docs/tuning/drift-meta-iteration-20260913.md` | [`docs/archive/tuning/drift-meta-iteration-20260913.md`](tuning/drift-meta-iteration-20260913.md) |
| `docs/tuning/rally-meta-iteration-20260913.md` | [`docs/archive/tuning/rally-meta-iteration-20260913.md`](tuning/rally-meta-iteration-20260913.md) |
| `docs/tuning/road-meta-iteration-20260913.md` | [`docs/archive/tuning/road-meta-iteration-20260913.md`](tuning/road-meta-iteration-20260913.md) |
| `docs/tuning/tire-measurement-assessment-20260913.md` | [`docs/archive/tuning/tire-measurement-assessment-20260913.md`](tuning/tire-measurement-assessment-20260913.md) |
| `docs/frontend/ia-refactor-20260913/` | [`docs/archive/frontend/ia-refactor-20260913/`](frontend/ia-refactor-20260913/README.md) |
| `docs/backend-rust/coordination.md` | [`docs/archive/backend-rust/coordination.md`](backend-rust/coordination.md) |
| `docs/backend-rust/handoffs/` | [`docs/archive/backend-rust/handoffs/`](backend-rust/handoffs/mcp.md) |
