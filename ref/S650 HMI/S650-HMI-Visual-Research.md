# S650 HMI 視覺研究與設計基準

> 文件用途：提供規劃或從頭建立 S650 風格 HMI 時的外部研究、視覺決策、資訊架構與驗收參考。  
> 研究日期：2026-08-10（本輪迭代）  
> 研究範圍：Ford Mustang S650 數位儀表，以及 BMW M、Porsche 911 等相近性能車款的駕駛者資訊顯示設計。

---

## 0. 使用說明

本文件是設計研究與方向文件，不是完整的技術規格，也不是特定實作的待辦清單。開始開發前，請先依照實際產品需求與技術環境重新確認下列事項：

1. 確認目標產品的資料來源、telemetry payload、單位轉換與更新頻率。
2. 確認 rendering pipeline、HUD viewport、顯示器縮放、字體資產與可用繪圖技術。
3. 根據實際環境決定採用 Canvas、DOM、SVG 或其他渲染方式；本文的函式名稱與版型只是概念示例，不是必要的 API。
4. 外部來源是設計判斷的依據，不是要求像素級複製原車畫面。若外部資料之間存在差異，以車廠官方資料為優先，並將自製內容標記為產品本身的設計決策。

開始實作時，建議先建立 implementation plan，明確記錄資料介面、可用資產、支援的 HMI 模式、目標解析度與效能限制。

### 0.1 本輪迭代結論

本輪研究把 S650 HMI 的美術方向從「深色賽車 HUD」收斂為「以駕駛者為中心、由模式驅動構圖的數位座艙」：

1. **真正的 S650 核心不是霓虹色，而是模式切換會改變資訊構圖。** Cluster Theme 與 Drive Mode 必須分成兩個資料概念；不能把 Slippery、Drag Strip 或 Custom 誤當成額外的 cluster theme。
2. **基準外觀改為深色＋銅色的 OEM-inspired 底層。** 官方資料描述 S650 的預設儀表由傳統冷藍／淺灰轉向現代銅色與深色；青色、紫色或高飽和紅色只能作為產品自訂模式，不應成為所有模式的共同底色。
3. **資訊層級優先於裝飾。** 速度、檔位、RPM／換檔提示、警告必須先成立，再加入 G-Force、胎溫或 Boost 等輔助資料。Track 的特色是「更聚焦」，不是「塞入更多卡片」。
4. **Cluster 與中央觸控螢幕要分開設計。** 12.4 吋 cluster 是駕駛瞬間判讀面；13.2 吋中央螢幕在研究上的系統分工才適合承載 Track Apps、設定、可旋轉車輛圖形或較重的 3D／互動內容。兩者可以共享 token 與資料語意，但不應共享同一套卡片版型；本次專案只實作 cluster，中央螢幕功能只保留靜態佔位符。
5. **本專案的 Heritage ’67、SVT Cobra 等主題是風格延伸，不是 S650 官方 Cluster Theme。** 文件中會將 OEM 事實、外部車款借鑑與產品自訂決策分開標記，避免研究結果被誤讀成原車規格。

### 0.1.1 本次實作邊界（S650 HMI v2）

本次實作採用 **Dashboard-first** 原則：完整處理儀表板本身，讓 S650 HMI 至少具備其他 HUD 儀表樣式已能提供的基礎駕駛功能；所有輔助視窗與周邊車載系統先不接功能。

**本次必須實作：**

- 速度、單位、檔位、RPM、Max RPM、紅線與基本 Shift Light。
- Normal、Sport、Track、Calm、Fox Body，以及產品既有的 Heritage ’67、SVT Cobra 延伸主題。
- Drive Mode 與 Cluster Theme 的資料分離；Drive Mode／Theme 由主 GUI HUD 控制台手動設定。
- 基本警告、無資料 fallback、show/hide、HUD scale、metric／imperial 與啟動 sweep。
- 既有 `hud:frame`、`hud:config`、HUDCore lifecycle 與 60Hz Canvas 更新路徑。

**本次只保留佔位符，不實作功能：**

- 中央視窗／Companion View 的完整內容。
- Track Apps、Auxiliary Gauges、圈速結果、Launch Control 設定與完整性能頁面。
- 系統媒體、廣播／Radio、導航／Navigation、電話／Phone。
- 3D 車輛模型、觸控操作、媒體控制與任何外部服務整合。

佔位符不得建立 click handler、API 呼叫、假資料或獨立狀態管理；它們只負責保留未來可能使用的視覺位置，且可以在不影響主儀表的情況下移除。

目前既有的 `hud:media` 共用事件路徑只作為未來整合備註；S650 HMI v2 不訂閱、不控制，也不為媒體內容建立第二條資料路徑。

### 0.1.2 前置資料／版面契約

本輪先固定 renderer 的邊界，再進入主題細修。契約版本為 `s650-hmi/v1`，實作位置為 `hud_overlay/s650_hmi/assets/s650_contract.js`。

| 契約 | 內容 | 所有權／限制 |
|---|---|---|
| `hud:frame` | `detail.data` 使用 coordinator 已正規化的 `speed_kmh`、`speed_mph`、`rpm`、`maxRpm`、`redlineRpm`、`gear`、`throttle`、`brake`；`detail.redlineRpm` 可作為紅線覆寫。 | 只讀；不在 renderer 內重解 UDP 封包，也不做第二次速度換算。 |
| `hud:config` | `s650Theme`、`driveMode`、`matchDriveMode`、`isMetric`／`unit`、`elements`。 | Theme 與 Drive Mode 是設定狀態；本次由主 GUI 設定，Canvas 不提供設定流程。 |
| `elements` | `showGauge`、`showSpeed`、`showGear`、`showRPM`。 | 只控制儀表板既有元素；不新增 Track Apps、媒體或中央螢幕狀態。 |
| 非契約事件 | `hud:media`、廣播、導航、電話、外部服務事件。 | 本次不訂閱、不控制、不建立 fallback 假資料。 |

Canvas 的邏輯尺寸固定為 **1260×240**；CSS zoom／HUD scale 由既有 HUDCore 管理，layout 不自行讀取 DOM 尺寸。版面區域如下：

| 區域 | 邏輯範圍 | 責任 |
|---|---|---|
| Header | `x:0, y:0, w:1260, h:32` | S650 標識、主題／狀態標籤。 |
| Left | `x:34, y:32, w:326, h:180` | 速度或左側儀表資訊。雙環基準中心為 `x:232, y:122`、半徑 `90`。 |
| Center | `x:385, y:32, w:490, h:180` | 核心速度、檔位與主要 RPM／Shift 資訊。 |
| Right | `x:890, y:32, w:326, h:180` | RPM、踏板或右側儀表資訊。雙環基準中心為 `x:1028, y:122`、半徑 `90`。 |
| Footer | `x:34, y:212, w:1182, h:28` | 單位、底部狀態與必要提示；左側 `360×28` 保留 tell-tale 版位。 |

模組責任固定為：`contract` 正規化資料與設定、`tokens` 提供色彩、`primitives` 提供 Canvas 基元、`layouts` 決定七個儀表板版型、`frame` 管理 60Hz frame／sweep 狀態、`renderer` 只負責 HUDCore facade。任何中央視窗或周邊系統都不得穿透這條依賴鏈。

### 0.1.3 HMI 核心參數字典

`hud_overlay/s650_hmi/assets/s650_tokens.js` 現在同時提供設計交接用的參考網格與實際 overlay 網格，避免 Figma 的 1920×720 參考數值直接套入 1260×240 的 HUD。

| 類別 | Token | 參考值／目前值 | 本次使用方式 |
|---|---|---|---|
| Grid | `grid.reference` | 1920×720、top 40、left/right 64、雙環直徑 400、中央區 650 | Figma／Qt／Unreal 交接基準，不直接 render。 |
| Grid | `grid.overlay` | 1260×240、top 32、left/right 34、雙環直徑 180、中央區 490 | S650 Canvas 實際版面基準。 |
| Touch | `touch.targetMin`／`targetRecommended` | 44／64 px | `touch.enabled=false`；本次不建立觸控或盲操功能，只保留未來共用字典。 |
| Touch | `touch.gapRecommended`／`listItemRecommended` | 16／76 px | 僅供未來中央視窗／設定頁使用。 |
| Typography | `typography.speedHero` | 64 px | 主速度、主要駕駛讀數。 |
| Typography | `typography.headingL`／`bodyM`／`captionLegal` | 32／24／16 px | 檔位／次要文字／最小動態文字層級。 |
| Color | `colors.bgPrimary`／`textPrimary` | `#0A0B0D`／`#FFFFFF` | 深色底與核心文字基準。 |
| Color | `colors.adas` | `#00E676` | 預留輔助駕駛狀態色；本次不實作 ADAS 功能。 |
| Color | `colors.telltaleRed`／`telltaleYellow` | `#FF3B30`／`#FFCC00` | 警告／危險語意；只允許由 dashboard warning 狀態使用。 |

對比度 `≥7:1` 作為核心文字的產品驗收目標；仍需在白天眩光、夜間低亮度與實際面板上量測，不能只由 Hex 色碼推定符合 ISO。

### 0.2 研究結論的證據分級

| 分級 | 本文件的用法 |
|---|---|
| **OEM 事實** | Ford 官方車款頁、官方車主教學與官方媒體資料直接描述的尺寸、模式、主題、功能或視覺方向。 |
| **可觀察模式** | 官方圖片／媒體素材或明確可辨識的實車畫面中可觀察到的版型與資訊層級；不把單張畫面推論成完整規格。 |
| **產品決策** | FH6-HorizonTuner 為了可讀性、效能或品牌一致性所做的 renderer token、版型與動效選擇。 |

後續驗收應優先檢查「產品決策是否符合 OEM 事實與可觀察模式」，而不是追求未被官方公開的像素級還原。

## 1. 研究範圍與資料使用原則

本文件只把車廠官方資料與明確可辨識的車款儀表資料作為外部設計依據。產品自身的圖片、示例截圖與尚未確認來源的論壇截圖，不作為原車 HMI 設計證據。

### 1.1 明確排除的圖片來源

以下資料不納入外部設計研究樣本：

- 產品資料夾中的 showcase 圖片或產品展示圖。
- 由產品作者自行製作的範例截圖。
- 以自製 HUD 或未確認來源的內容為主的搜尋結果圖片。

這些圖片反映的是特定產品或實作者的視覺選擇，而不是 Ford S650 原車 HMI 的設計規範。它們可以作為產品展示或實作比較資料，但不應單獨用來決定配色、版型或資訊優先順序。

### 1.2 設計目標

S650 風格 HMI 的目標不應是增加裝飾或單純更換色彩，而應建立一套具有下列特徵的性能車儀表系統：

1. 駕駛者第一眼能辨識速度、檔位與 RPM 狀態。
2. Normal、Sport、Track 等模式具有真正不同的資訊構圖與密度。
3. 每個模式都保留一致的資料語意，避免切換模式後功能消失或位置完全失去規律。
4. 復古主題能改變視覺語言，但仍遵循相同的資料優先順序。
5. 高性能模式更聚焦，而不是把更多數據同時塞進畫面。
6. 動畫、發光與警示效果服務於駕駛判讀，不造成視覺噪音。

---

## 2. 外部車款研究摘要

### 2.1 Ford Mustang S650

Ford 官方資料指出，S650 的數位儀表有五種 Cluster Theme：Normal、Sport、Track、Calm、Fox Body 87–93；另外可以開啟 **Match Drive Mode**，讓儀表樣式跟著 Drive Mode 改變。Drive Mode 則是另一組功能狀態，包含 Normal、Sport、Slippery、Track、Drag Strip 與 Custom／MyMode（實際選項依市場與車型而異）。這表示 S650 的主題系統是「模式與資訊版型的聯動」，不是只替同一組儀表換顏色。

因此 renderer 應至少維持以下資料分離：

- `driveMode`：車輛的行駛／性能設定，例如 `slippery` 或 `drag`。
- `clusterTheme`：儀表的視覺與版型，例如 `normal`、`sport`、`track`、`calm`、`foxbody`。
- `matchDriveMode`：是否由 Drive Mode 選擇結果驅動 cluster theme；它是映射設定，不是新的主題。
- `myColor`：使用者的主色與次色偏好；不能覆蓋警告、紅線與可讀性規則。

**OEM 事實與產品邊界：** Ford 官方資料描述 S650 預設儀表使用銅色與深色調，並支援依 Drive Mode 改變的圖形、動畫歡迎畫面與 MyColor；官方沒有為每個 theme 公開完整色票或每一個 Drive Mode 的像素版型。因此本專案下列顏色值與 layout 是產品 token，不應標記為 Ford 原廠色值。

官方車款資料也強調 12.4 吋數位儀表、Information On Demand message center，以及以駕駛者為中心的顯示設計。重要行車資料應保持在駕駛者容易掃視的位置，並避免不必要的視線移動。

從 S650 儀表的公開拆解資料可以觀察到以下版型差異：

- Normal：以日常駕駛資訊為主，速度、檔位、轉速與車輛狀態保持均衡。
- Sport：採用更動態的速度、加速度與性能構圖。
- Track／直線性能版型：強調橫向性能刻度、RPM 與加速狀態，降低日常資訊的干擾；其中 Drag Strip 是 Drive Mode，未必對應一個獨立的 Cluster Theme。
- Calm：降低畫面密度，適合只需要基本速度與車輛狀態的情境。
- Fox Body：使用歷史車款的刻度、字體與綠色夜間儀表語言。

另外，官方車主資料列出的 Auxiliary Gauges 與 Track Apps 使 HMI 不只是固定儀表：駕駛可依車型選擇缸頭溫度、機油／變速箱／車軸溫度、機油壓力、進氣溫度、歧管壓力或電壓等輔助資訊；Track Apps 則包含加速、煞車、單圈、Performance Shift Indicator、Launch Control、Line Lock、Drift Brake 與 Rev Match 等功能。這些內容適合被視為 **可進入的功能狀態或 widget slot**，不應全部常駐在主 cluster。

設計啟示：

- 每個模式應有自己的 layout，而不是所有模式共用同一個雙圓儀表。
- 模式切換應同步改變主刻度、主要資料位置與狀態提示。
- 動畫應用於模式切換與啟動 sweep，不應讓即時數據本身持續產生過度動畫。
- 復古模式應保留歷史風格，但不能因此失去速度、檔位和 RPM 的可讀性。
- Slippery 與 Drag Strip 應由 Drive Mode 層驅動性能狀態、警語與重點 widget；除非有明確的產品設計，不要把它們硬拆成第六、第七個 Cluster Theme。
- 中央觸控螢幕在本次實作只保留靜態佈位與未啟用狀態文字；cluster 只保留駕駛當下需要的結果、狀態與警告。

### 2.2 BMW M

BMW M 的 M View 將中央轉速、Shift Lights、數位速度與檔位視為運動駕駛的核心資訊；左右兩側則提供可替換的 widget 區域，例如：

- G-Meter。
- 輪胎狀態與胎溫。
- 冷卻液溫度。
- 增壓壓力。
- 縱向與橫向加速度。

BMW 的 Track 模式會減少非必要資訊，讓駕駛者集中注意力於賽道與車輛動態。這是一個很重要的性能 HMI 原則：Track 模式不一定要顯示最多資料，而是要顯示最有決策價值的資料。

設計啟示：

- 中央區域需要固定的 Primary Instrument，不應被次要圖表搶走。
- 左右兩側可以設計為 widget slot，讓未來加入 G-Force、胎溫、Boost 或踏板狀態時不需重新設計整個畫面。
- Shift Light 應該是獨立的 renderer primitive，能依 RPM、紅線與引擎狀態改變顏色。
- Track 模式需要主動隱藏低價值資訊，而不是只縮小字體。

### 2.3 Porsche 911

Porsche 911 的數位儀表仍然以中央轉速表作為視覺核心，並透過經典五圓儀表、Sport Chrono 與簡化顯示等不同視圖，兼顧傳統車款識別性與數位化資訊。

Porsche 的設計方向不是完全拋棄類比儀表，而是把原有車款語言轉換成數位系統：

- 中央儀表維持最強視覺權重。
- 左右區域放置次要但可替換的資訊。
- Reduced view 只保留速度、道路標誌、導航提示等必要內容。
- 不同視圖改變資訊密度，但資料語意仍然穩定。

設計啟示：

- Foxbody 應保留官方復古儀表語言；Heritage 與 SVT Cobra 則是本專案的風格延伸，不應只是額外的顏色 preset，而要各自擁有具識別性的儀表語言。
- 所有主題都應共享相同資料介面，以確保速度、RPM、檔位與警告狀態在不同模式下仍可預期。
- 可建立一個 Reduced / Calm 類型的低干擾視圖，作為一般巡航或需要降低畫面複雜度時的選項。

---

## 3. S650 HMI renderer 的實作考量

本節描述適用於 Canvas、SVG、DOM 或其他即時繪圖方案的中性實作考量，不預設特定檔案路徑、函式名稱、Canvas 尺寸或既有資料介面。

### 3.1 版面與解析度

HMI 的畫布比例與實際顯示區域應在實作前確認。寬幅的儀表可以容納橫向 RPM band，但如果同時需要中央主儀表、左右 widget 與底部狀態列，畫面高度也必須保留足夠的垂直空間。

設計時應優先確認：

- 目標顯示器的解析度與 DPI。
- HUD viewport 的實際可用寬高。
- HMI 是否會被遊戲畫面、視窗邊界或其他 overlay 遮擋。
- 縮放後文字、刻度與警告是否仍可辨識。
- 高頻 telemetry 更新是否需要限制重繪區域。

### 3.2 建議的繪圖分層

一個可維護的 renderer 可以將視覺責任拆分為以下層級：

- **資料正規化層**：處理速度單位、檔位標籤、RPM 上限、缺失值與警告狀態。
- **主題 token 層**：定義背景、文字、刻度、紅線、警告、字體與 Glow 強度。
- **共用 primitive 層**：提供弧形刻度、RPM band、數值、Shift Light、widget 與狀態列。
- **模式 layout 層**：決定 Normal、Sport、Track 等模式的資訊位置與密度。
- **動畫層**：處理啟動 sweep、模式切換與必要的狀態轉場。
- **輸出層**：將結果繪製到 Canvas、SVG、DOM 或其他目標表面。

資料正規化與視覺輸出應保持分離。繪圖函式不應在每一幀內重新猜測單位或解讀未正規化的原始封包。

### 3.3 建議的共用 renderer primitives

以下名稱只是概念示例，實際專案可以依語言與架構調整：

- `drawArcGauge()`：刻度、進度弧線、紅線區與指針。
- `drawRpmBand()`：橫向或弧形 RPM 區段。
- `drawShiftLights()`：依 RPM 與紅線狀態顯示換檔燈。
- `drawDigitalReadout()`：速度、檔位、RPM 等主要數值。
- `drawWidgetSlot()`：左右兩側的可替換小型資訊區。
- `drawModeHeader()`：Normal / Sport / Track 與當前狀態。
- `drawStatusStrip()`：單位、溫度、連線、警告或其他底部資訊。
- `drawWarningState()`：Brake、Traction、HUD 狀態或資料異常。

### 3.4 不宜優先處理的方向

以下方向不宜作為第一批工作：

- 先增加更多 Glow、玻璃、漸層與裝飾線。
- 先增加更多顯示數據，但不重新整理資訊優先順序。
- 讓每個主題各自發展完全不同的資料取用邏輯。
- 直接把產品展示圖或自製 HUD 截圖當成 S650 原車風格的驗收基準。

### 3.5 S650 HMI v2 美術方向

本輪迭代採用以下視覺語法，作為所有 renderer 與 moodboard 的共同基準：

| 層級 | 視覺規則 | 目的 |
|---|---|---|
| **底層** | 不透明或極低透明度的深色底；以深炭黑、深灰與少量銅色建立座艙感。 | 讓文字、刻度與警告在不同遊戲背景上都穩定可讀。 |
| **主資訊** | 冷白／暖白的速度、檔位與 RPM；數字採穩定等寬或明確的 display numeral。 | 第一眼辨識核心駕駛資訊，不被主題色吞沒。 |
| **模式識別** | 每個模式最多一個主強調色；由版型、刻度密度、主儀表方向與狀態標籤共同表現模式。 | 避免「換顏色就假裝換模式」。 |
| **性能狀態** | Shift Light、紅線區、接近極限與 Track-use 狀態使用短暫、位置穩定的高亮。 | 讓動態效果直接對應駕駛決策。 |
| **材質** | 細線、分區、內陰影與局部金屬漸層；不在 cluster 內堆疊玻璃卡片、厚重模糊或大面積霓虹。 | 保留數位儀表的精密感，避免變成桌面 dashboard。 |
| **動效** | 只允許啟動／離開、模式切換、shift light 與必要警告轉場使用動畫。 | 保留 S650 的數位座艙戲劇性，同時避免 60Hz telemetry 造成視覺抖動。 |

### 3.6 Cluster 與中央螢幕的研究／實作邊界

S650 的 12.4 吋 cluster 與 13.2 吋中央顯示器位於同一片整合玻璃之下，但設計任務不同：

| 表面 | 應承載 | 不應承載 |
|---|---|---|
| **Cluster** | 速度、檔位、RPM、shift light、警告、模式狀態、少量高價值 telemetry。 | 多層 glass card、長文字說明、完整設定流程、持續旋轉的 3D 車輛。 |
| **中央螢幕／HMI 設定頁** | 本次只保留靜態版位與未啟用狀態文字，作為未來擴充的視覺佔位符。 | Track Apps、Auxiliary Gauges、MyColor、Drive Mode 設定、完整圖形互動與結果列表均不在本次範圍。 |

這個邊界也適用於本專案：Halfmoon／Glassmorphism 主要服務既有桌面設定頁；Canvas HMI 只共享語意 token，不直接套用 `.glass-panel` 卡片外觀。主 GUI 可以設定 S650 的 theme 與 drive mode，但 HMI 畫面本身不提供同等設定流程。

### 3.7 人體工學尺寸與版面校準

ISO 15008:2017 的官方定位是行進中車載動態視覺資訊的影像品質、可讀性與測試要求；ISO 2575:2021 的官方定位是車輛控制、指示器與 tell-tale 的識別符號及其應用。它們是驗證方向，不代表目前 Canvas 已取得法規合規認證。

本專案採用追加材料中的 700–800 mm 觀看距離作為初始校準，並把以下數值放入 `s650_tokens.js` 的 ergonomics token：

- 字高檢查基準：`min = viewingDistance × 0.0046`、`recommended = viewingDistance × 0.0070`。以 750 mm 計算約為 3.45 mm 與 5.25 mm；主讀數另採產品層級的 64 px 目標，次要文字採 24 px，任何動態儀表文字不低於 15 px。
- 雙環：目前 viewport 固定為 1260×240，不能直接套用 1920×720 螢幕的橫向比例。Normal、Foxbody、Heritage 的雙環半徑改為 90 px、中心 y=122，直徑 180 px，約佔 Canvas 高度 75%；這是在保留 32 px header 與 28 px footer 後可實際容納的下限比例。
- 刻度：大刻度長度 26 px、寬度 3 px；小刻度長度 14 px、寬度 2 px；指針基準寬度 3 px。這些是 Canvas 初始 token，最後仍需依實際顯示器 PPI 與觀看距離做 1:1 驗證。
- Tell-tale 預留區：footer 左側保留 360×28 px 的警告區，警告圖示目標 28 px；本次只建立版位契約，不臆造未由 telemetry 提供的警告狀態。

因此版面調整的優先順序是：先確保主速度／檔位／RPM 的字高與第一眼辨識，再確認雙環在安全區內的直徑與刻度，最後才處理顏色、Glow 與主題裝飾。任何需要實機觀看距離、PPI 或環境光才能決定的數值，都必須標記為 calibration，而不是寫死成「法規像素值」。

---

## 4. 共用 HMI 資訊骨架

建立 S650 風格 HMI 時，建議所有模式共用資料層與基本資訊區域，再由各模式改變視覺構圖：

```text
┌──────────────────────────────────────────────────────────┐
│ MODE / VEHICLE STATE / WARNING / SHIFT LIGHT             │
├───────────────┬───────────────────────┬──────────────────┤
│ LEFT WIDGET   │ PRIMARY SPEED / GEAR  │ RIGHT WIDGET     │
│ optional      │ RPM / MAIN INDICATOR  │ optional         │
├───────────────┴───────────────────────┴──────────────────┤
│ UNIT / TEMPERATURE / DRIVE STATUS / TELEMETRY SUMMARY    │
└──────────────────────────────────────────────────────────┘
```

### 4.1 資訊優先順序

所有模式都遵循以下優先級，除非該模式明確使用不同的主要儀表：

1. 車輛當前速度。
2. 車輛當前檔位。
3. RPM 與換檔提示。
4. 當前 HMI / Drive Mode。
5. 重要警告與車輛狀態。
6. G-Force、胎溫、Boost、踏板或懸吊等性能輔助資訊。
7. 單位、環境與其他次要狀態。

### 4.2 資料與視覺分離

繪圖 primitive 只負責視覺輸出，不應在每一幀內重新猜測單位、重新解讀原始封包或修改產品狀態。資料正規化、單位轉換、警告判斷與視覺輸出應保持清楚分層。

如果同一份 telemetry 資料需要同時供 HMI、分析畫面或其他 overlay 使用，應先建立穩定的正規化資料模型，再由不同視圖決定如何呈現。

### 4.3 Drive Mode 與 Cluster Theme 對照原則

以下是產品 renderer 的建議映射，不宣稱是 Ford 未公開的原廠一對一規格：

| Drive Mode | 預設構圖方向 | Cluster Theme 建議 | 視覺／資訊重點 |
|---|---|---|---|
| Normal | 均衡日常 | Normal | 速度、檔位、RPM 與車況平均分配；低強度銅色或冷白焦點。 |
| Sport | 性能駕駛 | Sport | 上方 RPM band、中央速度／檔位、性能 widget；提高換檔提示權重。 |
| Track | 賽道 | Track | 大型檔位或 RPM／shift light，僅保留一至兩個高價值 widget；顯示必要 Track-use 狀態。 |
| Drag Strip | 直線加速 | Sport 或專用 Drag layout | 直線加速、Launch／Shift 狀態與紅線提示；減少 G-Force、環境與導航等非必要資訊。 |
| Slippery | 低抓地路面 | Normal 或 Calm | 降低動效與對比噪音，突出抓地／穩定控制警示；不以高性能紅色主題誤導駕駛。 |
| Custom／MyMode | 使用者自訂 | 依 `Match Drive Mode` 或使用者選擇 | 允許資料設定與色彩偏好混合，但核心資訊位置與警告語意不能被自訂破壞。 |

**重要限制：** `Match Drive Mode` 關閉時，切換 Drive Mode 不應偷偷重排 cluster；`clusterTheme` 應保持使用者選擇。`MyColor` 也只能修改可自訂的主／次色，不能把紅線、警告與無資料 fallback 染成不可辨識的顏色。

---

## 5. 各 S650 HMI 模式的設計方向

### 5.1 Normal

**定位：** OEM 日常駕駛模式，資訊均衡、清楚、低干擾。

**建議版型：**

- 左右為速度與 RPM 的圓弧儀表，避免過度厚重的完整圓盤。
- 中央放置大型速度或檔位，依目前檔位與車速狀態決定主次。
- 頂部顯示 `NORMAL` 與基本車輛狀態。
- 左右 widget 可顯示油門/煞車、胎溫或簡單 G-Force。
- 底部顯示單位、環境溫度與重要警告。

**建議色彩：** 深炭黑背景、冷白／暖白文字、低強度銅色主刻度；僅在警告與紅線使用紅／橘色。青色可以作為產品自訂色，但不作為 S650 baseline。

**視覺原則：** 保持類似 OEM 儀表的安定感，Glow 只用於焦點與目前值。

### 5.2 Sport

**定位：** 以性能駕駛為中心，增加動態感與換檔判讀效率。

**建議版型：**

- 上方使用橫向或微弧形 RPM band。
- 中央突出數位速度與目前檔位。
- 轉速接近紅線時，Shift Light 由冷色逐步轉為黃色、橘色與紅色。
- 左右 widget 顯示 Boost、油門/煞車、G-Force 或胎溫。
- 模式標籤與紅線狀態應具有明確的性能識別。

**建議色彩：** 黑色背景、白色主要數值、銅色或暖橘色性能強調色；紅色只用於紅線、警告與極限狀態，避免同時使用青色、紫色與紅色作為主色。

**視覺原則：** 讓 RPM 與換檔提示成為畫面上方的主要動態元素，速度與檔位保持在中央。

### 5.3 Track

**定位：** 賽道專用，低干擾、高判讀效率。

**建議版型：**

- 大型橫向 RPM band 或上方分段式 Shift Light。
- 中央使用大型檔位，速度作為次要但清晰的數值。
- 保留紅線區、換檔提示與必要警告。
- 只保留一至兩個高價值 widget，例如 G-Force、胎溫或踏板輸入。
- 移除與賽道駕駛無關的環境資訊與過多裝飾。

**建議色彩：** 近黑背景、白色刻度、紅色紅線與警示，少量黃色作為接近紅線的過渡狀態。

**視覺原則：** Track 模式應該比 Normal 更簡潔，而不是更擁擠。

### 5.4 Calm

**定位：** 低干擾、低亮度的巡航視圖。

**建議版型：**

- 中央使用大型速度數值。
- RPM 改為小型弧線或底部狀態條。
- 只保留檔位、單位與必要警告。
- 減少刻度、線條與發光效果。

**建議色彩：** 深灰／低飽和藍灰背景、低亮度銅灰或藍灰主色、柔和白色文字；不要用持續 Glow 製造「安靜」感。

**視覺原則：** Calm 不應只是把 Normal 的顏色變淡，而是要降低資訊密度。

### 5.5 Foxbody

**定位：** 1987–1993 Fox Body 復古儀表語言。

**建議版型：**

- 保留綠色夜間儀表、橘紅色指針與類比刻度。
- 使用清楚的雙圓儀表，但避免過度現代的霓虹 Glow。
- 中央保留檔位與速度的數位資訊，作為數位 HUD 的必要補充。
- 可加入較短的啟動 sweep，模擬老式儀表自檢。

**建議色彩：** 黑色、綠色、橘紅色；白色只作為日間或警告狀態。

### 5.6 Heritage '67

**定位：** 產品的 Heritage 延伸主題，以 1967 Mustang 的經典金屬儀表與暖色調為靈感；不是 S650 官方五種 Cluster Theme 之一。

**建議版型：**

- 使用象牙白刻度與金屬圓環。
- 紅色指針作為唯一強調元素。
- 中央加入清楚的檔位與速度資訊，避免只剩裝飾性圓環。
- 背景可使用深咖啡或接近黑色的暖色，不使用高透明玻璃效果。

**建議色彩：** 深咖啡、象牙白、金屬灰、紅色指針。

### 5.7 SVT Cobra

**定位：** 產品的性能延伸主題，以黑白高對比與 Cobra 競技識別為靈感；不是 S650 官方五種 Cluster Theme 之一。

**建議版型：**

- 黑底、白色刻度與大面積留白。
- 紅色只用於指針、紅線與警告。
- 轉速與檔位的視覺權重高於次要 telemetry。
- 可在模式標籤或中央區域加入低干擾的 Cobra 識別元素，但不應影響數值判讀。

---

## 6. 色彩、字體與材質規範

### 6.1 建議的基礎色彩

以下是 **產品 renderer token**，是根據官方所描述的「銅色＋深色」基準整理出的實作起點，不是 Ford 公開的原廠色票。若啟用 MyColor，應只替換 `hmi-primary`／`hmi-secondary` 等可自訂 token，保留語意色的可讀性。

| 用途 | 建議色彩 | 使用原則 |
|---|---|---|
| 儀表背景 | `#0B0D0F` ~ `#15181B` | 以深色不透明背景為主，避免遊戲背景透出干擾刻度。 |
| 主要文字 | `#F4F1E8` | 速度、檔位、核心狀態；保持高對比。 |
| 次要文字 | `#98A0A8` | 單位、輔助標籤、低優先資訊。 |
| S650 baseline 主色 | `#C98D5A` | 銅色焦點、模式識別與少量目前值；不大面積填滿畫面。 |
| Normal 主色 | `#C98D5A` | 穩定、低干擾的主要刻度與目前值。 |
| Sport 主色 | `#FFB566` | 暖色性能強調；不與紅線警告混為一談。 |
| Track 主色 | `#FFFFFF` + `#FF2A2A` | 白色資訊、紅色警告與紅線 |
| Calm 主色 | `#8EA1B5` | 低飽和、低亮度的巡航焦點。 |
| Foxbody 主色 | `#00FF66` | 復古綠色儀表 |
| Heritage 主色 | `#F5E8C8` | 象牙白刻度 |
| Warning | `#FFB020` | 接近極限或注意狀態 |
| Danger | `#FF2A2A` | 紅線、錯誤、警告 |

以上色彩不應直接覆寫桌面 HMI 的 Halfmoon Theme Token。Canvas HMI 與 React 設定頁可以共享 `primary`、`warning`、`danger` 等語意名稱，但實際色值與材質應依各自的可讀性需求調整。

### 6.2 發光效果

- 主要數值不應全部帶有 Glow。
- Glow 只用於 Shift Light、目前檔位、紅線區、警告與模式切換焦點。
- 歡迎／離開動畫可以作為品牌識別，但應是短暫、可中斷的狀態，不應成為即時 telemetry 的常駐背景動畫。
- 靜止狀態下的背景不使用持續呼吸動畫。
- 60Hz telemetry 更新時避免讓整個 Canvas 產生大面積透明度或陰影變化。

### 6.3 字體與數字

- 速度、RPM、檔位使用具有清晰數字寬度的 Display 字體。
- 模式標籤與小型狀態文字使用簡潔、窄體、容易掃視的無襯線字體。
- 復古主題可使用歷史感字體，但核心速度、RPM 與檔位不能使用難以辨識的裝飾字體。
- 同一模式內的數字寬度、基線與小數位數應保持穩定，避免即時數值變化造成版面抖動。

### 6.4 材質

S650 Canvas 內部不應延續設定頁大量的 Glassmorphism 卡片。建議採用：

- 不透明或低透明度深色底。
- 細線、刻度與分區建立層次。
- 低強度陰影或內陰影表示儀表深度。
- 少量金屬漸層只保留給 Heritage 等特定主題。
- 未來若需要呈現 central display 的 3D／車輛圖形，應放在中央螢幕或 welcome／mode transition 狀態；本次不繪製 3D，也不把 3D 裝飾常駐在 cluster 核心讀數後方。

---

## 7. 建議的開發路線

以下階段提供建立 S650 HMI 時的低風險切入順序，實際順序可依產品需求、資料來源與技術限制調整。

### Phase 0：確認環境並建立視覺基準

- 確認 HUD viewport、顯示器縮放與可用的畫面比例，不預設特定的 Canvas 尺寸。
- 為 Normal、Sport、Track、Calm、Fox Body 各建立一張外部參考 moodboard 或文字版型圖；另為 Slippery、Drag Strip 建立 Drive Mode 狀態註記，而不是直接新增 theme。
- 確認可用 telemetry payload 欄位：速度、RPM、檔位、Max RPM、油門、煞車、G-Force、胎溫與 Boost。
- 確認 `driveMode`、`clusterTheme`、`matchDriveMode`、`myColor`、`trackUse` 與 `warningState` 的資料界線。
- 確認所有模式的亮度與文字最小尺寸。

### Phase 1：建立共用 primitive

- 建立弧形刻度、進度、紅線區與指針等基礎元件。
- 新增 `drawRpmBand()` 與 `drawShiftLights()`。
- 新增中央速度、檔位與模式標籤元件。
- 新增左右 widget slot 與底部狀態列。
- 為未來中央螢幕保留靜態佔位符版位；不新增 Track Apps／Auxiliary Gauges 功能或設定流程。
- 讓繪圖函式只接收已正規化資料與 style tokens。

### Phase 2：完成 Normal / Sport / Track

- Normal：雙弧形儀表 + 中央速度/檔位。
- Sport：上方 RPM band + 中央速度/檔位 + 左右性能 widget。
- Track：大型 Shift Light + 中央檔位/速度 + 最少數量的 widget。
- Slippery：沿用低干擾版型，增加抓地／穩定控制狀態提示。
- Drag Strip：沿用性能版型，僅在儀表板摘要直線加速、Launch 與 Shift 狀態；不實作 Track Apps、Launch Control 設定或其他性能頁面。
- 為每個模式加入啟動 sweep 與模式切換的短動畫。

### Phase 3：完成 Calm / Foxbody / Heritage / SVT Cobra

- Calm：簡化資訊視圖。
- Foxbody：復古綠色類比語言。
- Heritage：象牙白、金屬環與暖色背景。
- SVT Cobra：黑白高對比與紅色性能提示。
- 確保所有主題仍使用相同資料介面與警告處理。

### Phase 4：驗證與微調

- 對照實際遊戲畫面檢查遮擋、可讀性與縮放。
- 檢查白天高亮背景與夜間低亮度背景下的對比度。
- 檢查銅色 baseline、MyColor 自訂色與紅／黃警告色在同一畫面中的語意是否仍清楚。
- 驗證單位切換不會造成數值重複轉換。
- 驗證 `gear = 0`、`gear = 11`、無 telemetry、接近紅線與警告狀態。
- 確認 60Hz 更新時沒有不必要的大面積 Canvas 重繪效果。
- 更新 S650 renderer 相關測試或加入 renderer smoke test。

---

## 8. 視覺驗收清單

本清單可作為 S650 HMI 初版完成後的視覺與穩定性驗收基準。

### 資訊架構

- [ ] 速度在所有模式中都能於第一眼辨識。
- [ ] 檔位不會被模式標籤、裝飾或 widget 淹沒。
- [ ] RPM 與紅線狀態具有清楚的視覺提示。
- [ ] Track 模式的資訊量低於或等於 Sport，而不是單純增加更多數據。
- [ ] Drive Mode（Normal／Sport／Slippery／Track／Drag Strip／Custom）與 Cluster Theme（Normal／Sport／Track／Calm／Fox Body）在資料與 UI 上沒有混用。
- [ ] Slippery 與 Drag Strip 的儀表狀態能被辨識；Track Apps 與 Auxiliary Gauges 僅保留靜態佔位符，不會建立額外功能頁。
- [ ] 警告狀態不依賴顏色單獨傳達，並有文字或位置提示。

### 視覺一致性

- [ ] 所有模式共享一致的速度、檔位、警告與單位資料語意。
- [ ] 模式差異來自版型、刻度、字體與強調色，而不只是背景換色。
- [ ] 每個模式最多使用一個主強調色與一個警示色。
- [ ] Glow 只用於焦點狀態，不讓整個畫面持續發光。
- [ ] S650 baseline 使用深色與銅色語法；青／紫等產品自訂色沒有反過來定義 OEM 風格。
- [ ] Cluster 不使用桌面設定頁的 Glassmorphism 卡片；中央螢幕與其他輔助視窗僅保留靜態佔位符，不具備 3D／互動內容。
- [ ] 復古模式保留風格，但核心數字仍具有現代可讀性。

### 效能與穩定性

- [ ] 60Hz telemetry 更新時不產生不必要的 layout 或 DOM 操作。
- [ ] 模式切換動畫不會阻塞即時 telemetry。
- [ ] 佔位符沒有 click handler、API 呼叫、假資料或額外狀態管理。
- [ ] 變更主題後 Canvas 能立即重繪當前 frame。
- [ ] 無資料或資料異常時有穩定的 fallback 畫面。
- [ ] Canvas scale 改變時，文字與刻度不產生明顯失真。

---

## 9. 外部參考來源

### Ford

- [Ford Mustang 官方車款頁：12.4 吋 IOD Cluster、13.2 吋中央螢幕、Driver-centric Cockpit、Track Apps 與 2026 RTR 歡迎／離開動畫案例](https://www.ford.com/cars/mustang/)（本輪於 2026-08-10 查閱）
- [Ford Mustang 官方車主教學：Cluster Theme、Normal、Sport、Track、Calm、Fox Body、Match Drive Mode、MyColor 與 Auxiliary Gauges](https://www.me.ford.com/en/sau/ownersite/discover-your-ford/mustang/customizing-mymustang-car-controls/)（本輪於 2026-08-10 查閱）
- [Ford Mustang 官方 Drive Modes 說明：Normal、Sport、Slippery、Track、Drag Strip、Custom 與 cluster graphics](https://www.ford.com/support/how-tos/ford-technology/mustang-features/how-do-i-use-the-mustang-drive-modes/)
- [Ford Mustang 官方 Track Apps 說明：Acceleration、Brake、Lap、Launch、Shift Indicator、Line Lock、Drift Brake、Rev Match](https://www.ford.com/support/how-tos/ford-technology/mustang-features/how-do-i-use-the-mustang-track-apps/)
- [Ford Media Center：S650 driver-centric cockpit、12.4 吋 cluster、13.2 吋 SYNC 4、銅色／深色預設與 Unreal Engine 互動圖形](https://media.ford.com/content/fordmedia/feu/gb/en/products/passenger-vehicles/mustang.html)
- [Ford Media Center：Mustang GT 數位座艙、Drive Mode-dependent visuals、動畫設計與銅色基準](https://media.ford.com/content/fordmedia/img/za/en/news/2024/07/New-Ford-Mustang-GT-Redefines-Driving-Freedom-with-Immersive-Digital-Cockpit-Advanced-50L-V8-Engine-and-Bold-Style.html)

### ISO / 車載可讀性與警告符號

- [ISO 15008:2017 官方頁面：Road vehicles — Ergonomic aspects of transport information and control systems — Specifications and test procedures for in-vehicle visual presentation](https://www.iso.org/standard/62784.html)（本輪於 2026-08-10 查閱；官方定位為行進中動態視覺資訊的可讀性與測試要求）
- [ISO 2575:2021 官方頁面：Road vehicles — Symbols for controls, indicators and tell-tales](https://www.iso.org/standard/68409.html)（本輪於 2026-08-10 查閱；官方定位為控制、指示器與 tell-tale 符號及其應用）

### BMW

- [BMW X5 M / X6 M 官方資料：M View、中央轉速、Shift Lights 與可替換 widget](https://www.press.bmwgroup.com/usa/article/detail/T0301383EN_US/the-new-2020-bmw-x5-m-and-x6-m)
- [BMW M4 CSL 官方資料：Sport / Track、M View 與運動駕駛資訊](https://www.press.bmwgroup.com/ireland/article/detail/T0392614EN/the-new-bmw-m4-csl)

### Porsche

- [Porsche 911 官方介紹：中央轉速表、Power Meter 與五圓儀表視圖](https://www.porsche.com/stories/mobility/all-about-the-new-911/)
- [Porsche Newsroom：數位儀表的 Power Meter、Map、Full Map 與 Reduced View](https://newsroom.porsche.com/en_US/products/taycan/interior-design-18552.html)
- [Porsche Newsroom：911 傳統轉速表與左右可變資訊區](https://newsroom.porsche.com/en/2019/products/porsche-911-rev-counter-analogue-eight-generations-992-timeless-machine-valencia-16966.html)

### 補充性資料

- [S650 Mustang Digital Dash Guide：各 Drive Mode 的公開版型觀察](https://www.cjponyparts.com/resources/s650-mustang-digital-dash-guide)

> 補充性資料只用於觀察實際畫面版型；若與 Ford 官方資料衝突，以 Ford 官方資料為準。

> 本輪研究的外部結論只將官方資料作為 OEM 事實；銅色 token、各模式 layout、Heritage／SVT Cobra 延伸主題與動效限制，均屬本專案的產品決策。
