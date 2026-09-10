---
name: jules_coding
description: 當使用者明確授權且 Jules connector/API client 可用時，委派高風險重構、大型相依升級、資源密集測試或需要遠端工作區的任務；也用於辨識與驗收遠端排程 Jules 產出的 Session 與 PR。
---

# Google Jules 委派與產出收件流程

本技能提供 Google Jules 雙軌工作流程路由器（手動委派 vs 排程收件）與驗收護欄。

## 能力邊界 (Capability Boundary)

Jules REST API 的能力必須逐項驗證，不得由 API key 的存在推論所有權限：
- `session_create` / `session_list` / `session_get`：僅在 connector、API key 與 GitHub binding 均可驗證時可用。
- `session_delete` / `session_send_message` / `session_approve_plan`：僅作用於明確指定的授權 Session。
- `schedule_read` / `schedule_manage`：預設 `unavailable`；沒有正式 endpoint 時不得猜測或宣稱可用。刪除 Session 不等於管理排程。

---

## 雙軌工作流路由器 (Dual-Track Workflow)

### 軌道 A：手動 Session 委派 (Manual Invocation)
當面臨高風險重構、大型相依升級或需獨立遠端工作區時，本地 Agent 依使用者明確授權發起委派：
1. **檢查授權門檻**：必須具備使用者授權、`JULES_API_KEY` 與既有 worktree 邊界檢查。
2. **組織 Prompt**：完整定義 `FH6-JULES-INTENT v2`、Goal、In-scope、Out-of-scope 與驗收指令。
3. **API 參數配置**：必須設定 `requirePlanApproval: true`。
4. 詳細參數與範本請參閱 [references/manual_invocation_guide.md](references/manual_invocation_guide.md)。

### 軌道 B：遠端排程產出收件 (Scheduled Intake)
當遠端 Jules 網站按排程自行建立 Session 或提交 PR 時，本地 Agent 進行純收件審查：
1. **讀取與分類**：檢視 prompt、persona signature（Bolt, Palette, Narrator, Sentinel）並標註 provenance。
2. **分類合約遵循**：依據 [references/session_provenance.md](references/session_provenance.md) 標記來源與置信度，排程結果不得假造為手動授權。
3. 詳細辨識規則請參閱 [references/scheduled_intake_guide.md](references/scheduled_intake_guide.md)。

---

## 共用採納門檻 (Shared Adoption Gate)

無論來自手動或排程產出，在本地採用或合併前均必須滿足：
1. **Diff 範圍檢驗**：取得實際 diff，確認 changed paths 完全落在允許 scope 內。
2. **本地驗證義務**：重新於本地執行對應測試並記錄精確結果；Jules 自述之測試結果不得作為本地證據。
3. **大小寫路徑碰撞檢查**：執行 `python scripts/check_repo_path_case.py`，嚴防 `.Jules` 與 `.jules` 衝突。
4. **日誌邊界**：`.jules/*.md` 保留原始英文工作日誌，不翻譯、不重寫；本地驗證後的結論才同步至 `.agents/Journal.md`。
5. **固定 Stop Reasons**：遇問題時停止並記錄固定原因（如 `duplicate_task`, `out_of_scope`, `missing_test_evidence`, `test_failure`）。

PR review 與 merge 流程須銜接 `cross-agent-collaboration`、`pr-review-evaluation` 與 `pr-author-maintainer`。

---

## 搭配資料 (References)
- [manual_invocation_guide.md](references/manual_invocation_guide.md)：手動委派門檻、API Session 參數合約與 Handoff Prompt 範本。
- [scheduled_intake_guide.md](references/scheduled_intake_guide.md)：排程收件來源辨識、Persona Signature 對照表與驗證腳本。
- [session_provenance.md](references/session_provenance.md)：Session Provenance Contract 來源分類中繼資料規格。
