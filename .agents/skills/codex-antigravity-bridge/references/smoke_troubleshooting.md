# Codex ↔ Antigravity 握手測試輸出分類與除錯指引

## 通訊結果分類 (Smoke Test Classifications)

執行 `Invoke-AgyCrossAgentSmoke.ps1` 握手測試時，結果分類標準如下：

| 結果分類代碼 | 說明 | 處置方式 |
| :--- | :--- | :--- |
| `passed` | 固定 token 正確收到且 CLI 正常結束。 | 通訊正常，可繼續進入實作 handoff。 |
| `agent_response_mismatch` | CLI 有回應但固定 token 不符。 | 模型輸出參雜自由文字或被樣板干擾；改用更強硬的純 token prompt 封裝。 |
| `permission_denied` | stderr 或輸出顯示 tool permission / system protection boundary 被拒絕。 | 1. 執行 `Set-AgyBridgeSettings.ps1` 檢查 `toolPermission: proceed-in-sandbox`。<br>2. 確認調用時指定 `--add-dir <workspacePath>`。<br>3. 確認路徑未超出工作區邊界（未存取 `C:\Users\...`）。 |
| `timeout` | 超過 bounded timeout（預設 90s）。 | 停止重試，保留 timeout 證據；改用純文字握手或手動互動匯入。 |
| `auth_or_startup_failure` | CLI 啟動、登入或 workspace trust 失敗。 | 檢查 `agy` 路徑、Google 帳號登入狀態與工作區信任設定。 |

---

## 常見失敗處理 (Troubleshooting Runbook)

- **`agy` 找不到**：使用絕對路徑（例如 `$env:LOCALAPPDATA\agy\bin\agy.exe`），並在 handoff 記錄 CLI 版本。
- **Headless 顯示 `read_file` / tool permission denied**：
  1. 執行 `Set-AgyBridgeSettings.ps1` 確認 `settings.json` 包含 `toolPermission: proceed-in-sandbox`。
  2. 確認調用時指定了 `--add-dir <workspacePath>` 且 process 工作目錄為專案根目錄。
  3. 確認要求的檔案路徑未超出工作區邊界（未存取 `C:\Users\...` 或系統保護檔案）。
- **Headless 無輸出或逾時**：停止重試，保留 timeout 證據；改用固定 token prompt 或互動匯入一次 session。
- **模型回傳不符合 JSON**：不要修 prompt 直到它「看起來像 JSON」；改用固定 token，讓 Codex 本地包裝結果。
- **Antigravity 修改超出 scope**：停止後續寫入，保留 diff，要求明確 handoff，再由 Codex review。
- **同一檔案有兩個 owner**：停止寫入並回到 `cross-agent-collaboration` 的 ownership 協調流程。
