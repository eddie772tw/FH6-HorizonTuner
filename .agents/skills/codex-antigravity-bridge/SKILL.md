---
name: codex-antigravity-bridge
description: 當 Codex 需要透過 Google Antigravity 或 `agy` CLI 進行跨 agent handoff、headless prompt、回應輪詢、共享 worktree 驗證或建立 Codex↔Antigravity 交互測試時使用。涵蓋既有 dirty worktree 保護、sandbox 權限、固定 token handshake、CLI timeout、diff review 與 handoff 紀錄。
---

# Codex ↔ Antigravity Bridge

用這個 skill 建立可重現、可審計的 Codex → Antigravity 通訊；不要把桌面點擊、模型自由格式化輸出或聊天上下文當成可靠協定。

## 1. 開始前建立 ownership 邊界

1. 先讀取 `.agents/AGENTS.md`、`.agents/rules/workspace.md`、`.agents/Journal.md`、`.agents/skills/README.md` 與 `cross-agent-collaboration/SKILL.md`。
2. 執行 `git status --short --branch`、`git branch --show-current` 與最近的 `git log`。
3. 把現有 dirty worktree 視為既有 Agent 的工作；不要 `git reset`、`git checkout --`、`git clean` 或覆寫未提交檔案。
4. 在 handoff 中明確列出：

```text
Task: <任務>
Status: proposed | active | handoff | done | blocked
Owner: Codex | Antigravity | Human
Branch: <branch>
Scope: <允許修改的路徑>
Changed: <已修改檔案>
Pending: <待完成項目>
Blocked by: <None 或明確原因>
Verification: <命令與結果>
Next action: <下一步>
Last updated: <YYYY-MM-DD>
```

同一組檔案只能有一個寫入 owner。Codex 在等待 Antigravity 時進入 `handoff`，收到結果後先 review 再重新取得 ownership。

## 2. 找到 `agy` 並保持 sandbox

Windows 上不要假設目前 PowerShell 的 `PATH` 已刷新。依序尋找：

```powershell
Get-Command agy -ErrorAction SilentlyContinue
Test-Path "$env:LOCALAPPDATA\agy\bin\agy.exe"
```

若使用 headless CLI，優先採用：

```powershell
agy --print --sandbox --print-timeout 90s -p "<prompt>"
```

只有在使用者明確授權且範圍已隔離時才調整 `~/.gemini/antigravity-cli/settings.json`。可使用：

```json
{
  "enableTerminalSandbox": true,
  "toolPermission": "proceed-in-sandbox"
}
```

不要把 `always-proceed`、`command(*)` 或 `--dangerously-skip-permissions` 當成一般修復；若 headless tool call 仍被拒絕或逾時，記錄為 permission/CLI limitation，停止擴大權限。

## 3. 使用固定 token 而非模型 JSON

Gemini 可能無法穩定遵守「精確 JSON 欄位」要求。可靠 handshake 只要求模型回傳單一固定 token：

```text
CROSS_AGENT_SMOKE_TEST marker=<marker>. Do not use tools. Reply with exactly: AGY_HANDSHAKE_OK:<marker>
```

使用本 skill 的 script：

```powershell
powershell -ExecutionPolicy Bypass -File `
  .agents/skills/codex-antigravity-bridge/scripts/Invoke-AgyCrossAgentSmoke.ps1 `
  -Workspace (Get-Location).Path
```

script 會由本地 Codex 取得 branch、`git status --short`、process exit code、timeout 與實際 token，再輸出 JSON。模型只負責 handshake；不要要求它自行格式化 branch 或 dirty-file JSON。

通訊結果至少分成：

- `passed`：固定 token 收到且 CLI 正常結束。
- `agent_response_mismatch`：CLI 有回應但 token 不符。
- `permission_denied`：stderr 顯示 command/tool permission 被拒絕。
- `timeout`：超過 bounded timeout；不要無限等待或重試造成 token 浪費。
- `auth_or_startup_failure`：CLI 啟動、登入或 workspace trust 失敗。

## 4. 發送實作 handoff

通過 handshake 後才傳送實作 prompt。prompt 必須包含：

- branch 與 repository root
- Antigravity 的 owner、允許修改路徑與排除路徑
- 保留 dirty worktree 的要求
- 不可執行的 destructive Git 命令
- 明確驗證命令
- 回覆格式以短 token／短段落為主，不依賴自由 JSON

推薦結構：

```text
Task: <task>
Owner: Antigravity
Branch: <branch>
Write scope: <paths>
Do not touch: <paths>
Constraints: preserve dirty worktree; no reset/checkout/clean
Verification: <tests>
Reply first with: AGY_HANDOFF_READY:<marker>
Then summarize changed paths, tests, failures, and next input required.
```

若要續接桌面 conversation，CLI 的 `/resume` 可從 `Antigravity` 分頁匯入；這是 clone，不是對同一個 IDE conversation 建立 live bidirectional channel。匯入後記錄新的 CLI conversation ID，後續以 `--conversation <id>` 或 `--continue` 操作。

## 5. 收回 ownership 與驗證

收到 Antigravity 完成回覆後：

1. 重新執行 `git status --short` 與 `git diff --stat`。
2. 檢查 changed paths 是否完全落在 handoff write scope。
3. 執行 `git diff --check`。
4. 依任務執行相關測試；物理／前端變更至少執行 `cmd /c "pnpm -C frontend run test"`，Python 變更使用 repository 的 `uv run ...` 標準命令。
5. 只在本地 review 通過後把狀態改為 `done`；若有未解決問題，標為 `handoff` 或 `blocked`，不要把 agent 的自我宣稱當成驗證證據。
6. 將可重現的交互結果同步至 `.agents/Journal.md`；一次性的 prompt 內容留在 task log，不升格為永久規則。

## 6. 常見失敗處理

- `agy` 找不到：使用絕對路徑，並在 handoff 記錄 CLI 版本。
- headless 顯示 command permission：先確認 `proceed-in-sandbox`；不要直接開 `command(*)`。
- headless 無輸出或逾時：停止重試，保留 timeout 證據；改用固定 token prompt 或互動匯入一次 session。
- 模型回傳不符合 JSON：不要修 prompt 直到它「看起來像 JSON」；改用固定 token，讓 Codex 本地包裝結果。
- Antigravity 修改超出 scope：停止後續寫入，保留 diff，要求明確 handoff，再由 Codex review。
- 同一檔案有兩個 owner：停止寫入並回到 `cross-agent-collaboration` 的 ownership 協調流程。

## 7. Desktop conversation resume caveat

Treat a desktop conversation UUID and a CLI trajectory UUID as different identifiers. A desktop ID can be present in `%USERPROFILE%\\.gemini\\antigravity-cli\\cache\\last_conversations.json` and have a transcript under `%USERPROFILE%\\.gemini\\antigravity\\brain\\<id>`, yet `agy --conversation <id> --print ...` and `agy --continue --print ...` may still return `trajectory not found`.

Classify that result as `desktop_session_requires_cli_import`, not as a Phase or code failure. The supported recovery is an interactive `/resume`, switch to the `Antigravity` tab, select/import the desktop conversation, and then use the newly created CLI conversation ID. A redirected stdin pipe is not evidence that `/resume` completed: the picker requires a real interactive terminal and can exit without output.

For machine-readable checks, do not ask Gemini to format a JSON object. Use a local wrapper plus an exact fixed token (for example `AGY_PHASE4A_REVIEW_OK:<marker>`), and retain the raw stdout/stderr and failure class alongside the token result.
