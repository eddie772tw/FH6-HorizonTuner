---
name: huge-component-refactoring
description: 當需要重構或拆分超過 250 行之巨型 UI 組件（如 TuningView.tsx、TelemetryView.tsx），或優化 60Hz 高頻渲染效能時觸發此技能。
---

# 巨型 UI 組件拆分與高頻渲染優化指南 (Huge Component Refactoring Skill)

## 🎯 核心原則

1. **250 行警戒線**：
   - 單一 UI 組件超過 250 行時主動評估拆分。
   - 將「計算邏輯」、「數據訂閱」與「UI 視圖呈現」徹底分層處理。

2. **高頻 60Hz 渲染保護**：
   - 避免在 React Render 樹高頻重新渲染整個巨型頁面。
   - 使用 `useMemo` / `useCallback` 對高頻更新數據進行隔離。

3. **解耦與介面隔離**：
   - 拆分出的子組件只接收必要之 Props 特性，不直接透傳巨型狀態物件。

## 🧪 重構 SOP
1. 提取純邏輯至 `src/utils/` 並確保有單元測試防護。
2. 將長 DOM 子樹獨立為子組件（如 `SuspensionCard.tsx`、`GearingCard.tsx`）。
3. 執行前端測試驗證：`cmd /c "npm --prefix frontend run test"`。
