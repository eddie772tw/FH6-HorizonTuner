# FH6 四季、路面與輪胎設定：證據分級研究

研究日期：2026-09-09（Asia/Taipei）。本文刻意將 FH6 的直接證據、FH4/FH5 的歷史經驗、真實輪胎物理分開；沒有把其中任一層當成另一層的遊戲機制證明。

## 可採信的結論

目前**不足以**把目前算牌的固定季節 PSI 補償當成 FH6 已驗證規則：夏/秋 `-0.5 PSI`、春/冬 `+0.5 PSI`。較準確的產品語意是「尚未校準的使用者假設」，不能說 FH6 季節直接提供可量化的環境溫度或胎壓偏移。

原因如下：

1. FH6 官方直接確認四季造成景觀、植被、天氣與聲景差異，且北部高山區全年可使用雪胎；但未公布任何環境/路面溫度、輪胎起始溫度、壓力演算法、胎種工作窗，或季節到 PSI 的對照表。
2. 本次採集的 FH6 玩家回報確實顯示冬季、降雨、深雪與鋪裝路的抓地差異值得測量；但不同玩家對雪胎、off-road、rally 的結果相互衝突，且未控制車輛、PI、驅動方式、調校、路段、降水、輪胎寬度與測試圈數。
3. 真實輪胎會因環境溫度改變壓力與化合物剛性，但這只能形成「值得在 FH6 內驗證」的先驗，不足以推導遊戲恆定的 `±0.5 PSI`，更不能推導四季各自的符號。

建議將季節改成**測試情境/路面狀態標籤**，而非自動改寫壓力的輸入。若暫時必須保留控制項，應顯示為可關閉的「實驗性手動 offset（預設 0）」並要求同車、同輪胎、同路線、同天氣的熱胎遙測確認後才採用。

## FH6 直接證據（適用於 2026-09-07 British Automotive 更新）

官方最新系列公告指出更新在 2026-09-07 釋出，但頁面沒有公開可用於重現的 build number；本研究故以發布日期與更新名稱標識遊戲版本。官方的 FH6 功能介紹（2026-02-09）明確說明：

| 觀察項目 | 直接證據 | 信心 | 能支持的產品結論 | 不能支持的結論 |
| --- | --- | --- | --- | --- |
| 四季與環境 | [官方功能介紹](https://forza.net/news/forza-horizon-6-features) 說四季比 FH5 Mexico 更有差異，涵蓋景觀、農作物、植被、天氣及聲景。 | 高 | 季節是 FH6 真實遊戲狀態，賽道表面與視覺天候應被記錄。 | 沒有量化 ambient/track temperature，也沒有 PSI 模型。 |
| 雪與地點 | 同一官方頁面說無論目前季節，高山 Alpine 區都可使用 snow tires。 | 高 | 「是否位於雪區/實際遇到雪」比單一季節名稱更接近可操作條件。 | 不代表冬季全圖、全鋪裝路均須裝雪胎；也不代表雪胎一定最快。 |
| 輪胎資料 | 官方只提「cosmetic tire wear」與胎紋視覺刷新。 | 高 | 不可把 cosmetic tire wear 視為磨耗、胎溫或胎壓物理的公告。 | 不可從公告推定有新熱力學、胎壓或胎種平衡模型。 |
| 最近更新 | [British Automotive 公告](https://forza.net/news/forza-horizon-6-series-5) 於 2026-09-07 上線，列出的車輛修正、語言與 PC rendering 改善沒有輪胎物理項。 | 中 | 以下社群觀察至多適用於該更新附近的版本；日後 patch 需重測。 | 「release notes 未提到」不是沒有隱性平衡調整的證明。 |

官方來源沒有發現「seasonal ambient temperature」、「road temperature」、「cold/hot tyre pressure target」或任何 `Summer/Spring/Autumn/Winter -> PSI` 對照。這是一項**缺乏公開直接證據**的結論，而不是對遊戲內部程式碼的否定。

## FH6 社群經驗（非受控實驗）

| 問題 | 社群觀察 | 證據強度與限制 |
| --- | --- | --- |
| 胎壓與熱胎 | [FH6 Reddit 討論](https://www.reddit.com/r/ForzaHorizon6/comments/1vy196q/tire_pressure_info/) 在本研究查閱時只顯示相對發表時間（`2d ago`）；有玩家以 Soni/Hokubu 路線和輪胎過熱情況來微調，另一則未受控單車回報 24、27.5 PSI 得到不同圈速。 | 低。頁面未提供本研究可驗證的絕對 timestamp；內容提供「以熱胎遙測與具體路線測」的方向，沒有可外推的季節差或 A/B 設計。 |
| Winter 的鋪裝路 | [FH6 Winter 討論](https://www.reddit.com/r/ForzaHorizon6/comments/1txy47m/i_hate_winter/) 有玩家說道路大致清楚、只有較低抓地；其他人則回報濕路配 slick 容易滑。 | 低。天候、地圖區域和車輛未控制，結論僅是「不要以冬季名稱代替路面觀察」。 |
| snow / off-road / rally | [雪胎與 off-road 對照討論](https://www.reddit.com/r/ForzaHorizon/comments/1ucu01n/snow_tyres_vs_offroad_tyres_but_on_snow_the_north/) 同時出現「雪/冰雪胎較有抓地」、「off-road 萬用」、「雪胎深雪不減速但路面較差」等互斥說法。 | 很低。本次來源樣本未建立一致結論，更不能固定指定單一胎種。 |
| 冬季胎種替換 | [冬季使用雪胎的討論](https://www.reddit.com/r/ForzaHorizon6/comments/1twwfn9/so_with_it_being_winter_in_japan_now_when_do_you/) 有人建議北部雪區可嘗試 snow，並主張 rain 中 slick 比 semi-slick 更易滑。 | 很低。是合理的候選假設；尚未控制 PI、胎寬與路面含水量。 |
| 熱胎調校程序 | [Steam FH6 調校串](https://steamcommunity.com/app/2483190/discussions/0/839502870935067124/?ctp=2) 建議先校正懸吊，再用 tire-load/heat telemetry；作者主張 street/sport 34–35、slick/semi-slick 30–33 PSI 的熱胎目標。 | 低到中低。方法有可重現的順序，但數字是作者經驗而非官方或受控研究；不可直接混入所有 race goals。 |
| 第三方實務指南 | [ForzaTune FH6 指南](https://forzatune.com/guide/the-fully-updated-forza-tuning-guide/) 建議 FH6 從 27–32 PSI 冷胎起步、跑 1–2 分鐘後以 30–40 PSI 熱胎與車輛反應調整，並提醒直線、天候及涉水會很快冷卻輪胎。 | 中低。比單一討論更明確地要求重複量測，但仍是第三方指南，且其範圍很寬；它支持「逐車逐路段校正」，不支持固定季節常數。 |

社群資料的共同點是：**實際表面（乾/濕、積水、深雪、柏油/泥地）、速度與路線熱負荷，比月份/季節名稱更有可操作價值。**它們不構成 compound 或 PSI 的 meta 排名。

## FH4/FH5 歷史經驗：只能做比較，不能回填 FH6

FH5 的設計與 FH6 不同。舊官方論壇的 FH5 調校指南在搜尋快照中明確指出 FH5 季節與 FH4 的運作不同；FH6 官方也說其四季比 Mexico 更明顯。因此以下都不可直接作為 FH6 算牌依據：

| 歷史觀察 | 可保留的價值 | 禁止的推論 |
| --- | --- | --- |
| FH4 的 winter 曾大範圍改變雪/冰路面；FH6 討論常以此比較。 | 可提醒測試設計不要把 FH4 記憶誤當 FH6 行為。 | 不能由 FH4 的冬季雪胎需求推出 FH6 冬季 `+0.5 PSI` 或全圖換胎。 |
| FH5 社群曾把 rally 看作 PI 效率與混合路面的候選胎，並討論 rain、semi-slick、off-road。 | 可列為 FH6 的候選 compound A/B 組合。 | 不能聲稱 FH5 的相對抓地、PI 或胎壓起點仍是 FH6 數值。 |
| ForzaTune 把 FH5 and earlier 的舊 32–34 PSI 熱胎慣例，和 FH6 的較寬 30–40 PSI 建議分開。 | 顯示跨代硬搬數字有風險。 | 不應把 FH5 熱壓目標寫成 FH6 的 target hot pressure。 |

## 真實輪胎物理（只作先驗）

| 真實世界資料 | 可推得的物理原理 | 對 FH6 的界限 |
| --- | --- | --- |
| [Michelin FAQ](https://www.michelinman.com/auto/assistance/michelin-faqs) 表示每下降 10°F 約少 1 PSI；冬胎在接近冰點的日平均環境使用，並以胎紋細小割紋增加冬季控制。 | 氣體壓力受溫度影響，低溫化合物與胎紋確實會影響可用抓地。 | 不能換算為遊戲四季的固定 `±0.5 PSI`，因為 FH6 沒公布環境溫度、氣體模型或 cold-pressure 定義。 |
| [Pirelli GT rain tyre 技術頁](https://www.pirelli.com/tyres/en-gb/motorsport/car/gt/rain) 指出積水深度會改變最佳雨胎壓，高水位需要較高壓力排水；胎溫也會隨水量改變。 | 雨/積水不能簡化成「冷就一律升壓」或「濕就一律降壓」；目標取決於胎體、排水與負荷。 | FH6 沒有 wet-tyre 類別與這種完整車胎模型的公開對照，故不應套用其數字。 |
| [Pirelli compound 說明](https://www.pirelli.com/global/en-ww/road/cars/tyres/the-diablo-range-of-compound-tyres-for-track-use-53989/) 說明瀝青溫度、表面粗糙、耐久與前後軸負荷共同決定 compound；冷表面使化合物變硬、熱表面又有不同磨耗/剛性問題。 | compound 選擇與胎壓應依路面、負荷、熱輸入和使用時間，而非季節名稱單變數。 | 該資料是兩輪賽道產品，並不是 FH6，也不是汽車虛擬胎的校準資料。 |

## 對胎種的實際建議

這些是 FH6 的**測試優先序**，不是自動選胎規則：

| 場景 | 首輪候選組合 | 量測判定 | 不應做的事 |
| --- | --- | --- | --- |
| 乾燥鋪裝 road/touge | Sport、Semi-slick、Race/slick；同 PI 必要時另做功率補償版本。 | 以固定路段、固定起跑與至少 3 次有效圈的中位數圈速、輪胎熱色/溫度、可重複的煞車與出彎失誤率比較。 | 不因「Summer」自動把所有車降 0.5 PSI。 |
| 雨/濕鋪裝 | Sport、Semi-slick、Rally；若車上有 Race/slick，必須納入對照。 | 固定降雨/積水狀態；單獨記錄涉水位置與胎溫回落。 | 不以真實 wet-tyre 表格直接指定 FH6 壓力。 |
| 泥地、礫石、混合表面 | Rally、Off-road；依 event 可加入 snow。 | 紀錄深雪比例、路面切換次數、著地/撞擊；比較可用牽引與完賽穩定度，不能只看單一最高速。 | 不把 FH5/FH4 的 PI 印象當 FH6 相對抓地數據。 |
| 實際雪/冰或高山 Alpine 雪區 | Snow、Off-road、Rally；若含大量鋪裝，另做 semi-slick/sport 對照。 | 分開「深雪/冰」與「已清除的冬季柏油」；同車同寬度同 PI 測。 | 不因 Winter 就對全地圖一律裝 snow。 |

## 建議的 FH6 校準最小實驗

1. 鎖定單一車、PI、驅動方式、胎寬、輪圈、懸吊與 assist；每次只改一個變數。保留遊戲更新日期與平台。
2. 對每個**實際**情境（乾柏油、濕柏油、深雪/冰、混合泥地）以 baseline、`-0.5 PSI`、`+0.5 PSI` 做至少 3 個有效 run；先用同一種 compound，再做 compound A/B。
3. 以同一站點、同一方向、相同天候/時段，記錄圈速中位數、最高與平均胎溫、各輪熱色、失控/碰撞、輪胎類型、起始壓力及路面狀態。將涉水、撞牆、交通、失誤圈標示為無效而非刪除不留痕。
4. 採用門檻：若該條件下 `±0.5 PSI` 的效果跨多車、輪胎與重複 run 仍超過自然圈速變異，才可建立**條件式**建議；否則保持 0 offset。這也能檢查「同一季節、不同表面」是否得到相反結果。

在取得這些 in-game capture 前，季節選單可以保留作為使用者的賽事描述，但不可宣稱它已量測到 FH6 ambient temperature，亦不可稱 `targetPhot` 是 FH6 官方熱胎規格。

## 來源與適用版本摘要

| 類別 | 來源日期 / 版本範圍 | 主要限制 |
| --- | --- | --- |
| FH6 官方 | 2026-02-09 功能公告；2026-09-07 British Automotive 更新（無公開 build number） | 高可信 feature scope，沒有胎壓/溫度方程式。 |
| FH6 Reddit/Steam 社群 | 於 2026-09-09 查閱；部分頁面僅顯示相對發表時間，故本文不以未核實絕對日期標示。 | 非受控、可能受 patch、車輛、PI、路線和駕駛技術影響；僅作經驗線索。 |
| ForzaTune 第三方指南 | 本研究查閱日的 FH6 指南版本 | 方法可借鑑，數字是作者建議而非開發商規格。 |
| Michelin/Pirelli | 網頁於 2026-09-09 查閱 | 真實道路/賽事胎，與 FH6 虛擬模型不可直接校準。 |
