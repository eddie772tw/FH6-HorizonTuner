# Tuning developer workflow handoff

This branch is intended to be continued on a second device for FH6 real-world data collection and MCP design.

## Current branch state

- Branch: `codex/tuning-dev-mode`
- Default tuning view remains legacy `TuningView`.
- Enable `Settings → Developer Options → Use Developer Tuning View` to open `TuningView_dev`.
- `TuningView_dev` uses only `frontend/src/utils/tuningMath_dev.ts` and the domain modules under `frontend/src/domain/tuning/`.
- The developer solver is advisory. Its tire values and game-slider mappings are calibration priors, not validated FH6 constants.

## Second-device setup

1. Clone the repository and check out the PR branch after it is merged or fetch the PR branch directly.
2. Install the existing frontend and backend dependencies using the repository's normal setup instructions.
3. Start the FastAPI sidecar and frontend with the normal development launcher.
4. Enable Forza telemetry output to the configured UDP address/port; confirm the app's telemetry status is connected.
5. Open Developer Tuning and then `Open Telemetry Capture`.
6. Before driving, enter complete metadata. Do not leave `gameBuild`, installed parts, tire type, surface, event/track or assists as `unknown` for a measured run.

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

### Safe next tasks

- Add fixture files under `docs/calibration/` with URLs, build, parts, confidence and capture paths.
- Add deterministic analysis functions and tests under `frontend/src/domain/tuning/` or a shared backend analysis module.
- Add MCP-1 read-only contracts and fake-server tests according to [the MCP evaluation](./tuning-mcp-integration-evaluation.md).
- Add bounded pagination/downsampling and provenance fields.

### Do not do without review

- Do not replace `unknown` boundaries with guessed FH6 values.
- Do not promote community advice to `in_game_capture` confidence.
- Do not change legacy `tuningMath.ts` from developer-only evidence.
- Do not add a second UDP telemetry listener or a second 60 Hz consumer.
- Do not expose arbitrary SQL/filesystem access through MCP.
- Do not add AI tools that write car parameters, start/stop recording, delete sessions or automate the game until explicit human confirmation and rollback/audit design exist.

### Ownership and verification

- `frontend/src/domain/tuning/`: typed contracts, capture schema, pure solver and analysis logic.
- `frontend/src/features/tuning/`: developer UI and capture page.
- `docs/calibration/`: unverified/community/in-game evidence packages.
- `docs/*handoff*` and `docs/*evaluation*`: instructions and decision boundaries.
- Run `cmd /c "pnpm -C frontend run test"`, `cmd /c "pnpm -C frontend run build"`, `pytest -q tests`, and `git diff --check` before handing off.
- Record the capture count, source URLs, build identifier and unresolved limitations in the next Journal entry.

## MCP continuation point

The recommended first MCP increment is a localhost, read-only adapter mounted beside the existing FastAPI sidecar. It should read bounded summaries and session windows, return structured provenance, and never participate in the UDP/60 Hz path. The proposed resources/tools and write boundary are documented in [tuning-mcp-integration-evaluation.md](./tuning-mcp-integration-evaluation.md).
