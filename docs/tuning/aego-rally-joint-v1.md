# Rally 聯合配置候選 v1

本版本 ID 為 `aego-rally-joint/v1`，純函式入口為
`gearing::rally::solve_candidate`。本階段只提供候選；正式 workflow 仍走
`aego-rally/v1` 歷史 owner。切換由堆疊 PR #657 驗收後處理。

## 目標與來源

初版保留既有 Rally 的 `28 × HP^(1/3)` km/h 工程先驗；Mixed Surface 倍率 1，
Cross Country 倍率 0.90。來源是基準提交
`1ddb092d90f3aca4c02c86d633e6cfe3e7fc587b` 的 Rust Rally 分支，及
[歷史 Rally 設計記錄](../archive/tuning/rally-meta-iteration-20260913.md)。
它是可回退的起始包絡，不是實測空阻、抓地、FH6 滑桿或最優圈速證明。

速度明確表示「功率峰值 RPM 下、末檔、純滾動輪速對應的 km/h」。
輪胎尺寸必須明確提供；FWD 使用前輪，RWD／AWD 使用後輪，與既有求解語意一致。
診斷回傳採用軸、輪周／半徑、reference RPM 與 max RPM，消費端不得自行猜後輪或
0.32m 半徑。純滾動運動學也不代表滑移中的實際地速或可達末速。

`simulatedTopSpeed` 與 `softMaxSpeed` 是 redline 的傳動預覽上限，不能變成實測能力。
候選先將每個上限乘 `peakPowerRpm / maxRpm`，再取既有先驗與上限的最小值，
一次建立末檔目標。例如功率峰值 5000、最高 7500 RPM，上限 210 km/h 代表
140 km/h 的峰值功率輪速目標。非有限或非正上限直接拒絕。Drag 專屬末速／來源
不參與 Rally；`rallyProfile` 缺省維持 Mixed Surface。

## 硬約束與衝突順序

1. 輸入必須是有效的離散 ICE、4–10 檔、明確驅動方式、正有限車重／功率／扭力／
   峰值功率 RPM／驅動軸胎尺寸；峰值 RPM 不可高於最高 RPM。已提供的配重不得為
   非有限或 0／100% 端點。不補造缺少的輪徑或引擎資料。
2. 有觀察範圍時，`source=user-observed`、終傳與每一檔完整範圍、0.01 網格及
   嚴格遞減均為硬約束。觀察範圍取代模型搜尋範圍，可明確支援 6.5 以上的已觀察終傳，
   不再以舊共用收尾截成 6.1。觀察來源是使用者陳述，不宣稱已驗證實車硬體。
3. 取位後末檔輪速與預定目標的誤差必須小於等於 **max(1 km/h, 目標的 1%)**。
   此容差在求解前固定，不根據本次輸出調整；取位後仍不滿足即回 unavailable／
   unsupported 與空檔位，不能套用。
4. 滿足硬約束後，才偏好首檔 2.7 與
   `r = clamp(0.82 − 0.05 × (Nm/HP − 1.1), 0.75, 0.85)` 的歷史級距形狀。
   它們不是 Road 的起步或逐檔 RPM 規則；窄範圍迫使形狀偏離時仍可回合法候選，
   並由 `shapePreferenceLimited` 揭露。

沒有觀察範圍時，只使用終傳 2.00–6.50、齒比 0.10–6.00 的**模型搜尋範圍**，
診斷標示 `model-prior-not-game-observation`；不假裝驗證了遊戲滑桿。
`hardwareVerified` 與 `performanceValidated` 均為 false。

## 配置方式與可重現性

先用輪周與功率峰值 RPM 將末速換成末檔總減速比。對每個終傳 0.01 候選，
先建立逐檔上界的前綴包絡，以保留嚴格遞減所需空間；把目標末檔取位到可行區間，
再從末檔向前配置其餘檔位。每個完整候選都重驗末速；沒有在路由後執行第二輪
逐檔截斷，也不呼叫 Road、Drift 或 Drag 的求解器。

等價終傳重配後，整合層必須用後端重新建立的診斷呼叫
`rally::respects_hard_targets`，再次核對 model ID、gearCount、0.01 網格、
嚴格遞減與末檔端點。不能信任前端送來或保存文件中的診斷；此函式不負責
驗證觀察範圍來源，該邊界由重建推薦與 ratio balance owner 檢查。

在合法候選中，以首檔偏離、相鄰級距相對偏離的對數平方及末速相對誤差平方總和
排序；相同分數保留較低終傳，確保確定性。偏好不凌駕硬端點。任一範圍最多
10,001 個 0.01 刻度，且刻度值不超過 i32 上限；這是資源與數字表示限制，
不是 FH6 配件規格。每個終傳只建立一組完整候選，時間成本為 O(終傳刻度數 × 檔數)。

## 新舊差異與驗收界線

合成基準為 1400kg、AWD、300HP、400Nm、5000RPM 功率峰值、7500RPM 最高轉速、
六速、245/40R18。歷史 TS 調查在 Road 共用逐檔上限後得 FD3.52、
`[2.70,1.81,1.21,.81,.54,.40]`，末檔運動學約 437.23km/h，偏離原 Rally
187.4412km/h 目標。PR #652 直接 Rust 重播得到 FD3.52、`[2.70,1.81,1.21,.81,.54,.36]`，
末檔約 485.8164km/h；後續 `150906d3` 的級距上限使末檔與歷史 TS 的 .40 不同。
本 PR fixture 保存完整輸入、來源 SHA、兩種歷史結果及新候選目標，並直接重播凍結
Rust owner 核對；不能以 TS 輸出冒充 Rust 驗收。

本候選保留原始末速目標及 Rally 級距偏好，聯合調整終傳與全部檔位以消除
「先求 Rally 目標、再由共用 Road RPM 規則改壞」的順序問題。改變來自目標責任與
配置順序，沒有增加無來源的摩擦係數或牽引保證。DangerSign、其他賽事、EV／CVT、
底盤與既有 golden fixture 均保留原 owner；正常測試不重生 fixture。

契約涵蓋 4–10 檔、三種驅動、低功率峰值 RPM、Mixed／Cross 方向、終傳 2.0／6.5／
觀察到的 7.0、窄範圍形狀折衷、無解、輸入缺漏、FWD 輪徑與 preview cap。
這些只驗證數值與產品契約。FH6 實車 A/B、跨車種性能、滑移與圈速尚未驗證；
需依既有 Rally 記錄的量測方案獨立驗收。

採用技能：`physics-tuning-math`、`modular-refactoring`、
`cross-agent-collaboration`、`pr-author-maintainer`、`ponytail`。


