# Google Jules 手動委派調用指南 (Manual Invocation Guide)

## 前置授權門檻 (Manual Invocation Gate)

手動呼叫 Jules 前必須同時滿足：

1. 使用者明確授權把本次工作委派給 Jules。
2. 存在可驗證的 connector/API client、`JULES_API_KEY` 與已綁定的 GitHub repository。
3. 本地 Agent 已檢查 `git status --short --branch`、目前 branch、baseline SHA、dirty worktree 與其他 Agent ownership。
4. 已透過 Session／PR 清單檢查相同 repository、target path、semantic task key 是否已有 active 工作。
5. Handoff prompt 完整包含 `FH6-JULES-INTENT v2`、`Source: manual`、Goal、In scope、Out of scope、Baseline SHA、Owned files、Forbidden files、Acceptance tests、Expected branch/PR 與 Risk and rollback。

---

## API Session 參數合約

建立 API Session 時：

- 必須設定 `requirePlanApproval: true`；API 預設會自動批准 plan，不能只等待事後出現 `AWAITING_PLAN_APPROVAL`。
- 只有在驗收條件要求 Jules 產生 PR 時，才使用 `automationMode: AUTO_CREATE_PR`。
- 若已有相同 semantic task、重疊檔案或其他 Agent ownership，停止呼叫並回報，不得以新 Session 覆蓋既有工作。
- Session ID、task key、baseline 與預期 scope 必須保留在本地 handoff；不得保存完整 prompt 或 API key。

---

## Handoff Prompt 結構範本 (`FH6-JULES-INTENT v2`)

```text
Intent: FH6-JULES-INTENT v2
Source: manual
TaskKey: <semantic-key>
Goal: <目標>
InScope: <允許修改路徑>
OutOfScope: <禁止碰觸路徑>
BaselineSHA: <sha>
OwnedFiles: <檔案清單>
ForbiddenFiles: <檔案清單>
AcceptanceTests: <驗收指令>
ExpectedBranchOrPR: <branch-name>
RiskAndRollback: <復原方案>
```
