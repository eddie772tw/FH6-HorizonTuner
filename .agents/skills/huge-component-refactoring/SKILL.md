---
name: huge-component-refactoring
description: 當需要重構超過 250 行的 UI 元件、拆分 TuningView/TelemetryView，或改善 Canvas、React 與 60Hz 高頻渲染路徑時觸發此技能。
---

# 巨型 UI 元件與高頻渲染重構

## 何時使用

- UI 元件超過 250 行，或同時處理資料訂閱、物理計算、狀態與呈現。
- 修改 telemetry、Drift HUD、Canvas 或其他每幀/60Hz 更新的路徑。
- 需要處理 React unmount、WebSocket、timer、event listener 或 DPR/viewport 行為。

若主要問題是 Python/TypeScript 模組邊界、API 或 domain contract，使用 `modular-refactoring`。若兩者皆適用，先讀本技能處理 hot path，再讀 `modular-refactoring` 處理介面契約。

## 必須遵守的高頻路徑規則

- 不在每幀迴圈使用 `.forEach()`、`.map()`、`.filter()`、`.reduce()`、`Object.keys()` 或 `split().map().join()`。
- 不在每幀建立不必要的陣列、物件、字串或 fallback 結構；可重用的資料放在 ref 或快取中。
- 快取 DOM reference 與 CSS custom properties；避免每幀重複查詢 DOM 或寫入未變更的值。
- 不在高頻更新路徑使用 CSS transition 或會造成 layout shift 的效果。
- Canvas 必須處理 device-pixel-ratio、尺寸為 0、viewport resize 與座標基準。
- React 元件卸載時清理 WebSocket、timer、observer 與 listener，避免重連或重複訂閱。

## 重構流程

1. 先閱讀 `AGENTS.md`、相關 rule、Journal 與本技能，並記錄檔案 ownership。
2. 先建立行為基準：執行既有測試，確認輸入、單位、渲染與 cleanup 行為。
3. 將純計算與資料轉換抽到 `src/utils/` 或明確的 domain module，先補 isolation tests。
4. 將長 DOM 子樹拆成語意清楚的子元件，只傳遞必要 Props，不透傳巨型狀態物件。
5. 使用 refs、memoization 或訂閱隔離縮小高頻更新範圍；不要為了拆檔案而改變資料語意。
6. controlled React form 必須透過使用者可觀察的輸入流程驗證，不得只修改 DOM value 製造假陽性。
7. 執行 `cmd /c "pnpm -C frontend run test"`，必要時補跑相關 E2E 與效能檢查。
8. 完成後執行 `git diff --check`，在 Journal 記錄已驗證的效能或行為結論。

## 完成條件

- 行為基準測試仍通過。
- 沒有新增高頻迴圈配置、同步 I/O、重複訂閱或未清理資源。
- UI 拆分後仍保留既有 accessibility、responsive layout 與物理計算契約。
