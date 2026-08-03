## 2026-08-01 - Prevent Garbage Collection Pauses from Math.max.apply() in HUD Loops
**Learning:** Using `Math.max.apply(null, array)` and methods like `array.slice()` inside high-frequency rendering loops (such as the HUD canvas overlay) creates unnecessary intermediate array allocations and function-call overhead. This triggers frequent Garbage Collection (GC) pauses, causing frame drops and jitter in the overlay rendering.
**Action:** Replace `Math.max.apply()` and `.slice()` in performance-critical rendering loops with native, iterative `for` loops to eliminate runtime object allocation and minimize GC pressure.

## 2024-05-18 - Optimized WebSocket Audio Broadcast
**Learning:** Polling a high-frequency local API endpoint (e.g., audio spectrum data at 60Hz) using `setInterval` + `fetch` on the frontend introduces significant HTTP overhead, TCP connection churn, and JSON parsing latency in the browser's main thread.
**Action:** Always prefer WebSocket event streams for continuous, high-frequency telemetry or state transmission. Implemented a generic `manager.broadcast_json` event bus in the FastAPI backend and used `window.dispatchEvent` in the frontend to route the payloads without HTTP handshakes.
