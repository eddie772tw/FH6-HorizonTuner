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

## 常見漏洞分類與修復規範

### 1. Python / JS 路徑注入 (`py/path-injection`, `js/path-injection`)
- **風險**：由外部傳入之檔案名稱或路徑字串未經嚴格驗證，直接傳入 `open()`、`fs.readFileSync` 或路徑拼接函數，可能造成目錄遍歷（Path Traversal / `../` 跳脫）。
- **修復守則**：
  1. 僅允許白名單副檔名與字元（或透過 `os.path.basename` / `path.basename` 剝離目錄結構）。
  2. 使用 `os.path.realpath` 或 `path.resolve` 正規化後，強制執行目錄邊界包含性檢查：
     ```python
     # Python 範例：路徑安全包含檢查
     resolved_path = os.path.realpath(os.path.join(BASE_DIR, user_input))
     if not resolved_path.startswith(os.path.realpath(BASE_DIR) + os.sep):
         raise PermissionError("Access denied: Path traversal detected")
     ```
  3. 對於測試檔案（E2E / mock）若涉及動態路徑，應使用固定的測試專用目錄（fixture）進行絕對路徑錨定。

### 2. 不安全標籤過濾 (`js/bad-tag-filter`)
- **風險**：正則表達式如 `/<script>.*<\/script>/` 未考慮屬性、換行、大寫或尾端空格（如 `</script >`），容易被繞過造成 XSS。
- **修復守則**：
  1. 避免使用簡易 regex 過濾 HTML 標籤。
  2. 若為測試斷言用途，正則應完善考慮空格與屬性（如 `<\/script\s*>`）。
  3. 在實際程式碼中採用標準 HTML Parser 或 Sanitizer 庫處理。

### 3. Socket 全網路介面綁定 (`py/bind-socket-all-network-interfaces`)
- **風險**：將 UDP/TCP Socket 綁定至 `0.0.0.0` 會暴露服務至區域網路或公開網路。
- **修復守則**：
  1. 本地開發、模擬器或內部 RPC 預設應綁定 `127.0.0.1` (localhost)。
  2. 若因遊戲主機 UDP 遙測（Forza Data Out 跨主機廣播）必須綁定 `0.0.0.0`，應明確將其封裝於遙測接收模組內，並加上註解與設定開關，其餘 HTTP/WebSocket 服務一律鎖定 `127.0.0.1`。

### 4. 密鑰與 Token 洩漏 (`secret-scanning`)
- **風險**：API Key、Private Key、GitHub Token 被誤 commit 至 Git 歷史紀錄中。
- **修復守則**：
  1. **立即吊銷 (Revoke)**：第一時間在金鑰發行平台吊銷外洩金鑰，不可僅依賴覆蓋 commit。
  2. 檢查 `.gitignore`，確保 `.env`、`*.pem`、`*.key`、`credentials.json` 被排除。
  3. 使用 GitHub Secret Scanning 介面將該警報標記為 `resolved` (revoked / false_positive / pattern_deleted)。

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
