# HUD 設定頁截圖

PR #615 的視覺說明素材，來源為 `8316ed0f224b5655cc0945ab6b2aa20ffab65805` 的實際 React HUD 設定頁。

- 日期：2026-11-04。
- 環境：Windows 上的 sandboxed Edge、繁體中文、Halfmoon default 核心／深色模式。
- 三張桌面截圖：1280×720；窄幅示例：320×720。
- 遙測圖展開詳細設定，示範同時展開多張元素卡片；實際進頁預設收合。
- 來源：`frontend/src/features/overlay_control/tests/browser/verify.cjs`，以 `OUTPUT_DIR=scratch/hud-settings-browser-final` 執行的輸出。圖片直接複製，未進行合成或修圖。
- 使用真實頁面、theme provider 與 runtime，以及隔離 HTTP 測試資料；瀏覽器不提供原生 HUD 視窗能力，因此啟閉與螢幕選擇呈停用狀態。不是遊戲畫面或原生功能驗收。

These screenshots show the real settings UI with isolated browser fixture data. The telemetry image intentionally expands multiple cards; they are collapsed by default. Native-only controls are unavailable in the browser. No image editing or compositing was applied.
