## 2026-08-03 - Path Traversal in FastAPI Endpoint
**Vulnerability:** A path traversal vulnerability existed in `/api/languages/{code}` where the path parameter was unsafely joined using `os.path.join`, allowing attackers to read files outside the intended directory on Windows (e.g. via `..\settings`).
**Learning:** FastAPI's default `{param}` path matching does not sanitize `\` backslashes. It blocks `/`, but URL-encoded backslashes (`%5c`) bypass this and are passed raw to the handler, triggering path traversal when passed to `os.path.join` on Windows OS.
**Prevention:** Use FastAPI's native `Path(pattern="...")` to enforce strict regex validation on route parameters directly at the framework level, or explicitly validate string patterns before passing user input to file operations.
