# A→D review interface freeze

> **保留的 interface freeze（歷史交付）。** 本 contract 未被本次文件清理解除；D 實作與 coordinator 接線已交付，舊 lease 不重新生效。現況見 [W4 入口](../README.md)，交付關係見 [歷史索引](../archive/README.md)。

## Identity

- Parent: `codex/frontend-ia-w2-integration-20260920` at `f9d24a192327bd7c38d8aeab7879eddeac372fe2`
- A foundation: `048a8fd` implementation commit, integrated with the final A handoff metadata.
- Slot type: `frontend/src/features/sessions/validationReviewSlot.ts`
- This document is the coordinator-owned `AD_INTERFACE_SHA` freeze for the D lane.

## Sessions slot contract

`SessionsWorkspace` remains the owner of the selected review identity and renders an optional typed slot:

```ts
interface ValidationReviewSlot {
  readonly workflowId: string;
  readonly onReturnToTune: () => void;
}
```

The renderer receives this slot and returns the Road review surface. D must not modify `SessionsWorkspace`, `SessionsStateProvider`, `SessionsIo`, or the slot type. A missing slot keeps the existing Analysis workspace usable.

## D-owned view contract

- `RoadReviewView` accepts `workflowId: string` and `onReturnToTune: () => void`.
- `RoadReviewLibrary` lists saved `RoadWorkflow` documents and emits an explicit workflow id selection.
- The selected detail view reads only the selected workflow's `RoadDocument[]` and never treats an analysis filename as a Road identity.
- Empty library, missing workflow, loading, stale response, and backend error states are visible and recoverable.
- “Return to Tune” is an explicit action that invokes the supplied callback. Mounting or browsing a review must not write `road-selected-workflow`, alter an unsaved Tune draft, or start a Road provider.

## Review IO and actions

`roadReviewIo.ts` is a pure injectable boundary around the existing `/api/road` routes. It may read:

- `GET /workflows` for the library;
- `GET /workflows/{workflowId}` for workflow documents;
- `GET /workflows/{workflowId}/runs/{runId}/capture` for a capture export.

Review mutations use the existing route contracts and only the selected workflow id:

- compare selected baseline/candidate runs through `POST /workflows/{workflowId}/comparisons`;
- accept, revert, or request a baseline retest through `POST /workflows/{workflowId}/decisions` with the existing choices `keep-candidate`, `keep-baseline`, and `retest-baseline`.

The review surface retains access to finish/observation documents and capture export. It does not introduce a second recording controller or duplicate Tune/Road lifecycle. `RoadValidationController` and the Tune providers remain read-only dependencies for D in this stage.

## Concurrency and identity rules

- Every read and mutation is guarded by the selected workflow id plus a monotonically increasing request generation.
- A late response from an earlier selection may settle an operation record but must not replace the current library/detail state or error.
- At most one review mutation is active for a selected workflow; a new selection invalidates view application of the older result.
- Review actions operate on saved Road document ids and preserve the backend's workflow/generation validation. No filename, analysis session id, or inferred game value crosses the boundary.

## Acceptance evidence for D

- Pure `roadReviewIo` tests cover route construction, malformed/error responses, stale selection protection, and mutation settlement.
- Browser-only Full smoke covers library → detail, empty/missing workflow, compare/decision controls when documents exist, capture export affordance, and explicit Return to Tune. Native/Tauri is not required for this objective.
- D handoff records exact branch/head, changed paths, test/build/diff results, and backend-disconnected limitations separately from browser rendering evidence.
