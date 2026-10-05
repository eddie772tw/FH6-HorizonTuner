# AP1 Rev Arc：1999 Honda S2000 AP1 儀表原型

> 最新修正為固定成對LCD字標：mph在原有km/h上方，BOOST在VAC上方；兩對文字持續存在，只以同色的opacity區分選中狀態。km/h anchor、速度字形、上弧、色帶與數值區不動。此輪新實際CI截圖待產生；下方既有圖片為先前單色增壓版本，不代表雙字標版驗收。單色LCD／TN是使用者提供的設計背景，本輪未另外查證硬體規格。

## 原型與來源

本樣式以 **1999 年 Honda S2000 AP1，日本上市初期儀表**為視覺研究對象。不是美規年份的混稱，也不是後期 AP2 儀表重製。

- [Honda 1999 年 4 月官方 Fact Book，Interior](https://www.honda.co.jp/factbook/auto/s2000/199904/046.html)：已在雲端 Chromium 實際查看座艙圖片的像素，確認低矮儀表罩、弧形數位轉速帶與中央大型速度讀值
- [該頁官方座艙圖片](https://www.honda.co.jp/factbook/auto/s2000/199904/image/037_001.gif)：僅供研究，沒有複製至本專案
- [Honda S2000 99 官方新聞資料](https://hondanews.eu/eu/fi/cars/media/pressreleases/34329/honda-s2000-99)：搜尋索引可讀到 Digital read-out 段落；直接抓取遇到 502，因此不用它聲稱已看見額外的儀表照片

原廠資料以單一半圓形數位儀表與賽車啟發為設計背景。本作品保留其辨識語彙，依遊戲遙測重新編排，沒有宣稱原廠一比一複製或官方合作。

## 設計方向與玩家

- **整體風格**：低寬煙燻黑色儀表罩、琥珀色 LCD、密集轉速分段與簡短字標，避免把既有 VFD 收音機 HUD 換色當成新風格
- **視覺主角**：60 格上拱 RPM 帶和中央大型三位七段速度；轉速刻度隨當前車輛調整，不把所有車款硬套 9000 RPM
- **HUD 改編**：左下低調檔位是遊戲用途的新增欄位，並非宣稱 1999 原廠即有此數位檔位；右側依使用者要求改為 BOOST；這是遊戲用途改編，並非宣稱1999原廠儀表配有增壓錶
- **目標玩家**：喜歡 1990 年代末 Honda/JDM 數位儀表、高轉自然進氣車款與簡潔道路駕駛 HUD 的玩家
- **取捨**：不加入沒有可靠遙測的水溫、油溫、機油警示、里程表、方向燈或 OEM 商標

標準 HUDCore 比例下，720 × 300 的設計面積顯示為 540 × 225 CSS px。沿用共用右下角 flex 容器與 30px 邊界；這個槽位假設用來**取代遊戲原生右下角儀表**。若同時顯示原生儀表，必須由玩家調整 HUD 比例或遊戲顯示設定。外殼以外保持透明，不宣稱適合每種遊戲 UI 配置。

## 固定成對LCD字標（本輪修正）

- `mph`／`km/h`為兩個固定SVG文字節點，上下排列；km/h保留原來的位置。單位設定選中者全亮，另一個以相同RGB降低opacity，速度數值仍依設定選擇實際遙測
- `BOOST`／`VAC`固定上下排列於原色帶上方，僅這兩個caption略縮小；正壓與真正零點亮BOOST，有限負壓點亮VAC，缺值／錯誤／暫停／stale兩者皆暗。沒有以替換字串或增刪節點切換模式
- 缺少速度或訊號時可保留速度單位的設定提示，但數值仍為破折號與真實狀態。缺少增壓維持`--`和空條，不把缺值視為零壓
- 只切換兩對caption的opacity；bar、數值、刻度、glow保持原來的單色行為，abs分段映射、微小負號及±0.5／±1／±2對稱性皆未改動
- 新增default／70%compact、DPR1／DPR2的固定節點、上下相對位置、容納、色帶／速度／RPM避讓、metric／imperial切換，以及positive／negative／zero／missing／stale fixtures。直接renderer與實際launcher共用測試helper；新實際執行與像素複查仍待CI
- 本輪記錄：[dual-label-revision-evidence.json](../assets/ap1-rev-arc/dual-label-revision-evidence.json)

## 上方弧度修正

原版 RPM 色帶採獨立拋物線、垂直厚度與垂直字標位移，框線則是非對稱 Bézier。原始取樣的內框間距約18.9–41.9設計單位，導致使用者指出的曲率失真；先前像素檢查沒有識別此結構問題。

目前由 `arc-geometry.js` 定義一條低寬橢圓弧，色帶兩緣、刻度中心、內框和外框共用 unit normal offsets。分段沿色帶中心線等弧長取樣；厚度18、色帶上緣至內框間距36、框線寬10，包含兩端皆保持同一構造。Inkscape 原創 fascia 由相同幾何重新匯出。上次弧度修正保留了速度／檔位等讀值位置；後續依明確要求替換右側燃油區；本輪單色增壓修正繼續保留容器與上弧幾何。

以下是**歷史弧度修正對照**，兩側仍為當時的燃油版本；用來解釋上弧／外框修正，不是最新BOOST外觀。

![歷史弧度對照：燃油版本，非最新BOOST預覽](../assets/ap1-rev-arc/before-after.png)

縮放驗證也已修正測試語意：gear 的 ink-bbox 正規化 y 在 DPR1／DPR2 分別差0.004431／0.006336，但 SVG anchor／font／局部 transform 完全相同，全部讀值的最大 screen-anchor residual 只有0.006503 device pixel。這些實測說明先前失敗是把字形範圍誤當成 anchor invariant，並非讀值位置移動。新測試保留 ink 差異診斷，另驗證語意幾何、螢幕 anchor、容納與兩端字標。

## 資料契約與生命週期

| 顯示 | 來源／規則 |
| --- | --- |
| 速度 | canonical `speed_kmh` / `speed_mph` 的絕對值（支援負值倒車），搭配 `effectiveUnits.speed`、`displayUnits.speed`、`isMetric`；只有 generic `speed` 的單位一致才使用，不重新換算原始 m/s |
| RPM | `rpm`、`maxRpm`（相容 `max_rpm`）；分段比例限制於 0–1。沒有有效 maxRpm 時不畫假刻度 |
| 紅線 | 優先 `payload.redlineRpm`，否則 `data.redlineRpm`；不在樣式內推導引擎紅線。SHIFT 是此共用門檻的視覺提示 |
| 檔位 | 0 = R、11 = N、1–10 = 前進檔；不合法／缺少時顯示破折號 |
| BOOST | JSON路徑保留的原始 `Boost` 明確是 PSI above atmospheric，優先嚴格讀取有限數字；保留負值與0，缺少或無效時顯示 `--`。canonical-only輸入接受帶單位欄位，不猜測Pa或數值量級 |
| 鮮度 | `timestamp_ms`（相容 `TimestampMS`）必須前進；1500ms 無變化即清空並顯示 SIGNAL LOST。Coordinator 即使持續重播 RAF 也不會保留假即時讀值 |

初始零值 standby 沒有 timestamp，因此保持 WAITING FOR DATA。錯誤、暫停與部分遙測有明確狀態。新 timestamp 可恢復顯示；timestamp 回繞亦可處理。三位速度無法容納的值不截斷成另一個數字。

`config` / `hud:init` 消費設定；`hud:elements` 控制可見度；`hud:animate` 只做標示 DISPLAY CHECK 的分段測試，不產生假的速度、檔位或增壓值。有效遙測立即中止測試，尊重 reduced motion。`hud:destroy` 與 pagehide 清理樣式 watchdog、RAF 及監聽器，保持共用 HUDCore 和通訊協定不變。主色／glow 沿用共用設定，紅線警示色保留獨立語意。儀表不另外開 WebSocket，也不重複建立共用中央遙測卡片。

## BOOST 資料與右側版面

- [Forza官方Data Out文件](https://support.forza.net/hc/en-us/articles/51744149102611-Forza-Horizon-6-Data-Out-Documentation) 明定 `Boost` 為高於大氣壓的PSI。此HUD使用 `/ws/telemetry` JSON保留欄位；不套用其他binary／frontend路徑的Pa假設，也不以數值大小猜測單位
- Coordinator的aliases會把負值或缺值壓成0。因此有原始 `Boost` 時，以其嚴格有限值為準；無效／null／undefined不回退aliases。保留raw標記的Coordinator frame若缺少Boost，仍顯示缺值
- canonical-only可讀 `boost_psi`、`boost_bar`、`boost_kpa`，或帶明確 `boost_unit`／`displayUnits.boostPressure` 的generic boost；明確但不支援的單位（例如Pa）不會被重新解讀
- 可見單位為bar、PSI或kPa。採frame pressure metadata，其次設定值／metric fallback；PSI↔bar使用14.5038、PSI↔kPa使用6.89476、bar↔kPa使用100
- 正負值共用相同的絕對值映射：0–1bar magnitude使用75%長度、1–2bar使用餘下25%，所以±0.5同為37.5%、±1同為75%、±2滿條。兩方向刻度皆為0／0.5／1／2，位置0／37.5／75／100%；PSI與kPa採等價物理值，部分segment精確填色，不以整格ceil近似百分比；沒有隱藏VAC換量程或負壓專區
- 負值只以signed數字與明確`VAC`文字辨識；正負的bar、數字與刻度使用同一CSS琥珀色與glow；兩個固定caption維持相同RGB，只有選中opacity依模式改變。使用者的單色LCD／TN說明在此作為設計要求，不宣稱本輪已外部查證硬體類型
- 真實0為空條neutral模式；缺值為`--`且空條。只有填色clamp，超量程數值不截斷。bar顯示2位小數、PSI1位、kPa整數；微小有限負值即使四捨五入到0仍保留負號（例如`-0.00 bar`），真正的IEEE負零視為neutral。極大值用科學記號防止溢出版面
- `AP1 / REV ARC`與右下動態RPM文字的SVG節點／CSS均已移除；並未移動速度或檔位，也沒有變更共享上弧或fascia資產
- `tests/fixtures/boost-raw-json.json`保存3筆由合成324-byte封包經未修改production parser／serde_json得到的JSON。這是資料路徑回歸fixture，不是真實遊戲或網路實測

前版共用單色絕對值映射的實際驗證與數值breakpoint記錄於 [nonlinear-boost-revision-evidence.json](../assets/ap1-rev-arc/nonlinear-boost-revision-evidence.json)。視覺fixture包含+0.25／±0.5／±1／±2／零、微小負值與VAC單位切換，並精確比較正負的RGBA、opacity、filter／glow、文字與刻度paint是否相同。這些fixture已在前版實際GitHub Actions Chrome執行通過；±0.5／±1／±2的ratio分別為0.375／0.75／1，正負bar／數字／刻度paint完全相同；本輪另驗證固定caption的預期opacity差異。

## 原創資產與授權

- `hud_overlay/ap1_rev_arc/assets/fascia.svg` 是原創、可編輯的外殼向量圖
- 已使用 **Inkscape 1.4** 匯出 `fascia.png`（1440 × 600，透明外部），並用 **ImageMagick 7.1.1-43** 去除 metadata／壓縮
- 七段數字為本次手製多邊形；一般文字使用系統 sans-serif，沒有新增或複製字型
- 所有新增程式與原創圖形依本 repository 的 MIT license 提供；Honda 的照片、Logo、字型、遊戲截圖與第三方美術未被封裝
- 資產載入失敗仍以 CSS 深色外殼呈現 live 讀值，不會永久卡住啟動

重製外殼：

```sh
node hud_overlay/ap1_rev_arc/tests/visual/export-fascia.mjs
inkscape hud_overlay/ap1_rev_arc/assets/fascia.svg --export-type=png --export-filename=hud_overlay/ap1_rev_arc/assets/fascia.png --export-width=1440 --export-background-opacity=0
magick hud_overlay/ap1_rev_arc/assets/fascia.png -strip -define png:compression-level=9 hud_overlay/ap1_rev_arc/assets/fascia.png
```

## 驗證與誠實限制

使用技能：`halfmoon-design-system`、`telemetry-udp-protocol`、`pr-author-maintainer`。未修改 backend、共用生命週期或協定，沒有第三方產品相依新增。

- Style-owned Vitest：90 項純資料／行為測試；涵蓋單位、R/N、空值、NaN、Infinity、速度超界、signed BOOST／單位／缺值／量程、同字串快取邊界、適應刻度、重播 timestamp、恢復、設定與 destroy
- 完整 `pnpm -C frontend test`：160 個檔案通過／1 個略過，1195 個測試通過／1 個略過；`pnpm -C frontend build:web-hud` 與 `git diff --check` 通過。已確認 dist 包含新 HUD 且排除 tests
- 本地 Chromium 程序被執行環境的 UNIX socket `EPERM` 阻擋；require_escalated 亦相同。雲端瀏覽器至本地 fixture URL 遭 `ERR_BLOCKED_BY_CLIENT`，沒有改用其他 hostname 迴避
- **前版單色BOOST renderer／實際launcher＋Coordinator檢查通過**：GitHub Actions Linux Chrome 154，sandbox啟用，合成遙測；source head `2d88a29993f6d0bc6b2b2c881ac7a55865cc2c70`。[CI run 37268451649](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37268451649)／[artifact 11327007457](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37268451649/artifacts/11327007457)
- 前版已獨立查看實際hero／compact與+0.5／+1／−0.5／零、−1／−2、VAC PSI／kPa、微小負值、缺值與負向超量程：相同絕對值的正負讀值具有同長度、同琥珀外觀，負號與VAC清楚；刻度與數字沒有可見重疊。自動化另外精確比較bar／caption／value／tick／marker的computed paint，而非僅靠目視判定同色
- renderer的errors與launcher的errors／missing均為空；真實launcher在smoothing啟用下正確處理raw PSI正負、缺值、斷線重播與恢復。這些輸入仍是合成資料；技術複查不代表使用者核准。本輪雙字標的CI與像素複查待完成，應另看新head的PR checks
- [前版單色BOOST像素保留證據](../assets/ap1-rev-arc/monochrome-boost-preservation.json)：實際+0.5／−0.5截圖的bar與glow區域1,309個RGBA像素完全相同；與`a995df88`相比，右側aux區外（含底框）的454,320個像素中0個不同。此為原始renderer像素的exact比較
- [歷史BOOST替換的版面保留檢查](../assets/ap1-rev-arc/boost-layout-preservation.json)：比較`662d934`與`a995df88`的實際DPR2截圖，只排除當時指定的右側aux區及底框文字區；416,143個像素中0個不同。這是較早燃油改BOOST的證據，不冒充本輪單色修正的pixel-diff結果
- Windows 原生透明 overlay、滑鼠穿透、真實 Forza 遊戲畫面與遊戲內安全區仍須平台實測

### 前版單色BOOST實際預覽（雙字標更新待新圖）

![AP1 Rev Arc：前版單字標BOOST實際DPR2 Chrome截圖細節](../assets/ap1-rev-arc/detail-metric.png)

![AP1 Rev Arc：70% compact的實際DPR2截圖](../assets/ap1-rev-arc/detail-compact.png)

![單色絕對值映射：+0.5／+1／−0.5／零的實際Chrome截圖](../assets/ap1-rev-arc/ap1-boost-scale-comparison.png)

[前版BOOST／VAC／缺值／單位狀態集](../assets/ap1-rev-arc/states.png)

[720p 全幅透明 screenshot](../assets/ap1-rev-arc/metric-1280x720.png) 顯示預設右下位置。細節圖只裁切透明邊界；比較圖與狀態contact sheet使用同一次CI的實際截圖裁切、排列並加標籤與檢視背景。hero與compact保留實際renderer像素，720p保留完整viewport；比較圖與狀態集不改寫HUD像素或合成儀表讀值。圖片為GitHub Actions Chrome 154的實際renderer輸出與合成遙測，不是美術mockup或遊戲截圖。

- [視覺／viewport 自動檢查](../assets/ap1-rev-arc/visual-evidence.json)：三種解析度、default／compact 的 DPR1／DPR2、單位、R/N、紅線、缺值、錯誤、暫停、斷線、重連、resize、配色與 destroy，errors 為空
- [實際 launcher／Coordinator audit](../assets/ap1-rev-arc/launcher/host-audit.json)：含 smoothing 持續重播下的 signal loss、倒車重連、英制、顯隱、reload 與 destroy；errors 與 missing 均為空，頁面背景為透明
- [前版單色BOOST驗證與artifact來源](../assets/ap1-rev-arc/nonlinear-boost-revision-evidence.json)：記錄source head、run／artifact、對稱映射、同paint結果、獨立像素檢視與限制。完整截圖可從該歷史artifact取得
- [前版線性BOOST歷史驗證](../assets/ap1-rev-arc/boost-revision-evidence.json)及先前弧度研究證據保留為歷史記錄；深淺VAC方案已被本輪單色要求取代

### 可重製瀏覽器檢查

`tests/visual/render.mjs` 不修改專案依賴。使用已安裝的 Playwright，預設 `require('playwright')` 與其 Chromium；亦可指定現有安裝：

```sh
PLAYWRIGHT_MODULE_PATH=/path/to/playwright CHROMIUM_PATH=/path/to/chromium OUTPUT_DIR=/tmp/ap1-evidence node hud_overlay/ap1_rev_arc/tests/visual/render.mjs
```

輸出 1280×720、1920×1080、2560×1440、DPR 2，以及 metric／imperial／R／N／redline／missing／低轉速車／signal lost／resize／自訂色／BOOST正負零與缺值／獨立單位／過量程等 PNG 與 `visual-evidence.json`。失敗也保留 JSON；不以執行腳本存在代替驗收通過。`tests/visual/fixture.html` 是可操作的相同來源 iframe 檢查頁，透過實際 HUDCore 訊息餵資料。兩個 fixture 都放在 `tests` 內，由既有 copy-hud 打包器排除。

Author / Maintainer: Bagley as Codex
