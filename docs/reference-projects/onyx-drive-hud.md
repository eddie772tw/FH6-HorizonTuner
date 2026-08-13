# ONYX Drive HUD：PR#185 相關參考

## 基本資料

- 上游：[Mattkovic/ONYX-Drive-HUD](https://github.com/Mattkovic/ONYX-Drive-HUD)
- 本地 snapshot：`ref/forza-hud-references/onyx-drive-hud/`
- Snapshot：`3677d149d877a3872b38f2ec1f910efe3beb6fe4`
- 授權：MIT。

## 對 PR#185 的可用價值

ONYX 是五份 reference 中最接近 overlay card／instrument 產品的專案，但本次只取三項局部觀察：

1. **儀表元素應有清楚角色。** Speed、RPM、gear、power、boost、grip warning 與 RPM gauge 是不同用途，不能把所有數值堆進同一張卡。這支持 PR#185 將中央 oval 與右下 secondary instrument 拆開。
2. **單位是資料語意的一部分。** ONYX 對 speed、power、boost 與 gear label 做 live unit selection。PR#185 的 torque 應繼續從既有 normalized payload 解析 metric／imperial，不在 Canvas 內重新猜測單位。
3. **warning 要是 warning，不是物理真值。** ONYX 的 grip warning 是 heuristic telemetry UX。若 Drift HUD 顯示 counter、risk 或 style event，應使用明確的 state／label，而不是暗示已完成完整 tire physics。

## 可用來檢查的 edge conditions

- 沒有 torque 欄位時，應使用既有 fallback 或顯示安全的零值，不產生 `NaN`。
- metric／imperial 切換時，數值與 `N·M`／`LB·FT` label 必須同步。
- counter-steer pointer 是 normalized steering input 的視覺投影，不得標註為實際前輪角度。
- Style Meter 的 event label、combo count 與 rank 不應因單一缺失 frame 破壞 HUD。

## 不應擴張的部分

ONYX 另有 movable tiles、live graph、dyno、drag timer、session report、profiles 與 vehicle database；這些不是 PR#185 需求。不要因為 reference 具備這些功能，就把它們列入本分支的下一階段。

也不直接移植 `onyx_app.py` 的單體 PyQt 架構、theme、圖片或 layout。FH6-HorizonTuner 只保留自身的 `HUDCore`、`onFrame` 與既有 overlay config。
