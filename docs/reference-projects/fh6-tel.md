# FH6 Telemetry Dashboard：PR#185 相關參考

## 基本資料

- 上游：[TheBanHammer/fh6-tel](https://github.com/TheBanHammer/fh6-tel)
- 本地 snapshot：`ref/forza-hud-references/fh6-tel/`
- Snapshot：`7ffeb0812f9f240653620ed3ecb0d2266b8d94ab`
- 授權：MIT。

## 對 PR#185 的有限價值

FH6-Telemetry 的 `TireWidget` 將 FL／FR／RL／RR 的 temperature、slip、suspension 與 wear 壓縮在小型 corner tile 中，並使用顏色與簡單圖示表達狀態。這只能作為 Drift HUD secondary instrument 的密度與 state hierarchy 參考：

- 同一個小儀表內，每個數值只負責一種語意。
- 顏色應對應清楚的 state，不用一種顏色同時代表 temperature、slip 與 suspension。
- 小尺寸區域優先顯示方向、強度與 warning，而不是塞入完整歷史圖表。

這個觀察可用來檢查 PR#185 的 secondary instrument 是否仍然易讀；它不代表要把四輪 tire widget、map 或 session viewer 加入 Drift HUD。

## 架構邊界

FH6-Telemetry 的 `displayPacket` 能讓 live／replay 共用 dashboard renderer，是有趣的長期架構案例；但 PR#185 不應建立 replay source，也不應修改主 GUI 的 `TelemetryView`。本分支只消費現有 HUD frame，並把 Style Meter 狀態留在 Drift HUD。

## 不採用項目

- 不複製其 Svelte markup、Tauri／Rust session code、SQLite schema、map tiles 或 calibration UI。
- 不把 session、replay、map 與 tire settings 寫入 PR#185 的實作計畫。
- 不用 reference 的 packet count 或 UI transition 推論本專案的 telemetry rate；本次不修改 rate path。
