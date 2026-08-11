---
name: agent-governance-audit
description: 當調整 Google-style .agents、Jules 日誌、Journal 或 skill 索引，或發現 skill 名稱、路徑、語言與多代理治理規則漂移時觸發此技能。
---

# Agent 治理稽核

## 稽核範圍

保留本專案與 Google Antigravity 相容的結構：`.agents/AGENTS.md`、`.agents/rules/`、`.agents/skills/`、`.agents/Journal.md` 與 `.jules/*.md`。不要以 Codex 專用目錄取代這些 canonical path。

## 稽核流程

1. 檢查 `git status --short --branch`，不得覆蓋其他 agent 的 dirty worktree。
2. 列出所有 `.agents/skills/*/SKILL.md`，確認資料夾名稱、frontmatter `name` 與 `skills/README.md` 完全一致。
3. 搜尋大小寫衝突（例如 `.Jules`/`.jules`）、過時專案路徑、`file:///`、失效 references 與重複的規則。
4. 檢查文件語言邊界：agent 文件以中文為主；`.jules/*.md` 保留 Jules 原始英文，不翻譯。
5. 比對 `.jules`、Journal、AGENTS 與 rules：只有已在本地驗證且可重現的結論，才能從 Journal 升格為永久規則或 skill。
6. 執行相關 skill validator、`git diff --check`，並記錄發現、修正與仍待處理項目。

## 治理決策

- AGENTS 放不可違反的共通規則。
- rules 放穩定的專案架構與環境契約。
- skills 放可執行的任務工作流與觸發條件。
- Journal 放已驗證的知識與決策。
- `.jules` 只保存原始英文工作日誌。
- 交接內容使用 `cross-agent-collaboration` 的 ownership 與 handoff 格式。

## 完成條件

- 沒有 canonical skill ID 漂移、大小寫路徑衝突或 stale link。
- Journal 與 Jules 原始紀錄的責任邊界清楚。
- 所有變更通過 validator 與 `git diff --check`，且未改寫未驗證的歷史結論。
