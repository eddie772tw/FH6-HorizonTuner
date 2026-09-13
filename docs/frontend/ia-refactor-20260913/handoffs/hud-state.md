# HUD B0 Runtime Handoff

Task: W1/B0 HUD authoritative config and pending-write runtime repair
Status: done
Owner / Task ID / Model / Thinking: hud_fixes / `/root/hud_fixes` / inherited / inherited
Worktree / Branch: `D:/FH6-frontend-ia-20260913/hud-state` / `codex/frontend-ia-hud-state-20260914`
Base SHA / Head SHA / Contract SHA: `fc7960829ebecbf5039d03a39a3fcdcae9d8b6c9` / branch `HEAD` after this handoff commit / not-frozen
Write ownership / Transferred paths: `frontend/src/features/overlay_control/**` excluding `hudConfig.ts`; this handoff only.

## Changed

- Delivery preparation merges `16aa79aed0eeaa6653f86a72e21a0301f0517619` with `--no-commit`. Three-way scope inspection confirms that only `.github/workflows/ci.yml` changes: PR triggers now include `codex/frontend-ia-*`. No pure contract file from `fc79608` changed.
- `overlayControlRuntime.ts` keeps the config persistence boundary in one non-React controller.
  - A GET must succeed before any user patch or replacement can POST. A failed first GET and its Retry path issue another GET; they never submit `DEFAULT_HUD_CONFIG` or discard unknown persisted fields.
  - Normal UI updates use `HudConfigPatch`. `elements` and `units` merge with the latest authoritative snapshot, preserving unknown root and nested fields. `replaceConfig` remains only for the explicit reset action.
  - A write barrier records both write start and completion. Any GET that began during a pending write, or before a write completed, is rejected even if its response arrives after the queue drains.
  - Accepting an external config before local persistence also advances the read generation. A GET already in flight cannot restore its older snapshot over that accepted config.
  - A successful final write schedules a background authoritative GET. Broadcast payloads remain usable before local persistence; afterwards they trigger that reconciliation rather than being trusted as an unversioned replacement forever.
  - `effectiveUnit` and `effectiveUnits` are stripped at every persisted-config boundary and exist only in renderer broadcast payloads. HTTP non-success and `{ success: false }` are reported as save failures.
- `OverlayControlRuntimeProvider.tsx` now owns one shared `BroadcastChannel` listener for the app session.
  - Effective-unit changes do not publish anything until the first authoritative GET completes, avoiding a default `enabled` or style message at startup.
  - Provider consumers are reference-counted. StrictMode remounts retain the same runtime/listener; when no provider remains, the listener and channel close only after durable writes drain. No page unmount aborts a config write or invokes HUD close.
- `OverlayView.tsx` sends typed patches for every normal control and removes the stale complete-config launch rollback. A native launch failure is surfaced as an action error without overwriting any newer setting intent. Reset remains the sole explicit full replacement.
- `overlayControlRuntime.test.ts` covers nested unknown retention, initial GET failure/retry without a default POST, pre-load patch rebasing, serialized patches, renderer-only units, slow GET during a pending write, external broadcast versus delayed GET ordering, background reconciliation, and rejected save-body retry.

## API / contracts / locale

- No backend, Tauri, renderer, `hudConfig.ts`, shared hook, entry-point, or locale file changed.
- The existing `GET/POST /api/overlay/config` shape remains unchanged. The frontend still POSTs a complete merged snapshot because the backend endpoint replaces its stored document; the controller constructs that snapshot only from a successful authority read plus typed patches.
- No locale keys are required. The existing `Retry Update` key remains in use.

## Coordinator integration required

Mount one `OverlayControlRuntimeProvider` inside the existing `AppProviders` tree and outside Full/Lite workspace conditionals. Keep it below `SettingsProvider`, because it projects existing app units to the HUD BroadcastChannel. The compatibility wrapper in `OverlayView` remains until both app variants mount the provider at the app-session boundary.

The provider does not own `useOverlayWebSocket`, `useTelemetry`, native invokes, renderer resources, backend schema, or Tauri windows.

## Verification

- `cmd /c "pnpm -C frontend exec vitest run src/features/overlay_control/overlayControlRuntime.test.ts"` — exit 0; 7 tests passed.
- `cmd /c "pnpm -C frontend run test"` — exit 0; 110 files, 731 tests passed on the merge index.
- `cmd /c "pnpm -C frontend run build"` — TypeScript and Vite build passed on the merge index.
- `git diff --check` — exit 0 on the merge index before commit.

## Native / game evidence

not-run. This lane changes only GUI state ownership and its synthetic transport races. It does not prove Tauri Full/Lite remount integration, native HUD monitor/click-through behaviour, renderer adoption, or real FH6 behaviour.

## Risks / pending

- The backend API has no revision token. After a local write, an unversioned BroadcastChannel config cannot be proven newer than a delayed payload, so reconciliation deliberately uses GET. A truly concurrent external writer that changes the stored config after that GET still requires a server-side revision contract to resolve deterministically.
- The Coordinator must mount the provider at the shared Full/Lite app-session boundary and record the exact integration SHA before G1/G2 can be claimed. This lane deliberately does not edit those entry points.
- B2 remains responsible for capability mapping and Setup/Layout/Advanced JSX decomposition.

## Next action

Coordinator mounts the provider in the shared Full/Lite app-session boundary, records the exact integration SHA, and performs the G2 remount/active-workspace acceptance. Then review this commit with the Coordinator-owned changes before any native or game claim.

Last updated: 2026-09-14
