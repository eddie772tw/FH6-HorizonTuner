---
name: codex-antigravity-bridge
description: 執行 Codex 透過 agy CLI 與 Antigravity 的跨代理協作與 Headless 調用。適用於需要固定 token 握手、共享 worktree 驗證或跨代理測試時。
---

# Codex ↔ Antigravity Bridge

本技能提供可重現、可審計的 Codex → Antigravity 通訊協定路由器。切勿依賴模型自由格式化輸出或模糊的對話上下文。

## 工作流程路由器 (5 步 SOP)

### Step 1. 建立 Ownership 邊界
1. 遵循 `cross-agent-collaboration` 規範，先確認目前 branch 與 `git status --short`。
2. 既有 dirty worktree 視為其他 Agent 的工作，嚴禁使用 `git reset`、`git checkout --` 或 `git clean` 等破壞性指令。
3. 明確定義 handoff 邊界，包含 Task, Status, Owner, Branch, Scope 與 Verification。

### Step 2. 環境配置與工作區邊界準備
1. 尋找 `agy` CLI 執行檔（若 `PATH` 未設定，使用 `$env:LOCALAPPDATA\agy\bin\agy.exe`）。
2. 配置沙盒授權與工作目錄綁定（詳情參閱 [references/headless_configuration.md](references/headless_configuration.md)）：
   - 快速設定本機沙盒權限：`powershell -ExecutionPolicy Bypass -File .agents/skills/codex-antigravity-bridge/scripts/Set-AgyBridgeSettings.ps1`
   - 調用時強制指定工作區：`--add-dir <workspacePath>` 且 process 工作目錄為專案根目錄。

### Step 3. 固定 Token 握手測試
在傳遞實作任務前，先執行固定 token 握手確保通訊暢通：
```powershell
# 1. 執行基礎握手測試
powershell -ExecutionPolicy Bypass -File .agents/skills/codex-antigravity-bridge/scripts/Invoke-AgyCrossAgentSmoke.ps1 -Workspace (Get-Location).Path

# 2. 執行工具讀檔權限測試 (驗證沙盒設定是否生效)
powershell -ExecutionPolicy Bypass -File .agents/skills/codex-antigravity-bridge/scripts/Invoke-AgyCrossAgentSmoke.ps1 -Workspace (Get-Location).Path -TestReadFile
```
若測試失敗，參閱 [references/smoke_troubleshooting.md](references/smoke_troubleshooting.md) 進行分類與排查。若涉及桌面 Session 續接，參閱 [references/desktop_session_resume.md](references/desktop_session_resume.md)。

### Step 4. 發送實作 Handoff
通過握手後傳送實作 prompt，prompt 必須包含：
- Branch 與 repository root
- Antigravity 的 write scope（必須在 Workspace 之內）與明確禁止修改範圍
- 保留 dirty worktree 要求與驗證命令
- 回覆格式以固定短 token（如 `AGY_HANDOFF_READY:<marker>`）開頭，避免依賴易損壞的自由 JSON。

### Step 5. 收回 Ownership 與驗證
1. 重新檢查 `git status --short` 與 `git diff --stat`，確認變更完全落在 handoff write scope 內。
2. 執行 `git diff --check`。
3. 依任務範圍執行分流測試（前端 `pnpm -C frontend run test`，後端 `pytest tests/`）。
4. 驗證通過後將狀態改為 `done`，並將可重現之重要架構結論同步至 `.agents/Journal.md`。

---

## 搭配資料 (References)
- [headless_configuration.md](references/headless_configuration.md)：沙盒權限 `settings.json` 與 `--add-dir` 工作區綁定細則。
- [smoke_troubleshooting.md](references/smoke_troubleshooting.md)：握手結果分類代碼與常見失敗排除 Runbook。
- [desktop_session_resume.md](references/desktop_session_resume.md)：桌面端 Conversation UUID 與 CLI Trajectory 分離原理及互動式 `/resume` 限制。
