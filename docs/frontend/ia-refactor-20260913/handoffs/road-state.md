# RoadValidationController handoff

Task: W1 Road validation session-draft prerequisite
Status: handoff
Owner: Coordinator（原 Road lane 已交接）
Worktree / Branch: `D:/FH6-frontend-ia-20260913/road-reviewed` / `codex/frontend-ia-road-review-20260914`
Base SHA: `fc7960829ebecbf5039d03a39a3fcdcae9d8b6c9`
Write ownership: `frontend/src/features/road/**` and this handoff only

## Changed

- Added `RoadValidationProvider`, `RoadValidationBoundary`, and `useRoadValidation` in `frontend/src/features/road/RoadValidationController.tsx`.
- Added the pure session-state and late-operation guard module plus its Vitest coverage in `roadValidationState.ts` and `roadValidationState.test.ts`.
- Moved Road Prepare’s unsubmitted event fields, Road Candidate’s actual form values, Road Observation’s finish time/clean confirmation, workflow step/setup/choice state, and result/comparison selection from page-local state into the controller.
- Changed the Road page adapter to use controller-owned workflow selection while keeping the existing `road-selected-workflow` key.
- Kept Road polling page-owned. Its cleanup stops the one-second `/api/road/live` timer when the page unmounts; re-entering fetches live state again and reconciles an active backend run.
- Added mounted and generation checks around page reads and mutation follow-up reads. A pending mutation remains visible across a workflow/page change, settles for the new page to refresh its documents, and cannot apply its old callback after the selection revision changes.
- Reconciliation now changes Drive/Results only on a backend active-run transition. Loading an old summary on a new page mount no longer overwrites a controller-held Prepare or Drive step.
- Audited remaining Road inputs: RoadCompare’s baseline/candidate/repeat selections are controller-owned; RoadReportCard decisions are immediate mutations and have no draft input; the export error is a transient status, not user input.

## Public contract for Coordinator

```ts
import { RoadValidationProvider } from './features/road/RoadValidationController';
```

For Full only, put the provider below the existing `AppProviders` and above the workspace switch. It takes no props. `RoadWorkflowView` includes `RoadValidationBoundary`, so the current application remains usable until that wrapper is wired; once the Full provider exists, the boundary reuses it and does not create a second controller.

The public hook is `useRoadValidation()`. Its stable actions are `selectWorkflow`, `markWorkflowCreated`, `setStep`, `setSetupId`, `setChoiceSaved`, `setPrepareDraft`, `setCandidateDraft`, `setFinishDraft`, `setResultSelection`, `setRunConfirmation`, `reconcileLive`, `beginOperation`, and `finishOperation`.

## Field lifetime

| Field | Owner and lifetime | Invalidation / authority |
| --- | --- | --- |
| `selectedWorkflowId` | Controller; the only persisted field, using existing `road-selected-workflow` | Backend workflow list can clear a missing ID. |
| `prepareDraft` | Controller app-session memory | Cleared after a workflow is created; not restored after restart. |
| `step`, `setupId`, `choiceSaved` | Controller app-session memory | New workflow selection resets setup/choice; a returned active run makes its selected workflow enter Drive. |
| Candidate draft and result/comparison selection | Controller app-session memory | Candidate draft clears after B is saved or workflow changes; not restored after restart. |
| Finish-result time and clean confirmation | Controller app-session memory | Keyed by summary and persisted finish IDs, so a different run or a newly saved finish cannot reuse an old form value. |
| Confirmed / unchanged checkboxes | Controller app-session memory, keyed by workflow, setup, backend active-run ID, current input snapshot, and live vehicle identity | Any key change reads as unconfirmed; active-run changes clear the stored confirmation. |
| active run | Backend `/api/road/live` is authoritative | Page polling sends observations to the controller; navigation never sends start or stop. |
| operation status | Controller app-session memory | Pending status disables all Road mutations after a return; terminal success makes the mounted Road page refresh documents. A selection revision suppresses old page callbacks while still settling the backend operation. |

## Preserved behaviour and boundaries

- `recommendation={null}` keeps the historical-review presentation, including existing comparison decision actions and draft/revisit flow.
- Start, stop, and recording remain the existing Road page actions. This lane does not create a second controller in Sessions and does not implement the W3 review export.
- No backend endpoint, API schema, locale, tuning formula, App/Shell/provider wiring, context, or persistence schema/key was changed.

## Verification

| Command | Result |
| --- | --- |
| `cmd /c "pnpm install --frozen-lockfile"` | passed |
| Baseline `cmd /c "pnpm -C frontend run test"` | 108 files, 719 tests passed |
| `cmd /c "pnpm -C frontend exec vitest run src/features/road/roadValidationState.test.ts"` | 1 file, 9 tests passed |
| `cmd /c "pnpm -C frontend run test"` | 109 files, 728 tests passed |
| `cmd /c "pnpm -C frontend run build"` | passed; Full and Lite Vite entries compiled |
| `git diff --check` | passed |

Native Full/Lite navigation, a live `/api/road` backend, and FH6 game evidence are not run in this lane. The tests prove pure session identity and async ordering rules; they do not prove real telemetry, game settings, or recording behaviour.

Next action: Coordinator wires `RoadValidationProvider` at the Full app boundary, then verifies Tune → another workspace → Tune with an unsubmitted Prepare form, a Candidate form draft, and an active backend run.

Last updated: 2026-09-14

## Coordinator 複查與 P1 基底整合

原 Road 分支保留。將 `f3cbdb7`、`2c6cc0c` 依序移入上述 P1 parent；range-diff 顯示兩提交內容一致，得到 `6c22a38`、`854c455`。以下是其後的必要修正：

- 切頁不再吞掉已確認的 create/save 結果：後續動作只更新長駐 controller，並以使用者選擇/編輯 revision 避免晚結果覆蓋新操作。
- setup A→B→A、已觀察到的輸入/車輛 identity 變動後再回原值，不會復用舊 confirmed/unchanged。
- 目前頁會顯示跨頁 pending/failed 結果；失败不回到看似已保存的預設提示。
- poll 與 mutation 後 live read 共用 `createRoadLiveReader` 排序，舊成功/失敗不回退新 active run；卸載與 StrictMode 新 lifetime 都阻止舊回應。
- mutation 後的 page refresh/error 在 await 後重新核對 mount、mutation 與 selection；backend 寫入仍可獨立完成。

此候選驗證：111 files / 738 tests、Full/Lite build、diff check 全部通過；新增兩項 identity 往返情境與三項實際 async reader 情境。真正 provider mount、active run 跨頁、native/game 證據仍未執行，不以 pure tests 代替。

Locale requests（由 root shared owner 處理）：`Saving changes…`、`The last change could not be saved. Review the current values and retry.`。
