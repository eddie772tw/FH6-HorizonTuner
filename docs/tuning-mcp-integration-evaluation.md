# Tuning telemetry and MCP integration evaluation

Date: 2026-08-13 (Updated: 2026-08-14)
Branch: `codex/tuning-dev-mode`
Status: **Implemented / Operational** (Completed by Gemini/Antigravity on 2026-08-14)

## Decision

There is a strong opportunity to expose the tuning evidence workflow through MCP, and the initial release has been implemented as a localhost read-only MCP server (`backend/mcp/server.py`). It lets an AI inspect live/recorded telemetry, versioned telemetry captures, calibration records, capability contracts, and deterministic solver results. It does not write car parameters, change the game, or promote calibration constants without explicit human review.

Detailed setup instructions for various AI tools (Claude Desktop, Cursor, VS Code/Cline) are documented in [docs/mcp-setup-guide.md](./mcp-setup-guide.md).

## Why this project is a good fit

The project already has the main boundaries required for an MCP adapter:

- raw telemetry arrives through `/ws/telemetry` and is captured by the developer test page as `tuning-capture/v1` JSON/CSV;
- persisted race sessions are available through `TelemetrySQLite` and `/api/analysis/sessions`;
- the developer solver has typed `tuning-dev/v1` input/output;
- capability and calibration data have explicit versioned schemas with `unknown` values instead of guessed limits;
- summary calculations are pure functions and can be reused by an MCP server without running React.

The MCP server sits beside the existing FastAPI application and calls shared Python analysis/domain code or a stable SQLite interface. It does not scrape the React UI and does not subscribe directly to the 60 Hz stream for every model request.

## Recommended MCP surface

### Read-only resources (Implemented)

| Resource URI | Purpose | Size policy |
|---|---|---|
| `fh6://telemetry/live` | Latest real-time UDP telemetry frame and ingestion status | Small, single latest frame |
| `fh6://telemetry/session/{session_id}` | Session summary with lap times, max speed, and distance | Small, preferred first read |
| `fh6://capture/{capture_id}` | Canonical `tuning-capture/v1` metadata, summary, and sample stream | Paginated or time-windowed |
| `fh6://car/{car_id}` | Versioned upgrade locks, bounds, steps, precision and game build | Read-only; show source and confidence |
| `fh6://tuning/{car_id}/{save_name}` | Stored tuning preset parameters | Read-only preset file |
| `fh6://settings/current` | Current user preferences, units, and HUD configuration | Read-only settings |

### Deterministic read-only tools (26 Tools Implemented)

| Tool | Category | Output |
|---|---|---|
| `get_live_telemetry_snapshot` | Live Telemetry | Raw frame & ingestion state |
| `get_driver_cockpit_telemetry` | Cockpit / Inputs | RPM, shift alert, gear, speed, 4 pedal bars, steer %/deg |
| `get_vehicle_dynamics_telemetry` | Dynamics / G-Force | Lateral/Longitudinal/Vertical G, pitch/roll/yaw, Power, Torque, Boost, EV Regen |
| `get_tires_status_telemetry` | 4-Wheel Tires | 4-corner temps (°C/°F), slip angle, slip ratio %, combined slip |
| `get_suspension_telemetry` | 4-Wheel Suspension | 4-corner normalized travel, bottoming alert (>=0.95), roll & pitch dive |
| `list_race_sessions` | Track Sessions | Bounded session index from SQLite |
| `get_session_summary` | Track Sessions | Lap times, max/avg speed, total distance |
| `query_session_telemetry` | Track Sessions | Downsampled time-series channel points |
| `list_tuning_captures` | Captures / Calibration | `tuning-capture/v1` dataset index |
| `get_capture_summary` | Captures / Calibration | Typed summary plus data hygiene integrity checks |
| `query_capture_window` | Captures / Calibration | Sliced time window & selected channels |
| `compare_captures` | Captures / Calibration | A/B delta comparison table and statistics |
| `list_drag_sessions` | Drag Test | Acceleration test run index |
| `get_drag_analysis` | Drag Test | 0-100, 0-200, 60ft, 1/4mi splits |
| `search_cars` | Car Database | Filtered vehicle search results |
| `get_car_details` | Car Database | Native specifications by car ID |
| `get_car_tuning_capabilities` | Capabilities | Upgrade unlock contract & slider ranges |
| `get_tuning_constants_and_priors` | Physics Priors | System calibration constants & priors |
| `list_tuning_presets` | Tuning Presets | Saved user tuning list |
| `get_tuning_preset` | Tuning Presets | Full tuning parameter values |
| `run_dev_tuning_solver` | Solvers | Pure physics tuning setup recommendations |
| `run_gearing_solver` | Solvers | AEGO geometric powerband gear ratios |
| `diagnose_telemetry_handling` | Solvers / Diagnosis | Closed-loop tire temperature/handling advice |
| `get_system_settings` | Settings & Diagnostics | Global unit & port settings |
| `get_hud_configurations` | Settings & Diagnostics | HUD master switch & audio source status |
| `get_recent_logs` | Settings & Diagnostics | Recent backend execution logs |

### Deliberately excluded from v1

- `apply_tune_to_game`
- `write_car_params`
- `promote_calibration_constant`
- `start_unattended_capture`
- arbitrary SQL or filesystem access

These would create an external-state or safety boundary and require an explicit product decision, confirmation UI, permission model, and rollback/audit design.

## Deployment recommendation

### Stage A: local stdio server (Implemented)

The Python MCP server (`backend/mcp/server.py`) operates as a child process via standard I/O for local AI hosts. The backend SQLite and capture files remain the source of truth.

## Phased implementation plan

| Phase | Dependency | Status | Notes / Evidence |
|---|---|---|---|
| MCP-0 | Capture/schema work | **Completed** | Evaluated boundaries in `docs/tuning-mcp-integration-evaluation.md` |
| MCP-1 | MCP-0 | **Completed** | Implemented `backend/mcp/service.py` with TelemetryView aligned models |
| MCP-2 | MCP-1 | **Completed** | Implemented `backend/mcp/protocol.py`, `resources.py`, `tools.py`, `server.py` |
| MCP-3 | MCP-2 | **Completed** | Added test suite `tests/test_mcp_*.py` (21 passed); user setup guide in `docs/mcp-setup-guide.md` |
| MCP-4 | MCP-3 plus human approval | Deferred | Optional confirmed write workflow (deliberately out of scope for v1) |

