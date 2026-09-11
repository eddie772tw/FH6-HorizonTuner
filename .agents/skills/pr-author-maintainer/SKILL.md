---
name: pr-author-maintainer
description: 以 PR 作者或維護者身分建立 PR、同步 PR 內文、回覆 Review 意見與維護標題狀態。適用於提交新 PR、依審查意見迭代代碼或回覆討論串時。
---

# PR Author 與 Maintainer 開發維護規範 (PR Author & Maintainer Workflow)

本技能提供以 PR 作者或維護者（Author / Maintainer）身分進行 PR 建立、內文同步、審查回覆與標題維護之核心規範與工具鏈。

## 四大核心契約 (Core Invariants)

1. **禁止自我斷言可合併 (No Self-Asserted Mergeability)**：
   - 絕不在 PR 內文或留言中自我宣稱「Ready to merge」、「LGTM」或自行下定論；客觀陳述變更與驗證數據，將審核結論交由 Reviewer。
2. **嚴格 Commit 前驗證門檻 (Strict Pre-Commit Gate)**：
   - Commit 或 push 前必須 100% 通過本地檢查：
     - 後端檢查：`uv run --no-project --python .venv\Scripts\python.exe ruff check .` 與 `pytest tests/`
     - 前端檢查：`cmd /c "pnpm -C frontend run test"` 與 `cmd /c "pnpm -C frontend run build"`
3. **PR Body 活文件原則 (Living PR Body / Continuous Sync)**：
   - 隨著多次 commit 或重構，必須即時更新頂層 PR Body，杜絕資訊偏差。
4. **雙軌審查與 Inline Comments 防漏盤點 (Anti-Omission Review Gate)**：
   - 嚴禁僅看頂層 PR Body；必須同時盤點行內評論：`manage_pr_author.py --pr <number> --list-comments`，逐條核對處置。
5. **跨 Agent 身分標記**：
   - PR Body 結尾標註 `Author / Maintainer: {代號} as {Agent}`；回覆開頭標註 `### {代號} as {Agent} response`。

---

## 工作流程路由器 (Author & Maintainer SOP)

### 流程 1：建立新 PR
1. 完成功能開發並確認 Pre-Commit Gate 全數通過。
2. 執行 `manage_pr_author.py --generate-template --identity "{代號} as {Agent}"` 產生 PR Body 草稿。
3. 遵循 Conventional Commits 格式設定 PR 標題並建立 PR。PR 範本規格詳見 [references/pr_templates_and_replies.md](references/pr_templates_and_replies.md)。

### 流程 2：PR 內文持續同步
1. 依據最新變更編輯本地 PR Body。
2. 驗證格式：`manage_pr_author.py --validate-body scratch/pr_body.md`（檢查必填章節、身分標記、攔截自我斷言）。
3. 同步至 GitHub：`manage_pr_author.py --pr <number> --update-body scratch/pr_body.md`。

### 流程 3：回覆 Reviewer 意見與整合測試
1. 執行雙軌盤點：獲取頂層意見與行內評論清單。
2. 若 Reviewer 提出 Blocking 意見並附帶測試代碼，依義務整合入專案測試並確認修復。
3. 依結構化回覆格式發表說明或回覆討論串：`manage_pr_author.py --pr <number> --reply-thread <comment_id> --body-file scratch/reply.md`。詳細格式參閱 [references/pr_templates_and_replies.md](references/pr_templates_and_replies.md)。

### 流程 4：標題與中繼資料維護
1. 唯有 PR 核心範圍或性質發生重大轉變時才修正標題，避免頻繁變更干擾討論脈絡。

---

## 搭配資料 (References)
- [pr_templates_and_replies.md](references/pr_templates_and_replies.md)：PR Body 標準 Markdown 結構範本、Reviewer 結構化回覆格式與 REST API 端點指引。
- [pr_author_workflow_guide.md](references/pr_author_workflow_guide.md)：進階工作流、雙軌檢視詳細案例與工具腳本完整參數。
