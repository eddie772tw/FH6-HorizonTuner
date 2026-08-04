## 2025-03-03 - Decouple WebSocket Streams to Prevent Concurrent Write Crashes
**Learning:** High-frequency backend asyncio broadcast tasks (e.g., telemetry vs overlay states) writing to the same FastAPI/Uvicorn WebSocket endpoint concurrently will corrupt frame headers and force the client to disconnect with protocol errors.
**Action:** Decouple logically distinct high-frequency data streams into separate WebSocket endpoints (e.g., `/ws/telemetry` and `/ws/overlay`), each managed by its own `ConnectionManager` instance, eliminating the need for slow runtime locks while fixing concurrent write drops.

## 2025-03-03 - Prevent Endless WebSocket Reconnect Loops on React Unmount
**Learning:** If a shared WebSocket manages its reconnection logic in its `onclose` handler without verifying active listeners, React component unmount lifecycles will trigger endless background reconnect loops, spamming the console with `WebSocket is closed before the connection is established` warnings.
**Action:** Always clear `.onclose` and `.onerror` handlers to `null` during cleanup, and conditionally check if subscriber counts are > 0 before calling `setTimeout` for reconnects inside the closure.

## 2025-03-03 - Isolate Vanilla JS WebSocket Reconnection Loops
**Learning:** Combining multiple WebSocket initializations into a single function with one global auto-reconnect trigger causes connection leaks, as dropping one socket will re-initialize all of them, stranding the still-open ones.
**Action:** In vanilla JS implementations, encapsulate each WebSocket connection in a standalone initialization function, granting each its own dedicated timeout loop for robust partial-drop recovery.
## 2026-08-04 - Fix Telemetry Jitter
**Learning:** High-frequency (60Hz) DOM updates conflict with CSS `transition` properties, causing visual jitter. Also, rendering 60Hz data via standard React state triggers excessive garbage collection, causing UI stutter.
**Action:** Extract high-frequency data fields to separate components that subscribe directly to the event emitter (`telemetryEmitter`) and update the DOM directly via `refs`. Always remove CSS `transition` styles from elements updated at this frequency to prevent visual conflict.
