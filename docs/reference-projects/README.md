# PR#185 Drift HUD 參考研究總覽

本研究只服務目前分支 `codex/drift-hud-modernize-remove-presets` 與 PR#185：

> `feat(drift-hud): add style meter and split instruments`

研究問題不是「FH6-HorizonTuner 下一年要做什麼」，而是：哪些外部 HUD 的儀表階層、狀態顯示與單位處理，可以幫助驗證這個 Drift HUD 視覺切片，同時不突破既有架構與 PR 邊界。

## PR#185 的固定範圍

PR 描述目前只涵蓋：

1. Drift-specific Style Meter engine 與透明 combo display container。
2. Drift HUD 的中央 oval instrument 與右下 secondary instrument 拆分。
3. 將 normalized counter-steer input 投影到 drift arc pointer。
4. torque 顯示依既有 metric／imperial 單位處理。
5. 移除 obsolete Drift resolution preset。

## 不在本次研究／實作範圍

- 重構 `TelemetryView` 的更新機制或把 React state 改成 60Hz。
- 建立新的 telemetry store、WebSocket、UDP parser 或資料廣播通道。
- 改造 HUD telemetry cards 的 registry、recorder、session、replay、map 或 analysis。
- 把 Drift HUD 做成可切換的多解析度 profile 系統。
- 將外部專案的 code、CSS、圖片、字型、map tiles、車輛資料庫或文案帶入產品。

`TelemetryView`、既有 HUD cards 與 60Hz frame path 在這次只被視為整合邊界：Drift HUD 必須沿用現有 `HUDCore`／`onFrame` pipeline，不能因為新增 Style Meter 而另開資料來源或改變第二螢幕行為。

## 參考快照與 PR 關聯

| 專案 | Snapshot | 授權 | 對 PR#185 的有限參考價值 |
|---|---|---|---|
| [Horizon HUD](./horizon-hud.md) | `bd01ad0d644252824f82560f0ecbef50d6d6951d` | Proprietary personal/non-commercial | primary／secondary HUD 資訊階層；只作 README 層級概念研究 |
| [ONYX Drive HUD](./onyx-drive-hud.md) | `3677d149d877a3872b38f2ec1f910efe3beb6fe4` | MIT | 儀表卡、單位切換、grip warning 的狀態分級；不擴張成 ONYX 功能移植 |
| [FH6 Telemetry Dashboard](./fh6-tel.md) | `7ffeb0812f9f240653620ed3ecb0d2266b8d94ab` | MIT | 小尺寸 tire／suspension 狀態如何壓縮成可讀元素；不改 TelemetryView |
| [Forza Data Tools](./forza-data-tools.md) | `73f8f7058479bf1c17fd9460e2cf379207d1cd2d` | GPL-3.0 | latest-frame 與 backpressure 是既有 pipeline 的驗證背景；不新增 transport |
| [Forza Telemetry](./forza-telemetry.md) | `88aa7d59ac2684e16ef57862555c93f2af1a7ce3` | MIT | typed torque／steer／speed 欄位與 live／recording cadence 的區分；不改 parser |

上游網址與本地 clone 記錄位於 [`ref/forza-hud-references/README.md`](../../ref/forza-hud-references/README.md)。

## 授權邊界

- Horizon HUD 禁止修改、反向工程、衍生與重新散布；只取 README 層級的產品概念。
- Forza Data Tools 是 GPL-3.0；只作概念背景，不複製 Go、HTML 或 packet-format source。
- MIT 專案可作為行為與資料模型參考；本次仍以在本專案中重新實作為原則，不直接搬移視覺資產或大型單體架構。

下一步只應依照 [`drift-hud-implementation-plan.md`](../drift-hud-implementation-plan.md) 驗證與收斂 PR#185。
