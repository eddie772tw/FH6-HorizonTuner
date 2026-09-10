# Headless Antigravity 工具授權與工作區邊界配置指南

## 方案 A：Headless 工具授權配置 (`settings.json`)

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

---

## 方案 B：強制綁定工作區與工作目錄 (`--add-dir` & `WorkingDirectory`)

Headless 調用時，**必須明確將工作目錄與工作區綁定在專案根目錄**，以防止 Antigravity 的檔案工具因找不到工作區邊界或預設路徑錯誤而拋出 `Permission denied`：

1. **Process 啟動資訊**：設定 `$startInfo.WorkingDirectory = $workspacePath`。
2. **CLI 啟動參數**：對 `agy` CLI 明確傳遞 `--add-dir "$workspacePath"` 參數；避免依賴其他 CLI 版本的隱性預設目錄。

標準 Headless 調用命令範例：

```powershell
agy --add-dir "D:\FH6-HorizonTuner" --print --sandbox --print-timeout 90s -p "<prompt>"
```

---

## 工作區邊界與路徑規範

Antigravity 內建硬性安全防護（Hardcoded System Protection Boundary）：
- **允許存取**：位於目前工作區（如 `D:\FH6-HorizonTuner\...`）之內的檔案與目錄。
- **嚴格拒絕**：工作區外部路徑（例如 `C:\Users\<user>\...`、`~/.gemini/` 或系統目錄）。任何跨工作區的讀取請求均會直接返回 `Permission denied for read_file: Matches hardcoded system protection boundary rule`。
- **Prompt 路徑格式**：傳遞給 Antigravity 的檔案路徑必須為工作區內的絕對路徑（例如 `D:/FH6-HorizonTuner/path/to/file`）或相對於工作區根目錄的相對路徑。
