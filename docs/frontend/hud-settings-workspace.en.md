# HUD settings workspace

[繁體中文 and validation record](hud-settings-workspace.md)

The persistent toolbar contains the HUD window action and synchronization/error status. Main gauge, Telemetry cards, General, Audio Head and Auxiliary Gauges group settings by element. Changes still apply immediately and save automatically.

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
| #541's separate Audio Head section | Audio Head (fourth tab) | Nine models, visibility, four edges and offsets; independent `audioHeadScale` 0.5–2 with one-time migration from shared scale. |
| #540's separate auxiliary section | Auxiliary Gauges (fifth tab) | Five selectable faces, row/column layout, four anchors and shared sources; existing inward/along-edge offsets and shared HUD scale remain. |

Each telemetry card keeps its visibility controls visible and starts with its detailed settings collapsed. Multiple cards can expand together. Disabling an element or the telemetry master controls visibility only. Loading state, inherited unit fields and native capability constraints still apply.

All tab panels stay mounted in separate scroll containers. Switching tabs preserves expansion, scroll and uncommitted input drafts. Hidden panels use `hidden` to leave keyboard and accessibility navigation. Left/Right, Home/End and roving tab focus follow the workspace convention. Leaving the entire HUD page resets the selected tab and expansion state on return.

## Extension contract

`HudWorkspace` receives an ordered `HudSettingsTabDefinition[]`. Each entry contains only a stable, unique `id`, a translation `labelKey`, and React `content`. The first entry is selected initially and is the fallback when the selected entry is removed. Use English display text for translation keys because English currently uses identity translation; add corresponding entries to all three locale files.

```tsx
const tabs: HudSettingsTabDefinition[] = [
  { id: 'gauge', labelKey: 'Main gauge', content: <HudGaugePanel {...gaugeProps} /> },
  { id: 'telemetry', labelKey: 'Telemetry cards', content: <HudTelemetryPanel {...telemetryProps} /> },
  { id: 'general', labelKey: 'General', content: <HudGeneralPanel {...generalProps} /> },
  { id: 'audio-head', labelKey: 'Audio Head', content: <HudAudioHeadPanel {...audioHeadProps} /> },
  { id: 'auxiliary-gauges', labelKey: 'Auxiliary Gauges', content: <HudAuxiliaryPanel {...auxiliaryProps} /> },
];
```

`OverlayView` coordinates metadata, native actions, audio and panel composition. The existing runtime remains the sole owner of persistence, serialized writes, retry, broadcasting and unit projection. Panels expose narrow configuration types and submit `HudConfigPatch`; nested `elements` and `units` updates must contain only changed fields. `HudDisplayUnits` lives in `hudDisplayUnits.ts` without a UI dependency.

Tab changes must not create another runtime, save settings, toggle HUD elements, reload the renderer or refresh metadata. New panels must have no mounting side effects.

`gaugeValueSources` also supports partial fields within each semantic reading. For example, `{ gaugeValueSources: { boost: { label } } }` retains the current source, unit and other readings. `HudAuxiliaryPanel` owns visibility/layout and `HudGaugeSourcesPanel` owns shared sources; the tab container remains feature-agnostic.

Compose new panels with `HudSettingsSection`: the same `glass-panel`, inset `workspace-panel-header` and `workspace-section-heading` used by Tune. Design-system tokens own the surface, heading and borders. Do not add a full-bleed `card-header` or another layer of workspace horizontal padding; the production `AppShell` already supplies the outer spacing. Telemetry cards reuse this section instead of maintaining a separate header skin.

Draft numeric fields commit on Enter or ordinary blur. When focus moves to a HUD tab, `isHudSettingsTab` suppresses that commit and retains the draft. Shared percentage inputs and ST8100 thresholds follow this rule. Percentage number inputs retain 1% increments independently of the slider step.

## PR #541 integration

After merging #615, #541 replaces the former `audioHead` slot with this entry after General, as the fourth tab. The Traditional Chinese translation of `Audio Head` is `音響系統`:

```tsx
{ id: 'audio-head', labelKey: 'Audio Head', content: <HudAudioHeadPanel {...audioHeadProps} /> }
```

The panel uses `HudPanelActions`, a narrow configuration slice, `HudSettingsSection` and shared sliders. It submits `elements: { showAudioHead }` as a partial patch. X/Y sliders stop outward movement at zero on the anchored axis and map to the existing inward/along-edge fields; scale drafts survive tab changes. The generic tab container needs no Audio Head logic. `audioHeadScale` migrates from a valid legacy shared `scale` only when missing in an existing audio configuration. HUDCore uses the style's `scaleConfigKey`; other gauges keep the original scale contract. See the [Audio Head guide and gallery](../hud/audio-head.en.md). Updating #540 remains outside this change.

## Verification

After the fourth-tab integration and X/Y slider revision in #541, the frontend suite passes 1,939 tests with one existing skip, and the build passes. Browser coverage includes 336 layouts and 66 captures, independent scaling, nine real renderers, directional limits for all four edges and audio mounting/unmounting: 90 fixture saves, no page errors or unexpected API calls. The [Audio Head gallery and record](../hud/audio-head.en.md) describe this update separately from the historical #615 evidence below.

The browser fixture mounts the production `AppShell`, Live/Tune/HUD components and providers, then navigates to HUD through the application header. HTTP responses and idle WebSockets are isolated fixtures with no game frames. Sessions and Companion are outside its scope. Captures include the real header, outer spacing and app-scoped theme rules; bare-panel captures cannot substitute for this visual review. See the [cross-system screenshot gallery and provenance](hud-settings-screenshots/README.md) for all three tabs in Halfmoon Default, Swiss Technical and Rhine Lab, light/dark, plus Tune reference views and 320px examples.

The 2026-11-04 visual revision reran all 252 layout cases and interactions inside AppShell: 35 saves, no page errors or unexpected API requests, and 45 captures including Live/Tune/HUD references. Evidence: `scratch/hud-settings-theme-review/report.json`. The committed gallery selects 18 desktop tab views, three narrow views and three Tune references. Full frontend tests (1,862 passed / one existing skip) and TypeScript/Vite build passed again. Native smoke below belongs to the earlier implementation; it was not rerun for this styling-only revision.

Run `pnpm -C frontend run test`, `pnpm -C frontend run build` and `git diff --check`. Browser tests are opt-in and separate from Vitest: `node frontend/src/features/overlay_control/tests/browser/verify.cjs`. Set `PLAYWRIGHT_MODULE_PATH` for a task-local Playwright install and `PLAYWRIGHT_CHANNEL=msedge` on Windows when appropriate; keep the browser sandbox enabled. `OUTPUT_DIR` defaults to `scratch/hud-settings-browser`.

The fixture uses real React, theme and runtime providers with isolated HTTP data. It covers keyboard/ARIA, collapsed focus, hidden configuration, cross-tab writes/drafts, retry, reset, units and retained state; all seven cores, light/dark, three locales, 1280/320px plus wide/reduced-motion checks; and specialized forms at 320px. R34, LFA and ST8100 retain independent browser contracts. Windows native launch/close, display movement and live application were checked separately; neither browser nor native idle-state smoke results constitute in-game or screen-reader acceptance. The native run emitted missing-file stderr messages and a WebView2 shutdown warning that were not investigated here. See the dated record in the Chinese guide for results and evidence boundaries.
