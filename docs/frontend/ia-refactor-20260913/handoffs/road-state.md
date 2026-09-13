# RoadValidationController handoff

Task: W1 Road validation session-draft prerequisite
Status: handoff
Owner: Road state lane
Worktree / Branch: `D:/FH6-frontend-ia-20260913/road-state` / `codex/frontend-ia-road-state-20260914`
Base SHA: `5891d21bca35161836d84c51d1b6e9c279ec4709`
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
