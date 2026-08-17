# GitHub Security REST API 參考指南

本指南記錄 GitHub REST API 各安全相關端點的呼叫慣例、參數約束、回傳格式與權限要求。

---

## 1. Code Scanning Alerts (CodeQL / 靜態掃描)

- **端點**：`GET /repos/{owner}/{repo}/code-scanning/alerts`
- **權限要求**：`security_events` (read)
- **常用 Query 參數**：
  - `state`：`open`、`closed`、`dismissed`、`fixed`（可多選，例如 `state=open,fixed`）
  - `severity`：`critical`、`high`、`medium`、`low`、`warning`、`note`、`error`
  - `ref`：指定分支或 tag（例如 `ref=refs/heads/main`）
  - `per_page`：每頁數量（預設 30，最大 100）
- **常用 CLI 指令**：
  ```bash
  # 抓取目前開啟中的所有 Code Scanning 警報（自動分頁）
  gh api --paginate repos/{owner}/{repo}/code-scanning/alerts
  ```

---

## 2. Dependabot Alerts (依賴套件漏洞)

- **端點**：`GET /repos/{owner}/{repo}/dependabot/alerts`
- **權限要求**：`vulnerability_alerts` (read)
- **常用 Query 參數**：
  - `state`：`auto_dismissed`、`dismissed`、`fixed`、`open`（可逗號分隔，例如 `state=open,fixed,dismissed`）
  - `severity`：`low`、`medium`、`high`、`critical`
  - `ecosystem`：`npm`、`pip`、`cargo`、`actions` 等
  - `package`：指定套件名稱
- **常用 CLI 指令**：
  ```bash
  # 抓取所有 Dependabot 警報
  gh api --paginate repos/{owner}/{repo}/dependabot/alerts
  ```

---

## 3. Secret Scanning Alerts (密鑰與 Token 洩漏)

- **端點**：`GET /repos/{owner}/{repo}/secret-scanning/alerts`
- **權限要求**：`secret_scanning_alerts` (read)
- **重要參數限制**：
  - `state` 僅接受 **單一值**：`open` 或 `resolved`（傳入多個值如 `open,resolved` 會回傳 HTTP 400 錯誤）。
  - `secret_type`：例如 `github_personal_access_token`、`slack_webhook_url` 等。
- **常用 CLI 指令**：
  ```bash
  # 抓取未解決的密鑰警報
  gh api --paginate "repos/{owner}/{repo}/secret-scanning/alerts?state=open"

  # 抓取已解決的密鑰警報
  gh api --paginate "repos/{owner}/{repo}/secret-scanning/alerts?state=resolved"
  ```

---

## 4. Repository Security Advisories (安全通報)

- **端點**：`GET /repos/{owner}/{repo}/security-advisories`
- **權限要求**：`security_advisories` (read)
- **常用 CLI 指令**：
  ```bash
  gh api --paginate repos/{owner}/{repo}/security-advisories
  ```

---

## 5. Vulnerability Alerts 狀態與 CodeQL 分析紀錄

- **啟用狀態端點**：`GET /repos/{owner}/{repo}/vulnerability-alerts`
  - 狀態碼 `204 No Content`：表示該功能已啟用（Active）。
  - 狀態碼 `404 Not Found`：表示該功能未啟用或無權限。
- **CodeQL Default Setup**：`GET /repos/{owner}/{repo}/code-scanning/default-setup`
  - 包含已配置的分析語言、threat model 與執行週期。
- **CodeQL 分析歷史**：`GET /repos/{owner}/{repo}/code-scanning/analyses`
  - 列出最近的 SARIF 分析執行結果、commit SHA 與 rules_count。
