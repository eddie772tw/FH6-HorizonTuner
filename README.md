# FH6-HorizonTuner 🏎️
> **Forza Horizon 6 Real-Time Telemetry Analyzer, Vehicle Tuning Workbench & Custom Racing Dashboard Overlay**
> **《極限競速：地平線 6》即時遙測分析、車輛調校工作台與賽車客製化儀表覆蓋層**

[![Language](https://img.shields.io/badge/backend-Rust-orange.svg)](https://www.rust-lang.org/)
[![Frontend](https://img.shields.io/badge/Frontend-Tauri%20v2%20%2B%20React-purple.svg)](https://tauri.app/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Distribution](https://img.shields.io/badge/Distribution-Pure%20Native%20EXE-blue.svg)](build_release.bat)

---

## 簡介 / Introduction

`FH6-HorizonTuner` 是一款專為《極限競速：地平線 6》開發的專屬遙測資料分析與車輛調校輔助工具。本專案採用 **Pure Rust (Tauri v2)** 原生架構，具備零開銷 UDP 60Hz+ 遙測數據解構、純函數物理算牌與高度極致的效能體驗。

目前此專案提供**即時遙測面板**、**自定義賽車儀表覆蓋層 (含視覺化編輯器)**、**車輛調校工作台 (Tuning Workbench)** 與 **彈射起步測試 (Drag Test)** 等核心功能。

---

## 專案架構 / Project Architecture

```text
FH6-HorizonTuner/
├── .github/workflows/       # GitHub CI/CD 工作流 (Rust Toolchain + Vitest)
├── frontend/                # Tauri 專案與前端代碼 (Vite + React + TypeScript)
│   ├── src/                 # 前端 UI 元件與物理算牌邏輯
│   │   ├── components/      # 遙測、調校、彈射測試與編輯器 UI
│   │   ├── services/        # apiClient 通訊服務層
│   │   └── utils/           # tuningMath.ts 物理調校單一真理 (Pure Functions)
│   └── src-tauri/           # Pure Rust 原生後端
│       ├── src/telemetry.rs # UDP 60Hz 零拷貝數據解構與 Tauri Event 廣播
│       ├── src/storage.rs   # JSON 資料庫與檔存持久化
│       ├── src/commands.rs  # Tauri IPC 指令登記處
│       ├── src/lib.rs       # Tauri App 主初始化與線程調度
│       └── rustfmt.toml     # Rust 格式化規則 (對齊 Ruff 88 字元行寬)
├── biome.json               # 前端 Biome 靜態檢查與格式化設定
├── lang/                    # 系統多語言翻譯字典 (zh-tw, ja-jp 等)
├── .pkgdirignore            # 發行打包未註冊資源掃描與排除定義
├── start_all.bat            # 一鍵開發啟動腳本
└── build_release.bat        # 一鍵原生發行檔打包腳本
```

---

## 快速開始 / Quick Start

### 1. 遊戲內 UDP 遙測設定

在《極限競速：地平線 6》遊戲中啟用資料輸出功能：
1. 進入**設定** -> **HUD 與遊戲操作 (HUD and Gameplay)**。
2. 將 **資料輸出 (Data Out)** 設為 **開啟 (ON)**。
3. 將 **資料輸出 IP 位址 (Data Out IP Address)** 填入 `127.0.0.1`。
4. 將 **資料輸出連接埠 (Data Out Port)** 填入 `8000` (或工具設定埠口)。

### 2. 啟動本工具

* 雙擊執行 **`start_all.bat`**：
  - 自動檢測 Node.js 與 Rust (Cargo) 環境。
  - 自動驗證與修復程式碼格式。
  - 自動關閉舊的背景視窗進程，避免衝突。
  - 以 Tauri Dev 模式啟動原生開發伺服器與 React 介面。

---

## 一鍵打包發行 / Build Standalone Release (.exe)

雙擊執行 **`build_release.bat`**：
1. 自動掃描未註冊資源目錄 (`.pkgdirignore`)。
2. 自動校驗代碼規範（`cargo fmt` & `clippy`）。
3. 自動編譯產生單一獨立 Pure Rust 原生執行檔 `.exe`。
