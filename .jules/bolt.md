## 2025-03-03 - Decouple WebSocket Streams to Prevent Concurrent Write Crashes
**Learning:** High-frequency backend asyncio broadcast tasks (e.g., telemetry vs overlay states) writing to the same FastAPI/Uvicorn WebSocket endpoint concurrently will corrupt frame headers and force the client to disconnect with protocol errors.
**Action:** Decouple logically distinct high-frequency data streams into separate WebSocket endpoints (e.g., `/ws/telemetry` and `/ws/overlay`), each managed by its own `ConnectionManager` instance, eliminating the need for slow runtime locks while fixing concurrent write drops.

## 2025-03-03 - Prevent Endless WebSocket Reconnect Loops on React Unmount
**Learning:** If a shared WebSocket manages its reconnection logic in its `onclose` handler without verifying active listeners, React component unmount lifecycles will trigger endless background reconnect loops, spamming the console with `WebSocket is closed before the connection is established` warnings.
**Action:** Always clear `.onclose` and `.onerror` handlers to `null` during cleanup, and conditionally check if subscriber counts are > 0 before calling `setTimeout` for reconnects inside the closure.

## 2025-03-03 - Isolate Vanilla JS WebSocket Reconnection Loops
**Learning:** Combining multiple WebSocket initializations into a single function with one global auto-reconnect trigger causes connection leaks, as dropping one socket will re-initialize all of them, stranding the still-open ones.
**Action:** In vanilla JS implementations, encapsulate each WebSocket connection in a standalone initialization function, granting each its own dedicated timeout loop for robust partial-drop recovery.

## 2025-03-09 - HTML5 Canvas Optimization for HUD overlays
**Learning:** Replaced heavy image sequence preloading (over 700 frames) with native Canvas API drawing in the HUD overlay to vastly reduce HTTP requests, memory footprint, and initialization latency.
**Action:** When creating animated dials or dynamic text readouts in HUD overlays, favor math-driven rendering using Canvas primitives (`ctx.arc`, `ctx.fillText`, `ctx.rotate`) instead of fetching hundreds of sprite images.
## 2026-08-04 - Fix Telemetry Jitter
**Learning:** High-frequency (60Hz) DOM updates conflict with CSS `transition` properties, causing visual jitter. Also, rendering 60Hz data via standard React state triggers excessive garbage collection, causing UI stutter.
**Action:** Extract high-frequency data fields to separate components that subscribe directly to the event emitter (`telemetryEmitter`) and update the DOM directly via `refs`. Always remove CSS `transition` styles from elements updated at this frequency to prevent visual conflict.
## 2025-03-01 - HUD Overlay Performance GC Pressure
**Learning:** Using array callbacks (`.filter`, `.forEach`) in high-frequency loops (like `requestAnimationFrame` for `g-radar`) allocates closures and intermediate arrays every frame. Combined with unbound data accumulation during pauses, this causes heavy Garbage Collection (GC) spikes and visual stuttering.
**Action:** Replace `.filter` and `.forEach` with native `for` loops in 60Hz rendering code. Implement a time-delta reset (e.g., `now - lastTime > 1500ms`) to cleanly flush stale telemetry data when the game pauses or disconnects. Also ensure lifecycle events like `destroy` properly zero out arrays to prevent cross-HUD memory leaks.
## 2025-03-03 - Remove CSS transitions from high-frequency telemetry components
**Learning:** CSS transitions applied to elements updated at 60Hz via requestAnimationFrame or high-frequency event emitters conflict with the rapid DOM updates. This causes visual jitter and performance degradation because the browser's composite engine attempts to calculate interpolated frames for values that are already being manually interpolated/updated at 60Hz.
**Action:** Always remove CSS `transition` styles from elements updated at high frequencies (like telemetry components) to prevent visual conflict and reduce browser rendering overhead.
