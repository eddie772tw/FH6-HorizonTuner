<!-- Raw Jules work log. Promote only after local verification; see .jules/README.md. -->

## 2026-08-03 - Path Traversal in FastAPI Endpoint
**Vulnerability:** A path traversal vulnerability existed in `/api/languages/{code}` where the path parameter was unsafely joined using `os.path.join`, allowing attackers to read files outside the intended directory on Windows (e.g. via `..\settings`).
**Learning:** FastAPI's default `{param}` path matching does not sanitize `\` backslashes. It blocks `/`, but URL-encoded backslashes (`%5c`) bypass this and are passed raw to the handler, triggering path traversal when passed to `os.path.join` on Windows OS.
**Prevention:** Use FastAPI's native `Path(pattern="...")` to enforce strict regex validation on route parameters directly at the framework level, or explicitly validate string patterns before passing user input to file operations.
## 2024-05-18 - [XSS via innerHTML in ThemeContext]
**Vulnerability:** XSS vulnerability found in `frontend/src/context/ThemeContext.tsx` where user-controlled theme settings (customCSS) were injected directly into a `<style>` tag using `innerHTML`.
**Learning:** `innerHTML` is inherently risky when dealing with dynamic text data input, even within elements like `<style>` where scripts generally shouldn't execute, because of parser nuances and escaping edge cases.
**Prevention:** Use `textContent` instead of `innerHTML` when inserting data that should strictly be treated as text (e.g. CSS text) rather than parsed HTML nodes.
## 2024-08-07 - Error Message Info Leak\n**Vulnerability:** Raw exception messages were returned in JSON error responses from multiple endpoints.\n**Learning:** Returning `str(e)` in production API endpoints leaks internal state, file paths, or implementation details.\n**Prevention:** Fail securely by logging the full exception string internally and returning a generic, safe error string to the client.
## 2024-10-27 - SQLite ON DELETE CASCADE Orphaning Data
**Vulnerability:** Incomplete deletion of telemetry session data resulting in sensitive driving data being orphaned and left in the SQLite database rather than fully erased.
**Learning:** SQLite does not enforce `ON DELETE CASCADE` foreign key constraints by default unless explicitly enabled via `PRAGMA foreign_keys = ON;` on every single connection. Because the application did not guarantee this PRAGMA was set consistently across all high-frequency connection lifecycles, deleting a session row silently left behind hundreds of thousands of orphaned `telemetry_channels` and `laps` child records.
**Prevention:** Always use explicit `DELETE FROM child_table` statements before `DELETE FROM parent_table` when removing relational data in SQLite to guarantee complete data eradication and prevent unintentional data leaks, rather than relying on schema-level cascading that may be silently ignored by the engine configuration.
