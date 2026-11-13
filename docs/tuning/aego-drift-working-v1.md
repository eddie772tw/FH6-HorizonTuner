# Drift 主工作檔候選 v1

本候選的完整 ID 為 `aego-drift-working/v1`，owner 為 Rust
`backend-rust/src/tuning/gearing/drift.rs::solve_candidate`。PR #655 只提供獨立候選，
正式 dispatch 仍保留歷史 `aego-drift/v1`；PR #657 完成整合與驗收後才切換。
底盤、量測資格、loaded-sweep reducer、EV／CVT／DangerSign、legacy CLI／MCP
與既有 golden fixtures 不變。

## 主工作點與證據界線

使用者必須提供 `profile.driftWorkingTarget`：

```json
{
  "mainGear": 3,
  "targetRpm": 5000,
  "wheelSpeedKmh": 100,
  "source": "user-target"
}
```

`mainGear` 為 1 起算的主工作檔，範圍 1–目前檔數；`targetRpm` 單位 RPM，
必須正值且不超過後端合格證據的可用／有效上限；`wheelSpeedKmh` 單位 km/h，
是驅動輪純滾動的等價速度目標。`source` 只接受 `user-target`，
不能把這組目標標成 telemetry、量測結果或已驗證的漂移性能。
未知欄位拒絕；沒有目標時回傳 unavailable，不能猜一個漂移車速。

輪速等價速度不等於側滑中的地面速度。候選沒有滑移證據，
因此 `groundSpeedKmh` 與 `slipEvidence` 始終為 null，不由輪速反推地速。
FWD 明確採前輪尺寸，RWD／AWD 採後輪尺寸，診斷記錄所用軸、輪周及半徑；
缺少正值尺寸時拒絕，不套用固定輪徑 fallback。AWD 的後輪尺寸是此版本的
運動學選擇，不能解讀為已分析不同前後輪徑下的整套傳動系統。

本版本不新增完整曲線分析，也不擴張共用量測資格。峰值扭力／功率的 RPM
只是峰值標記，不能建立「可用動力帶」上下界。候選沒有接收曲線的參數；
目標 JSON 內的部分曲線、裸曲線或自稱 qualified 的曲線都會因未知欄位被拒絕。
`workingBand` 始終為 null，狀態明示沒有合格曲線輸入；
即使提供完整峰值，也只採以下未校準形狀先驗。
若未來要分析工作帶，必須另增來自後端合格原始 capture 的最小證據傳遞契約，
不能信任前端提供的曲線或範圍。

正式 workflow 必須先完成引擎證據資格，並將同義的可用有效上限傳入
`usable_limit_rpm`。例如 nominal EngineMaxRpm 為 7500、合格 limiter 證據顯示
有效上限為 4800 時，傳入 4800；5000 RPM 目標應 unavailable。
此候選本身是純幾何與約束求解函式，並不取代 workflow 的證據資格入口。

## 硬約束、形狀偏好與衝突順序

在輪胎純滾動與傳動鎖合假設下，主檔總減速比目標為：

```text
Rmain = targetRpm × wheelCircumferenceM × 60 / (wheelSpeedKmh × 1000)
Rmain = finalDrive × mainGearRatio
```

這是單位轉換與運動學等式，不是最佳漂移分數、起步牽引或引擎能力公式。
以下硬約束先於偏好：

1. 離散 ICE、4–10 檔、正且有限的車重、RPM、輪胎尺寸及目標；若有配重，須在 0–100% 開區間。
2. 終傳與每檔均符合明確範圍、0.01 刻度與嚴格遞減。
3. 取位後主檔輪速誤差不超過預先固定的 `max(1 km/h, target × 1%)`。
4. 在使用者目標輪速下，取位後所需 RPM 也不得超過合格有效上限；不能只因輪速誤差在容差內便接受超轉。

`2.89 / 1.99 / 1.34 / 1.00` 是歷史文件
[`drift-meta-iteration-20260913.md`](../archive/tuning/drift-meta-iteration-20260913.md)
保存的四點形狀先驗，來源與限制沿用該文件。只在 log 空間按正規化檔位位置
插值成 4–10 檔，不用扭力峰／功率峰比值聲稱動力帶，不複製第四檔作為高檔。
候選以主檔錨點決定全檔總比，其他檔位接近此形狀；不採 Road 起步或末速策略。

未提供觀察範圍時，FD 2.2–6.1、各檔 0.1–6.0 只是模型搜尋先驗。
若提供 `profile.driftObservedBounds`，使用來源為 `user-observed` 的
`finalDrive:{min,max,step:0.01}` 與每檔 `gears:[{min,max,step:0.01},…]`。
必須提供完整檔數，且為正值、有限、對齊 0.01 的區間。
觀察範圍取代模型搜尋先驗，可包含先驗外的終傳；不代表後端已驗證遊戲滑桿。
任一範圍最多 10,001 個刻度，刻度數字不超過 i32 上限；這是資源／表示限制。

求解逐一搜尋合法終傳，先傳播逐檔嚴格排序的上下界，再從主工作檔向兩側
配置形狀偏好；每個完整候選均重驗主檔輪速與有效 RPM 上限。
這是聯合配置內的界限選擇，沒有路由後再統一截斷齒比。
合法候選以全檔相對四點先驗的 log 偏差平方與主檔相對輪速誤差平方排序，
平分時保留較低終傳，以確保重播確定性。複雜度 O(終傳刻度數 × 檔數)。

原形狀偏好的終傳超出範圍時，候選可重配全檔形狀以保留主檔硬目標，
並回報 `limited`、`finalDriveSaturated`、`shapePreferenceLimited` 與取位偏差。
無法同時達成硬約束時回 unavailable／unsupported 與空齒比，
不得產生看似正值但可套用的猜測推薦。

`drift::respects_hard_targets(result, backend_diagnostics)` 供正式整合在
ratio balance 之後重驗主工作點、有效 RPM 上限、檔數、排序及 0.01 刻度。
diagnostics 必須來自當次後端重建的原始候選，不能用前端聲明作為資格證據；
觀察到的配件範圍仍由 ratio balance 自己驗證。重配保持近似總比時，
仍可能在有效上限附近超轉，因此模型硬目標檢查不能省略。
通過硬約束後，以 `drift::adjusted_diagnostics` 由相同後端目標重算選定結果的
實際輪速、總比、RPM、誤差與形狀折衷；不能把原候選的 actual 數值原樣貼到
另一組取位後齒比上。目標與來源不因等價重配而改寫。

## 新舊差異、敏感度與適用性

獨立 fixture [`aego_drift_working_v1.json`](../../tests/fixtures/aego_drift_working_v1.json)
固定來源 SHA、完整輸入、使用者主工作點、歷史 Rust 結果及預期差異；正常測試
不重新生成 fixture。歷史正式 owner 在相同 1400kg／AWD 合成輸入的
200／400／600 Nm 均得到 FD6.10，1000 Nm 得 FD5.80，六檔為
`3.47 / 2.67 / 2.04 / 1.55 / 1.23 / 1.00`。

新候選從使用者主工作點解算，不再由車重／扭力推導終傳再截斷。
fixture 的六速／主檔 3／5000 RPM／100 km/h 輪速目標，正式 Rust 候選得到
FD3.35、`2.89 / 2.31 / 1.84 / 1.45 / 1.19 / 1.00`；
主檔在 5000 RPM 的等價輪速為 99.8745127 km/h，
在目標輪速 100 km/h 所需為 5006.2822475 RPM，低於本合成案例的 7500 有效上限。
這些結果由直接執行 Rust 取得，沒有以 TypeScript 重播代替候選驗收。
單獨改扭力不一定改變新候選的合法輸出：峰值扭力既不能定義完整工作帶，
也不能單獨證明同一幾何目標應換一組齒比。修改主檔、目標 RPM、輪速或實際
採用輪徑則按運動學改變需求；範圍飽和與形狀折衷均顯式記錄。

RWD／AWD 均為未校準工程候選。FWD 只提供運動學相容，
診斷明示 `not-power-drift-validation`，不宣稱已驗證 FWD 動力漂移。
所有 `hardwareVerified`／`performanceValidated` 均為 false。
此版本沒有 FH6 真實漂移、滑移、圈速、分數、跨車款或控制器驗收；
後續實車 A/B 應沿用歷史文件的分驅動量測方案，與 Rust 數值測試分開記錄。

採用技能：`physics-tuning-math`、`modular-refactoring`、
`cross-agent-collaboration`、`pr-author-maintainer`、`ponytail`。
