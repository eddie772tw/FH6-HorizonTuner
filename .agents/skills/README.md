# FH6-HorizonTuner Agent Skills 索引

本文件是專案內建技能的唯一索引。除非表格另有說明，技能資料夾名稱就是 canonical skill ID。不要從舊日誌、顯示名稱或過時路徑推測技能名稱。

## 技能發現 Gate

執行任務前，必須依序完成：

1. 檢查 `.agents/skills/*/SKILL.md` 與本索引。
2. 依照下方的觸發條件比對目前任務。
3. 完整讀取所有被選取的 `SKILL.md`，再開始修改程式碼或執行任務專用命令。
4. 只有在選取的技能明確要求時，才讀取其 references。
5. 如果技能資料夾名稱與 frontmatter 的 `name` 不一致，以資料夾名稱為 canonical ID，先修正不一致再使用該技能。

## Canonical 技能清單

| Canonical ID | 檔案 | 觸發條件 | 必要的搭配資料 |
|---|---|---|---|
| `halfmoon-design-system` | `halfmoon-design-system/SKILL.md` | 前端 UI、Halfmoon、card、form、button、theme 或 glassmorphism | 修改設計行為時讀取 `HALFMOON_SPECIFICATION.md` |
| `huge-component-refactoring` | `huge-component-refactoring/SKILL.md` | 拆分超過 250 行的 UI 組件，或優化 60Hz rendering | 為抽出的行為保留測試 |
| `cross-agent-collaboration` | `cross-agent-collaboration/SKILL.md` | Codex、Google Antigravity 或 Jules 的非同步交接、ownership、handoff 與衝突避免 | `.agents/AGENTS.md`、`.agents/Journal.md` 與 `.jules/` 原始日誌 |
| `codex-antigravity-bridge` | `codex-antigravity-bridge/SKILL.md` | Codex 透過 `agy` CLI 與 Antigravity 進行固定 token handshake、headless prompt、回覆輪詢與共享 worktree 驗證 | `scripts/Invoke-AgyCrossAgentSmoke.ps1`、`scripts/Set-AgyBridgeSettings.ps1`、`cross-agent-collaboration` |
| `jules_coding` | `jules_coding/SKILL.md` | 使用者明確授權 Jules 執行高風險重構、大型相依套件升級或本機資源不足的工作 | `JULES_API_KEY`、已綁定 Jules 的 GitHub repository，以及可用的 Jules 整合 |
| `modular-refactoring` | `modular-refactoring/SKILL.md` | Domain 重構、新模組，或將邏輯與 UI 分離 | Isolation tests 與 typed contracts |
| `physics-tuning-math` | `physics-tuning-math/SKILL.md` | 車輛物理、調校公式、校準常數或診斷數學 | 對應的 Vitest/Pytest 覆蓋 |
| `telemetry-udp-protocol` | `telemetry-udp-protocol/SKILL.md` | Forza UDP 封包解析、324-byte layout、單位換算或高頻遙測 | 涉及 offset 時讀取 `telemetry-udp-protocol/references/packet_format_reference.md` |
| `agent-governance-audit` | `agent-governance-audit/SKILL.md` | 稽核 .agents、Journal、Jules 原始日誌、skill ID 與跨 agent 文件漂移 | 調整 agent 治理文件或發現 skill/path/language 錯誤時使用 |
| `portable-release-validation` | `portable-release-validation/SKILL.md` | V1.x portable/exe、sidecar、動態 port 與 Windows 發行驗證 | 發行、打包、啟動流程或 runtime path 變更時使用 |
| `pr-review-evaluation` | `pr-review-evaluation/SKILL.md` | 評估 PR 狀態、CI 結果並標準化發表 Review 意見 (含原生 Inline Comments) | `pr-review-evaluation/references/github_inline_comments_guide.md` 與自動化提交腳本 |
| `github-security-audit` | `github-security-audit/SKILL.md` | 收集、審查或修復 GitHub Code Scanning/CodeQL、Dependabot、Secret Scanning 弱點與安全通報 | `github-security-audit/references/github_security_api_guide.md` 與自動化收集腳本 |

## Jules 邊界

`jules_coding` 是委派流程，不是預設的實作方式。不能只因為任務很大就呼叫 Jules；必須先確認任務符合觸發條件、使用者已授權，並且 API key、repository binding 與可呼叫的整合都可用。不得假造 endpoint、API response、PR 或 Jules status。若無法使用 Jules，應在安全範圍內繼續本地處理，並記錄限制原因。

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

- 巨型 UI 元件、Canvas 或 60Hz render hot path 使用 `huge-component-refactoring`。
- Domain/API/型別邊界與底層模組使用 `modular-refactoring`；兩者同時適用時先讀前者。
- 調整 `.agents`、`.jules`、Journal 或 skill 索引時使用 `agent-governance-audit`。
- 發行 portable/exe、sidecar 或動態 HTTP port 時使用 `portable-release-validation`。
- 收集、審查或修復 GitHub 自主檢測的安全警報與弱點時使用 `github-security-audit`。
