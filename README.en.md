# FH6-HorizonTuner 🏎️
> **Forza Horizon 6 Real-Time Telemetry Analyzer, Vehicle Tuning Workbench & Custom Racing Dashboard Overlay**

[![Language](https://img.shields.io/badge/Rust-2021-DEA584.svg?logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![Backend](https://img.shields.io/badge/Backend-Axum%20%2B%20Tokio-009688.svg)](backend-rust/)
[![Frontend](https://img.shields.io/badge/Frontend-Tauri%20%2B%20React%2018-24C8D8.svg?logo=tauri&logoColor=white)](https://tauri.app/)
[![UI](https://img.shields.io/badge/UI-Halfmoon%20CSS-593196.svg)](https://www.gethalfmoon.com/)
[![Overlay](https://img.shields.io/badge/Overlay-HTML5%20Canvas-E34F26.svg?logo=html5&logoColor=white)](hud_overlay/)
[![Tests](https://img.shields.io/badge/Tests-Cargo%20%2B%20Vitest-46A2F1.svg?logo=vitest&logoColor=white)](tests/)
[![Code Style](https://img.shields.io/badge/Code%20Style-Ruff-261230.svg)](https://github.com/astral-sh/ruff)
[![Package](https://img.shields.io/badge/Distribution-Standalone%20EXE-red.svg)](build_all.bat)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## Introduction

`FH6-HorizonTuner` is a dedicated telemetry data analysis and vehicle tuning assistant tool developed for *Forza Horizon 6*. This project integrates a high-performance Rust Axum backend UDP packet listener service, a modern Tauri desktop graphical user interface, and a fully injection-free HTML5 Canvas / Tauri transparent racing overlay engine.

The current release provides **real-time telemetry dashboards**, a **customizable racing dashboard overlay (with a WYSIWYG visual editor)**, a **vehicle tuning workbench**, and **drag launch testing** — helping players monitor vehicle physics and dynamic feedback in real time.

---

## Core Features

* **Real-time Telemetry & Dynamics (60Hz Live Data)**:
  - High-frequency 60Hz UDP telemetry packet ingestion and high-performance visual rendering.
  - Live charts for vehicle speed, engine RPM, power/torque curves, boost pressure, pedal inputs (Throttle/Brake/Clutch), and steering angle.
  - 2D G-Force motion radar, 4-wheel independent surface tire temperatures, hot pressures, and normalized suspension travel.
  - Bounded backend pipeline metrics, with initial dyno-profile reads and persistence kept off the realtime telemetry loop.
* **Four-Stage Verifiable Tuning Workflow (V2)**:
  - **4-Stage 3-Column Streamlined Layout**: Overhauled tuning interface providing a clear 4-stage 3-column layout with immediate telemetry feedback and solver outputs.
  - **Driven by Observed Race Telemetry (Race Evidence)**: Replaced static tire compound inputs with real driving tire load and observed telemetry evidence to drive camber, alignment, and tire pressure solving.
  - **Multi-Discipline Physics Models**: Added Road FWD chassis and electric/hybrid (AEGO) front/rear torque split calculations; separated mixed-surface Rally and long-travel Cross Country baselines; derived Drift dynamic chassis and gearing from observed RPM bands; support full Drag transmission ratios and finish-speed evidence. See the [tuning development index](docs/tuning/README.md) for formula research, sources, and limitations.
* **Racing HUD Overlay & Full/Lite Clients**:
  - **All-New Classic JDM Gauge Cluster**: High-contrast vintage white-dial tachometer, shift lights, dual trip meters, and boost gauge delivering an authentic 90s Japanese sports car dashboard feel.
  - **Arcade Multi-Gauge Layout & Standardized 1080p Scaling**: Supports side-by-side modular gauges with unified anchor points and adaptive proportional scaling across resolutions.
  - **Multi-Style Overlay Support**: Features Ford Mustang S650 HMI (with Windows GSMTC media widget), GT7 style, Retro VFD vacuum fluorescent display, 093 Drift HUD, and 5 popular community overlay styles.
  - **Lite Standalone Client (`FH6-HorizonTuner_lite.exe`)**: Provides Telemetry Dashboard, HUD Overlay, and Settings tabs while sharing existing frontend features and backend lifecycle with the Full client.
  - 100% injection-free, zero hook, zero anti-cheat ban risk. Multi-channel WebSocket telemetry streaming and fullscreen adaptive auto-scaling.
  - **WYSIWYG Dashboard Designer**: Drag-and-drop layout editor, property panels, conditional threshold styling, and one-click import/export presets.
* **HorizonTuner-cli AI Agent Command-Line Tool (HorizonTuner-cli)**:
  - Official CLI tool (`fh6-agent.bat` or `python -m backend.agent_cli`) designed for AI Agents, automated scripts, and terminal runners with zero third-party dependencies (Python standard library only).
  - Dual online/offline workflow: supports online readiness/telemetry probe (`status`), live dynamics diagnosis (`diagnose`), car specifications (`spec`), and offline deterministic tuning solvers (`tune`) with `--json` machine-readable output. See [Agent CLI Guide](docs/guides/agent-cli-guide.md).
* **Android Companion (development)**:
  - A native Jetpack Compose connection shell hosts an Android WebView that loads the shared `frontend/dist/companion/index.html`, reusing the desktop five telemetry cards and four-step workflow. Android HUD display is deferred.
  - `PC TuneSessionProvider` remains the sole owner of tuning and engine measurement. Profile, workflow, and measurement commands use queue/ack semantics with `profileKey`, host lease, and client heartbeat protection against stale results and disconnected writes.
  - The currently verifiable development mode uses the PC Full app's loopback HTTP service over USB. Choose the tablet in PC Companion settings and press **Connect USB device**; the bundled ADB runtime sets up reverse forwarding and opens the app. Selection is required when multiple devices are present. LAN, QR scanning, mDNS, RFCOMM, and a native offline cache remain planned and are not advertised as available.
  - Android and protocol gate: `./gradlew :protocol-core:test :app:lintDebug :app:assembleDebug`. These checks do not constitute physical-device, USB, or gameplay end-to-end acceptance. See [Companion architecture and acceptance boundary](docs/architecture/companion-app-evaluation.md) and [Companion README](companion/README.md).
* **Drag Launch Test & Acceleration Analyzer**:
  - Automatic timing tests for 0-100 km/h, 0-200 km/h, and 1/4 mile (400m) launch acceleration.
  - Speed/RPM timeline chart playback and historical session comparison.
* **Telemetry Persistence & MoTeC i2 Exporter**:
  - Automated backend SQLite historical telemetry logging.
  - One-click exporter for professional racing analysis software **MoTeC i2** standard `.ld` log format.
* **Localhost Read-Only MCP Server (Model Context Protocol)**:
  - The running Rust backend provides a Streamable HTTP MCP endpoint at `/mcp`, offering 26 dedicated read-only tools and 5 Resource URI templates in the same process as telemetry.
  - Enables AI Agents (Claude Desktop, Cursor, Cline, Antigravity) to query live telemetry (aligned with `TelemetryView`), track sessions, A/B run delta comparisons, car specs, and tuning solvers.
  - The standard MCP `initialize` response automatically provides Agent-facing configuration and usage guidance; Settings now shows the current endpoint and status without copy-based JSON/CLI setup actions. A client still needs a one-time endpoint bootstrap for the first connection.
* **Over-The-Air (OTA) Updates & Automated Release Management**:
  - Integrated with Tauri v2 official Updater plugin and Ed25519 asymmetric cryptographic verification.
  - Supports silent startup checks and manual checks via Settings with a Glassmorphism racing modal and dynamic download progress bar.
  - Sidecar lifecycle protection: ensures Rust sidecar process is gracefully killed and UDP 8000 / HTTP 8001 ports are cleanly released before restart.
  - **Automated Web-Triggered Release Pipeline**: Maintainers simply publish a release on GitHub Web; Actions builds and signs the Full installer and attaches both Full/Lite portable executables, their Portable ZIP, `.sig`, and `latest.json`.
* **Diagnostics Console, Theme System & i18n**:
  - **Diagnostic Console**: Live log viewer with DEBUG / INFO / WARNING / ERROR level filtering and automated Traceback stitching.
  - **Design System & Theme**: Built on Halfmoon CSS v2 neon Glassmorphism skin, supporting "crosXover", "Retro VFD", and "Solar Flare" color presets.
  - **Dynamic i18n**: Multi-language framework supporting Traditional Chinese (`zh-tw`), English (`en-us`), Japanese (`ja-jp`), and more.

---

## Project Architecture

The shared `AppShell` owns workspace navigation and the application menu. Full provides Live, Tune, Sessions, and HUD; Lite provides Live and HUD. Only the active workspace mounts. Feature providers own the longer-lived Tune, Road, Sessions, and HUD state so navigation can preserve measurements and unsaved drafts. The application menu contains Settings, Appearance, Diagnostics, Updates, and About. This branch is undergoing a staged IA migration; panel decomposition and native acceptance status are recorded in the [Shell handoff](docs/frontend/ia-refactor-20260913/handoffs/shell-20260914.md).

```text
FH6-HorizonTuner/
├── .github/workflows/       # GitHub CI/CD workflows (ci.yml gatekeeping + release.yml automated packaging)
├── backend-rust/            # Independent Rust HTTP / WebSocket / UDP sidecar
│   ├── src/runtime.rs       # Process lifecycle, ports and bounded UDP delivery
│   ├── src/network.rs       # HTTP / WebSocket transport and origin checks
│   ├── src/telemetry/       # Packet codec, recorders, dyno and SQLite
│   ├── src/road/            # Road workflow, observations, matching and captures
│   ├── src/mcp/             # Existing read-only MCP tools and resources
│   ├── src/native/          # WASAPI, GSMTC and Discord workers
│   ├── src/config_service.rs # Settings, files and HUD API
│   └── tests/               # Contract fixtures and loopback process tests
├── backend/                 # Python reference, optional Agent CLI and resource data
├── frontend/                # Tauri frontend code (Vite + React + TypeScript)
│   ├── lite/                # Lite frontend HTML entrypoint
│   ├── src/app/             # Shared shell, capability contract, workspace and application-surface navigation
│   ├── src/features/        # Business Domain Modules (Features Domain)
│   │   ├── live/            # Live workspace entry and Full/Lite capability projection
│   │   ├── sessions/        # Session selection state, IO, and race-completion navigation
│   │   ├── road/            # Road workflow controller and prepare/run/review state
│   │   ├── telemetry/       # Live telemetry view (TelemetryView) & 5 expandable cards
│   │   ├── tuning/          # Vehicle tuning wizard (TuningView & Step 1~4 tabs)
│   │   ├── overlay_control/ # WYSIWYG dashboard layout editor (OverlayView)
│   │   ├── drag_test/       # Drag launch test view (DragTestView)
│   │   ├── analysis/        # Post-Race Debrief & MoTeC Ecosystem Bridge (AnalysisView, Debrief & LapDelta)
│   │   ├── car_params/      # Vehicle parameters configuration (CarParamsView)
│   │   ├── settings/        # Global system settings (SettingsView)
│   │   └── theme/           # Theme color & skin view (ThemeView)
│   ├── src/components/      # Shared UI components (ModalPortal, DiagnosticConsole, etc.)
│   ├── src/domain/tuning/    # Pure tuning domain (tires, load transfer, chassis, gearing, differential)
│   │   ├── chassis/          # Suspension and Phase 4B four-wheel load-transfer estimates
│   │   └── tires/            # Friction ellipse, tire geometry, and vertical-stiffness priors
│   ├── src/utils/           # Pure calculation utilities (tuningMath.ts, tuningDiagnosis.ts, etc.)
│   └── src-tauri/           # Tauri window & Full/Lite packaging configuration
├── hud_overlay/             # HTML5 Canvas custom racing HUD overlays
│   ├── index.html           # HUD launcher & Viewport renderer entry
│   ├── classic_jdm/         # Classic JDM vintage Japanese cluster & arcade multi-gauge
│   ├── gt7/                 # Gran Turismo 7 style racing dashboard
│   ├── vfd/                 # Retro VFD simulated fluorescent gauge
│   ├── drift/               # 093 Drift professional drift dashboard
│   └── shared/              # Shared Canvas drawing & geometry math library
├── scripts/                 # Automated release & telemetry metrics scripts (prepare_release_assets.py, release_metrics.py)
├── lang/                    # Multi-language translation dictionaries (zh-tw, ja-jp, etc.)
├── tests/                   # Pytest unit testing suite
├── pyproject.toml           # Ruff formatting rules & Pytest configuration
├── requirements.txt         # Python dependency list
├── fh6-agent.bat            # HorizonTuner-cli AI Agent entry script
├── setup_dev.bat           # Download Rust and frontend dependencies
├── dev_full.bat            # Full dev entry; compiles and launches the Rust sidecar
├── dev_lite.bat            # Lite dev entry; compiles and launches the Rust sidecar
├── setup_build.bat         # Install packaging dependencies
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

Install Node.js/pnpm, and the Windows Rust/Tauri prerequisites, then run `setup_dev.bat` once. Run setup again when dependency declarations change.

- **Full**: run `dev_full.bat`.
- **Lite**: run `dev_lite.bat` for Dashboard, HUD Overlay, and Settings.

Both development entrypoints incrementally compile the independent Rust sidecar, then let Tauri manage its lifetime. Vite HMR remains available; restart the launcher after Rust edits. Full and Lite share development ports. Product development and packaging do not require Python. The optional Agent CLI, migration reference tests and some maintenance tools still use uv.

Launching does not install packages, format source, update the vehicle database, or terminate other processes. Occupied HTTP `8001` or UDP `8000` ports cause an error. Close the existing instance before retrying. See the [development guide](docs/guides/development.md) for standalone backend, external frontend, and troubleshooting commands.

---

## Standalone Release Bundling

Run `setup_build.bat`, then `build_all.bat`. The build compiles the shared frontend, standalone Rust sidecar, and Full/Lite Tauri hosts, producing `dist/FH6-HorizonTuner.exe` and `dist/FH6-HorizonTuner_lite.exe`.

The sidecar uses `cargo build --locked --release`; `backend-rust/build.rs` embeds the HUD, language and vehicle resources. Packaging no longer uses PyInstaller. Existing settings, SQLite sessions and custom HUD data keep their paths. Release HTTP prefers 8001 and reports any fallback port through its readiness event; UDP telemetry remains independently configured.

See the [Rust migration and contract test guide](docs/backend-rust/README.md) and [development commands](docs/guides/development.md).

---

## Prerequisites

* **uv**: Optional, for Python 3.13 management, virtual environment creation, and package installation. Follow the [Python / uv toolchain policy](.agents/rules/python-uv.md).
* **Node.js**: 20 or higher
* **Rust / Cargo**: Required for the independent backend and Tauri host

---

## Developer Guide & Formatting

Start with the [documentation index](docs/README.md) for CLI/MCP guides, HUD contracts, tuning development, and calibration procedures. Previous plans and research are kept in the [archive index](docs/archive/README.md), separate from current development guidance.

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
> Run formatting and checks explicitly. Development launchers do not modify source files.

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

Optional Python tooling and reference tests follow the [Python / uv toolchain policy](.agents/rules/python-uv.md): managed Python 3.13, `uv pip`, and `uv run`. Product launch and local packaging use Cargo and pnpm directly.

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

The Release Action also builds **macOS 14+ ARM64 Full (experimental)** and **Linux x86_64 Full AppImage**. Both retain tuning, Live telemetry, recording, analysis, export and MCP, while excluding HUD, audio spectrum and system media integration. FH6 runs on another device on the same LAN. The Data Out guide lists receiver addresses and the actual UDP port; HTTP and MCP remain localhost-only.

macOS distributes an ad-hoc signed, unnotarized DMG. Linux builds on Ubuntu 22.04 and requires compatible system graphics libraries. Each platform publishes independently with its own OTA channel; configured builds do not constitute native or real-game acceptance. See the [cross-platform release guide](docs/guides/cross-platform-release.md) for assets, limits and maintenance. The EXE and Full/Lite portable contract below applies to Windows.

The release artifact is a single `FH6-HorizonTuner.exe`. No installer and no
separate sidecar file are required. The Rust backend is embedded into
the Tauri host and extracted to a versioned temporary directory at startup.
User data is stored beside the executable when that directory is writable,
with an AppData fallback for protected locations.

## Development Ports

This project uses two separate localhost ports; do not configure them interchangeably:

| Service / Purpose | Protocol | Default Port / Notes |
| :--- | :--- | :--- |
| Forza Horizon Data Out telemetry | UDP | `8000` (Receives game telemetry) |
| UDP Telemetry Forwarding (Passthrough) | UDP | `5300` (Forwards raw bytes to SimHub / dashboards) |
| Rust REST API / WebSocket | HTTP / WebSocket | `8001` (Broadcasts parsed data to UI/HUD) |

In the game, set **Data Out IP Address** to `127.0.0.1` and **Data Out Port** to `8000`. The development frontend connects to `http://127.0.0.1:8001` and `ws://127.0.0.1:8001`. Development uses `8001` as its fixed HTTP port. `TELEMETRY_PORT` remains available for changing the UDP port; `BACKEND_PORT` is retained for explicit test and external-backend workflows. To forward raw datagrams to SimHub or other tools, enable "Telemetry UDP Forwarding" in Settings and configure the destination host and port (defaults to `127.0.0.1:5300`, customizable via `TELEMETRY_FORWARD_ENABLED` / `TELEMETRY_FORWARD_PORT`).

In a Release Build, the Rust HTTP service first attempts to bind `8001`. If another process owns that port, it falls back to an available dynamic TCP port. The actual bound port is written to `logs/web_port.txt` under the data directory after binding succeeds, and the frontend uses that value directly. Forza UDP telemetry still listens on `8000` by default. When fallback occurs, the application displays a Settings/MCP popover so the current endpoint can be confirmed before a client's one-time endpoint bootstrap. After the first connection, a compatible Agent receives configuration guidance through the standard MCP `initialize` response; MCP does not define a cross-client API for injecting the initial URL.
After the Tauri sidecar reports ready, the frontend configures that actual port through a centralized transport contract. REST and WebSocket calls do not rely on global `fetch` or `WebSocket` interception, so HUD assets and other non-backend connections are never rewritten.
