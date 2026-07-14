# FH6-HorizonTuner 🏎️
> **Forza Horizon 6 Real-Time Telemetry Analyzer, Vehicle Tuning Workbench & Custom Racing Dashboard Overlay**

[![Language](https://img.shields.io/badge/python-3.13%2B-blue.svg)](https://www.python.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Frontend](https://img.shields.io/badge/Frontend-Tauri%20%2B%20React-purple.svg)](https://tauri.app/)
[![Overlay](https://img.shields.io/badge/Overlay-D3D11%20%2B%20DXGI%20MPO-orange.svg)](tool/overlay/)
[![Package](https://img.shields.io/badge/Distribution-Standalone%20EXE-red.svg)](build_release.bat)

---

## Introduction

`FH6-HorizonTuner` is a dedicated telemetry data analysis and vehicle tuning assistant tool developed for *Forza Horizon 6*. This project integrates a high-performance Python backend UDP packet listener service, a modern Tauri desktop graphical user interface, and a fully injection-free DXGI MPO (Multiplane Overlay) hardware overlay rendering engine.

The current release provides **real-time telemetry dashboards**, a **customizable racing dashboard overlay (with a WYSIWYG visual editor)**, a **vehicle tuning workbench**, and **drag launch testing** — helping players monitor vehicle physics and dynamic feedback in real time.

---

## Core Features

* **Real-time Telemetry Dashboard (60Hz)**: High-refresh-rate data visualization including vehicle speed, engine RPM, power (HP), torque, boost, G-force radar, and driver input feedback.
* **Custom Dashboard Overlay**:
  - DXGI MPO hardware-level game overlay (supports exclusive fullscreen) with a three-tier defensive fallback architecture.
  - 100% injection-free, zero hook, zero anti-cheat ban risk.
  - Integrated **ExprTk mathematical expression engine** for dynamic expression bindings and conditional color thresholds.
  - Supports 4 component types: **Text**, **ProgressBar**, **LEDGroup (Shift Light)**, and **Needle (Gauge)**.
* **WYSIWYG Dashboard Designer**: Drag-and-drop layout editor in the Tauri frontend with real-time preview, property panels, conditional color rule tables, and one-click import/export layout presets.
* **Tire & Suspension Monitoring**: Real-time display of individual tire surface temperatures, hot pressures, and normalized suspension travel for all four wheels.
* **Tuning Workbench**: Management, calculation, and data logging of vehicle tuning configurations.
* **Drag Test**: Launch acceleration timing test recording, analysis, and chart playback.
* **Diagnostic Console**: Built-in live log viewer with level filtering and Traceback merging for real-time debugging.

---

## Project Architecture

```text
FH6-HorizonTuner/
├── .github/workflows/       # GitHub CI/CD workflow (Ruff Lint + Pytest)
├── backend/                 # Python FastAPI backend core
│   ├── main.py              # Backend entry point, API definitions & Overlay process management
│   ├── telemetry_listener.py # UDP telemetry socket listener and parser
│   └── car_database.json    # Built-in car database
├── frontend/                # Tauri frontend code (Vite + React + TypeScript)
│   ├── src/components/      # Frontend UI components
│   │   ├── TelemetryView.tsx    # Real-time telemetry dashboard
│   │   ├── OverlayView.tsx      # WYSIWYG dashboard layout editor
│   │   ├── TuningView.tsx       # Vehicle tuning workbench
│   │   ├── DragTestView.tsx     # Drag launch test
│   │   ├── AnalysisView.tsx     # Data analysis view
│   │   ├── DiagnosticConsole.tsx # Diagnostic log console
│   │   └── Navigation.tsx       # Navigation component
│   └── src-tauri/           # Tauri window bundler configuration
├── tool/                    # External native tooling
│   └── overlay/             # C++ DXGI MPO Overlay rendering engine
│       ├── main.cpp             # D3D11/ImGui data-driven rendering entry
│       ├── DXGIOverlayManager.h/.cpp # DXGI swap chain management & MPO/fallback
│       ├── WebSocketClient.h    # WinHTTP native WebSocket client
│       └── CMakeLists.txt       # CMake build config (auto-fetch nlohmann/json, ExprTk, ImGui)
├── lang/                    # Multi-language translation dictionaries (zh-tw, ja-jp, etc.)
├── tests/                   # Pytest unit testing suite
├── pyproject.toml           # Ruff formatting rules & Pytest configuration
├── requirements.txt         # Python dependency list
├── .pkgdirignore            # Package exclusion directory definitions
├── start_all.bat            # One-click developer environment launcher
└── build_release.bat        # One-click standalone release bundler
```

---

## Quick Start

### 1. In-game UDP Telemetry Configuration

To receive telemetry data, enable the data output feature in *Forza Horizon 6*:
1. Start the game and go to **Settings** -> **HUD and Gameplay**.
2. Locate **Data Out** and set it to **ON**.
3. Set **Data Out IP Address** to `127.0.0.1`.
4. Set **Data Out Port** to `20440`.

### 2. Launching the Tool

The project provides a highly automated launcher script that simplifies setup:
* Double-click **`start_all.bat`**:
  - Automatically searches for Python 3.13 / 3.14 on your system.
  - Automatically creates a virtual environment `.venv` in the project root.
  - Automatically installs/updates dependencies listed in `requirements.txt` (including FastAPI, Uvicorn, Websockets, Ruff, Pytest, Httpx, etc.).
  - Automatically lints and formats the codebase using `ruff`.
  - Automatically runs the backend server in the background and opens the Tauri desktop GUI.

---

## Standalone Release Bundling

You can package both the frontend and backend into a **single standalone executable (.exe)** for clean, portable, installation-free execution:

1. Double-click **`build_release.bat`**:
   - Builds the Tauri frontend project, producing `frontend.exe`.
   - Automatically compiles the C++ Overlay engine via CMake and copies `HorizonTunerOverlay.exe` to `dist/tool/`.
   - Packages the FastAPI backend, translations (`lang/`), default car parameters, and the vehicle database together using PyInstaller.
   - The final bundled executable `FH6-HorizonTuner.exe` is generated inside the `dist/` directory.

> [!NOTE]
> **Portable Path Strategy**:
> When running the standalone executable, all read-only default resources are extracted from a temporary directory. User-generated files like settings (`settings.json`), telemetry sessions (`sessions/`), and custom tunings (`tunings/`) are **automatically saved alongside the `.exe`**, ensuring your data remains fully portable.

* **Excluding Non-release Directories (.pkgdirignore)**:
    * The **`.pkgdirignore`** file manages folders excluded from the standalone bundle (e.g., `.venv`, `build`, `tests`, `tool` source code).
    * If a folder is unregistered during build, the script will prompt you:
        * **Press Y**: Automatically append the folder to `.pkgdirignore`.
        * **Press N** (default after 10s timeout): Cancel the build and warn you to manually configure packaging settings.

---

## Prerequisites

* **Python**: 3.13 or 3.14 (Standard Windows installer or `uv` managed)
* **Node.js**: 20 or higher
* **Rust / Cargo**: Required only for local Tauri compilation (automatically falls back to web debug mode if missing)
* **CMake + MSVC/MinGW**: Required for compiling the C++ DXGI Overlay engine (optional — use pre-compiled binaries if no overlay changes are needed)

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
| **Lint** | `ruff check` for static analysis + `ruff format --check` for formatting verification |
| **Test** | Full `pytest` suite execution on both Windows and Ubuntu platforms |

> [!IMPORTANT]
> The CI pipeline runs under the `CI-Approval` environment, requiring at least one reviewer approval on GitHub before execution. Ensure you pass `ruff format --check .` and `pytest` locally before pushing to avoid unnecessary CI failures.

---

## License

This project is licensed under the [MIT License](LICENSE).

Copyright (c) 2026 罐頭 (eddie772tw) & Contributors.