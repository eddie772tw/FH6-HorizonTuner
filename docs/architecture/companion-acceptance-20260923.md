# Companion 整合與驗收紀錄

- 分支：`feature/companion-app-architecture`，PR #425。
- 目標：CI 通過；Android APP 正確繪製即時五卡；APP 車輛參數進入 Tauri 工作流，桌面算牌及遙測結果回傳 APP。APP 端 HUD 顯示依 2026-09-23 使用者調整，暫時移除。
- 技能：`cross-agent-collaboration`、`modular-refactoring`、`halfmoon-design-system`、`huge-component-refactoring`、`telemetry-udp-protocol`、`portable-release-validation`、`pr-author-maintainer`、`computer-use`。
- Ownership：root 處理後端命令佇列、桌面 bridge、整合與實機驗證；Luna 分別處理 Android shell、Companion 觸控頁、CI 和文件。

## 驗收狀態

以下項目必須以實際輸出或畫面確認，不能由編譯成功推論：

| 項目 | 必要證據 | 狀態 |
| --- | --- | --- |
| CI | 本次 HEAD 的 CI Pipeline、Android Companion CI 與 CodeQL 結果 | 以 [PR #425 Checks](https://github.com/eddie772tw/FH6-HorizonTuner/pull/425/checks) 最新提交結果為準；驗收時須確認所有工作流程完成 |
| Android 載入 | 本次 APK 安裝於 23073RPBFG 平板；USB HTTP 載入且無崩潰 | 通過：最新版 APK 經 PC Companion USB 按鈕啟動，頁面含 Telemetry/Tuning/Connection 且 PC ONLINE；無 Android HUD 分頁 |
| 五張卡片 | 受控 UDP 回放中逐張顯示 driver、traces、dynamics、tires、suspension；數值及圖形更新 | 通過：最新版 APK 五卡逐張有即時數值及有效 Canvas；橫向 Driver 畫面與直向 Driver/Dynamics 畫面已檢視 |
| APP → Tauri | APP 修改參數，收到 desktop applied 確認，Tauri 可見相同參數 | 通過：實機輸入 412 hp / 6550 rpm，命令 applied、host snapshot revision 4 含相同值，隱藏 Tauri 調校頁可見 412 hp |
| Tauri → APP | 桌面變更輸入/工作流，APP 顯示同一計算結果；量測完成結果回傳 | 算牌通過：實機選 Drift 後桌面結果前彈簧 26.3、toe +1.2°/-0.3° 回 APP；量測進度/瓦特與牛頓米可見，完整完成結果仍待確認 |
| 錯誤與重連 | PC 離線、錯誤參數、舊草稿、USB 重連均不能假報成功 | 部分通過：實機在 Connection 分頁斷線後顯示原生備援表單，可從表單或桌面一鍵 USB 連線重新載入；其餘負向情境仍由現有單元測試覆蓋，未逐項實機操作 |

## 已確認的開發基線

- 原始 HEAD `47ca647` 的 CI 有 Rust format 和未使用 React import 失敗，已修正並推送；後續 CodeQL 指出的 Companion 請求路徑問題也已修正並加入回歸測試。
- 2026-09-23 完整前端測試 131 files / 933 tests 通過，Rust `cargo test --locked` 通過；Android `:protocol-core:test :app:lintDebug :app:assembleDebug` 在移除 HUD 後通過。
- 2026-09-23 使用者重新接上平板後，ADB 已確認裝置在線且有授權。
- 使用受控 324-byte UDP 封包回放與本地 8001 sidecar 驗證；平板型號 23073RPBFG，單鍵 USB API 實際回報 reverse `tcp:8001 → tcp:8001` 及 launched。
- HUD 預覽曾在平板觸發 `lmkd watchdog` 終止前景 APP；依使用者縮減目標，已從 Companion 導覽與 Android 專屬程式碼移除，桌面 HUD 不變。
- 直橫向版型：平板直向時，Driver 可讀且 Dynamics 改上下排列；390px 手機版型模擬顯示 Driver 與 Dynamics 的窄版配置、Tires/Suspension 單欄捲動和 Tuning 單欄表單。APP 不鎖定 Telemetry 橫向，仍以每次一張卡片切換，避免窄螢幕同時顯示多張圖表造成資訊過密。Android WebView 在 `configChanges` 後可能不更新 CSS orientation media feature，版型以實際寬度作斷點。
- 連線版型：連線成功後收起 Android 原生標頭與設定列，WebView 直接佔用安全顯示區；Web 前端將連線資訊收納至第三個 Connection 分頁，以紅綠點提示 PC 狀態。成功通知短暫浮在內容上方；連線失敗或主動中斷時顯示原生備援表單，仍可重試。
- 不將受控回放稱為真實 FH6 遊戲駕駛測試。
