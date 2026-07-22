# FH6-HorizonTuner 🏎️
> **Forza Horizon 6 Real-Time Telemetry Analyzer, Vehicle Tuning Workbench & Custom Racing Dashboard Overlay**
> **《極限競速：地平線 6》即時遙測分析、車輛調校工作台與賽車客製化儀表覆蓋層**

[![Language](https://img.shields.io/badge/python-3.13%2B-blue.svg)](https://www.python.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Frontend](https://img.shields.io/badge/Frontend-Tauri%20%2B%20React-purple.svg)](https://tauri.app/)
[![Overlay](https://img.shields.io/badge/Overlay-D3D11%20%2B%20DXGI%20MPO-orange.svg)](tool/overlay/)
[![Package](https://img.shields.io/badge/Distribution-Standalone%20EXE-red.svg)](build_release.bat)

---

## 簡介 / Introduction

`FH6-HorizonTuner` 是一款專為《極限競速：地平線 6》開發的專屬遙測資料分析與車輛調校輔助工具。此專案整合了高效能的 Python 後端封包監聽服務、現代化的 Tauri 桌面端圖形介面，以及完全免注入的 DXGI MPO (Multiplane Overlay) 硬體覆蓋層渲染引擎。

目前此專案提供**即時遙測面板**、**自定義賽車儀表覆蓋層 (含視覺化編輯器)**、**車輛調校輔助**與**彈射起步測試**等核心功能，幫助玩家在操駕時即時監控車輛物理與動態反饋。

---

## 核心功能 / Core Features

* **即時遙測面板 (60Hz Live Telemetry)**: 高更新率數據可視化，包含車速、引擎轉速、馬力、扭力、渦輪增壓值 (Boost)、G 力雷達與駕駛輸入反饋。
* **自定義儀表覆蓋層 (Custom Dashboard Overlay)**:
  - 提供基於 DXGI MPO 的硬體級遊戲覆蓋層（支援獨佔全螢幕），採用三層防禦漸進式降級架構。
  - 100% 免注入、免 Hook，零反作弊封號風險。
  - 整合 **ExprTk 數學表達式引擎**，支援動態表達式綁定與條件變色邏輯。
  - 支援 4 種組件類型：**文字 (Text)**、**進度條 (ProgressBar)**、**超轉燈 (LEDGroup)** 與 **旋轉指針 (Needle)**。
* **WYSIWYG 儀表編輯器 (Visual Dashboard Designer)**: 在 Tauri 前端中提供拖曳式佈局編輯器，支援即時預覽、屬性面板、條件色彩規則表與一鍵匯入/匯出佈局設定。
* **輪胎與懸吊監控**: 即時顯示四輪獨立的輪胎表面溫度、熱胎壓與正規化懸吊行程。
* **車輛調校工作台 (Tuning Workbench)**: 提供調校設定的管理、計算與數據記錄功能。
* **彈射起步測試 (Drag Test)**: 提供起步加速度計時測試的記錄、分析與圖表回放功能。
* **診斷主控台 (Diagnostic Console)**: 內建即時日誌檢視器，支援層級篩選與 Traceback 拼接，方便即時排查問題。

---

## 專案架構 / Project Architecture

```text
FH6-HorizonTuner/
├── .github/workflows/       # GitHub CI/CD 工作流設定 (Ruff Lint + Pytest)
├── backend/                 # Python FastAPI 後端核心
│   ├── main.py              # 後端服務主入口、API 宣告與 Overlay 進程管理
│   ├── telemetry_listener.py # UDP 遙測數據流監聽與解析
│   └── car_database.json    # 內建車輛資料庫
├── frontend/                # Tauri 前端代碼 (Vite + React + TypeScript)
│   ├── src/components/      # 前端 UI 元件
│   │   ├── TelemetryView.tsx    # 即時遙測面板
│   │   ├── OverlayView.tsx      # WYSIWYG 儀表佈局編輯器
│   │   ├── TuningView.tsx       # 車輛調校設定工作台
│   │   ├── DragTestView.tsx     # 彈射起步測試
│   │   ├── AnalysisView.tsx     # 資料分析檢視
│   │   ├── DiagnosticConsole.tsx # 診斷日誌主控台
│   │   └── Navigation.tsx       # 導航元件
│   └── src-tauri/           # Tauri 視窗打包設定
├── tool/                    # 外部原生工具集
│   └── overlay/             # C++ DXGI MPO Overlay 渲染引擎
│       ├── main.cpp             # D3D11/ImGui 資料驅動渲染主入口
│       ├── DXGIOverlayManager.h/.cpp # DXGI 交換鏈管理與 MPO/降級機制
│       ├── WebSocketClient.h    # WinHTTP 原生 WebSocket 用戶端
│       └── CMakeLists.txt       # CMake 編譯設定 (自動 Fetch nlohmann/json, ExprTk, ImGui)
├── lang/                    # 系統多語言翻譯字典 (zh-tw, ja-jp 等)
├── tests/                   # Pytest 單元測試套件
├── pyproject.toml           # Ruff 格式化規則與 Pytest 設定
├── requirements.txt         # Python 依賴套件清單
├── .pkgdirignore            # 打包排除目錄定義
├── start_all.bat            # 一鍵開發啟動器
└── build_release.bat        # 一鍵打包發行腳本
```

---

## 快速開始 / Quick Start

### 1. 遊戲內 UDP 遙測設定

要接收遙測數據，您必須在《極限競速：地平線 6》遊戲中啟用資料輸出功能：
1. 啟動遊戲，進入**設定** -> **HUD 與遊戲操作 (HUD and Gameplay)**。
2. 尋找 **資料輸出 (Data Out)**，將其設為 **開啟 (ON)**。
3. 將 **資料輸出 IP 位址 (Data Out IP Address)** 填入 `127.0.0.1`。
4. 將 **資料輸出連接埠 (Data Out Port)** 填入 `20440`。

### 2. 啟動本工具

專案提供了高度自動化的一鍵啟動腳本，免去繁瑣的環境設定步驟：
* 雙擊執行 **`start_all.bat`**：
  - 自動搜尋系統中的 Python 3.13 / 3.14 執行檔。
  - 自動於專案根目錄下建立虛擬環境 `.venv`。
  - 自動安裝並更新 `requirements.txt` 中的所有依賴（包含 FastAPI, Uvicorn, Websockets, Ruff, Pytest, Httpx 等）。
  - 自動使用 `ruff` 對整個專案代碼進行靜態檢查與格式化排版。
  - 自動在背景執行後端服務，並開啟 Tauri 桌面端圖形介面。

---

## 一鍵打包發行 / Build Standalone Release (.exe)

您可以將後端與前端打包成一個**單一可執行檔 (.exe)**，方便綠色免安裝執行：

1. 雙擊執行 **`build_release.bat`**：
   - 腳本將會自動建置 Tauri 前端專案，生成 `frontend.exe`。
   - 自動透過 CMake 編譯 C++ Overlay 引擎，並將 `HorizonTunerOverlay.exe` 複製至 `dist/tool/` 目錄。
   - 使用 PyInstaller 將後端 FastAPI、翻譯字典（`lang/`）、預設參數（`car_params/default_car.json`）及車輛資料庫（`car_database.json`）與前端一併封裝。
   - 封裝完成後將在 `dist/` 目錄下產生獨立執行檔 `FH6-HorizonTuner.exe`。

> [!NOTE]
> **路徑設計說明**：
> 發行版的獨立執行檔在運行時，所有的預設資源會由暫存目錄釋放讀取；而由使用者操作產生的個人設定檔（`settings.json`）、遙測紀錄（`sessions/`）以及車輛調校資料（`tunings/`）皆會**自動儲存於該 `.exe` 執行檔的同級目錄下**，確保您的調校數據能隨身帶走。

* **排除非發行資源目錄 (.pkgdirignore)**：
    * 專案根目錄下的 **`.pkgdirignore`** 檔案用於定義不需要打包進 `.exe` 中的目錄（例如：虛擬環境 `.venv`、開發暫存目錄 `build`、測試程式 `tests`、C++ 原始碼 `tool` 等）。
    * 當執行 `build_release.bat` 時，腳本會自動掃描根目錄。若發現有新增的資料夾既不在 `.pkgdirignore` 中、也未在打包指令中進行 `--add-data` 配置，將會主動彈出互動提示：
        * **輸入 Y**：自動將該資料夾新增至 `.pkgdirignore` 以在未來忽略它。
        * **輸入 N**（超時 10 秒亦為 N）：警示開發者需要手動將其加入打包設定，並中止建置流程。

---

## 開發環境要求 / Prerequisites

* **Python**: 3.13 或 3.14 (標準 Windows 安裝版或 `uv` 託管版本均可)
* **Node.js**: 20 或以上版本
* **Rust / Cargo**: 本地端 Tauri 編譯所需 (非必須，若無則自動降級至 Web 瀏覽器調試模式)
* **CMake + MSVC/MinGW**: 編譯 C++ DXGI Overlay 渲染引擎所需 (選用，若不需要修改 Overlay 可直接使用預編譯二進位)

---

## 開發者規範與程式碼格式化 / Developer Guide & Formatting

專案採用 **[Ruff](https://github.com/astral-sh/ruff)** 作為標準的 Python 程式碼格式化與風格檢查工具，並採用 **Black-compatible** 排版風格。為確保代碼風格一致，並能順利通過 GitHub Actions 的 CI 檢查，請在提交代碼前遵循以下程序：

### Python 格式化 (Ruff)

* **全量格式化代碼**：
    ```bash
    # 在虛擬環境外
    ruff format .

    # 在 Windows 虛擬環境內
    .venv\Scripts\ruff.exe format .
    ```
* **驗證排版格式（CI 也會執行此步驟）**：
    ```bash
    ruff format --check .
    ```
* **靜態代碼檢查（Lint）**：
    ```bash
    ruff check .
    ```

> [!TIP]
> `start_all.bat` 啟動腳本已整合自動格式化步驟。在日常開發中，每次執行 `start_all.bat` 時都會自動執行 `ruff format` 與 `ruff check`，確保代碼始終符合格式規範。

### 後端單元測試 (Pytest)

所有的後端自動化測試均位於 `tests/` 目錄下。在提交 PR 之前，請確保所有測試通過：

```bash
# 在 Windows 虛擬環境內
.venv\Scripts\pytest

# 或指定單一測試檔案
.venv\Scripts\pytest tests/test_overlay_api.py -v
```

目前的後端測試套件涵蓋：
| 測試檔案 | 覆蓋範圍 |
| :--- | :--- |
| `test_telemetry_listener.py` | UDP 遙測封包解析與監聽器邏輯 |
| `test_log_api.py` | 後端日誌 API、Traceback 拼接與層級篩選 |
| `test_overlay_api.py` | Overlay 佈局存取、進程啟動/終止與狀態查詢 |
| `test_drag_recorder.py` | 彈射起步測試的資料記錄與分析 |

### 前端單元測試 (Vitest)

前端使用 **[Vitest](https://vitest.dev/)** 作為單元測試框架，與 Vite 工具鏈緊密整合、零額外設定。測試檔與被測模組同目錄，命名為 `<模組名>.test.ts`。

```bash
# 從專案根目錄執行
npm --prefix frontend run test

# 或從 frontend/ 目錄執行
cd frontend && npm run test
```

目前的前端測試套件涵蓋：
| 測試檔案 | 覆蓋範圍 |
| :--- | :--- |
| `tuningMath.test.ts` | 彈簧 / ARB / 阻尼器 / 齒輪比 / 對齊 / 胎壓等11個導出純函數的單元測試 |

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

- [ ] 代碼已通過 `ruff format --check .` 格式驗證
- [ ] 代碼已通過 `ruff check .` 靜態檢查（無 Error / Warning）
- [ ] 後端單元測試已全數通過 (`pytest` Pass)
- [ ] 前端單元測試已全數通過 (`npm --prefix frontend run test` Pass)
- [ ] 若新增了 API 路由或後端核心邏輯，已補充對應的 Pytest 單元測試
- [ ] 若修改了 `tuningMath.ts` / `tuningDiagnosis.ts` 等前端計算邏輯，已補充對應的 Vitest 單元測試
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
| **Test (Frontend)** | 執行 `npm --prefix frontend run test` 前端 Vitest 單元測試（涵蓋 `tuningMath.ts` 等物理計算純函數） |

> [!IMPORTANT]
> CI 流程設定於 `CI-Approval` 環境下運行，需要至少一位 Reviewer 在 GitHub 上批准後才會自動觸發。請確保在推送前已於本地通過 `ruff format --check .` 與 `pytest` 驗證，以避免不必要的 CI 失敗。

---

## 授權條款 / License

本專案採用 [MIT 授權條款](LICENSE) 發行。

Copyright (c) 2026 罐頭 (eddie772tw) & Contributors.

---

## 致謝與專案參考 / Credits & Acknowledgements

Credits:Paburrito/forza-horizon-6-custom-hud
Special thanks to Paburrito for the original "Forza Horizon 6 - Custom HUD" design and inspiration.
