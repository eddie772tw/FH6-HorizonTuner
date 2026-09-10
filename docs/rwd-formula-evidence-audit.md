# RWD Road/Circuit 算牌：工程與 Forza 證據稽核

日期：2026-09-09。範圍限於目前一般調校精靈實際呼叫的 Road/Circuit 路徑，目標是辨識在 RWD 實車 A/B 之前必須明示或優先驗證的矛盾；不修改公式、不把工程模型當作 FH6 已知物理，也不把 FH5／Motorsport 的社群起點移植成 FH6 真值。

## 結論先行

目前的 RWD 輸出可作為 **未校準的起始候選**，不能稱為 RWD 已驗證公式。最先應處理的不是先調整某個常數，而是把下列五個可證偽缺口留在校準計畫中：

1. Road RWD 的 ARB、彈簧、車高、阻尼都沒有 RWD 專屬項；只有後差速器與 AEGO 一檔速度假設依驅動形式改變。
2. `前硬後軟適合 RWD` 只是一種可能的高功率出彎穩定性方向。後軸較硬會傾向失去橫向抓地，後軸較軟又可能耗盡行程；兩者取決於輪胎、路面、行程、空力、功率與彎段，不能由靜態配重單獨推出。
3. 空力加彈簧的現行式沒有參考速度、可用行程、輪率或 ride-height aero map，且在相同滑桿範圍／配重／空力下不讀車重。程式可立即證明的是這些敏感度沒有顯式輸入；這不足以單獨證明輸出錯誤，因為遊戲的 spring slider range 可能已隱含部分尺度，仍須實車校準。
4. `bump = rebound × 0.60` 是固定 slider 比例，沒有由簧上／簧下質量、wheel rate、目標阻尼比或路面頻譜導出；它可當起始值，不能宣稱是 RWD 阻尼結論。
5. RWD 後差速器 `40–65% accel、20% decel` 與 AEGO Road 的固定一檔目標 `kDrive=1.15`（103.5 km/h）都有「RWD 與 AWD／FWD 分開起始」的意圖，但都未接收輪胎可用牽引、實際加速度、後軸動態輪荷、滑移或賽道速度，故不能預測哪一台 RWD 會需要更高或更低鎖定／更長或更短一檔。`fDrive=0.6` 只在 AEGO Drift FD 路徑使用，並非 Road launch factor。

## 實際 UI 路徑與程式事實

`frontend/src/features/tuning/TuningView.tsx` 會把準備完成的 static profile 轉成 `toTuningCarParams(...)`，再直接呼叫 `calculateChassisTuning(selectedRaceGoal, solverCarParams)` 與 `calculateAEGOGearing(...)`。所以本文件的「現行」是 `frontend/src/utils/tuningMath.ts`，不是 `TuningView_dev.tsx`、`tuningMath_dev.ts` 或 `frontend/src/domain/tuning/`；後三者的畫面也自稱 experimental，不能拿它們的頻率／critical-damping 模型替 legacy UI 背書。

Road/Circuit 的 RWD 實際輸出為：

| 元件 | 現行式／輸入 | RWD 專屬程度 | 直接事實 |
|---|---|---|---|
| ARB | `front=64×wf+1`；`rear=64×wr+1`，皆 clamp 1–65 | 無；FWD 同式，僅 AWD 是獨立低前／高後分支 | 例如 57/43 車是 37.5/28.5，並非「前硬後軟」的 RWD 策略。 |
| 彈簧 | `baseF=kMinF+(kMaxF-kMinF)×wf`；後同式；再加 `aeroF/20`、`aeroR/50` | 無；FWD、RWD、AWD 共用 | `weight` 不在 Road base spring 式中；結果強烈取決於每台遊戲滑桿範圍。 |
| 車高 | 前、後均 `min + 1.5 cm`，再各自 clamp | 無 | 不讀速度、行程、路面、空力或 RWD。 |
| 阻尼 | `reboundF=19×wf+1`，後同式；兩軸 `bump=rebound×0.60` | 無 | 不讀 spring、車重、行程、輪胎、速度或路面。 |
| 後差速器 | `accelR=clamp(40+(wr-50)×0.5,40,65)`；`decelR=20` | 有，但只讀靜態後配重 | 50–100% 靜態後配重只輸出 40–65%；decel 永遠 20。 |
| AEGO Road 一檔 | `v1=90×1.15=103.5 km/h`（RWD）；AWD 76.5、FWD 94.5；以 peak-HP RPM、名義驅動輪周長與 FD 求一檔 | 有 | `fDrive=0.6` 在 Road 分支不參與計算；它在 Drift FD 才被讀取。Road 的 RWD 假設實際是固定 `kDrive=1.15`。 |
| AEGO 頂檔 | `vCircuit=.95×37×hp^(1/3)×(1+.12×aeroEfficiency)`，以 peak-HP RPM 與名義輪胎周長求總傳動比 | 無 RWD 專屬項 | 顯式賽事速度／RPM 可覆寫作運動學 fit；其餘仍是 legacy 經驗 prior，並非性能預測。 |

`resolveAeroDownforce` 的 RWD 特例是比率乘數 `0.82`：在缺少某軸數值、且該軸可調時，推導較多後軸下壓力；兩軸都未知時，假設總下壓力等於車重的 20%。這是輸入補值規則，不是實測 RWD aero map。固定／不可調軸的未知值現在保留為 0，這比虛構載荷更誠實，但也表示 Road 彈簧可能在實際有固定翼時完全沒有空力補償。

## 對照資料的權重與版本邊界

| 層級 | 資料 | 可支持 | 不能支持 |
|---|---|---|---|
| 工程一手／專業 | [OptimumG *Springs & Dampers Part Two*](https://optimumg.com/wp-content/uploads/2020/01/SpringsDampers_Tech_Tip_2.pdf)，2020；[Racecar Engineering quarter-car aero model](https://www.racecar-engineering.com/news/simulating-porpoising-on-a-quarter-car-suspension-model/)，2021 | wheel rate 與 spring rate 要經 motion ratio 區分；ARB roll rate 還受 track、輪胎率、ARB motion ratio 與底盤扭轉影響。下壓力可隨速度平方且受車高影響。 | FH6 slider 對應到 N/m、實際 motion ratio、aero map 或最佳 FH6 數字。 |
| 官方 Forza | [Forza Support 的 FM7 Tune Setup](https://support.forzamotorsport.net/hc/en-us/articles/360005422133-FM7-Tune-Setup-and-Setup-Managment) | FM7 的前／後 ARB、spring、ride height、bump/rebound、aero、diff 是獨立調整族；這只可確認舊作控制語意。 | FH6 的 numeric slider 範圍、物理係數、FM7 直接可遷移性或 meta。 |
| FH6 社群（可重讀、非官方） | [ForzaTune FH6/Motorsport guide](https://forzatune.com/guide/the-fully-updated-forza-tuning-guide/)，本輪查閱 2026-09-09；[Forza Guide FH6](https://forza.guide/)，本輪查閱 2026-09-09 | RWD rear accel 約 40–60%、decel 約 20–40% 是一個可測起點；高功率 RWD 可先嘗試較軟後 ARB 以抑制 power-on snap。指南也明說 ARB 難以精算、軟彈簧有 bottoming 代價。 | 同一組 slider 適用每台 RWD，或該建議等同 FH6 官方／圈速 meta 證明。 |
| 舊作／其他遊戲社群 | [FH5 Steam guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2911040132)；[Forza Motorsport notes](https://gist.github.com/SharpSeeEr/43cef65cf1cc6e97173ed6fb6640dc8c) | 可提供相反的可檢驗起始方案：前低後高 ARB 促旋轉；RWD 的 40/1 極端甚至被列為可能。 | 它們是 FH5／Motorsport，不是 FH6 證據；更不能和上述「高功率 RWD 後軟」混成普遍定律。 |

因此「前硬後軟」有兩層不同命題，必須拆開：工程上，若後軸相對較軟，可能減少該軸側傾剛度與輪荷變化，協助 power-on 穩定；遊戲社群上，高功率 RWD 的確常以較軟後 ARB 作為處方。反例同樣明確：為減少轉向不足而降低前 ARB／提高後 ARB 是常見調整，Motorsport 社群甚至列 40/1 RWD 可行。兩者可同時成立，因為症狀、路面、輪胎、彎段與已用設定不同；它們否定的是一條無條件公式，不是否定任何一台車採前硬後軟的可能。

## 逐項矛盾、重要性與可證偽方式

| 項目 | 現行公式的支撐 | 矛盾或缺失 | 重要性 | 現在能證明／仍待實車 |
|---|---|---|---|---|
| RWD ARB 與「前硬後軟」 | 靜態配重是合理的初始資訊；社群承認 RWD exit 過度時可軟後 ARB。 | 公式僅跟 `wf/wr` 同向配置，57/43 反而前高後低，但 50/50 是相等；未讀功率、路面、輪胎、行程、前後 track／wheel rate，也沒有 RWD 分支。工程上 spring rate 不能直接代表 axle roll stiffness。 | P0 | **立即**：讀碼可證無 RWD 項、亦無幾何項。**待測**：同車出彎過度是否因後 ARB，而非 diff、油門或輪胎。 |
| Springs、靜態配重與未知 motion ratio | 較重端通常需要更多靜態支撐；遊戲滑桿上下限是可觀測輸入。 | `baseSpring` 用 range 位置取代 sprung mass／natural frequency；同配重及 range 的 900 kg 與 1,800 kg 得相同值。前後 spring slider 也不能直接加總為 roll stiffness。 | P0 | **立即**：上述同輸入、不同重量的代數反例成立。**待測**：遊戲 range 是否已隱含足夠縮放；不可要求使用者提供未知 motion ratio。 |
| Aero 加 spring | 較高下壓力確實會壓縮懸吊；RWD 後軸偏多下壓力可作待驗證先驗。 | 常數 `aeroF/20`、`aeroR/50` 沒有單位推導，且不讀參考速度、車高、剩餘行程、wheel rate。下壓力以速度平方變化，靜態常數不能表達對速度的顯式敏感度。 | P0 | **立即**：缺少上述欄位與速度敏感度可由函式簽名及式子證明；這不等於立即證明候選輸出錯誤，因 slider range 或經驗常數可能隱含部分尺度。**待測**：以同車、同翼、不同速度段的行程／底觸訊號檢驗補償方向。 |
| 固定 60% bump/rebound | 社群常把 bump 設低於 rebound，ForzaTune 也提到約三分之二是一個手動起點。 | 「低於」不推出每軸精確 0.60；現式沒有 spring／unsprung mass／頻率／kerb 或路面輸入，也不隨 RWD traction event 改變。阻尼調的是暫態，不會把靜態 load transfer 消失。 | P1 | **立即**：所有輸入固定比例。**待測**：對同一路段的 oscillation、kerb、行程貼邊與入／出彎姿態做單軸小步 A/B。 |
| RWD accel/decel diff | FH6/Motorsport 社群 40–60 accel、20–40 decel 可支持 40–65／20 作為中性候選。 | accel 只隨靜態後配重變 0–15 點；車重、扭力、檔位、輪胎、速度、坡度、aero、actual slip 都不讀。工程上加速會使後軸增載，有利牽引；同時後輪要提供縱向力，會減少可用橫向力，因此不能由「RWD」決定鎖定方向。 | P0 | **立即**：輸入不含牽引／滑移與動態載荷。**待測**：用 power-on exit 分組，比較 rear wheel RAT/ANG/CombinedSlip、油門、檔位與速度，不能僅看總圈速。 |
| Road 車高 | 較低 CG 可能減少車身運動；保留 1.5 cm 行程可作保守起點。 | 固定加三 clicks 不讀最低點、有效行程、kerb、車速／aero 或 pitch；RWD 沒有特例。太低可 bottom out，太高又改變姿態與 aero。 | P1 | **立即**：常數 click。**待測**：同一路段 suspension travel 接近界限的幀率、車身失穩與速度；不能把 normalized travel 當實際毫米。 |
| AEGO RWD 驅動假設 | 名義輪周長與 RPM—speed 的傳動學關係是正確的運動學骨架；明確 event speed/RPM fit 能被遊戲面板直接核對。 | Road 的 RWD 差異只有固定 103.5 km/h 一檔目標；`fDrive=.6` 並未被 Road 分支使用。`hp^(1/3)` 速度、`aeroEfficiency` 乘數與 top-gear anchor 未含 CdA、滾阻、實測 shift recovery 或牽引。 | P1（底盤前不應混測） | **立即**：資料流可證 `fDrive` 未讀。**待測**：固定底盤後，以實際 event top speed／終點 RPM／換檔後轉速及 wheel slip 比較。 |

### 為何 load transfer 不是「後彈簧要硬／軟」的直接證明

加速時，載荷由前軸往後軸轉移；後驅在抓地受限時因後軸法向載荷增加而有更多縱向牽引潛力。[*Performance Vehicle Dynamics* 的公開章節摘要](https://www.sciencedirect.com/science/article/pii/B9780128126936000031) 同時指出，懸吊硬度不會改變這個準靜態轉移總量，只改變達到平衡所需的位移。可是 power-on corner 的後胎還要分配縱向與橫向能力，故可能因驅動力而較易過度；這就是同一 RWD 為何既可能需要後軟以穩定，也可能需要更高後側傾剛度來改善另一類彎中不足。現行模型沒有縱向／橫向 combined-slip 或速度分段，不能替這兩種情境選一邊。

## 建議 RWD 選車與少量單變量起點

尚未選定 RWD 測試車，且 Dark Horse 已確認為 AWD，不能作 RWD 實測或替 RWD 公式背書。從實際車庫選一台後，先以遊戲畫面和 telemetry profile **共同確認當前改裝後 drivetrain=RWD**，再確認 race suspension、前後 ARB、後 diff 是否可調，以及前／後 spring/height range 和翼的實際可調／固定狀態。優先選與 Integra 比較接近的 Road/Circuit 用途、PI、胎種與場地；這是減少混雜，不是假定兩車可以直接比圈速。

不要求玩家猜 motion ratio、CG height、wheelbase 或 aero reference speed。第一輪只記錄遊戲可見值與既有遙測：車／改裝／PI／胎種、驅動型式、slider range 與原設定、翼值／可調性、場地／天候／輔助、每趟完整成績、同一空間區段的速度與時間、油門／制動／檔位／RPM、逐輪 normalized ANG/RAT/CombinedSlip、suspension travel。這些值不足以反推物理常數，但足以否定明顯不穩定的候選。

最小試驗序列（所有其他 sliders、改裝、路線、天候、輔助固定；原設定與候選交替，至少各三趟）：

1. **Baseline vs 現行 Road 候選整套**：只建立差異地圖，不能歸因到任一 slider。
2. 回到較快／較穩的一組，**只改 rear ARB 小步兩個方向**（例如以實際 slider 可用精度各 ±一小步）。在穩定 mid-corner 與 power-on exit 分開看；若出彎 RAT/CombinedSlip 變好但油門或速度變低，不判作抓地改善。
3. 回到同一 anchor，**只改 rear diff accel 小步兩個方向**；維持 decel。以相同檔位、相近油門和速度窗的 rear driven-wheel 訊號與 exit time 判讀。
4. 若仍有明確底觸／行程不足或 kerb oscillation，才做 **一個 axle 的 spring 或車高單變量**；空力補償另立假說，不能把手動 spring 改動誤稱為驗證 `aero/20` 或 `aero/50`。
5. 阻尼最後做，先只動一軸的 rebound 或 bump；不得同時以固定 60% 比例改四個值，否則不能辨識 transient 改善來源。

若同一 RWD 在重複 A/B 中，現行 ARB／diff 方向反覆失敗，優先把它登錄為車、胎、路面和功率條件下的反例；累積不同 RWD 車在相同可觀測特徵下才考慮更換模型。任何公式替換仍須把「已在 FH6 實測」與「工程上較完整、但參數尚不可辨識」分開。

## 本輪證據缺口

- 沒有選定且確認為 RWD 的 FH6 實測車，沒有實際 A/B，故沒有任何 RWD slider、圈速或 telemetry 結論。
- 沒有 FH6 官方公開的 spring／ARB／damper／diff slider 物理映射、motion ratio、CG、wheelbase、輪胎 load sensitivity、aero reference speed 或 ride-height aero map。
- FH6 社群來源能支持「按症狀微調」與少量起始範圍，彼此又包含方向相反的建議；它們沒有披露可重現的車、版本、改裝、輸入與遙測，不能校正目前常數。
- FH5、FM7 和 Motorsport 資料在本文只作控制語意或反例來源。即使 slider 名稱相近，也不主張 FH6 物理或 meta 相同。

本文件不以缺少引用直接宣告現行公式錯誤；它列出哪些命題已可由程式代數反駁、哪些仍必須由受控 FH6 實車證偽，避免將工程常識、社群慣例與遊戲真值混為一層。
