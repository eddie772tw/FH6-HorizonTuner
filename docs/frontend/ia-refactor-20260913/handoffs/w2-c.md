# W2-C Settings Surface Handoff

## Status

Completed the C lane foundation on branch `codex/frontend-ia-w2-c-20260919` from contract base `ee0f7bb9f5e607a682a5136bb0785deb580e51fb`. The lane is ready for coordinator integration after the commit is pushed.

## Scope delivered

- Added `SettingsSurface` as the semantic four-section settings composition: General, Telemetry, Integrations, and Maintenance.
- Added the pure `projectSettingsSections` projection used to hide Developer Tuning in Lite while preserving the other settings items.
- Added `UpdatePreferenceRow` with the existing auto-update preference and a narrow `onOpenUpdates` callback seam.
- Kept `SettingsView` as a compatibility wrapper so the current AppShell import remains stable until the coordinator wires the callback.
- Replaced the settings layout test with pure section-projection coverage and added focused projection tests.

## Changed files

- `frontend/src/features/settings/SettingsSurface.tsx`
- `frontend/src/features/settings/SettingsView.tsx`
- `frontend/src/features/settings/components/UpdatePreferenceRow.tsx`
- `frontend/src/features/settings/settingsSections.ts`
- `frontend/src/features/settings/settingsSections.test.ts`
- `frontend/src/features/settings/SettingsLayout.test.ts`

No coordinator-owned files were changed.

## Validation

- `pnpm -C frontend run test`: passed, 121 files and 861 tests.
- `pnpm -C frontend run build`: passed, TypeScript and Vite production build succeeded for Full and Lite outputs.
- `pnpm -C frontend exec vitest run src/features/settings/settingsSections.test.ts src/features/settings/SettingsLayout.test.ts`: passed, 2 files and 4 tests.
- `git diff --check`: passed; only Git's existing LF/CRLF normalization warnings remain.
- Browser interaction: pending coordinator integration and browser session execution.
- Native/Tauri interaction: not run for this objective.

## Integration follow-up

The coordinator should pass `onOpenUpdates` from AppShell to `SettingsView` so the Maintenance Updates row opens the existing Updates surface. The coordinator must preserve the existing SettingsContext and persistence contract.
