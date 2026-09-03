# FH6-HorizonTuner 🏎️
> **Forza Horizon 6 Real-Time Telemetry Analyzer, Vehicle Tuning Workbench & Custom Racing Dashboard Overlay**

[![Language](https://img.shields.io/badge/Python-3.13%2B-3776AB.svg?logo=python&logoColor=white)](https://www.python.org/)
[![Backend](https://img.shields.io/badge/Backend-FastAPI%20%2B%20Uvicorn-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Frontend](https://img.shields.io/badge/Frontend-Tauri%20%2B%20React%2018-24C8D8.svg?logo=tauri&logoColor=white)](https://tauri.app/)
[![UI](https://img.shields.io/badge/UI-Halfmoon%20CSS-593196.svg)](https://www.gethalfmoon.com/)
[![Overlay](https://img.shields.io/badge/Overlay-HTML5%20Canvas-E34F26.svg?logo=html5&logoColor=white)](hud_overlay/)
[![Tests](https://img.shields.io/badge/Tests-Pytest%20%2B%20Vitest-46A2F1.svg?logo=vitest&logoColor=white)](tests/)
[![Code Style](https://img.shields.io/badge/Code%20Style-Ruff-261230.svg)](https://github.com/astral-sh/ruff)
[![Package](https://img.shields.io/badge/Distribution-Standalone%20EXE-red.svg)](build_all.bat)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## Introduction

`FH6-HorizonTuner` is a dedicated telemetry data analysis and vehicle tuning assistant tool developed for *Forza Horizon 6*. This project integrates a high-performance Python FastAPI backend UDP packet listener service, a modern Tauri desktop graphical user interface, and a fully injection-free HTML5 Canvas / Tauri transparent racing overlay engine.

The current release provides **real-time telemetry dashboards**, a **customizable racing dashboard overlay (with a WYSIWYG visual editor)**, a **vehicle tuning workbench**, and **drag launch testing** — helping players monitor vehicle physics and dynamic feedback in real time.

---

## Core Features

* **Real-time Telemetry & Dynamics (60Hz Live Data)**:
  - High-frequency 60Hz UDP telemetry packet ingestion and high-performance visual rendering.
  - Live charts for vehicle speed, engine RPM, power/torque curves, boost pressure, pedal inputs (Throttle/Brake/Clutch), and steering angle.
  - 2D G-Force motion radar, 4-wheel independent surface tire temperatures, hot pressures, and normalized suspension travel.
  - Bounded backend pipeline metrics, with initial dyno-profile reads and persistence kept off the realtime telemetry loop.
* **5-Step Physics Tuning Workbench**:
  - **Step 1 Goal Setup**: Discipline selection (Road, Drift, Rally, Drag) and aerodynamic efficiency parameters.
  - **Step 2 AEGO Gearing**: Proprietary AEGO gear ratio calculation algorithm & Powerband envelope analysis, supporting 4-Speed Drag Meta, Soft Max Speed caps, and closed-loop top-speed re-distribution.
  - **Step 3 Chassis Tuner**: Anti-Roll Bars (AWD 1/65 Meta strategy), spring stiffness, Forward Rake ride height, 60% Golden Bump Damping ratio, and differential lock percentages.
  - **Step 4 Alignment & Tires**: Seasonal bias static cold tire pressure calculation, Camber / Toe / Caster geometry math.
  - **Step 5 Telemetry Calibration**: Closed-loop telemetry data ingestion with dynamic temperature delta, wheel lockup/spin, understeer, and suspension bottoming diagnostics.
* **Racing HUD Overlay & Full/Lite Clients**:
  - HTML5 Canvas hardware-accelerated standalone overlays featuring Ford Mustang S650 HMI, GT7, Retro VFD, and 093 Drift professional HUD styles.
  - The S650 center widget includes a read-only music player using Windows GSMTC for title, artist, album, track number, genre, playback status, and timeline; see the [S650 media contract](docs/s650-media-properties-contract.md) for the complete field projection and reserved integration points.
  - **Lite Standalone Client (`FH6-HorizonTuner_lite.exe`)**: Provides only the Telemetry Dashboard, HUD Overlay, and Settings tabs while sharing the existing frontend features and backend lifecycle with the Full client.
  - 100% injection-free, zero hook, zero anti-cheat ban risk. Multi-channel WebSocket telemetry streaming and fullscreen adaptive auto-scaling.
  - **WYSIWYG Dashboard Designer**: Drag-and-drop layout editor, property panels, conditional threshold styling, and one-click import/export presets.
* **Drag Launch Test & Acceleration Analyzer**:
  - Automatic timing tests for 0-100 km/h, 0-200 km/h, and 1/4 mile (400m) launch acceleration.
  - Speed/RPM timeline chart playback and historical session comparison.
* **Telemetry Persistence & MoTeC i2 Exporter**:
  - Automated backend SQLite historical telemetry logging.
  - One-click exporter for professional racing analysis software **MoTeC i2** standard `.ld` log format.
* **Localhost Read-Only MCP Server (Model Context Protocol)**:
  - The running FastAPI backend provides a Streamable HTTP MCP endpoint at `/mcp`, offering 26 dedicated read-only tools and 5 Resource URI templates in the same process as telemetry.
  - Enables AI Agents (Claude Desktop, Cursor, Cline, Antigravity) to query live telemetry (aligned with `TelemetryView`), track sessions, A/B run delta comparisons, car specs, and tuning solvers.
* **Over-The-Air (OTA) Updates & Automated Release Management**:
  - Integrated with Tauri v2 official Updater plugin and Ed25519 asymmetric cryptographic verification.
  - Supports silent startup checks and manual checks via Settings with a Glassmorphism racing modal and dynamic download progress bar.
  - Sidecar lifecycle protection: ensures Python child process is gracefully killed and UDP 8000 / HTTP 8001 ports are cleanly released before restart.
  - **Automated Web-Triggered Release Pipeline**: Maintainers simply publish a release on GitHub Web; Actions builds and signs the Full installer and attaches both Full/Lite portable executables, their Portable ZIP, `.sig`, and `latest.json`.
* **Diagnostics Console, Theme System & i18n**:
  - **Diagnostic Console**: Live log viewer with DEBUG / INFO / WARNING / ERROR level filtering and automated Traceback stitching.
  - **Design System & Theme**: Built on Halfmoon CSS v2 neon Glassmorphism skin, supporting "crosXover", "Retro VFD", and "Solar Flare" color presets.
  - **Dynamic i18n**: Multi-language framework supporting Traditional Chinese (`zh-tw`), English (`en-us`), Japanese (`ja-jp`), and more.

---

## Project Architecture

```text
FH6-HorizonTuner/
├── .github/workflows/       # GitHub CI/CD workflows (ci.yml gatekeeping + release.yml automated packaging)
├── backend/                 # Python FastAPI backend core
├── scripts/                 # Automated release & telemetry metrics scripts (prepare_release_assets.py, release_metrics.py)
│   ├── main.py              # Backend entry point, API definitions & process management
│   ├── mcp/                 # Model Context Protocol (MCP) Read-Only Server
│   │   ├── service.py       # Telemetry & tuning service layer (aligned with TelemetryView)
│   │   ├── tools.py         # 26 MCP tools declarations & dispatch
│   │   └── resources.py     # 5 Resource URI router
│   ├── telemetry_listener.py # UDP 60Hz telemetry socket listener and parser
│   ├── telemetry_runtime.py  # Pipeline metrics and non-blocking dyno profile cache/persistence
│   ├── system_media.py       # Windows GSMTC snapshot query/cache and overlay broadcast source
│   ├── system_media_contract.py # Pure GSMTC media/playback/timeline to bounded JSON mapping
│   ├── core/                # Core telemetry processing & calculation modules
│   ├── routers/             # API routers (telemetry, tuning, overlay, drag, log, etc.)
│   ├── services/            # System services & background state managers
│   ├── telemetry_sqlite.py   # Historical telemetry SQLite storage engine
│   ├── motec_exporter.py    # MoTeC i2 professional telemetry exporter (41 full channels + GPS projection)
│   ├── motec_template.py    # MoTeC i2 Pro 5-worksheet XML workspace generator
│   └── car_database.json    # Built-in car database
├── frontend/                # Tauri frontend code (Vite + React + TypeScript)
│   ├── lite/                # Lite frontend HTML entrypoint
│   ├── src/features/        # Business Domain Modules (Features Domain)
│   │   ├── telemetry/       # Live telemetry view (TelemetryView) & 5 expandable cards
│   │   ├── tuning/          # Vehicle tuning wizard (TuningView & Step 1~5 tabs)
│   │   ├── overlay_control/ # WYSIWYG dashboard layout editor (OverlayView)
│   │   ├── drag_test/       # Drag launch test view (DragTestView)
│   │   ├── analysis/        # Post-Race Debrief & MoTeC Ecosystem Bridge (AnalysisView, Debrief & LapDelta)
│   │   ├── car_params/      # Vehicle parameters configuration (CarParamsView)
│   │   ├── settings/        # Global system settings (SettingsView)
│   │   └── theme/           # Theme color & skin view (ThemeView)
│   ├── src/components/      # Shared UI components (Navigation, DiagnosticConsole, etc.)
│   ├── src/domain/tuning/    # Pure tuning domain (tires, load transfer, chassis, gearing, differential)
│   │   ├── chassis/          # Suspension and Phase 4B four-wheel load-transfer estimates
│   │   └── tires/            # Friction ellipse, tire geometry, and vertical-stiffness priors
│   ├── src/utils/           # Pure calculation utilities (tuningMath.ts, tuningDiagnosis.ts, etc.)
│   └── src-tauri/           # Tauri window & Full/Lite packaging configuration
├── hud_overlay/             # HTML5 Canvas custom racing HUD overlays
│   ├── index.html           # HUD launcher & Viewport renderer entry
│   ├── gt7/                 # Gran Turismo 7 style racing dashboard
│   ├── vfd/                 # Retro VFD simulated fluorescent gauge
│   ├── drift/               # 093 Drift professional drift dashboard
│   └── shared/              # Shared Canvas drawing & geometry math library
├── lang/                    # Multi-language translation dictionaries (zh-tw, ja-jp, etc.)
├── tests/                   # Pytest unit testing suite
├── pyproject.toml           # Ruff formatting rules & Pytest configuration
├── requirements.txt         # Python dependency list
├── .pkgdirignore            # Package exclusion directory definitions
├── start_all.bat            # One-click developer environment launcher (launches backend & frontend)
├── start_all_lite.bat       # One-click Lite three-tab launcher
├── start_backend.bat        # Launches Python FastAPI backend service individually
├── start_frontend.bat       # Launches Vite + Tauri frontend UI individually
└── build_all.bat            # One-click standalone release bundler
```

---

## Quick Start

### 1. In-game UDP Telemetry Configuration

To receive telemetry data, enable the data output feature in *Forza Horizon 6*:
1. Start the game and go to **Settings** -> **HUD and Gameplay**.
2. Locate **Data Out** and set it to **ON**.
3. Set **Data Out IP Address** to `127.0.0.1`.
4. Set **Data Out Port** to `8000`.

### 2. Launching the Tool

The project provides highly automated launcher scripts:
* **Double-click `start_all.bat`** (Recommended full launch):
  - Requires `uv`, which selects managed CPython 3.13 and creates the project `.venv`.
  - Installs and verifies `requirements.txt` through `uv pip`; it never falls back to a PATH-level Python or pip.
  - Runs Ruff and the backend through `uv run` with the same `.venv` interpreter.
  - Automatically lints and formats the codebase using `ruff`.
  - Automatically runs the backend server in the background and opens the Tauri desktop GUI.
* **Modular launch (For standalone development)**:
  - **`start_backend.bat`**: Launches only the FastAPI backend and UDP telemetry listener. In development, FastAPI/WebSocket uses `http://127.0.0.1:8001`, while Forza UDP telemetry uses `127.0.0.1:8000`.
  - **`start_frontend.bat`**: Launches only the Vite + React dev server and Tauri window.
  - **`start_all_lite.bat`**: Launches the shared backend and Lite frontend; Lite exposes only Dashboard, HUD Overlay, and Settings.

---

## Standalone Release Bundling

You can package both the frontend and backend into a **single standalone executable (.exe)** using the standard **Tauri (Rust Host) + Python Sidecar** architecture:

1. Double-click **`build_all.bat`**:
   - **Phase 1 (Python Sidecar)**: PyInstaller builds the FastAPI backend into a dedicated Sidecar binary `server-sidecar-x86_64-pc-windows-msvc.exe` inside `frontend/src-tauri/bin/`.
   - **Phase 2 (Release Build Host)**: The shared frontend is built once, then Tauri builds Full and Lite separately, producing `dist/FH6-HorizonTuner.exe` and `dist/FH6-HorizonTuner_lite.exe` without installers. The release Portable ZIP contains both.

> [!NOTE]
> **Release Build Path Strategy**:
> When running the standalone executable, default resources are extracted by the Sidecar. User-generated files including settings (`settings.json`), telemetry sessions (`sessions/`), custom tunings (`tunings/`), custom car parameters (`car_params/`), translations (`lang/`), and custom HUD themes (`hud_overlay/`) are **automatically saved and maintained alongside the `.exe`**, ensuring 100% data portability.

> **Custom HUD packages**: Place a package at `hud_overlay/<package-name>/index.html` beside the Release Build `.exe`; it is detected automatically and can be selected in the HUD menu. See [Release Build custom HUD packages](docs/portable-custom-hud.md).

* **Excluding Non-release Directories (.pkgdirignore)**:
    * The **`.pkgdirignore`** file manages folders excluded from the standalone bundle (e.g., `.venv`, `build`, `tests`).
    * If a folder is unregistered during build, the script will prompt you:
        * **Press Y**: Automatically append the folder to `.pkgdirignore`.
        * **Press N** (default after 10s timeout): Cancel the build and warn you to manually configure packaging settings.

---

## Prerequisites

* **uv**: Required for Python 3.13 management, virtual environment creation, and package installation. Follow the [Python / uv toolchain policy](.agents/rules/python-uv.md).
* **Node.js**: 20 or higher
* **Rust / Cargo**: Required only for local Tauri compilation (automatically falls back to web debug mode if missing)

---

## Developer Guide & Formatting

Agent collaboration rules are in [`.agents/AGENTS.md`](.agents/AGENTS.md); read them before making changes. Project decisions and learnings are maintained in [`.agents/Journal.md`](.agents/Journal.md).

The project uses **[Ruff](https://github.com/astral-sh/ruff)** as the standard Python code formatter and linter with a **Black-compatible** style. To ensure consistent code style and pass GitHub Actions CI checks, follow these procedures before committing:

### Python Formatting (Ruff)

* **Reformat all code**:
    ```bash
    uv run --no-project --python .venv\Scripts\python.exe ruff format .
    ```
* **Verify formatting (CI also runs this)**:
    ```bash
    uv run --no-project --python .venv\Scripts\python.exe ruff format --check .
    ```
* **Static code analysis (Lint)**:
    ```bash
    uv run --no-project --python .venv\Scripts\python.exe ruff check .
    ```

> [!TIP]
> The `start_all.bat` launcher script integrates automatic formatting. Every time you run `start_all.bat`, it automatically executes `ruff format` and `ruff check` to ensure your code always meets formatting standards.

### Unit Testing (Pytest)

All automated tests are located in the `tests/` directory. Before submitting a PR, ensure all tests pass:

```bash
# Run with the project-managed Python environment
uv run --no-project --python .venv\Scripts\python.exe python -m pytest tests/

# Or run a specific test file
uv run --no-project --python .venv\Scripts\python.exe python -m pytest tests/test_overlay_api.py -v
```

Current test suite coverage:
| Test File | Coverage Area |
| :--- | :--- |
| `test_telemetry_listener.py` | UDP telemetry packet parsing & listener logic |
| `test_telemetry_runtime.py` | Pipeline metrics contract and non-blocking profile load/write coalescing |
| `test_telemetry_metrics_api.py` | Telemetry diagnostics API response contract |
| `test_log_api.py` | Backend log API, Traceback merging & level filtering |
| `test_overlay_api.py` | Overlay layout CRUD, process start/stop & status tracking |
| `test_drag_recorder.py` | Drag launch test data recording & analysis |

### Frontend Unit Testing (Vitest)

Frontend uses **[Vitest](https://vitest.dev/)** as unit test runner.
```bash
cd frontend && pnpm run test
```

Current frontend test suite covers 71 test files with 449 unit tests:
| Test File | Coverage Area |
| :--- | :--- |
| `tuningMath.test.ts` | 29 test cases covering AEGO gear ratios, springs, ARBs, damping, downforce & alignment |
| `tuningDiagnosis.test.ts` | Real-time telemetry diagnosis and chassis problem detection logic |
| `loadTransfer.test.ts` / `tireGeometry.test.ts` | Phase 4B four-wheel normal-load estimates, load transfer, and tire-geometry priors |
| `driftMath.test.ts` | Drift scoring and dynamic slip angle math |
| `telemetryCards.test.ts` | Telemetry cards formatting and status mapping |
| `telemetryHistory.test.ts` / `telemetryDetailMath.test.ts` | Bounded history, tire/dynamics detail mapping, and suspension summary tests |
| `tireModel.test.ts` | Friction ellipse boundary, zero-capacity fix & feasible guard (7 tests) |
| `suspensionSolver.test.ts` | Critical damping, damping-ratio priors & FH6 slider mapping layers (3 tests) |
| `timestampIntegration.test.ts` | Phase 6 timestamp integration - airtime, drift ratio, impact window & non-monotonic unknown |
| `thermalDiagnosis.test.ts` | Phase 6 four-wheel tire temperature gradient, camber & pressure advice |
| `dynamicsDiagnosis.test.ts` | Phase 6 ARB / damping / differential combined-slip diagnosis & confidence tiers |
| `capabilityFilter.test.ts` | Phase 7 capability filter function (unlocked / locked / unknown keys) |
| `presetSerializer.test.ts` | Phase 7 `tuning-preset/v1` serialization round-trip & schema version validation |
| Other `*.test.ts` | Additional test suites covering ExprTk, VFD gauge, audio & CSS validation |

---

## Contributing Guidelines

### Branch & Commit Conventions

1. **Branch naming**: Create feature branches from `main` using `feature/<feature-name>` or `fix/<issue-description>`.
2. **Commit messages**: Follow [Conventional Commits](https://www.conventionalcommits.org/):
   ```
   feat: add new component type for overlay
   fix: resolve HDR color space detection issue
   test: implement pytest suite for overlay API
   docs: update README with contribution guidelines
   refactor: extract expression engine into separate module
   ```
3. **Pull Requests**: Clearly describe changes, motivation, and test results in the PR description.

### Pre-submission Checklist

Before submitting a Pull Request, please verify the following:

- [ ] Code passes `uv run --no-project --python .venv\Scripts\python.exe ruff format --check .`
- [ ] Code passes `uv run --no-project --python .venv\Scripts\python.exe ruff check .`
- [ ] All existing unit tests pass through `uv run ... python -m pytest`
- [ ] If new API routes or core logic were added, corresponding unit tests have been written
- [ ] If `tuningMath.ts` / `tuningDiagnosis.ts` pure logic was updated, corresponding Vitest unit tests have been added
- [ ] If significant architectural changes or core modules were added, `README.md` & `README.en.md` have been updated
- [ ] If UI components or frontend logic were modified, functionality has been locally verified
- [ ] If new translation keys were added, both `lang/zh-tw.json` and `lang/ja-jp.json` have been updated
- [ ] Commit messages follow Conventional Commits conventions

### Adding New Language Support

The project supports a fully dynamic multi-language framework. Contributors can add new languages without changing any code:

1. **Create a locale file**: Create a JSON file named after the ISO 639 locale code (e.g. `fr-fr.json`) inside the `lang/` directory. Copy `lang/en-us.json` as a starting template.
2. **Register the locale name**: Edit `lang/iso639.json` and append your locale code mapping. Example:
   ```json
   {
     "fr-fr": "Français (French)"
   }
   ```
3. **Translation PR format**: When submitting a language support PR, use:
   - **PR Title**: `feat(i18n): add <locale-name> language support` (e.g. `feat(i18n): add French (fr-fr) language support`)

---

## CI/CD Pipeline

All Python tooling is governed by the [Python / uv toolchain policy](.agents/rules/python-uv.md). The local launch/build scripts and GitHub workflows use the same pinned uv bootstrap, managed Python 3.13 environment, uv cache, `uv pip`, and `uv run` contract.

The project uses GitHub Actions for automated quality control. Every push to `main`/`master` or Pull Request triggers:

| Stage | Description |
| :--- | :--- |
| **Lint** | uv-managed `ruff check` static analysis + `ruff format --check` formatting verification |
| **Test (Backend)** | Full `pytest` suite execution on both Windows and Ubuntu platforms |
| **Test (Frontend)** | `cd frontend && pnpm run test` Vitest suite execution (covers `tuningMath.ts` & UI logic) |

> [!IMPORTANT]
> The CI pipeline is now fully automated and no longer requires reviewer approval to trigger. Ensure you run the uv-managed Ruff and Pytest commands locally before pushing to avoid unnecessary CI failures.

---

## License

This project is licensed under the [MIT License](LICENSE).

Copyright (c) 2026 罐頭 (eddie772tw) & Contributors.

---

## Security Policy

We are committed to the security of our users and project. If you discover a security vulnerability, please refer to [SECURITY.md](SECURITY.md) to report it privately via GitHub Private Vulnerability Reporting.

---

## Credits & Acknowledgements

* **Credits**: [Paburrito/forza-horizon-6-custom-hud](https://github.com/Paburrito/forza-horizon-6-custom-hud)
  Special thanks to Paburrito for the original "Forza Horizon 6 - Custom HUD" design and inspiration.

---

## Release Build Contract

The release artifact is a single `FH6-HorizonTuner.exe`. No installer and no
separate sidecar file are required. The PyInstaller backend is embedded into
the Tauri host and extracted to a versioned temporary directory at startup.
User data is stored beside the executable when that directory is writable,
with an AppData fallback for protected locations.

## Development Ports

This project uses two separate localhost ports; do not configure them interchangeably:

| Service / Purpose | Protocol | Default Port / Notes |
| :--- | :--- | :--- |
| Forza Horizon Data Out telemetry | UDP | `8000` (Receives game telemetry) |
| UDP Telemetry Forwarding (Passthrough) | UDP | `5300` (Forwards raw bytes to SimHub / dashboards) |
| FastAPI REST API / WebSocket | HTTP / WebSocket | `8001` (Broadcasts parsed data to UI/HUD) |

In the game, set **Data Out IP Address** to `127.0.0.1` and **Data Out Port** to `8000`. The development frontend connects to `http://127.0.0.1:8001` and `ws://127.0.0.1:8001`. Development uses `8001` as its fixed HTTP port. `TELEMETRY_PORT` remains available for changing the UDP port; `BACKEND_PORT` is retained for explicit test and external-backend workflows. To forward raw datagrams to SimHub or other tools, enable "Telemetry UDP Forwarding" in Settings and configure the destination host and port (defaults to `127.0.0.1:5300`, customizable via `TELEMETRY_FORWARD_ENABLED` / `TELEMETRY_FORWARD_PORT`).

In a Release Build, the FastAPI HTTP service first attempts to bind `8001`. If another process owns that port, it falls back to an available dynamic TCP port. The actual bound port is written to `logs/web_port.txt` under the data directory after binding succeeds, and the frontend uses that value directly. Forza UDP telemetry still listens on `8000` by default. When fallback occurs, the application displays a Settings/MCP popover so the current endpoint can be confirmed before configuring an Agent.
After the Tauri sidecar reports ready, the frontend configures that actual port through a centralized transport contract. REST and WebSocket calls do not rely on global `fetch` or `WebSocket` interception, so HUD assets and other non-backend connections are never rewritten.

