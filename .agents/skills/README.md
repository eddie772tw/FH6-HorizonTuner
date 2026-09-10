# FH6-HorizonTuner Agent Skills 索引

本文件是專案內建技能的唯一索引。除非表格另有說明，技能資料夾名稱就是 canonical skill ID。不要從舊日誌、顯示名稱或過時路徑推測技能名稱。

## 技能發現 Gate

執行任務前，遵循按需載入原則：

1. 檢查本索引確認 canonical skill ID（資料夾名稱即 canonical ID）。
2. 依照下方的觸發條件比對目前任務，僅載入匹配之技能。
3. 完整讀取被選取的 `SKILL.md`，再開始修改程式碼或執行任務專用命令。
4. 只有在選取的技能明確指示時，才按需讀取其特定 references。
5. 如果技能資料夾名稱與 frontmatter 的 `name` 不一致，以資料夾名稱為 canonical ID，先修正不一致再使用該技能。

## Canonical 技能清單

| Canonical ID | 檔案 | 觸發條件 | 必要的搭配資料 |
|---|---|---|---|
| `halfmoon-design-system` | `halfmoon-design-system/SKILL.md` | 前端 UI、Halfmoon、card、form、button、theme 或 glassmorphism | 修改設計行為時讀取 `HALFMOON_SPECIFICATION.md` |
| `huge-component-refactoring` | `huge-component-refactoring/SKILL.md` | 拆分超過 250 行的前端 UI 組件、解耦 React DOM 樹或優化 60Hz 渲染路徑 | 為抽出的行為保留測試 |
| `cross-agent-collaboration` | `cross-agent-collaboration/SKILL.md` | Codex、Antigravity 或 Jules 的非同步跨代理協作、ownership、handoff 與 Git 衝突避免 | `.agents/AGENTS.md`、`.agents/Journal.md` 與 `.jules/` 原始日誌 |
| `codex-antigravity-bridge` | `codex-antigravity-bridge/SKILL.md` | Codex 透過 `agy` CLI 執行 Headless 叫用、固定 token 握手、回覆輪詢與共享 worktree 驗證 | `scripts/Invoke-AgyCrossAgentSmoke.ps1`、`scripts/Set-AgyBridgeSettings.ps1`、`references/` |
| `jules_coding` | `jules_coding/SKILL.md` | 手動 Jules Session 委派，以及遠端排程 Jules Session／PR 的來源判斷與收件驗收 | `JULES_API_KEY`、已綁定 Jules 的 GitHub repository、`references/` 與可用整合 |
| `modular-refactoring` | `modular-refactoring/SKILL.md` | Python/TS 底層架構模組化、Domain 邏輯抽離、新功能模組或跨前後端型別契約 | Isolation tests 與 typed contracts |
| `physics-tuning-math` | `physics-tuning-math/SKILL.md` | 車輛物理、調校公式、校準常數或診斷數學 | 對應的 Vitest/Pytest 覆蓋 |
| `telemetry-udp-protocol` | `telemetry-udp-protocol/SKILL.md` | Forza UDP 封包解析、324-byte layout、單位換算或高頻遙測 | 涉及 offset 時讀取 `telemetry-udp-protocol/references/packet_format_reference.md` |
| `agent-governance-audit` | `agent-governance-audit/SKILL.md` | 稽核與修復 .agents、Journal、Jules 原始日誌、skill ID 及跨代理治理規則漂移 | 調整治理文件或發現 skill/path/language 錯誤時使用 |
| `portable-release-validation` | `portable-release-validation/SKILL.md` | V1.x portable/exe、sidecar、動態 port 與 Windows 發行驗證 | 發行、打包、啟動流程或 runtime path 變更時使用 |
| `pr-review-evaluation` | `pr-review-evaluation/SKILL.md` | 作為審查者 (Reviewer) 評估 PR 狀態、CI 結果並標準化發表 Review 意見 (含原生 Inline Comments 與 Suggestions) | `pr-review-evaluation/references/github_inline_comments_guide.md` 與自動化提交腳本 |
| `pr-author-maintainer` | `pr-author-maintainer/SKILL.md` | 作為 PR 作者/維護者 (Author/Maintainer) 撰寫 PR、持續同步 PR Body、落實 Commit 前測試、維護標題穩定性與身分標記回覆 | `pr-author-maintainer/references/pr_templates_and_replies.md` 與管理腳本 |
| `github-security-audit` | `github-security-audit/SKILL.md` | 收集、審查或修復 GitHub Code Scanning/CodeQL、Dependabot、Secret Scanning 弱點與安全通報 | `github-security-audit/references/vulnerability_remediation_patterns.md` 與自動化收集腳本 |

## Jules 邊界

`jules_coding` 同時涵蓋手動 Session 委派與排程產出收件，但兩者來源與權限必須分開記錄。不能只因為任務很大就呼叫 Jules；手動流程必須先確認使用者授權、API key、repository binding 與可呼叫整合。排程流程只能讀取 Session／PR 並進行 provenance 分類與本地驗收。沒有正式 schedule endpoint 或 connector 時，`schedule_read`／`schedule_manage` 均視為 unavailable，不得假造 endpoint、API response、PR、排程狀態或控制結果。

## Google Antigravity/Jules 相容性

本索引是補充入口，不取代既有的 `.agents/AGENTS.md`、`.agents/rules/`、`.agents/Journal.md` 或 `.jules/` 工作紀錄結構。依循 Google Antigravity/Jules 的既有目錄慣例時，仍以各目錄內的 `AGENTS.md`、`SKILL.md` 與 Journal 規則為準。

## 命名規則

計畫、Journal 與任務摘要必須使用以下精確 ID：

- 使用 `huge-component-refactoring`，不要使用 `huge-component-refactoring-expert`。
- 使用 `modular-refactoring`，不要使用 `modular-refactoring-expert`。
- 專案內建 Jules 流程使用 `jules_coding`。

## 語言規則

Agent 文件、技能說明、工作日誌與規範內容以繁體中文為主。只有技能 ID、檔名、API、CI、React、TypeScript 等技術專有名詞，以及可能造成歧義的術語保留英文。

## Skill 選擇補充

- 前端 UI 組件拆分 (>250行)、解耦 React DOM 或 60Hz Canvas 渲染路徑使用 `huge-component-refactoring`。
- 非 UI 的 Python/TS 底層架構模組化、Domain 邏輯抽離與跨前後端型別契約使用 `modular-refactoring`；兩者同時適用時先讀前者。
- 稽核與修復 `.agents`、`.jules`、Journal 或 skill 索引時使用 `agent-governance-audit`。
- 發行 portable/exe、sidecar 或動態 HTTP port 時使用 `portable-release-validation`。
- 作為 Reviewer 審查他人 PR 狀態、CI 與提出 Review / Inline Comments 時使用 `pr-review-evaluation`。
- 作為 Author 撰寫 PR、持續同步 PR Body、Pre-Commit 測試、標題穩定性與回覆 Reviewer 時使用 `pr-author-maintainer`。
- 手動 Jules 委派與排程 Jules 產出收件均使用 `jules_coding`；排程來源先依 Session 開頭 prompt、persona signature、task/PR 證據分類，不得把推論當成正式 schedule flag。
- 所有 PR 審查與作者留言均須標註 `{代號} as {Agent}` 身分標記以利共用 GitHub 帳號時之識別。
- 收集、審查或修復 GitHub 自主檢測的安全警報與弱點時使用 `github-security-audit`。
