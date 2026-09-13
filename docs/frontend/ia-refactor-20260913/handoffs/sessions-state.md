# W1 Live / Sessions State Handoff

Task: W1/P2 minimal Live and Sessions state foundation
Status: done
Owner: Codex sessions-state lane
Branch: `codex/frontend-ia-sessions-state-20260914`
Base: `fc7960829ebecbf5039d03a39a3fcdcae9d8b6c9` (`fc79608`)
Scope: `frontend/src/features/{live,sessions,analysis,telemetry,drag_test}/**` and this handoff
Changed: see the paths listed below, including the post-review async safety repair
Pending: Coordinator wiring, controlled UI evidence, W3 Road review slot, G2/G5 acceptance
Blocked by: None for this foundation; root/shared-file ownership is intentionally excluded
Last updated: 2026-09-14

## Public exports for Coordinator wiring

The components intentionally use structural props and do not import `AppShell`:

```ts
// features/live/LiveWorkspace.tsx
export interface LiveWorkspaceProps {
  readonly variant: AppVariant;
  readonly onOpenSessions: (intent?: SessionIntent) => void;
}
export const LiveWorkspace: React.FC<LiveWorkspaceProps>;

// features/sessions/SessionsWorkspace.tsx
export interface SessionRequest {
  readonly sequence: number;
  readonly target: SessionIntent;
}
export interface SessionsWorkspaceProps {
  readonly sessionRequest: SessionRequest | null;
  readonly onOpenTune: () => void;
}
export const SessionsWorkspace: React.FC<SessionsWorkspaceProps>;

// features/sessions/SessionsRuntime.tsx
export interface SessionsRuntimeProps {
  readonly activeWorkspace: WorkspaceId;
  readonly onOpenSessions: (intent?: SessionIntent) => void;
}
export const SessionsRuntime: React.FC<SessionsRuntimeProps>;

// features/sessions/SessionsStateProvider.tsx
export const SessionsStateProvider: React.FC<{ children: React.ReactNode }>;
export function useSessionsState(): SessionsStateContextValue;
```

The current `AppShell` contracts are structurally compatible: it supplies `variant`, `onOpenSessions`, `onOpenTune`, and `sessionRequest` to each selected workspace, while `SessionsRuntime` matches its Runtime props exactly.

For Full only, Coordinator should mount `SessionsStateProvider` below the existing `AppProviders` boundary and outside the workspace switch, then register `LiveWorkspace`, `SessionsWorkspace`, and `SessionsRuntime`. Lite must neither mount this provider/runtime nor register Sessions; Lite calls `LiveWorkspace` with `variant="lite"`, which returns only `TelemetryView dashboardOnly`.

`TelemetryView` retains `subTab` and `setSubTab` only as a temporary typing bridge for pre-Shell consumers. It no longer renders Analysis or Drag Test, and root wiring must stop depending on those props for route selection.

## State and selection contract

`SessionsStateProvider` preserves these values for the app lifetime while the Full app remains open:

- `AnalysisSelection`: distinct `current`, `latest { filename }`, `saved { filename }`, and `local` sources.
- `primaryLap`, `compareLap`, and track `metric`.
- imported MoTeC samples in the existing recorder `loadedSession`, allowing the local source to rebuild track/debrief data after Sessions remounts.
- a separate `roadWorkflowId`; it is never interpolated into an analysis filename or endpoint.

Ordinary workspace return keeps the stored selection. An explicit `SessionIntent` changes it. Shell request sequences must be monotonic: a duplicate or lower `sequence` is ignored, so a stale retained `sessionRequest` cannot consume itself again after remount.

Primary selection reads use the feature adapter and `backendFetch`, never the shared recorder's side-effecting `fetchCurrentSessionData` or `loadSavedSession`. `SessionLoadGate` aborts and invalidates an earlier read before a new selection starts; a guard is checked again before `setLoadedSession`. Selecting a remote source clears the prior loaded data immediately, avoiding a saved/local result being labelled as current after a failed read. The current-session refresh runs only while `selection.kind === "current"` and refuses to overlap a primary request.

Every `latest-analysis` intent now reads `/api/analysis/sessions` through `sessionsIo` before selecting, so it cannot use the recorder's mount-time `savedSessions` cache. An explicit validated race filename is reconciled against that same persisted library, then the recorder's list refreshes before selection. The selection keeps the concrete matching filename for its later data read.

`SessionOperationGate` guards delayed source-changing work without aborting the session currently being rendered. MoTeC import and persisted-session delete both use the narrow `sessionsIo` adapter rather than recorder helpers that mutate `loadedSession` before the guard. A newer selection, import, or delete invalidates the older operation. Successful deletes always refresh the library; they select current only if the user has not selected another source while the deletion was pending.

Existing Analysis actions remain in place: session dropdown, primary and compare laps, track metric, debrief/map/delta, MoTeC open/import/export/template, persisted-session delete/reopen, and imported local data. The provider does not change backend contracts or persistence schemas.

## Live and race-completion contract

`LiveWorkspace` provides Full Dashboard plus the existing Drag Test flow; Lite is dashboard-only. Its only Sessions crossing is the narrow `onOpenSessions(intent?)` callback.

`SessionsRuntime` is the sole race-end observer after root mounts it. `RaceCompletionLifecycle` captures an identity only from the status read initiated for that race; it no longer copies the recorder's polling `currentSessionId`, which could describe a previous race. If the confirmed start response arrives after `IsRaceOn: 1 -> 0`, it cannot write a late ID into shared lifecycle state: it directly starts validation for that same race token. A new race or runtime disposal invalidates the older token. On race end it calls `waitForCompletedRaceSession` with a bounded maximum of eight attempts at 500 ms cadence. A successful result requires all three facts for the same captured identity:

1. `/api/analysis/status` says recording stopped and does not still name that session as current.
2. `/api/analysis/sessions` contains that exact `session_id` or `filename`.
3. `/api/analysis/sessions/{sessionId}?lap=0` returns a non-empty array.

The cadence is retry timing only; it is not proof that a session is ready. A new race, a manual retry, or Runtime unmount invalidates the observer before it can use later results. The runtime emits `{ kind: "analysis", filename }`, never `latest.json`. It auto-navigates only when `activeWorkspace === "live"`; Tune/HUD receive a fixed notification with an action to open the validated session or retry bounded validation. Successful Live navigation clears that notification.

## Locale requests for the shared locale owner

The following runtime labels are new feature strings and need translations before root enables the UI in non-English locales:

- `Retry`
- `Loading Telemetry Data...`

All other new Live/Sessions labels use existing keys, including `Dashboard`, `Drag Test`, and `Post-Race Analysis`. This lane did not modify locale files.

## Changed paths

- `frontend/src/features/live/LiveWorkspace.tsx`
- `frontend/src/features/sessions/sessionSelection.ts`
- `frontend/src/features/sessions/sessionSelection.test.ts`
- `frontend/src/features/sessions/sessionsIo.ts`
- `frontend/src/features/sessions/sessionsIo.test.ts`
- `frontend/src/features/sessions/raceCompletion.ts`
- `frontend/src/features/sessions/raceCompletion.test.ts`
- `frontend/src/features/sessions/raceLifecycle.ts`
- `frontend/src/features/sessions/raceLifecycle.test.ts`
- `frontend/src/features/sessions/SessionsStateProvider.tsx`
- `frontend/src/features/sessions/SessionsWorkspace.tsx`
- `frontend/src/features/sessions/SessionsRuntime.tsx`
- `frontend/src/features/analysis/AnalysisView.tsx`
- `frontend/src/features/telemetry/TelemetryView.tsx`

## Verification and limits

Verification on this exact branch after the final implementation edits:

```text
cmd /c "pnpm -C frontend exec vitest run src/features/sessions/sessionSelection.test.ts src/features/sessions/sessionsIo.test.ts src/features/sessions/raceCompletion.test.ts src/features/sessions/raceLifecycle.test.ts"
4 files, 16 tests passed

cmd /c "pnpm -C frontend run test"
113 files, 740 tests passed

cmd /c "pnpm -C frontend run build"
passed; Full and Lite Vite entries compiled

git diff --check
passed
```

The pure/async Vitest coverage now includes source separation, fresh latest resolution, exact persisted-identity reconciliation, stale import/delete/latest rejection, abort/disposal, monotonic intent consumption, completion identity, list/data readiness, bounded retry, cancelled observer behavior, delayed start-status handling, and prior-session rejection. It does not mount React or assert DOM details.

These results do not pass G2 or G5. Coordinator still needs actual Full/Lite mount evidence for provider lifetime and capability gating. L1--L4 and S1--S4 require controlled UI scenarios; MoTeC native launch, live FH6 telemetry, resource/CPU/RSS measurements, and all final G5 matrix items remain `not-run`. Road review is explicitly reserved for W3.

Next action: Coordinator reviews this lane, resolves the two locale keys, wires the Full root provider/runtime and workspace registry, then runs the controlled L3/L4/S1 lifecycle scenarios before opening W2/A2 or claiming G2.
