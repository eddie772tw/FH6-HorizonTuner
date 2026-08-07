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
* **5-Step Physics Tuning Workbench**:
  - **Step 1 Goal Setup**: Discipline selection (Road, Drift, Rally, Drag) and aerodynamic efficiency parameters.
  - **Step 2 AEGO Gearing**: Proprietary AEGO gear ratio calculation algorithm & Powerband envelope analysis, supporting 4-Speed Drag Meta, Soft Max Speed caps, and closed-loop top-speed re-distribution.
  - **Step 3 Chassis Tuner**: Anti-Roll Bars (AWD 1/65 Meta strategy), spring stiffness, Forward Rake ride height, 60% Golden Bump Damping ratio, and differential lock percentages.
  - **Step 4 Alignment & Tires**: Seasonal bias static cold tire pressure calculation, Camber / Toe / Caster geometry math.
  - **Step 5 Telemetry Calibration**: Closed-loop telemetry data ingestion with dynamic temperature delta, wheel lockup/spin, understeer, and suspension bottoming diagnostics.
* **Racing HUD Overlay & WYSIWYG Designer**:
  - HTML5 Canvas hardware-accelerated standalone overlays featuring GT7, Retro VFD, and 093 Drift professional HUD styles.
  - 100% injection-free, zero hook, zero anti-cheat ban risk. Multi-channel WebSocket telemetry streaming and fullscreen adaptive auto-scaling.
  - **WYSIWYG Dashboard Designer**: Drag-and-drop layout editor, property panels, conditional threshold styling, and one-click import/export presets.
* **Drag Launch Test & Acceleration Analyzer**:
  - Automatic timing tests for 0-100 km/h, 0-200 km/h, and 1/4 mile (400m) launch acceleration.
  - Speed/RPM timeline chart playback and historical session comparison.
* **Telemetry Persistence & MoTeC i2 Exporter**:
  - Automated backend SQLite historical telemetry logging.
  - One-click exporter for professional racing analysis software **MoTeC i2** standard `.ld` log format.
* **Diagnostics Console, Theme System & i18n**:
  - **Diagnostic Console**: Live log viewer with DEBUG / INFO / WARNING / ERROR level filtering and automated Traceback stitching.
  - **Design System & Theme**: Built on Halfmoon CSS v2 neon Glassmorphism skin, supporting "crosXover", "Retro VFD", and "Solar Flare" color presets.
  - **Dynamic i18n**: Multi-language framework supporting Traditional Chinese (`zh-tw`), English (`en-us`), Japanese (`ja-jp`), and more.

---

## Project Architecture

```text
FH6-HorizonTuner/
├── .github/workflows/       # GitHub CI/CD workflow (Ruff Lint + Pytest)
├── backend/                 # Python FastAPI backend core
│   ├── main.py              # Backend entry point, API definitions & process management
│   ├── telemetry_listener.py # UDP 60Hz telemetry socket listener and parser
│   ├── core/                # Core telemetry processing & calculation modules
│   ├── routers/             # API routers (telemetry, tuning, overlay, drag, log, etc.)
│   ├── services/            # System services & background state managers
│   ├── telemetry_sqlite.py   # Historical telemetry SQLite storage engine
│   ├── motec_exporter.py    # MoTeC i2 professional telemetry exporter
│   └── car_database.json    # Built-in car database
├── frontend/                # Tauri frontend code (Vite + React + TypeScript)
│   ├── src/features/        # Business Domain Modules (Features Domain)
│   │   ├── telemetry/       # Live telemetry view (TelemetryView) & 4 dynamic cards
│   │   ├── tuning/          # Vehicle tuning wizard (TuningView & Step 1~5 tabs)
│   │   ├── overlay_control/ # WYSIWYG dashboard layout editor (OverlayView)
│   │   ├── drag_test/       # Drag launch test view (DragTestView)
│   │   ├── analysis/        # Data analysis view (AnalysisView)
│   │   ├── car_params/      # Vehicle parameters configuration (CarParamsView)
│   │   ├── settings/        # Global system settings (SettingsView)
│   │   └── theme/           # Theme color & skin view (ThemeView)
│   ├── src/components/      # Shared UI components (Navigation, DiagnosticConsole, etc.)
│   ├── src/utils/           # Pure calculation utilities (tuningMath.ts, tuningDiagnosis.ts, etc.)
│   └── src-tauri/           # Tauri window bundler configuration
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
  - Automatically searches for Python 3.13 / 3.14 on your system.
  - Automatically creates a virtual environment `.venv` in the project root.
  - Automatically installs/updates dependencies listed in `requirements.txt` (including FastAPI, Uvicorn, Websockets, Ruff, Pytest, Httpx, etc.).
  - Automatically lints and formats the codebase using `ruff`.
  - Automatically runs the backend server in the background and opens the Tauri desktop GUI.
* **Modular launch (For standalone development)**:
  - **`start_backend.bat`**: Launches only the FastAPI backend and UDP telemetry listener (`http://127.0.0.1:8000`).
  - **`start_frontend.bat`**: Launches only the Vite + React dev server and Tauri window.

---

## Standalone Release Bundling

You can package both the frontend and backend into a **single standalone executable (.exe)** using the standard **Tauri (Rust Host) + Python Sidecar** architecture:

1. Double-click **`build_all.bat`**:
   - **Phase 1 (Python Sidecar)**: PyInstaller builds the FastAPI backend into a dedicated Sidecar binary `server-sidecar-x86_64-pc-windows-msvc.exe` inside `frontend/src-tauri/bin/`.
   - **Phase 2 (Tauri Bundle)**: Tauri bundles the React frontend and Python Sidecar binary into a single standalone portable package inside `frontend/src-tauri/target/release/bundle/`.

> [!NOTE]
> **Portable Path Strategy**:
> When running the standalone executable, default resources are extracted by the Sidecar. User-generated files including settings (`settings.json`), telemetry sessions (`sessions/`), custom tunings (`tunings/`), custom car parameters (`car_params/`), translations (`lang/`), and custom HUD themes (`hud_overlay/`) are **automatically saved and maintained alongside the `.exe`**, ensuring 100% data portability.

* **Excluding Non-release Directories (.pkgdirignore)**:
    * The **`.pkgdirignore`** file manages folders excluded from the standalone bundle (e.g., `.venv`, `build`, `tests`).
    * If a folder is unregistered during build, the script will prompt you:
        * **Press Y**: Automatically append the folder to `.pkgdirignore`.
        * **Press N** (default after 10s timeout): Cancel the build and warn you to manually configure packaging settings.

---

## Prerequisites

* **Python**: 3.13 or 3.14 (Standard Windows installer or `uv` managed)
* **Node.js**: 20 or higher
* **Rust / Cargo**: Required only for local Tauri compilation (automatically falls back to web debug mode if missing)

---

## Developer Guide & Formatting

The project uses **[Ruff](https://github.com/astral-sh/ruff)** as the standard Python code formatter and linter with a **Black-compatible** style. To ensure consistent code style and pass GitHub Actions CI checks, follow these procedures before committing:

### Python Formatting (Ruff)

* **Reformat all code**:
    ```bash
    # Outside venv
    ruff format .

    # Inside Windows venv
    .venv\Scripts\ruff.exe format .
    ```
* **Verify formatting (CI also runs this)**:
    ```bash
    ruff format --check .
    ```
* **Static code analysis (Lint)**:
    ```bash
    ruff check .
    ```

> [!TIP]
> The `start_all.bat` launcher script integrates automatic formatting. Every time you run `start_all.bat`, it automatically executes `ruff format` and `ruff check` to ensure your code always meets formatting standards.

### Unit Testing (Pytest)

All automated tests are located in the `tests/` directory. Before submitting a PR, ensure all tests pass:

```bash
# Inside Windows venv
.venv\Scripts\pytest

# Or run a specific test file
.venv\Scripts\pytest tests/test_overlay_api.py -v
```

Current test suite coverage:
| Test File | Coverage Area |
| :--- | :--- |
| `test_telemetry_listener.py` | UDP telemetry packet parsing & listener logic |
| `test_log_api.py` | Backend log API, Traceback merging & level filtering |
| `test_overlay_api.py` | Overlay layout CRUD, process start/stop & status tracking |
| `test_drag_recorder.py` | Drag launch test data recording & analysis |

### Frontend Unit Testing (Vitest)

Frontend uses **[Vitest](https://vitest.dev/)** as unit test runner.
```bash
cd frontend && pnpm run test
```

Current frontend test suite covers 13 test files with 123 unit tests:
| Test File | Coverage Area |
| :--- | :--- |
| `tuningMath.test.ts` | 29 test cases covering AEGO gear ratios, springs, ARBs, damping, downforce & alignment |
| `tuningDiagnosis.test.ts` | Real-time telemetry diagnosis and chassis problem detection logic |
| `driftMath.test.ts` | Drift scoring and dynamic slip angle math |
| `telemetryCards.test.ts` | Telemetry cards formatting and status mapping |
| Other `*.test.ts` | 10 additional test suites covering ExprTk, VFD gauge, audio & CSS validation |

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

- [ ] Code passes `ruff format --check .` formatting verification
- [ ] Code passes `ruff check .` static analysis (no errors or warnings)
- [ ] All existing unit tests pass (`pytest` all green)
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

The project uses GitHub Actions for automated quality control. Every push to `main`/`master` or Pull Request triggers:

| Stage | Description |
| :--- | :--- |
| **Lint** | `ruff check` static analysis + `ruff format --check` formatting verification |
| **Test (Backend)** | Full `pytest` suite execution on both Windows and Ubuntu platforms |
| **Test (Frontend)** | `cd frontend && pnpm run test` Vitest suite execution (covers `tuningMath.ts` & UI logic) |

> [!IMPORTANT]
> The CI pipeline is now fully automated and no longer requires reviewer approval to trigger. Ensure you pass `ruff format --check .` and `pytest` locally before pushing to avoid unnecessary CI failures.

---

## License

This project is licensed under the [MIT License](LICENSE).

Copyright (c) 2026 罐頭 (eddie772tw) & Contributors.

---

## Credits & Acknowledgements

* **Credits**: [Paburrito/forza-horizon-6-custom-hud](https://github.com/Paburrito/forza-horizon-6-custom-hud)
  Special thanks to Paburrito for the original "Forza Horizon 6 - Custom HUD" design and inspiration.

