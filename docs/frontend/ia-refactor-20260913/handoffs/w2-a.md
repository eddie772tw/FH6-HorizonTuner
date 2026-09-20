# W2-A handoff — Sessions foundation and Analysis split

## Delivery identity

- Lane: A (Luna)
- Worktree: `D:\FH6-frontend-ia-20260919\w2-a`
- Branch: `codex/frontend-ia-w2-a-20260919`
- Base SHA: `ee0f7bb9f5e607a682a5136bb0785deb580e51fb`
- Contract SHA: not published in the preparation packet; no shared contract was changed.
- Wave 2 base SHA: not published in the preparation packet; this lane used the coordinator-issued exact BASE_SHA above.
- Head SHA: `b5d74019e09a679696f8a7f941b71648df4a5710` (branch tip after the final handoff metadata commit).

## Changed files and ownership

Existing A files changed:

- `frontend/src/features/analysis/AnalysisView.tsx`
- `frontend/src/features/sessions/SessionsStateProvider.tsx`
- `frontend/src/features/sessions/SessionsWorkspace.tsx`

Proposed A files added:

- `frontend/src/features/analysis/AnalysisSessionToolbar.tsx`
- `frontend/src/features/analysis/AnalysisSessionVisuals.tsx`
- `frontend/src/features/sessions/validationReviewSlot.ts`

No Drag, Telemetry, shared context, App/Shell, services, hooks, backend, Road, Tune, or Coordinator-owned preflight/race file was changed. No shared contract file was changed.

Exact A allowed paths for this stage:

- Existing: `frontend/src/features/analysis/AnalysisView.tsx`
- Existing: `frontend/src/features/analysis/LapDeltaCanvas.tsx`
- Existing: `frontend/src/features/analysis/SessionHealthDebrief.tsx`
- Existing: `frontend/src/features/analysis/TrackMapCanvas.tsx`
- Existing: `frontend/src/features/telemetry/TelemetryView.tsx`
- Existing: `frontend/src/features/drag_test/DragTestView.tsx`
- Existing: `frontend/src/features/live/LiveWorkspace.tsx`
- Existing: `frontend/src/features/sessions/SessionsWorkspace.tsx`
- Existing: `frontend/src/features/sessions/SessionsStateProvider.tsx`
- Existing: `frontend/src/features/sessions/sessionsIo.ts`
- Existing: `frontend/src/features/sessions/sessionsIo.test.ts`
- Existing: `frontend/src/features/sessions/sessionSelection.ts`
- Existing: `frontend/src/features/sessions/sessionSelection.test.ts`
- Proposed new: `frontend/src/features/analysis/AnalysisSessionToolbar.tsx`
- Proposed new: `frontend/src/features/analysis/AnalysisSessionVisuals.tsx`
- Proposed new: `frontend/src/features/drag_test/dragTestTypes.ts`
- Proposed new: `frontend/src/features/drag_test/DragTestControls.tsx`
- Proposed new: `frontend/src/features/drag_test/DragTestComparison.tsx`
- Proposed new: `frontend/src/features/drag_test/DragTestResults.tsx`
- Proposed new: `frontend/src/features/sessions/validationReviewSlot.ts`

Coordinator-retained files include `frontend/src/app/AppShell.tsx`, `frontend/src/context/TelemetryRecorderContext.tsx`, `frontend/src/features/sessions/SessionsRuntime.tsx`, all `race*` and `sessionIntentPreparation*` files, and the shared contract/preflight files.

## A foundation behavior

- `SessionsStateProvider` now invalidates the primary selection gate before recording a Road workflow id, so an older analysis read cannot win after a Road intent.
- Current/saved/imported analysis selections and the final analysis-intent apply clear `roadWorkflowId`, preventing a stale Road identity from following an analysis surface.
- `validationReviewSlot.ts` exports `ValidationReviewSlot`, `ValidationReviewSlotRenderer`, and `ValidationReviewSlotHostProps`. `SessionsWorkspace` accepts the optional slot and renders it only when a Coordinator/D renderer is supplied; this lane does not invent a D component.
- `AnalysisView` remains the only Recorder/Sessions/IO consumer. Toolbar/actions/notification presentation moved to `AnalysisSessionToolbar`; health/track/lap presentation moved to `AnalysisSessionVisuals`. Primary-load, supporting-read, compare-read, refresh, MoTeC, import/delete, and existing browser-facing controls remain owned by `AnalysisView`.

## Evidence and limits

- Source boundary evidence: `SessionsStateProvider.tsx:84-102` owns the generation invalidation and ordinary selection transition; `SessionsStateProvider.tsx:206-230` owns Road/analysis intent identity; `SessionsWorkspace.tsx:7-14` is the optional review-slot host; `AnalysisView.tsx:13-50` retains Recorder/Sessions/IO consumers and `AnalysisView.tsx:152-195` delegates only presentation.
- Candidate source was checked at exact `ee0f7bb9f5e607a682a5136bb0785deb580e51fb`; no drift-based bulk copy was used.
- Browser evidence: browser-only smoke completed against `http://127.0.0.1:1423/` from the Vite server for this branch. After dismissing the local Data Out guide and clicking the visible `Sessions` workspace button, the page rendered `Post-Race Debrief & MoTeC Bridge`, `Status: Idle (0 samples)`, the `Select Session` control, `Open in MoTeC`, `MoTeC CSV Export`, `MoTeC CSV Import`, `Workspace Template`, and the empty-state text `No data recorded. Start racing to record telemetry.` The global state also visibly reported `Backend disconnected`, so no session data or backend-backed review was claimed. Native/Tauri was not started.
- Native/Tauri evidence: not run in this lane.
- No product/game or cross-device evidence is claimed.

## Validation

- `cmd /c "pnpm install --frozen-lockfile"` — passed in the lane worktree.
- `cmd /c "pnpm -C frontend run test"` — passed: 120 files, 859 tests.
- `cmd /c "pnpm -C frontend run build"` — passed: TypeScript and Vite production build.
- `git diff --check` — passed.
- Test/build SHA: `048a8fd` (implementation commit; subsequent branch commits are documentation-only handoff updates).

## A to D boundary

- D may consume `ValidationReviewSlot` and provide the renderer at the Coordinator boundary after the shared contract/base SHAs are published.
- D must supply the Road review component and retain Road workflow lifecycle; this lane only carries the typed slot and clears stale analysis/Road identity at the Sessions boundary.
- Coordinator-owned `SessionsRuntime`, `race*`, and `sessionIntentPreparation*` files remain untouched. Any change to shared refresh generation/abort behavior requires a separate Coordinator request.
