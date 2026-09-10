# FH6 調校工作流與 AEGO 齒比研究紀錄

> UX 迭代後，一般流程已改為「靜態資料 → 指引收集 → 完成後點擊算牌」。下述自訂速度／RPM 契約保留為進階研究入口，不再是基本流程要求。現在的操作、品質門檻與驗證界線以[指引式量測工作流](tuning-guided-measurement-workflow.md)為準。

檢索日期：2026-09-09
範圍：FH6 調校證據、legacy AEGO 齒比流程、developer/domain drag solver 與 MCP 齒比工具的邊界；本文不是遊戲內實測或公式校準紀錄。

## 結論與證據界線

可確認的是 FH6 持續更新，且官方曾於 2026-06-15 修改 Drag Tires 的物理行為；不能確認的是任何官方齒比公式、`simulatedTopSpeed` 的精確語意、傳動比 slider 範圍/步進，或「Drag 固定四檔」規則。因此 AEGO 必須將輸出標示為 `prior`、`legacy` 或有來源的 `measured`，不可宣稱其硬編常數已由 FH6 校準。

新的顯式賽事校正模型比現有 secondary correction 更合適：輸入「目標速度」及可選「目標時引擎轉速」，依輪胎周長計算總傳動比，優先以 final drive 吸收差異。這個模型可縮短或拉長齒比，並把未達成原因回傳給 UI；它不必假定遊戲 transmission-preview 圖的右端是速度限制。

## 可核對的外部資料

| 等級 | 來源與日期 | 可使用的主張 | 限制 |
|---|---|---|---|
| 官方 | [FH6 Release Notes: June 15, 2026](https://support.forza.net/hc/en-us/articles/52554154006547-FH6-Release-Notes-June-15th-2026)（2026-06-15） | Drag Tires 的 cornering physics 已調整；官方明說它們不再應在非 Drag 賽事成為最佳選擇，並稱 Drag times/leaderboards 不受這一項 cornering 改動影響。 | 未公布齒比、紅線、FD、輪胎 μ 或 slider 公式；不能導出任何數值。 |
| 官方，最新查得狀態 | [FH6 Release Notes: September 7, 2026](https://support.forza.net/hc/en-us/articles/55121247584915-FH6-Release-Notes-September-7-2026)（2026-09-07） | Series 5 build 為 Xbox/Windows 3.440.853.0、Steam 1.440.853.0；加入 Drift Attack，並調整部分 circuit 的圈數。 | 該版 notes 沒有列出 upgrades、tuning 或 gearbox physics 修改；「未列出」不證明物理未變，只表示沒有可用的官方數值規格。 |
| 原始創作者內容 | [HokiHoshi, How To Build & Tune in FH6](https://www.youtube.com/watch?v=I9bUB3mcqso)（2026-05-16） | 早期 FH6 實際遊玩導向的完整 build/tuning 教學，包含 gearing；作者描述資料來自約三週 preview 與競技玩家意見。 | 作者明言是 early guide、meta 會變；適合產生測試假設，不是可直接校準的公式。 |
| 作者實作觀察 | [Windows Central, FH6 drag cars and tuning](https://www.windowscentral.com/gaming/forza/forza-horizon-6-best-drag-cars-and-tuning-setups-to-dominate-the-leaderboards)（2026-06-02） | Drag 齒比要依 strip length 決定；一檔在抓地與 wheelspin 間取捨；終點應接近所選終點檔的高轉區。 | 作者經驗而非官方或受控實驗；仍支持以賽道距離與終點檔位取代固定四檔。 |
| 社群整理 | [Comprehensive Road/Rally Tuning Guide](https://www.reddit.com/r/ForzaHorizon6/comments/1tqg50m/comprehensive_tuning_guide_road_and_rally_tuning/)（約 2026-06） | 社群明確承認各 tuner 對參數有不同觀點，且在 FH6 仍需自行測試。 | 二手綜合資料，含 FH5/Forza Motorsport 傳承；只能作候選 fixture 或假設。 |
| 個人參考 | [Apex Speed Craft tuning reference](https://apexspeedcraft.com/2026/04/25/forza-horizon-tuning-reference/)（原文 2026-04-25，頁面稱 2026-07-27 更新） | 記錄了早期 drag 4-speed meta 與 2026-06-15 Drag Tire 更新後的作者觀察。 | 個人網站；其四檔內容正是需驗證的 meta，不能升格為 solver hard constraint。 |

現有專案的 [external evidence report](tuning-math-external-evidence-report.md) 也已正確界定：控制家族及部分 upgrade gates 可有中等信心，但數值 min/max/step、tire μ、surface multiplier、peak slip、溫度與壓力係數仍是 `unknown` 或 `calibration-prior`。本研究沒有發現足以推翻該界線的新官方數值證據。

## FH5 傳承、社群 meta 與 FH6 實證的分層

| 分類 | 可做的事 | 不可做的事 |
|---|---|---|
| FH6 官方 release notes | 記錄 game build、physics 變更、建立 regression/capture 分組。 | 從未公布的欄位推導 transmission 或 tire 數值。 |
| FH6 原始 creator/競技 tuner 內容 | 建立帶有 URL、日期、車輛、PI、零件、assists、route 的 candidate fixture；提出 A/B 問題。 | 把單一 share code、排行榜時間或體感泛化為跨車公式。 |
| FH5 或 Motorsport 傳承 | 保留模型形式，例如輪胎周長、轉速與總傳動比關係、wheel-force crossover 的概念。 | 假定 FH5 range、4-speed trick、1/65 ARB 或某個 shift ratio 在 FH6 仍為真。 |
| 實機 capture | 在已知 build/車/零件/路面/輔助設定下，驗證指定輸入對指定結果的影響。 | 以一次 run 宣稱全車系、全版本或所有 event 的 universal meta。 |

## AEGO 與介面應採用的校正契約

### 本分支已實作的範圍

- `targetSpeedKmh` 與 `targetRpm` 必須一起填入；本版不自動猜測 anchor RPM。兩欄皆空才使用原基準或舊版校正。
- 顯式目標優先於兩個舊欄位，可拉長或縮短齒比。先調 FD；必要時同比例調整所有檔位，保留既有間距。輸出量化至 0.01 後重新計算速度，1% 內才回報 `matched`。
- `limited` 表示目前算牌假設範圍或量化無法達標；不聲稱遊戲不可能達標。不能維持 0.40–6.00 個別齒比與有效檔位嚴格遞減時，回傳基準與其計算速度。FD 仍使用既有 2.00–6.10 假設範圍，尚未接入每車 gearbox capability。
- 新 UI 提供紅線轉速確認、目標速度、目標 RPM、`matched/limited/invalid` 與 `achievedSpeedKmh`。圖表與求解器共用輪胎幾何（FWD 前輪；RWD/AWD 後輪慣例），圖表使用同一 `maxRpm`。紅線初值仍是 peak-HP RPM × 1.15 的估算，使用者可覆寫。
- 舊版校正收在可展開區塊，其歷史計算語意保留。**尚未將舊 `softMaxSpeed` 全面移除求解或自動遷移既有 preset**；只有顯式目標路徑忽略它。這是相容性取捨，不是肯定 X 軸具物理意義。
- Drag/Drift 固定前四檔、developer/domain、MCP 的公式及車型校準常數不在本次修改內。下列 source metadata、fallback、capability 與 P1–P3 是後續建議，不能當作已完成功能。

### 後續完整契約建議

現行 legacy UI 把 `softMaxSpeed` 說明為 in-game transmission preview 的 X-axis 右端，但 legacy solver 會將它與 `simulatedTopSpeed` 都當成上限，且只以 `Math.min` 縮短目標。這是 UI 語意與公式用途衝突：圖表 viewport 不是實測、賽事條件或 gearbox constraint。

建議將新欄位明確命名並保留舊欄位的讀取相容：

```ts
type EventSpeedTarget = {
  targetSpeedKmh: number;
  targetRpm?: number;
  source: 'measured' | 'event_requirement' | 'in_game_preview' | 'legacy';
};
```

在頂檔齒比為 `G_top`、final drive 為 `FD`、驅動輪周長為 `C`（m）時：

```text
R_total = G_top * FD = targetRpm * C * 60 / (targetSpeedKmh * 1000)
```

求解流程應為：

1. 驗證 target speed、target RPM、周長與 active gear；不合法時回傳 `invalid`。
2. `targetRpm` 缺失時才明確以 `maxRpm` fallback，並輸出 `anchorRpmSource: 'redline-fallback'`，不可靜默改用 peak-HP RPM。
3. 先保持各檔相對間距，讓 FD 對齊 `R_total`。
4. 當 FD 超出已知車輛/gearbox capability 時，才同比例調整各檔並保留遞減、換檔後轉速與量化的 guard。
5. 回傳 `matched`、`limited` 或 `invalid`，以及 `achievedSpeedKmh`、`achievedRpm`、`activeTopGear`、fallback/limit reason，讓 UI 不把估算顯示成實測。
6. `softMaxSpeed` 只保留作 preview viewport/reference line；不得傳入求解器。舊 `simulatedTopSpeed` 只在載入舊 preset 時轉成 `source: 'legacy'` 的輸入，並顯示其證據等級。

這個設計支援任意目標方向，不會像現行 `Math.min` 一樣只能縮短齒比；也讓賽事目標、實測 terminal speed 與預覽資料不再混為一談。

## 目前程式路徑與優化優先順序

### P0：完成 legacy correction 的語意修正

- `frontend/src/utils/tuningMath.ts` 的 legacy AEGO 對 Road/Drag 使用沒有 FH6 calibration 的 power、aero、grip 常數；保留 compatibility，但將輸出/文件明示為 prior。
- 將 `targetSpeedKmh + targetRpm` 校正導入 legacy 入口，FD 優先、再依一致規則同比例調整檔位，並輸出結果狀態與 achieved values。
- `frontend/src/features/tuning/components/GearingTuner.tsx` 的 chart 必須用相同 driven tire radius 與 `maxRpm` 作繪圖；preview X 軸範圍不能回寫為 solver constraint。
- 保留 `simulatedTopSpeed` 和 `softMaxSpeed` 的反序列化相容，避免既有 preset 失效；新 UI 引導使用 event 目標，不鼓勵以 preview 軸端作能力資料。

### P1：移除 legacy Drag 的固定四檔假設

legacy `calculateAEGOGearing('Drag', ...)` 目前只算前四檔，並把其餘齒比複製為第四檔。這使有六至十檔 capability 的車輛得到重複且非單調的輸出，也把未驗證的社群習慣變成 hard constraint。

Drag 輸入至少要有 event/strip length、目標/觀測 terminal speed、gear count、drivetrain、輪胎尺寸與可取得的 power curve。active top gear 是結果或明確使用者選擇，不能永遠等於 4。沒有 power curve 時，shift advice 要標示 `estimated`；有 power curve 時才可計算 wheel-force crossover 候選點，仍需實機驗證換檔延遲與 traction。

### P2：修正 developer/domain Drag solver 自身的一致性

`frontend/src/domain/tuning/profiles/dragProfile.ts` 會按 strip length 指派 `activeTopGear`，但 ratio spacing 仍展開到完整 `gearCount`，`topSpeedAtPeakHpKmh` 也取最後一檔。因此短 strip 下，註解所說「active top gear 對齊 target」和實際回傳的 terminal top speed 不一致。

修正時應使：用於 FD 求解的 ratio、spacing 終點、`activeTopGearRatio`、reported achieved speed 與模擬的 terminal gear 都指向同一 active gear。這是 domain 邏輯正確性問題，和 P0 的 legacy 相容性變更應分開 review。

### P3：收斂 MCP 的命名與證據 metadata

`backend/mcp/service.py` 的 `run_gearing_solver` 是另一套 Python 幾何算法，不等同 legacy TypeScript AEGO，也不等同 developer/domain Drag solver。短期內應回傳 `solverId`、`modelVersion`、`calibrationStatus`、input fallback；不可只以「AEGO」暗示公式一致。等 P0/P2 的 contract 穩定後，才決定共用純公式核心或保留明確分版本 adapter。

## 受控一變量 3+3 A/B 工作流

所有比較都要固定：FH6 game build、車輛 ordinal/model、PI、完整零件清單、輪胎、drivetrain、齒輪箱 capability、路面、天氣、event、路線、assist、控制器/shift 模式、起步程序與目標距離。先跑 warm-up，將撞牆、打轉、流量干擾等無效 run 明確註記；JSON `tuning-capture/v1` 是 canonical，CSV 僅供檢視。

### A：事件目標速度/轉速校正（3 + 3）

1. Baseline：不套 explicit correction，錄製三次相同 event run。
2. Candidate：固定 anchor 為已確認的 `maxRpm`，同時明確填入 `targetRpm = maxRpm` 與 `targetSpeedKmh`，將這組齒比候選視為唯一調整項，錄製三次。本版不提供隱含 RPM fallback。
3. 比較：terminal speed、terminal RPM、terminal gear、到達目標距離的時間與每次 shift RPM；確認 solver 的 `achievedSpeedKmh` 與實測差異被記錄，而非被隱藏。

此組驗證「目標速度契約與 FD-first 行為」，不驗證萬用 horsepower/aero 公式。

### B：Anchor RPM 的單一變因（3 + 3）

1. 固定相同 `targetSpeedKmh`、車與 event，明確輸入 `targetRpm = maxRpm`，錄製三次。
2. 僅把 `targetRpm` 改為經 telemetry 觀察且可重複的終點 RPM，錄製三次。
3. 比較 terminal RPM 偏差、terminal speed、最後一次 shift 的 post-shift RPM 和 event time；若 target RPM 造成未達終點速度，保留該結果，而非調整其他 tuning 項掩蓋它。

此組驗證 anchor 的表達能力，不能推出所有引擎的最佳換檔轉速。

### C：Drag active gear / strip-length（3 + 3）

此組是 P1 完成後的驗證計畫；本版尚未提供 active gear 選擇。

1. 固定車、build、輪胎、assist、launch 程序與同一 strip length，使用選定 active top gear 的 baseline，錄製三次。
2. 只改 active top gear 或已知 strip length 這一個因子，另外錄製三次；不要同時改 FD、tire pressure、differential 或 launch RPM。
3. 比較 60-ft/100-m/1/8-mile/1/4-mile（適用者）、terminal speed、terminal gear、wheelspin duration、shift count 與終點 RPM。

每組若三次內的 driver/traffic variation 大到遮蔽差異，結果為 inconclusive，而非以最低時間挑選勝者。任何要升格為 `in_game_capture` 的結論，都應在至少另一個車/part/build 組合重複並保留原始 metadata。

## 非目標與限制

- 本文不把 synthetic replay、單元測試、UI graph、community share code、MCP simulation 或 solver self-consistency 視為 FH6 實機證據。
- 沒有官方或 capture 證據前，不改寫 `tireGripCoefficients`、Drag μ、aero multiplier、`410`、`37`、power exponent、固定第一檔速度或 4-speed meta 為 production-calibrated 常數。
- 真正的 promotion 仍需依 `docs/calibration/` 的 capture metadata、單一變因 protocol 與版本化 A/B evidence 進行。

## 本次交接

```text
Task: FH6 調校工作流與 AEGO 賽事目標研究優化
Status: done
Owner: Codex（實作與整合）；Terra（外部研究與唯讀覆核）
Branch: codex/fh6-tuning-meta-aego
Scope: legacy AEGO 顯式速度/RPM 目標、Step 2 輸入與圖表、繁中翻譯、研究與 A/B 方法
Changed: tuningMath.ts / tuningMath.test.ts；TuningView.tsx；GearingTuner.tsx；GearingTargetInputs.tsx；lang/zh-tw.json；README.md / README.en.md；本文件；.agents/Journal.md
Pending: 本輪研究與有界實作已完成；實機 A/B、每車 capability、Drag 有效頂檔與 MCP 契約是後續研究項目
Blocked by: None（不宣稱已取得實機校準結果）
Verification: 前端 598 passed；後端 268 passed / 8 deselected；tsc + Vite build、Ruff check/format、path-case 與 diff whitespace 檢查通過
Next action: 以本文件的 A/B 方法蒐集同 build、車型與事件的 baseline/candidate captures，再决定公式常數或 P1–P3 的下一輪改動
Last updated: 2026-09-09
Delivery: 本地未提交變更；未 commit、push、開 PR 或改動遊戲設定
```
