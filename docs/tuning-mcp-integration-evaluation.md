# Tuning telemetry and MCP integration evaluation

Date: 2026-08-13
Branch: `codex/tuning-dev-mode`

## Decision

There is a strong opportunity to expose the tuning evidence workflow through MCP, but the first release should be a local, read-only MCP server. It should let an AI inspect versioned telemetry captures, calibration records, capability contracts, and deterministic solver results. It should not write car parameters, change the game, or promote calibration constants without explicit human review.

## Why this project is a good fit

The project already has the main boundaries required for an MCP adapter:

- raw telemetry arrives through `/ws/telemetry` and is now captured by the developer test page as `tuning-capture/v1` JSON/CSV;
- persisted race sessions are available through `TelemetrySQLite` and `/api/analysis/sessions`;
- the developer solver has typed `tuning-dev/v1` input/output;
- capability and calibration data have explicit versioned schemas with `unknown` values instead of guessed limits;
- summary calculations are pure functions and can be reused by an MCP server without running React.

The MCP server should sit beside the existing FastAPI application and call shared Python analysis/domain code or a stable HTTP API. It should not scrape the React UI and should not subscribe directly to the 60 Hz stream for every model request.

## Recommended MCP surface

### Read-only resources

| Resource URI | Purpose | Size policy |
|---|---|---|
| `fh6://capture/{capture_id}` | Canonical `tuning-capture/v1` metadata, summary, and sample stream | Paginated or time-windowed; never inject an unbounded 60 Hz session by default |
| `fh6://capture/{capture_id}/summary` | Cadence, duration, G, slip, tire temperature, timestamp integrity | Small, preferred first read |
| `fh6://calibration/{dataset_id}` | Calibration fixture and confidence/source fields | Read-only; unknown boundaries remain unknown |
| `fh6://capability/{car_id}` | Versioned upgrade locks, bounds, steps, precision and game build | Read-only; show source and confidence |
| `fh6://analysis/{analysis_id}` | Stored analysis result and provenance | Include solver version and input capture IDs |

MCP resources are designed for application-selected context and use unique URIs; this maps well to capture IDs and summary/detail separation. The official specification also supports resource templates and optional subscriptions, but subscriptions should be deferred until the capture lifecycle is stable. [MCP Resources specification](https://modelcontextprotocol.io/specification/2025-06-18/server/resources)

### Deterministic read-only tools

| Tool | Input | Output |
|---|---|---|
| `list_tuning_captures` | car, purpose, surface, confidence, date filters | bounded capture index |
| `get_capture_summary` | capture ID | typed summary plus integrity warnings |
| `query_capture_window` | capture ID, start/end ms, channels, max samples | downsampled structured samples |
| `compare_captures` | baseline/candidate IDs, metric set | delta table and repeatability statistics |
| `analyze_tuning_capture` | capture ID, analysis profile | deterministic analysis result with provenance |
| `run_dev_tuning_solver` | `tuning-dev/v1` input | `tuning-dev/v1` output plus warnings |
| `validate_calibration_fixture` | fixture/dataset ID | schema errors, confidence and promotion blockers |

MCP tools are model-invokable, but the protocol recommends a human in the loop and visible confirmation for sensitive operations. Tool inputs must be validated, outputs sanitized, calls rate-limited and audited. [MCP Tools specification](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)

### Deliberately excluded from v1

- `apply_tune_to_game`
- `write_car_params`
- `promote_calibration_constant`
- `start_unattended_capture`
- arbitrary SQL or filesystem access

These would create an external-state or safety boundary and require an explicit product decision, confirmation UI, permission model, and rollback/audit design.

## Deployment recommendation

### Stage A: local stdio server

Use a Python MCP server as a child process for local AI hosts. The existing backend remains the source of truth; the MCP adapter exposes bounded resources/tools and reads the SQLite/session files through a narrow service layer. Stdio is appropriate for a local process-spawned integration. The official Python SDK supports servers, resources, tools, prompts, stdio, SSE and Streamable HTTP; its current stable line should be pinned explicitly because the SDK has an active major-version transition. [Official Python SDK](https://github.com/modelcontextprotocol/python-sdk)

### Stage B: local Streamable HTTP bridge

If the AI host cannot spawn a process, mount a localhost MCP endpoint beside the FastAPI service. Use an authenticated, localhost-only endpoint with Origin/Host validation, bounded request sizes, timeouts and rate limits. The TypeScript SDK documents stdio for local child processes and Streamable HTTP for remote/server deployments. [Official TypeScript server guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md)

### Stage C: optional live session resource

After Stage A/B is validated, expose a `current-capture` resource that updates only at a low rate (for example 1–5 Hz summaries), while raw 60 Hz frames remain in a bounded ring buffer or file. A model should request a window or summary rather than receive an uncontrolled stream. Resource subscriptions are possible in MCP, but they should not be used as a substitute for the telemetry pipeline.

## AI-analysis boundary

The AI can safely assist with:

1. selecting comparable captures and detecting metadata mismatches;
2. identifying cadence gaps, non-monotonic timestamps, saturation, wheel-to-wheel asymmetry and repeatability;
3. comparing candidate tunes against a baseline;
4. explaining why a solver output is advisory, locked, unknown or calibration-prior;
5. proposing the next controlled test and the minimum data required.

The AI should not infer a unique tire coefficient from telemetry that lacks direct per-wheel normal load. Current telemetry contains slip, acceleration, temperature and suspension travel, but not a direct per-wheel `Fz`; therefore μ and load sensitivity remain underdetermined without a load-estimation model or controlled test design.

## Data and privacy risks

- Capture files contain driving behavior, vehicle identity and possibly share codes; expose only user-selected files.
- Do not expose arbitrary filesystem paths or SQL queries as MCP arguments.
- Cap raw window size and enforce server-side pagination/downsampling.
- Return provenance with every analysis: capture IDs, metadata, schema versions, solver version, calibration version and confidence.
- Keep the MCP server opt-in behind developer settings and default it to read-only.
- Log tool name, caller/session ID, argument hash, duration, result size and error status without logging the full raw telemetry by default.

## Phased implementation plan

| Phase | Dependency | Parallelism | Expected commit |
|---|---|---|---|
| MCP-0 | Current capture/schema work | Parallel with FH6 evidence search | `docs(mcp): evaluate telemetry and tuning MCP boundary` |
| MCP-1 | MCP-0 | Mostly parallel with solver calibration | `feat(mcp): add read-only capture service contract` |
| MCP-2 | MCP-1 | Sequential; requires shared schemas | `feat(mcp): expose local stdio resources and analysis tools` |
| MCP-3 | MCP-2 | Parallel QA and host compatibility checks | `test(mcp): validate bounds, pagination, provenance and denial cases` |
| MCP-4 | MCP-3 plus human approval | Not safe to parallelize with write capability design | `feat(mcp): add optional confirmed write workflow` |

MCP-4 should remain out of scope until the team explicitly approves AI-assisted writes. The immediate next implementation should be MCP-1: a read-only service contract and fake server tests, not an external network endpoint.
