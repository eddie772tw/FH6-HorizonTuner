# Forza Data Tools：PR#185 相關參考

## 基本資料

- 上游：[richstokes/Forza-data-tools](https://github.com/richstokes/Forza-data-tools)
- 本地 snapshot：`ref/forza-hud-references/forza-data-tools/`
- Snapshot：`73f8f7058479bf1c17fd9460e2cf379207d1cd2d`
- 授權：GPL-3.0。

## 對 PR#185 的有限價值

這份專案主要是 parser、CSV、JSON 與 WebSocket transport，不是 Drift HUD 視覺 reference。它對本 PR 只有一個邊界提醒：高頻資料應由既有 broker／coordinator 廣播，HUD style 不應自己建立第二個 UDP 或 WebSocket client。

因此 PR#185 的 Style Meter 應：

- 繼續使用現有 `HUDCore`／`onFrame` 資料入口。
- 不把 score engine 連到 `TelemetryView` 或後端 recorder。
- 不因加入 combo container 而修改 queue、backpressure 或 packet parser。

## 授權限制

GPL-3.0 source、HTML dashboard 與 format files 不進入產品，也不作為本 PR 的 code reuse 來源。這份 reference 只保留「不要為單一 HUD style 建立新 transport」的架構檢查點。

## PR 結論

沒有需要從 Forza Data Tools 實作的功能。若日後要研究實際 frame rate 或 dropped frames，應另開 telemetry diagnostics 工作，不在 PR#185 內處理。
