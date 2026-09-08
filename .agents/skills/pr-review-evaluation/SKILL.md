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
遵循 [`.agents/AGENTS.md`](file:///d:/FH6-Bundle/FH6-HorizonTuner/.agents/AGENTS.md) 規範，所有 Agent 共用 GitHub 帳號時，Review 開頭標題與結尾簽名一律標記 `{代號} as {Agent}`（例如 `Gemini as Antigravity`、`Luna as Codex`）。

### 2.2 頂層 Review (Top-level Review Body)
頂層 Review 內文必須包含以下標準結構，語氣客觀嚴謹：

```markdown
{代號} as {Agent} review — {結論摘要, e.g., blocking findings recorded / ready to merge}.

**CI Status & Local Verification:**
簡述目前的 Actions 狀態及本地驗證的結果。

**Findings & Assessment:**
- 條列式指出具體問題 (型別錯誤、邏輯缺失、缺乏邊界驗證等)。
- **CI 未涵蓋 Blocking 意見之測試代碼提供義務 (Mandatory Test Snippet)**：若提出之 Blocking 意見涉及現有 CI 尚未覆蓋的情境，**Reviewer 必須一併提供可重現該問題的測試代碼片段（Pytest 或 Vitest）**，供 Author 本地重現驗證。
- 提出具體修改建議與處理方案。

**Next Steps:**
- 說明通過條件與後續 Merge / Re-review 時程。

Reviewer: {代號} as {Agent}
```

### 2.3 原生 GitHub Inline Review Comments (行內評論與代碼建議)
當需要針對具體程式碼行提出意見或重構建議時，**必須提交原生的 GitHub Inline Review Comments**（在 `body` 中使用 ````suggestion` 提供一鍵套用代碼建議）。

---

## 3. 自動化提交與 Diff Hunk 422 錯誤防護

GitHub REST API 規定行內評論必須位在 PR 的 **Diff Hunk** 內，否則會拋出 `422 Unprocessable Entity` 導致整個 Review 提交失敗。

專案提供自動化腳本 `.agents/skills/pr-review-evaluation/scripts/submit_pr_review.py`，**已全自動內建以下防護**：
1. 自動擷取最新 HEAD SHA。
2. 自動比對 Diff Hunk 範圍。
3. 若指定行號超出 Diff 範圍，**自動降級收攏至頂層 Review Body 的 `Findings & Assessment`**，確保 100% 成功提交。

### 提交指令：

```powershell
# 1. 預檢模式 (Dry-run 驗證 Diff Hunk 與 JSON 格式)
uv run --no-project --python .venv\Scripts\python.exe .agents/skills/pr-review-evaluation/scripts/submit_pr_review.py --pr <number> --input scratch/review_payload.json --dry-run

# 2. 正式發布 Review
uv run --no-project --python .venv\Scripts\python.exe .agents/skills/pr-review-evaluation/scripts/submit_pr_review.py --pr <number> --input scratch/review_payload.json
```

若審查僅涉及整體架構而無須行內評論，可使用簡易指令：
```powershell
gh pr review <number> --comment --body-file <path_to_review_body.md>
```

---

## 5. 相關參考文件
- 詳細 API 規範、Schema 與錯誤排查請參閱：[github_inline_comments_guide.md](references/github_inline_comments_guide.md)
