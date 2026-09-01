---
name: jules_coding
description: 當使用者明確授權且 Jules connector/API client 可用時，委派高風險重構、大型相依升級、資源密集測試或需要遠端工作區的任務；也用於辨識與驗收遠端排程 Jules 產出的 Session 與 PR。
---

# Google Jules 委派與產出收件流程

## Capability Boundary

此 Skill 分成兩條來源不同、權限不同的流程：

- **Manual invocation**：由本地 Agent 依使用者明確授權建立 Jules API Session。
- **Scheduled-output intake**：由 Jules 遠端管理網站的排程工作自行建立 Session／PR，本地 Agent 只讀取、分類、驗收與回報。

Jules REST API 的能力必須逐項驗證，不得由 API key 的存在推論所有權限：

| Capability | Default boundary |
|---|---|
| `session_create` / `session_list` / `session_get` | 只有 connector、API key、GitHub repository binding 都可驗證時才可使用 |
| `session_delete` / `session_send_message` / `session_approve_plan` | 只作用於明確指定的 Session，且需符合該任務授權 |
| `schedule_read` / `schedule_manage` | 預設 `unavailable`；沒有正式 endpoint 或 connector 時不得猜測、呼叫或宣稱可用 |

刪除 Session 不等於暫停、編輯或刪除 Scheduled Task。Jules 網站仍是排程定義與生命週期的權威來源；GitHub PR 是排程執行後的下游產物。

## Manual Invocation Gate

手動呼叫 Jules 前必須同時滿足：

1. 使用者明確授權把本次工作委派給 Jules。
2. 存在可驗證的 connector/API client、`JULES_API_KEY` 與已綁定的 GitHub repository。
3. 本地 Agent 已檢查 `git status --short --branch`、目前 branch、baseline SHA、dirty worktree 與其他 Agent ownership。
4. 已透過 Session／PR 清單檢查相同 repository、target path、semantic task key 是否已有 active 工作。
5. Handoff prompt 完整包含 `FH6-JULES-INTENT v2`、`Source: manual`、Goal、In scope、Out of scope、Baseline SHA、Owned files、Forbidden files、Acceptance tests、Expected branch/PR 與 Risk and rollback。

建立 API Session 時：

- 必須設定 `requirePlanApproval: true`；API 預設會自動批准 plan，不能只等待事後出現 `AWAITING_PLAN_APPROVAL`。
- 只有在驗收條件要求 Jules 產生 PR 時，才使用 `automationMode: AUTO_CREATE_PR`。
- 若已有相同 semantic task、重疊檔案或其他 Agent ownership，停止呼叫並回報，不得以新 Session 覆蓋既有工作。
- Session ID、task key、baseline 與預期 scope 必須保留在本地 handoff；不得保存完整 prompt 或 API key。

## Scheduled Session Intake

排程產出不視為手動授權，也不由本 Skill 嘗試重新觸發。若可使用 Jules API，收件時讀取：

- Session 的完整 `prompt`、`title`、`sourceContext`、`createTime` 與 outputs。
- outputs 中的 PR URL／title／description。
- GitHub PR 的 task URL、bot commit、head branch、changed paths、CI head SHA 與建立時間。

以開頭 prompt 與下列已知 persona signature 進行來源分類：

| Persona signature | Canonical raw log | 預設領域 |
|---|---|---|
| `Bolt` | `.jules/bolt.md` | 效能、60Hz、GC、WebSocket |
| `Palette`（`pallete` 正規化為 `palette`） | `.jules/palette.md` | UI、a11y、互動 |
| `Narrator` | `.jules/narrator.md` | i18n、release、build |
| `Sentinel` | `.jules/sentinel.md` | Security、漏洞修復 |

分類結果只能使用 `manual`、`scheduled_likely` 或 `unknown`：

- 明確含 `Source: manual` 且由 Skill 建立 → `manual / confirmed`。
- 命中已知 persona，且有 Jules task 或自動 PR 證據 → `scheduled_likely / likely`。
- 若 connector／UI 明確回傳 scheduled source metadata → `scheduled_likely / confirmed`，但不因此取得排程管理能力。
- 缺少 signature、缺少 task/PR 證據或來源互相矛盾 → `unknown / unknown`。

Persona 是可追溯的推論，不是正式 schedule flag。`unknown` 不得被當成手動工作，也不得自動合併。

## Session Provenance Contract

分類結果遵循 [session_provenance.md](references/session_provenance.md)：

```text
source: manual | scheduled_likely | unknown
confidence: confirmed | likely | unknown
persona: bolt | palette | narrator | sentinel | null
session_id: <optional>
task_id: <optional>
pr_number: <optional>
matched_signature: <optional>
stop_reason: <optional>
```

只保存識別碼、persona、命中的 signature 與 stop reason；不得將完整遠端 prompt 寫入 Journal、PR 或測試輸出。

## Shared Adoption Gate

無論來源為 `manual` 或 `scheduled_likely`，在採用或合併前都必須：

1. 取得實際 diff，確認 changed paths 完全落在允許 scope。
2. 確認不是 empty diff、僅分析 PR、未解決問題 PR 或未提交實作。
3. 重新執行必要測試，記錄精確 command、結果與 head SHA；Jules 自述不算本地證據。
4. 效能改善必須提供可重現 benchmark command／artifact；不得只採信「60x faster」或「0 allocation」等敘述。
5. 檢查依賴、安全性、回歸風險、CI 是否確實針對目前 head SHA 執行，以及 `git diff --check`。
6. 檢查大小寫不敏感檔案系統下的 duplicate path；`.Jules` 與 `.jules` collision 直接阻擋。
7. `.jules/**` 預設不屬於功能 PR scope。若排程產出自動追加 raw log，先視為額外變更處理；只能保留 canonical lowercase path、append-only 內容，並避免多個 PR 同時寫入同一 log。
8. 未經本地驗證，不得合併、推送、覆蓋 dirty worktree 或把結論升格到 Journal／AGENTS／其他 Skill。

PR review 與 merge 流程必須銜接 `cross-agent-collaboration`、`pr-review-evaluation` 與 `pr-author-maintainer`；本 Skill 不取代它們的 ownership、inline review、PR Body 與身份標記規則。

## Failure and Stop Rules

使用固定 stop reason，不用模糊的「已處理」：

- `duplicate_task`
- `overlapping_scope`
- `empty_diff`
- `out_of_scope`
- `not_solved`
- `case_collision`
- `missing_test_evidence`
- `unrequested_jules_log`
- `test_failure`
- `stale_ci`
- `unknown_provenance`
- `capability_unavailable`

排程 PR 發生問題時，停止採用並回報；不得自動建立相同的手動 Session、不得把刪除 Session 當成排程控制，也不得猜測遠端排程的 pause/edit/delete API。

## Status and Handoff

狀態必須能被另一個 Agent 讀取：

```text
Task: <task name>
Status: proposed | active | awaiting_plan_approval | scheduled_intake | local_review | blocked | superseded | done
Source: manual | scheduled_likely | unknown
Owner: <Agent / human>
Branch: <branch>
Baseline SHA: <sha>
Scope: <owned paths and task key>
Changed: <observed paths>
Pending: <remaining work>
Blocked by: <reason or None>
Verification: <commands and results>
Next action: <first next action>
Last updated: <YYYY-MM-DD>
```

## 日誌邊界

- `.jules/*.md` 是 Jules 原始英文工作日誌，保留英文與原始紀錄，不翻譯、不重寫。
- `.agents/Journal.md` 只收錄本地驗證後的結論，並標記來源、日期、驗證方式與 `proposed`、`adopted` 或 `superseded` 狀態。
- 排程 persona 的命中只能先記錄為 `proposed`／`likely`；完成本地驗證後才可升格。
- 只有重複且已驗證的結論，才可升格到 `AGENTS.md`、rules 或其他 Skill。
