# W4-P7-B browser resource and lifecycle evidence

Date: 2026-09-20 Asia/Taipei  
Candidate SHA: `30fedc3833383dc646c724fb918b19830c52451f`  
Browser server: Vite `http://127.0.0.1:1424/` from the W4 worktree  
Data source: backend-disconnected browser fixture  
Scope: Full/Lite web entries only; native/Tauri, external HUD and real FH6 resources remain `not-run`.

## Resource observations

The inventory used the browser DOM and CDP `Network.requestWillBeSent` events. It did not modify the page or install instrumentation into the product runtime.

| Entry / surface | Canvas count | Other media | Observation |
| --- | ---: | ---: | --- |
| Full Live after guide close | 17 | audio 0, video 0 | Live telemetry canvases mounted. |
| Full Tune | 0 | audio 0, video 0 | Live canvases left the DOM on workspace switch. |
| Full Sessions | 0 | audio 0, video 0 | Session surface had no Live canvases. |
| Full HUD | 0 | audio 0, video 0 | HUD controls mounted without Live canvases. |
| Full Live reentry | 17 | audio 0, video 0 | Reentry returned to the same canvas count; no accumulation across the loop. |
| Lite Live after guide close | 17 | audio 0, video 0 | Lite Live rendered the same web telemetry canvas set. |
| Lite HUD cycle 1/2 | 0 | audio 0, video 0 | HUD page did not retain Live canvases. |
| Lite Live cycle 1/2 | 17 | audio 0, video 0 | Repeated reentry returned to 17 canvases, not 34+. |

## Network and cleanup observations

- Full Sessions for a 2.2 second window requested analysis data, current debrief, Road workflows and analysis status. After returning to Live, the next window showed only Live-owned overlay/diagnostic/status requests; no continuing Sessions refresh was observed.
- Full HUD for a 2.2 second window requested HUD styles, author metadata, audio devices and analysis status. After returning to Live, the next window showed Live-owned overlay configuration and status requests; the HUD style/audio requests stopped.
- Lite HUD requested the same page-owned style/author/audio resources. After returning to Lite Live, the next window contained only overlay configuration requests; HUD page resources stopped.
- Settings and Updates were opened and closed with `Escape` on Full; focus returned to the App Menu. Lite Settings was opened from its App Menu and closed with `Escape`; the Lite Live surface remained mounted.
- Backend requests failed closed as `Failed to fetch` / `Backend disconnected`; this is useful lifecycle coverage but not success/readback coverage.

## Result and limits

`X1` browser scope: `pass` for the exercised repeated workspace/page cleanup observations. The evidence demonstrates DOM canvas replacement and page-owned request cessation under the disconnected browser fixture. It does not prove internal listener counts, BroadcastChannel close timing, React effect counts, WebView memory/RSS, native HUD lifetime, Tauri window cleanup, or real-game resource behavior; those remain final-machine or dedicated runtime measurement work.

Repetition: Full Live→Tune→Sessions→HUD→Live once, Full Sessions/HUD request windows once each, Lite Live↔HUD twice, and Settings/Updates Escape checks once. The temporary Vite process was stopped after collection; both browser tabs remain temporary.

