# G0 基準執行結果

日期：2026-09-14（Asia/Taipei）。Base SHA：`5891d21bca35161836d84c51d1b6e9c279ec4709`。

## 編譯與測試

Luna 在唯讀產品 worktree `D:/FH6-frontend-ia-20260913/baseline` 執行，與 Coordinator 的 contracts worktree baseline 結果一致。

| 命令 | 結果 |
| --- | --- |
| `pnpm install --frozen-lockfile` | exit 0；pnpm 11.20.0；118 packages；lockfile 未改 |
| `pnpm -C frontend run test` | exit 0；108 files / 719 tests；Vitest 5.0.0；獨立 baseline 3.50 秒 |
| `pnpm -C frontend run build` | exit 0；TypeScript + Vite 8.2.2；724 modules；Full/Lite 兩入口存在 |
| `git status --short --branch` | detached baseline、產品檔乾淨 |

兩入口為 `frontend/dist/index.html`、`frontend/dist/lite/index.html`。編譯不代表 native lifecycle 已驗證。完整本機輸出保留在 baseline worktree 的 `scratch/ia-baseline-install.log`、`scratch/ia-baseline-test-final.log`、`scratch/ia-baseline-build-final.log`、`scratch/ia-baseline-handoff.md`；不是產品 runtime 檔案。

## Browser 基準

Coordinator 啟動隔離資料後端（`--dev --data-dir scratch/ia-runtime-data`）及該 worktree 的 Vite 1420。透過 in-app browser 實際開啟 Full：backend readiness 後 React 畫面載入，build badge 顯示 `HEAD (5891d21)`，Data Out guide 可關閉，Live 五類儀表及 Tune 正式四步可達。資料狀態為 idle / 無真實遊戲封包；沒有將這次頁面觀察稱為 FH6 實車或 native HUD 驗收。

已觀察既有 UI 差異：傳輸連線成功時舊 Navigation 顯示「UDP 訊號活躍」，但 Data Out 健康狀態仍為 Waiting for Data Out。P2 狀態列應清楚區分 backend transport 與 UDP 封包狀態。

## 原生 dev 啟動的局部紀錄

後續 baseline 原生 dev 編譯使用獨立 native-target 與明確外部 backend，log 為 `D:/FH6-frontend-ia-20260913/baseline/scratch/ia-native-baseline.log`。既有 log 顯示 dev profile 編譯完成（2m 02s）、執行 FH6-HorizonTuner.exe，並顯示 Connecting to explicitly selected external backend。這只證明該次編譯/啟動路徑，不代表完整 native UI、HUD 或遊戲驗收。

依使用者最新規劃交付範圍，本次收尾只讀取上述 log，並停止本任務的 Tauri/Vite/backend session，未繼續產品測試。基準工作樹目前有 CLI 啟動後 Cargo.toml 的 dirty/換行提示，尚未清理；當前狀態見 [實作快照](../handoffs/implementation-snapshot-20260914.md)，不能沿用前表測試當時的 clean 狀態。

## 未完成與靜態線索

### 本次收尾保存的局部 browser 觀測

baseline_runtime / Luna 保存了 [觀測紀錄](D:/FH6-frontend-ia-20260913/baseline/scratch/ia-g0-browser-runtime.md) 與 [原始 JSON](D:/FH6-frontend-ia-20260913/baseline/scratch/ia-g0-browser-runtime.json)。Full idle 單次暖機 30 秒、觀測 64.088711 秒；ScriptDuration 差 0.682644 秒、TaskDuration 差 1.634878 秒、JSHeapUsedSize 由 31,142,960 降至 24,858,488 bytes。這些是 renderer 指標，不是 OS CPU/RSS 平均、效能改善證據或洩漏結論。Lite、其餘重複、成對 candidate、native、真實遊戲與 synthetic 60Hz 都未執行。

該 agent 在停止指示後沒有開始新的量測；已停止其 backend session 65774/PID 76280 與 Vite session 44179/PID 76728，並確認 8001/1420 無 listener、兩 PID 不存在。固定基準與 artifacts 保留。

G0-code 與 G0-observability 的開工/比較用途依 [gate 定義](../contracts-and-gates.md) 區分；單次 renderer 結果不滿足三次完整量測。

- 完整 Full/Lite native baseline、三次成對效能與真實遊戲資料尚未取得，因此 G0 為 partial / handoff，不宣稱整體 baseline gate 通過。
- Settings hydration 未合併 MCP、telemetry、forwarding；auto-check persistence 合約另有既有落差。先保留現況差異，不由 Settings 視窗改造偷偷改 backend/schema。
- HUD 原 saveConfig 是 optimistic full-document 並行寫入；重掛載 fetchConfig 亦會強制 `enabled=false`。需於 active-only mount 前建立寫入存活與 authoritative reload 前置，不能等 G5 才發現切页會干擾外部 HUD。
- useTelemetry 的 BroadcastChannel 屬 connect closure，reconnect 會再次建立但原清理沒有 close。P2 改為 shared runtime owner，仍須 resource runtime 證據；靜態差異不等於已證實無洩漏。

所有 UI/native、延遲/失敗與重連驗收依 [acceptance.md](../acceptance.md) 分開記錄。未執行項保持 not-run。
