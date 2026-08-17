# GitHub PR Review 與 Inline Comments 整合參考指南

本指南詳細說明 GitHub Pull Request Review 機制、原生 Inline Review Comments 之 API 規格、Code Suggestion 語法、Diff Hunk 邊界規則以及除錯防護措施。

---

## 1. GitHub PR Review 核心概念

在 GitHub PR 審查體系中，審查分為兩個層次：
1. **頂層 Review (Top-level Review)**：包含整體的審查結論（`body`）與狀態事件（`event`: `COMMENT` | `APPROVE` | `REQUEST_CHANGES`）。
2. **行內評論 (Inline Review Comments / Review Threads)**：直接錨定在 PR 程式碼變更 Diff 特定檔案、特定行號（或行號區間）上的具體評論與程式碼修改建議（Suggestions）。

---

## 2. GitHub REST API 規格

### 2.1 批次原子提交 Review (推薦)

- **Endpoint**：`POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews`
- **說明**：一次性原子提交頂層結論與多筆行內評論。若有任何一筆 comment 格式或行號錯誤，整筆 review 將失敗回傳 422，確保評論的一致性。

#### 請求 Payload Schema (JSON)
```json
{
  "commit_id": "0123456789abcdef0123456789abcdef01234567",
  "body": "頂層 Review 總結報告 (Markdown 格式)",
  "event": "COMMENT",
  "comments": [
    {
      "path": "frontend/src/utils/tuningMath.ts",
      "line": 45,
      "side": "RIGHT",
      "body": "此處計算建議加入防護：\n```suggestion\nconst result = divisor > 0 ? value / divisor : 0;\n```"
    },
    {
      "path": "backend/main.py",
      "start_line": 120,
      "start_side": "RIGHT",
      "line": 128,
      "side": "RIGHT",
      "body": "這段邏輯建議抽離成共用函式。"
    }
  ]
}
```

#### 欄位定義表

| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| `commit_id` | string | 是 (帶 comments 時) | PR 當前最新的 commit SHA (HEAD SHA)。 |
| `body` | string | 是 | 頂層 Review 評論內文，支援標準 Markdown。 |
| `event` | string | 是 | 審查動作：`"COMMENT"` (純評論), `"APPROVE"` (核准), `"REQUEST_CHANGES"` (要求變更)。 |
| `comments` | array | 否 | 行內評論陣列。 |
| `comments[].path` | string | 是 | 目標檔案相對路徑（相對於 repository 根目錄）。 |
| `comments[].line` | integer | 是 | 單行評論目標行號，或多行評論之結束行號。 |
| `comments[].side` | string | 否 | `"RIGHT"`（預設，變更後/新檔案）或 `"LEFT"`（變更前/刪除行）。 |
| `comments[].start_line` | integer | 否 | 多行評論之起始行號。 |
| `comments[].start_side` | string | 否 | 多行評論起始側，預設同 `side`。 |
| `comments[].body` | string | 是 | 該行內評論內文，可包含 ````suggestion` 程式碼建議。 |

---

## 3. GitHub Code Suggestions 語法

GitHub 支援在 Inline Comment 的 `body` 內使用 suggestion 語法。GitHub Web 介面會自動將其渲染為可一鍵合併（Apply / Commit suggestion）的按鈕。

### 3.1 單行建議範例
針對單行變更（例如修改 `line: 45`）：
````markdown
這裡的除數可能為 0，建議加入保護機制：
```suggestion
const normalizedWeight = totalWeight > 0 ? frontWeight / totalWeight : 0.5;
```
````

### 3.2 多行建議範例
針對多行變更（設定 `start_line: 40, line: 43`）：
````markdown
建議重構為更簡潔的 guard 語句：
```suggestion
if (!config.enabled) {
  return null;
}
return calculateMetrics(config);
```
````

---

## 4. Diff Hunk 邊界限制與 422 錯誤防護 (Critical Invariant)

### 4.1 核心限制
GitHub API **不允許在 PR Diff Hunk 範圍之外**建立 Inline Review Comment。
- **Diff Hunk**：指 `git diff` 輸出中以 `@@ -start,count +start,count @@` 標註的區塊（通常包含修改行以及前後各約 3 行的上下文）。
- 若傳入的 `line` 超出 Diff Hunk 範圍，GitHub API 會拋出錯誤：
  `HTTP 422 Unprocessable Entity: pull_request_review_thread.line must be part of the diff`
- 當整筆 review 批次提交時，只要其中一筆 comment 超界，所有評論皆會提交失敗。

### 4.2 降級策略 (Graceful Fallback)
1. **Diff 內行號**：正常作為原生 `comments[]` 送出。
2. **Diff 外行號 (未變更的既有代碼)**：
   - 工具或 Agent 自動偵測行號是否在 Diff Hunk 內。
   - 若超出 Diff 範圍，自動將該條意見移至頂層 Review 的 `Findings & Assessment` 區段，並以 Markdown 格式標示（例如 `[既有代碼提醒] path/to/file.ts:L123 - ...`），確保 Review 能夠 100% 成功送出。

---

## 5. CLI 與工具呼叫範例

### 5.1 使用專案輔助腳本 `submit_pr_review.py` (推薦)

```powershell
# 從 JSON 描述檔提交 Review
uv run --no-project --python .venv\Scripts\python.exe .agents\skills\pr-review-evaluation\scripts\submit_pr_review.py --pr 216 --input review_payload.json

# Dry-run 檢查行號與 Diff 合法性 (不實際發送 API)
uv run --no-project --python .venv\Scripts\python.exe .agents\skills\pr-review-evaluation\scripts\submit_pr_review.py --pr 216 --input review_payload.json --dry-run
```

### 5.2 使用 `gh api` 直接提交

```powershell
# 1. 取得 PR 最新 HEAD SHA
$HEAD_SHA = gh pr view 216 --json headRefOid -q .headRefOid

# 2. 準備 review.json (包含 commit_id, body, event, comments)

# 3. 透過 gh api 提交
gh api --method POST /repos/{owner}/{repo}/pulls/216/reviews --input review.json
```
