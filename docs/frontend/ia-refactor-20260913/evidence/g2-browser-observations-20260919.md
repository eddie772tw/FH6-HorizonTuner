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

## G2 interpretation

This evidence strengthens the browser-side pending-write and reentry portion of G2 for the new candidate. It does not complete native H5: native Full HUD lifecycle has a separate partial observation, Lite native has not been started, and no native first-paint evidence is claimed. G2 remains `partial`; W2 is not started and `WAVE2_BASE_SHA` remains unpublished. Per the conditional stop, finish G2 and hand off the result, then pause before W2; preserve the broader IA goal for a later resume.
