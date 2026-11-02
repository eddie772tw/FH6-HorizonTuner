<h1 align="center">FH6-HorizonTuner</h1>

<p align="center">
  <strong>Telemetry, tuning and custom HUDs for Forza Horizon 6</strong><br>
  See how your car behaves, tune from measured data and build your own racing dashboard.
</p>

<p align="center">
  <a href="https://github.com/eddie772tw/FH6-HorizonTuner/releases/latest"><img src="https://img.shields.io/github/v/release/eddie772tw/FH6-HorizonTuner?label=release" alt="Latest stable release"></a>
  <a href="https://github.com/eddie772tw/FH6-HorizonTuner/actions/workflows/ci.yml"><img src="https://github.com/eddie772tw/FH6-HorizonTuner/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI status on main"></a>
  <a href="https://github.com/eddie772tw/FH6-HorizonTuner/releases"><img src="https://img.shields.io/github/downloads/eddie772tw/FH6-HorizonTuner/total" alt="GitHub Release downloads"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/eddie772tw/FH6-HorizonTuner" alt="MIT license"></a>
</p>

<p align="center">
  <a href="README.md">繁體中文</a> · <strong>English</strong>
</p>

<p align="center">
  <a href="#readme-download">Download</a> ·
  <a href="#readme-quick-start">Quick start</a> ·
  <a href="#readme-features">Features</a> ·
  <a href="#readme-documentation">Docs</a> ·
  <a href="#readme-development">Development</a> ·
  <a href="#readme-contributing">Contributing</a>
</p>

FH6-HorizonTuner receives vehicle data through the game's **Data Out UDP telemetry** and brings together live dashboards, a four-step tuning workflow, recording and race analysis. On Windows, customizable transparent HUDs run in separate windows without injecting into the game process.

The desktop interface uses Tauri, React and TypeScript. A Rust backend handles telemetry, storage and tuning calculations.

<a id="readme-screenshots"></a>

## Preview

| AP1 Rev Arc | LFA Center Ring |
| :---: | :---: |
| ![Offline preview of the AP1 Rev Arc amber tachometer HUD](docs/releases/assets/v1.7.2/hud-ap1-rev-arc.png) | ![Offline preview of the LFA Center Ring tachometer HUD](docs/releases/assets/v1.7.2/hud-lfa-center-ring.png) |
| **Stack ST8100** | **R34 MFD** |
| ![Offline preview of the Stack ST8100 analogue and dot-matrix HUD](docs/releases/assets/v1.7.2/hud-stack-st8100.png) | ![Offline preview of the R34 MFD multi-channel display](docs/releases/assets/v1.7.2/hud-r34-mfd-multi.png) |

*These HUD previews come from the v1.7.2 documentation and use synthetic telemetry. They are offline renders, not in-game screenshots. See [image provenance](docs/releases/assets/v1.7.2/README.md) and the [full gallery](docs/releases/v1.7.2.md).*

<a id="readme-download"></a>

## Download

**[Get the latest stable release →](https://github.com/eddie772tw/FH6-HorizonTuner/releases/latest)**

| Edition | Use it for | Download |
| --- | --- | --- |
| **Windows Full** · x86_64 | Live telemetry, tuning, recording, race analysis and HUDs | [Installer](https://github.com/eddie772tw/FH6-HorizonTuner/releases/latest/download/FH6-HorizonTuner-Full-Installer.exe) · [Portable](https://github.com/eddie772tw/FH6-HorizonTuner/releases/latest/download/FH6-HorizonTuner-Full-Portable.exe) |
| **Windows Lite** · x86_64 | Live telemetry, HUDs and settings | [Installer](https://github.com/eddie772tw/FH6-HorizonTuner/releases/latest/download/FH6-HorizonTuner-Lite-Installer.exe) · [Portable](https://github.com/eddie772tw/FH6-HorizonTuner/releases/latest/download/FH6-HorizonTuner-Lite-Portable.exe) |
| **Linux Full** · x86_64 | Telemetry from another device on the same LAN, tuning, recording and analysis; excludes HUDs, audio spectrum and system media integration | [AppImage](https://github.com/eddie772tw/FH6-HorizonTuner/releases/latest/download/FH6-HorizonTuner-Full-Linux-x86_64.AppImage) |

- **Windows portable bundle**: [Download Full + Lite ZIP](https://github.com/eddie772tw/FH6-HorizonTuner/releases/latest/download/FH6-HorizonTuner-Portable-Bundle.zip). Extract and run the edition you need; no separate backend download is required.
- **Runtime requirements**: Windows requires WebView2 Runtime. Linux requires compatible GTK/WebKitGTK libraries and an AppImage runtime environment. macOS is currently unsupported. See [platform requirements and limitations](docs/guides/cross-platform-release.md).
- **Android Companion (Beta)**: Android 13+ with Windows Full kept running; supports LAN QR pairing and USB/ADB. Published releases currently have no APK. See the [Companion README](companion/README.md) for builds and acceptance status.

> [!NOTE]
> This page describes `main`. Available features and assets depend on the [release you download](https://github.com/eddie772tw/FH6-HorizonTuner/releases). A successful build does not establish acceptance across every platform or gameplay scenario.

<a id="readme-quick-start"></a>

## Quick start

1. **Launch HorizonTuner**: Choose Full or Lite. Run the portable executable directly, or complete the installer.
2. **Enable Data Out in the game**: Open **Settings → HUD and Gameplay**, enable Data Out and enter the values below.
3. **Check incoming data**: Drive briefly, then check the app's Data Out guide and live telemetry view for incoming packets, speed and RPM updates.

| In-game setting | Game and app on the same Windows PC | Game on another LAN device |
| --- | --- | --- |
| Data Out | `ON` | `ON` |
| Data Out IP Address | `127.0.0.1` | Receiver PC's LAN IP shown in the Data Out guide |
| Data Out Port | `8000` by default | UDP port shown in the guide; default `8000` |

For LAN use, connect both devices to the same network and allow the receiving UDP port through the receiver's firewall. If you changed the port, use the value shown in the guide. **The game sends to the UDP telemetry port, not HTTP/MCP port `8001`.** See [LAN Data Out setup](docs/guides/cross-platform-release.md#遊戲端設定).

Start with the live dashboard, then use Full's tuning workspace to configure the car and collect measurements. Apply tuning recommendations manually in the game.

<a id="readme-features"></a>

## Features

- **Live telemetry**: Follow speed, RPM, power/torque, boost, driver inputs, G-force, four-wheel tire temperatures and suspension travel through live charts.
- **Four-step tuning**: Work through goal and setup, chassis and tires, engine measurement and gearing, then setup verification. Road, Rally, Cross Country, Drift and Drag workflows account for measurement quality and available adjustments.
- **Windows HUDs and editor**: Choose from Classic JDM, S650, GT7, Retro VFD, R34 MFD and other styles, plus auxiliary gauges, audio decks and controller telemetry cards. Adjust position, scale and colors, and import or export layouts.
- **Recording, analysis and acceleration tests**: Save telemetry in SQLite, compare laps and historical sessions, define Time Trial/Free Roam gates, trim recordings non-destructively and time 0–100 km/h, 0–200 km/h and quarter-mile runs.
- **CLI and AI integration**: The Rust `fh6-agent` CLI provides status, telemetry diagnostics and tuning commands. A localhost read-only MCP server exposes live and historical data, vehicle specifications and solvers. [CLI guide](docs/guides/agent-cli-guide.md) · [MCP setup](docs/guides/mcp-setup-guide.md).
- **Themes, languages and updates**: Halfmoon, Swiss and Rhine Lab design systems; Traditional Chinese, English, Japanese and extensible translations; a diagnostic console and OTA updates with signature verification.

### Models and experimental features

| Feature | Current scope and limitations |
| --- | --- |
| Road/Rally and AEGO | Engineering baselines and qualified measurements inform recommendations; insufficient evidence or infeasible targets block them. See [tuning docs](docs/tuning/README.md), the [chassis baseline](docs/tuning/chassis-engineering-baseline-v1.md) and [Road launch model](docs/tuning/aego-road-launch-v3.md). |
| EV | Single/multi-speed measurement, saved evidence replay and final-drive previews. Optimal shift points, attainable top-speed prediction and some vehicle acceptance work remain pending. [EV model](docs/calibration/ev-foundation.md) · [Evidence lifecycle](docs/tuning/issue-435-ev-completeness.md). |
| CVT | Capability selection, capture and replay contracts exist. Applicable recommendations, final-drive solving and ratio previews are not available. [CVT notes](docs/tuning/cvt-foundation.md). |
| MoTeC export | CSV, i2 XML templates and experimental `.ld`/`.ldx` ZIP export. Native-format compatibility still awaits acceptance in MoTeC i2. [Race analysis guide](docs/guides/race-analysis.md). |
| Android Companion | Shares telemetry cards and the tuning workflow. Android HUDs are deferred; native appearance and device experience still have pending acceptance items. [Implementation boundary](docs/architecture/companion-implementation-boundary.md). |

<a id="readme-documentation"></a>

## Documentation

Use the **[documentation index](docs/README.md)** to find guides, architecture references and historical records. Most detailed guides are currently in Traditional Chinese.

| I want to… | Start here |
| --- | --- |
| Record races, compare laps and export data | [Race analysis](docs/guides/race-analysis.md) · [File exports](docs/guides/file-exports.md) |
| Install custom HUDs or understand their fields | [Custom HUD packages](docs/guides/portable-custom-hud.md) · [R34 MFD](docs/hud/r34-mfd.md) · [Stack ST8100](docs/hud/stack-st8100.md) |
| Connect agents or automation tools | [CLI](docs/guides/agent-cli-guide.md) · [MCP](docs/guides/mcp-setup-guide.md) |
| Study tuning formulas and collect evidence | [Tuning development](docs/tuning/README.md) · [Calibration](docs/calibration/README.md) |
| Develop the UI, themes or backend | [Frontend](frontend/README.md) · [Design systems](docs/frontend/design-systems.md) · [Rust backend](docs/backend-rust/README.md) |
| Build, publish or troubleshoot startup | [Development](docs/guides/development.md) · [Cross-platform releases/OTA](docs/guides/cross-platform-release.md) |
| Find past releases and research | [GitHub Releases](https://github.com/eddie772tw/FH6-HorizonTuner/releases) · [Historical docs](docs/archive/README.md) |

<a id="readme-development"></a>

## Development

The steps below target Windows. Install **Git, Node.js 22, pnpm, Rust stable, MSVC Build Tools, Windows SDK and WebView2**. Match pnpm to the version in the [CI workflow](.github/workflows/ci.yml). For Linux builds, use the [cross-platform guide](docs/guides/cross-platform-release.md).

```powershell
git clone https://github.com/eddie772tw/FH6-HorizonTuner.git
cd FH6-HorizonTuner
.\setup_dev.bat
.\dev_full.bat
# For Lite, use .\dev_lite.bat
```

Run `setup_dev.bat` to prepare dependencies, then launch with `dev_full.bat` or `dev_lite.bat`, one at a time. Vite provides frontend HMR; restart after Rust changes. The product backend, MCP server and CLI do not require Python. Optional maintenance tools use the [Python 3.13/uv environment](.agents/rules/python-uv.md).

### Build and validate

Build Windows Full/Lite portable executables:

```powershell
.\setup_build.bat
.\build_all.bat
```

Outputs are `dist/FH6-HorizonTuner.exe` and `dist/FH6-HorizonTuner_lite.exe`. Installers, OTA signing and publication follow the separate [release workflow](docs/guides/cross-platform-release.md).

Run checks that match your changes:

| Changed area | Local check |
| --- | --- |
| Documentation | `git diff --check` |
| Rust backend/CLI | `cargo test --locked --manifest-path backend-rust/Cargo.toml` |
| Rust formatting | `cargo fmt --manifest-path backend-rust/Cargo.toml -- --check` |
| React/TypeScript | `pnpm -C frontend run test`, `pnpm -C frontend run build` |
| Platforms without HUDs | Also test the backend with `--no-default-features` and follow the cross-platform guide |
| Python maintenance tools | Run the relevant tool tests and Ruff through the [uv workflow](.agents/rules/python-uv.md) |

[CI Pipeline](https://github.com/eddie772tw/FH6-HorizonTuner/actions/workflows/ci.yml) runs automated checks. [Host Diagnostics](https://github.com/eddie772tw/FH6-HorizonTuner/actions/workflows/diagnostics.yml) provides scheduled and manual startup diagnostics. Release candidates also need native desktop smoke tests and applicable game/device acceptance; unit tests and offline images cannot replace them.

<details>
<summary><strong>Project structure and data flow</strong></summary>

```text
FH6 Data Out (UDP) → Rust backend → HTTP / WebSocket → Tauri / React / HUD
                                 → SQLite / MCP / Agent CLI

backend-rust/src/    Telemetry, storage, APIs, MCP and production tuning formulas
frontend/src/        React workspaces, workflow and presentation
frontend/src-tauri/  Desktop windows, backend lifecycle and packaging
hud_overlay/        Windows HUD renderers and assets
companion/          Android connection shell and WebView
lang/               Translation dictionaries
docs/               Guides, contracts and calibration records
scripts/            Build, release and maintenance tools
```

Production tuning decisions belong to `backend-rust/src/tuning/`. The frontend owns workflow, drafts and display conversions; historical TypeScript models remain test references. See the [responsibility contract](docs/contracts/tuning_responsibilities.md).

</details>

<details>
<summary><strong>Ports, updates and data locations</strong></summary>

| Purpose | Protocol | Default |
| --- | --- | --- |
| Game Data Out | UDP | `8000` |
| Optional raw telemetry forwarding | UDP | `127.0.0.1:5300` |
| REST/WebSocket/MCP | HTTP/WebSocket | localhost `8001` |
| Vite development server | HTTP | `1420` |

Development uses HTTP `8001`. Release builds try `8001`, then fall back to an available dynamic port. Find the actual endpoint in Settings' MCP section or `logs/web_port.txt` under the data directory. `TELEMETRY_PORT` overrides the UDP port. HTTP and MCP remain localhost-only; Companion uses a separate authenticated pairing endpoint.

Windows installers and portable builds embed the Rust backend. Portable builds prefer writable storage beside the executable, with an AppData fallback for protected directories. Full and Lite installers are independent; their OTA manifests are `latest.json` and `latest-lite.json`. Linux uses `latest-linux.json`. See the [release and data-path contract](docs/guides/cross-platform-release.md).

</details>

<a id="readme-contributing"></a>

## Contributing

Bug reports, documentation improvements, translations and fixes are welcome.

- **Report a problem**: Open an [issue](https://github.com/eddie772tw/FH6-HorizonTuner/issues) with your version, operating system, reproduction steps and relevant diagnostics.
- **Submit changes**: For normal contributions, branch from `main`, use Conventional Commits and describe the purpose, changes and validation in your PR. Read the [project rules](.agents/AGENTS.md) and [testing strategy](.agents/rules/testing-strategy.md) first.
- **Add a translation**: Copy `lang/en-us.json`, translate the new locale file, register its name in `lang/iso639.json` and verify complete keys and language switching.
- **Keep docs current**: Update both READMEs when usage or architecture changes, and place detailed material in the relevant `docs/` guide.

<a id="readme-security"></a>

## Security

Report vulnerabilities privately through GitHub Private Vulnerability Reporting, following [SECURITY.md](SECURITY.md).

<a id="readme-license"></a>

## License and acknowledgements

Licensed under the [MIT License](LICENSE). Copyright © 2026 罐頭 (eddie772tw) and contributors.

Thanks to [Paburrito/forza-horizon-6-custom-hud](https://github.com/Paburrito/forza-horizon-6-custom-hud) for the original Custom HUD design and inspiration. Additional asset and design references are documented in the [reference-project index](docs/reference-projects/README.md) and the individual feature guides.
