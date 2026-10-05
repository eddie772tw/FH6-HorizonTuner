# Rust MCP migration handoff

Task: Rust MCP protocol, tools, resources, and read-only service migration
Status: done
Owner: `/root/native_services`
Branch: `codex/rust-backend`
Scope: `backend-rust/src/mcp/**`, `backend-rust/tests/mcp*`, this handoff

Changed:

- `backend-rust/src/mcp/mod.rs` provides `McpServer::handle(&mut self, &App, &Value) -> ApiResult<Option<Value>>` and `status(&self, &Value) -> Value`.
- `protocol.rs` preserves MCP protocol negotiation, server metadata, notification behavior, and JSON-RPC error codes.
- `tool_registry.json` is a checked-in registry extracted from the Python declaration; runtime does not invoke Python.
- `tools.rs`, `resources.rs`, and `service.rs` port all 26 tools, live/session/capture/car/tuning/settings resources, telemetry formatting, capture hygiene, solver formulas, and diagnostics.
- `tests/mcp_fixture_generator.py` and `tests/mcp_golden.json` provide a deterministic Python oracle with a seeded SQLite session, tuning capture, drag session, preset, live frame, all 26 tool calls, five resource routes, initialize, and error responses. The Rust test compares recursive JSON while ignoring object key order, stripping only temporary file paths, and allowing a 1e-9 numeric tolerance.
- `tests/mcp_contract.rs` covers initialization, tool registry, notification, errors, status, solver responses, all-tool golden parity, and all resource routes.

Pending: no MCP-owned implementation remains. Root has exposed `pub mod mcp;` and wired `McpServer` into the HTTP blocking pool/status endpoint.

Blocked by: None. Root integration fixed nullable SQLite metadata; the complete Rust suite now passes.

Verification: Python MCP oracle tests passed 24 tests. The checked-in generator ran successfully with `uv run --no-project --python D:\FH6-HorizonTuner\.venv\Scripts\python.exe python backend-rust/tests/mcp_fixture_generator.py`. `cargo check --manifest-path backend-rust/Cargo.toml` passed. `cargo test --manifest-path backend-rust/Cargo.toml --test mcp_contract` passed 3 tests, including all 26 tool calls and all five resource routes. Owned `rustfmt --check`, Ruff check/format check for the generator, and `git diff --check` passed. Root subsequently verified all 42 Rust contract tests and the release subprocess I/O contracts.

Next action: root owns final PR delivery and CI verification. The generator remains under `backend-rust/tests` to honor the original MCP-only write boundary; no `scripts/**` file was changed.

Last updated: 2026-09-22
