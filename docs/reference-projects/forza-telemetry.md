# Forza Telemetry：PR#185 相關參考

## 基本資料

- 上游：[austinbaccus/forza-telemetry](https://github.com/austinbaccus/forza-telemetry)
- 本地 snapshot：`ref/forza-hud-references/forza-telemetry/`
- Snapshot：`88aa7d59ac2684e16ef57862555c93f2af1a7ce3`
- 授權：MIT。

## 對 PR#185 的有限價值

`ForzaCore/DataPacket.cs` 將 steering、speed、torque、RPM 與四輪 slip 欄位列成 typed properties。這支持本 PR 只使用已存在的 normalized HUD payload，不在 Drift HUD 內重新解讀 byte offset。

它也清楚分離 live ingest 與 recording cadence：UDP 接收可以逐封包送出，而 recording task 另有自己的 50ms policy。對 PR#185 的直接邊界是：Style Meter 的時間狀態使用現有 frame callback 與 `now`，不能假設每個 frame 都剛好 16.67ms，也不能把 recording cadence 當成 HUD render cadence。

## 可檢查的 Drift HUD 條件

- `steer` 是 normalized input 的 display signal，不是實際前輪角度。
- `torque` 應沿用既有 unit contract；metric 與 imperial 只影響 value／label 顯示。
- frame 間隔不規則時，Style Meter 的 decay、event TTL 與 transition grace 仍要穩定。
- map trail、CSV recording、Electron renderer 與 packet format detection 都不屬於本 PR。

## 不採用項目

不移植其 Electron-CGI、舊版 React／Webpack、map trail 或 recording UI；只取 typed data 與 live／recording cadence 分離的概念。
