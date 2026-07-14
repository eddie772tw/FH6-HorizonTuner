# FH6-HorizonTuner (Forza Horizon 6 Telemetry & Tuning Tool)

`FH6-HorizonTuner` is a dedicated telemetry data analysis and vehicle tuning assistant tool developed for *Forza Horizon 6*. This project integrates a high-performance Python backend UDP packet listener service with a modern Tauri desktop graphical user interface.

**The first release version (v1.0.0a)** focuses primarily on providing core **Real-time Telemetry** capabilities, helping players monitor vehicle physics and dynamic feedback in real time while driving. This lays a solid data foundation for subsequent systematic vehicle tuning features.

---

## Core Features (v1.0.0a)

* **Real-time Telemetry Dashboard**: Provides high-refresh-rate (60Hz) data visualization including vehicle speed, engine RPM, power (HP), torque, boost pressure, etc.
* **Tire Status Monitoring**: Displays real-time **surface temperatures** and **hot pressures** for all four tires individually to evaluate tire condition and adjust cold pressures.
* **Suspension Travel Monitoring**: Displays individual **Normalized Suspension Travel** (0.0 to 1.0) for all four wheels, helping diagnose shock bottom-outs.
* **G-Force Radar Chart**: Records and displays lateral and longitudinal G-forces dynamically, with automated markers for peak G-forces within the last 30 seconds to analyze weight transfer and maximum grip.
* **Controller Inputs Feedback**: Displays real-time percentages for throttle, brakes, clutch, handbrake, gear, and steering angle inputs to examine driving details.

---

## Quick Start

### 1. In-game UDP Telemetry Configuration
To receive telemetry data, you must enable the data out feature in *Forza Horizon 6*:
1. Start the game and go to **Settings** -> **HUD and Gameplay**.
2. Locate **Data Out** and set it to **ON**.
3. Set **Data Out IP Address** to `127.0.0.1`.
4. Set **Data Out Port** to `20440`.
5. Set **Data Out Format** to `CarDash`.

### 2. Launching the Tool
The project provides a highly automated launcher script that simplifies setup:
* Double-click and run **[start_all.bat](file:///d:/FH6-Bundle/FH6-HorizonTuner/start_all.bat)**:
  - Automatically searches for Python 3.13 / 3.14 on your system.
  - Automatically creates a virtual environment `.venv` in the project root.
  - Automatically installs/updates dependencies listed in [requirements.txt](file:///d:/FH6-Bundle/FH6-HorizonTuner/requirements.txt) (including FastAPI, Uvicorn, Websockets, Ruff, Pytest, Httpx, etc.).
  - Automatically lints and formats the codebase using `ruff`.
  - Automatically runs the backend server in the background and opens the Tauri desktop GUI.

---

## Standalone Release Bundling

You can package both the frontend and backend into a **single standalone executable (.exe)** for clean, portable, and installation-free execution:

1. Double-click and run **[build_release.bat](file:///d:/FH6-Bundle/FH6-HorizonTuner/build_release.bat)**:
   - The script builds the Tauri frontend project, producing `frontend.exe`.
   - It packages the FastAPI backend, translations (`lang/`), default car parameters (`car_params/default_car.json`), and the vehicle database (`car_database.json`) together using PyInstaller.
   - The final bundled executable `FH6-HorizonTuner.exe` is generated inside the `dist/` directory.

> [!NOTE]
> **Portable Path Strategy**:
> When running the standalone executable, all read-only default resources are extracted and loaded from a temporary directory. However, user-generated files like settings (`settings.json`), telemetry sessions (`sessions/`), and custom vehicle tunings (`tunings/`) are **automatically saved in the same directory as the `.exe`**, ensuring your data remains fully portable.

---

## Project Structure

```text
FH6-HorizonTuner/
├── .github/workflows/   # GitHub CI/CD workflow configuration
├── backend/             # FastAPI backend core code
│   ├── main.py          # Backend entry point and API definitions
│   ├── telemetry_listener.py # UDP telemetry socket listener and parser
│   └── car_database.json # Local car database
├── frontend/            # Tauri frontend code (Vite + React)
│   ├── src/components/  # Frontend UI components (TelemetryView, etc.)
│   └── src-tauri/       # Tauri window configuration and bundler
├── lang/                # Translation dictionary files
├── tests/               # Pytest unit testing directory
├── pyproject.toml       # Ruff and Pytest rules configuration
├── requirements.txt     # Unified requirements list
├── start_all.bat        # Automated developer environment launcher
└── build_release.bat    # Automated standalone release bundling script
```

---

## Development Prerequisites

* **Python**: 3.13 or 3.14 (Standard Windows installer or `uv` managed)
* **Node.js**: 20 or higher
* **Rust / Cargo**: Required only for local Tauri compilation (automatically falls back to web debug mode if missing)

---

## License

This project is licensed under the [MIT License](file:///d:/FH6-Bundle/FH6-HorizonTuner/LICENSE).
Copyright (c) 2026 罐頭 (eddie772tw) & Contributors.