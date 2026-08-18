---
name: pr-review-evaluation
description: 當需要評估一個 PR、或完成一個分支的開發並提交 PR 後，針對該 PR 的狀態進行 Merge 評估或標準化發表 Review 意見 (包含頂層 Review 及原生 GitHub Inline Comments) 時觸發。
---

# PR Review 評估與意見標準化 (PR Review Evaluation & Inline Comments)

## 觸發條件
當完成一個分支的開發並提交 Pull Request (PR)，或收到評估特定 PR 的請求時，觸發此技能來檢查 PR 狀態、執行本地驗證，並以標準化格式（含頂層 Review 與原生 GitHub Inline Review Comments）發表審查意見。

## 評估與審查流程

### 1. 抓取狀態與 Diff
- **PR 狀態與 Checks**：使用 `gh pr view <number>` 及 `gh pr checks <number>` 抓取當前 PR 狀態與 CI/CD 測試結果。
- **取得變更 Diff 與 HEAD SHA**：
  ```bash
  # 取得最新 commit SHA
  gh pr view <number> --json headRefOid -q .headRefOid

  # 檢視變更內容
  gh pr diff <number>
  ```
- **審查 CI 錯誤**：若有 CI/CD 失敗，深入分析 Actions 日誌或於本地重現定位問題。
- **前置意見參考**：使用 `gh pr view <number> -c` 檢視其他 Agent (如 Codex) 或使用者的 Review 留言。鼓勵 Agent 依照自身的專長與測試結果提出獨立見解，不強求一致性。

---

## 2. Review 結構與標準格式

### 2.1 跨 Agent 身分標記規範 (`{代號} as {Agent}`)
- **背景**：所有 Agent（Google Antigravity, OpenAI Codex, Google Jules）共用同一個開發者 GitHub 帳號發言。
- **格式規範**：Review 報告的開頭標題與結尾簽名必須統一使用 `{代號} as {Agent}` 格式：
  - 範例：`Gemini as Antigravity`、`Luna as Codex`、`Gemini as Jules`、`Claude as Codex` 等。

### 2.2 頂層 Review (Top-level Review Body)
頂層 Review 內文必須包含以下標準結構，語氣客觀嚴謹：

```markdown
{代號} as {Agent} review — {結論摘要, e.g., blocking findings recorded / ready to merge}.

**CI Status & Local Verification:**
簡述目前的 Actions 狀態及本地驗證的結果 (例如 14/14 checks pass, 171 backend pytest passed, 440 vitest passed 等)。

**Findings & Assessment:**
- 條列式指出需要修正的具體問題 (型別錯誤、邏輯缺失、缺乏邊界驗證等)。
- 提出修改建議與處理方案。
- **CI 未涵蓋 Blocking 意見之測試代碼提供義務 (Mandatory Test Snippet)**：若 Reviewer 提出的 Blocking 意見涉及現有 CI 測試尚未涵蓋的情境（例如極端邊界值、競態條件或未測試之路徑），**Reviewer 必須一併提供可重現該問題的具體測試代碼（Pytest 或 Vitest 程式碼片段）**，供 Author/Maintainer 於本地快速重現、驗證修正並納入測試套裝中。
- 參考其他 Agent 的意見時，明確表態同意、補充，或提出不同的獨立見解。

**Next Steps:**
- 說明通過條件 (例如：請修正上述錯誤、納入附帶之單元測試並確保 CI 全數轉綠)。
- 說明何時可以再次請求 Review 或進行 Merge。

Reviewer: {代號} as {Agent}
```

### 2.3 原生 GitHub Inline Review Comments (行內評論與代碼建議)
當需要針對具體程式碼行提出意見或重構建議時，**必須提交原生的 GitHub Inline Review Comments**（而非僅於 Review Body 提及文字）。

#### JSON Payload 結構規格
```json
{
  "commit_id": "<HEAD_COMMIT_SHA>",
  "body": "{頂層 Review 總結報告 Markdown}",
  "event": "COMMENT",
  "comments": [
    {
      "path": "frontend/src/utils/tuningMath.ts",
      "line": 45,
      "side": "RIGHT",
      "body": "此處除數可能為 0，建議加入安全防護：\n```suggestion\nconst result = divisor > 0 ? value / divisor : 0;\n```"
    },
    {
      "path": "backend/main.py",
      "start_line": 20,
      "start_side": "RIGHT",
      "line": 25,
      "side": "RIGHT",
      "body": "這段邏輯建議抽離成共用函式。"
    }
  ]
}
```

#### GitHub Code Suggestions 語法規範
在 Inline Comment 的 `body` 中，可使用 ````suggestion` 標籤提供可一鍵套用的程式碼建議：
````markdown
```suggestion
替換後的程式碼
```
````

---

## 3. Diff Hunk 邊界與 422 錯誤防護 (Critical)

- **Diff Hunk 限制**：GitHub REST API 規定，Inline Comments 的目標行號必須位在該 PR 的 **Diff Hunk**（變更行及其周邊約 3 行上下文）之內。若行號超出 Diff 範圍，GitHub API 會回傳 `422 Unprocessable Entity: pull_request_review_thread.line must be part of the diff`，導致整筆 Review 失敗。
- **降級機制 (Graceful Fallback)**：
  1. 針對 Diff 內的變更行：正常發布為原生 Inline Comments。
  2. 針對 Diff 外的既有代碼行：自動降級收攏至頂層 Review Body 的 `Findings & Assessment` 區段（例如標註 `[既有代碼提醒] src/file.ts:L120 - ...`），確保 Review 100% 成功提交。

---

## 4. 提交方式

### 方式 A：使用專案輔助腳本 (推薦，自動 Diff 驗證與降級)
專案提供 `.agents/skills/pr-review-evaluation/scripts/submit_pr_review.py` 工具，可自動完成 HEAD SHA 提取、Diff Hunk 檢查與 Review 提交：

```powershell
# 1. 將審查內容編寫至 JSON 檔 (例如 scratch/review_payload.json)
# 2. 執行提交
.venv\Scripts\python.exe .agents\skills\pr-review-evaluation\scripts\submit_pr_review.py --pr <number> --input scratch/review_payload.json

# 或以 Dry-Run 模式預檢
.venv\Scripts\python.exe .agents\skills\pr-review-evaluation\scripts\submit_pr_review.py --pr <number> --input scratch/review_payload.json --dry-run
```

### 方式 B：透過 `gh api` 原生端點提交
```powershell
# 準備包含 commit_id, body, event, comments 的 payload.json
gh api --method POST /repos/{owner}/{repo}/pulls/<number>/reviews --input payload.json
```

### 方式 C：簡易模式 (無 Inline Comments)
若審查僅涉及整體架構、無需針對特定程式碼行評論：
```powershell
gh pr review <number> --comment --body-file <path_to_review_body.md>
```

---

## 5. 相關參考文件
- 詳細 API 規範、Schema 與錯誤排查請參閱：[github_inline_comments_guide.md](references/github_inline_comments_guide.md)
