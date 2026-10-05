# 調校工作流順序證據

文件日期：2026-09-12
適用分支：`codex/plan/tuning-workflow-iteration-20260912`
研究範圍：判斷目前六階段入口順序是否需要改為「變速箱先於定位」或「底盤先於輪胎」。本文件只整理外部證據與產品順序建議，不修改公式、係數、runtime 或遊戲驗收狀態。

## 結論先行

目前的入口順序 `Goal & Setup → Tire baseline → Chassis platform → Wheel alignment → Engine data & gearing → Setup verification` 不需要整體重排。它與可查到的專業依賴關係相容，尤其是「固定底盤／車高後再做定位」以及「齒比需要已確定的引擎資料、輪胎尺寸與路線目標」。本次查閱來源未提供足夠證據支持「變速箱必須先於定位」，也不足以支持把「底盤」整體移到「輪胎基線」之前。

應補的是分層語意與局部回檢，而非另造一套全新線性順序：

1. 第 1 階段先鎖定最終 build、輪胎 compound／尺寸、賽事類型、目標路線與輸入快照。
2. 第 2 階段的輪胎基線明確標為「初始冷胎壓／輪胎狀態基線」，不能當成已驗證的工作胎壓。
3. 第 3 階段建立底盤平台後，在第 4 階段定位前要求重新確認正常工作胎壓與靜態姿態；專業定位流程指出胎壓會影響車高與量測姿態。
4. 第 5 階段可在引擎 observation 通過後提供齒比預覽，但「最終齒比」應依目標路線、最高有效直線與實際換檔／加速觀察，在第 6 階段回檢。
5. 輪胎尺寸、引擎／動力、底盤或路線改變時，分別使相關的定位或最終齒比證據失效；保留 immutable snapshot 與單變量 A/B，不把一次幾何匹配當作性能證明。

## 來源與證據矩陣

| 來源（日期／類型） | 直接可查的內容 | 對工作流的含義 | 適用性與限制 |
| --- | --- | --- | --- |
| [Michelin Motorsport FAQ](https://www.michelinman.com/motorsport/motorsport-faq)（Michelin，查閱 2026-09-12） | 冷胎壓是在行駛前量測的起點；熱胎壓在賽段結束立即量測，才是評估抓地、穩定、平衡與磨耗的主要工作指標。 | 第 2 階段可以先有 cold baseline，但第 6 階段必須保存實際工作狀態；不要把冷胎壓估算標成最佳值。 | 真實賽車輪胎與 FH6 遙測不是同一模型；只能借用「初始值／工作值分離」的資料語意，不能移植數字。 |
| [HPA：Initial Setup and Ride Height Procedures](https://www.hpacademy.com/courses/suspension-tuning-and-optimization/practical-skills-initial-setup-and-rh-procedures/)（High Performance Academy，專業課程頁） | 調整定位或其他 setup 前，先完成 coilover 初始安裝、全壓縮 clearance、可用行程與 ride height；頁面示範以壓縮／伸長參考建立靜態位置。 | 支持 `Chassis platform → Wheel alignment`，而不是先定位再改彈簧／車高。 | 真車有實體干涉、阻尼行程與 slip plate；FH6 沒有同等檢查，產品應以遊戲可見狀態標示推估。 |
| [HPA：Wheel Alignment—Setup Suspension Components](https://www.hpacademy.com/courses/motorsport-wheel-alignment-fundamentals/the-hpa-7-step-alignment-process-1-setup-suspension-components/)（High Performance Academy） | 定位流程從安裝／對稱化 suspension components、設定 coilover 與 ride height 開始，再進入定位量測。 | 定位 readiness 應引用已完成的底盤平台 snapshot。 | 課程描述的是實車 string alignment；不能把其工具流程原封不動映射成 FH6 UI。 |
| [HPA：Wheel Alignment—Setup Alignment Equipment](https://www.hpacademy.com/courses/motorsport-wheel-alignment-fundamentals/the-hpa-7-step-alignment-process-2-setup-alignment-equipment)（High Performance Academy） | 在定位量測前，輪胎壓力要設為正常 running pressure，因為壓力會改變車在 setup pad 上的姿態與量測結果。 | 第 2 階段的冷胎壓估算不足以完成第 4 階段；底盤變更後要有「正常工作胎壓確認」回檢。 | FH6 沒有真實 setup pad；可轉移的是前置條件與狀態依賴，不是量測方式。 |
| [HPA：How to run a test session](https://www.hpacademy.com/forum/general-car-setup-discussion/show/how-to-run-a-test-session/)（HPA forum 討論） | 回覆指出彈簧／車高會改變車身側傾、懸吊壓縮與預期 camber 變化，因此先做 ride height／springs，再以 alignment 配合；同時說明底盤參數互相連鎖。 | 這是「底盤先於最終定位」的直接依賴證據。 | 這是論壇回覆而非製造商規範，不當作普遍專家共識；與 HPA 課程頁的流程互相支持即可。 |
| [HPA：Analysing alignment at the track](https://www.hpacademy.com/courses/motorsport-wheel-alignment-fundamentals/analysing-alignment-at-the-track-what-to-adjust)（High Performance Academy） | 先確保輪胎 tread 使用與 bump travel 基礎正確，再處理更深入的 alignment balance；若 bottoming，先調整車高或彈簧。 | 定位不是一次完成的末端頁面；第 6 階段應允許根據測試重新回到第 3／4 階段。 | 真實 race pace、curb 與 damper travel sensor 超出 FH6 可得證據；只能轉移「先排除基本故障，再調細項」的迭代原則。 |
| [ForzaTune：Forza Horizon 5 Gear Tuning](https://forzatune.com/support/forza-horizon-5-gear-tuning/)（ForzaTune，Forza 社群工具作者） | 齒比流程需要已確定的 vehicle information、power／torque band、齒數與 tire size；結果套用後仍要按賽事目的調整 final drive。 | 支持第 5 階段等待引擎 observation 與最終 build；齒比沒有必須先於定位的機械前置條件。 | 頁面標示 FH5／Earlier；FH6 的具體物理與遊戲改動需另行實測，不能移植其數字或保證。 |
| [HokiHoshi：How to Tune in Forza Horizon 5](https://www.youtube.com/watch?v=wkHNIBBw6Tw)（YouTube，直接社群教學，2021-11-05） | 影片章節順序把 damping、springs、ARBs、alignment、gearing、tires 放在基礎調校段，之後才做 road testing；同一教學仍把試車與問題診斷作為收尾。 | 代表「教學順序」可與純機械依賴不同；不能拿單一 creator 的章節排列證明齒比應先於定位。 | 這是 FH5 教學；可用於 UX 的 progressive disclosure 與測試閉環，不把數字或順序視為 FH6 真理。 |
| [HokiHoshi：Forza Horizon 6 Tuning Guide](https://www.youtube.com/watch?v=QECdJ_cFZbc)（YouTube，FH6 直接社群教學，查閱 2026-09-12） | 直接涵蓋 FH6 的 tire pressure、gearing、alignment、camber、toe、caster、ARB、springs、damping、aero、brakes、diff 等類別。 | 可作 FH6 使用者認知的入口參考，但頁面可查證的資訊不足以推出「gearbox 必須在 alignment 前」的結論。 | 影片並非官方 physics specification；應以本專案的 game-visible／telemetry capture 與 A/B evidence 覆核。 |
| [Horizon Tuning Hub—FH6 Community Guide](https://www.fh6tuning.com/guide)（社群指南，查閱 2026-09-12） | 把輪胎列為接地基礎，並分別說明 gearing、alignment、suspension；不同賽事 quick start 對 tire compound、壓力、車高與 ARB 的要求不同。 | 支持先建立輪胎／賽事基線，並把 route／discipline 作為條件；也支持不要把 Road 的順序硬套到 Rally、Drag、Drift。 | 社群資料，不是官方或實車驗收；其建議數字只能當待驗證起點。 |
| [FHWiki—FH6 Tuning Guide](https://fhwiki.com/en/guides/tuning/)（社群 wiki，2026-06-08） | 將「輪胎→齒比→底盤／差速器」寫成一般入口建議，但明示是 fan-made、非 Playground／Turn 10 背書，且齒比仍需配合路線。 | 與 HokiHoshi、HPA 的排列不同，證明社群存在多種 pedagogical order；可保留齒比的早期預覽，但不能因此改變硬依賴。 | 只能用來觀察玩家認知與 UX 需求；不能當作專業共識或 FH6 通用解。 |

## 對三個爭議點的判定

| 問題 | 可查證的硬依賴 | 建議判定 |
| --- | --- | --- |
| 變速箱是否應先於定位？ | 齒比需 power／torque band、齒數、tire size 與路線目標；定位需已穩定的底盤姿態與正常工作胎壓。兩者沒有互相要求的硬前置。 | **不改順序。** 保留第 4 → 第 5；允許第 5 提供 provisional gear preview，最終值在第 6 依目標路線／實測回檢。若改輪胎尺寸、引擎／動力或路線，重新驗證齒比。 |
| 底盤是否應先於輪胎？ | 底盤／車高會改變 camber 與胎面使用；但輪胎 compound、尺寸與初始壓力是底盤工作的輸入，且定位前要用正常 running pressure。 | **不把兩者整體互換。** 把第 2 拆成「初始輪胎 baseline」，第 3 建底盤，第 4 前再做「工作胎壓／姿態確認」；第 6 依熱胎與測試結果回到第 2／3／4。 |
| 定位是否應該早於底盤？ | HPA 的 suspension component、ride height 與論壇依賴說明都指向先穩定底盤，再讓 alignment 配合；底盤變更會使原定位條件失效。 | **維持底盤 → 定位。** 定位頁 readiness 應引用 chassis snapshot；若第 3 後有變更，不應沿用舊定位的「已完成」狀態。 |

## 建議的 UX／資料契約調整（候選，並非均已實作）

不增加使用者必須理解的額外主階段，僅補下列狀態與局部回圈：

| 位置 | 建議顯示／保存 | 觸發回檢 |
| --- | --- | --- |
| Goal & Setup | `buildLocked`、車輛／改裝／輪胎 compound／尺寸、discipline、target route 與硬體／輸入情境快照。 | 改變 build、輪胎或目標路線時，清除受影響的後續 readiness。 |
| Tire baseline | 分開 `initialColdEstimate`、`userConfirmedGameValue`、`observedWorkingState`；估算值不標為最佳值。 | 進入定位前若沒有正常工作胎壓或靜態姿態確認，提示補測，不假裝定位 evidence 完整。 |
| Chassis platform | 保存 springs／ARB／damping／ride-height 建議與使用者確認 snapshot，明示其來源與 `unknown`。 | 改變任何會影響車高、側傾或行程的值時，讓 alignment 重新需要確認。 |
| Wheel alignment | 只在底盤 snapshot 與壓力／姿態狀態有效時標示 ready；保留 geometry input 與 applied confirmation。 | 改輪胎尺寸、底盤或壓力狀態時回到 pending。 |
| Engine data & gearing | 將 `engine-observation`、tire size、gear count、power／torque band 與 route goal 綁在同一 dependency key；標示 provisional／route-final。 | 引擎、輪胎尺寸、齒數、換檔策略或路線改變時，清除 final gearing evidence；不必因此阻擋底盤與定位。 |
| Setup verification | 保留 baseline、run、描述性報告及單一變量 A/B；允許回到 tire／chassis／alignment／gearing 的局部迴圈。 | 只接受使用者確認已套用的遊戲值與新鮮 capture；將「沒有改善／反向」保留為結果。 |

## 轉移限制與不能宣稱的內容

- 真實賽車的熱胎壓、胎面溫度、胎體與 setup-pad 姿態，不能由 FH6 的冷胎壓估算或有限 telemetry 自動補造。專業來源提供的是資料依賴與量測程序，不是 FH6 係數。
- FH5／早期 FH6 creator tutorial、社群 wiki 與媒體文章可以幫助設計 progressive disclosure，但不能當作 FH6 官方物理規格、跨車通用數字或跨賽事最佳順序。
- 社群來源對齒比先後、輪胎壓力與懸吊細節並不一致；這不是需要用產品 UI 假裝消除的分歧。應把它們降級為可追溯的先驗，透過 game-visible input、capture 與 matched Road A/B 驗證。
- 單次最快圈、幾何齒比匹配、loopback 或 synthetic telemetry 只能證明資料流／計算可運作，不能證明順序改動帶來 FH6 實機性能收益。

## 來源品質說明

本次研究刻意混合專業賽車訓練／輪胎製造商資料與 FH6 直接社群教學。Michelin 與 HPA 用來判斷機械量測依賴；ForzaTune、HokiHoshi、Horizon Tuning Hub、FHWiki 用來觀察 Forza 使用者的教學與 route／discipline 差異。由於沒有找到可公開查證的 Turn 10／Playground 官方 FH6 調校順序規範，本文件不宣稱存在「專家普遍同意的唯一順序」。

## 本輪整合決定

主順序維持不變，程式加入可展開的「為什麼依此順序／何時回訪」說明與下一個必要動作捷徑。底盤、定位與齒比仍呈現為初始推估；完整輸入快照改變後，既有 Road baseline 不可直接接收新設定的 run。

本輪沒有把真車正常工作胎壓、setup-pad 姿態或 `buildLocked` 新增為 FH6 的強制門檻，也沒有宣稱輪胎／定位已完成物理驗證。這些需要遊戲可取得的量測與明確輸入契約，不能只依真車教程增加手填負擔。既有 engine observation 依動力配置重用；改輪胎尺寸會重新計算齒比，但不抹除與輪胎尺寸無關的引擎掃描。更換路線後，必須在新路線重新錄製驗證，歷史證據不自動沿用為性能結論。
