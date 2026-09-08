---
name: huge-component-refactoring
description: 當需要重構超過 250 行的 UI 元件、拆分 TuningView/TelemetryView，或改善 Canvas、React 與 60Hz 高頻渲染路徑時觸發此技能。
---

# 巨型 UI 元件與高頻渲染重構

## 觸發條件與分工邊界

- **觸發條件**：
  1. UI 元件超過 250 行，或同時混雜資料訂閱、物理計算與 DOM 呈現。
  2. 變更 60Hz 遙測更新路徑（Telemetry HUD、Drift HUD、Canvas 儀表）。
- **職責分工**：
  - 模組邊界、API 與資料結構契約由 `modular-refactoring` 規範；UI 組件與 60Hz 高頻渲染由本技能主導。

## 60Hz 高頻渲染核心契約

1. **Zero-Allocation 零暫態配置契約**：
   - 60Hz 繪製主迴圈（Tick/Render Loop）內維持 $O(1)$ 空間複雜度，嚴禁在每幀建立暫態物件、閉包或陣列映射，避免 V8 垃圾回收（GC）引起幀抖動。
   - 佈局座標、錨點與幾何矩形統一於 Resize 或狀態變更時預先計算並快取。
2. **Canvas 視圖基準與 DPI 合約**：
   - Canvas 必須適應 Device Pixel Ratio (DPR)、處理容器尺寸為 0 防呆與 Resize 變換。
3. **高頻樣式隔絕**：
   - 60Hz 驅動之元素嚴禁套用 CSS Transition 或可能觸發重排（Reflow / Layout Shift）之動態屬性。
4. **資源生命週期契約**：
   - 元件卸載時必須嚴格清理 WebSocket、Animation Frame、Timer 與各類 Observer，杜絕幽靈連線或重複訂閱。

## 重構標準 SOP

1. **鎖定行為基準**：先執行現有單元測試（`cmd /c "pnpm -C frontend run test"`），確認輸入、單位與渲染輸出一致。
2. **抽離計算與邏輯層**：將數值轉換、物理算牌與演算法抽取至 `src/utils/` 純函式模組，並優先補齊隔離測試。
3. **DOM 結構解耦**：將過長的 JSX/TSX 拆分為語意單一的小型子組件，透過明確 Props 傳遞，禁止透傳巨型狀態物件。
4. **驗證與交付**：
   - 執行前端全套測試：`cmd /c "pnpm -C frontend run test"`
   - 執行前端打包檢查：`cmd /c "pnpm -C frontend run build"`
   - 執行 `git diff --check`，並於 `.agents/Journal.md` 登錄驗證數據。
