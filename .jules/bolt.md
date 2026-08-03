## 2024-05-18 - Prevent Blocking Event Loop with Asyncio File I/O
**Learning:** Synchronous file I/O operations (like `open()` and `json.dump()`) in a FastAPI async endpoint block the main event loop, leading to increased latency under load.
**Action:** Wrap synchronous I/O operations in a helper function and use Python's built-in `await asyncio.to_thread(func)` to offload the blocking operations to a separate thread without requiring external dependencies like `aiofiles`.
