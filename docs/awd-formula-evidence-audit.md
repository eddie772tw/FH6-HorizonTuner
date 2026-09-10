# AWD Road/Circuit 算牌：工程與 FH6 Meta 證據稽核

檢索／程式核對日期：2026-09-09。範圍是一般調校頁面的 AWD Road/Circuit 路徑，及其與 `2024 Ford Mustang Dark Horse` S1 800 參考車的差異；不修改公式，也不把社群起點誤稱為 FH6 的物理規格。

## 結論與路徑界線

目前一般 UI 預設為 legacy `TuningView`，它在已完成指引式量測後，呼叫 `frontend/src/utils/tuningMath.ts` 的 `calculateChassisTuning()`（Road/Circuit 是 default 分支）。只有使用者在設定中開啟 **Developer Tuning View** 時，才走 `TuningView_dev` / `domain/tuning/profiles/roadProfile.ts` 的實驗性 solver。因此本文件的「現行」指 legacy Road 輸出；developer 的 `1/65` 選項與 stock-aero warning 是重要對照和後續風險，不是一般 UI 正在採用的結果。

`docs/dark-horse-reference-20260909.md` 已核對的車況為 AWD、832 hp、3,864 lb（約 1,752.7 kg）、前重 56%／後重 44%、中央後偏 90%，且實車動態尚未驗證。它有兩軸可調、已讀到前／後下壓 387／337 lb（約 175.5／152.9 kgf）；但 spring、ride-height slider range 是舊 profile，不能用來冒充本車目前能力範圍。

對這台車，legacy Road 分支的可獨立重算輸出是：

| 項目 | 現行式與 Dark Horse 結果 | 原調校／已知值 |
|---|---|---|
| ARB | `front=min(5,1+4Wf)=3.24 -> 3.2`；`rear=max(50,65-0.3(100-Wr))=50` | 9.5 / 50 |
| springs | `Kmin+(Kmax-Kmin)W axle + aero term`；前項 `aeroF/20`，後項 `aeroR/50`。以讀到的載重僅加 +8.8／+3.1 kgf/mm，再由未知 range clamp | 17.59 / 16.61 kgf/mm；range 未核對 |
| ride height | 前後 `min + 1.5 cm`，再 clamp | 未可從可信 slider limits 比較 |
| damping | rebound `19W+1` = 11.6 / 9.4；bump = rebound × 0.60 = 7.0 / 5.6 | 12.4 / 11.1；7.7 / 6.9 |
| differential | front 15/0，rear 75/15，`centerRear=clamp(Wr+20,60,85)=64` | front 30/10，rear 55/13，center 90 |

這些算術一致，但不等於性能正確。最先應處理的是可由程式本身證明的「未知 input 被當作物理 input」問題；其餘極端 AWD 配方應維持受控實車假說。

## 證據分級

| 等級 | 可用於什麼 | 不可用於什麼 |
|---|---|---|
| 車輛動力學一手／專業工程 | 判斷模型至少需要哪些量：wheel rate、motion ratio、track、CoG／roll-centre、aero map、damper velocity。 | 證明 FH6 slider 的數字等於真車 N/m、Nm/deg 或某一最佳值。 |
| FH6 官方 | 固定遊戲版本並追蹤官方承認的 physics 變動。2026-09-07 notes 對應 Series 5：Xbox/Windows 3.440.853.0、Steam 1.440.853.0；2026-06-15 notes 明示 Drag Tire 的 cornering physics 曾改動。 | 推出 ARB、diff、spring、aero slider 方程式；官方未公開這些數值。 |
| FH6 社群／原始玩家經驗 | 產生 candidate fixture 與 A/B 問題。 | 將單一作者的通用起點、share code 或體感變成跨車 production 常數。 |
| FH5／Motorsport 繼承 | 保留「輪胎、載重轉移、扭矩分配會耦合」等模型形式。 | 假定 FH5 的 1/65 或 diff 值在 FH6 仍然為真。 |
| 本車 capture | 在已知 build、路線、零件、assist、控制方式下升格特定結論。 | 目前沒有；單元測試、靜態畫面、模擬面板和公式自洽都不算。 |

## 項目稽核與處置

| 項目 | 現行公式／來源支撐 | 矛盾或反例 | 重要性與處置 |
|---|---|---|---|
| 極軟前 ARB／硬後 ARB | legacy AWD 固定前約 3.2、後 50；developer 有明示可選 `1/65` prior。FH6 社群確有 1/65 候選：一篇 2026-07 起點直接列 AWD 1/65，另一篇較完整指南也提出「前軟／後硬」以減少推頭。工程上，軟前或硬後都會把 lateral load transfer distribution 往後移，通常增加 rotation；這個方向本身合理。 | 工程量不是前／後靜態配重的線性函數。ARB roll stiffness 還依 track、bar rate、motion ratio、spring wheel rate、roll centre 和 tyre load sensitivity；極端 rear bar 也會降低單輪越過路肩／顛簸時的抓地。社群自己同時把它稱為起點、要求依車微調；FH6 有 1/65，也有較中性 ARB 與不同 diff 的成功說法。 | **P1，實車假說。** 不應因缺少引用直接刪除，但 UI／文件不應稱「物理公式」或 universal meta。先以原調校 9.5/50 對 3.2/50，再做 1/65；固定其餘輸入，量測轉向中段 lateral slip、輪胎溫度、路肩穩定和圈時。若保留公式，至少標作 `FH6 AWD rotation prior`。 |
| 靜態配重線性 springs／ARB／damping | springs 以 axle static weight 在線性插值；rebound 以 `19W+1`；ARB 的 AWD 特例也只讀 `Wf/Wr`。社群常用「slider span × axle weight + min」和 bump ≈ 60% rebound，故可作 FH6 社群 baseline。 | 靜態 axle weight 沒有 sprung/unsprung mass、motion ratio、wheel rate、track、CoG height、roll-centre、輪胎剛性或行程；動態煞車／加速／aero 的 axle load 也沒有進入式子。工程上 damping 由 displacement **velocity** 產生力，且 bump/rebound 分別影響入彎／出彎的 transient load transfer，不能由靜態重量唯一決定。 | **P0 對可證明缺陷，P1 對數值。** 立即改正的不是常數，而是輸入狀態：當 slider min/max 是 stale／unknown，禁止把 fallback 10–120 kgf/mm、10–25 cm 顯示成此車推薦值；輸出須標示 `range fallback` 或阻擋算牌。線性 weight formula 可暫留為 prior，數值只能靠 instrumented A/B 校準。 |
| 空力加彈簧 | `resolveAeroDownforce()` 會保留已捕獲正值；Road spring 加 `front kgf/20`、`rear kgf/50`。正方向合理：高速 downforce 會壓縮懸吊，確需在設計 ride-height window 內支撐。 | 缺少下壓對速度的曲線、reference speed、翼／底板的 ride-height aero map、行程、wheel rate、bump-stop 和 axle load distribution；同一 175.5 kgf 若在不同速度讀取，應不是同一需求。前後分母不同也沒有來源。將 0／缺值和「可調」混用時，legacy 會由車重 20% 合成下壓，這是未校準假設。 | **P0。** 這是應提前解決的可證明模型／語意問題：帶進 spring 的 aero 必須同時有 value、單位、讀取／參考速度和可調狀態；否則不要產生數值補償。Dark Horse 有正值但沒有速度，故只能當 sensitivity fixture，不能判其 +8.8／+3.1 正確。developer path 已會在缺 aero state 時警告 stock assumption，卻仍不能補足速度資料。 |
| ride height | legacy 固定 `min+3 clicks`（程式硬定 0.5 cm，故 +1.5 cm），完全不讀 aero、速度、行程或底觸。低 ride height 可減少 CoG 高度、也可能利於某些 aero platform，是可理解的起點。 | 真車 ride height 是行程、底觸、pitch/heave、路面、aero map 的結果；「每 click 0.5 cm」亦未由本車 slider capture 證明。工程資料指出 springs 改動會改 dynamic ride height/aero balance，故將 height 與 springs 分別固定是互相矛盾的簡化。 | **P0（capability／單位）、P1（性能）。** 先把 click size 改為由 slider range／step 推導或標 unknown；無 range 時不可暗示 +1.5 cm 是可套用本車值。以 suspension travel、bottoming、high-speed stability 的 telemetry 做單變量測試。 |
| central、front、rear differential | legacy AWD 為 15/0、75/15、rear 60–85%（Dark Horse 64%）。方向上，後偏與較低 front lock 可減輕 AWD power-on understeer；FH6 社群也常建議增加 rear bias，且提出 70% 或 100/0、100/4 等極端候選。 | 中央配比的角色是前後 axle torque split，不等於前／後 diff lock；兩者同時影響 exit yaw、各輪 traction 和熱。`Wr+20` 把靜態後重直接映射為 60–85%，反而對前重 56% Dark Horse 從原 90% 拉到 64%，沒有扭矩、輪胎、加速、轉向角、route 或 slip 依據。FH6 社群對 front/rear accel/decel 值分歧很大，且有人明言本代值與真實直覺不一致。 | **P1，高風險假說。** 不要以真車 AWD 控制律替遊戲值背書。先分開 A/B：center 90 vs 64（其餘固定），再 front accel 30 vs 15、rear accel 55 vs 75；記錄 exit wheel slip、yaw/steering correction、可重複 sector time。未量測前，應將 central result 標 `weight-bias prior`，不宣稱為最佳牽引設定。 |
| AEGO 驅動假設 | Road chassis 公式不讀 AEGO gearing。一般 UI 的 AEGO 以 AWD 後胎名義半徑作 driven-tire 幾何，且現行量測工作流已將 observed peak/max RPM 與 static profile frozen；這是傳動幾何，而非 chassis 證據。 | 輪胎半徑／gear ratio 可支持 RPM-speed 關係，不能支持 ARB、spring、aero 或 differential 值。完整加速／出彎還受 gear、power curve、center diff 與 slip 耦合；若以 AEGO terminal speed 推導底盤結果，會犯因果倒置。 | **P2。** 保持 AEGO 與 chassis audit 分開。若做 Dark Horse A/B，固定齒比、終點 RPM／速度目標與換檔策略；先驗證 center split，再討論 gearing。 |

## 可執行但不改常數的最小驗證

所有 run 固定 FH6 build、Dark Horse ordinal／PI、完整零件、胎壓與尺寸、空力 slider、assist、控制器、天氣、交通狀態、同一路線與起步。每組 warm-up 後取 3 個有效 run；碰撞、失控或交通干擾要保留為無效原因，不能只挑最快一圈。

1. **ARB**：原 9.5/50 → legacy 3.2/50 → 1/65；其餘不動。看 sector/lap time、steady-corner slip、輪胎溫度、路肩後修正和尾部失控率。
2. **中央差速器**：90% → 64%，其餘 diff、ARB、spring 不動。看 power-on exit wheel slip、轉向修正、terminal speed 和同一 segment time。
3. **空力／spring**：先讀各軸 slider bounds、downforce value 的 speed／畫面語意及 suspension travel。沒有這些 metadata 時只做「不套 aero compensation」對「目前 candidate」的單因子比較，不試圖替換分母。
4. **damping／height**：先以原 12.4/11.1、7.7/6.9 和 legacy 11.6/9.4、7.0/5.6 分開測，勿和 ARB 同時改；記錄 entry transient、bottoming／travel、路面衝擊和出彎收斂。

若三次的 driver variation 蓋過候選差異，結論必須是 `inconclusive`。即使某組勝出，也只可升格為此車、此 build、此 route 的 capture evidence，不能回填全車 AWD 公式。

## 可追溯來源

### 工程／專業資料

- [OptimumG, Bar Talk](https://optimumg.com/bar-talk/)（2024-10-08；2026-09-09 檢索）：ARB roll stiffness 需要 track、spring／bar rate 與 motion ratio；總 roll stiffness 是 springs 與 ARBs 的組合，支持「不能由靜態配重單獨求出」的判斷。
- [OptimumG, Vehicle Setup and Kinematics Q&A](https://optimumg.com/vehicle-setup-and-kinematics-qa-series/)（頁面未標示發布日；2026-09-09 檢索）：ARB 可較隔離地改 mechanical balance，但過硬 ARB 在單輪 bump／kerb 會犧牲 traction；dampers 改變 transient load transfer。
- [Racecar Engineering, Springs and Dampers](https://www.racecar-engineering.com/tech-explained/springs-and-dampers/)（頁面未標示發布日；2026-09-09 檢索）：damper force 與位移速率相關，bump/rebound 的 transient 角色不同；高空力下 spring/damper 需要依 aero platform 和低速 mechanical grip 的取捨決定。

### FH6 官方、社群與反例

- [FH6 Release Notes, 2026-06-15](https://support.forza.net/hc/en-us/articles/52554154006547-FH6-Release-Notes-June-15th-2026)：Drag Tire cornering physics 的已知版本變更；它沒有調校方程式。
- [FH6 Release Notes, 2026-09-07](https://support.forza.net/hc/en-us/articles/55121247584915-FH6-Release-Notes-September-7-2026)：Series 5 build metadata；未公告 tuning 數值模型。
- [r/ForzaHorizon6: AWD & RWD tuning guide](https://www.reddit.com/r/ForzaHorizon6/comments/1tnsf1x/forza_tuning_guide_awd_rwd/)（2026-05-26）：支援 weight-based slider baseline、bump 60%、後偏 AWD 與「一次改一項」作為社群 workflow；回覆也承認 extreme diff 受遊戲行為與輸入裝置影響，故屬假說。
- [r/ForzaHorizon6: Great tuning start guide](https://www.reddit.com/r/ForzaHorizon6/comments/1uraya7/great_tuning_start_guide/)（2026-07-09）：直接提出 AWD 1/65、70% center 與高前 aero 的候選；作者定位為個人／彙整起點，不能證明 universal formula。
- [r/ForzaHorizon6: why popular street tunes use AWD](https://www.reddit.com/r/ForzaHorizon6/comments/1vlh9eh/why-does-every-popular-street-tune-get-rid-of-rwd/)（約 2026-08，2026-09-09 檢索）：一則將 AWD meta 歸因於 exit／straight-line 優勢，另一則反駁並指出 route 依賴 handling；這是「不能只用單一 meta 敘事」的反例，而非性能量測。
- [FH6 aero evidence](fh6-aero-meta-evidence.md)（本 repo，2026-09-09）：已整理 FH6 逐車 aero capability、前高／後補穩定的社群慣例與反例；此審計沿用其證據等級，未把它提升為官方規格。

## 證據缺口

尚缺：FH6 對各 slider unit／step／range、downforce 參考速度或 aero map、differential control semantics 的官方規格；Dark Horse 現車可信 spring／height bounds、下壓力讀值的速度語意；以及固定條件、完整 telemetry、至少 3+3 有效 run 的原始 A/B captures。這些缺口使本文件能指出目前公式的輸入與模型矛盾，卻不能誠實地指定哪一個新常數會更快。
