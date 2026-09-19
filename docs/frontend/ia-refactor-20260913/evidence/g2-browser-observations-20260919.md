# G2 瀏覽器觀察（2026-09-19，rebase 後候選）

日期：2026-09-19（Asia/Taipei）。候選：Shell/stack `ee0f7bb9f5e607a682a5136bb0785deb580e51fb`。本文件記錄 actual browser App/LiteApp 的 delayed backend helper evidence；它不是 Tauri native、Windows first-paint、HUD physical-window 或真實 FH6 evidence。

## 環境與資料來源

- Full 與 Lite 都是 actual browser `App`／`LiteApp`，使用 real `main.app` middleware/lifespan；不是 mock backend 或靜態 DOM fixture。
- Full 與 Lite 共用本次隔離 runtime：HTTP `8001`、UDP `8124`，資料目錄為 `D:/FH6-frontend-ia-20260913/shell-race-fix/scratch/native-pending-20260919/runtime-data`。
- Helper 原始 log：`D:/FH6-frontend-ia-20260913/shell-race-fix/scratch/native-pending-20260919/native-pending.log`。此 log 只收錄欄位名稱與 timing，不包含敏感 payload。
- Full 有 4 個 navigation entries，Lite 有 2 個；遙測與 port 隔離狀態沿用本次 runtime setup。

## Delayed config write observations

兩個 POST 都保持既有 `<2500 ms` timeout，且在 response 回來前已完成 HUD unmount、回到 Live 畫面；這證明 browser page transition 的 observable ordering，不能直接推論 Tauri native window lifecycle。

| Variant | Start (epoch ms) | Leave / pre-response (epoch ms) | Response (epoch ms) | Elapsed | HTTP |
| --- | ---: | ---: | ---: | ---: | ---: |
| Full | `1789823512214.3455` | `1789823512708` | `1789823514029.3352` | `1814.991 ms` | 200 |
| Lite | `1789823889220.0088` | `1789823889716` | `1789823891027.5713` | `1807.562 ms` | 200 |

Full reentry followed by GET observed `elements.showTeleSuspension=false`; Lite reentry followed by GET observed `elements.showTeleSuspension=true`. In browser state, both variants had `enabled=false` after the corresponding disabled state. The readback results were recorded after the delayed response; they do not prove a native external window existed or remained open.

## Theme and boundary observations

Across both App variants, browser DOM attributes were checked for `dark/light × default/modern/elegant`; the expected attributes were present. The final captured browser state was `light/elegant`. This is browser DOM/theme evidence only and does not prove native host first paint, white-frame absence, or Tauri theme synchronization.

## Early theme/root observation

The following non-mutating observers were injected before entry into otherwise byte-equivalent Full/Lite HTML. They used the real `main`/`lite-main` StrictMode mount and recorded root delivery, the first non-empty root, paint callback attributes, and saved theme without mutating DOM or storage. All 12 mode/core combinations had the first non-empty root before the measured FCP; root and paint-callback attributes matched the requested mode/core and saved theme.

| Variant | Mode/core | Root delivery (ms) | FCP (ms) |
| --- | --- | ---: | ---: |
| Full | dark/default | 562.5 | 588 |
| Full | dark/modern | 214.8 | 240 |
| Full | dark/elegant | 650.1 | 664 |
| Full | light/default | 570.5 | 588 |
| Full | light/modern | 151.6 | 168 |
| Full | light/elegant | 210.0 | 224 |
| Lite | dark/default | 596.0 | 620 |
| Lite | dark/modern | 623.3 | 644 |
| Lite | dark/elegant | 542.9 | 564 |
| Lite | light/default | 159.2 | 180 |
| Lite | light/modern | 139.5 | 160 |
| Lite | light/elegant | 190.0 | 208 |

Paint-entry timestamps differ from callback delivery. This establishes ordering and theme attribute agreement in the real browser entries; it is not pixel-zero-flash proof and does not support a native first-frame or high-speed startup claim. The temporary observer files were removed after capture; the copied observer/runtime notes are retained in the candidate scratch evidence.

## Browser X1 page-channel resource probe

An additional transparent instrumentation probe used the same actual Full/Lite entries and StrictMode mounts. The native `BroadcastChannel` subclass delegated to `super(name)`, `super.close`, and inherited the remaining APIs; the probe did not change DOM, storage, or timers. The preserved CSV and observer files are under `D:/FH6-frontend-ia-20260913/shell-race-fix/scratch/g2-resource-observer-20260919`.

Across three Live → HUD → Live cycles per variant, total active `BroadcastChannel` counts followed `4, 3, 4, 3, 4, 3, 4` (including the three app-global channels). App-global identities remained ID `1` (`OverlayControlRuntimeProvider`), ID `4` (`useTelemetry`), and ID `5` (`useOverlayWebSocket`), one instance of each. `LiveTelemetryView` identities advanced `7 → 9 → 11 → 13`; temporary StrictMode identities `6, 8, 10, 12` were closed, and leaving Live closed the corresponding Live identity. HUD navigation added no page channels. Created totals were `7, 7, 9, 9, 11, 11, 13`; first-close call counts were `3, 4, 5, 6, 7, 8, 9`. Both variants reported `console.error[]`, and all tabs were closed after capture.

This is browser page-channel/X1 evidence for the recorded navigation cycles. It does not inspect every listener, timer, native resource, or performance metric, and it cannot satisfy G5 performance or native lifecycle evidence by itself.

## G2 interpretation

This evidence strengthens the browser-side pending-write, reentry, early-root ordering, theme-attribute, and recorded page-channel/X1 portion of G2 for the new candidate. Together with the separate native HUD lifecycle evidence, it supports the Coordinator-approved G2 foundation closure; it does not claim native first-paint, pixel-zero-flash, all listeners/timers, or G5 performance. An initial public harness attempt exposed a Vite preamble placement failure; root entry placement was corrected without changing product source, and the tables above come from corrected non-mutating observers. W2 is not started and `WAVE2_BASE_SHA` remains unpublished. Per the conditional stop, root completes final handoff/push, then pauses before W2; preserve the broader IA goal for a later resume.
