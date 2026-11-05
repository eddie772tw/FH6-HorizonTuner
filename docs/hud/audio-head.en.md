# Audio Head

[繁體中文](audio-head.md)

Audio Head is an independent HUD element that can coexist with any main gauge. Its fourth settings tab follows Main gauge, Telemetry cards and General. The panel uses shared workspace surfaces and theme tokens. Visibility can be off while settings remain editable; changes apply immediately and save automatically.

## Settings and compatibility

| Control | Field and range |
| --- | --- |
| Show Audio Head | `elements.showAudioHead`, off by default; independent of the gauge |
| Car Audio Head Unit Model | `audioHeadDeck`, 0–8; Pioneer DEH-P6100R by default |
| Audio Head scale | `audioHeadScale`, 50–200%; independent of gauge `scale` |
| Alignment | `audioHeadEdge`, left/right/top/bottom; centered on the left edge by default |
| X offset slider | Left: 0–4000 px; right: −4000–0 px; top/bottom: −4000–4000 px |
| Y offset slider | Top: 0–4000 px; bottom: −4000–0 px; left/right: −4000–4000 px |

The sliders use 1 px steps: positive X moves right and positive Y moves down. The anchored axis stops at zero in the outward direction. Changing alignment clamps values forbidden by the new edge to zero while preserving the other axis. Dragging or arrow keys apply immediately; Home/End reach the slider bounds. Storage retains `audioHeadOffset` (inward distance) and `audioHeadCenterOffset` (along-edge offset), so existing positions need no migration.

The audio capture source remains in General. The launcher forwards the shared audio/media stream and latest snapshots to the gauge and independent Audio Head iframe. Changing settings tabs does not toggle HUD elements or recreate the runtime. Showing Audio Head again uses its saved model and position.

Only the ordered registry in `OverlayView` adds the `audio-head` entry; `HudWorkspace` contains no Audio Head logic. The panel receives a narrow configuration slice and shared actions and submits nested partial patches. X/Y sliders reuse `HudRange`; the scale number input still retains drafts across tab changes. See the [extension contract](../frontend/hud-settings-workspace.en.md).

For existing audio configurations without `audioHeadScale`, frontend and Rust normalize before merging defaults: a valid legacy shared `scale` migrates once and is clamped to 0.5–2. An explicit invalid independent value becomes 1 instead of following the gauge again. Unrelated sparse configurations keep their fields and receive the 100% default. Legacy `hudStyle: "audio_head"` migrates to VFD plus the independent element, retaining visibility and explicit audio switches. Saving, reloading and partial updates preserve unknown fields.

## Settings visual review

Captured on 2026-11-05 from the production AppShell and React settings, 1280×720, Traditional Chinese. The fourth tab is named 音響系統 in this locale. These views demonstrate right alignment with X capped at zero; controls remain editable while the element is hidden. Settings and all nine decks were recaptured together; see the [manifest](audio-head-screenshots/manifest.json) for the revision and source-file SHA-256 hashes.

| Design system | Light | Dark |
| --- | --- | --- |
| Halfmoon Default | ![Default light](audio-head-screenshots/default-light-1280-audio-head.png) | ![Default dark](audio-head-screenshots/default-dark-1280-audio-head.png) |
| Swiss Technical | ![Swiss light](audio-head-screenshots/swiss-light-1280-audio-head.png) | ![Swiss dark](audio-head-screenshots/swiss-dark-1280-audio-head.png) |
| Rhine Lab | ![Rhine Lab light](audio-head-screenshots/rhine-lab-light-1280-audio-head.png) | ![Rhine Lab dark](audio-head-screenshots/rhine-lab-dark-1280-audio-head.png) |

<details>
<summary>Other tabs and the narrow 320px layout</summary>

![Main gauge](audio-head-screenshots/default-dark-1280-gauge.png)

![Telemetry cards](audio-head-screenshots/default-dark-1280-telemetry.png)

![General](audio-head-screenshots/default-dark-1280-general.png)

320×720 Audio Head tab; position controls are below the fold in the scrollable panel:

![320px Audio Head](audio-head-screenshots/default-dark-320-audio-head.png)

</details>

## All nine models

On 2026-11-05, user visual review rejected the full-panel vector redraws. Pioneer DEH-P835R, Alpine CDA-7848 and CDA-9815RB now use their original raster assets again. The other six decks also use their original `*_clean.png`, removing unverified retyped text, tracing and full-panel reconstruction. No partial vector replacements are active. Future replacements are limited to individual trademarks, logos or precisely described motifs with a verified matching vector source, documented provenance and before/after captures; otherwise the original image stays. See the [asset boundaries and per-deck sources](../../hud_overlay/audio_head/assets/README.md).

Each image is an element screenshot from the real HUD launcher and renderer after selecting the model in settings. Scale is 100%, DPR 1, with a neutral RGB(22, 27, 34) backdrop. Fixed synthetic WebSocket data supplies the spectrum and “HUD Demo - Night Drive” media text. The gauge and telemetry are hidden for unobstructed captures. The PNG files remain unchanged; the pre-vector rectangle backing and 75% material-opacity treatment preserve decoration coverage. Spectrum, media text and VU remain on a separate animation layer. [Brand provenance](../../hud_overlay/audio_head/assets/brands/SOURCES.md) is retained as historical evidence, with no active use by the renderer.

1. **Pioneer DEH-P6100R**

   ![Pioneer DEH-P6100R](audio-head-screenshots/audio-head-00.png)

2. **Panasonic CQ-VX5500K**

   ![Panasonic CQ-VX5500K](audio-head-screenshots/audio-head-01.png)

3. **Pioneer DEX-P1R**

   ![Pioneer DEX-P1R](audio-head-screenshots/audio-head-02.png)

4. **Pioneer DEH-P835R**

   ![Pioneer DEH-P835R](audio-head-screenshots/audio-head-03.png)

5. **Sony CDX-CA860X**

   ![Sony CDX-CA860X](audio-head-screenshots/audio-head-04.png)

6. **Alpine CDA-7848**

   ![Alpine CDA-7848](audio-head-screenshots/audio-head-05.png)

7. **Alpine CDA-9815RB**

   ![Alpine CDA-9815RB](audio-head-screenshots/audio-head-06.png)

8. **Kenwood KRC-759R**

   ![Kenwood KRC-759R](audio-head-screenshots/audio-head-07.png)

9. **JVC KD-LX50R**

   ![JVC KD-LX50R](audio-head-screenshots/audio-head-08.png)

## Verification for this update

- After restoring raster faces: full frontend Vitest passes 1,939 tests with one existing skip; TypeScript/Vite build passes.
- All nine original PNGs are byte-identical to pre-vector commit `ff6baf5b`. The historical SVG generator's `--check` and 44 normalization security contracts still pass; these verify the retained tools, not active SVG rendering or visual approval.
- Rust verification at integration commit `594f993f`: defaults 242 passed, three ignored; `--no-default-features` 232 passed, two ignored. This revision changes Audio Head layers, browser verification and documentation, with no Rust or storage-format changes; Cargo was not rerun.
- Separate R34/LFA/ST8100 browser contracts passed at `594f993f`, retaining their gauge and CJK glyph assertions. The current raster restoration uses the settings/launcher browser runner below.
- Browser: 336 four-tab layouts (seven cores × light/dark × three locales × 1280/320px), plus 1920px, reduced motion and six specialized gauge forms. Keyboard/ARIA, drafts/scroll, hidden configuration, cross-tab writes, retry, unknown fields, reset and unit contracts pass.
- Real launcher: independent gauge/audio scaling, four-edge placement, outward X/Y slider limits and inward movement, nine live model selections and audio-only mounting/unmounting. The run recorded 90 fixture saves, 66 captures, no page errors and no unexpected API calls. This gallery refreshes 19 images; see [manifest](audio-head-screenshots/manifest.json) for checks, dimensions and SHA-256 hashes.
- Complete static-layer RGB comparisons pass for all nine original rasters (allowing one level of Canvas alpha-premultiplication rounding), with native dimensions and alpha 191/255 verified and no Audio Head SVG requests. The images have been inspected and supplied for user visual re-review; automated comparisons do not mean user approval.

Run `node frontend/src/features/overlay_control/tests/browser/verify.cjs` with a task-local `PLAYWRIGHT_MODULE_PATH`, optionally `PLAYWRIGHT_CHANNEL=msedge` on Windows and `OUTPUT_DIR`. This runner invokes `hud_overlay/audio_head/tests/browser/verify.cjs`; browser checks remain outside Vitest.

These captures use isolated HTTP/WebSocket fixtures, with no user settings, real audio or game session. Windows native launch/display movement, in-game and Narrator/NVDA acceptance were not rerun for this update. The historical native evidence for #615 is not current #541 device acceptance.
