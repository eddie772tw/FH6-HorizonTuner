# G0 Lite 既有瀏覽器介面觀察

日期：2026-09-14（Asia/Taipei）。Source：baseline worktree，`5891d21bca35161836d84c51d1b6e9c279ec4709`。這是舊版基準，不是 Shell 候選驗收。

透過 Codex in-app browser 讀取 `http://localhost:1420/lite/index.html`。Vite 在 IPv6 loopback 的 1420 監聽；backend 為 baseline 原始碼 dev instance，HTTP 8001，資料目錄為該 worktree 的 `scratch/ia-runtime-data`。只開啟頁面與設定入口，沒有切換任何設定、啟動 HUD 或匯入資料。

觀察到：

- 頂層為儀表板、HUD 儀表板、系統設定；沒有 Tune、Sessions 或 Launch Test。
- Dashboard 顯示 GAME IDLE / MENU、Unknown Car、RPM/速度為 0；五個既有遙測卡片可見。頂部仍顯示 UDP 訊號活躍，因此不能拿該 badge 當實際遊戲資料證據。
- Lite 設定頁仍包含 Use Developer Tuning View。這證實需要按 capability 隱藏該 Tune-only 選项。
- Language、units、telemetry port/forwarding、recording、Discord、MCP、updates、storage 都仍有入口；不因 IA 重構任意排除。

範圍限制：僅為 browser/idle 的既有畫面觀察。未驗證 Tauri、native HUD launch/leave/reenter、MoTeC、真實 FH6、效能三次量測或 G2。G0-observability 與整體 G0 均仍不完整。
