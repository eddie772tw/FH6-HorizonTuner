---
name: modular-refactoring-expert
description: 當需要拆分龐大組件、重構底層邏輯或建立全新功能模組時觸發此技能。
---

# 模組化拆分與重構實踐指南 (Modular Refactoring Skill)

## 🎯 模組拆分 CheckList (SOP)

當你準備重構或新建一個模組時，請嚴格執行以下步驟：

### 步驟 1：定義模組合約 (Interface Definition)
- 先定義輸入與輸出的 TypeScript Interface (前端) 或 TypedDict / Dataclass (後端)。
- 確保邊界清晰，不露出內部實作細節。

### 步驟 2：抽離純邏輯 (Extract Pure Logic)
- 將所有涉及數學運算、物理計算或遙測解析的程式碼，移動至獨立的 `.ts` 或 `.py` 模組中。
- 範例：將懸吊計算從 `TuningView.tsx` 抽離至 `tuningMath.ts`。

### 步驟 3：建立單元測試 (Add Isolation Tests)
- 在不啟動 UI 的情況下，針對新模組編寫測試：
  - 前端模組：於 `*.test.ts` 中撰寫 Vitest（在 Windows PowerShell 下執行 `cmd /c "npm --prefix frontend run test"`）。
  - 後端模組：於 `tests/` 中撰寫 Pytest（執行 `pytest tests/`）。

### 步驟 4：組件/介面對接 (Wire Up)
- 在 UI 組件或主流程中引用新模組，並確認前後端單元測試全數通過。

## 🚫 反模式 (Anti-Patterns to Avoid)
- **循環依賴 (Circular Dependency)**：A 模組引用 B 模組，B 模組又引用 A 模組。
- **巨型組件 (God Component)**：一個元件同時處理 WebSocket 接收、物理計算、State 管理與 UI 繪製。