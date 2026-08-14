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

## 2. 找到 `agy` 並配置 Headless 工具權限（方案 A 與方案 B）

Windows 上不要假設目前 PowerShell 的 `PATH` 已刷新。依序尋找：

```powershell
Get-Command agy -ErrorAction SilentlyContinue
Test-Path "$env:LOCALAPPDATA\agy\bin\agy.exe"
```

### 方案 A：Headless 工具授權配置 (`settings.json`)
當另一個 Agent 透過 headless 模式 (`agy --print`) 與 Antigravity 交互時，若需要 Antigravity 執行工具（例如 `view_file` / `read_file` 讀取專案檔案），在非互動環境下無法彈出對話框供使用者手動批准。若未正確設定，系統會判定為 `Permission denied` 或逾時。

必須在使用者本機設定檔 `%USERPROFILE%\.gemini\antigravity-cli\settings.json` 中配置：

```json
{
  "enableTerminalSandbox": true,
  "toolPermission": "proceed-in-sandbox"
}
```

可直接執行專案內建輔助腳本自動檢查並設定：

```powershell
powershell -ExecutionPolicy Bypass -File `
  .agents/skills/codex-antigravity-bridge/scripts/Set-AgyBridgeSettings.ps1
```

> **安全邊界原則**：`proceed-in-sandbox` 允許沙盒內工作區檔案的讀取與安全工具自動放行，同時受硬編碼系統邊界保護。嚴禁設定 `always-proceed`、`command(*)` 或 `--dangerously-skip-permissions`。

### 方案 B：強制綁定工作區與工作目錄 (`--add-dir` & `WorkingDirectory`)
Headless 調用時，**必須明確將工作目錄與工作區綁定在專案根目錄**，以防止 Antigravity 的檔案工具因找不到工作區邊界或預設路徑錯誤而拋出 `Permission denied`：

1. **Process 啟動資訊**：設定 `$startInfo.WorkingDirectory = $workspacePath`。
2. **CLI 啟動參數**：對 `agy 1.1.13` 明確傳遞 `--add-dir "$workspacePath"` 參數；`-w` 不存在於此版本，禁止照抄其他 CLI 版本的旗標。

標準 Headless 調用命令範例：

```powershell
agy --add-dir "D:\FH6-HorizonTuner" --print --sandbox --print-timeout 90s -p "<prompt>"
```

### 工作區邊界與路徑規範
Antigravity 內建硬性安全防護（Hardcoded System Protection Boundary）：
- **允許存取**：位於目前工作區（如 `D:\FH6-HorizonTuner\...`）之內的檔案與目錄。
- **嚴格拒絕**：工作區外部路徑（例如 `C:\Users\<user>\...`、`~/.gemini/` 或系統目錄）。任何跨工作區的讀取請求均會直接返回 `Permission denied for read_file: Matches hardcoded system protection boundary rule`。
- **Prompt 路徑格式**：傳遞給 Antigravity 的檔案路徑必須為工作區內的絕對路徑（例如 `D:/FH6-HorizonTuner/path/to/file`）或相對於工作區根目錄的相對路徑。

## 3. 使用固定 token 驗證握手與工具讀檔

Gemini 可能無法穩定遵守「精確 JSON 欄位」要求。可靠 handshake 與工具測試只要求模型回傳單一固定 token：

1. **純文字握手（No-tools Handshake）**：
   ```text
   CROSS_AGENT_SMOKE_TEST marker=<marker>. Do not use tools. Reply with exactly: AGY_HANDSHAKE_OK:<marker>
   ```

2. **工具讀檔驗證（Read-File Verification）**：
   ```text
   CROSS_AGENT_READFILE_TEST marker=<marker>. Read the first 5 lines of '<workspace>/<relative-path>'. Reply with exactly: AGY_READFILE_OK:<marker>
   ```

使用本 skill 的測試腳本：

```powershell
# 1. 執行基礎握手測試
powershell -ExecutionPolicy Bypass -File `
  .agents/skills/codex-antigravity-bridge/scripts/Invoke-AgyCrossAgentSmoke.ps1 `
  -Workspace (Get-Location).Path

# 2. 執行工具讀檔權限測試 (驗證方案 A 與方案 B 是否生效)
powershell -ExecutionPolicy Bypass -File `
  .agents/skills/codex-antigravity-bridge/scripts/Invoke-AgyCrossAgentSmoke.ps1 `
  -Workspace (Get-Location).Path -TestReadFile
```

通訊結果分類：

- `passed`：固定 token 收到且 CLI 正常結束。
- `agent_response_mismatch`：CLI 有回應但 token 不符。
- `permission_denied`：stderr 或輸出顯示 tool permission / system protection boundary 被拒絕（腳本將輸出 diagnosticHint 提示）。
- `timeout`：超過 bounded timeout；不要無限等待或重試。
- `auth_or_startup_failure`：CLI 啟動、登入或 workspace trust 失敗。

## 4. 發送實作 handoff

通過 handshake 後才傳送實作 prompt。prompt 必須包含：

- branch 與 repository root
- Antigravity 的 owner、允許修改路徑與排除路徑（必須在 Workspace 之內）
- 保留 dirty worktree 的要求
- 不可執行的 destructive Git 命令
- 明確驗證命令
- 回覆格式以短 token／短段落為主，不依賴自由 JSON

推薦結構：

```text
Task: <task>
Owner: Antigravity
Branch: <branch>
Workspace: D:\FH6-HorizonTuner
Write scope: <paths inside workspace>
Do not touch: <paths outside write scope>
Constraints: preserve dirty worktree; no reset/checkout/clean; stay within workspace
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
- headless 顯示 `read_file` / tool permission denied：
  1. 執行 `Set-AgyBridgeSettings.ps1` 確認 `settings.json` 包含 `toolPermission: proceed-in-sandbox`。
  2. 確認調用時指定了 `--add-dir <workspacePath>` 且 process 工作目錄為專案根目錄。
  3. 確認要求的檔案路徑未超出工作區邊界（未存取 `C:\Users\...` 或系統保護檔案）。
- headless 無輸出或逾時：停止重試，保留 timeout 證據；改用固定 token prompt 或互動匯入一次 session。
- 模型回傳不符合 JSON：不要修 prompt 直到它「看起來像 JSON」；改用固定 token，讓 Codex 本地包裝結果。
- Antigravity 修改超出 scope：停止後續寫入，保留 diff，要求明確 handoff，再由 Codex review。
- 同一檔案有兩個 owner：停止寫入並回到 `cross-agent-collaboration` 的 ownership 協調流程。

## 7. Desktop conversation resume caveat

Treat a desktop conversation UUID and a CLI trajectory UUID as different identifiers. A desktop ID can be present in `%USERPROFILE%\\.gemini\\antigravity-cli\\cache\\last_conversations.json` and have a transcript under `%USERPROFILE%\\.gemini\\antigravity\\brain\\<id>`, yet `agy --conversation <id> --print ...` and `agy --continue --print ...` may still return `trajectory not found`.

Classify that result as `desktop_session_requires_cli_import`, not as a Phase or code failure. The supported recovery is an interactive `/resume`, switch to the `Antigravity` tab, select/import the desktop conversation, and then use the newly created CLI conversation ID. A redirected stdin pipe is not evidence that `/resume` completed: the picker requires a real interactive terminal and can exit without output.

For machine-readable checks, do not ask Gemini to format a JSON object. Use a local wrapper plus an exact fixed token (for example `AGY_PHASE4A_REVIEW_OK:<marker>`), and retain the raw stdout/stderr and failure class alongside the token result.
