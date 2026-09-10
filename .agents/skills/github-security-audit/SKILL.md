---
name: github-security-audit
description: 當需要收集、審查或修復 GitHub 自主檢測的安全問題（Code Scanning/CodeQL、Dependabot、Secret Scanning、Security Advisories）時觸發此技能。
---

# GitHub 安全檢測與弱點審查 (GitHub Security Audit)

本技能提供 GitHub 儲存庫安全審計、警報生命週期確認與漏洞修復之工作流路由器。

## 任務情境路由器 (4 大情境)

### 情境 1：安全資料收集與盤點
使用內建自動化 Python 腳本或手動 GitHub CLI 進行多維度安全警報收集：

```powershell
# 1. 執行全維度收集並印出摘要
uv run --no-project --python .venv\Scripts\python.exe .agents/skills/github-security-audit/scripts/collect_security_alerts.py

# 2. 輸出 Markdown 審計報告或 JSON 數據
uv run --no-project --python .venv\Scripts\python.exe .agents/skills/github-security-audit/scripts/collect_security_alerts.py --md-out security_report.md
uv run --no-project --python .venv\Scripts\python.exe .agents/skills/github-security-audit/scripts/collect_security_alerts.py --json-out security_data.json
```

手動 GitHub CLI API 查詢指令：
- Code Scanning (Open): `gh api --paginate repos/:owner/:repo/code-scanning/alerts`
- Dependabot Alerts: `gh api --paginate repos/:owner/:repo/dependabot/alerts`
- Secret Scanning (Open): `gh api --paginate "repos/:owner/:repo/secret-scanning/alerts?state=open"`
- Security Advisories: `gh api --paginate repos/:owner/:repo/security-advisories`

### 情境 2：漏洞審查與標準修復
若涉及具體漏洞代碼修復，請嚴格參閱 [references/vulnerability_remediation_patterns.md](references/vulnerability_remediation_patterns.md) 實作防禦模式：
1. **Python / JS 路徑注入**：使用集中安全模組 `safe_resolve_path` 或內部枚舉切斷污點鏈。
2. **HTML 標籤過濾**：使用標準合格之容錯正則。
3. **Socket 綁定**：預設綁定 `127.0.0.1`，僅遙測主迴圈允許廣播綁定。
4. **密鑰洩漏**：優先立即吊銷金鑰並更新 `.gitignore`。
5. **Dependabot 依賴衝突**：使用 `pnpm.overrides` 或平台隔離評估後 Dismiss。

### 情境 3：PR 檢查與警報生命週期確認
理解 GitHub Advanced Security 的警報生命週期：
- **PR 階段 (Open PR)**：Security Tab 顯示的是 Base 分支狀態，PR 期間**主要警報總數不會減少**。驗證依據為 **PR Checks** (`gh pr checks <pr-number>`) 或 CodeQL CI Action 日誌。
- **Merge 階段 (Merged to Default Branch)**：PR 正式合併至 `main` 觸發 CodeQL 掃描後，Security Tab 警報才會自動轉為 `Closed (Fixed)`。

### 情境 4：審計報告產出規範
產出結構化安全報告時應包含：
1. 檢測維度與警報總覽（Code Scanning, Dependabot, Secret Scanning, Advisories 數量分級）。
2. 待修復清單（編號、嚴重等級、Rule ID、檔案位置、建議方案）。
3. 修復與驗證紀錄（單元測試與安全回歸驗證指令）。

---

## 搭配資料 (References)
- [vulnerability_remediation_patterns.md](references/vulnerability_remediation_patterns.md)：五大常見漏洞（路徑注入、標籤過濾、Socket、密鑰、Dependabot）標準修復模式與代碼範例。
- [github_security_api_guide.md](references/github_security_api_guide.md)：詳細 GitHub Security REST API 端點規格與權限說明。
