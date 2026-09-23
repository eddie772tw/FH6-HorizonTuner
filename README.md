# FH6-HorizonTuner 🏎️
> **Forza Horizon 6 Real-Time Telemetry Analyzer, Vehicle Tuning Workbench & Custom Racing Dashboard Overlay**
> **《極限競速：地平線 6》即時遙測分析、車輛調校工作台與賽車客製化儀表覆蓋層**

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

## 簡介 / Introduction

`FH6-HorizonTuner` 是一款專為《極限競速：地平線 6》開發的專屬遙測資料分析與車輛調校輔助工具。此專案整合了高效能的 Rust Axum 後端封包監聽服務、現代化的 Tauri 桌面端圖形介面，以及完全免注入的 HTML5 Canvas / Tauri 透明儀表覆蓋層引擎。

目前此專案提供**即時遙測面板**、**自定義賽車儀表覆蓋層 (含視覺化編輯器)**、**車輛調校輔助**與**彈射起步測試**等核心功能，幫助玩家在操駕時即時監控車輛物理與動態反饋。

---

## 核心功能 / Core Features

* **即時遙測與物理動態分析 (60Hz Live Telemetry & Dynamics)**:
  - 60Hz 高頻 UDP 遙測封包接收與極致效能視效渲染。
  - 包含車速、轉速 (RPM)、馬力/扭力雙曲線、渦輪增壓值 (Boost) 與油門/煞車/方向盤輸入即時圖表。
  - 2D G-Force 運動雷達圖、4 輪獨立表面胎溫 (Tire Temp)、熱胎壓 (Hot Pressure) 與 4 輪正規化懸吊行程 (Suspension Travel)。
  - 後端提供有界的 pipeline metrics，並將 dyno profile 的首次讀取與持久化移出即時遙測迴圈。
* **4 階段可驗證車輛調校工作流 (Four-Stage Tuning Workflow V2)**：
  - **4 階段 3 欄位精簡佈局**：重構調校介面為 4 階段 3 欄位清晰佈局，即時呈現車輛狀態與求解反饋。
  - **實車測試圈遙測特徵驅動 (Race Evidence)**：徹底捨棄原先的手動輪胎抓地力係數輸入，改由真實操駕之輪胎載荷與遙測特徵自動觀察並驅動定位角度與胎壓求解。
  - **多元賽事模型與底盤支援**：新增 Road 前驅 (FWD) 底盤與全電/混合動力 (AEGO) 前後軸扭力分配；獨立拆分混合路面拉力 (Rally) 與大衝程越野 (Cross Country) 基準；實測轉速區間衍生甩尾 (Drift) 設定與全齒比；支援完整直線加速 (Drag) 變速箱各檔齒比梯度與終點時速推導。公式研究、來源與限制見[調校開發入口](docs/tuning/README.md)。
* **客製化賽車儀表覆蓋層與雙前端客戶端 (Racing HUD Overlay & Full/Lite Clients)**:
  - **全新 Classic JDM 儀表群組**：高對比度復古白底轉速儀表盤、超轉換檔提示燈、雙計程儀與渦輪壓力表，提供沉浸式 90 年代日系經典性能車儀表視覺。
  - **街機多聯錶版面 (Arcade Multi-Gauge Layout) 與 1080p 響應縮放**：支援多聯錶並排顯示，統一所有 HUD 儀表的座標錨點與自適應等比縮放機制。
  - **多風格儀表支援**：整合 Ford Mustang S650 HMI（支援 Windows GSMTC 音樂小工具）、Gran Turismo 7 風格、Retro VFD 擬真螢光顯示、093 Drift 甩尾專用儀表與 5 款社群熱門 HUD 樣式。
  - **精簡獨立客戶端 (`FH6-HorizonTuner_lite.exe`)**：提供 Telemetry Dashboard、HUD Overlay 與 Settings 三個分頁，與完整客戶端共用前端功能與後端生命週期。
  - 100% 免注入、免 Hook 零作弊風險；支援多頻道 WebSocket 數據透傳與全螢幕自適應放縮。
  - **WYSIWYG 儀表編輯器**：拖曳式佈局編輯器、屬性面板、條件色彩規則與一鍵匯入/匯出設定。
* **HorizonTuner-cli AI Agent 命令列工具 (HorizonTuner-cli)**:
  - 提供專為 AI Agent、自動化腳本與終端開發打造的官方工具 `fh6-agent.bat`（或 `python -m backend.agent_cli`），零第三方 Python 依賴。
  - 具備線上即時遙測與離線純數學計算雙模式，支援連接埠就緒探測（`status`）、即時動態診斷（`diagnose`）、車輛規格檢索（`spec`）與底盤算牌（`tune`），並提供 `--json` 結構化輸出。詳細說明參閱 [Agent CLI 使用指南](docs/guides/agent-cli-guide.md)。
* **Android Companion（開發中）**:
  - 原生 Jetpack Compose 連線外殼搭配 Android WebView，載入共用 `frontend/dist/companion/index.html`，重用桌面端五大遙測卡片與四步工作流。APP 端 HUD 顯示留待後續實作。
  - PC TuneSessionProvider 是調校與 engine measurement 的唯一 owner；profile、workflow、measurement command 透過 queue/ack 傳遞，並以 profileKey、host lease 與 client heartbeat 防止過期結果和失聯寫入。
  - 目前可驗證的開發模式是 PC Full app 的 loopback HTTP 與 USB。於 PC Companion 設定選取平板並按「Connect USB device」，程式以內嵌 ADB 自動建立反向連接並開啟 APP；多台設備時必須明確選擇。LAN、QR scanning、mDNS、RFCOMM 與 native offline cache 仍是 planned，尚未宣稱可用。
  - Android 建置與 protocol gate：`./gradlew :protocol-core:test :app:lintDebug :app:assembleDebug`；這些檢查不等同實機、USB 或 gameplay end-to-end 驗收。詳見 [Companion 架構與驗收界線](docs/architecture/companion-app-evaluation.md) 與 [Companion README](companion/README.md)。
* **彈射起步測試與加速度分析 (Drag Launch Test & Acceleration Analyzer)**:
  - 0-100 km/h, 0-200 km/h, 1/4 英里 (400m) 加速度自動計時測試。
  - 速度/轉速時間軸圖表回放與歷史 Session 紀錄對比。
* **遙測持久化與 MoTeC i2 數據匯出 (SQLite Storage & MoTeC Exporter)**:
  - 後端 SQLite 遙測歷程資料庫自動記錄。
  - 支援一鍵匯出專業賽車數據分析軟體 **MoTeC i2** 標準 `.ld` 格式檔案。
* **Localhost 唯讀 MCP Server (Model Context Protocol)**:
  - 由執行中的 Rust backend 提供 Streamable HTTP MCP endpoint（`/mcp`），提供 26 個專屬唯讀工具與 5 類 Resource URI；MCP 與 telemetry 共用同一個 backend process。
  - 支援 AI Agent（Claude Desktop、Cursor、Cline 等）結構化查詢即時遙測（對齊 `TelemetryView`）、歷史單圈、A/B 跑圈差異比對、車輛規格與調校求解器。
  - MCP 標準 `initialize` 回應會自動提供 Agent-facing 配置與使用說明；Settings 僅顯示目前 endpoint 與連線狀態，不再要求複製 JSON/CLI 設定。首次連線仍須由客戶端完成一次性 endpoint bootstrap。
* **OTA 自動更新與版本管理 (Over-The-Air Update & Release Management)**:
  - 整合 Tauri v2 官方 Updater 插件與 Ed25519 非對稱數位簽章防篡改校驗。
  - 支援「啟動時自動背景檢查」與「設定頁面手動檢查更新」，提供 Glassmorphism 賽車風格更新對話框與動態下載進度條。
  - 具備 Sidecar 生命週期協同保護：重啟升級前自動銷毀 Rust sidecar 子行程，確保 UDP 8000 與 HTTP 8001 連接埠 100% 釋放。
  - **自動化發布架構**：維護者僅需在 GitHub 網頁建立 Release，GitHub Actions 即自動觸發編譯與簽名。`FH6-HorizonTuner-Full-Installer.exe` 與 `FH6-HorizonTuner-Lite-Installer.exe` 是可直接安裝的正式 NSIS installer，也是 OTA updater 重用的同一個經簽署 payload；Full/Lite portable EXE 與 Portable ZIP 則清楚標示為可攜版。兩個 OTA 管道分別使用 `latest.json`（Full）與 `latest-lite.json`（Lite），可獨立下載與安裝，不依賴另一個版本。
* **診斷主控台與主題 / 多語言系統 (Diagnostics, Theme & i18n)**:
  - **診斷主控台**：內建即時日誌檢視器，支援 DEBUG / INFO / WARNING / ERROR 層級篩選與 Traceback 自動拼接。
  - **設計系統與主題**：基於 Halfmoon CSS v2 霓虹 Glassmorphism 皮膚，支援 "crosXover", "Retro VFD", "Solar Flare" 等多款色彩範本與日夜模式。
  - **動態多語言**：預設支援繁體中文 (zh-tw)、英文 (en-us)、日文 (ja-jp) 等。

---

## 專案架構 / Project Architecture

前端由共用 `AppShell` 管理工作區與應用程式選單：Full 提供即時、調校、賽事紀錄、HUD，Lite 提供即時與 HUD。一次只掛載目前工作區；Tune、Road、Sessions 與 HUD 的長生命週期狀態由各功能 provider 持有，避免切頁中斷量測或清空未保存草稿。全域選單提供設定、外觀、診斷、更新與關於。此分支仍在 IA 分階段遷移，面板拆分及完整原生驗收進度見 [Shell 交接](docs/frontend/ia-refactor-20260913/handoffs/shell-20260914.md)。

```text
FH6-HorizonTuner/
├── .github/workflows/       # GitHub CI/CD 工作流 (ci.yml 門禁測試 + release.yml 自動發行)
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
├── frontend/                # Tauri 前端代碼 (Vite + React + TypeScript)
│   ├── lite/                # Lite 前端 HTML entrypoint
│   ├── src/app/             # 共用 Shell、能力契約、工作區與全域 surface 導覽
│   ├── src/features/        # 業務領域模組 (Features Domain)
│   │   ├── live/            # Live 工作區入口；Full/Lite 能力投影
│   │   ├── sessions/        # Sessions 選取狀態、IO 與賽後完成導覽
│   │   ├── road/            # Road 工作流控制器及 prepare/run/review 狀態
│   │   ├── telemetry/       # 即時遙測視圖 (TelemetryView) 與 5 大可展開動態卡片
│   │   ├── tuning/          # 車輛調校嚮導 (TuningView & Step 1~4 分頁)
│   │   ├── overlay_control/ # WYSIWYG 儀表佈局編輯器 (OverlayView)
│   │   ├── drag_test/       # 彈射起步測試 (DragTestView)
│   │   ├── analysis/        # 賽後復盤與 MoTeC 生態系橋接器 (AnalysisView, Debrief & LapDelta)
│   │   ├── car_params/      # 車輛參數設定 (CarParamsView)
│   │   ├── settings/        # 系統全域設定 (SettingsView)
│   │   └── theme/           # 主題色調與皮膚視圖 (ThemeView)
│   ├── src/components/      # 通用 UI 元件 (ModalPortal, DiagnosticConsole 等)
│   ├── src/domain/tuning/    # 純函數調校 domain（輪胎、載荷轉移、懸吊、齒比與差速器）
│   │   ├── chassis/          # 懸吊與 Phase 4B 四輪載荷轉移估算
│   │   └── tires/            # 摩擦橢圓、輪胎幾何與垂直剛度先驗
│   ├── src/utils/           # 純函數計算庫 (tuningMath.ts, tuningDiagnosis.ts 等)
│   └── src-tauri/           # Tauri 視窗與 Full/Lite 打包設定
├── hud_overlay/             # HTML5 Canvas 客製化賽車儀表覆蓋層
│   ├── index.html           # HUD 載入與 Viewport 渲染入口
│   ├── classic_jdm/         # Classic JDM 經典日系儀表與街機多聯錶
│   ├── gt7/                 # Gran Turismo 7 風格賽車儀表
│   ├── vfd/                 # Retro VFD 擬真螢光顯示儀表
│   ├── drift/               # 093 Drift 專業甩尾賽車儀表
│   └── shared/              # 共用 Canvas 幾何繪圖與數學庫
├── scripts/                 # 自動化發行與度量腳本 (prepare_release_assets.py, release_metrics.py)
├── lang/                    # 系統多語言翻譯字典 (zh-tw, ja-jp 等)
├── tests/                   # Pytest 單元測試套件
├── pyproject.toml           # Ruff 格式化規則與 Pytest 設定
├── requirements.txt         # Python 依賴套件清單
├── fh6-agent.bat            # HorizonTuner-cli AI Agent 命令列工具入口
├── setup_dev.bat           # 下載 Rust 與前端開發依賴
├── dev_full.bat            # Full 開發入口，編譯並啟動 Rust sidecar
├── dev_lite.bat            # Lite 開發入口，編譯並啟動 Rust sidecar
├── setup_build.bat         # 安裝打包依賴
└── build_all.bat            # 一鍵打包發行腳本
```

---

## 快速開始 / Quick Start

### 1. 遊戲內 UDP 遙測設定

要接收遙測數據，您必須在《極限競速：地平線 6》遊戲中啟用資料輸出功能：
1. 啟動遊戲，進入**設定** -> **HUD 與遊戲操作 (HUD and Gameplay)**。
2. 尋找 **資料輸出 (Data Out)**，將其設為 **開啟 (ON)**。
3. 將 **資料輸出 IP 位址 (Data Out IP Address)** 填入 `127.0.0.1`。
4. 將 **資料輸出連接埠 (Data Out Port)** 填入 `8000`。

### 2. 啟動本工具

先安裝 Node.js／pnpm 與 Rust／Tauri 的 Windows 開發工具，再執行一次 `setup_dev.bat`。相依宣告有變更時，重新執行 setup。

- **Full**：執行 `dev_full.bat`。
- **Lite**：執行 `dev_lite.bat`；僅提供 Dashboard、HUD Overlay、Settings。

兩個入口先增量編譯獨立的 Rust 後端，再由 Tauri 管理該程序的啟停。前端仍使用 Vite HMR；修改 Rust 後重新啟動開發入口。Full／Lite 共用開發 port，請一次啟動一個。日常開發與產品打包不需要 Python；Agent CLI、舊實作參考測試與部分維護工具仍可透過選用的 uv 環境執行。

日常啟動不安裝套件、不格式化程式、不更新車輛資料、不清除其他程序。HTTP `8001` 或 UDP `8000` 被占用時會回報失敗，請關閉原有執行個體後重試。單獨執行後端、外接前端與故障排查請見[開發啟動指南](docs/guides/development.md)。

---

## 一鍵打包可攜版 / Build Portable Executables (.exe)

執行 `setup_build.bat` 準備 Rust／前端依賴，再執行 `build_all.bat`。流程依序建置共用前端、獨立 Rust sidecar，以及 Full／Lite Tauri host，輸出 `dist/FH6-HorizonTuner.exe` 與 `dist/FH6-HorizonTuner_lite.exe`。

sidecar 由 `cargo build --locked --release` 編譯；HUD、語言、車輛資料透過 `backend-rust/build.rs` 嵌入，不再使用 PyInstaller。使用者的設定、SQLite 紀錄與自訂 HUD 沿用既有資料路徑。正式版 HTTP 優先使用 8001，必要時透過 readiness event 宣告動態埠；UDP 遙測埠仍獨立設定。

詳細架構、Python 參考實作的保留用途與測試分層見 [Rust 後端遷移](docs/backend-rust/README.md)；命令見[開發指南](docs/guides/development.md)。

---

## 選用 Python / uv 工具規範

選用 Python 工具固定使用 Python 3.13，並由 `uv` 管理 Python interpreter、`.venv` 與所有 Python 套件。請先安裝 uv，再使用 [Python / uv 工具鏈規範](.agents/rules/python-uv.md) 中的命令；不要使用裸 `python`、`pip`、`pytest` 或 `ruff`。

標準測試命令：

```powershell
uv run --no-project --python .venv\Scripts\python.exe python -m pytest tests/
uv run --no-project --python .venv\Scripts\python.exe ruff check .
uv run --no-project --python .venv\Scripts\python.exe ruff format --check .
```

## 開發環境要求 / Prerequisites

* **uv**：選用 Python 3.13、`.venv` 與 Python 套件安裝的必要管理工具。詳細規範請參閱 [Python / uv 工具鏈規範](.agents/rules/python-uv.md)。
* **Node.js**: 20 或以上版本
* **Rust / Cargo**：獨立後端與 Tauri host 的必要編譯工具。

---

## 開發者規範與程式碼格式化 / Developer Guide & Formatting

操作指南、HUD 契約、調校開發及校準流程統一由 [文件索引](docs/README.md) 查找；舊計畫與研究已分流至 [歷史索引](docs/archive/README.md)，不代表目前開發進度。

協作代理規範位於 [`.agents/AGENTS.md`](.agents/AGENTS.md)，變更前請先閱讀；專案決策與經驗紀錄維護於 [`.agents/Journal.md`](.agents/Journal.md)。

專案採用 **[Ruff](https://github.com/astral-sh/ruff)** 作為標準的 Python 程式碼格式化與風格檢查工具，並採用 **Black-compatible** 排版風格。為確保代碼風格一致，並能順利通過 GitHub Actions 的 CI 檢查，請在提交代碼前遵循以下程序：

### Python 格式化 (Ruff)

* **全量格式化代碼**：
    ```bash
    # 在虛擬環境外
    uv run --no-project --python .venv\Scripts\python.exe ruff format .

    # 在 Windows 虛擬環境內
    uv run --no-project --python .venv\Scripts\python.exe ruff format .
    ```
* **驗證排版格式（CI 也會執行此步驟）**：
    ```bash
    uv run --no-project --python .venv\Scripts\python.exe ruff format --check .
    ```
* **靜態代碼檢查（Lint）**：
    ```bash
    uv run --no-project --python .venv\Scripts\python.exe ruff check .
    ```

> [!TIP]
> 格式化與檢查由開發者明確執行；開發啟動不會修改原始碼。

### 後端單元測試 (Pytest)

所有的後端自動化測試均位於 `tests/` 目錄下。在提交 PR 之前，請確保所有測試通過：

```bash
# 在 Windows 虛擬環境內
uv run --no-project --python .venv\Scripts\python.exe python -m pytest tests/

# 或指定單一測試檔案
uv run --no-project --python .venv\Scripts\python.exe python -m pytest tests/test_overlay_api.py -v
```

目前的後端測試套件涵蓋：
| 測試檔案 | 覆蓋範圍 |
| :--- | :--- |
| `test_telemetry_listener.py` | UDP 遙測封包解析與監聽器邏輯 |
| `test_telemetry_runtime.py` | Pipeline metrics 契約與非阻塞 profile 載入/合併寫入 |
| `test_telemetry_metrics_api.py` | Telemetry diagnostics API 回應契約 |
| `test_log_api.py` | 後端日誌 API、Traceback 拼接與層級篩選 |
| `test_overlay_api.py` | Overlay 佈局存取、進程啟動/終止與狀態查詢 |
| `test_drag_recorder.py` | 彈射起步測試的資料記錄與分析 |

### 前端單元測試 (Vitest)

前端使用 **[Vitest](https://vitest.dev/)** 作為單元測試框架，與 Vite 工具鏈緊密整合、零額外設定。測試檔與被測模組同目錄，命名為 `<模組名>.test.ts`。

```bash
# 從專案根目錄執行
cd frontend && pnpm run test

# 或從 frontend/ 目錄執行
cd frontend && pnpm run test
```

目前的前端測試套件涵蓋 71 個測試檔案，共 449 個單元測試案例：
| 測試檔案 | 覆蓋範圍 |
| :--- | :--- |
| `tuningMath.test.ts` | AEGO 齒輪比 / 彈簧 / ARB / 阻尼器 / 下壓力 / 車高與輪胎對齊等 29 個測試案例 |
| `tuningDiagnosis.test.ts` | 底盤遙測即時問題與動態調校診斷邏輯測試 |
| `loadTransfer.test.ts` / `tireGeometry.test.ts` | Phase 4B 四輪估計垂直載荷、載荷轉移與輪胎幾何先驗 |
| `driftMath.test.ts` | 甩尾分數與甩尾角度計算邏輯測試 |
| `telemetryCards.test.ts` | 遙測數據卡片格式化與狀態映射測試 |
| `telemetryHistory.test.ts` / `telemetryDetailMath.test.ts` | 有界遙測歷史、輪胎／動力學 detail 映射與懸吊統計測試 |
| `tireModel.test.ts` | 摩擦橢圓邊界、零容量正需求修復與 feasible 判斷（7 tests） |
| `suspensionSolver.test.ts` | 臨界阻尼、阻尼比先驗與 FH6 滑桿映射分層（3 tests） |
| `timestampIntegration.test.ts` | Phase 6 時間戳積分—滑空、漂移時間、衝擊窗口與非單調 unknown |
| `thermalDiagnosis.test.ts` | Phase 6 四輪胎溫梯度、Camber 與胎壓修正建議 |
| `dynamicsDiagnosis.test.ts` | Phase 6 ARB / 阻尼 / 差速器復合滑移診斷與 confidence 分層 |
| `capabilityFilter.test.ts` | Phase 7 改裝能力篩選函式（unlocked / locked / unknown keys） |
| `presetSerializer.test.ts` | Phase 7 `tuning-preset/v1` 存檔序列化往返與版本驗證 |
| 其它 `*.test.ts` 模組 | 包含 Express引擎、VFD 儀表、音訊、CSS 驗證與 RDP 簡化器等測試套件 |

> [!TIP]
> 新增或修改 `frontend/src/utils/` 下的物理計算模組時，請同步新增對應的 `.test.ts` 單元測試，確保所有測試通過後才提交 PR。

---

## 貢獻指南 / Contributing Guidelines

### 分支與提交規範

1. **分支命名**：請基於 `main` 分支建立功能分支，命名格式為 `feature/<功能名稱>` 或 `fix/<問題描述>`。
2. **Commit Message 規範**：採用 [Conventional Commits](https://www.conventionalcommits.org/) 格式：
   ```
   feat: add new component type for overlay
   fix: resolve HDR color space detection issue
   test: implement pytest suite for overlay API
   docs: update README with contribution guidelines
   refactor: extract expression engine into separate module
   ```
3. **Pull Request**：請在 PR 描述中清楚說明變更內容、動機與測試結果。

### 提交前檢查清單

在提交 Pull Request 之前，請確認以下事項：

- [ ] 代碼已通過 `uv run --no-project --python .venv\\Scripts\\python.exe ruff format --check .` 格式驗證
- [ ] 代碼已通過 `uv run --no-project --python .venv\\Scripts\\python.exe ruff check .` 靜態檢查（無 Error / Warning）
- [ ] 後端單元測試已透過 `uv run --no-project --python .venv\\Scripts\\python.exe python -m pytest tests/` 全數通過
- [ ] 前端單元測試已全數通過 (`cd frontend && pnpm run test` Pass)
- [ ] 若新增了 API 路由或後端核心邏輯，已補充對應的 Pytest 單元測試
- [ ] 若修改了 `tuningMath.ts` / `tuningDiagnosis.ts` 等前端計算邏輯，已補充對應的 Vitest 單元測試
- [ ] 若本次任務包含重大架構變更、核心模組增修或 API 重構，已同步維護並更新 `README.md` 與 `README.en.md`
- [ ] 若修改了 UI 元件或前端邏輯，已在本地驗證功能運作正常
- [ ] 若新增了多語言鍵值，已同步更新 `lang/zh-tw.json` 與 `lang/ja-jp.json`
- [ ] Commit message 符合 Conventional Commits 規範

### 新增自訂語系支援

本專案支援完全動態加載的多語言框架，貢獻者無需修改任何程式碼即可新增新語系：

1. **建立語系檔**：
   在 `lang/` 目錄下建立一個符合 ISO 639 與 locale 定義的 JSON 檔案（例如 `fr-fr.json`）。可以直接複製 `lang/en-us.json` 作為範本進行翻譯。

2. **註冊語言名稱**：
   編輯 `lang/iso639.json`，在字典中加入該語系代碼與對應的人性化易讀名稱。例如：
   ```json
   {
     "fr-fr": "Français (French)"
   }
   ```

3. **語系 PR 提交規範**：
   當提交新的語系支援 PR 時，請遵循以下標準化格式：
   - **PR 標題格式**: `feat(i18n): add <locale-name> language support` (例如 `feat(i18n): add French (fr-fr) language support`)。
   - **PR 說明內容**:
     ```markdown
     ## 語系新增說明 / Translation Details
     - 新增語系代碼 / Added Locale Code: `fr-fr`
     - 語系顯示名稱 / Display Language Name: `Français (French)`

     ## 檢查清單 / Checklist
     - [ ] 已在 `lang/` 目錄建立對應的 `<locale-code>.json` 檔案
     - [ ] 已在 `lang/iso639.json` 中註冊此語系代碼與對照名稱
     - [ ] 翻譯 JSON 中的所有翻譯鍵（Keys）皆已完整對齊 `en-us.json`
     - [ ] 確認翻譯內容中無殘留的中文字元或錯位
     - [ ] 已在本地測試過，選單能正常加載並正確切換該語系
     ```

---

## CI/CD 自動化流程 / Continuous Integration

本專案使用 GitHub Actions 進行自動化品質控管。每次推送至 `main` / `master` 或提交 Pull Request 時，CI 會自動執行以下兩個階段：

| 階段 | 說明 |
| :--- | :--- |
| **Lint** | 使用 `ruff check` 進行靜態代碼分析，並使用 `ruff format --check` 驗證排版格式 |
| **Test (Backend)** | 在 Windows + Ubuntu 雙平台上執行 `pytest` 後端測試套件 |
| **Test (Frontend)** | 執行 `cd frontend && pnpm run test` 前端 Vitest 單元測試（涵蓋 `tuningMath.ts` 等物理計算純函數） |

> [!IMPORTANT]
> 流程已採用全自動化 CI/CD 環境，無需等待 Approve 即可在提交 PR 後自動觸發測試。請確保在推送前已於本地透過 uv 執行格式檢查、Ruff 與 Pytest，以避免不必要的 CI 失敗。

---

## 授權條款 / License

本專案採用 [MIT 授權條款](LICENSE) 發行。

Copyright (c) 2026 罐頭 (eddie772tw) & Contributors.

---

## 安全性政策 / Security Policy

本專案設有完善的安全性維護政策與通報流程。若發現潛在漏洞，請參閱 [SECURITY.md](SECURITY.md) 透過 GitHub Private Vulnerability Reporting 私密回報。

---

## 致謝與專案參考 / Credits & Acknowledgements

* **Credits**: [Paburrito/forza-horizon-6-custom-hud](https://github.com/Paburrito/forza-horizon-6-custom-hud)
  Special thanks to Paburrito for the original "Forza Horizon 6 - Custom HUD" design and inspiration.

---

## Release Build Contract

Each GitHub Release publishes the following Windows download choices:

| Asset | Intended use |
| --- | --- |
| `FH6-HorizonTuner-Full-Installer.exe` | Standard Full NSIS installer. This is also the signed payload used by Full OTA updates. |
| `FH6-HorizonTuner-Lite-Installer.exe` | Standard Lite NSIS installer. This is also the signed payload used by Lite OTA updates. |
| `FH6-HorizonTuner-Full-Portable.exe` | Full portable executable; run it without an installation step. |
| `FH6-HorizonTuner-Lite-Portable.exe` | Lite portable executable; run it without an installation step. |
| `FH6-HorizonTuner-Full-Lite-Portable.zip` | Convenience archive containing both portable executables. |

Full and Lite installers are self-contained alternatives, not prerequisites for
each other. The Tauri updater consumes `latest.json` for Full and
`latest-lite.json` for Lite; each manifest names its matching installer and
embeds the corresponding signature. The detached `.sig` assets are for
verification and are not needed when manually launching an installer.

Both installer and portable builds embed the Rust backend into the Tauri
host; no separate sidecar download is required. At startup the backend is
extracted to a versioned temporary directory. User data is stored beside a
portable executable when that directory is writable, with an AppData fallback
for protected locations.

## 開發環境連接埠

本專案使用兩個不同的本機連接埠，請勿將它們混用：

| 服務名稱 | 協議 | 預設連接埠 / 說明 |
| :--- | :--- | :--- |
| Forza Horizon Data Out Telemetry | UDP | `8000` (接收遊戲遙測數據) |
| UDP Telemetry Forwarding (Passthrough) | UDP | `5300` (可轉發 raw 封包至 SimHub / 外部儀表) |
| Rust REST API / WebSocket | HTTP / WebSocket | `8001` (前端與 HUD 數據推播) |

在遊戲中請將 **Data Out IP Address** 設為 `127.0.0.1`、**Data Out Port** 設為 `8000`。前端開發模式固定連線至 `http://127.0.0.1:8001` 與 `ws://127.0.0.1:8001`。可透過 `TELEMETRY_PORT` 修改 UDP 連接埠；`BACKEND_PORT` 僅保留給明確的測試與外部 backend workflow。如需將 raw 遙測數據轉發至 SimHub 或第三方軟體，可於「系統設定 (Settings)」開啟「Telemetry 遙測封包轉發」並設定目標 Host 與 Port（預設 `127.0.0.1:5300`，亦支援 `TELEMETRY_FORWARD_ENABLED` / `TELEMETRY_FORWARD_PORT` 環境變數）。

Release Build 會優先使用 `8001` 作為 Rust HTTP 連接埠；若 `8001` 已被占用，才會 fallback 到可用的動態 TCP 連接埠。實際連接埠會在 backend bind 成功後寫入資料目錄的 `logs/web_port.txt`，前端直接使用該值；Forza UDP Telemetry 預設仍監聽 `8000`。若發生 fallback，應前往 Settings 的 MCP Server 區塊確認目前 endpoint。Agent 完成初次 endpoint 連線後，會透過 MCP 標準 `initialize` 回應自動取得配置說明，不需再次複製 JSON 或 CLI 設定；但 MCP 本身沒有跨客戶端注入首次 URL 的通用 API。
前端會在 Tauri sidecar 回報 ready 後，透過集中式 transport 契約設定該實際連接埠；REST 與 WebSocket 呼叫不依賴全域 `fetch` / `WebSocket` 攔截，因此不會重寫 HUD 靜態資源或其他非後端連線。


---

## Testing & Diagnostics

### CI & PR Blocking
Our standard CI pipeline blocks pull requests on package existence and metadata validation to ensure that dependencies and compilation processes succeed. However, tests that verify the headless launch of the Release Build Tauri host are historically flaky in Windows GitHub Actions runners.

### Release Build Host Diagnostics Workflow
To debug and monitor headless host behavior without blocking PRs, we run the **FH6 HorizonTuner Host Diagnostics** workflow.
- **Scheduled:** Runs nightly via cron.
- **Manual Trigger:** Maintainers can manually trigger this workflow via the `workflow_dispatch` event on the Actions tab. You can optionally specify a `repeat_count` (between 1 and 10, defaulting to 1) to repeatedly probe host startup using the same compiled binaries, and a `timeout` (between 15 and 120 seconds, defaulting to 120) to accommodate slow or loaded headless Windows runners.

If a diagnostics run fails, the workflow uploads a diagnostic artifact (retained for several days) containing:
- Output from `stdout` and `stderr`
- Parent PID, Exit codes, and a full child process tree (collected via PowerShell `Get-CimInstance`)
- Executable SHA-256 hashes
- The generated `backend.log` and `web_port.txt`

### Release Candidate Approval
To sign off on a new release candidate, you must ensure:
1. **One successful automated diagnostics run** via GitHub Actions.
2. **Manual Release Build smoke testing** performed on a clean Windows environment.
