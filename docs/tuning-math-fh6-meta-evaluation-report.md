# FH6 HorizonTuner 調校數學與 FH6 Meta 評估報告

日期：2026-08-13
範圍：`frontend/src/utils/tuningMath.ts`、`tuningDiagnosis.ts`、`tireCoefficients.ts`、Tuning UI 與測試
判定原則：FH6 meta 是「可競爭的遊戲內經驗規則」，現實理論是「方向與量綱檢查」；兩者都不能直接證明某個常數是官方真值。

## 執行摘要

目前系統適合定位成「四種用途的起始 preset + telemetry diagnosis」，不適合宣稱為已校準的 FH6 physics solver。建議進一步迭代，但先做模型邊界與校準契約，再調整常數：

1. **P0：修正可識別性與命名。** `tireGripCoefficients` 目前只在 Drift 齒比中使用，不是通用輪胎抓地模型；應改名為 `driftGearingGripPrior`，或建立縱向/側向、路面、溫度、胎壓與載荷敏感度模型。
2. **P0：加入遊戲版本與改裝解鎖資料層。** 目前很多 min/max/step 是 UI 自訂值，不等於 FH6 實際 slider 契約；應建立 `TuneControlSpec` 與 `UpgradeUnlockSpec`，未確認的欄位不得標成 physics-based。
3. **P1：把固定比例改成可校準的參數。** Road、Rally、Drag、Drift 的 ARB、彈簧、阻尼、差速器、胎壓和齒比目前多為固定 click/百分比，應由車重、軸距、輪胎載荷、速度、路面與 telemetry feedback 共同修正。
4. **P1：先保留 preset 行為，新增 A/B calibration mode。** 這可避免一次改動破壞既有 UI 與 251 個通過的前端測試。

## 本地實作基線

### 四種 chassis profile

| 取向 | 目前代表規則 | 初步評估 |
|---|---|---|
| Road/Circuit | AWD ARB 約 `1–5 / 50–65`；RWD ARB 依前後配重線性映射；彈簧按 slider range 與配重映射，再加 aero 補償；車高 min 上方 3 clicks；rebound 的 bump 為 `0.60`；AWD center rear 約 `60–85%` | 可作 FH 風格的起始 heuristic；但 ARB 與 spring range 被混用成物理量，缺少 wheel rate、motion ratio、載荷與速度閉環 |
| Drift | ARB `10 / 50`；彈簧 `weight × axle fraction × 0.035`；rebound `6/6`、bump `3/3`；RWD rear accel `100%`、decel `25%`；前 `-4.8°`、後 `-0.5°`、caster `7°` | 100% rear accel 與高 caster 符合常見漂移起始方向；固定前後 ARB、對稱阻尼與極端前 camber 不適合作為所有車型真值 |
| Rally/Off-road | ARB 與彈簧固定乘 `0.35/0.65`；車高 max；bump/rebound `0.40`；AWD `40/80` accel、center rear `65%`；定位前/後 `-1.3/-0.8°` | 「軟、長行程、高車高」方向合理；但未按跳台速度、輪胎/路面、阻尼 critical ratio 或 landing telemetry 求解 |
| Drag | ARB `1/65`；前彈簧 20%、後 90% range；前低後高；阻尼 `reb 3/12`、`bump 4/10`；驅動軸 accel `100%`；前後受力分配固定 | 可視為遊戲內 launch preset，但「後懸吊越硬越能抑制 squat」不是普遍現實結論；應由 launch slip、wheelie、60-ft/100-m telemetry 校準 |

來源：`tuningMath.ts:439-649`、`tuningMath.ts:680-794`。

### AEGO gearing

- 基礎速度換算 `v = rpm × 2πr / (gear × finalDrive × 60)` 的量綱正確，且有動態輪胎半徑與 simulated/soft cap correction。
- Road 的 `hp^(1/3)` 目標速度、Drag 的 `410 × (hp/kg)^0.30 × aero term`、Rally 的 `28 × hp^(1/3)` 都是校準曲線，不是由阻力、牽引、輪胎半徑與功率平衡推導出的完整模型。
- Drift/Drag 強制最多 4 個 active gears，並把其後齒位複製成第 4 檔；這可符合某些 FH drag preset，但不能當成所有車輛/賽道的遊戲規則。
- 最終齒比和檔位最後 round 到 `0.01`，並強制單調遞減；這會掩蓋不合法/不適合的輸出，應改成回報 validation warning 而不是靜默修正。

來源：`tuningMath.ts:82-377`。

## 輪胎係數專項結論

目前表格為：Stock `0.85`、Street `0.95`、Sport `1.05`、Semi-Slick/Slick `1.15`、Rally/Off-Road/Snow/Drift `1.05`、Drag `1.40`、Default `1.00`。排序是：

`Stock < Street < Sport = Rally = Off-Road = Snow = Drift < Semi-Slick = Slick < Drag`

但 `tuningMath.ts:163-190` 顯示它實際只影響 Drift final drive，且被 `2.2–6.1` clamp；Road、Rally、Drag 與 DangerSign 不使用它。因此目前表格不是全車抓地模型，甚至不能直接解釋為 FH6 的胎種性能比例。

公開資料支持部分排序與定性 meta，但沒有可驗證的逐胎種 μ、側向 G 或縱向抓地表。FH6 Series 2 release notes 對 Drag Tires 的行為將直線與彎道效果分開，這直接反駁單一 `1.40` scalar 可同時代表所有用途：[Series 2 Release Notes](https://forza.net/news/forza-horizon-6-series-2-release-notes)。FH6 的雪地輪胎存在性可由官方 features 確認，但官方沒有公布 `Snow = 1.05`：[FH6 features](https://forza.net/news/forza-horizon-6-features)。

建議的最低模型：

```text
muLong[compound][surface]
muLat[compound][surface]
temperatureMultiplier
pressureMultiplier
loadSensitivity
peakSlipRatio
peakSlipAngle
```

用 friction ellipse 約束 combined slip：

```text
(Fx / (muLong * Fz))^n + (Fy / (muLat * Fz))^n <= 1
```

校準應固定同一車、馬力、輪胎寬度、懸吊、差速器、天氣、路面與胎壓，分別做直線起步、固定半徑彎、制動、出彎 combined-slip A/B 測試，以中位數或 robust regression 估計相對係數。現有遙測沒有四輪 `Fz`、輪胎力、即時胎壓與精確路面標籤，因此只能辨識「同條件有效抓地」，不能從單次 session 求出絕對 μ。Pacejka 類輪胎模型也需要 slip、載荷、外傾角與參數識別，而不是一個常數：[SAE Pacejka reference](https://saemobilus.sae.org/papers/normalization-pacejka-tire-model-2004-01-3528)。

## FH6 調校控制邊界：目前 UI 與遊戲真值的差異

下表是 repo 目前實際宣告的輸入契約；「FH6 真值」欄位在沒有遊戲內截圖/版本資料前必須標為待驗證。

| 控制項 | repo min/max/step | 輸入精度 | FH6 真值狀態 |
|---|---|---:|---|
| 胎壓 | `1.0–4.0`, step `0.01`（內部 bar） | 0.01 | 待以實際顯示單位與改裝件驗證 |
| ARB | car param 或預設 `1.0–65.0`, step `0.1` | 0.1 | 待驗證；固定 65 上限不應硬編成所有車 |
| 彈簧 | car param 或 `10–120 kgf/mm`, step `0.1` | 0.1 | 待驗證；不同懸吊升級通常會改範圍 |
| 車高 | UI `5–35 cm`, step `0.1` | 0.1 | 待驗證；實際遊戲可能是有限 click 段數而非連續 cm |
| Rebound/Bump | `1–20`, step `0.1` | 0.1 | 待驗證；遊戲常以 slider 級距顯示，不能由 UI input 推定 |
| 差速器 accel/decel/center | `number`, step `1`, 0–100（center 另有 10–90 clamp） | 1% | 待驗證；FWD/RWD/AWD 與改裝件決定可見欄位 |
| Camber/toe/caster | 公式輸出多為 0.1°；toe 目前以字串輸出 | 0.1°/字串 | 待驗證；字串會妨礙數值 clamp、排序與 telemetry regression |
| 齒比 | AEGO round `0.01`；齒數來自 car params，預設 6、註解 4–10 | 0.01 | 待驗證；變速箱改裝決定可調 final drive/gear 與齒數 |
| 空力 | `aero_downforce_* <= 0` 時自動推導；沒有完整 UI range | 不定 | 不應把推導值當遊戲 slider 真值 |

來源：`TuningSliderGrid.tsx:30-55`、`SuspensionTuner.tsx:38-151`、`DifferentialTuner.tsx:45-95`、`CarParamsContext.tsx:27-50,141-166`。

目前的主要邊界風險：

- UI `<input type="number">` 的 `step` 只限制瀏覽器輸入提示，不能證明遊戲 slider 的 step；部分輸入也沒有 min/max。
- `calculateChassisTuning` 的 safety clamp 使用 car param 的 spring range，但 ARB、車高、阻尼仍採全域預設，與不同升級件的解鎖範圍可能不一致。
- `adjustability` 型別已有 `Fixed | FinalDrive | Full`、ARB/aero/diff 可調狀態，但目前 profile 求解器沒有在每個分支先檢查這些 capability；因此可能產生玩家實際無法設定的建議。
- `ARBTuner.tsx` 目前是 placeholder，不能當作完整 ARB 控制實作。
- 應新增 versioned data：`fh6TuneControls.v<game-version>.json`，每筆包含 `upgradeLevel`, `capability`, `min`, `max`, `step`, `displayUnit`, `precision`, `gearCount`、`source` 與 `confidence`。

## 四種取向的迭代建議

### Road/Circuit

保留 AWD rear-biased ARB 作為 preset，但改成以 axle load、aero load、tire width、lateral G 與 tire temperature 的閉環調整。現行 Road AWD 的 `front <= 5 / rear >= 50` 可作競技起始 heuristic；RWD/FWD 卻仍用靜態配重線性映射，沒有依輪距、roll center、motion ratio 或輪胎載荷計算。齒比以每檔換檔後 RPM 是否仍落在 torque/power band 驗證，而不是只用 `hp^(1/3)` 速度目標。FH6 社群資料普遍建議依症狀小幅調整胎壓、齒比、定位、ARB、彈簧/阻尼、空力與差速器，而不是一套固定值：[FH6 tuning reference](https://fh6meta.com/guide/tuning?lang=de)。

現實理論上，彈簧應先由 sprung mass、wheel rate、motion ratio 與目標自然頻率求解，阻尼再由 critical damping ratio 求解；目前 Road 的 `baseSpring + aero/10×0.5` 與 `bump = rebound×0.60` 只是遊戲 slider 的比例。P0 應把這些值明確標成 calibration constants，並以 corner-entry/steady-state/exit 的 telemetry A/B 結果調整，而不是宣稱「scientific physics-based」。

### Drift

保留 rear accel 高鎖定與 caster 約 7° 的起始方向；將 front/rear tire pressure、rear camber、rear ARB、decel 和 slip-angle target 參數化。公開 FH6 drift 指南常見 100% rear accel、約 `18–22 psi` 或依車而異的壓力範圍，但不同社群指南對 rear decel/胎壓仍有衝突，故只能當先驗：[FH6 drift guide](https://fh6wiki.com/guides/drift-tuning-guide)、[community RWD drift discussion](https://steamcommunity.com/app/2483190/discussions/4/569288789836623491/)。

### Rally/Off-road

保留軟化與提高車高方向，但加入 surface profile、jump/landing severity、airtime、wheel travel 與 wheel-speed mismatch；將 `0.35/0.65/0.40` 變成 calibration constants，不能假設所有 rally/off-road 車相同。

### Drag

優先拆開 longitudinal/lateral tire model，並以 60-ft/100-m、launch slip、wheelie/底盤壓縮、換檔點和終點 RPM 校準。第一檔應由「無持續 wheelspin 的最大輪上牽引」求解；終檔應以賽道距離和終點速度求解，不應固定所有車採相同 4-speed topology。FH6 drag 指南也指出第一檔應在抓地與速度間取平衡，且終點應接近該檔的最大功率轉速：[Windows Central FH6 drag tuning](https://www.windowscentral.com/gaming/forza/forza-horizon-6-best-drag-cars/)。

目前 Drag 分支的特別風險是 `vDragTop = 410 × (hp/kg)^0.30 × (1 + 0.12 × aeroEfficiency)`：量綱上只是經驗曲線，且把車重直接帶入高速終端速度。若功率、CdA、傳動效率相同，終端速度主要由 `P ≈ 0.5ρCdA v³` 與滾阻決定；車重應主要影響加速、輪荷與抓地。建議先以每車的 in-game simulated top speed 作 anchor，長期再加入 CdA/rolling resistance。現行測試的 930 hp Lambo `>360 km/h` 只證明該 fixture 通過，不證明曲線正確。

另外，現行 `tireType` 與 `maxTorque` 不會影響 Drag 齒比，且前 `bump=4` 高於 `rebound=3`、後彈簧固定到 range 的 90%，都應由 launch telemetry 驗證。FH6 社群資料對 AWD/RWD、前後胎壓與終點落在第 3 或第 4 檔並不一致，因此 4-speed 應是可選 strategy，而非硬規則。

## 建議實作順序與驗證門檻

1. 建立 `TuneControlSpec`、`UpgradeUnlockSpec`、`TireCalibrationProfile`，先不改 preset 輸出。
2. 將所有輸出改成 typed numeric values；toe 不再以字串傳遞，UI 層才做格式化。
3. 新增 capability-aware solver：不可調項目回傳 `unavailable`/warning，不產生玩家不能套用的值。
4. 新增 calibration fixture：同一車同一路面下，每胎種至少 5 次起步、5 次定半徑彎、5 次制動與 5 次出彎測試。
5. 以遊戲版本、車輛、改裝清單、路面、季節、胎壓、溫度和遙測 session hash 建立可重現資料。
6. 只有當某個改動同時通過：單元測試、控制邊界測試、A/B telemetry 指標改善、以及不超出 FH6 可設定範圍，才升級為新 preset。

## 中國玩家社群與 Bilibili 交叉研究

本輪另以 `gpt-5.6-terra` 分派三路中文社群研究：Bilibili 專查、Bilibili 以外的中國攻略/玩家來源、以及證據與公式映射審查。已完成的兩路結果有一個重要共同點：**中文社群能提供用途、車輛、PI、分享碼與改裝方向，但目前沒有足夠多可審核的 FH6 完整 slider 表，不能直接校準本專案常數。**

### Bilibili 可引用線索

Bilibili 影片頁在本次環境直開回 `412 Precondition Failed`，站內搜尋也遇到驗證碼，因此無法核讀畫面中的完整旋鈕值。以下來源仍可作為「存在某種玩家實作／meta 線索」而非數學數據：

| 用途 | 來源與可見資訊 | 證據等級 |
|---|---|---|
| Road/Circuit | [Toyota Starlet Glanza V A 公路](https://www.bilibili.com/video/BV17K7N6xE7e/)，2026-06-22，分享碼 `175 973 556` | 可套用分享碼；旋鈕不可審核 |
| Road/Circuit | [曾爾環道 B 級 WR 47.978](https://www.bilibili.com/video/BV16PVA65ECx/)，2026-05-26，半熱熔胎、約 `2.2 lateral G`、圈速 `47.978` | 性能/用途線索；無完整設定 |
| Road | [Miata FE S1 公路 META](https://www.bilibili.com/video/BV1vAV763ESx/)，2026-05-31，AWD、直線胎、8.4 V10 | 改裝方向線索；無 slider 表 |
| Drift | [漂移區間調校展示](https://www.bilibili.com/video/BV1ohLN6nEyA/)，2026-05-19；[AE86 系列賽攻略](https://www.bilibili.com/video/BV1knEv6nEN5/)，分享碼 `796 164 387` | 可套用/作者線索；不能驗證 `100%` diff、21 PSI 或 `-4.8°` |
| Rally/Off-road | [GMC Jimmy A 越野](https://www.bilibili.com/video/BV1ZfMM6VEAj/)，分享碼 `986 948 684`；[開局車調校合集](https://www.bilibili.com/video/BV1dv5Y6tEk9/)，含 Celica/Evo/RAM TRX 分享碼 | 車種/用途線索；無改裝與旋鈕表 |
| Drag | 本輪未取得含完整設定表的 Bilibili FH6 Drag 來源 | 無法下結論 |

這些 Bilibili 內容支持「AWD、特定胎種、引擎 swap 與賽事/PI 限制會共同決定玩家方案」，但沒有支持或否定目前的 Road `1/65`、Drift rear accel `100%`、Rally 固定 `0.35/0.65/0.40`、Drag 四檔或 `tireCoefficients` 的精確數值。分享碼不能反推出 slider 值，也不能取代版本化改裝清單與 telemetry。

### 其他中國玩家/攻略來源

| 來源 | 可驗證內容 | 對演算法的意義 |
|---|---|---|
| [游民星空 S1 秋季賽](https://club.gamersky.com/activity/1566942?club=74)，2026-05-29 | 同期涵蓋公路、漂移與直線活動；玩家回報 WRX 泥地快但混合路面起步慢，部分車因 PI 保留原廠齒比 | 支持把路面、起步牽引、PI 與齒比作為輸入；反對按賽事名套單一齒比 |
| [游民星空 S2 春季賽](https://club.gamersky.com/activity/1579466)，2026-07-12 修訂 | MG 6R4/Peugeot 207S 偏拉力泥地；越野跳躍多但體驗不同 | 支持拆分 Rally/Gravel 與 Cross Country/DangerSign |
| [电玩帮 S2 冬季赛](https://www.vgover.com/news/222862)，2026-06-28 | Viper 計時分享碼 `141 530 656`、Haruna 漂移用途；同車同碼也明確需要不同駕駛技巧 | 支持「同車/同碼不能推導全類別最優」；可作回歸 fixture，不是滑桿真值 |
| [TapTap AE86 漂移帖](https://www.taptap.cn/moment/811577323785554276)，2026-06-04 | 建議關閉 ABS/TCS/穩定控制、手動換檔、輕手煞與反打 | 輔助設定與駕駛輸入必須記錄，否則漂移 A/B 不可比；不支持具體胎壓/定位常數 |
| [抖音調校專題索引](https://www.douyin.com/zhuanti/7642149365473429519)，2026-08-13 抓取 | 能確認大量改裝/調校/漂移教學內容存在，但索引不含可審核旋鈕 | 只作後續人工複核線索，不進參數庫 |

本輪在百度贴吧、NGA、知乎、3DM、17173、九游等可索引頁面中，未找到可核驗的 FH6 完整 slider/改裝解鎖原帖；有些中文文章是匿名轉載或把 FH5 表格延用到 FH6，應降級為歷史參考。這不是「中國社群不存在數據」，而是目前資料不可審核、不可版本化或無法確認是否為 FH6。

補充的中文證據審查也得到相同結果：

- [Bilibili AE86 後驅漂移](https://www.bilibili.com/video/BV1RkGn67EL7/)、[從胎壓到差速器](https://www.bilibili.com/video/BV13XGV6tEQU/)與[新手漂移教程](https://www.bilibili.com/video/BV1KKLY6GExv/)能確認玩家正在討論 RWD、胎壓、差速器與分享碼，但影片畫面/群檔不可審核；後者還明示是個人觀點或含 AI 生成內容，權重低。
- [地平線 6 調校大廳](https://vermillion-flan-b6e213.netlify.app/)可觀察到公路使用 AWD 全熱熔、漂移使用 RWD 漂移胎、拉力使用 AWD 拉力胎等跨用途選胎線索，但沒有 ARB、diff、齒比滑桿；且其資料部分回溯 Bilibili，不能作獨立驗證。
- [遊俠 FH6 新手調校](https://gl.ali213.net/html/2026-5/1773945_5.html)只支持方向性規則，例如推頭時軟前 ARB/硬後 ARB、出彎推頭或打滑時降低加速差速器；[biubiu FH6 各級調校](https://www.biubiu001.com/news/194875.html)提到漂移後胎 `1.5–1.8 bar`、後差速器 `80%+`，但無車、賽道或測試圖，應標為低權重 anecdote；[18183 FH6 漂移攻略](https://m.18183.com/gonglue/202605/8940780.html)同樣是匿名轉載。
- 這些低權重資料沒有精確支持 `AWD 1/65`、Drift rear accel `100%`、Rally rear decel `25%`、Drag fourth gear `1.00` 或目前單標量輪胎係數。中文社群只提供「前軟後硬」「RWD/漂移胎」「拉力高車高/較軟」「按路面與車輛微調」等方向性支持。
- 中國來源的胎壓單位也互相衝突：`1.5–1.8 bar` 約為 `21.8–26.1 PSI`，另有 `2.2–2.3 bar` 約為 `31.9–33.4 PSI`；未附版本、車型與完整設定時，不能拿來改寫 `targetPhot` 或 UI step。

因此本輪中國社群調查的正式結論是：**可提升產品的 calibration fixture 與研究假設，不能提升任何現有公式常數的信心等級。** 所有分享碼若要進入資料集，必須同時記錄車輛、PI/class、改裝件、賽道/路面、輔助設定、遊戲 build、每頁 slider snapshot 與遙測 session；單獨保存分享碼不具數學可重現性。

### 對目前算法的新增判定

- `tuningMath.ts` 應加入 `surface`, `eventType`, `class/PI`, `installedParts`, `assistState` 與 `gameBuild` 等 calibration key；中文實例顯示同一車在泥地、混合路面、漂移區與計時賽的最佳方案不同。
- Bilibili/中國攻略常以分享碼交付，故產品需要「分享碼 + 實際改裝件 + 每頁 slider snapshot + 版本」的匯入/紀錄流程；只保存分享碼不足以做 solver regression。
- 中文來源沒有可靠地驗證 PSI/bar 單位、slider step、改裝解鎖或 `4th gear = 1.0`。因此不能以本輪資料修改 `targetPhot=32.5`、`Drag=1.40`、`Drift=21 PSI` 或任何 min/max/step。
- 最有價值的新增測試樣本是：WRX 泥地/混合路面起步、MG 6R4/Peugeot 207S 拉力、Viper 計時與漂移分離、B600 FWD Civic 季賽，以及 Bilibili 的 Starlet/GMC Jimmy/AE86 分享碼；先記錄實機旋鈕，再進入校準資料集。

## 現況驗證

本次未修改程式碼。前端 Vitest 通過 **45 files / 251 tests**。這證明目前函式契約與既有 fixture 一致，不證明公式已符合 FH6 meta 或真實車輛物理。

## 最終建議

**建議迭代，優先修正模型邊界與資料契約，再校準公式常數。** 不建議現在直接把 `1.40 Drag`、`0.35 Rally ARB`、`100% diff` 或固定 4-speed 視為 FH6 官方 meta；它們應被標為 profile heuristic，並由版本化的遊戲內邊界資料與可重現 telemetry A/B 實驗逐步取代。
