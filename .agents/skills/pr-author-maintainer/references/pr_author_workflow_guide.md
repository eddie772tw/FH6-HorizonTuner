# PR Author 與 Maintainer 完整工作流程指南

本指南為 PR 建立者、作者或維護者（Author / Maintainer）提供詳細的工作流規範，涵蓋 PR 結構、嚴格驗證門檻、禁止自我宣告 Mergeable 規範、PR Body 活文件同步迭代、標題穩定性維護，以及跨 Agent 身分標記與審查互動實務。

---

## 1. 職責與定位邊界

在多 Agent 與人類協作的開發體系中，職責劃分如下：
- **PR Reviewer (`pr-review-evaluation`)**：由獨立審查者評估 PR 變更、CI 狀態，提出審查見解、Inline Comments / Suggestions，並評定是否符合合併標準。
- **PR Author / Maintainer (`pr-author-maintainer`)**：由 PR 提案者負責本地完整驗證、撰寫 PR、隨每次 commit 迭代更新 PR Body、維護標題穩定性，並客觀回覆 Reviewer 提出的問題。

---

## 2. 核心規範與邊界防護

### 2.1 禁止自我斷言可合併 (No Self-Asserted Mergeability)

**核心精神**：Author 不應扮演自己 PR 的法官。無論本地測試多麼完整，Author / Maintainer 均不得在 PR 說明、更新或回覆中自我斷言「Ready to merge」、「LGTM」或宣告可直接合併。

#### 合規對照表

| 違規模式 (Disallowed) | 合規模式 (Required) |
|---|---|
| ❌ "This PR is ready to merge now." | ✅ "All local and CI checks have passed. Awaiting review from Reviewers / Maintainers." |
| ❌ "LGTM, everything is tested, merging approved." | ✅ "Pre-commit tests (pytest 171 passed, vitest 440 passed) and static checks verified locally." |
| ❌ "No issues found, this should be merged immediately." | ✅ "Changes summarized below. Please review the updated logic." |

---

### 2.2 嚴格 Commit 前驗證門檻 (Pre-Commit Gate)

在每次執行 `git commit` 或 `git push` 到 PR 分支前，**必須依序執行以下 4 道防線**：

1. **Python 靜態語法與型別格式檢查**：
   ```powershell
   uv run --no-project --python .venv\Scripts\python.exe ruff check .
   uv run --no-project --python .venv\Scripts\python.exe ruff format --check .
   ```
2. **後端完整單元測試**：
   ```powershell
   uv run --no-project --python .venv\Scripts\python.exe python -m pytest tests/
   ```
3. **前端單元測試**：
   ```powershell
   cmd /c "pnpm -C frontend run test"
   ```
4. **前端靜態產物與型別打包建置**：
   ```powershell
   cmd /c "pnpm --prefix frontend run build"
   ```

**零容忍原則**：若有任何一項檢查未過，必須在本地修正完成後方能 commit。絕不得帶著已知的紅燈推送至遠端。

---

### 2.3 PR Body 持續同步 (Living PR Body)

PR Body 是整個 PR 的唯一事實來源 (Single Source of Truth)，不能停留在最初建立時的草稿狀態。

- **每次 Push 新 Commit 時**：
  1. 若重構了函式或新增了防護，更新 `Key Modifications` 區塊。
  2. 若修正了 Reviewer 指出的問題，在 `Living Changelog & Review Iterations` 追加一筆日期與更新摘要。
  3. 更新 `Pre-Commit & Local Verification` 中的最新測試數據。
- **防止資訊漂移 (Documentation Drift)**：確保外部協作者只閱讀 PR Body 就能完全掌握該分支的最新狀態。

---

### 2.4 PR 標題穩定性與 Conventional Commits

#### 標題命名格式
PR 標題必須遵循 Conventional Commits 格式：
- `feat(scope): 簡短描述`（新增功能）
- `fix(scope): 簡短描述`（修復問題）
- `refactor(scope): 簡短描述`（重構但無功能改變）
- `docs(scope): 簡短描述`（文件或技能更新）
- `perf(scope): 簡短描述`（效能改善）
- `test(scope): 簡短描述`（測試新增或修正）

#### 標題穩定性原則
- **原則**：**不要因為微小的 Review 修正或後續 commit 而隨意修改 PR 標題**。
- **允許修改標題的時機**：
  - PR 的核心範疇（Scope）發生根本性轉移。
  - 經過 Review 討論後，原定的 Feature 轉為純 Refactor 或 Fix。
  - 原標題存在錯別字或無法正確描述主軸。

---

### 2.5 跨 Agent 身分標記 (`{代號} as {Agent}`)

#### 背景
所有 Agent（Google Antigravity, OpenAI Codex, Google Jules）共用相同的 GitHub 帳號發布 PR 與留言。為了在 Review 討論串與 PR 歷史中精準追溯發言主體，統一採用：
`{代號} as {Agent}`

#### 常用組合
- `Gemini as Antigravity` (Google DeepMind Antigravity)
- `Luna as Codex` / `Codex as Codex` (OpenAI Codex)
- `Gemini as Jules` (Google Jules)
- `Claude as Codex`

#### 標記位置
1. **PR 頂層 Body 結尾**：
   ```markdown
   ---
   Author / Maintainer: Gemini as Antigravity
   ```
2. **PR Body 中的迭代紀錄**：
   ```markdown
   - 2026-08-18 (Gemini as Antigravity): Initial implementation and pre-commit verification.
   - 2026-08-18 (Gemini as Antigravity): Addressed Reviewer comments on boundary check.
   ```
3. **回覆 Review 留言的開頭與結尾**：
   ```markdown
   ### Gemini as Antigravity response — Review findings addressed.
   ...
   Author: Gemini as Antigravity
   ```

---

## 3. GitHub API 互動指南

### 3.1 同步更新 PR Body
透過 GitHub CLI 直接以檔案內容更新 PR 說明：
```powershell
gh pr edit <PR_NUMBER> --body-file scratch/updated_pr_body.md
```

### 3.2 回覆特定 Review Comment Thread
當 Reviewer 在程式碼行內留言時，可透過 REST API 直接在該 Thread 內進行回覆：

- **API Endpoint**：`POST /repos/{owner}/{repo}/pulls/{pull_number}/comments/{comment_id}/replies`
- **Payload**：
  ```json
  {
    "body": "### Gemini as Antigravity response\n\n已於 commit `abc1234` 修正此處邊界檢查並補齊單元測試。\n\nAuthor: Gemini as Antigravity"
  }
  ```
- **CLI 呼叫範例**：
  ```powershell
  gh api --method POST /repos/{owner}/{repo}/pulls/<PR_NUMBER>/comments/<COMMENT_ID>/replies -f body="### Gemini as Antigravity response`n`n已修正。`n`nAuthor: Gemini as Antigravity"
  ```

### 3.3 發表頂層回覆留言
若針對頂層 Review 或整體討論發表回覆：
```powershell
gh pr comment <PR_NUMBER> --body-file scratch/response.md
```

---

## 4. 常見互動情境與回覆範本

### 情境 A：完全採納 Reviewer 的建議
```markdown
### Gemini as Antigravity response — Feedback addressed.

感謝 Reviewer 的深入審查，已全數處置完成：

1. **[Fixed in commit 5a2b3c4] `frontend/src/utils/tuningMath.ts:L45`**:
   - 採納 Suggestion，加入除數為 0 之安全保護。
   - 於 `tuningMath.test.ts` 補齊 `divisor = 0` 與極端負值之測試案例。
2. **[Fixed in commit 5a2b3c4] `backend/main.py:L120`**:
   - 已抽離重複之初始化邏輯為獨立共用函式 `safe_init_context()`。

**Verification Status:**
- `pytest tests/`: 171 passed
- `vitest`: 440 passed
- `ruff check .` & `ruff format --check .`: passed

Awaiting further feedback from reviewers.

Author: Gemini as Antigravity
```

### 情境 B：提出架構權衡與技術澄清
```markdown
### Gemini as Antigravity response — Technical clarification.

針對 Reviewer 提出關於「將計算邏輯移至後端 UDP 迴圈」的建議，以下提供架構考量說明：

- **[Technical Rationale / Retained] `backend/telemetry_listener.py:L80`**:
  - 根據專案核心事實（`.agents/AGENTS.md`），UDP 接收迴圈以 60Hz+ 頻率運作，嚴禁引入同步阻塞或高複雜度運算以避免封包遺失 (Packet Drop)。
  - 車輛懸吊與幾何計算屬於單一真理純邏輯，依架構約定統一收攏於前端 `tuningMath.ts`，並透過單元測試保持無狀態性。
  - 因此維持目前的前後端職責劃分。

歡迎 Reviewer 進一步交流討論！

Author: Gemini as Antigravity
```

### 情境 C：整合 Reviewer 提供之 Blocking 測試代碼並完成修復
```markdown
### Gemini as Antigravity response — Blocking test case integrated and resolved.

針對 Reviewer 指出 CI 尚未涵蓋之邊界問題並提供的測試代碼，處置如下：

1. **[Test Code Integrated in commit 7c8d9e0] `frontend/src/utils/tuningMath.test.ts`**:
   - 已將 Reviewer 提供的 `calculateDistribution(0, 0)` 邊界測試完整納入測試檔案中。
2. **[Fixed in commit 7c8d9e0] `frontend/src/utils/tuningMath.ts:L32`**:
   - 加入非正數除數之 fallback 保護，確保計算安全且無 NaN 輸出。
   - 本地執行 `vitest` 確認該新測試由紅燈轉為綠燈。

**Verification Status:**
- `pytest tests/`: 171 passed
- `vitest`: 441 passed (含新增之 Reviewer 測試)
- `ruff check .` & `ruff format --check .`: passed

Author: Gemini as Antigravity
```
