# Horizon HUD：PR#185 相關參考

## 基本資料

- 上游：[CocoScript-Lab/horizon-hud](https://github.com/CocoScript-Lab/horizon-hud)
- 本地 snapshot：`ref/forza-hud-references/horizon-hud/`
- Snapshot：`bd01ad0d644252824f82560f0ecbef50d6d6951d`
- 授權：proprietary personal/non-commercial。

## 對 PR#185 的可用價值

這份 reference 沒有可移植的 UI source，因此只適合用來檢查 Drift HUD 的資訊階層：駕駛時的 primary instrument 應該維持清楚、穩定、低閱讀成本，次要事件與狀態則放到不搶主視線的位置。

這可以用來檢查 PR#185 的兩個 visual decision：

- 中央 oval instrument 是否仍然是主要視覺錨點。
- 右下 secondary instrument 與 Style Meter／combo container 是否形成層級，而不是互相競爭。

它也支持將 Style Meter 做成 HUD-local presentation layer：Style score、rank、flow、hold、risk 與 special event 應該是 Drift HUD 內的狀態展示，不應成為主 GUI `TelemetryView` 的新資料面板。

## 不可引用的部分

- 不複製其 layout、CSS、圖片、icon、文字或多螢幕實作。
- 不從 proprietary source 推導未公開的演算法或幾何細節。
- 不把其產品定位當成 PR#185 的新功能需求。

## PR 結論

Horizon HUD 只提供「primary／secondary 視覺階層」的審查角度。PR#185 應繼續沿用現有 Drift HUD frame、全域 overlay scale 與 HUDCore pipeline，不增加 profile、解析度 preset 或第二條 telemetry stream。
