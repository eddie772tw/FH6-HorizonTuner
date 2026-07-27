# 前端架構重構與 HUD 模組獨立 — Agent 交接文件

> **建立日期**：2026-07-24  
> **對話 ID**：`98dd5ee1-369d-4969-8f0a-5045e225e2c0`  
> **狀態**：Phase 1 完成，Phase 2 部分完成

---

## 📋 任務摘要

本次任務的核心目標：
1. **將 HUD 功能從 `frontend` 資料夾中完全獨立出來**，讓使用者可以免編譯擴充自訂儀表板。
2. **拆分前端巨型 UI 元件**（TuningView 101KB、TelemetryView 46KB、CarParamsView 56KB），提升可讀性、可維護性與 60Hz 渲染效能。

---

## ✅ 已完成的工作

### 1. HUD 完全獨立化（100% 完成）

| 項目 | 修改內容 |
|-----|---------|
| **檔案搬遷** | `frontend/public/hud/` → `hud_overlay/`（專案根目錄） |
| `backend/main.py` | 新增 `from fastapi.staticfiles import StaticFiles`，掛載 `/hud` 路由伺服 `hud_overlay/` |
| `hud_overlay/shared/ws.js` | **完全改寫**：從 `BroadcastChannel` 改為直連後端 WebSocket（含自動重連、初始 config fetch、`hud:config` 即時推送監聽） |
| `backend/main.py` 的 `save_overlay_config` | 儲存 config 後新增 `await manager.broadcast_json({"type": "hud:config", "data": data})` 廣播至所有 WebSocket 客戶端 |
| `frontend/src-tauri/src/lib.rs` | `toggle_hud_window` 新增 `window.eval()` 動態導向 `http://127.0.0.1:<port>/hud/index.html` |
| `OverlayView.tsx` | 搬遷至 `features/overlay_control/`，修正 import 路徑 |

> **跨源通訊陷阱**：`BroadcastChannel` 嚴格限定同源 (Same-Origin)。HUD 從 Tauri 內嵌資源 (`tauri://localhost`) 改為由 FastAPI 伺服 (`http://127.0.0.1:<port>`) 後，原有的 BroadcastChannel 機制**完全失效**。已透過後端 WebSocket 廣播解決。詳見 Journal.md 2026-07-24 條目。

### 2. TelemetryView 拆分（100% 完成）

| 檔案 | 大小 | 說明 |
|-----|------|------|
| `features/telemetry/TelemetryView.tsx` | 14 KB | 主框架 (原 46KB) |
| `features/telemetry/components/GForceRadar.tsx` | 7.2 KB | G 力雷達圖 (React.memo) |
| `features/telemetry/components/TireRadar.tsx` | 11.2 KB | 輪胎雷達圖 (React.memo) |
| `features/telemetry/components/SuspensionBar.tsx` | 6.7 KB | 懸吊行程條 (React.memo) |
| `features/telemetry/components/PedalTraceCanvas.tsx` | 4.1 KB | 踏板歷程波形 (React.memo) |
| `features/telemetry/components/SteerBar.tsx` | 1.8 KB | 方向盤指示 (React.memo) |
| `features/telemetry/components/VerticalInputBar.tsx` | 1.9 KB | 離合器/手煞車直式條 (React.memo) |

### 3. CarParamsView 拆分（100% 完成）

| 檔案 | 大小 | 說明 |
|-----|------|------|
| `features/car_params/CarParamsView.tsx` | 18 KB | 主框架 (原 56KB) |
| `features/car_params/components/BasicCarInfo.tsx` | 6.3 KB | 基本車輛資訊表單 |
| `features/car_params/components/AdvancedGeometry.tsx` | 7.1 KB | 進階幾何參數 |
| `features/car_params/components/AdjustabilityLimits.tsx` | 3.3 KB | 可調範圍限制 |
| `features/car_params/components/DynoChart.tsx` | 19.6 KB | 馬力/扭力曲線圖 |
| `features/car_params/components/CommonStyles.ts` | 1.1 KB | 共用 CSS 常量 |
| `features/car_params/components/ToggleSwitch.tsx` | 1.1 KB | 開關元件 |

### 4. TuningView 拆分（約 60% 完成）

| 檔案 | 大小 | 狀態 |
|-----|------|------|
| `features/tuning/TuningView.tsx` | **77 KB** | 主框架 (原 101KB)，仍偏大 |
| `features/tuning/components/SuspensionTuner.tsx` | 8.7 KB | ✅ 實質抽離完成 (React.memo) |
| `features/tuning/components/GearingTuner.tsx` | 8.5 KB | ✅ 實質抽離完成 (React.memo) |
| `features/tuning/components/DifferentialTuner.tsx` | 6.2 KB | ✅ 實質抽離完成 (React.memo) |
| `features/tuning/components/ARBTuner.tsx` | 0.5 KB | ✅ **已由 TuningSliderGrid 取代** |
| `features/tuning/components/AeroTuner.tsx` | 0.5 KB | ⚠️ **僅骨架**，實際 JSX 仍在 TuningView 中 |

---

## 🔧 待接手的工作

### Priority 1：完成 TuningView.tsx 剩餘拆分

`TuningView.tsx` 目前仍有 **77KB / ~1440 行**，需要繼續拆分以下區塊：

#### ✅ a) 輪胎壓力與 ARB Slider 區塊（已完成）

目前 `ARBTuner.tsx` 是空骨架。但注意：ARB slider 與 Tire Pressure slider 混在同一個 `<div>` 網格內：

```
L1384-L1392: 左側 = Front/Rear Tire Pressure + Front/Rear Anti-roll Bar
L1394-L1407: 右側 = Front/Rear Springs + Ride Height + Damping (8 sliders)
```

**建議做法**：建立一個 `TuningSliderGrid.tsx` 元件，將整個 slider 網格區塊（含左右兩欄約 30 行 JSX）統一抽離，而非單獨拆 ARB。

#### b) Aero（空力）區塊

`AeroTuner.tsx` 是空骨架。但空力在 TuningView 中只有 2 個數值（`tuning.aero.front` / `tuning.aero.rear`），散落在定位/對齊 (Alignment) 區塊附近。由於體積極小（~10 行），**可以考慮不獨立抽離**，或與 Alignment 一起封裝為 `AlignmentAeroTuner.tsx`。

#### ✅ c) 診斷報告 (Diagnosis Report) 區塊（已完成）

此區塊約 290 行，包含懸吊診斷、輪胎診斷、操控評分等多個子面板。建議抽離為 `DiagnosisPanel.tsx`。

#### ✅ d) 拖曳測試與齒輪比優化 (Drag Test & Gearing Optimization)（已完成）

此區塊包含 Drag test wizard 與齒輪比圖表，約 150 行，建議抽離為 `DragTestSection.tsx`。

### Priority 2：仍留在 `src/components/` 的大型元件

以下元件仍在舊的 `src/components/` 資料夾中，可考慮遷移至 `features/`：

| 元件 | 大小 | 建議 |
|-----|------|------|
| `DragTestView.tsx` | 43.8 KB | 遷移至 `features/drag_test/` |
| `ThemeView.tsx` | 23.2 KB | 遷移至 `features/theme/` |
| `ChartEditModal.tsx` | 21 KB | 遷移至 `features/analysis/` |
| `SettingsView.tsx` | 19.2 KB | 遷移至 `features/settings/` |
| `AnalysisView.tsx` | 16.3 KB | 遷移至 `features/analysis/` |

---

## ⚠️ 重要注意事項與避坑指南

### 1. TuningView 拆分的風險點

- **TuningView 內部高度耦合的 State**：`tuning` (TuningState) 是一個龐大的巢狀物件，包含 `tires`, `alignment`, `arb`, `springs`, `damping`, `aero`, `brake`, `diff`, `gearing` 共 9 個子區塊。子元件透過 `updateSection(section, field, value)` 回寫父元件 state。
- **切勿破壞 `recalculateAll()` 函數**：此函數負責根據車輛參數、賽道類型等一次性計算出所有調校值。它直接產生完整的 `TuningState`，**不適合拆分到子元件內部**。
- **`TuningSlider` 是一個內嵌的 `React.memo` 元件**（定義在 TuningView.tsx L1455 底部），所有 slider 都依賴它。若要搬移 slider 區塊，**必須同步搬移或提取此元件**。
- **`smallInputStyle` / `btnStyle` 等 CSS 常量** 定義在 TuningView 檔案底部。抽離子元件時需要一併處理（參考 `DifferentialTuner.tsx` 的做法：在子元件內部重新宣告）。

### 2. HUD 通訊架構

```
主 GUI (OverlayView.tsx)
  ↓ HTTP POST /api/overlay/config
後端 (FastAPI main.py)
  ↓ WebSocket broadcast {"type": "hud:config", "data": {...}}
HUD 視窗 (hud_overlay/shared/ws.js)
  ↓ window.dispatchEvent('hud:config')
HUD Launcher (hud_overlay/index.html)
  ↓ postMessage to iframe
HUD 儀表 (simple/index.html 或 advanced/index.html)
```

- `OverlayView.tsx` 中的 `BroadcastChannel` 程式碼**仍然存在**（`channelRef`），但在 HUD 獨立後它只用於同源的 Tauri 視窗內部通訊。真正的跨源設定同步已改由後端 WebSocket 廣播負責。
- HUD 的 `ws.js` 在 WebSocket 連線成功後會主動 `fetch(/api/overlay/config)` 拉取初始設定，確保**冷啟動時設定不遺漏**。

### 3. 測試與驗證指令

```powershell
# 前端單元測試（58 項，全部在 src/utils/ 下）
cmd /c "npm --prefix frontend run test"

# 後端測試
pytest tests/

# 前端 Release Build 型別檢查
cmd /c "npm --prefix frontend run build"
```

### 4. 現有目錄結構快照

```
frontend/src/
├── App.tsx                           # 主入口，import 路徑已更新
├── App.css
├── main.tsx
├── features/
│   ├── tuning/                       # 🔧 需繼續拆分
│   │   ├── TuningView.tsx (77KB)
│   │   └── components/ (5 files)
│   ├── telemetry/                    # ✅ 完成
│   │   ├── TelemetryView.tsx (14KB)
│   │   └── components/ (6 files)
│   ├── car_params/                   # ✅ 完成
│   │   ├── CarParamsView.tsx (18KB)
│   │   └── components/ (6 files)
│   └── overlay_control/              # ✅ 完成
│       └── OverlayView.tsx (22KB)
├── components/                       # 仍有 12 個元件，部分可遷移
├── context/                          # React Context（不動）
├── hooks/                            # Custom Hooks（不動）
└── utils/                            # 純函數 + 測試（不動）

hud_overlay/                          # ✅ 已獨立（專案根目錄）
├── index.html                        # Launcher Host
├── shared/                           # 共用 JS 模組
│   ├── ws.js                         # 已改寫為直連 WebSocket
│   ├── hud-core.js
│   ├── telemetry-cards.js
│   └── ...
├── simple/                           # Simple HUD 樣式
├── advanced/                         # Advanced HUD 樣式
└── assets/                           # 字型等資源
```

---

## 🎯 建議的接手順序

1. 閱讀 `.agents/AGENTS.md` 了解開發守則
2. 閱讀 `.agents/Journal.md` 最後一條（2026-07-24）了解本次重構的學習點
3. 閱讀 `.agents/skills/huge-component-refactoring/SKILL.md` 了解拆分 SOP
4. 從 TuningView.tsx 的「診斷報告 (Diagnosis)」區塊開始拆分（最大、最獨立的區塊）
5. 執行測試驗證
