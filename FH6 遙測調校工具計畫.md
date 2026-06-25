# **Forza Horizon 6 專家級動態遙測分析與智能化調校系統架構與實作研究報告**

## **系統研發背景與核心架構概述**

隨著虛擬賽車模擬技術的演進，《Forza Horizon 6》（以下簡稱 FH6）在車輛動態物理模型上展現了極高的複雜度。該遊戲內建的「Data Out」動態遙測（Telemetry）功能，允許車輛在行駛過程中以每秒 60 幀（60Hz）的頻率，將超過八十項的物理變數透過 UDP 協定廣播至指定的 IP 位址1。然而，對於絕大多數玩家而言，龐大且瞬息萬變的原始數據流難以直接轉化為具體的調校（Tuning）決策。即便玩家能夠理解基礎的車輛動態學，要在遊戲內繁雜的懸吊、防傾桿、阻尼、齒輪比與差速器等九大調校區塊中找到最佳平衡，仍需耗費大量時間進行試錯。  
為解決數據解讀與調校最佳化之間的斷層，本研究旨在規劃並實作一款專為 FH6 設計的專家級輔助調校工具。該系統的架構基於 Python 後端與 Tauri 前端框架，具備以下核心能力：首先，透過 UDP 網路通訊即時讀取並解析二進制遙測封包；其次，利用遙測封包中的車輛識別碼（CarOrdinal）查表，結合玩家手動覆寫的車重與配重參數，精確鎖定目標車款的物理基礎；第三，在前端介面完美復刻遊戲原生的調校數值區塊與滑桿，並根據內建的車輛動力學理論，自動計算出建議的調校起始值（Baseline Setup）；第四，系統將錄製並比對「理論預測數據」與「實際遙測數據」，並透過內建的啟發式物理規則（Heuristics）與本地端大型語言模型（LLM），提供精準的下一步調校方向建議。本報告將針對上述各項子系統的理論基礎、演算法設計與具體實作方案進行全面且深入的探討。

## **UDP 遙測通訊協定與 Python 後端資料解析**

要建構即時的遙測分析工具，首要任務是建立穩定且低延遲的資料擷取管線。FH6 延續了系列作的遙測輸出機制，採用無連線狀態的 UDP 協定，這意味著遊戲端僅負責「射後不理」（Fire-and-forget）地發送封包，不保證封包的抵達順序與完整性3。因此，後端系統的設計必須具備高度的容錯性與非同步處理能力。

### **封包結構與位元組解析**

FH6 輸出的遙測封包主要分為「Sled」與「Dash (V2)」兩種格式，其中 V2 格式包含了 324 bytes 的資料，涵蓋了引擎轉速、懸吊行程、輪胎滑移角、車身加速度等極具價值的動態參數1。而在 Forza Horizon 系列中，封包格式可能存在未公開的 V3 變體，這需要在解析時預留特定的位移量（Offset）4。  
在 Python 後端中，解析此類二進制資料流的最佳實踐是利用內建的 struct 模組。由於 C 語言結構體在記憶體中的對齊特性，開發者必須精確定義解碼字串（Format String）。典型的 Forza 遙測資料型態包含有號 32 位元整數（s32）、無號 32 位元整數（u32）、32 位元浮點數（f32）以及無號 8 位元整數（u8）1。

| 變數名稱 | 資料型態 | 位元組長度 | 物理意義與用途 |
| :---- | :---- | :---- | :---- |
| IsRaceOn | s32 | 4 | 判定目前是否處於比賽或自由駕駛狀態，數值為 1 時系統才進行數據紀錄1。 |
| CurrentEngineRpm | f32 | 4 | 引擎當前轉速，用於動態馬力扭力曲線（Dyno Curve）的繪製與齒輪比計算1。 |
| AccelerationX / Y / Z | f32 | 12 | 三軸加速度（公尺/秒平方），X 軸用於計算橫向 G 力，Z 軸用於縱向加減速分析1。 |
| NormalizedSuspensionTravel | f32 \* 4 | 16 | 四輪獨立的歸一化懸吊行程，0.0 為完全伸張，1.0 為完全壓縮，用於觸底偵測1。 |
| TireSlipAngle | f32 \* 4 | 16 | 四輪輪胎側向滑角，數值大於 1.0 代表喪失側向抓地力，用於轉向過度/不足分析1。 |
| CarOrdinal | s32 | 4 | 車輛唯一識別碼，用於在本地資料庫中查詢車型原廠參數1。 |

後端系統將在獨立的執行緒或 asyncio 協程中開啟 UDP Socket 綁定於本機連接埠（通常為 5300 或 65530）2。接收到 324 bytes 的資料後，使用類似 \<iIffff... 的 Little-Endian 格式字串進行 struct.unpack 解碼，並迅速將資料封裝為 Pydantic 模型，確保後續資料處理的型別安全（Type Safety）6。

### **即時資料推播與非同步架構**

為了讓前端介面能夠以 60Hz 的更新率流暢顯示動態儀表板（如轉速表、G 力牽引力圓），系統必須避免傳統的 HTTP 輪詢（Polling）機制，改採 WebSockets 提供全雙工、低延遲的通訊管道7。後端可透過 FastAPI 框架實作 WebSocket 管理員（Connection Manager），當接收並解析完一幀 UDP 資料後，立即將 JSON 格式的負載推播至所有連線的前端客戶端。這種架構不僅減輕了網路負載，也確保了前端 Tauri 應用程式能以最快的速度渲染物理動態2。

## **目標車款識別與物理基礎參數模型**

調校的核心在於理解車輛的基礎物理特性。在 FH6 中，雖然遙測封包提供了極為詳細的動態響應，但對於車輛的靜態物理參數（如總重量、重心高度、前後重量分佈百分比）卻未直接提供10。這些靜態參數是計算理論彈簧磅數與阻尼係數的絕對前提。

### **車輛識別碼查表系統（CarOrdinal Lookup）**

遙測封包中的 CarOrdinal 是一個有號 32 位元整數，代表了當前駕駛的車款（例如 2542 代表 2017 Alfa Romeo Giulia Quadrifoglio）12。系統必須在本地端維護一個 SQLite 或 JSON 格式的車輛資料庫。當接收到新的 CarOrdinal 時，系統會自動查詢該車型的原廠整備重量、原廠前後重量分佈、引擎位置與驅動型式（FWD、RWD 或 AWD）1。這個查表過程是自動化調校的第一步，為系統提供了初始的物理邊界條件。

### **改裝參數的使用者手動介入（Manual Override）**

在實際的遊戲過程中，玩家幾乎不可避免地會對車輛進行輕量化減重、安裝防滾籠，或是進行引擎置換（Engine Swap）。這些改裝行為會劇烈改變車輛的總重量與重量分佈，且這些變化後的數值無法從 CarOrdinal 查表中獲取，也不存在於 UDP 封包中13。  
因此，本工具的 UI 介面必須設計一個「車輛基礎參數覆寫」區塊。當玩家進入工具時，系統會顯示基於 CarOrdinal 查表所得的原廠數據，但同時允許玩家手動填寫遊戲改裝介面中顯示的「最終車重（公斤/磅）」與「前輪重量分佈（%）」14。一旦使用者更新了這些數值，系統內部的物理引擎將立刻以此新數據為基準，重新計算每個車輪承受的簧上質量（Sprung Mass），進而更新所有的建議調校數值。

## **前端原生介面復刻與理論計算模型**

為了降低玩家的學習曲線，工具的前端應使用 Tauri 結合 React 或 Vue 進行開發，並透過 CSS 完美復刻 Forza 遊戲內的原生調校介面風格（例如微軟的 Fluent Design，深色背景搭配高對比度的滑桿）16。介面應包含九大分類標籤，且每一項均支援數值手動輸入與滑桿拖曳。更重要的是，當使用者拖曳這些滑桿時，系統會同步顯示「當前設定值」與「系統理論建議值」的差異。

### **彈簧與懸吊自然頻率計算（Spring Rates & Ride Frequency）**

彈簧的軟硬直接決定了車輛在加減速與過彎時的重量轉移量，同時也影響車身對於路面顛簸的吸收能力。在賽車工程中，彈簧磅數通常藉由設定「懸吊自然頻率（Natural Ride Frequency）」來反向推導18。  
一般而言，民用車的自然頻率約在 1.0 \- 1.5 Hz 之間，高性能跑車介於 1.5 \- 2.0 Hz，而具備強大空氣動力學下壓力的純種賽車則可能高達 2.5 \- 3.5 Hz10。在英制單位（磅/英吋，lb/in）的環境下，Forza 社群廣泛驗證的基礎公式如下：  
![][image1]  
其中 ![][image2] 為給定車軸的彈簧磅數，![][image3] 為目標自然頻率（Hz），![][image4] 為該車軸承受的重量（磅）18。若將此公式展開並應用於前後輪，系統可根據玩家設定的前輪重量分佈（![][image5]）與車輛總重（![][image6]）精確計算出維持車身俯仰平衡的彈簧設定：  
![][image7]  
![][image8]  
若系統需要生成不依賴頻率的基礎建議值（Baseline），則可採用 Forza 遊戲內調校上下限的線性插值法：  
![][image9]  
![][image10]  
這種基於重量分佈的分配方式能確保車輛在靜態時具備中性的轉向特性18。

### **防傾桿動態平衡（Anti-Roll Bars, ARB）**

防傾桿主要在車輛轉向（特別是彎中階段）時作動，用於限制車身側傾並微調前後軸的側向抓地力平衡。若前防傾桿過硬，會導致轉向不足（Understeer）；若後防傾桿過硬，則會誘發轉向過度（Oversteer）21。  
FH6 的防傾桿數值介於 1.00 至 65.00 之間。維持中性轉向的基準數學公式同樣高度依賴重量分佈：  
![][image11]  
![][image12]  
針對不同的驅動型式，系統會自動微調此公式的結果：對於大馬力的後輪驅動（RWD）車款，系統會建議稍微調軟後防傾桿，以增加後輪在出彎時的牽引力；對於容易推頭的全時四驅（AWD）車款，則會建議適度調硬後防傾桿，促使車尾在彎中產生一定程度的滑動以輔助轉向20。

### **阻尼力矩的臨界比例（Damping: Rebound and Bump）**

阻尼控制著彈簧壓縮與回彈的速度。回彈阻尼（Rebound）負責在懸吊伸張時抓住彈簧，防止車身無止盡地上下晃動；壓縮阻尼（Bump/Bound）則控制輪胎壓過路緣石或顛簸時的衝擊吸收25。  
在完美的阻尼模型中，系統會將壓縮阻尼設定為回彈阻尼的 50% 至 75% 之間18。具體的計算同樣可以依賴重量分佈，並隨著彈簧磅數的改變進行縮放。當玩家在介面上調硬了彈簧，系統會透過阻尼連動機制自動提升阻尼值，確保阻尼力足以控制更強的彈簧反作用力，避免車輛產生「彈跳」現象13。

### **齒輪比優化與動力帶匹配（Gearing & Powerband）**

齒輪比調校的目標是確保車輛在每次換檔後，引擎轉速能精準落在「動力帶（Powerband）」內，即最大扭力與最大馬力之間的轉速區間28。  
雖然遊戲並不一定直接輸出每輛車的馬力圖，但系統可以透過記錄玩家在直線加速時的遙測數據（轉速與即時扭力 Torque），在背景自動繪製動態馬力扭力曲線（Dynamic Dyno Curve）28。有了扭力曲線後，系統的齒輪比優化模組會計算每次換檔的轉速落差。理想的設定是讓一檔足夠長以防止嚴重的輪胎打滑，隨後的二檔至六檔則逐漸縮短齒比間距（呈現對數曲線分佈），確保每一次升檔後的轉速都恰好位於最大扭力湧現的起點，從而榨出引擎的極限加速性能31。

## **理論預測與實際遙測數據之比對分析**

一個專業的調校工具不僅是給出靜態的理論建議，更需要將「理論測量數據」與「實際動態遙測」進行疊加比對，從中找出調校的缺陷。系統會將收集到的 60Hz 時間序列數據寫入 SQLite 資料庫，並在前端圖表中呈現17。

### **滑移角與轉向特性的理論比對（Slip Angle & Under/Oversteer）**

車輛的轉向平衡可以透過輪胎滑角（Slip Angle）來精確量化。遙測封包中的 TireSlipAngle 數值超過 1.0 即代表該輪胎突破了側向摩擦力的極限1。 系統會持續監控前後輪的滑角差異，並將其實際軌跡與理論上的阿克曼轉向幾何（Ackermann Steering Geometry）預期路徑進行比對：

* **理論與實際比對 \- 轉向不足（Understeer）**：當遙測顯示前輪滑角顯著大於後輪，且前輪滑角超過極限值，但橫向 G 力（AccelerationX）並未隨方向盤轉角增加而提升時，系統會判定實際轉向半徑大於理論預測半徑，即發生嚴重推頭21。  
* **理論與實際比對 \- 轉向過度（Oversteer）**：若後輪滑角與綜合滑移（TireCombinedSlip）急劇飆升超過前輪，意味著車尾正向彎外滑出，實際轉向半徑小於理論半徑36。 系統會在賽道地圖的軌跡上，以紅色標示轉向過度區域，藍色標示轉向不足區域，讓玩家一目了然38。

### **懸吊行程與阻尼速度直方圖（Suspension Travel & Damper Velocity）**

封包中的 NormalizedSuspensionTravel 給出了 0.0 到 1.0 的相對行程。理論上，完美的彈簧與阻尼設定應讓懸吊在過彎與煞車時充分利用行程，但絕對不能觸及極限（觸底）39。

* **觸底偵測**：若遙測數據顯示行程持續維持在 0.95 以上，代表懸吊觸底（Bottoming Out），這會導致底盤直接撞擊路面，瞬間喪失所有機械抓地力2。  
* **阻尼速度理論比對（Damper Velocity Histogram）**：系統會對懸吊行程進行時間的數值微分，求得「懸吊作動速度」3。隨後繪製出阻尼速度直方圖，將實際的壓縮與回彈速度分佈，與理想的對稱鐘形曲線進行比對。若直方圖呈現偏斜，表示高速或低速阻尼設定錯誤，無法有效吸收路面衝擊28。

### **輪胎溫度分佈理論（Tire Temperatures）**

在精細的遙測輸出中，若支援輪胎內、中、外側（Inner, Middle, Outer）的三區溫度顯示，系統將分析過彎後的熱分佈42。理論上，為了最大化過彎時的輪胎接地面積，負外傾角（Negative Camber）應設定在使輪胎內側溫度僅比外側高出約 10°F \- 15°F 的範圍內15。系統會比對實際溫差與理論理想溫差，若外側溫度過高，即表示負外傾角不足，需要透過調校修正。

## **錄製遙測與 LLM 智能化調校建議系統**

本工具最具突破性的功能，在於結合啟發式規則引擎（Heuristic Rules Engine）與大型語言模型（LLM），充當玩家專屬的虛擬賽車資料工程師，自動分析錄製的遙測資料並給出下一步調校方向2。

### **條件判斷與啟發式異常觸發器（Heuristic Triggers）**

後端系統會在資料串流中常駐運行一組嚴格的物理條件判斷規則。當遙測數據偏離理論預測範圍並持續一定時間後，系統會生成具體的「異常事件標籤」2：

| 規則名稱 | 觸發條件（透過遙測數據與理論比對） | 物理意義 |
| :---- | :---- | :---- |
| **懸吊頻繁觸底** | NormalizedSuspensionTravel \> 0.95 且持續超過 3 個採樣幀。 | 彈簧過軟、阻尼壓縮過低或車身高度太低2。 |
| **出彎牽引力喪失** | Accel \> 80% 且後輪 TireSlipRatio \> 1.1，伴隨橫向滑動。 | 油門給得太急，或差速器加速鎖定過高、後防傾桿過硬2。 |
| **彎中嚴重推頭** | 前輪 TireSlipAngle 飽和，且車速下降，方向盤轉角與橫向 G 力脫鉤。 | 前軸失去抓地力，前防傾桿可能過硬或前空氣動力下壓力不足22。 |
| **提早升檔（Gearing）** | 在 CurrentEngineRpm 未達理論動力帶最高點（\< 80% Max RPM）時偵測到升檔。 | 齒輪比設定過密，或玩家換檔時機錯誤2。 |

### **引入 LLM 生成動態調校建議**

當一圈錄製結束後，系統會將上述觸發的異常事件標籤、當前車輛參數（前輪配重、驅動型式）以及當前調校數值，打包成一個結構化的 JSON 上下文提示詞（Prompt），並發送至本地端或雲端的大型語言模型（例如使用 Ollama 部署的 Llama-3 8B 或 Qwen 等輕量級模型）進行推理2。  
**系統提示詞（System Prompt）設計範例：**  
「你是一位專精於《Forza Horizon 6》底盤動力學的首席賽車工程師。請根據以下遙測分析報告，為玩家提供精確的調校修改建議。  
車輛狀態：前置後驅 (RWD)，前輪重量分佈 52%。  
遙測異常偵測結果：1. 在高速彎道中，前輪懸吊行程達到 0.98 導致觸底。 2\. 出彎踩下 80% 油門時，後輪縱向滑移率飆升至 1.2，引發嚴重的轉向過度。  
任務要求：請從彈簧磅數、阻尼（Bump/Rebound）、防傾桿（ARB）或差速器鎖定率中，挑選最關鍵的兩到三個參數進行調整建議。說明調整方向（調高或調低）以及背後的物理原因，字數控制在 150 字以內，語氣專業且具建設性。」  
**LLM 預期輸出範例：**  
「針對您的遙測數據，建議進行以下調整：

1. **前懸吊觸底**：請將前彈簧磅數提高 5-10%，並相應增加前壓縮阻尼（Bump Stiffness），以提供更大的支撐力吸收高速彎的下壓力，避免底盤撞擊路面喪失抓地力。  
2. **出彎轉向過度**：這是因為後輪無法承受瞬間扭力輸出。建議將後差速器的加速鎖定率（Acceleration）調降 10%，允許內外輪有更大的轉速差；或者稍微調軟後防傾桿（Rear ARB），讓車尾在出彎時能產生更多側傾來壓制後輪，提升牽引力。」

透過 LLM 的語義轉化，原本冰冷的遙測數據被翻譯成了直觀、具體且符合邏輯的專家級建議，大幅消除了新手玩家「不知從何改起」的恐懼感2。

## **專案實作計畫與技術藍圖**

為了確保此複雜系統的順利落地，開發計畫應分為四個循序漸進的階段進行實作：

### **Phase 1: 基礎通訊與後端建置 (Week 1-2)**

* 建立 Python UDP 監聽伺服器，綁定本機連接埠，並設計非同步讀取迴圈（asyncio.DatagramProtocol）。  
* 根據 FH6 遙測規範，撰寫精準的 struct.unpack 腳本，將 324 bytes 轉換為 Python 字典。  
* 使用 FastAPI 建立 WebSocket 伺服器，確保數據能以 60Hz 穩定廣播，解決可能的網路阻塞與記憶體洩漏問題8。

### **Phase 2: 理論模型與 Tauri 前端開發 (Week 3-4)**

* 利用 Tauri 框架結合 React 初始化前端專案，確保跨平台的低資源佔用。  
* 刻劃復刻原生遊戲介面的九大調校標籤，實作滑桿元件的雙向綁定（Two-way binding）狀態管理。  
* 整合本地端 SQLite CarOrdinal 資料庫與手動輸入介面。  
* 將彈簧、ARB、阻尼等物理基準數學公式寫入核心模組，實作「依據重量分佈自動計算 Baseline」的功能。

### **Phase 3: 遙測數據視覺化與時間序列分析 (Week 5-6)**

* 在前端導入高效能圖表庫（如 uPlot 或 WebGL 加速的 TimeChart），繪製即時轉速曲線、牽引力圓（G-G Plot）與四輪滑角圖8。  
* 開發「錄製與回放」功能，將遙測序列存入資料庫；實作微積分演算法，產出阻尼速度直方圖（Damper Velocity Histogram）供玩家分析41。  
* 實作「理論測量數據」與「實際遙測」的比對邏輯，建立轉向過度/不足的視覺化熱點圖。

### **Phase 4: 啟發式規則引擎與 LLM 串接 (Week 7-8)**

* 在後端實作常駐的 Heuristic Triggers，持續掃描懸吊觸底、輪胎過熱、滑移失控等極限狀態。  
* 整合 Ollama API 或 OpenAI API 架構，設計系統提示詞模板（Prompt Template）。  
* 在前端新增「虛擬賽車工程師」對話視窗，測試 LLM 輸出的調校建議是否符合車輛物理邏輯並易於理解，完成全系統的整合測試2。

## **總結**

本研究所規劃的《Forza Horizon 6》專用調校工具，代表了模擬賽車輔助軟體在數據處理與人工智慧結合上的前沿架構。透過 Python 強大的非同步網路處理與資料解析能力，系統得以無縫捕捉遊戲底層的高頻物理動態；而 Tauri 構建的現代化前端，則將繁雜的數學公式轉化為親切直觀的滑桿介面。  
更為關鍵的是，本工具超越了傳統僅提供數據展示（Dashboard）的範疇。藉由建立嚴謹的車身動態理論預測模型，將玩家的實際駕駛遙測與理想物理狀態進行比對，並首創性地引入大型語言模型（LLM）作為虛擬工程師。這不僅有效解決了龐大遙測資料導致的資訊超載問題，更將深奧的懸吊幾何與阻尼理論轉譯為立即可行的行動建議，徹底賦能玩家探索車輛的性能極限。

#### **引用的著作**

1. Forza Horizon 6 "Data Out" Documentation, [https://support.forza.net/hc/en-us/articles/51744149102611-Forza-Horizon-6-Data-Out-Documentation](https://support.forza.net/hc/en-us/articles/51744149102611-Forza-Horizon-6-Data-Out-Documentation)  
2. jasperan/forza-horizon-5-telemetry-listener \- GitHub, [https://github.com/jasperan/forza-horizon-5-telemetry-listener](https://github.com/jasperan/forza-horizon-5-telemetry-listener)  
3. Telemetry Outputs Overview | DR Sim Manager, [https://docs.departedreality.com/dr-sim-manager/development/telemetry-outputs-overview](https://docs.departedreality.com/dr-sim-manager/development/telemetry-outputs-overview)  
4. Building a Digital Dashboard for Forza using Python | by Michael K \- Medium, [https://medium.com/@makvoid/building-a-digital-dashboard-for-forza-using-python-62a0358cb43b](https://medium.com/@makvoid/building-a-digital-dashboard-for-forza-using-python-62a0358cb43b)  
5. microsoft/fabric-racing-sim \- GitHub, [https://github.com/microsoft/fabric-racing-sim](https://github.com/microsoft/fabric-racing-sim)  
6. Using FastAPI's WebSockets and Elasticsearch to build a real-time app, [https://www.elastic.co/search-labs/blog/fastapi-websockets-elasticsearch](https://www.elastic.co/search-labs/blog/fastapi-websockets-elasticsearch)  
7. FastAPI: Real-time Data Processing with WebSockets \- Pluralsight, [https://www.pluralsight.com/courses/fastapi-real-time-data-processing-websockets](https://www.pluralsight.com/courses/fastapi-real-time-data-processing-websockets)  
8. Real-time data streaming using FastAPI and WebSockets \- Petr Stribny, [https://stribny.name/posts/real-time-data-streaming-using-fastapi-and-websockets/](https://stribny.name/posts/real-time-data-streaming-using-fastapi-and-websockets/)  
9. Unlock the Power of WebSockets with FastAPI: Real-Time Apps | seenode blog, [https://seenode.com/blog/websockets-with-fastapi-real-time-apps-tutorial](https://seenode.com/blog/websockets-with-fastapi-real-time-apps-tutorial)  
10. Spring Rate Calculator \- What Is It and How It Is Calculated \- Call To Grid, [https://calltogrid.com/spring-rate-guide-calculator/](https://calltogrid.com/spring-rate-guide-calculator/)  
11. FM Tuning Calculator | PDF | Tire | Turbocharger \- Scribd, [https://www.scribd.com/document/168499826/FM-Tuning-Calculator](https://www.scribd.com/document/168499826/FM-Tuning-Calculator)  
12. Data Out feature in Forza Motorsport \- FM 2023 Discussion, [https://forums.forza.net/t/data-out-feature-in-forza-motorsport/651333](https://forums.forza.net/t/data-out-feature-in-forza-motorsport/651333)  
13. Ride frequency tuning calculator \- Page 2 \- Official Forza Community Forums, [https://forums.forza.net/t/ride-frequency-tuning-calculator/91481?page=2](https://forums.forza.net/t/ride-frequency-tuning-calculator/91481?page=2)  
14. The Dark Art of Forza Tuning \- Gran Touring Motorsports, [https://www.gtmotorsports.org/the-dark-art-of-forza-tuning/](https://www.gtmotorsports.org/the-dark-art-of-forza-tuning/)  
15. Help me understand suspension tuning and tire temps : r/ForzaHorizon \- Reddit, [https://www.reddit.com/r/ForzaHorizon/comments/1j32vqw/help\_me\_understand\_suspension\_tuning\_and\_tire/](https://www.reddit.com/r/ForzaHorizon/comments/1j32vqw/help_me_understand_suspension_tuning_and_tire/)  
16. fh5 · GitHub Topics, [https://github.com/topics/fh5](https://github.com/topics/fh5)  
17. 4Sim Telemetry \- Sim Racing Telemetry Dashboard for Forza, F1 & BeamNG, [https://4sim-telemetry.netlify.app/](https://4sim-telemetry.netlify.app/)  
18. Basic formula for spring rate? \- Tuning \- Official Forza Community Forums, [https://forums.forza.net/t/basic-formula-for-spring-rate/537503](https://forums.forza.net/t/basic-formula-for-spring-rate/537503)  
19. Ride frequency tuning calculator \- Official Forza Community Forums, [https://forums.forza.net/t/ride-frequency-tuning-calculator/90841](https://forums.forza.net/t/ride-frequency-tuning-calculator/90841)  
20. Forza 7 Tuning Guide | QuickTune \- Professional Tuning Calculator for Forza Motorsport and Forza Horizon, [https://forzaquicktune.com/tuning-guide/fm7/part2/](https://forzaquicktune.com/tuning-guide/fm7/part2/)  
21. Beginners guide to tuning \- Forza Motorsport \- Steam Community, [https://steamcommunity.com/sharedfiles/filedetails/?id=3046384081](https://steamcommunity.com/sharedfiles/filedetails/?id=3046384081)  
22. Forza Horizon 5 Differential Tuning Guide | PDF | Motor Vehicle \- Scribd, [https://www.scribd.com/document/593060541/Tuning-FH5](https://www.scribd.com/document/593060541/Tuning-FH5)  
23. Forza Horizon Tuning Guide Essentials | PDF \- Scribd, [https://www.scribd.com/document/938308817/Forza-Horizion-Tuning-Guide](https://www.scribd.com/document/938308817/Forza-Horizion-Tuning-Guide)  
24. Ride frequency tuning calculator \- \#5 by Senistr \- Forza Forums, [https://forums.forza.net/t/ride-frequency-tuning-calculator/90841/5](https://forums.forza.net/t/ride-frequency-tuning-calculator/90841/5)  
25. Forza Fine-Tuning Checklist \- ForzaTune Pro, [https://forzatune.com/guide/forza-tuning-checklist/](https://forzatune.com/guide/forza-tuning-checklist/)  
26. struggling to tune car : r/ForzaHorizon \- Reddit, [https://www.reddit.com/r/ForzaHorizon/comments/1lnsphx/struggling\_to\_tune\_car/](https://www.reddit.com/r/ForzaHorizon/comments/1lnsphx/struggling_to_tune_car/)  
27. I need to learn how to tune cars\!\! HELP :: Forza Horizon 6 Obecné diskuze, [https://steamcommunity.com/app/2483190/discussions/0/839502870935067124/?l=czech\&ctp=2](https://steamcommunity.com/app/2483190/discussions/0/839502870935067124/?l=czech&ctp=2)  
28. Ojansen/co-driver: Forza telementry visualizing for tuning \- GitHub, [https://github.com/Ojansen/co-driver](https://github.com/Ojansen/co-driver)  
29. Forza Horizon 5 Gear Tuning with Forzatune Pro, [https://forzatune.com/support/forza-horizon-5-gear-tuning/](https://forzatune.com/support/forza-horizon-5-gear-tuning/)  
30. GitHub \- theRTB/ForzaGUI: GUI application for realtime display of telemetry and derived statistics and graphs for the Forza series, [https://github.com/theRTB/ForzaGUI](https://github.com/theRTB/ForzaGUI)  
31. Help fully understanding torque curve, gear ratios, and optimal shifting? : r/ForzaHorizon, [https://www.reddit.com/r/ForzaHorizon/comments/1uac4eb/help\_fully\_understanding\_torque\_curve\_gear\_ratios/](https://www.reddit.com/r/ForzaHorizon/comments/1uac4eb/help_fully_understanding_torque_curve_gear_ratios/)  
32. Second Tuning Guide for Gearing/Gear Ratios in FH 3 : r/forza \- Reddit, [https://www.reddit.com/r/forza/comments/57g0yu/second\_tuning\_guide\_for\_gearinggear\_ratios\_in\_fh\_3/](https://www.reddit.com/r/forza/comments/57g0yu/second_tuning_guide_for_gearinggear_ratios_in_fh_3/)  
33. How I tune gears \- Official Forza Community Forums, [https://forums.forza.net/t/how-i-tune-gears/15443](https://forums.forza.net/t/how-i-tune-gears/15443)  
34. Designing a detailed telemetry dashboard for sim-racers \- UT Student Theses, [https://essay.utwente.nl/fileshare/file/95989/Ahmad\_BA\_EEMCS.pdf](https://essay.utwente.nl/fileshare/file/95989/Ahmad_BA_EEMCS.pdf)  
35. MoTeC, a Journey: Getting The Most From Data Analysis | Page 3 \- Assetto Corsa, [https://www.assettocorsa.net/forum/index.php?threads/motec-a-journey-getting-the-most-from-data-analysis.69903/page-3](https://www.assettocorsa.net/forum/index.php?threads/motec-a-journey-getting-the-most-from-data-analysis.69903/page-3)  
36. Understanding Oversteer in Formula 1 with Python | by Raul Garcia, [https://python.plainenglish.io/understanding-oversteer-in-formula-1-with-python-6c221a553d87](https://python.plainenglish.io/understanding-oversteer-in-formula-1-with-python-6c221a553d87)  
37. Understanding Understeer in Formula 1 with FastF1 and Python | by Raul Garcia, [https://python.plainenglish.io/understanding-understeer-in-formula-1-with-fastf1-and-python-ce86a115a264](https://python.plainenglish.io/understanding-understeer-in-formula-1-with-fastf1-and-python-ce86a115a264)  
38. Releases · SpeedHQ/RaceIQ \- GitHub, [https://github.com/SpeedHQ/RaceIQ/releases](https://github.com/SpeedHQ/RaceIQ/releases)  
39. Help with suspension-related settings for off-roading : r/ForzaOpenTunes \- Reddit, [https://www.reddit.com/r/ForzaOpenTunes/comments/1u82ggu/help\_with\_suspensionrelated\_settings\_for/](https://www.reddit.com/r/ForzaOpenTunes/comments/1u82ggu/help_with_suspensionrelated_settings_for/)  
40. anyone use telemetry to tune? : r/forza \- Reddit, [https://www.reddit.com/r/forza/comments/75jeyn/anyone\_use\_telemetry\_to\_tune/](https://www.reddit.com/r/forza/comments/75jeyn/anyone_use_telemetry_to_tune/)  
41. Data out/UDP Updates \- FM7 Discussion \- Official Forza Community Forums, [https://forums.forza.net/t/data-out-udp-updates/88683](https://forums.forza.net/t/data-out-udp-updates/88683)  
42. Telemetry \- Forza Wiki \- Fandom, [https://forza.fandom.com/wiki/Telemetry](https://forza.fandom.com/wiki/Telemetry)  
43. Camber & Tire Temp/Pressure \- Tuning \- Official Forza Community Forums, [https://forums.forza.net/t/camber-tire-temp-pressure/33616](https://forums.forza.net/t/camber-tire-temp-pressure/33616)  
44. Tuning Guide \- Official Forza Community Forums, [https://forums.forza.net/t/tuning-guide/150](https://forums.forza.net/t/tuning-guide/150)  
45. The Fully Updated Forza Tuning Guide, [https://forzatune.com/guide/the-fully-updated-forza-tuning-guide/](https://forzatune.com/guide/the-fully-updated-forza-tuning-guide/)  
46. RaceCrewAI | Whitesmith, [https://www.whitesmith.co/work-with-us/racecrewai/](https://www.whitesmith.co/work-with-us/racecrewai/)  
47. 7 Alarming Xbox Gaming Copilot First Look Issues, [https://yelzkizi.org/xbox-gaming-copilot-first-look-bad-impression/](https://yelzkizi.org/xbox-gaming-copilot-first-look-bad-impression/)  
48. 1024 PROMPTS · GitHub \- Gist, [https://gist.github.com/VictorTaelin/8a8455e15b9c38c9177cc243e22e047f](https://gist.github.com/VictorTaelin/8a8455e15b9c38c9177cc243e22e047f)

[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAmwAAAA+CAYAAACWTEfwAAAFiElEQVR4Xu3dXahmVRkH8BUlWEaRZho2+VEmeiMSFVHKCEIR+IEVBSUUXigZ0gcUE0ZSCKlFpWKhgaZEokF1EURddEKpi4Qi7INKqAi6iAojBYus5+9ae86e7XvknBmneWf6/eDPu9+19/ueM2duHtZ+1tqtAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPBUL6vcWjlveQIAgEPnuMqucfz38Xpd5ZhxDADAIfS1ylcrj1deP8ZSvD2094pnxmcqf2x9Bm8uPz9F4nMW4wAADH+qfKjyqsqzxtjnK2/fe8WBe37l7sqjlVfPxvPz9lSemI0BADDz0tZnt3ZXjh5jV43xM9pmATd3fOXexdh7KjcvxuYuar0we6z14jCeW7m28u3Kw2MMAICF2yp/rtxRecUY+3flPyNbyW3N147jFHUp1o7aPP0U11YuqPyl9d64eMcY+13l62MMAICFFF5TAbVT+ewt7eln1ia3tz6DtzGSfrVTxrl/Vd44jrcjPW+vWQ4CAByp3tX27SnbifdXXl75xvLECplJixSHmWW7frxP0ZfZtZ0sOMjvvJPrAQAOazdVTlgObsN0GzRObJu3R1fJgoPTxnH619LHds54n0Ju6mmLFHCfrbypclLr24rcN95/qvW+t/zOk3e2XvC9cDYGAHBE2Z9m/7Mqn1yMHVu5YTEW57beC/fPyuWtz+Z9d5z7x+zcd1qfNcusXfyo9ULy5MoVrffY5WekUPz+uCbjl1U+2hRsAMBwdusrGqfVlPGxyivb6tWU6+wLlTsrv1yMH0pZmZrkb5lZt/e2frs1xVt61j7c+t8+hdqL274zbSnsAACe7J3KbM4kt+uunr0/nPyt8s3Wi6B1kRm2a1rvb8uM2gdbv92ZGbmMp2CO3IpNUZcibfo/ya1SAID249b7qiIrFdO7BQDAGsnqxudVPtJ6szsAAGsmDfJntt7gPn/u5v7KRrPL52r+L0yb4h6JAQD+j6V/ar4bfx5inhxKacCfGvVXZX+26wAAOGyluX2+X1h2+F/O6KQR/pLKp1vvdbtrvM9zNzOb9qXKGyrva73B/lv9Y+3UytvGuTx0fZLVkFkludXGtie3/rmtcvHmpQAAR66sBJ3vF5a9wCLH09gkBdYjrW8Ke3rrRV6KuBdV3l15oPXiKxvJ5nvuaL1wy7U5zrXTHmWXtv65nM/3AADwDJi2+fhJ68VXirBIkZbet++1XoRNUsBFrp2Ksh+M1y+P1+w3ls+um+lJBZP8G15XuXUcr3JK6z17z279FvN8P7vIxrtvbf08AMBBkf3Dsnr0/NaLtD9UPlD53Di/XFl6T+v7h6V4mXbqz7W5fZrbnbmFmuJvnaQoe0vl0cV4ZhrfPI6zmnbVgoz8TX5V+WnrPXaTKyu/GceZtfzK7BwAwEGT/rXpMUs7tbvys9afz3n/vqfWQgqvecGWW7x5P/Xa/b6ysffspq168VKkZYZxXsQBABx0afr/+HJwm7Ihb3b2T8H3gsW5dbCdgm3VM0pzPoXsbyufmI2nYMuD3a9qfZYyM4wAAByAZcEWv67sab3YSgGWom1pXojlGazTbdNcnwUbsVH5+TgGAGA/rSrY5tLDNn8wexzX+qO9XjLe5/mf03NZU7BdOI432tN/NwAA27CqYMtCguw5F4+1zdmzzKol6U/LrNtUsGWG7aJxnKdGTKtkN5oZNgCAA5IVnZkRS/7aNguwB1vvQ8trtjeZZJVstuqIrHy9sXJ55Yd7r+jblvxijH+x6WEDADgosqfa7squxfjSea0vyFjutZYiLeNb7eEGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsD7+C5Al+uuoou+fAAAAAElFTkSuQmCC>

[image2]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADwAAAAaCAYAAADrCT9ZAAAC/UlEQVR4Xu2XWahNURjHPxkyJpQh4pKZkoQydcwe8IAHN5ShDBkeKELJkHihyEwpQoYMmR6UrkiGBy9KkboeeCC88CTD/9e3Vmef7cjL3els51+/ztnrW3vvtb5hrbXNqqqqqjxpvPggfib4JBYk+uxI2a+JVgl7ReqE+CEmpQ1SH/FYzBfNU7aKVDvxVNSLrqUmmyBuiJpUe0VrgPgobloxgo3FGrFLtAhtudE889rcEK6pz4PmddwodsqT9otvYozoK56JR6JtslNeFOv3jVgpzplPlgVsWqJfbhTr97vYLJqKueYpzuSbFLtmqomBzBXrd6MV67WTeCE+i8GhLUvh1J1ictqQhdh/Y/0mtdXcEfzmRrF+X5tHNSkiS4SJdNoWNUpcFMdFN/NFbq/YJAritFhhXiYzxAUxWuw2P72x3XUWh8T20I9oLxVHzA88POu2mGKlGiiOigPB1r7UXF7DxFdxyX6vVa5pJ8qcsNIaZD5Q+u0Ri8UsMVa8ErPNS+SUWCSWmA+eSU81d3KNWCiGiIeihxgqposz4rC5UxjnVdHaXCPEZXMHExiCwlr0R3F8fGel5+P3ojbYO4onKftz0TvYEc/4Yj6hgnl0iAhn81vmg4tO2ya6i+tiZujLYLFzD204gmvezdb4wHyiCDv3cijiuXXmaw+iFO+ZZ2umYtA4qE68Ff1CO4cX9nXEMfWluXP4f1/0CrYoJnnWfGeIYqJ3zCdBlpC2y4KNbOCZMaK0x/dlpoL5S7uINubbV08rRpTURvxyXCUqTJpaTH9lMXD2fVKT2mWCRO9k+B8dhX1d6E/6826cfiX0z1S8FK/OEfvMXxgHRz3x+bjcfDFjUUJrrfyKT2bcNV+0+oe2Y1aMOIsh9brFPLq8Z5U4b54Z9faX+m0o8XHRIfxGUU/UL/VJ5JNqZh6RcqI2k5+dLa30udzH/WkNN3dW5vVbTniewwsrd1bCKaTwanMnsHWR5v9E7Mmk4XoxLmVrKOFUVmz2cBgZ2qqq6n/SLwrkjK/kbxB9AAAAAElFTkSuQmCC>

[image3]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAbCAYAAABIpm7EAAAA6UlEQVR4Xu3Sr2tCURjG8XdoGKiIIANBsAnCwGTSqk1YHPgHiE2MJotgdqAgFoPN/2BrNrWuLLtosYmI+x6O4Z5XL3faBB/4hMtzDvf8Erm7RFBBFk+qO0sGc/Twi7Jbn6cjdkIXR7w7rUoCS4yRRB4hZ4RKDhu0dKHzjBRqOIhdhvmOegd5U8QIK+wwPX0XvIMuZSJ2D2YvgYmJPZ0Zwqq7mDTWaOvCL1dPKGGPqi78UsdW7GX9K318i73hwJjX+SU3nJBZlm/MO2/iE29iJ7w6I1Re8CP2ZgcYSsByzB8aWOADcbd+RP4ASKIkGi8vM6QAAAAASUVORK5CYII=>

[image4]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAaCAYAAADxNd/XAAACiklEQVR4Xu2WS8hNURiGXyGE5FIU5c+AmEhSriURBiQKJSMDMsMAZXCQgXIJZcBAkijXgVtSbgNlqJREGZCRlDAgl/c5316ds/d/kpNz2n/abz39++zv+/f+1rfetdaWKlWq1Ky55r35lfHcjMll5LXE/FDk8veeGZ3LKEmHzDvz1kwoxJIo9IL5ZC6bAflweRpmzplj5ouZmQ/X1c9sMbvNT7M9Hy5Xk8xps1ZhjRX5cF0zFAPYZb6b+flwuVqp6Ows81W9uzvE1Mx4c9O8NmObE8pWzSw2U80HcyAXldYp4gzgjfqo/1m4dJXunld4HvWYnYqCGUSf9f9gxWAeZHBN0RTfE6n16075f7p5aR6b4YVYW0r+R3Sd7ieP03Hsgxhgp/2/2Rwv3mxXNUWhSfifdbDQHFQsYITFOCM65X+ewbM2FAPtCJtwMGGjJPzNTsTD2TqT/uT/aeaM2WsWmVHZ/aGK2b1klpoTZr+iKZz29xUbRxL31yvefdiMaIq11DxzQ3kPcgZwFvDitJARM9PK/1jwiqIZbMMvFA2hw1iE03uOeWpWK3YxiuY5D81IhSj2mlmT/V5llmfXvbTAfFTj++eb2ZTFOIXvqvF9c8R8zvJS7h1Fl3npI7Msy2WWbis6TzcnZvcZCDM0SPF/NKbof36/MhsVm8VfzcC/isE+U+PbiRcXzxCKpfhmr7fy/1nFmmue9a6LAVxX2IeO31JYaquZrLAENn2isBc5OxQHIv7nSzjNPLNBA5LGqTGDXROFnzLbzFHFejqpWIhTFF1m0WLJPRns/1jjqtlnZitEsRcVs8JA+OZKO2DXxSbQXzH9+D+JswNQykkaqHwuIs7uRKxSpUr/q34D6a93bY76ivAAAAAASUVORK5CYII=>

[image5]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADEAAAAaCAYAAAAe97TpAAACjElEQVR4Xu2XTYiNURjH/2LkY1KYlKLuICWiTKzYUSxYkA0WysLGlCzIR2aByMpMpCShfBQlC5tJTCmShZWNUkNTViixQD7+//u8x5z73Pe+55rro1vvr36Le5736znnec77XqCkpMTTRR/TH5FvaA+dQ5+52Au6sHomsN3F7tCpWUxMoVfpl+iYb3QkGhumu2mHndIa+2EX1QU9B2GxTT5AltL7tOLGY5bRD/QWnRCNj6db6Sd6Hn8gkW2wB1UynpCEjokZRw/TtW7co+R1/i4fyNDEfafrfOB32QC7kR44pkJfIj/BxfQU0jM4QL/SVT6QodLVaui4llgDm43L0Zhm+hg9jfokVBYnYIkU0UmH6HNY/+URklD/6J5jJlwoTkJjJzFaDnFsNT2A9E0X0beo74eY9ai//pgISdyD7TAqkX66IIqFm2h2z9G52e8iNqK4H0TYVI77QIY2gOlITxhm01ewpddDqln3ZDGfoBq86KFiUv0wid6FlbJK2jOL3qRP6E4XqyMk8RQ2+xdhFxChJIbofHoWlmiKZvphCX2P0cnzaMKu0UOw7bwQLZcSUCJ9dEsUCwk+pEeQ3lIDqX7QmMpSSax0scAFNL/qv2ZNy3qDTo5iIQnV7XWkt9RA0ftB9b0DVqaba0NVKvQM7OthkO6lE+MD8lCtq+Y/w3aemJCgbqj+aAY9pB4irx+0IegNrRXQztQITd4jOs8HitDuo+XzSx+SOIr0DqFGvUQ/wlZBvqOvMzVJw3QfnVY9ozErYJ80KvWm0Sw3asDldIYf/MuoqVt+Af5v9N7wnzpthcryNvLfHW2BerBCH9Du2lB7MBP2R+wK7AOzLftBO6Mauhe1/xJLSv4FPwHKBZCg1HeLogAAAABJRU5ErkJggg==>

[image6]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAaCAYAAAD1wA/qAAACi0lEQVR4Xu2WO2iUQRSFj6jgC6IiUYmSxSciRKIEG+0UbRQUrLSxURALH4hEQkQMJApCfCEEUSzUEGyERCQRjVhYWAgWIoJF0liIpYWNek7uDDu5u7+7C5Jd8D/wwf5z7787Z2bu3QFy5cpVScvIW/I74SvZRlaR9y72mWyYehM44mJPycIQq5vOwyZz0geoC7DYQR+g2shLUnDjddNh2GRlyCsaUU6qWaSL7HbjddU+2GQ16VQF8gXlTW4mV8lcN15X7SK/yINkTCveQ/pRamQO6YWZaSipuH9guhGN9cFqQ0bS2E7SCTPbUIpGXsA6j47LdbIuiUUji8gdsjo8N5RWkgkyDpuoCvhUiHmTKvrjIea1gMz2gxmqNncv+UYeoooTEI28g+3CPdIcYpvId5jJteQ2zKxXE3kOM15JteRKN5C9eNO0BGZCZi6SQ0ksmnxDupHdbrfAcvQnW0m15Gpur8kOHygnrfA4rHMNkvlJLBpRwT9GabudR86RUTIJq61YP5qozA+Ts7BJZeXqJnGN3CR7SEsY14l4hepMT5191cBPWEdKFU2qTv52FPz2t5IRsj486z8q3hx8bjts1VfADH1CcQdUk09gLb8qqSvdRekL0chlZBebVlpXlY7wrO/Q7qX/Pfqs38jKjSa1A7r/LQ/P3nRFabWztm8rWeoHE/nt13H8iOKqarJaVZkpl/sBRWP7yRDsnZrq419I26/2qPo5ATtOKuZ4rHQD0IR03HzuRtiOy5B2/BY5Q47CDMj0dnIAMyB1sjFYHei8a0KnyQA5Rh6heP33uVp5HVtdQK/Ams192PsF8oxcImswQ4o3glTqaIvdmFQuNx3T51iP+g6RK1eu/11/AH2XgoTckmDOAAAAAElFTkSuQmCC>

[image7]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAmwAAAAxCAYAAABnGvUlAAAFRklEQVR4Xu3dWagk1RkH8CNqXIO4a9xFE1xAxSWiEfJgREMMIvikLyIkECK4gBsqLoi4IMaoESOICS6okEBicENHfBB8UUREXHBhwAfxLQomoDl/TtX0mUr31QHvnTvj7wcf3XW67p2qrgv95zunekoBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAANhM3F5rba19J+OP1nqy1laT8c3d5bV+321fVevrbjteqHXgZGxjeajWV932FrW+qHV8N/bLWrt026Oc103D8+1qXVHrstnLAMBqcHCtP5f2wX1mN35MaR/eP+vGvi/yPiSkjd4v6we2I2pt3W1/1/acDlQ/qrXldHCQgNkf30+H7fF6/qLWJbOX19m21iel/Q30puEUANjIfl3rytI6MuOHejot19V6qswPD5u7U0vrWkW6VXeWWYhJt/Hm4flyebzWcd12juGPZXFI/G2ZHV+u3X3D9hjY7qm1x/C8t09p1zjBrSewAcAq89fSpkLTRXp4GEvHJsGkn2YbpcuTALEpuKbWx0vUvCnCOLbW86UFpD8M258Pr/2p1n7D8+WUa3JCmYW1pSSYjSHr3lq7Dtu5jvk9Ow6vTeX1hNNe/r15gW3R7wAAVkCmQ9NhWTNUgtqBw2v/HR57T9S6YDq4ARZ1ib6Nd2q9PB1cBnuX9l5kKvGiMgtsO5TWzer9YLLd2346MDi91qflm4Pv07XuLt/8nvWB8qzhMaHrgVpXD9tTuebprk2nQ3er9dlkLKHutckYALCCxg5LFp7ng/qWYTudmdxwMDUNLBsi06uHTQc3QI7n3OngEtIVSvhaVIvWhO1c66Na5wzb2Tfb167bY+aV6cDgqLI4XOb3vzQdnBg7a/uX1mlbSkJX1qJl6naUAJep1ay3myfXfdpBzfv1bK0DurFcs0XnCACsgJNr/XB4Pk6rjV2fBLjpDQcJLmNH5rxab9U6rbT1brmzMAv1E/TSGfpVadOHWVP199LCwFJhLzc57FXaz+ffzb6Z2nu11tmlBb2EnISdnWr9rf1YOWN4/C6lk/Zlt51jX1NaJ2vqruExIefQ4XnuMM34eL7jub1d2rkldM4Lw6PflfXDV352qdCWUJUp7UO6sQTMd7vtqVyjhLzR4bXeq3V0Nxb5u1jqWAGAZXRKaQHtP6VNcSaMpLsS/+5e69d55WsiEpgi4ST7J8xkyu6N0haxJ9S9XuvHZRZw/lHaFNyiD/5Mw+YrRCLBLAFk7PI8WGub0oLkGI4ShBIusgYr4W05ZDpxNAa26RRmjjthsj/+eKi0r/3I+9W/lk5Vzq0Pc/PcUP5/GvTWsnjN3Xh8vQ9LC9XzPFfa9U1lLd/aWm+WFq6nEsLHr/0AADYB/Qd3Aljf3bpteLyjtG5bukgJOAlxR9a6tNYzpYWIg4Z9R+OaseyfNVvnl9ZBSwcwoSdBIr/npNLCZQJPwlr003crLd2ydChzjOP0Z6Ygc0y5gSOh6ydldm65Czfn9mJpX72xKUi4m9dZBABWoQS0cRoy0inqg9c/a/2mtFCSoHL/MJ4pzqz9ypquNaUtuJ9KF+rG0tbPPVbr4tK6cRnLovlUOmnpPJ1YWiDKfglt87pCKyXhLF+JkjCWY875PzK8lqCT7lR/bukWZr9/1bp+2G+1S7jMjQgAwCqXtWR/Kcv//WOsHj+v9UFpd8oCAJuAdIkuLG0xPt8Pu5f2P11M1+0BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwEb1P3dnvfX0J59MAAAAAElFTkSuQmCC>

[image8]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAmwAAAAxCAYAAABnGvUlAAAFu0lEQVR4Xu3caaitUxzH8b9QhMyzuGSeJbzAK2SKUDfjixsZkmTIGDmmRJEMkSFJIhEyhjjywgsvSJJCLilFXlKSYX1bz7LXWefZ+3LuPufcfXw/9e/sZz3PHs+u59d/rWdHSJIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZIkSZKkyrrtwIRaO9Va7aAkSdKkOzGWTmAjrF3e/ZUkSUPsleq3djA5PdXvqY5odywxfzXb16c6rdreP9W71fZieznVGdX2xan+SPVkNba6eKw/q23C1K+pDqnGTki1WbVd8Hne3t1eP9W1qa6O0YFs31QftoOSJGlgKtV0qg2rsXVSHZ7q+e72UlYHtmWpvk51TTV2V8xfN2uDVFs3YwSb7Zqxgn33tYPJtzHewMb7rz+Xw7rtk6qxK6rbxXqpfki1SzPOfS9sxlpnp9q0HZQkSTmkPZXq6ZgZHI7uqu+kvNTUnaTbUt0bg8BGWN1nsHvstkz1XDO2ItX9zVixRczs/hXjDmyEqzqwPdxtl8DG92arwe5/bJ/qtcjBrcZ96VyOckDM7OBJkqTOyamuixzMysnyolQHRT7xtt2fNRVTc9+NqBsHh87yS+ROF120XVMdHDn8EEoeqo6bT29G7p6tiNHdPAJT273CuAMbz1MC2+ZdsU2Q3SFygOvDfoJ+jffFfemg1eqObtmuO5uSJKkzFfkEywm6dE8IbJxkV8biTYdulOqZWJiOC2GHsHBMt01geydywGin8biicZhh+36K3MEchRD0QAzvrBX8j7ZtB2N0YKPbxX36iiDWh8+AIIvzur+ErsdS3RCDz6rG8xDy20BJV/DnyGslC75zH6faoxrjf1DWvkmSpMqjkU+0nGRZG3VutY8LDhYTgenfBkYCZhtG6tpkcOgsH6W6KdXybpvjP4jZoYQpO8JHn1H73o9VX7hxSaodU73Y7mjMJbDNBd8H1qIxPcz6NRDgmL4dNkVMCKunl0EIeyvVTtUYXdu+CwzssEmS1IMr+Mp6KE6WLLZf1m1zwuaCg+LIVJ9HDhQbd39xSuT7Hhc5NNEhoSPDeqVjIz9mn1cjH186T2dFDixM0XIfFp8TdPBgqqsid9vO78bGiW4a76/g/ZTuUq1e7E8nabcYrMsq+5hK5nXTMfuiGxt14QafAVd51tOgfLaHVts1ulTtlCMIbKvq4v0XhCr+D0wRFzzHl9V2i2ldQl6xd6qvUh1YjYHQWX+3Cj6zvvcmSdL/FhcaMMVFlW7HOd1fglnZd2Y3RiCjU0JYY5qQEzHdkLsj/8QE4Y9O3fGRg9crkUMIx/d5PfLxHEeYIfxwsuZ4pukIJu91x/4YeZqW6ThO6uNGZ6oOVAS2W6vtovy0B8eWThB/CZdlH9O4dMt4/eVzbadVa4SaW5ox1uNxZWofXlv7eN/H4P/1aar9Zu6eE55nuhlbGYPvSOvtGLwG1gzymj6L/L1oEXL7pj7pQnLRgiRJmiOCFWEMdJNKYNkmBlNxhLqjIgevN7qxYeiycDzH8bjPRu5a0XG6NPJzEEyYZiyPT5jbs7u9GOhg0Q0jXFKgm8bUbdk3HXnKkvVoXMhBCGFK8dTu+HH4JPLvlk0qwh1r5GqE9DXpt+4kSZpIdLt27m6zHomARWjjR1GZ+rws1SOp7ogcVKa6Y4ehw8fxTKOx8PyFVC9FfkxCHwvbWYBPgHs8coftzuj/odaFQtBgypPXxGu/INXukde6lX105njtfD5PRJ5ivjlmL8RfHVemuqcdnCB8l9r1fnTuhl15KkmSNJH4GZJxhsCF8k3MvpiDK4LnY6pbkiRJc0BHlg6lJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmSJEmStGD+BsRP1asepUX9AAAAAElFTkSuQmCC>

[image9]: <data:image/png;base64,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>

[image10]: <data:image/png;base64,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>

[image11]: <data:image/png;base64,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>

[image12]: <data:image/png;base64,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>