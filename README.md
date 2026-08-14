# FH6-HorizonTuner 🏎️
> **Forza Horizon 6 Real-Time Telemetry Analyzer, Vehicle Tuning Workbench & Custom Racing Dashboard Overlay**
> **《極限競速：地平線 6》即時遙測分析、車輛調校工作台與賽車客製化儀表覆蓋層**

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

## 簡介 / Introduction

`FH6-HorizonTuner` 是一款專為《極限競速：地平線 6》開發的專屬遙測資料分析與車輛調校輔助工具。此專案整合了高效能的 Python FastAPI 後端封包監聽服務、現代化的 Tauri 桌面端圖形介面，以及完全免注入的 HTML5 Canvas / Tauri 透明儀表覆蓋層引擎。

目前此專案提供**即時遙測面板**、**自定義賽車儀表覆蓋層 (含視覺化編輯器)**、**車輛調校輔助**與**彈射起步測試**等核心功能，幫助玩家在操駕時即時監控車輛物理與動態反饋。

---

## 核心功能 / Core Features

* **即時遙測與物理動態分析 (60Hz Live Telemetry & Dynamics)**:
  - 60Hz 高頻 UDP 遙測封包接收與極致效能視效渲染。
  - 包含車速、轉速 (RPM)、馬力/扭力雙曲線、渦輪增壓值 (Boost) 與油門/煞車/方向盤輸入即時圖表。
  - 2D G-Force 運動雷達圖、4 輪獨立表面胎溫 (Tire Temp)、熱胎壓 (Hot Pressure) 與 4 輪正規化懸吊行程 (Suspension Travel)。
  - 後端提供有界的 pipeline metrics，並將 dyno profile 的首次讀取與持久化移出即時遙測迴圈。
* **5 步驟公式化車輛調校工作台 (5-Step Physics Tuning Workbench)**:
  - **Step 1 賽事目標 (Goal Setup)**：支援公路環道 (Road)、甩尾 (Drift)、越野拉力 (Rally) 與直線加速 (Drag) 四大賽事取向及空力效率配比。
  - **Step 2 AEGO 齒比 (AEGO Gearing)**：獨家 AEGO 齒比演算法與動力帶 (Powerband) 分析，支援 4-Speed Drag Meta、軟上限 (Soft Cap) 與極速閉環幾何二次修正。
  - **Step 3 底盤懸吊 (Chassis Tuner)**：防傾桿 (ARB 1/65 Meta 策略)、彈簧剛性、前傾姿態 (Forward Rake) 車高、黃金比例阻尼 (60% Bump Ratio) 與差速器鎖定率。
  - **Step 4 胎壓與對齊 (Alignment & Tires)**：季節偏置靜態冷胎壓算牌、Camber / Toe / Caster 幾何計算。
  - **Step 5 遙測閉環校準 (Telemetry Calibration)**：讀取 UDP 遙測自動對齊溫差、前輪鎖死/後輪打滑/推頭與懸吊觸底動態診斷。
* **客製化賽車儀表覆蓋層與視覺編輯器 (Racing HUD Overlay & WYSIWYG Designer)**:
  - 提供多款專業 HTML5 Canvas 獨立賽車儀表（Gran Turismo 7 風格、Retro VFD 擬真螢光顯示、093 Drift 甩尾專用儀表）。
  - 100% 免注入、免 Hook 零作弊風險；支援多頻道 WebSocket 數據透傳與全螢幕自適應放縮。
  - **WYSIWYG 儀表編輯器**：拖曳式佈局編輯器、屬性面板、條件色彩規則與一鍵匯入/匯出設定。
* **彈射起步測試與加速度分析 (Drag Launch Test & Acceleration Analyzer)**:
  - 0-100 km/h, 0-200 km/h, 1/4 英里 (400m) 加速度自動計時測試。
  - 速度/轉速時間軸圖表回放與歷史 Session 紀錄對比。
* **遙測持久化與 MoTeC i2 數據匯出 (SQLite Storage & MoTeC Exporter)**:
  - 後端 SQLite 遙測歷程資料庫自動記錄。
  - 支援一鍵匯出專業賽車數據分析軟體 **MoTeC i2** 標準 `.ld` 格式檔案。
* **Localhost 唯讀 MCP Server (Model Context Protocol)**:
  - 由執行中的 FastAPI backend 提供 Streamable HTTP MCP endpoint（`/mcp`），提供 26 個專屬唯讀工具與 5 類 Resource URI；MCP 與 telemetry 共用同一個 backend process。
  - 支援 AI Agent（Claude Desktop、Cursor、Cline 等）結構化查詢即時遙測（對齊 `TelemetryView`）、歷史單圈、A/B 跑圈差異比對、車輛規格與調校求解器。
* **診斷主控台與主題 / 多語言系統 (Diagnostics, Theme & i18n)**:
  - **診斷主控台**：內建即時日誌檢視器，支援 DEBUG / INFO / WARNING / ERROR 層級篩選與 Traceback 自動拼接。
  - **設計系統與主題**：基於 Halfmoon CSS v2 霓虹 Glassmorphism 皮膚，支援 "crosXover", "Retro VFD", "Solar Flare" 等多款色彩範本與日夜模式。
  - **動態多語言**：預設支援繁體中文 (zh-tw)、英文 (en-us)、日文 (ja-jp) 等。

---

## 專案架構 / Project Architecture

```text
FH6-HorizonTuner/
├── .github/workflows/       # GitHub CI/CD 工作流設定 (Ruff Lint + Pytest)
├── backend/                 # Python FastAPI 後端核心
│   ├── main.py              # 後端服務主入口與 API 宣告
│   ├── mcp/                 # Model Context Protocol (MCP) 唯讀伺服器
│   │   ├── service.py       # 遙測與調校服務層 (對齊 TelemetryView)
│   │   ├── tools.py         # 26 個 MCP Tools 宣告與分派
│   │   └── resources.py     # 5 類 Resource URI 路由
│   ├── telemetry_listener.py # UDP 60Hz 遙測數據流監聽與解析
│   ├── telemetry_runtime.py  # Pipeline metrics 與非阻塞 dyno profile 快取/寫入
│   ├── core/                # 遙測數據處理、算牌與系統核心
│   ├── routers/             # API 路由 (telemetry, tuning, overlay, drag, log, etc.)
│   ├── services/            # 後端系統服務與狀態管理
│   ├── telemetry_sqlite.py   # 遙測歷史紀錄 SQLite 資料庫持久化
│   ├── motec_exporter.py    # 專業賽車 MoTeC i2 數據匯出器
│   └── car_database.json    # 內建車輛資料庫
├── frontend/                # Tauri 前端代碼 (Vite + React + TypeScript)
│   ├── src/features/        # 業務領域模組 (Features Domain)
│   │   ├── telemetry/       # 即時遙測視圖 (TelemetryView) 與 4 大動態卡片
│   │   ├── tuning/          # 車輛調校嚮導 (TuningView & Step 1~5 分頁)
│   │   ├── overlay_control/ # WYSIWYG 儀表佈局編輯器 (OverlayView)
│   │   ├── drag_test/       # 彈射起步測試 (DragTestView)
│   │   ├── analysis/        # 數據分析檢視 (AnalysisView)
│   │   ├── car_params/      # 車輛參數設定 (CarParamsView)
│   │   ├── settings/        # 系統全域設定 (SettingsView)
│   │   └── theme/           # 主題色調與皮膚視圖 (ThemeView)
│   ├── src/components/      # 通用 UI 元件 (Navigation, DiagnosticConsole 等)
│   ├── src/domain/tuning/    # 純函數調校 domain（輪胎、載荷轉移、懸吊、齒比與差速器）
│   │   ├── chassis/          # 懸吊與 Phase 4B 四輪載荷轉移估算
│   │   └── tires/            # 摩擦橢圓、輪胎幾何與垂直剛度先驗
│   ├── src/utils/           # 純函數計算庫 (tuningMath.ts, tuningDiagnosis.ts 等)
│   └── src-tauri/           # Tauri 視窗與打包設定
├── hud_overlay/             # HTML5 Canvas 客製化賽車儀表覆蓋層
│   ├── index.html           # HUD 載入與 Viewport 渲染入口
│   ├── gt7/                 # Gran Turismo 7 風格賽車儀表
│   ├── vfd/                 # Retro VFD 擬真螢光顯示儀表
│   ├── drift/               # 093 Drift 專業甩尾賽車儀表
│   └── shared/              # 共用 Canvas 幾何繪圖與數學庫
├── lang/                    # 系統多語言翻譯字典 (zh-tw, ja-jp 等)
├── tests/                   # Pytest 單元測試套件
├── pyproject.toml           # Ruff 格式化規則與 Pytest 設定
├── requirements.txt         # Python 依賴套件清單
├── .pkgdirignore            # 打包排除目錄定義
├── start_all.bat            # 一鍵開發啟動器 (同步開啟後端與前端)
├── start_backend.bat        # 獨立啟動 Python FastAPI 後端服務
├── start_frontend.bat       # 獨立啟動 Vite + Tauri 前端 UI 介面
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

專案提供了高度自動化的一鍵啟動腳本，免去繁瑣的環境設定步驟：
* **雙擊執行 `start_all.bat`** (推薦全套啟動)：
  - 自動搜尋系統中的 Python 3.13 / 3.14 執行檔。
  - 自動於專案根目錄下建立虛擬環境 `.venv`。
  - 自動安裝並更新 `requirements.txt` 中的所有依賴（包含 FastAPI, Uvicorn, Websockets, Ruff, Pytest, Httpx 等）。
  - 自動使用 `ruff` 對整個專案代碼進行靜態檢查與格式化排版。
  - 自動在背景執行後端服務，並開啟 Tauri 桌面端圖形介面。
* **分開啟動（模組化開發時使用）**：
  - **`start_backend.bat`**：僅啟動 Python FastAPI 後端與 UDP 遙測監聽服務。開發模式下 FastAPI / WebSocket 使用 `http://127.0.0.1:8001`，Forza UDP Telemetry 使用 `127.0.0.1:8000`。
  - **`start_frontend.bat`**：僅啟動 Vite + React 前端開發伺服器與 Tauri 視窗。

---

## 一鍵打包發行 / Build Standalone Release (.exe)

您可以將後端與前端打包成一個**單一免安裝可執行檔 (.exe)**，採用標準的 **Tauri (Rust Host) + Python Sidecar** 正向架構發布：

> [!NOTE]
> **路徑設計說明**：
> 發行版的獨立執行檔在運行時，所有的預設靜態資源由 Sidecar 內建釋放；而由使用者操作產生的個人設定檔（`settings.json`）、遙測紀錄（`sessions/`）、車輛調校資料（`tunings/`）、自訂車輛參數（`car_params/`）、i18n 語系檔（`lang/`）與自訂 HUD 樣式（`hud_overlay/`）皆會**自動儲存與維護於該 `.exe` 執行檔的同級目錄下**，實現 100% 可攜與自訂擴充自由。

* **兩階段自動化打包腳本 (`build_all.bat`)**：
    1. **Phase 1 (Python Sidecar)**：PyInstaller 將 Python 後端單獨編譯為專用 Sidecar 可執行檔 `server-sidecar-x86_64-pc-windows-msvc.exe`，放置於 `frontend/src-tauri/bin/`。
    2. **Phase 2 (Tauri Bundle)**：Tauri 自動整合前端靜態資源與 Python Sidecar，產出最終的綠色免安裝 Executable。

---

## Python / uv 開發規範

本專案固定使用 Python 3.13，並由 `uv` 管理 Python interpreter、`.venv` 與所有 Python 套件。請先安裝 uv，再使用 [Python / uv 工具鏈規範](.agents/rules/python-uv.md) 中的命令；不要使用裸 `python`、`pip`、`pytest` 或 `ruff`。

標準測試命令：

```powershell
uv run --no-project --python .venv\Scripts\python.exe python -m pytest tests/
uv run --no-project --python .venv\Scripts\python.exe ruff check .
uv run --no-project --python .venv\Scripts\python.exe ruff format --check .
```

## 開發環境要求 / Prerequisites

* **uv**：Python 3.13、`.venv` 與 Python 套件安裝的必要管理工具。詳細規範請參閱 [Python / uv 工具鏈規範](.agents/rules/python-uv.md)。
* **Node.js**: 20 或以上版本
* **Rust / Cargo**: 本地端 Tauri 編譯所需 (非必須，若無則自動降級至 Web 瀏覽器調試模式)

---

## 開發者規範與程式碼格式化 / Developer Guide & Formatting

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
> `start_all.bat` 啟動腳本已整合自動格式化步驟。在日常開發中，每次執行 `start_all.bat` 時都會自動執行 `ruff format` 與 `ruff check`，確保代碼始終符合格式規範。

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

目前的前端測試套件涵蓋 66 個測試檔案，共 418 個單元測試案例：
| 測試檔案 | 覆蓋範圍 |
| :--- | :--- |
| `tuningMath.test.ts` | AEGO 齒輪比 / 彈簧 / ARB / 阻尼器 / 下壓力 / 車高與輪胎對齊等 29 個測試案例 |
| `tuningDiagnosis.test.ts` | 底盤遙測即時問題與動態調校診斷邏輯測試 |
| `loadTransfer.test.ts` / `tireGeometry.test.ts` | Phase 4B 四輪估計垂直載荷、載荷轉移與輪胎幾何先驗 |
| `driftMath.test.ts` | 甩尾分數與甩尾角度計算邏輯測試 |
| `telemetryCards.test.ts` | 遙測數據卡片格式化與狀態映射測試 |
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

## 致謝與專案參考 / Credits & Acknowledgements

* **Credits**: [Paburrito/forza-horizon-6-custom-hud](https://github.com/Paburrito/forza-horizon-6-custom-hud)
  Special thanks to Paburrito for the original "Forza Horizon 6 - Custom HUD" design and inspiration.

---

## Release Build Contract

The release artifact is a single `FH6-HorizonTuner.exe`. No installer and no
separate sidecar file are required. The PyInstaller backend is embedded into
the Tauri host and extracted to a versioned temporary directory at startup.
User data is stored beside the executable when that directory is writable,
with an AppData fallback for protected locations.

## 開發環境連接埠

本專案使用兩個不同的本機連接埠，請勿將它們混用：

| 用途 | 協定 | 預設連接埠 |
| --- | --- | ---: |
| Forza Horizon Data Out Telemetry | UDP | `8000` |
| FastAPI REST API / WebSocket | HTTP / WebSocket | `8001` |

在遊戲中請將 **Data Out IP Address** 設為 `127.0.0.1`、**Data Out Port** 設為 `8000`。前端開發模式固定連線至 `http://127.0.0.1:8001` 與 `ws://127.0.0.1:8001`。可透過 `TELEMETRY_PORT` 修改 UDP 連接埠；`BACKEND_PORT` 僅保留給明確的測試與外部 backend workflow。

Release Build 會優先使用 `8001` 作為 FastAPI HTTP 連接埠；若 `8001` 已被占用，才會 fallback 到可用的動態 TCP 連接埠。實際連接埠會在 backend bind 成功後寫入資料目錄的 `logs/web_port.txt`，前端直接使用該值；Forza UDP Telemetry 預設仍監聽 `8000`。若發生 fallback，應前往 Settings 的 MCP Server 區塊確認目前 endpoint。
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
