# Tuning developer workflow handoff

This branch is intended to be continued on a second device for FH6 real-world data collection, solver tuning, and MCP-assisted workflows.

## Current branch state

- Branch: `codex/tuning-dev-mode`
- Default tuning view remains legacy `TuningView`.
- Enable `Settings → Developer Options → Use Developer Tuning View` to open `TuningView_dev`.
- `TuningView_dev` uses only `frontend/src/utils/tuningMath_dev.ts` and the domain modules under `frontend/src/domain/tuning/`.
- The developer solver is advisory. Its tire values and game-slider mappings are calibration priors, not validated FH6 constants.
- **Localhost Read-Only MCP Server** is provided by the running FastAPI backend under `backend/mcp/`, exposing 26 tools and 5 resource URIs through `/mcp` Streamable HTTP. Its standard initialization response supplies Agent-facing configuration guidance after the endpoint is registered. Setup guide: [docs/mcp-setup-guide.md](./mcp-setup-guide.md).

## Second-device setup

1. Clone the repository and check out the PR branch after it is merged or fetch the PR branch directly.
2. Install the existing frontend and backend dependencies using the repository's normal setup instructions.
3. Start the FastAPI sidecar and frontend with the normal development launcher (`start_all.bat`).
4. Enable Forza telemetry output to the configured UDP address/port; confirm the app's telemetry status is connected.
5. Open Developer Tuning and then `Open Telemetry Capture`.
6. Before driving, enter complete metadata. Do not leave `gameBuild`, installed parts, tire type, surface, event/track or assists as `unknown` for a measured run.
7. Start Horizon Tuner, keep MCP enabled in Settings, and register the running backend's `/mcp` Streamable HTTP URL once if the client requires an endpoint. Dev mode uses `8001`; a Release Build prefers `8001` and falls back to a dynamic port when it is occupied. After connection, a compatible Agent receives the server's standard initialization guidance automatically. Use the Settings MCP card (and its fallback Popover) to confirm the actual endpoint.

## Test-user operating procedure

For each hypothesis:

1. Capture a baseline with the current tune.
2. Change one variable only: one upgrade, one slider value, one tire, one surface or one assist setting.
3. Run one familiarization pass and at least three measured repetitions on the same route.
4. Keep launch, line, gear strategy, weather, traffic conditions and assists constant.
5. Stop capture after the run, download both JSON and CSV, and keep the original files unchanged.
6. Name files with the car, test variable, baseline/candidate label and repetition number.
7. Put the hypothesis, anomalies and linked file names in the Notes field.

The JSON file is canonical because it includes `tuning-capture/v1` metadata and samples. CSV is a convenience export for spreadsheet or MoTeC-style inspection. A capture is not valid evidence if its cadence is sparse, timestamps are non-monotonic, or the metadata does not identify the installed part and game build.

## Required data packages

For a slider-boundary test, provide:

- minimum, maximum and at least three interior displayed values;
- screenshots of the game control and installed upgrade;
- whether the control snaps or moves continuously;
- front/rear side and unit setting;
- one capture per value if dynamic behaviour is being measured.

For a performance comparison, provide:

- baseline and candidate capture JSON files;
- at least three repetitions for each;
- track/event and weather;
- car ID, PI/class, drivetrain, tires, installed parts and assists;
- the expected direction of improvement and any failed runs.

For tire calibration, provide separate matrices for compound × surface × weather. Current telemetry contains slip ratio, slip angle, combined slip, temperature, speed and suspension travel, but no direct per-wheel normal load; it cannot uniquely identify `mu(Fz)` without a load-estimation model or controlled axle-load experiment.

## Agent handoff rules

### Completed tasks (by Gemini/Antigravity)

- Implemented standard JSON-RPC 2.0 Localhost Read-Only MCP Server (`backend/mcp/`):
  - 26 tools covering live cockpit inputs, vehicle dynamics, 4-wheel tires, suspension travel, race SQLite sessions, `tuning-capture/v1` A/B comparisons, car database, tuning solvers, and diagnostics.
  - 5 Resource URI templates (`fh6://telemetry/...`, `fh6://capture/...`, `fh6://car/...`, `fh6://tuning/...`, `fh6://settings/...`).
  - 21 unit tests in `tests/test_mcp_*.py` with full pass rate.
  - Standard MCP initialization instructions describing endpoint use, safety boundaries, live-data settings, and bounded query behavior.
  - Documentation: [docs/mcp-setup-guide.md](./mcp-setup-guide.md) and [docs/tuning-mcp-integration-evaluation.md](./tuning-mcp-integration-evaluation.md).

### Safe next tasks for upcoming agents

- Add fixture files under `docs/calibration/` with URLs, build, parts, confidence and capture paths.
- Add deterministic analysis functions and tests under `frontend/src/domain/tuning/` (Phase 4 / Phase 5 Road, Rally, Drift, Drag solvers).
- Use MCP tool `run_dev_tuning_solver` and `compare_captures` to backtest solver iterations against real captured data.
- Add bounded pagination/downsampling improvements if capture datasets exceed 100k samples.

### Do not do without review

- Do not replace `unknown` boundaries with guessed FH6 values.
- Do not promote community advice to `in_game_capture` confidence.
- Do not change legacy `tuningMath.ts` from developer-only evidence.
- Do not add a second UDP telemetry listener or a second 60 Hz consumer.
- Do not expose arbitrary SQL/filesystem access through MCP.
- Do not add AI tools that write car parameters, start/stop recording, delete sessions or automate the game until explicit human confirmation and rollback/audit design exist.

### Ownership and verification

- `backend/mcp/`: MCP protocol handler, service layer, tools, resources, and FastAPI transport integration.
- `frontend/src/domain/tuning/`: typed contracts, capture schema, pure solver and analysis logic.
- `frontend/src/features/tuning/`: developer UI and capture page.
- `docs/calibration/`: unverified/community/in-game evidence packages.
- `docs/*handoff*` and `docs/*evaluation*`: instructions and decision boundaries.
- Run `cmd /c "pnpm -C frontend run test"`, `cmd /c "pnpm -C frontend run build"`, `uv run --no-project --python .venv\Scripts\python.exe python -m pytest tests/`, and `git diff --check` before handing off.

## MCP operational status

The localhost read-only MCP server is available only while the FastAPI backend is running with MCP enabled. It reads bounded summaries and session windows, returns structured provenance, and does not participate in the UDP/60 Hz hot path. Endpoint: `/mcp`. The current endpoint is shown in Settings; `logs/web_port.txt` always contains the actual bound HTTP port for the running Release Build.

