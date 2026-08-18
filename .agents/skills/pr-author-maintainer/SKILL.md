---
name: pr-author-maintainer
description: 當作為 PR 建立者、作者或維護者 (Author/Maintainer) 撰寫 PR、持續同步更新 PR 內文、落實 Commit 前測試驗證、維護標題穩定性，或與其他 Reviewer (如 Codex、Jules、人類) 進行身分標記 ({代號} as {Agent}) 與意見回覆互動時觸發。
---

# PR Author 與 Maintainer 開發維護規範 (PR Author & Maintainer Workflow)

## 觸發條件
當以分支開發者、PR 作者或維護者（Author / Maintainer）身分執行以下任務時觸發本技能：
1. **建立新 PR**：完成本地功能開發、通過全套驗證後撰寫並提交 PR。
2. **PR 內文持續同步**：在 PR 開發或 Review 迭代過程中，隨著每一次 commit / 重構更新 PR 頂層 Body 內文，防止內容與最新代碼脫節（Documentation Drift）。
3. **回覆 Reviewer 意見**：針對其他 Agent（如 Codex、Jules）或人類 Reviewer 的 Top-level Review、Inline Comments / Suggestions 進行結構化回覆與討論。
4. **維護 PR 標題與中繼資料**：依據變更範圍評估是否需要更新標題，並維護標籤與關聯 Issue。

---

## 核心規範與不變量 (Core Invariants)

### 1. 禁止自我斷言可合併 (No Self-Asserted Mergeability)
- **原則**：Author / Maintainer 在 PR 說明（Body）或回覆留言中，**絕不自我斷言或宣告「Ready to merge」、「LGTM」、「Approve」或自行下定論**。
- **作法**：必須客觀陳述「變更摘要、已完成的本地/CI 驗證數據、待 Reviewer / Maintainer 審查與回饋」，將合併與審核結論交由審查者或外部驗證流程。

### 2. 嚴格 Commit 前驗證門檻 (Strict Pre-Commit Gate)
在每一次 commit 或 push 到 PR 分支前，**必須落實執行並 100% 通過本地全套檢查**：
- **後端靜態檢查與格式化**：
  ```powershell
  uv run --no-project --python .venv\Scripts\python.exe ruff check .
  uv run --no-project --python .venv\Scripts\python.exe ruff format --check .
  ```
- **後端單元測試**：
  ```powershell
  uv run --no-project --python .venv\Scripts\python.exe python -m pytest tests/
  ```
- **前端物理與單元測試**：
  ```powershell
  cmd /c "pnpm -C frontend run test"
  ```
- **前端建置與型別驗證**：
  ```powershell
  cmd /c "pnpm --prefix frontend run build"
  ```
**嚴禁將已知測試失敗、Lint 報錯或格式未對齊的代碼推送至 PR 分支**。

### 3. PR Body 持續同步與活文件原則 (Living PR Body / Continuous Sync)
- **原則**：PR 頂層 Body 必須是**活文件 (Living Document)**。
- **作法**：隨著 Review 過程中進行的多次 commit、代碼重構、bug 修正或 scope 調整，**必須同步更新 PR 頂層 Body 內文**，確保 PR Body 永遠忠實反映該 PR 的最終完整狀態，杜絕資訊偏差。

### 4. PR 標題穩定性原則 (PR Title Stability)
- **原則**：**僅在必要時修改 PR 標題**。
- **作法**：
  - 標題必須遵循 Conventional Commits 格式（如 `feat(...)`, `fix(...)`, `refactor(...)`, `docs(...)`）。
  - 避免因微小修復頻繁變更 PR 標題干擾通知與討論脈絡；唯有當 PR 核心目標、範圍或主要性質發生重大轉變時才允許修正標題。

### 5. 跨 Agent 身分標記規範 (`{代號} as {Agent}`)
- **背景**：所有 Agent（Google Antigravity, OpenAI Codex, Google Jules）共用同一個開發者 GitHub 帳號發言。
- **規範**：PR Body 與所有回覆留言之**開頭與結尾**必須明確標註身分：
  - 格式範例：`Gemini as Antigravity`、`Luna as Codex`、`Gemini as Jules`、`Claude as Codex` 等。
  - **PR Body 結尾**：`Author / Maintainer: {代號} as {Agent}`
  - **迭代紀錄**：`- {YYYY-MM-DD} ({代號} as {Agent}): {更新摘要}`
  - **回覆留言開頭/結尾**：`### {代號} as {Agent} response` / `Author: {代號} as {Agent}`

### 6. 整合 Reviewer 測試代碼義務 (Integrating Reviewer Test Snippets)
- **原則**：當 Reviewer 指出 CI 尚未涵蓋的 Blocking 問題並提供對應測試代碼時，Author/Maintainer 應積極採納。
- **作法**：
  1. 將該測試代碼實質加入專案單元測試（如 `tests/` 或 `frontend/src/.../*.test.ts`）。
  2. 在本地重現問題、落實邏輯修復，並確認包含該測試在內的所有檢查 100% 通過（紅燈轉綠燈）。
  3. 於下次 Commit 前納入該測試檔案，並在回覆與 PR Body Changelog 中明確記載。

---

## PR Body 標準結構範本

```markdown
### Summary of Changes
簡述此 PR 解決的問題、背景與核心變更目標。

### Key Modifications
- **[模組/組件名稱]**：條列具體修改重點（避免流水帳，強調設計決策與架構影響）。
- **[檔案/工具變更]**：說明新增或更新的模組。

### Pre-Commit & Local Verification
- **Python Static & Formatting:** `ruff check .` (pass), `ruff format --check .` (pass)
- **Backend Tests:** `pytest tests/` (X passed, 0 failed)
- **Frontend Tests:** `vitest` (Y tests passed, 0 failed)
- **Frontend Build:** `pnpm build` (pass, assets verified)

### Living Changelog & Review Iterations
- 2026-08-18 (Gemini as Antigravity): Initial PR created.
- 2026-08-18 (Gemini as Antigravity): Addressed review findings from Codex (refactored boundary checks).

### Related Issues / References
- Closes #123 (或關聯 issue / task)

---
Author / Maintainer: {代號} as {Agent}
```

---

## 與 Reviewer 互動與回覆規範

當收到 Reviewer（如 Codex, Jules, 人類）提出的 Top-level Review 或 Inline Comments 時：

### 1. 結構化回覆格式
回覆時應條列式對應 Reviewer 的 Findings，保持客觀與技術嚴謹：

```markdown
### {代號} as {Agent} response — Review findings addressed.

針對審查意見之處置說明：

- **[Fixed in commit abc1234] `{path/to/file:line}`**:
  已依建議加入除數為 0 之防護邏輯，並於單元測試補足邊界測試。
- **[Test Code Integrated in commit abc1234] `{path/to/test_file.py}`**:
  已將 Reviewer 提供的邊界測試案例整合入測試套裝中，並於本地重現驗證修正後全數 Pass。
- **[Clarification / Technical Rationale] `{path/to/file:line}`**:
  針對此處架構設計，因考量 60Hz 遙測高頻循環不得有任何同步阻塞 I/O，故採用快取機制而非每次重讀。詳細物理推導如附。
- **[Suggestion Applied] `{path/to/file:line}`**:
  已套用 Reviewer 的 Code Suggestion。

**Latest Verification Status:**
- `pytest tests/`: X passed (含新增之 Reviewer 測試案例)
- `vitest`: Y passed
- All pre-commit checks pass locally.

Author: {代號} as {Agent}
```

### 2. 回覆原生 GitHub Inline Review Thread
若需要回覆特定 Inline Review Thread，使用 GitHub REST API 端點：
`POST /repos/{owner}/{repo}/pulls/{pull_number}/comments/{comment_id}/replies`
或透過專案輔助工具 `manage_pr_author.py --reply-thread`。

---

## 輔助工具 `manage_pr_author.py`

專案提供 `.agents/skills/pr-author-maintainer/scripts/manage_pr_author.py`，支援自動化檢查與維護：

```powershell
# 1. 產生標準 PR Body 範本草稿
uv run --no-project --python .venv\Scripts\python.exe .agents/skills/pr-author-maintainer/scripts/manage_pr_author.py --generate-template --identity "Gemini as Antigravity"

# 2. 驗證 PR Body 檔案格式 (檢查必填章節、身分標記、攔截自我斷言 merge)
uv run --no-project --python .venv\Scripts\python.exe .agents/skills/pr-author-maintainer/scripts/manage_pr_author.py --validate-body scratch/pr_body.md

# 3. 同步更新 GitHub PR Body
uv run --no-project --python .venv\Scripts\python.exe .agents/skills/pr-author-maintainer/scripts/manage_pr_author.py --pr <number> --update-body scratch/pr_body.md

# 4. 回覆 Review 討論串
uv run --no-project --python .venv\Scripts\python.exe .agents/skills/pr-author-maintainer/scripts/manage_pr_author.py --pr <number> --reply-thread <comment_id> --body-file scratch/reply.md --identity "Gemini as Antigravity"
```

---

## 相關參考文件
- 詳細工作流與進階範例請參閱：[pr_author_workflow_guide.md](references/pr_author_workflow_guide.md)
