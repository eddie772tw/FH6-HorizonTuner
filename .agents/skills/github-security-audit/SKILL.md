---
name: github-security-audit
description: 當需要收集、審查或修復 GitHub 自主檢測的安全問題（Code Scanning/CodeQL、Dependabot、Secret Scanning、Security Advisories）時觸發此技能。
---

# GitHub 安全檢測與弱點審查 (GitHub Security Audit)

## 觸發條件
當需要：
1. 收集儲存庫內由 GitHub 自動檢測產生的安全警報（Code Scanning / Dependabot / Secret Scanning / Security Advisories）。
2. 針對 CodeQL 靜態掃描發現的程式碼缺陷（如 Path Injection、Bad Tag Regex 等）進行審查、評估與排定修復。
3. 檢查第三方依賴套件漏洞（Dependabot）或密鑰洩漏（Secret Scanning）狀態。
4. 匯出專案整體安全評估報告或更新 `SECURITY.md` 治理方針。

---

## 安全資料收集工作流

### 1. 使用內建自動化腳本一鍵收集

專案提供自動化 Python 收集腳本，能全自動呼叫 GitHub CLI 並整合五大安全維度數據：

```powershell
# 執行全維度收集並印出摘要
.venv\Scripts\python.exe .agents/skills/github-security-audit/scripts/collect_security_alerts.py

# 輸出 Markdown 報告至指定檔案
.venv\Scripts\python.exe .agents/skills/github-security-audit/scripts/collect_security_alerts.py --md-out security_report.md

# 輸出完整 JSON 數據供自動化分析
.venv\Scripts\python.exe .agents/skills/github-security-audit/scripts/collect_security_alerts.py --json-out security_data.json
```

### 2. 手動 GitHub CLI 常用查詢指令

| 檢測維度 | 查詢指令 | 備註說明 |
| :--- | :--- | :--- |
| **Code Scanning (Open)** | `gh api --paginate repos/:owner/:repo/code-scanning/alerts` | CodeQL 程式碼缺陷 |
| **Code Scanning (All)** | `gh api --paginate "repos/:owner/:repo/code-scanning/alerts?state=open,closed,dismissed"` | 包含歷史與已修復項目 |
| **Dependabot Alerts** | `gh api --paginate repos/:owner/:repo/dependabot/alerts` | 第三方套件弱點 |
| **Secret Scanning (Open)** | `gh api --paginate "repos/:owner/:repo/secret-scanning/alerts?state=open"` | 密鑰洩漏（注意 state 僅接受單一值） |
| **Secret Scanning (Resolved)** | `gh api --paginate "repos/:owner/:repo/secret-scanning/alerts?state=resolved"` | 已標記解決之密鑰 |
| **Security Advisories** | `gh api --paginate repos/:owner/:repo/security-advisories` | 儲存庫安全性諮詢 |
| **Vulnerability Alerts 啟用** | `gh api repos/:owner/:repo/vulnerability-alerts --include` | 回傳 `204 No Content` 為已啟用 |
| **CodeQL 分析紀錄** | `gh api repos/:owner/:repo/code-scanning/analyses --jq ".[0]"` | 檢查最新分析狀態與語言覆蓋 |

---

## PR 檢查與警報生命週期規範 (PR / CI Security Lifecycle)

在進行安全漏洞修復與驗證時，必須理解 GitHub Advanced Security 的警報生命週期：

1. **PR 階段 (Open PR)**：
   - GitHub Security Tab 顯示的是 **Base 分支 (如 `main`)** 的警報狀態。在 PR 處於開啟或分支 Commit 階段，Security Tab 上的主要警報總數**不會立即減少**。
   - **驗證指標 (Source of Truth)**：必須透過 **PR Checks** (`gh pr checks <pr-number>`)、**Check Runs Annotations** 或 **CodeQL CI Action 日誌** 來確認本次變更是否成功消除警告、是否有新漏洞被引入。
2. **Merge 階段 (Merged to Default Branch)**：
   - PR 正式合併至預設分支（`main`）並觸發主分支的 CodeQL 掃描後，Security Tab 上的歷史警報才會自動由系統轉為 **`Closed (Fixed)`**。

---

## 常見漏洞分類與標準防禦模式

### 1. Python / JS 路徑注入 (`py/path-injection`, `js/path-injection`)
- **風險**：外部傳入之檔案名稱或路徑字串未經嚴格驗證直接傳入 `open()` 或檔案系統 API，可能造成目錄跳脫（Path Traversal）。
- **防禦模式 A（集中式安全包含檢驗）**：
  - 統一使用專案安全模組 `backend/path_security.py` 的 `safe_resolve_path` 或 `safe_join_under_dir`：
    ```python
    abs_base = os.path.realpath(os.path.abspath(base_dir))
    abs_target = os.path.realpath(os.path.abspath(os.path.join(abs_base, clean_name)))
    if os.path.commonpath([abs_base, abs_target]) != abs_base:
        raise PermissionError("Access denied: Path traversal detected")
    ```
- **防禦模式 B（內部枚舉查找 — 徹底切斷污點鏈）**：
  - 對於 Presets、Sessions 或 Captures 等集合型檔案讀取，優先透過內部 `glob.glob` 或 `os.walk` 列舉出的物件清單進行檔名比對，直接讀取內部物件的路徑，**完全不讓使用者輸入字串參與路徑拼接**，從根本上切斷 CodeQL 的污點追蹤鏈 (Taint Flow)。
- **測試伺服器防禦 (Test Harness)**：
  - E2E 測試（如 Playwright）中的本機 HTTP 伺服器，路徑解析必須以 `path.basename` + 正則字元白名單（`/^[a-zA-Z0-9_.-]+$/`）與 `startsWith` 雙重防護。

### 2. 不安全 HTML 標籤過濾 (`js/bad-tag-filter`)
- **風險**：正則表達式比對 HTML 結束標籤時，若未考量屬性、換行或非常規空白（如 `</script\t\n bar>`），會被 CodeQL 標記為漏洞。
- **標準正則規範**：
  - 提取或過濾 `<script>` 標籤時，結束標籤必須使用容錯 pattern：
    ```ts
    // 標準合格正則：
    /<script[^>]*>([\s\S]*?)<\/script[^>]*>/gi
    ```

### 3. Socket 全網路介面綁定 (`py/bind-socket-all-network-interfaces`)
- **風險**：將 Socket 綁定至 `0.0.0.0` 會暴露服務至區域網路或公開網路。
- **修復守則**：
  1. 本地開發、模擬器或內部 RPC 預設應綁定 `127.0.0.1` (localhost)。
  2. 測試腳本與輔助工具應支援 `--host` 參數（預設 `127.0.0.1`），不可硬編碼 `0.0.0.0`。
  3. 僅 Forza UDP 遙測接收主迴圈（因跨主機 UDP 廣播需求）在註解清楚的前提下允許綁定。

### 4. 密鑰與 Token 洩漏 (`secret-scanning`)
- **風險**：API Key、Private Key、GitHub Token 被誤 commit 至 Git 歷史紀錄中。
- **修復守則**：
  1. **立即吊銷 (Revoke)**：第一時間在金鑰發行平台吊銷外洩金鑰，不可僅依賴覆蓋 commit。
  2. 檢查 `.gitignore`，確保 `.env`、`*.pem`、`*.key`、`credentials.json` 被排除。
  3. 使用 GitHub Secret Scanning 介面將該警報標記為 `resolved`。

### 5. 第三方依賴漏洞與上游間接依賴鎖死 (`dependabot-transitive-lock`)
- **現象**：Dependabot 提示 "One or more other dependencies require a version that is incompatible with this update."，無法自動產生 PR。
- **排查與處置 SOP**：
  1. **定位依賴路徑 (Dependency Path)**：
     - Rust / Cargo: 執行 `cargo tree --target all -i <package-name>`
     - Node.js / pnpm: 執行 `pnpm why <package-name>`
     - Python: 執行 `uv pip tree` 或 `pipdeptree -r -p <package-name>`
  2. **測試版本衝突**：執行精確更新命令（如 `cargo update -p <package> --precise <version>`），獲取具體 SemVer 衝突之父層套件。
  3. **受害面與目標平台評估 (Threat & Platform Reachability)**：
     - 查驗該依賴是否僅存在於特定 Target 平台（如 Linux-only GTK / webkit2gtk），而專案僅發行特定平台（如 Windows-only PE 二進位檔）。
     - 確認生產環境或最終發行產物中是否包含該易受攻擊之符號。
  4. **處置決策**：
     - 若為前端/Node.js 可透過 `pnpm.overrides` 覆寫者，優先執行 supply chain override。
     - 若為上游核心框架（如 Tauri 核心）限制且生產平台完全不受影響，透過 GitHub API 或 Web UI 標記為 `dismissed`（理由 `tolerable_risk` / `inaccurate`），並於 Dismiss comment 明確載明平台隔離與上游依賴依據。

---

## 報告與審計輸出格式規範

執行安全審計時，應產出結構清晰的 Markdown 報告：

```markdown
# 安全審計報告 — {YYYY-MM-DD}

## 1. 檢測維度與警報總覽
- Code Scanning Alerts: {總數} (Critical: X, High: Y, Medium: Z, Low: W)
- Dependabot Alerts: {總數}
- Secret Scanning Alerts: {總數}
- Security Advisories: {總數}

## 2. 待修復清單 (Action Items)
| 編號 | 嚴重等級 | 類型/Rule ID | 檔案位置 | 建議處理方案 |
|---|---|---|---|---|
| #X | HIGH | py/path-injection | path/to/file.py:L10 | 增加目錄 containment 檢驗 |

## 3. 修復與驗證紀錄
- 說明已完成的修復、新增的防禦單元測試與安全回歸驗證結果。
```

---

## 搭配資料
- 詳細 API 端點規格與權限參考：[references/github_security_api_guide.md](references/github_security_api_guide.md)
