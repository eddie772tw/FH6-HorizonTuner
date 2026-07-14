# FH6-HorizonTuner (極限競速：地平線 6 遙測調校工具)

`FH6-HorizonTuner` 是一款專為《極限競速：地平線 6》開發的專屬遙測資料分析與車輛調校輔助工具。此專案整合了高效能的 Python 後端封包監聽服務，以及現代化的 Tauri 桌面端圖形介面。

目前這個專案優先專注於提供**即時遙測以及自定義儀表** 的核心功能，幫助玩家在操駕時即時監控車輛物理與動態反饋，為後續的系統化車輛調校奠定精確的數據基礎。

---

## 核心功能 (v1.0.0a)

* **即時遙測面板**: 提供高更新率 (60Hz) 的數據可視化，包含車速、引擎轉速、馬力、扭力、渦輪增壓值 (Boost) 等。
* **自定義儀表覆蓋層**:提供可自定義的覆蓋儀表元素以及一個介面編輯器。
* **輪胎狀態監控**: 即時顯示四輪獨立的**輪胎表面溫度**與**熱胎壓**，協助評估輪胎工作狀態與冷胎壓調整。
* **懸吊行程監控**: 顯示四輪獨立的**正規化懸吊行程** (Normalized Suspension Travel)，輔助判斷避震器是否觸底。
* **G 力雷達圖**: 記錄並即時顯示橫向與縱向 G 力分佈，並自動記錄最近 30 秒內的最大 G 力極值標記，方便分析重量轉移與最大抓地力。
* **駕駛輸入反饋**: 即時顯示油門、煞車、離合器、手煞車以及方向盤轉向角度的動態百分比，方便檢視操駕細節。

---

## 快速開始

### 1. 遊戲內 UDP 遙測設定
要接收遙測數據，您必須在《極限競速：地平線 6》遊戲中啟用資料輸出功能：
1. 啟動遊戲，進入**設定** -> **HUD 與遊戲操作 (HUD and Gameplay)**。
2. 尋找 **資料輸出 (Data Out)**，將其設為 **開啟 (ON)**。
3. 將 **資料輸出 IP 位址 (Data Out IP Address)** 填入 `127.0.0.1`。
4. 將 **資料輸出連接埠 (Data Out Port)** 填入 `20440`。

### 2. 啟動本工具
專案提供了高度自動化的一鍵啟動腳本，免去繁瑣的環境設定步驟：
* 雙擊執行 **[start_all.bat](file:///d:/FH6-Bundle/FH6-HorizonTuner/start_all.bat)**：
  - 自動搜尋系統中的 Python 3.13 / 3.14 執行檔。
  - 自動於專案根目錄下建立虛擬環境 `.venv`。
  - 自動安裝並更新 [requirements.txt](file:///d:/FH6-Bundle/FH6-HorizonTuner/requirements.txt) 中的所有依賴（包含 FastAPI, Uvicorn, Websockets, Ruff, Pytest, Httpx 等）。
  - 自動使用 `ruff` 對整個專案代碼進行靜態檢查與格式化排版。
  - 自動在背景執行後端服務，並開啟 Tauri 桌面端圖形介面。

---

## 一鍵打包發行 (Standalone Release)

您可以將後端與前端打包成一個**單一可執行檔 (.exe)**，方便綠色免安裝執行：

1. 雙擊執行 **[build_release.bat](file:///d:/FH6-Bundle/FH6-HorizonTuner/build_release.bat)**：
   - 腳本將會自動建置 Tauri 前端專案，生成 `frontend.exe`。
   - 使用 PyInstaller 將後端 FastAPI、翻譯字典（`lang/`）、預設參數（`car_params/default_car.json`）及車輛資料庫（`car_database.json`）與前端一併封裝。
   - 封裝完成後將在 `dist/` 目錄下產生獨立執行檔 `FH6-HorizonTuner.exe`。

> [!NOTE]
> **隨身版路徑設計說明**：
> 打包後的獨立執行檔在運行時，所有的預設資源會由暫存目錄釋放讀取；而由使用者操作產生的個人設定檔（`settings.json`）、遙測紀錄（`sessions/`）以及車輛調校資料（`tunings/`）皆會**自動儲存於該 `.exe` 執行檔的同級目錄下**，確保您的調校數據能隨身帶走。

---

## 專案結構說明

```text
FH6-HorizonTuner/
├── .github/workflows/   # GitHub CI/CD 工作流設定
├── backend/             # FastAPI 後端核心代碼
│   ├── main.py          # 後端服務主入口與 API 宣告
│   ├── telemetry_listener.py # UDP 遙測數據流監聽與解析
│   └── car_database.json # 內建車輛資料庫
├── frontend/            # Tauri 前端代碼 (Vite + React)
│   ├── src/components/  # 前端 UI 元件 (TelemetryView 等)
│   └── src-tauri/       # Tauri 視窗打包設定
├── lang/                # 系統多語言翻譯字典
├── tests/               # Pytest 單元測試目錄
├── pyproject.toml       # Ruff 與 Pytest 品質規則設定
├── requirements.txt     # 專案統一依賴套件清單
├── start_all.bat        # 自動化一鍵開發啟動器
└── build_release.bat    # 自動化單一執行檔打包腳本
```

---

## 開發環境要求

* **Python**: 3.13 或 3.14 (標準 Windows 安裝版或 `uv` 託管版本均可)
* **Node.js**: 20 或以上版本
* **Rust / Cargo**: 本地端 Tauri 編譯所需 (非必須，若無則自動降級至 Web 瀏覽器調試模式)

---

## 授權條款

本專案採用 [MIT 授權條款](file:///d:/FH6-Bundle/FH6-HorizonTuner/LICENSE) 發行。
Copyright (c) 2026 罐頭 (eddie772tw) & Contributors.
