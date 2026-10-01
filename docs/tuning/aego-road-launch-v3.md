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
- #446已確認的實車驗收仍屬該次舊候選，不自動涵蓋本修正。#462仍缺實際車款、檔數、profile、合格capture／snapshot、`09.4`是否為.94的確認，以及起步／加速記錄。未提供新實車性能改善百分比。
