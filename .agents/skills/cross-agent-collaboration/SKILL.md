---
name: cross-agent-collaboration
description: 當 Codex、Google Antigravity 或 Jules 需要在同一 repository 進行非同步協作、交接任務、共享分支或避免同檔案衝突時使用。規範 ownership、handoff、狀態、驗證、Journal 與 Git 同步流程。
---

# 跨 Agent 非同步協作

## 核心原則

- 保留 Google-style 入口：`.agents/AGENTS.md` 是共同規則，`.agents/skills/` 是任務技能，`.agents/Journal.md` 是已驗證知識，`.jules/` 是 Jules 原始英文工作日誌。
- 一次只允許一個 Agent 對同一組檔案持有寫入 ownership；其他 Agent 只能讀取、提出建議或處理不重疊範圍。
- 不把未驗證的 Jules/Antigravity 建議直接升級為專案規則；先在本地重現並記錄 evidence。
- 所有交接都必須留下可被另一個 Agent 讀取的文字狀態，不依賴聊天上下文。

## 任務狀態

- `proposed`：只有範圍與目標，尚未開始修改。
- `active`：目前由一個 Agent 持有 ownership。
- `blocked`：有明確阻塞原因，需要外部權限、使用者決策或另一個 Agent 的產出。
- `handoff`：目前 Agent 已停止修改，等待另一個 Agent 接手。
- `done`：實作、驗證與文件同步都完成。

## 開始任務

1. 讀取 `.agents/AGENTS.md`、`.agents/rules/workspace.md`、`.agents/Journal.md`、`.agents/skills/README.md`。
2. 讀取符合任務觸發條件的 `SKILL.md`；若涉及 Jules，另外讀取 `.agents/skills/jules_coding/SKILL.md`。
3. 檢查 `git status --short --branch`、目前 branch、最近 commit 與既有 handoff 狀態。
4. 宣告任務 scope、ownership、預計修改檔案與排除範圍。
5. 若有其他 Agent 正在修改相同檔案，先停止寫入並建立 handoff/協調紀錄。

## Handoff 格式

交接內容應包含：

```text
Task: <任務名稱>
Status: active | blocked | handoff | done
Owner: <Agent / 人類>
Branch: <branch>
Scope: <本次負責範圍>
Changed: <已修改檔案>
Pending: <尚未完成項目>
Blocked by: <阻塞原因或 None>
Verification: <已執行命令與結果>
Next action: <下一個 Agent 應做的第一件事>
Last updated: <YYYY-MM-DD>
```

避免使用「已處理」「應該沒問題」等不可驗證描述；改用檔案、commit、測試結果與明確下一步。

## Codex ↔ Antigravity/Jules 協作規則

- Codex 與 Antigravity 若共用 `main`，不得同時直接修改同一檔案；優先使用短生命週期 branch，再由明確 owner 合併。
- Jules 的 PR、plan 或 artifact 必須先由本地 Agent 檢視 diff、測試結果與安全影響，再決定是否採用。
- Jules 原始英文日誌保留在 `.jules/*.md`；已驗證的中文摘要才同步到 `.agents/Journal.md`。
- 任何 Agent 都不得覆寫另一個 Agent 尚未提交的工作樹變更；若發現 dirty worktree，先記錄並協調，不使用 destructive Git 命令清理。
- 版本、API contract、UDP offset、物理公式與 release metadata 的變更必須在 handoff 中明確列出。

## 完成與交接前檢查

- 執行與 scope 相符的測試；至少記錄通過、失敗或未執行的原因。
- 執行 `git diff --check`，確認沒有 whitespace 或合併殘留。
- 更新 `.agents/Journal.md` 的已驗證學習，或明確記錄為不值得升級的暫時資訊。
- 若修改技能、AGENTS 或日誌治理，確認 `.agents/skills/README.md` 仍能找到正確 skill ID 與路徑。
- 交接時停止對該 scope 的進一步寫入，並留下上述 handoff 格式的狀態。
