# HUD settings workspace

[繁體中文 and validation record](hud-settings-workspace.md)

The persistent toolbar contains the HUD window action and synchronization/error status. Main gauge, Telemetry cards and General group the existing settings by purpose. Changes still apply immediately and save automatically.

## Control map

| Previous location | New location | Preserved behavior |
|---|---|---|
| Setup style/author; Layout gauge visibility | Main gauge | Style selection, author metadata and WIP filtering remain available while hidden. |
| Setup overall scale; Advanced glow/motion | Main gauge | Existing `scale` 0.5–2, glow 0–2 and renderer motion behavior. |
| Advanced style controls | Main gauge, style-specific section | S650, Classic JDM, R34, ST8100, LFA and VFD values and applicability remain unchanged. Hidden Classic JDM auxiliary gauges can be configured. |
| Layout telemetry master/opacity/font/guides | Telemetry cards, shared section | Master visibility does not clear or disable child settings. |
| Layout suspension/tire slip/tire temperature | Tires & suspension | One shared size/position group; enabling slip or temperature still enables the tire parent. |
| Layout G-force controls | G-force & attitude | Left anchor restricts X to nonnegative values; right restricts X to nonpositive values. |
| Layout power/pedal charts | Power & pedal charts | Merged and separate modes retain their own position, scale and offset values. |
| Layout compass/controller | Compass and Controller cards | Existing placement, layout, offset values and ranges. |
| Setup monitor/unit drawer | General | Inline units retain inheritance and overrides; speed changes also update legacy `unit`. |
| Advanced colors/audio/pause/reset; Setup reload | General | Shared color contract, audio endpoint, pause behavior and reload remain; confirmed reset preserves `enabled`. |

Each telemetry card keeps its visibility controls visible and starts with its detailed settings collapsed. Multiple cards can expand together. Disabling an element or the telemetry master controls visibility only. Loading state, inherited unit fields and native capability constraints still apply.

All tab panels stay mounted in separate scroll containers. Switching tabs preserves expansion, scroll and uncommitted input drafts. Hidden panels use `hidden` to leave keyboard and accessibility navigation. Left/Right, Home/End and roving tab focus follow the workspace convention. Leaving the entire HUD page resets the selected tab and expansion state on return.

## Extension contract

`HudWorkspace` receives an ordered `HudSettingsTabDefinition[]`. Each entry contains only a stable, unique `id`, a translation `labelKey`, and React `content`. The first entry is selected initially and is the fallback when the selected entry is removed. Use English display text for translation keys because English currently uses identity translation; add corresponding entries to all three locale files.

```tsx
const tabs: HudSettingsTabDefinition[] = [
  { id: 'gauge', labelKey: 'Main gauge', content: <HudGaugePanel {...gaugeProps} /> },
  { id: 'telemetry', labelKey: 'Telemetry cards', content: <HudTelemetryPanel {...telemetryProps} /> },
  { id: 'general', labelKey: 'General', content: <HudGeneralPanel {...generalProps} /> },
];
```

`OverlayView` coordinates metadata, native actions, audio and panel composition. The existing runtime remains the sole owner of persistence, serialized writes, retry, broadcasting and unit projection. Panels expose narrow configuration types and submit `HudConfigPatch`; nested `elements` and `units` updates must contain only changed fields. `HudDisplayUnits` lives in `hudDisplayUnits.ts` without a UI dependency.

Tab changes must not create another runtime, save settings, toggle HUD elements, reload the renderer or refresh metadata. New panels must have no mounting side effects.

Draft numeric fields commit on Enter or ordinary blur. When focus moves to a HUD tab, `isHudSettingsTab` suppresses that commit and retains the draft. Shared percentage inputs and ST8100 thresholds follow this rule. Percentage number inputs retain 1% increments independently of the slider step.

## PR #541 integration

After the base redesign merges, update #541 from main and replace its former `audioHead` workspace slot with this entry immediately before General:

```tsx
{ id: 'audio-head', labelKey: 'Audio Head', content: <HudAudioHeadPanel {...audioHeadProps} /> }
```

Use `HudPanelActions` with an Audio Head configuration slice and submit `elements: { showAudioHead }` as a partial patch. #541 owns Audio Head normalization, migration, renderer/event integration, assets and tests. Independent scaling and migration from its currently shared `scale` belong in that follow-up. This base PR adds no Audio Head placeholder, settings fields or backend migration, and does not update #541 or #540.

## Verification

Run `pnpm -C frontend run test`, `pnpm -C frontend run build` and `git diff --check`. Browser tests are opt-in and separate from Vitest: `node frontend/src/features/overlay_control/tests/browser/verify.cjs`. Set `PLAYWRIGHT_MODULE_PATH` for a task-local Playwright install and `PLAYWRIGHT_CHANNEL=msedge` on Windows when appropriate; keep the browser sandbox enabled. `OUTPUT_DIR` defaults to `scratch/hud-settings-browser`.

The fixture uses real React, theme and runtime providers with isolated HTTP data. It covers keyboard/ARIA, collapsed focus, hidden configuration, cross-tab writes/drafts, retry, reset, units and retained state; all seven cores, light/dark, three locales, 1280/320px plus wide/reduced-motion checks; and specialized forms at 320px. R34, LFA and ST8100 retain independent browser contracts. Windows native launch/close, display movement and live application were checked separately; neither browser nor native idle-state smoke results constitute in-game or screen-reader acceptance. The native run emitted missing-file stderr messages and a WebView2 shutdown warning that were not investigated here. See the dated record in the Chinese guide for results and evidence boundaries.
