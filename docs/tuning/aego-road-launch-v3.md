# Road launch envelope v3：#462 因果與修正

2026-10-01；PR #460。正式 owner 為 Rust `tuning/gearing.rs`。這是有版本的工程啟發式修正，不是已校準起步抓地、最佳換檔或全車款可駕駛性保證。#462 保持開放；合成案例不是回報者的實車資料。

## 歷史定位（實際執行各 commit 的原始 TypeScript）

使用相同的 #462 合成七速 AWD 輸入、無顯式分配與二次修正，透過 Node 24.19.0 `stripTypeScriptTypes` 執行，沒有重新實作舊公式。完整 SHA／輸出保存在 `tests/fixtures/aego_road_history_462.json`；正常測試不重新生成。

| 版本／PR | 固定輸入結果／角色 |
| --- | --- |
| [v1.6 cd96d86](https://github.com/eddie772tw/FH6-HorizonTuner/commit/cd96d86f017fa43f4f3d429155a08aa77dc74bac) | FD3.99；3.64/2.53/1.82/1.35/1.04/.82/.67 |
| [#397 844ad1b](https://github.com/eddie772tw/FH6-HorizonTuner/commit/844ad1befab41ef06d6d5e4c669fe0982fccea72)、[#412 14f5a1d](https://github.com/eddie772tw/FH6-HorizonTuner/commit/14f5a1dd30cc4f5bd8d2d7302f74cc788ddbfe49) | 同上；量測完成／cutoff 修補不改此固定輸入公式 |
| [#430 9018a57](https://github.com/eddie772tw/FH6-HorizonTuner/commit/9018a579c7f635f4c95200b23b97bbead32ec52e)、[#445 aa40431](https://github.com/eddie772tw/FH6-HorizonTuner/commit/aa40431896b29ab68bb34ab6d33cace659ee817f) | 同上；Twin SSOT 文件及 EV 獨立分流不是本 ICE 退化來源 |
| [#446 c87f05c](https://github.com/eddie772tw/FH6-HorizonTuner/commit/c87f05c6cf5b88104f7bc94a0209951a232b3b96) | 同上；先修 moving loaded-sweep 峰值資格，固定輸入沒有變 |
| [#446 972e9c2](https://github.com/eddie772tw/FH6-HorizonTuner/commit/972e9c2f9a7a3b0bd53c873a024ace64e6815354) | **首次**變成 FD3.78；1/.94/.89/.84/.80/.75/.71；parent c87f05c 尚未出現 |
| [3a187d2](https://github.com/eddie772tw/FH6-HorizonTuner/commit/3a187d2e0024e60ebb3f20a00cb38a72eca88be9)、[0fc20cf](https://github.com/eddie772tw/FH6-HorizonTuner/commit/0fc20cf95750904c6010ddb7028d084098b46ce5)、8f26f60、v1.7 ca195c7 | 維持退化輸出；v3/v4 limiter 證據修補與 EV 整合不是此固定輸入變化來源 |

另以972e9c2的parent所保存18個共同golden輸入實際執行v1.6／972e9c2：8個Road輸出改變、1個Road與9個非Road不變。1200HP／1300Nm／1400kg十速AWD由FD4.41／G1=3.10變成FD3.85／G1=1.00；本v3恢復FD4.41與3.10/2.42/1.92/1.54/1.26/1.05/.88/.76/.66/.58，已納入獨立新模型基線。FWD舊分支風險不能因當時golden未變就當成已驗證可用。

v1.6 無顯式分配 AWD 使用 `90×0.85=76.5 km/h` 的功率峰值一檔速度目標。972e9c2 對所有 Road 車輛改用 `Rload=m×9.81×aG×r/(Tpeak×0.90)` 等式；本例 Rload=3.766、Rtop=2.6733。FD3.99 所需 G1=.94386 不符既有滑桿界限，FD3.78 的 .99630 四捨五入至1.00。高扭力因而直接強制拉長一檔。這與 NaN／前端顯示無關。

v1.6 已對 FWD／**顯式** AWD split 套用 traction cap；照抄這兩個分支會保留類似風險，且缺省與顯式預設分配不同。因此只繼承 speed prior，不回退舊分支或逐檔 clamp。後續量測修補、RWD rearShare=1、共同網格配置、二次修正與無解處理全部保留。

## 選定準則與不宣稱的物理意義

- `Rspeed=peakPowerRpm×C×60/(Vbaseline×1000)`，Vbaseline 沿用 v1.6：AWD76.5、FWD94.5、RWD103.5 km/h。
- `Rload` 保留 #446 的原始軸負載先驗（μ=1、h/L=.20、η=.90）。
- 新啟發式目標 `Rfirst=max(Rspeed,Rload)`：在兩個既有先驗間選較短齒比。低功率案例中 Rload 主導，保留原先縮短效果；高扭力不再讓 Rload 等式強制超過 speed baseline。
- **Rload 不是物理下限**。在假設全峰值扭力同時作用時，它原本近似 traction 上限；選擇 Rspeed 可超出該上限，實際起步可能需油門／離合器控制，也可能打滑。這個選擇優先保留可接近的功率峰值速度先驗，不能推論已達最佳起步或不存在打滑。
- 不是 G1≥某新常數，也不以 G1<1 當通用錯誤條件；既有1.00–6.00等值仍只是本模型的滑桿界限。
- 共同配置器與頂檔目標不變：FD2.00–6.10、0.01網格、嚴格遞減、兩端誤差≤FD×.005；真正無解仍回傳 unsupported／空齒比。二次速度修正不移動起步目標來假裝有解。

## 動力帶與數值診斷

不把 torque-peak RPM 當成低可用轉速，不把 power-peak RPM 當最佳換檔點。既有 raw step .55–.92 經共同縮放後也不是最終動力帶保證；不重新引入 `(powerPeak+50)/redline` 的逐檔上限。

後端新推薦 snapshot 帶 `roadLaunch`：兩個先驗、選定／配置的一檔總減速、功率峰值一檔時速、兩個峰值與有效上限、於有效上限換檔的各檔落點。這些是可審查運動學，不是最佳換檔指令。正式 engine evidence 仍必須 backend-qualified；裸合成峰值不能建立正式推薦。

| 合成七速條件 | v2 | v3 |
| --- | --- | --- |
| 原 powerRPM9023.778 | FD3.78；1/.94/.89/.84/.80/.75/.71 | FD3.99；3.64/2.53/1.82/1.35/1.04/.82/.67 |
| 僅 powerRPM8804.032 | FD3.78；1/.94/.88/.83/.78/.73/.69 | FD3.89；同上七個齒比 |
| 原案例第一檔於功率峰值的時速 | 293.93 km/h | 76.50 km/h |
| 原案例在10000RPM換檔的落點 | 約9375–9524RPM | 約6951–8171RPM |

七速案例落點回到所提供的兩個峰值之間，但不外推為4–10檔、全曲線或實車都在有效動力帶。需要起步RPM、低轉曲線、離合器／油門、滑移與同條件加速實測，才能校準更強的 launch 或 band 可用性規則。

## 版本、回歸與缺口

- 正式 Road：`aego-road-launch-envelope/v3`、`rust/ice-measured-workflow-v2`。非Road ICE與EV版本／公式不變。
- `calculate_aego_gearing_v2` 是明確凍結相容 owner；原21 tuning goldens不改值、不改容差，仍測v2。原10 EV goldens不變。v1持久化依凍結v2重組驗證，不用新公式重寫歷史。
- `aego_road_launch_v3.json` 是獨立的新模型基線，每例說明變動理由；不是覆蓋舊goldens。新前端僅接受後端結果與版本，不新增TS模型。
- 2016組合測試涵蓋FWD/RWD/AWD、4–10檔、500–2100kg、80–4000Nm、缺省/0/70/100% AWD分配：1869可行、147模型無解。這是數值壓力矩陣，部分獨立參數組合未必對應真實引擎。
- Beetle兩個既有齒比goldens、弱引擎與不可行案例不變。Beetle/Pajero原始limiter captures的v4資格／上限不變；Beetle合格峰值帶入既有比較profile後齒比同v2。Pajero沒有完整profile，不補造其實車齒比或宣稱不變。
- 保存／重啟／篡改測試區分新舊model；正式HTTP、Companion relay、CLI、MCP均共用同一workflow。版本不可由前端snapshot指定。歷史Road v1僅允許缺省或v2模型標籤，不得夾帶v3的roadLaunch診斷；非Road/EV會移除不適用的Road保留metadata，保存時拒絕偽造的診斷。
- #446已確認的實車驗收仍屬該次舊候選，不自動涵蓋本修正。#462於2026-10-02已補車型、七速完整齒比與靜態規格（見下節）；仍未提供Step 3動態資料、完整原始輸入／snapshot或起步／加速記錄。未提供新實車性能改善百分比。

## 07b4492 理論覆核（Codex as Codex；Luna as Codex）

覆核對象為 `07b4492c05c4882f014e64238e58fb68e461f6cf`，其中公式修正來自前一提交 `3993f95`，07b4492 本身補歷史 metadata 驗證。以下推導先驗證既有準則的性質；不能從符合 golden 推論公式已經過物理校準。

### 運動學與抓地先驗

令總減速比 `R=FD×G`、輪胎周長 `C=2πr`（m）、轉速 `n`（RPM）、車速 `V`（km/h）。在輪胎純滾動、傳動鎖合的假設下：

```text
V(n,R) = n C 60 / (1000 R)
Rspeed = nPower C 60 / (1000 Vbaseline)
```

`n×C×60` 是 m/h，分母的 `V×1000` 也是 m/h，故總減速比無因次。它只把「功率峰值時的一檔車速」設為歷史目標，沒有推導起步轉速或最佳換檔點。

令前軸靜態配重比例 `f`、後軸驅動力比例 `s`、`x=a/g`、`κ=h/L=.20`。忽略阻力、下壓力與旋轉慣量，假設兩軸保持接地、共同有效輪徑、輪胎 `μ=1`：

```text
Nfront/(mg) = f − κx          Nrear/(mg) = 1 − f + κx
Ffront/(mg) = (1−s)x         Frear/(mg) = sx
(1−s)x ≤ f−κx               sx ≤ 1−f+κx
x ≤ f/(1−s+κ)               x ≤ (1−f)/(s−κ)  [s>κ]
aG = min(1, front bound, rear bound)
```

不驅動的前軸／不產生正上限的後軸分支使用無限大；仍需以上接地等假設，極端配重矩陣並非完整俯仰／抬頭模型。以傳動效率 `η=.90`、引擎扭力 `T`，輪上力 `F=ηTR/r`；令它等於先驗牽引力 `mg aG` 即得：

```text
Rload = mg aG r / (η Tpeak)
```

分子與分母皆為 N·m，量綱正確。但在「全峰值扭力、上述抓地先驗、無滑移」假設下，不等式方向是 `R ≤ Rload`。把它選為較短齒比的目標不是證明新的抓地限制；換成 `min` 也會重新引入高扭力長一檔問題。

### max 規則能證明的範圍

設 `K=nPower C 60/1000`、`A=mg aG r/η`。固定其他輸入、只改峰值扭力 `T>0`：

```text
Rfirst(T) = max(Rspeed, A/T)
Vfirst(nPower) = K/Rfirst = min(Vbaseline, K T/A)
Tcrit = A/Rspeed = mg aG Vbaseline×1000 / (η×120π×nPower)
```

因此未取整的目標有明確保證：功率峰值一檔車速不高於歷史 baseline；低扭力區保持 #446 的 `A/T` 縮短；高扭力區在 `Tcrit` 之後固定為 `Rspeed`，不再無限拉長。這是連續、分段可微的工程準則。輪徑在 `Tcrit` 抵消，不代表抓地與輪胎特性無關，只表示兩個先驗均對有效輪徑線性縮放。FD／齒比取整後仍可能有小幅跳變，不能外推連續目標的性質為每個顯示齒比均嚴格單調。

| 案例（皆為已保存 profile／合成基線） | Rspeed | Rload | Tcrit（Nm） | v3 選擇 | 功率峰值一檔速度（取整前） |
| --- | ---: | ---: | ---: | --- | ---: |
| #462 七速、9023.778 RPM | 14.5236 | 3.7660 | 343.16 | speed | 76.50 km/h |
| 十速 hypercar | 13.6806 | 3.8338 | 364.31 | speed | 76.50 km/h |
| Beetle、3983.44 RPM | 4.5414 | 12.5046 | 436.78 | load | 37.59 km/h |
| Beetle、3365.312 RPM | 3.8367 | 12.5046 | 517.01 | load | 31.76 km/h |
| 弱動力四速基線 | 4.9528 | 38.5971 | 935.16 | load、網格無解 | 13.28 km/h（目標，無配置） |

在 #462 合成條件下，`Rfirst/Rload=3.8565`。若把全峰值扭力代入無阻力模型，要求的牽引力等價於 `3.8565g`；維持同一 `aG=1` 先驗時，可傳遞引擎扭力上限為 `Tpeak×Rload/Rfirst≈343.16 Nm`，即峰值的 25.93%。這不是油門踏板百分比、實際起步扭力或預測加速度。它指出起步控制／滑移驗證不可由齒比範圍檢查取代。

### 網格端點與換檔

固定某個 FD，配置器將端點以百分之一取整，故 `|Rallocated−Rtarget|≤.005×FD=ε`。相應車速誤差滿足 `|Vallocated−Vtarget|≤Vtarget×ε/(Rtarget−ε)`（`Rtarget>ε`）。最高檔時速上限因此也只有網格誤差內的吻合，並非絕對不超出指定值。

令整數端點 `F=round(100Rfirst/FD)`、`L=round(100Rtop/FD)`。在 `F−L≥N−1` 時，中間第 i 檔的區間為 `[L+(N−1−i), previous−1]`。由前一檔保留的剩餘格數可歸納得下界不高於上界，故每檔至少下降一格、端點不動；411 個 FD 全部不滿足條件時才回傳模型無解。弱動力基線的 Rload≈38.60 超過既有最大端點36.60及其取整容差；這證明固定目標不可配置，不證明車輛不能行駛。

忽略換檔時間、離合器滑移及速度變化，在 `nShift` 換檔時落點為 `nAfter=nShift×Gnext/Gcurrent`。#462 七速於10000 RPM的落點為6951／7194／7418／7704／7885／8171 RPM，符合該合成案例的兩個峰值窗口。一般情況若有經量測成立的可用下界 `nLow`，要求每次落點均不低於它，至少需：

```text
Rtop/Rfirst = Π(Gnext/Gcurrent) ≥ (nLow/nShift)^(N−1)
```

這只是必要條件，不能將 torque-peak RPM 冒充 `nLow`。於同一車速、未受抓地限制且傳動效率相同時，相鄰檔輪上力相等的條件是 `T(n)Gcurrent=T(nq)Gnext`，等價於 `P(n)=P(nq)`，其中 `q=Gnext/Gcurrent`。只有兩個峰值仍不足以解出相交轉速；效率差、換檔中斷與抓地還會改變實際最佳策略。

2016 組矩陣驗證網格／數值性質；部分固定HP與獨立扭力組合不符合 `P(n)≤Tpeak×2πn/60`，故不能作為2016個物理可成立車款的證據。

### 可重現診斷修正與 Rspeed 後續研究

理論覆核發現 07b4492 的正式 workflow 將名義 `engineMaxRpm` 傳給診斷並標為 `effectiveLimitRpm`。既有 capture 的 v4 分析已辨識 Beetle5248／Pajero7999 RPM，但診斷用約6000／9000 RPM，換檔落點分別高估14.33%／12.51%。直接 solver／capture 測試通過未涵蓋此資格資料至診斷的傳遞；新 workflow 回歸在修正前以6000對5248失敗。

最小修正只在新Road診斷讀取 `proof.snapshot` 已覆蓋的後端 `engineCalculation.effectiveRedline`，驗證正值且不高於名義上限，缺省時用名義上限。維持名義引擎身份、峰值、起步／頂檔公式與凍結歷史重組。新回歸用兩組原始 capture 經正式 qualify／workflow，檢查有效上限與每次落點，並確認前端偽造 snapshot 不能改寫結果。Pajero測試中的profile只是流程測試載體，沒有新增其實車齒比基線。

依使用者要求由 `gpt-6-luna` 子代理獨立研究 Rspeed，結論為目前資料不能唯一辨識最佳起步目標。76.5／94.5／103.5及驅動形式間比例尚無本輪校準證據；保留明示歷史先驗，避免只替換成另一組未校準常數。有兩條可驗證路線：

1. **先做同車齒比掃描**：固定升級、輪胎、路面、天候、輔助及換檔程序，對數組一檔總減速與共同配置結果重複測0–100，比較中位時間與分散度，先粗掃再細掃。涵蓋舊基線、load目標及其中間候選；記錄每次實際配置與capture，保持頂檔需求及滑桿範圍一致。先驗證 #462 真實車輛與 Beetle，資料足夠後才按驅動形式／檔數加入其他車與未參與校準的驗證車。單車結果不直接泛化。
2. **曲線與縱向模型搜尋**：以已測得的 `T(n)`、有效輪徑、抓地力、起步離合器／扭力控制、有效質量及阻力，積分 `mEffective dv/dt=Fdrive−Frolling−Faero−Fgrade`，在可行離散齒比上最小化0–X時間並計入換檔。此力平衡框架可參照 [FHWA-HRT-18-037 第3章方程7](https://www.fhwa.dot.gov/publications/research/operations/18037/004.cfm)，但不是FH6引擎物理的證據。現有 moving loaded-sweep 能支持已掃到範圍的輸出曲線，不能識別0速起步離合器行為、低轉外插、實際μ或前後瞬態滑移；需要另補可辨識這些因素的量測。

本輪不替換 Rspeed，不引入HP門檻、torque-peak動力帶下界或另一套前端solver。此準則在明示工程先驗下可修復已定位的退化；實車最適性留待受控A/B及後續校準。

覆核與最小診斷修正的本地驗證：`cargo test --locked --manifest-path backend-rust/Cargo.toml` 為119 passed／3 ignored；兩個選用效能probe與需要真實Windows音訊／GSMTC的測試未執行。`cmd /c "pnpm -C frontend run test"` 為154 files／1099 tests passed、1既有skipped；Cargo fmt及git diff --check通過。獨立Node依本節推導核對14個保存基線的分段性質／端點誤差亦通過。這些結果不包含新的遊戲、GUI或實體裝置驗收。


## 2026-10-02：Pagani 靜態回報核對

已確認回報為2021 Pagani Huayra R、1249 HP、824 lb-ft、2434 lb、前重48%、AWD、前375/30R19、後395/20R21。舊版完整七速為3.64/2.53/1.82/1.35/1.04/.82/.67、FD3.99；新版為1/.94/.88/.83/.78/.73/.69、FD3.78。最新留言明確說未提供Step 3動態資料；不能把缺少附件推定為當時有或沒有使用量測，也不能杜撰capture。現行正式ICE workflow需要Rust合格證據才輸出推薦，直接純函式的預設情境不代表正式readiness。

Step1GoalSetup的顯示換算為`2434/2.20462=1104.0451415663472 kg`、`824/0.73756=1117.1972449699008 Nm`。精確物理換算則為1104.04382858 kg、1117.1939894250736 Nm；這點小差異不足以解釋FD差異。名義後輪半徑為0.3457 m，未宣稱是量測滾動半徑。舊CarParamsView殘留lb-ft內部單位註解，但目前沒有production import；本次重播採正式Step 1換算，不混用不可達舊頁面。

已實際執行歷史`cd96d86`與`ca195c7`的原始TS，並用相同輸入驗證目前Rust v2/v3。獨立fixture為`tests/fixtures/aego_road_report_462.json`，唯讀重播命令為`node tests/manual/replay_issue_462.cjs`（Node24+，須有歷史Git物件）。正常測試不生成fixture。所有情境採Road、七速，未指定aero/split/secondary correction，因而使用模型缺省aero=.5、AWD後分配72%；這些不是回報的實際設定。

| 明示情境（均非量測） | v1.6 TS與目前v3 Rust | v1.7 TS與凍結v2 Rust |
| --- | --- | --- |
| 未提供峰值RPM；maxRpm=0觸發7500、功率峰6375、扭力峰4500預設 | FD3.09；3.51/2.46/1.78/1.33/1.03/.82/.67 | FD3.09；1.21/1.07/.95/.86/.79/.73/.67 |
| 比較假設：功率峰8000、扭力峰6000、上限9000 | FD3.88；同上七速 | FD3.74；1/.94/.88/.83/.78/.73/.69 |
| 僅沿用昨日合成RPM：8804.031901、6000、10000 | FD4.27；同上七速 | FD3.74；1/.96/.91/.87/.83/.80/.76 |

因此v3涵蓋此靜態規格的高扭力長一檔機制，但尚未逐項重現原回報。不能把相同七個顯示齒比說成相同完整配置，也不能由它反推真實RPM。

還有比RPM缺失更強的限制：原v1.7負載式第一檔總減速`Rload=m×9.81×aG×r/(T×.9)`，任意AWD分配皆有`aG≤1`。依上述正式UI換算，故`Rload≤3.72377003`，但FD3.78且G1取整為1.00至少要求`Rload≥3.78×.995=3.7611`。不同RPM、aero與二次極速修正只改頂檔需求及配置選擇，不能突破此負載端點上限。Rust測試並掃描0–100%分配核對。精確物理單位換算也得同樣結論；原始保存值、輸入路徑、後續手調或版本差異尚無證據，不能自行指定原因。請以原始profile／截圖及實際輸入路徑釐清；無需先有capture才能做這項靜態分析。

目前沒有由新資料確認的額外公式缺陷，因此保留v3、既有21/10 goldens及6e49801有效上限修正。#462繼續開放、PR #460維持Ready；未合併、發行或實車驗收。原10月1日1400kg合成案例仍保留作歷史因果證據，絕不改標成這台Pagani。

本輪Linux完整驗證：Rust locked預設功能121 passed／2 ignored，無預設功能113 passed／2 ignored；前端154 files、1099 passed／1 skipped，TypeScript＋Vite build、Cargo fmt、git diff --check及歷史TS唯讀重播通過。兩個ignored為選用效能probe；未執行Windows GUI或新遊戲試車。
