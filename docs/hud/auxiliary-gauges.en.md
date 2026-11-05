# Auxiliary Gauges

[繁體中文](auxiliary-gauges.md)

The fifth HUD settings tab manages independent auxiliary gauges alongside the main gauge and Audio Head. Settings remain editable while hidden. Original raster faceplates remain in use; Audio Head shader/sharpening experiments are excluded, with clarity improvements deferred to separate PRs.

## Visibility and layout

Select any combination of AEM, GReddy, Blitz, Defi and Speedhut; selection order is retained. Horizontal layout allows 1–5 gauges per row, vertical layout 1–5 per column. Left/right/top/bottom anchors retain the existing incomplete-row and inward growth rules. Inward offsets accept 0–4000 screen pixels, while the along-edge center offset accepts ±4000 pixels. Shared sliders retain precise numeric entry. Gauge size follows the shared HUD scale; independent Audio Head scaling does not affect auxiliary gauges.

Switching tabs does not save settings, change visibility or recreate the runtime. Text/numeric drafts and scroll positions survive tab changes during the visit. Enter or focus moving to another ordinary control commits a draft. Reopening the HUD workspace starts on Main gauge.

## Shared value sources

The shared source section owns descriptions, telemetry fields and source units for boost, oil pressure, oil temperature and water temperature. The launcher interprets each reading once and distributes it to all faces. AEM and Speedhut therefore share the same boost reading, converted to their printed PSI/BAR units. There are no per-face overrides.

Oil pressure defaults to a damped engine-load estimate. Oil and water temperature default to average tire temperature. These substitute for unavailable engine sensors; they are not measured oil pressure or engine temperatures. Custom sources take priority, missing/unassigned values display a dash, and `native` explicitly interprets numbers as °C or PSI. See the [independent elements contract](../hud-independent-elements.md) for formulas, units and legacy migration.

Forms send only the changed `gaugeValueSources.<reading>.<field>` patch. The existing runtime merges and serializes writes, preserving other descriptions, mappings and cross-tab edits. Existing GReddy calibration and geometric contracts remain intact.

## Screenshots and evidence

The [gallery and capture manifest](auxiliary-gauges-screenshots/README.md) cover day/night views across three design systems, narrow layout, shared sources, all five original faceplates and a grouped arrangement. Captures use the real AppShell/HUD renderer with isolated fixtures; they are not raw artwork or game captures.

Run `node frontend/src/features/overlay_control/tests/browser/verify.cjs` with a task-local Playwright installation. The independent browser suite covers five-tab keyboard/ARIA behavior, drafts, cross-tab saves, all cores/day-night/three locales/320–1920px, and launcher lifecycle, four anchors, source conversion, every face and row/column layout. Native Windows multi-monitor, game and screen-reader acceptance remain separate.
