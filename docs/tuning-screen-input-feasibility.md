# FH6 調校畫面輸入可行性評估

日期：2026-09-09
範圍：評估 FH6 調校畫面的左側模擬／測量面板及右下 transmission preview，是否能減少 AEGO 與算牌要求玩家手量或猜測的資料。本文只依本機唯讀抄錄、現有程式與文件判讀；未操作遊戲、未寫入調校，亦未將單車資料用來校準公式。

## 結論

可以，而且應分成兩條資料路徑。

1. **中間齒比滑桿的文字齒比**與升級頁的靜態輪胎尺寸是高價值、可人工抄錄且能直接驗證的基線。它們能取代目前車輛 profile 的終傳、檔數、個別檔比、輪胎幾何等缺漏，讓 AEGO 的候選結果能先和「目前裝在車上的傳動」比較；這些資料不在右下 transmission preview 本身。
2. **左側面板的數字**適合作為有來源的遊戲內 *simulation reference*：顯示、候選前後的靜態比較、以及建立後續實測假說。它不能成為遙測的替代品，也不該直接回灌成 `targetRpm`、峰值功率轉速、輪胎抓地、空力常數或泛用公式校準。
3. **右下 transmission preview**只保存原圖作傳動設定的人工參考，暫不以曲線、粉紅 redline 或座標反推 RPM、齒比、speed cap 或可達極速。圖上只有 RPM x1000 `0, 4, 9` 與 mph `0, 107, 215` 軸標；最新 MCP 已讀得同車 `EngineMaxRpm = 9499.995`、ordinal `3847`，說明 `9` 軸標不是 max RPM 的精確讀值。
4. 首階段應實作為「**安全導覽＋截圖＋OCR 靜態草稿＋使用者覆核**」。它只導入畫面明示的靜態車輛資料，從不直接改算牌或遊戲。每欄必須保留原文、單位、來源頁、截圖、擷取時間、OCR 信心及覆核狀態。完成 telemetry-first 的有效 sweep 後，仍由 `EngineMaxRpm`、有效功率／扭力樣本及已知車輛 identity 決定正式動態量；遊戲報告的空力效率可在此前作為有來源的 heuristic 實驗輸入，但不覆寫量測欄位。

Dark Horse 只是一個 feasibility fixture，不是公式目標：2024 Ford Mustang Dark Horse、S1 800、AWD、832 hp、640 ft·lb、3,864 lb、前重 56%、機械增壓；前 325/25R20、後 335/25R20；FD 3.21、七檔 `4.17 / 2.93 / 2.12 / 1.64 / 1.33 / 1.10 / 0.95`。任何候選仍須在相同車、零件、版本、路面、輔助和 event 下，以 baseline/candidate 的重複 telemetry 或完整 capture 驗證。

## 現有公式與資料契約

目前 legacy `calculateAEGOGearing` 以輪胎名義半徑、`maxRpm`、`maxHpRpm`、車重、驅動、輪胎類型及部分 `aeroEfficiency` 等欄位產生候選。其傳動學核心為：

```text
v(km/h) = RPM × C(m) × 60 / (gear × FD × 1000)
RPM = v(m/s) × gear × FD × 60 / (2πr)
```

進階 event 校正要求 `targetSpeedKmh` 和 `targetRpm` 同時存在，先調 FD，再在 FD 夾限時等比例調整檔比；結果另回傳 `matched`、`limited` 或 `invalid`。這是運動學 fit，不代表引擎有足夠功率克服阻力而能到該速度。自動工作流刻意忽略舊的 `simulatedTopSpeed` 和 `softMaxSpeed`，並要求有效全油門遙測取得引擎上限與峰值樣本，以避免把預覽圖軸或一次行駛最高速度偽裝成賽事目標。

對 Road，legacy 目標速度包含 `vTarget = 37 × hp^(1/3) × (1 + 0.12 × aeroEfficiency)`，之後再乘 `kTrack = 0.95`；Drag 的 `vDragTop` 也含相同 `(1 + 0.12 × aeroEfficiency)` 項。這使遊戲面板的 `0.738` 成為比預設 `.5` 更可追溯的 **實驗輸入候選**，而不是要求使用者繼續猜值。它不證明畫面欄位與這個 solver 係數在物理上同義，也不證明 `0.12` 或任何其他 legacy 常數已校準。

| `aeroEfficiency` 輸入 | 乘數 `1 + .12E` | 相對 `.5` 的速度項變化 | 對 FD／總傳動比的直接方向（其他輸入固定） |
|---:|---:|---:|---|
| 預設 prior `.500` | `1.06000` | baseline | baseline |
| 既有 profile `.680` | `1.08160` | `+2.04%` | 約 `-2.00%`（較長） |
| 遊戲面板 `.738` | `1.08856` | `+2.69%` | 約 `-2.62%`（較長） |

上表只描述目前公式的局部敏感度：因目標總傳動比與目標速度成反比，數字是 `1.06000 / multiplier - 1` 的近似結果；FD clamp、gear rounding、選擇的 top gear 與其他 profile 分支會改變最終候選。正確 UX 是讓使用者選擇 `profile prior (.680)`、`game-reported candidate (.738)` 或手動研究值，顯示其來源並把 A/B 結果保留；不可把 `.738` 靜默宣稱為泛用物理效率或 production calibration。

現有 legacy Road／Drag 內仍有未校準的功率、空力、抓地與檔位間距 prior；Drag 前四檔限制也仍是 legacy 相容行為。因此，畫面值可以約束輸入與比對輸出，不能以「solver 對齊畫面」作為 solver 已校準的循環證明。

## 欄位逐項判讀

| 畫面欄位 | 已抄錄值 | 可否進現有公式／工作流 | 可替代或減少的人工輸入 | 不可推得的量與風險 | 建議來源等級 |
|---|---:|---|---|---|---|
| 終傳、1–7 檔比（中間齒比滑桿） | `3.21`；`4.17, 2.93, 2.12, 1.64, 1.33, 1.10, .95` | 可。現有運動學可直接以它們計算每檔 RPM/速度與換檔後 RPM。 | 現有 baseline FD、齒數、個別齒比；避免玩家從記憶輸入。 | 不等於 slider min/max/step、可調性或候選值一定能落在遊戲刻度。 | 高：畫面明示文字，仍需逐欄覆核。 |
| 前／後胎尺寸（升級頁） | `325/25R20`／`335/25R20` | 可。AWD 依現有慣例使用後胎尺寸計名義周長。 | `rearTireWidth/aspect/rim`（及顯示用前胎欄）。 | 名義幾何不等於有效滾動周長；輪胎變形、滑移、載重與遊戲內模型未知。 | 高：文字明示；運動學幾何是中等信心。 |
| AWD、車重、前配重、馬力、扭力、增壓型態 | AWD、3864 lb、56%、832 hp、640 ft·lb、Supercharger | 可作靜態 profile，進 legacy prior／底盤輸入。 | 靜態車重、配重、最大 hp／扭力、drivetrain、induction 的手動轉抄。 | 640 ft·lb 是 profile 儲存單位；solver 邊界才換成 Nm。峰值 RPM 不能由此得到。馬力／扭力牌面不等於本次 telemetry power curve。 | 高：畫面文字；單位轉換需明示。 |
| 0–60、0–100 mph | 2.583 s、5.433 s | 不應作正式 solver input。 | 可減少「基線感覺很快」的主觀描述，作 UI baseline reference。 | 是遊戲模擬，不是實測 run；受遊戲模型、設定和改裝影響，不能反推輪胎 μ、起步、shift point 或任何 AEGO 常數。 | 中：明確標為 simulation reference。 |
| 模擬極速 | 194.3 mph | 僅適合 legacy preview comparison；不可在 automatic 模式填成 `targetSpeedKmh`。 | 顯示「遊戲預測極速」基線；在 legacy mode 可由使用者明示選用 `simulatedTopSpeed`。 | 不等於 event 所需速度、圖軸右端、可實際達到速度，亦不知道相對於哪個 RPM／檔位／環境。套用後再以同一面板驗證會形成循環。 | 中：simulation reference，需模式選擇。 |
| 60／100 mph 制動距離 | 71.4／161.5 ft | 現行 AEGO 不接收；底盤／煞車可展示，不能直接校正。 | 可提供候選前後面板差異的 baseline。 | 不能分離煞車、胎、路面、ABS、空力、載重轉移；不是實測制動距離。 | 中：simulation reference。 |
| 60／120 mph 側向 G | 1.24／1.35 | 現行 AEGO 不接收。 | 可作車輛狀態概覽與實測側向 telemetry 假說。 | 兩個速度點不足以得到輪胎曲線、空力曲線或前後 grip distribution；不可反推 `tireGripCoefficients`。 | 中：simulation reference。 |
| 機械平衡 | 0.52 | `TuningCarParams.mechBalance` 有欄位，但目前 AEGO 齒比計算未讀取。 | 未來可保存為遊戲畫面資料、供人工評估差速器／底盤候選。 | 語義與計算方式未被官方或本機 telemetry 驗證；不能把它當前後靜態配重、抓地係數或差速器目標。 | 低至中：名稱與數值可抄，物理語義未知。 |
| 空力平衡 | 0.50 | `aeroBalance` 有欄位，但 AEGO 齒比計算未讀取。 | 可作顯示與候選前後面板比較。 | 不可替代前後下壓力、參考速度或空力分配公式。 | 低至中：語義／基準速度未知。 |
| 空力效率 | 0.738 | legacy AEGO 會讀 `aeroEfficiency`；可作具來源的 experimental heuristic input。 | 可取代無來源 `.5` 猜測，或與既有 profile `.68` 並列選擇。 | 尚未證明畫面語義等於 solver 無因次效率；不能由單一車重校 `0.12` 或 Road／Drag 常數。 | 中：畫面文字強；跨模型映射待驗證。 |
| 圖的 RPM 軸與粉紅線 | x1000 軸 `0,4,9`；粉紅 redline；MCP `EngineMaxRpm=9499.995` | 不進正式輸入；僅保存原圖 reference。 | 讓使用者可在覆核齒比草稿時見到完整畫面脈絡。 | 軸標 `9` 已不能代表同車精確 max RPM；尚不可自動寫入 `maxRpm` 或 `targetRpm`。 | 低：原圖參考。 |
| 圖的 mph 軸與各檔斜線 | mph 軸 `0,107,215`；七條斜線 | 不進正式輸入；僅保存原圖 reference。 | 不增加人工讀取趨勢的成本。 | 右端可能是圖表 domain，不可預設為傳動或功率限制；不生成 `softMaxSpeed`。 | 低：原圖參考。 |

## 非辨識性與循環驗證

左側面板的性能數字是多個未分離因素的結果。相同 0–100、極速、煞車距離或側向 G 可由不同功率曲線、齒比、輪胎、空力、路面、輔助與遊戲模型組合達成；它們不是反解單一參數的獨立方程。尤其以遊戲模擬極速設定齒比，再以同一模擬極速判斷新齒比正確，只證明兩段都依同一遊戲預覽系統運作。

可檢驗的最小主張應更窄：在已知檔比、FD、名義輪胎周長和遙測 RPM 下，`calcGearSpeed` 對低滑移直線的速度誤差是否小於預先註明的調查門檻（現行計畫為 3%）。若超過，優先檢查輪胎有效周長、輪胎尺寸輸入、目前檔位、FD、滑移與取樣時間對齊；不得先修改 AEGO 功率／空力常數來消除誤差。

## 建議分階段方案

### P0：安全靜態畫面導覽、OCR 草稿與人工覆核

尚未實作。建議在車輛輸入頁加入可選的「從 FH6 調校畫面導入」流程，以自動化操作腳本取得靜態資料草稿。每次執行先到已知安全起始頁；逐頁確認目前頁面與鍵盤焦點後，才導航及截圖。禁止盲跑定時按鍵、改動滑桿、套用調校、載入 tune、購買或安裝零件。畫面不符、焦點不明、跨車、欄位缺漏或單位不明時，停止該欄或整個流程，不猜測、不以預設值補齊。

OCR 只辨識畫面明示數字與其頁面單位，產生可編輯草稿，不直接改 profile、solver 或遊戲。草稿以車輛 identity 關聯，至少包含 `CarOrdinal`，並在 identity 不足或與目前車輛不同時拒絕套用。每個欄位保留：原文、解析數值、原始單位與 canonical-unit 換算、來源頁、截圖識別、擷取時間、OCR 信心、`ocr-proposed`／`manual-confirmed`／`rejected`／`unknown` 覆核狀態。OCR 信心只描述辨識器的分數，不是數值正確或語義正確的保證。

在鍵盤友好的車輛參數頁呈現草稿與目前 profile 的逐欄差異，並提供原圖連結／預覽。使用者明確套用已確認欄位後才寫入 profile；未確認欄位仍保持原值或 unknown。建議匯入群組為：

- 傳動：中間齒比滑桿的 FD、檔位陣列與檔數；目前可調性不明可留空。
- 輪胎：升級頁的前／後 `width/aspect/rim`，顯示 AWD 使用後胎作目前 AEGO 名義周長的既有約定。
- 規格：weight、front distribution、hp、torque、drivetrain、induction，並在匯入邊界顯示 lb↔kg、ft·lb↔Nm 的換算結果與原始單位。
- 模擬參考：performance panel 數字和空力效率放在獨立 `simulation` 群組；空力效率可由使用者明確選作 heuristic candidate，其餘數字不與 telemetry `measured` 混為同一欄。
- 原圖參考：transmission preview 原圖與其畫面 metadata 可保留，但不做曲線反推。

P0 的價值是把重複抄寫轉為可回溯的草稿與少量確認，而不是假裝 OCR 已取得真值。確認後保留傳動 baseline，讓產生候選後能列出「原值／候選／差值」。

### P1：靜態匯入的可靠性與拒絕測試

驗收安全導覽的正常與拒絕路徑：安全起始頁成功、每個目標頁確認、焦點遺失、選單意外開啟、畫面文字不符、縮放／語言不同、跨車 identity、缺少 unit、OCR 空字串／歧義字元，以及使用者拒絕或只確認部分欄位。任何失敗都應保持遊戲設定不變、保存最後有效截圖與停止原因，且不得繼續送鍵。

可靠性規則：文字 `3.21`、`4.17` 等有完整字元與固定 label 的欄位可標「候選，高」；`0.738`、平衡、性能數字標「候選，中」。小數齒比、胎尺寸、數字與 unit、前後欄位方向、正負 toe/camber，以及所有會影響 canonical conversion 的欄位，都必須人工確認才可套用。OCR 信心低、頁面／欄位標籤不符或換算前單位不明時，標為 `unknown` 或 `rejected`。不新增第三方 OCR 相依前，先以可重播 fixture 圖、逐欄覆核率、錯誤類型和確認時間衡量價值。

### P2：把已知基線和 telemetry 連接，而非互相覆蓋

完成現有有效 sweep 後，以遙測 `EngineMaxRpm`、RPM／功率／扭力峰值和車輛 identity 建立 measured snapshot。把 P0 齒比與輪胎幾何鎖入同一 snapshot，輸出：

- 各檔在 telemetry redline 與 peak-power RPM 的運動學速度；
- 每次實際 shift 前後的 `RPM_after = RPM_before × G_next / G_current` 預測與觀測差；
- 可用的「車速、檔位、RPM、滑移」樣本下，名義周長誤差診斷；
- 左側 performance panel 僅作 `simulation-reference` 對照，並顯示它與實測最高速度／event 終點速度不是同義詞。

只有此階段可降低使用者手填精確 redline、peak-power RPM 和任意 `targetRpm` 的需求。若賽事的目標速度是使用者知道的 route requirement，仍採進階 event mode，要求 telemetry 或使用者明確提供那個速度點的 RPM；不能由性能面板代填。

### P3：受控驗證與模型 promotion

針對一台車、一個 build、一個 event，固定零件、路面、輔助與 baseline，先只改 FD 或單一齒比，再做至少三次 baseline 與三次 candidate。比較 terminal speed/RPM、換檔後 RPM、事件時間和分散度，保存無效 run 原因。先證明 P0 靜態輸入到 P2 運動學診斷的一致性，才考慮調整任何 model prior；另一車、另一零件或後續 build 的重複結果才有資格支持較廣結論。

## 待驗證假說與判定

| 假說 | 最小證據 | 失敗時的解釋順序 | 不可宣稱的事 |
|---|---|---|---|
| 畫面齒比＋名義後胎周長能預測各檔速度 | 同車低滑移直線 telemetry，已知 FD、gear、RPM、speed；誤差按檔統計 | 輪胎尺寸／單位、active gear、FD、時間對齊、有效周長、滑移 | FH6 transmission physics 或 AEGO 已校準。 |
| 安全導覽＋OCR 草稿能減少靜態資料輸入 | 所有目標頁逐頁確認、零遊戲變更、人工覆核後 profile 與來源畫面一致；記錄部分確認與拒絕案例 | 起始頁、頁面識別、焦點、identity、unit、OCR 字元、確認操作 | OCR 信心代表正確，或自動化可安全套用遊戲調校。 |
| 0.738 可作為 legacy `aeroEfficiency` 的較好先驗 | 固定其他輸入，對比 0.5 與 0.738 的候選，完成受控 A/B，明確定義 event 指標 | simulation 面板語義、速度限制、功率不足、路段差異 | 0.738 是可跨車的物理效率、可直接校準全部 aero 常數。 |
| 左側模擬值能改善候選選擇 | 預先註冊的選擇規則，在獨立 event／重複 run 比對表現 | 面板和實測差異、過擬合單車、候選空間太大 | 面板數字本身就是實測或可反解抓地／阻力。 |
| OCR 足以節省時間且不傷害資料品質 | fixture 集上逐欄人工覆核率、錯誤類型、拒絕率和完成時間 | 字型／語言、縮放、壓縮、遮罩、前後欄混淆 | OCR 讀到即是真值，或可讀取曲線精確數字。 |

## UX 與單位護欄

- 遊戲畫面、Horizon Tuner 全域設定及車輛／調校頁面的 unit override 都可能各自改寫顯示單位；匯入必須以來源頁實際可見 unit 解析，而不能假定繼承全域設定。profile 與 solver 的 canonical 單位保持明示。速度面板可顯示 mph 原文和 km/h 換算，但 `targetSpeedKmh` 在儲存前必須標出來源、原文單位與換算。
- 車重在畫面是 lb，legacy solver input 為 kg；扭力 profile 保存為 ft·lb，只有 solver 邊界轉 Nm。不要把 UI 顯示的數字當成已轉換 solver 值。
- 每個 simulation 值加上「FH6 模擬，非實測」標籤；每個 telemetry 值加樣本／快照 identity。兩者比較時並列，不覆寫。
- 進階 legacy mode 才可選擇把遊戲模擬極速提供為 `simulatedTopSpeed`；選取時顯示它會限制 legacy 候選到模擬參考，且不等於 event target。automatic mode 維持忽略它。
- 空力效率輸入提供 `profile prior (.680)`、`game-reported candidate (.738)` 與手動研究值，並把選用值及來源寫入候選記錄；不把任一選項標為 calibration。
- transmission preview 只以原圖 reference 顯示，暫不數位化曲線。對 redline 預設仍使用 telemetry；對圖軸右端一律不生成 speed cap。

## 實作優先序與限制

優先實作 P0 的安全導覽、截圖、OCR 草稿與鍵盤友好覆核；以 Dark Horse 驗收其靜態來源關聯與拒絕行為，再進入 P2 運動學診斷。這會降低車重、配重、輪胎、齒比、FD 與基礎規格的抄寫負擔，也減少玩家為空力效率填無來源數字的需要，同時保留 telemetry-first 對精確轉速、動力峰值與可實際達到速度的要求。圖形曲線反推不在此方案範圍。

本評估不改變既有「遊戲模擬不是實測」邊界，也不支持以單一 Dark Horse 參數建立 single-car meta。未取得受控 capture 前，所有 legacy AEGO 輸出仍是候選／prior，而不是 FH6 已驗證調校。
