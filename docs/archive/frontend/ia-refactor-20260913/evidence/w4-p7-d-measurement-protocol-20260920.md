# W4-P7-D performance and measurement protocol

日期：2026-09-20。狀態：`pre-G5-prepared`。Owner：Coordinator/root。

This protocol fixes the inputs needed to repeat X3. It intentionally leaves the final paired result open because this W4 objective has no Tauri/native HUD or real FH6 session. The recorded browser observations are a baseline artifact, not a performance pass.

## Fixed candidate and environment

| Field | Value |
| --- | --- |
| Baseline product SHA | `147981c3ea0d68f146e0b2400d147e2346d7930e` (W2/W3 integration before W4 code) |
| Candidate product SHA | `30fedc3833383dc646c724fb918b19830c52451f` (P7-A code; P7-B/C are docs-only) |
| Evidence/document SHA | `9dfb7eac6440781aaf4b64db96286b3f7e3ce9d0` |
| Build mode | frontend production build via `pnpm -C frontend run build`; Full and Lite multi-entry |
| OS | Windows 11 Pro 64-bit, build `26200` |
| CPU | AMD Ryzen 7 5800XT, 8 cores / 16 logical |
| GPU | AMD Radeon RX 9070 XT, driver `32.0.31041.1004`; Parsec/spacedesk virtual adapters also present |
| RAM | 34,282,192,896 bytes reported by Win32_ComputerSystem |
| Node / pnpm | `v24.13.0` / `11.20.0` |
| Browser fixture | Codex In-app Browser, local Vite, backend disconnected at `127.0.0.1:8001` |
| Desktop viewport | browser default measured `846px` wide during P7-C |
| Narrow viewport | temporary CDP override `390 × 844`, device scale `1`; cleared after use |
| Data source | disconnected fixture for browser baseline; no synthetic 60 Hz replay claimed here |
| Theme/HUD | reset `dark` + `default`; HUD page available in browser only |

## Scenarios and repetition

For each baseline/candidate pair, use the same worktree build, browser profile, viewport, theme, backend port, data source and sequence. Warm up for 30 seconds, then observe for 60 seconds. Run at least three repetitions per row, retaining raw timestamps and tool versions.

| Scenario | Required measurements |
| --- | --- |
| Idle / backend disconnected | WebView CPU average/peak, app RSS/working set, backend process CPU/RSS, page reentry time |
| Full Live disconnected | WebView CPU/RSS, canvas/frame/drop signal available to the browser, Live→Tune→Live latency |
| Full Sessions disconnected | page enter/leave latency, request count/window, WebView CPU/RSS; no continuing Sessions refresh after leave |
| Full HUD disconnected | HUD page latency, config/style request window, WebView CPU/RSS; no page requests after leave |
| Lite Live/HUD disconnected | same as Full, recorded separately |
| Final native/game pair | Tauri startup/first paint, native HUD monitor/window lifecycle, real FH6 UDP/race, external HUD process CPU/RSS and frame/drop metrics |

## Baseline artifacts

`w4-p7-d-baseline-20260920.json` records the machine and browser fixture identity plus the observed canvas/request baseline from P7-B. It has three explicit `not-run` pair slots rather than invented numbers. The next native-capable gate must fill those slots with raw measurements before X3 can change from `not-run`.

## Acceptance interpretation

- Current status: `X3 = not-run`, `G5 = not-run`.
- Browser request cessation and canvas counts are useful lifecycle signals only; they do not substitute for CPU/RSS, frame time, external HUD, Tauri or game measurements.
- A reproducible regression above 10% must be tied to raw paired samples and either fixed or explained with a reviewer-owned decision. No improvement percentage is asserted by this preparation record.

