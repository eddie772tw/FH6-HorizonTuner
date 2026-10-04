# 2026-09-19 新候選原生觀察

更新：2026-09-19（Asia/Taipei）。候選 Shell head 為 `ee0f7bb9f5e607a682a5136bb0785deb580e51fb`；Full/Lite/sidecar 11.45.18 建置與 executable bundle 2 tests PASS。Full 產物為 `dist/g2-full-20260919/FH6-HorizonTuner.exe`。目前記錄的 artifact SHA-256 為 Full `1255eb5f2d7d0ec6cad08f5aa5a1885d1f452ea06cdb8c27d69cecaa7a314ee8`、Lite `e8bb0fe599dfe54e13873bbe385483283126e89f4d7ee708a9048eff8e151441`、sidecar `66538c752e23d1612ab08d7e7ba5a9b382ce747a62700cc6906c9714fa9abb4a`。以下是新候選的 Windows/Tauri 原生操作紀錄；browser App/LiteApp 的延遲寫入與 reentry 另見 [browser evidence](g2-browser-observations-20260919.md)，不互相回填。

## Full

- 正常啟動曾觀察 HTTP `8001`、UDP `8124`，backend connected；Full restart 的 PID `57180`、backend PID `107208` 以 dark/default 恢復，之後以 titlebar 關閉。關閉後檢查 TCP `8001`、`51604`、`64746` 與 UDP `8124` 均不存在。
- 在 occupier PID `106848` 保持 `8001` 時，Full PID `62080`、backend PID `99760` 使用 HTTP/MCP `51604`，UI 顯示 connected，light/modern 保留；由 UI 改為 dark/default 後，backend GET 與 UI 一致。關閉 Full 後 listener 釋放，再以 Ctrl+C 結束 occupier。
- Full 的前一輪正常啟動也觀察到四個 workspace、backend connected、light/modern 與獨立 HUD；native HUD id `83298902` 實際 render，完成兩輪 HUD → Live → HUD 並維持相同 id。showTeleSuspension 在 HUD-open 操作中由 `true` 改為 `false`，並在兩輪重入及關閉後持續為 `false`；enabled 則在兩輪期間維持 `true`，只有明確 UI Close 後才變為 `false`，再以 GET 回讀確認。這些與 fallback/restart facts 都是 lifecycle/port 觀察，不是 first-paint 完整證明；該初始 PID 的外部 closure 未單獨作為 cleanup 證據，cleanup 以後續明確 restart/titlebar close 檢查為準。

## Lite

- 正常啟動 PID `106696`、backend PID `72124` 使用 HTTP `8001`、UDP `8124`，dark/default，實際 connected；Lite 只顯示 Live/HUD，guide 曾開啟並 dismiss。
- 原生 HUD id `66521214` 實際 render，完成兩輪 HUD → Live → HUD，兩輪使用相同 id。showTeleSuspension 在 HUD-open 操作中由 `true` 到 `false`，並在兩輪重入及關閉後持續為 `false`；enabled field 在兩輪 HUD → Live → HUD 期間維持 `true`，只有明確 UI click Close 後才變為 `false`，再由 GET 回讀確認。
- UI 套用 light/elegant，backend GET 回讀一致；UI click titlebar close 後 native 視窗關閉且 backend ports 釋放。
- Lite restart PID `105892`、backend PID `88400` 遇到 occupier PID `106848` 時改用 fallback HTTP `64746`；該 port 同時在 UI/MCP/GET 可見，light/elegant 保留。關閉 Lite 後 `64746` 與 UDP `8124` 釋放。

## 邊界與 G2 狀態

- Native 觀察沒有人工 delay；Full/Lite 的 HUD、theme、dynamic-port、reentry、close 與 listener cleanup 是實際 Tauri/Windows 操作結果。Native screenshot 是 post-startup 截圖，沒有 frame-level zero-flash 或 physical first-paint 證據。Browser early-root/theme table 已完成並記於 [browser evidence](g2-browser-observations-20260919.md)，但那是另一環境。
- Browser evidence 已覆蓋 Full/Lite actual App/LiteApp 的 delayed POST ordering、reentry GET、DOM theme attributes 與 enabled state；它是另一環境，不能聲稱 native first paint，也不能把 browser response timing 當成外部 HUD 視窗證據。Native backend 另曾重啟為 HTTP `8001`、session `77371` 供剩餘 browser startup，該 session 不計為 native evidence。
- Full/Lite native C5/HUD lifecycle 與 browser C5/H5 split 已由 Coordinator 依 closure 核准為 G2 foundation evidence；仍不擴張成 G5、native first-paint、pixel-zero-flash 或效能完成。first-startup browser/X1 與 independent T3 review 已完成並記錄於 closure。
- W2 尚未啟動，不發布 `WAVE2_BASE_SHA`。root 完成 final handoff/push 後依使用者條件暫停；保留 `ee0f7bb9...` 作後續 resume candidate。
