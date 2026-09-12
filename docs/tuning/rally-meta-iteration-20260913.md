# Rally / Off-Road meta iteration（2026-09-13）

## 分流決策

`RaceType` 維持 `Rally`，在 `TuningCarParams` 增加可省略的 `rallyProfile`：`mixed-surface`（預設，兼顧碎石與短柏油段）或 `cross-country`（長距離、粗糙地形與跳台）。省略值與 `mixed-surface` 都使用新的較低車高／較輕支撐起始值，既有保存資料仍可讀回，但重新算牌會採新基線；`DangerSign` 保留舊有 ARB 與最大車高，不套用 Rally profile。

既有 mixed-surface 前後最大車高符合 FH6 指南「越野先高」方向，但對含柏油的混合路段可能犧牲重心；本輪改成車高範圍 85% 起點。Cross Country 使用 100% 行程與較高支撐，降低跳台觸底風險。兩者都是初始值，需以觸底、接地與圈速回測。

## 來源與證據邊界

- 當前 FH6 直接來源 [Forza.guide FH6 Tuning Guide](https://forza.guide/) 將 Rally 與 Off-Road 輪胎壓力分開列為約 24–26.5 PSI 與 15.5–21 PSI，並建議依接地、溫度與實際路段逐步調整；它也把越野/拉力 ARB 的起點描述為偏軟、車高偏高，並提醒不要同時更改多個設定。這支持 profile 分流與量測輪胎流程，但不支持固定通用數值。
- 同一 FH6 指南建議齒比先調 Final Drive、個別檔位只在 Rally 等特殊用途再介入，並以實際路段轉速/限轉確認；因此 AEGO 僅提供可回退的起始包絡，不宣稱固定倍率是 FH6 meta。
- [FH6 社群綜合指南](https://www.reddit.com/r/ForzaHorizon6/comments/1tqg50m/comprehensive_tuning_guide_road_and_rally_tuning/)（2026-06-18 更新）明確說明其內容彙整約 20 部影片與網站、不同作者意見相反，並要求個人測試；留言也指出 Rally 所指範圍涵蓋 dirt/cross-country。它可作當前玩家方法的來源索引，不是獨立實驗或官方規格。
- FH5 資料只保留控制項語意作 transferred candidate；例如差速器鎖定會改變出彎驅動取向、阻尼與彈簧會改變不平路接地。這些方向須先由 FH6 直接指南支持，再以 FH6 實機驗證；FH5 的百分比與固定數值不轉用。
- Forza 官方社群討論指出 Rally/off-road 彈簧率不能直接套用道路比例，應以可用調整範圍與車輛反應校正：[Spring rates discovery](https://forums.forza.net/t/spring-rates-discovery/90073)。因此本次保留現有車輛 min/max clamp，不增加要求使用者猜測的剛性輸入。
- 現行 WRC Rally1 規則與工程說明是現行拉力車的車制背景：[FIA Rally1 regulations](https://www.fia.com/regulation/category/119)。歷史 Group B 是 1980 年代另一套已停用的原型/規則車制；兩者都不能直接轉換成 FH6 slider 最佳值。FIA 的 [WRC27 Rally1 concept](https://www.fia.com/news/fia-unveils-wrc27-rally1-concept-set-define-next-generation-rally-machinery) 是未來規格，只作工程方向參考，不作現行 WRC 證據。
- Toyota Gazoo Racing 的 Yaris WRC 工程說明提供歷史 WRC 車輛的具體反例：柏油設定會降低車高以提高穩定性，但仍保留跳躍所需行程；碎石設定需要更長行程，且升高車高與較硬支撐有操控、牽引取捨。[Yaris WRC suspension](https://toyotagazooracing.com/wrc/special/2019/yaris_wrc/)、[Toyota suspension development](https://toyotagazooracing.com/wrc/report/2018/05/summary/)。
- Öhlins 的 Rally damper manual 將粗糙 gravel 的起點描述為增加 10–20mm 車高並提高一級彈簧；同時指出低抓地條件下過硬的 rebound/low-speed compression 會損害牽引，壓縮阻尼負責吸收撞擊。[Öhlins TPX/TTX44 manual](https://ohlins.com/storage/2A8B753854E036FD880C1FB3E4C6D8199C69ED0EF83D810B95D2C760D50A820A/3b2ca8fc14d34827b61f1148cc714ddf/pdf/media/8d8df7ceb5224d9db91ae83c153c2cc8/OM_07440-02_TPX_TTX44.pdf)。這支持 Cross Country 較高行程與落地支撐，也明確限制「一律加硬」的推論。
- SAE Baja 工程資料把長行程與輪胎接地保持列為粗糙地形耐久與操控目標：[SAE Baja suspension poster](https://www.mech.utah.edu/wp-content/uploads/2024/12/14-SAE-Baja-Suspension-Team-Poster-Final.pdf)。這是實車工程推導，不是 FH6 遊戲驗證。

## 採用的純函數公式

所有公式仍位於 `frontend/src/utils/tuningMath.ts`。

- `mixed-surface` 使用 `ARB = 0.32 × (64 × axleWeightFraction + 1)`、`spring = 0.65 × rangeWeightedBase`、車高範圍 85%、`bump = 0.40 × rebound`，並保留既有 AWD `40/10/80/25/65` 差速器基線。
- `cross-country` 使用前/後 ARB 0.38/0.46、`spring = 0.85 × rangeWeightedBase`、車高 100%、`rebound × 1.10`、`bump = 0.50 × rebound`，並把 AWD 中心偏置由 65 調至 55 以降低鬆地過度旋轉；這些是待驗證的工程起始常數，並非已證實 meta。所有輸出仍受遊戲 slider clamp。
- AEGO 的 Rally 理論速度包絡在 `cross-country` 乘 `0.90`，故終傳動變高、檔位較短，目標是鬆地保持輪上驅動；這是可回退的工程初始值，必須以長直路轉速與出彎滑移量測校正。
- 定位只保留可回退的幾何起始值（`cross-country` 前後外傾角 `-0.8/-0.5`、前束 `0.0°`）。`targetPhot` 與 `pcF/pcR` 仍是既有未校準基線輸出，不能宣稱由量測決定；輪胎量測與公式更新另行處理。

## 拒絕與未證實項目

未把 WRC Rally1、Group B、Baja trophy truck 的實車數字直接當成 FH6 slider；三者車重、懸吊幾何、輪胎與空力不同。也未加入「最佳」分數、未測量的抓地係數或要求使用者猜測的跳台幾何。現有 Rally 公式與本次偏置都屬可解釋起始設定。

## 實車驗證方案

使用同一輛車、同一 PI/胎種與天氣，分別保存 `mixed-surface` 與 `cross-country`。在同一 Rally 路段各跑暖胎圈與至少三個有效圈，記錄圈時間、滑移率、懸吊行程/觸底、輪胎接地相關可用通道與出彎輪速；Cross Country 另加入跳台與粗糙地形段。完整 profile 切換是多參數候選基線的描述性比較，不能當作 single-variable 因果 A/B。只有後續單獨改一個 slider 時，才以一變量回測判讀；保留不可比較圈與起步/暖胎上下文。若粗糙段證據改善而柏油段圈速惡化，回退到 mixed-surface；若差速器鎖定造成推頭或滑移增加，依遙測以小步幅單變量回測。

本文件與測試描述的是公式與契約回歸，不構成 FH6 實機、跨車種或跨裝置驗證。
