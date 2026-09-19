# G2 原生觀察（2026-09-19，rebase 後候選）

日期：2026-09-19（Asia/Taipei）。候選 Shell/stack source：`ee0f7bb9f5e607a682a5136bb0785deb580e51fb`。本文件只記錄必要的 Tauri 啟動、動態 port、獨立 HUD 與生命週期觀察；瀏覽器／受控 UI 證據仍依各 lane 文件分開記錄。

## 建置與來源

- Full、Lite 與 sidecar 11.45.18 build PASS。
- `tests/test_executable_bundle.py -m executable_bundle -q`：2 passed。
- Full 產物位於 `dist/g2-full-20260919/FH6-HorizonTuner.exe`；Full Tauri 新候選版本為 11.45.18。Lite 已完成建置但尚未啟動原生視窗。
- 這些 build 與 bundle 結果只證明產物／合約層；不能替代 Full/Lite native C5/H5 或真實 FH6 證據。

## Full native partial observation

1. 新候選 Full 正常啟動；HTTP 使用 8001、UDP 使用隔離的 8124，backend connected。畫面為 `light/modern`，四個 workspace 入口可見；這是本次程序的啟動觀察。
2. HUD 啟動獨立外部視窗，window id `83298902`。執行兩輪 HUD → Live → HUD 後，外部 HUD 維持相同 window id，未因 page transition 關閉。
3. `showTeleSuspension` 由 `true` 改為 `false` 後，UI、GET 回讀及再次 HUD → Live → HUD 都保持一致；這證明本次可觀察的設定回讀與一般重入結果。
4. 明確 Close HUD 後，設定 `enabled=false`，外部視窗隱藏。這是使用者明確關閉動作的結果。

## 尚未完成與邊界

- 沒有人工 delay 或其他可控慢回應來觀察 pending config write 橫跨 page unmount，因此不能宣稱完整 H5；一般跨頁 HUD 存活不等同 pending-write 驗收。
- Lite 尚未啟動，沒有 Lite 的 native C5/H5、dynamic-port、theme/core 或 HUD lifecycle 結果；Lite build PASS 不回填 native evidence。
- 沒有以這份 Full partial observation 宣告新候選 native PASS。G2 仍為 `partial`，W2 尚未啟動，也不發布 `WAVE2_BASE_SHA`；待 Lite 與 pending-write native 證據完成後再由 Coordinator 複核。
