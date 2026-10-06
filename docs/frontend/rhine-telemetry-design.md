# Rhine 五張即時遙測卡片設計研究

日期：2026-10-06。範圍：`codex/rhine-lab-theme` 工作樹中的五張即時遙測卡片；本稿由使用者指定的 Sol 子代理執行唯讀研究，主代理整理入庫；研究本身不修改產品程式碼、不操作瀏覽器。採用 `ponytail` full 與 `halfmoon-design-system`；遵循 `.agents/AGENTS.md`、`.agents/rules/ui-architecture.md` 及 `HALFMOON_SPECIFICATION.md`。

來源專案 `D:/RhineLabUI` 經唯讀確認 HEAD 為 `3664b4abe3b7e852c7022a261e2d66d8f2e8c667`，來源工作樹未修改。HorizonTuner 的 Canvas、`canvasTheme.ts`、Rhine token 與部分樣式正由主代理修改；以下產品行號是研究時的快照，落實前須重新定位。主代理已表示將納入 token 快取、切換時重繪、平直 RPM、細刻度方向盤、實線 trace 格線、語意油門／煞車色、方形歷史點、平面懸吊線、輪胎語意色與 label、內層材質及圖例對齊。這些列為本輪方向，不宣稱已完成或通過視覺驗收。

## 結論與 Rhine／Swiss Editorial 的區別

Rhine 的辨識度應來自「可操作的量測工作台」：固定欄位、刻度定位、標籤與讀值對齊、圖例及當下／歷史標記一致。暖紙色、細框、無光暈、2px 圓角已是 Rhine 與 Swiss Editorial 的共同部分，單靠再調暖色不足以區分。

| 元素 | Rhine 建議 | Swiss Editorial 保持的定位 |
| --- | --- | --- |
| 標頭 | MiSans 600、約 1rem、緊湊檔案標籤、短定位刻線 | 自然字距、1.05rem 標題、閱讀節奏 |
| 資料 | 固定數值欄、單位附屬、細尺規、當下與歷史的記號層級 | 數值仍清楚，但不複製 Rhine 專屬的儀器刻度語彙 |
| 圖表 | 較完整而克制的尺規、平直量測條、方形歷史／扭力點 | 既有 Swiss 圖表與版面規則 |
| 操作 | 定位刻線與可辨識的已選狀態；動作保有完整焦點 | 既有底線分頁、閱讀式標頭與細框控制項 |
| 品牌與警示 | 墨／青銅供檔案與通道識別，成功／警告／危險獨立 | 同樣保留功能語意色，個性不由警示色承擔 |

依據：來源 `DESIGN.md:34-37` 指定暖灰白、黑字、暖杏金選取、細線與緊湊排字；`src/workbench.css:16-33` 已有 kicker、數值與單位分級、tabular-nums、細規線，`:48-55` 以左側刻線表示選取。來源 `src/style.css:437-453` 的細線與方形端點也能抽取成純 2D 語彙。這是對來源的設計推論，來源沒有 HorizonTuner 的五卡規格。

產品定位依據：`docs/frontend/rhine-lab.md:54-56` 的「下一階段」說明；`frontend/src/styles/design-systems/swiss.css:129-135` 的 Editorial token；`frontend/src/styles/design-systems/rhine.css:72-104` 的標頭與儀表 token。沿用 MiSans 400／600；不仿造來源的 300／700、不引入 Novecento、不增加虛構權限、檔案編號或 Rhine 品牌文案。

## 所有卡片的共通調整

1. **外框與內層材質（P0，本輪範圍）**：外層已為平面細框，但內層大量 `border rounded-3` 並不匹配 Rhine 只覆寫 `.glass-panel/.card/.halfmoon-card` 的 selector。使用少量語意 hook 對真正的儀器表面、量測軌道覆寫圓角與投影；不要用 `.telemetry-card-shell * { border-radius:0 }`，G 力與抓地圓圈是量測幾何，須保持圓。證據：`rhine.css:118`、`TelemetryView.tsx:265`、`EngineRpmDisplay.tsx:151,160`、`TireRadar.tsx:395`、`SuspensionBar.tsx:177,180`。
2. **標頭與操作（P1，下一階段）**：沿用 `workspace-panel-header` 與現有標題，不另加一行裝飾英文或序號。可在現有內距中用 CSS pseudo-element 放短定位刻線，不改 header 高度。渲染 switch、展開按鈕、懸吊模式保持順序與鍵盤行為；不要讓每張卡的標頭呈現成同權重的品牌按鈕群。已選模式以清楚底色／底線表示，不能只靠青銅色。`TelemetryCardShell.tsx:60-88`、`TelemetryView.tsx:355-369`。
3. **字階與數值（P1）**：三層即可：卡名 600、主要值 600／tabular-nums、標籤／單位 400 或 600 的次要墨色。規則與資料用同一 MiSans／回退字體；避免 9.6px 標籤、全部大寫及所有內容都同樣粗。數值與單位始終分開，保留符號、精度及既有單位轉換。全域已提供 tabular-nums，無需增加數字元件或字體依賴。`base.css:27-41`、`components.css:50-54`。
4. **通道色與功能色（P0）**：DOM 圖例與 Canvas 要消費同一語意 token，不以 `.text-primary/.text-secondary` 的廣泛覆寫抹掉圖例通道色。`--primary/--secondary` 可供 power／torque 通道；油門、煞車、胎溫與危險必須獨立。黑白／青銅品牌換成自訂三色也不能把失去抓地、換檔提醒變成品牌色。`rhine.css:16-23,37-44,137`、`PedalTraceCanvas.tsx:172-179`、`PowerTorqueCanvas.tsx:220-227`。
5. **高頻與動畫（P0）**：只在主題切換重新取得 CSS token，再以目前值或歷史重繪；不重新掛載、不清歷史、不在封包循環讀 DOM，不增加 React state 或新的持續 rAF。既有 telemetry、peak decay／G marker 更新頻率維持。`canvasTheme.ts:1-34`、`docs/frontend/design-systems.md:46` 附近。`animation:none` 不會阻止 Canvas 自己換色，因此另檢查 RPM 的白／紅閃爍。

## 五張卡片逐項建議

### 1. 駕駛輸入／引擎

| 元素 | 現況／問題 | 可實作建議與優先序 |
| --- | --- | --- |
| RPM 條與當下值 | 主代理已改平直段條，仍保留 30 段與既有閾值。程式每 100ms 切白／danger，不受 CSS 動效例外阻止 | P0：Rhine 保持平直無光暈；SHIFT 以靜態 danger＋文字表示，保留觸發條件。勿讓淺色背景下的白段消失。若 72% 分段具有預警用途，使用獨立 warning token；不依可自訂 secondary 推論危險 |
| 檔位／轉速／速度 | 大小分級已存在，GEAR／SPEED 小字仍 0.6rem | P1：同一組標籤字級／字距，主要值與單位保持 baseline、tabular-nums；沿用 N／R 等原輸出，不增加輪播字 |
| 方向盤 | 正在改成細弧＋25 刻度＋方形即時端點；大角度值用 secondary | P1：中立刻度較清楚，其餘刻度次要；大轉向角只是量測，不應包裝成故障警報。保留方向文字與角度，不為風格擴大儀表或更改顯示比例 |
| CLT／THR／BRK／HBK | 四條依序存在，`TelemetryView` 仍直接傳四個 HEX。軌道 25/50/75% 指示用白色透明線，淺色不清楚 | P0/P1：維持原順序、寬度與 peak 行為；油門／煞車對齊 trace 語意 token；離合／手煞車也改 token，保留可區分通道色。軌道刻度改 divider／tick；Rhine 用方正量測槽與細 peak 線 |

證據：`EngineRpmDisplay.tsx:60-108,131-135,151-181`；`ArcSteerGauge.tsx:58-104,122`；`TelemetryView.tsx:271-274`；`VerticalInputBar.tsx:83-113`。現有 88%／油門門檻、資料選取器與 peak decay 均不因樣式變更而調整。

### 2. 即時軌跡

| 元素 | 現況／問題 | 可實作建議與優先序 |
| --- | --- | --- |
| 油門／煞車圖例 | Canvas 已讀 token，DOM 使用 text-success／text-danger 與圓點；窄尺寸右側技術標題可能與左圖例擠壓 | P0：曲線、色票、標籤用同 token；保持文字，不能僅靠紅綠。P1：在現有上方留白內，圖例保留，右側重複描述優先縮略或在窄尺寸隱藏；不增加圖表 header 高度 |
| 波形／格線 | 正改為實線格線，曲線保持既有強度與300樣本 | P0：線條清楚、格線較淡、無發光。P1：0/50/100% 可放在現有內側，維持原 plot 區；不得把 300樣本軌跡標為固定 5秒，X 是樣本距離，真實到達間隔可變 |
| Power／Torque 圖例與點 | 扭力方形、馬力圓形是可用的非色彩差異；DOM 原為兩個圓點，`text-primary`又被中性化 | P0：圖例匹配實際點形與實際通道色；保留當下點大於歷史點的層級，禁止全部同形同色。平方化不必跨所有系列強制統一 |
| 坐標與單位 | X 用 RPM；兩個具有不同單位的輸出值共用 numeric combinedMax | P1：保留現有算式與縮放，明確標 X 為 RPM；各通道顯露由轉換器取得的單位，不新增共同 Y 單位、不暗示 power／torque 的高度可作物理量大小比較 |
| 圖例表面 | 頂部漸層可讀，但偏玻璃／浮層語彙 | P1：Rhine 用平整紙面或透明檔案欄，分界線細且次要；不佔用額外高度、不擋資料 |

證據：`PedalTraceCanvas.tsx:106-145,171-183`、`PowerTorqueCanvas.tsx:126-194,219-231`、`canvasTheme.ts:36-58`。同時保留原時間順序、history offset、350樣本與重置條件；研究沒有要求更換圖表庫。

### 3. 車輛動態／G 力

| 元素 | 現況／問題 | 可實作建議與優先序 |
| --- | --- | --- |
| Power／Torque／Boost or Regen、峰值、極速 | 三組小卡框多，所有標籤偏粗，EV regen 以 `#00ff88`顯示 | P1：現有數據順序與三欄保留，以同一紙面、細分隔組織成資料表；regen 使用成功／能源回收語意 token，保留 ON/OFF 與負值。Boost 不是危險，避免視覺誤導 |
| 名次、圈速 | 有標籤與數值左右對齊，適合檔案工作台；Best Lap 當前 primary | P1：保持對齊、固定數字字體、最佳圈速用600與原標籤區別；不要讓字重／顏色暗示圈速屬於警示 |
| G 力圓、0.5G內圈、十字 | 圓有物理量測意義；0.5G用虛線 | P0：保持圓與原尺度／方向。主外框與十字清楚、0.5G保持次級参考，虛線可保留；不因 Rhine“實線”要求消灭層級 |
| 當下點／歷史極值 | 已改方形歷史，當下為較大圓點；視覺能分層但欠説明 | P1：維持當下圓、歷史方，另在既有 detail／tooltip或圖例說明，不增永久占高的文字塊。Lat／Lon readout優先墨色而非去對應不存在的兩條曲線色 |
| 危險語意 | G值大不自動等於車輛失控 | P0：不添加 G>某值染紅、閃爍或跳動；無來源診斷不可新建“危險”規則 |

證據：`VehicleDynamicsDisplay.tsx:89-106,134-181`、`GForceRadar.tsx:191-201,228-305`。數值絕對值、G換算、clamp、30秒極值窗口與更新頻率皆不變；僅設計顯示方式。

### 4. 四輪抓地／胎況

| 元素 | 現況／問題 | 可實作建議與優先序 |
| --- | --- | --- |
| 四輪位置與左右鏡像 | FL/FR/RL/RR資料順序與鏡像具有空間意義 | P0：維持，輪位標籤 MiSans 600、次要分界統一；不要為了“讀表”交換四角或所有內容強制左對齊 |
| ANG／RAT 讀值 | 0.6rem縮寫、數值較大，超閾值原用可自訂secondary | P0：越限讀值使用既有 danger，保留現有閾值。P1：從現有 detail/術語說明提供完整標籤；不擅自給 ANG加°，遊戲字段/歸一化含義須由領域文件確定 |
| 抓地圓與軌迹 | 原大量白色透明 guide、硬編碼紅；主代理已開始語意token整合 | P0：軌迹／底圖各有層級、狀態色獨立，超出保留紅與明顯外框；閾值圈保留測量位置和虛線語義，無光暈但不抹除風險 |
| 胎溫分布／範圍線 | 藍／綠／紅區間源自現有167/221原始溫度門檻，峰點白線 | P0：cold/normal/hot token的日夜色；不能將三區變墨／青銅或調整門檻。P1：無色也可看區界與當前位置；單純改色不應稱為完成色弱可達性 |
| 當前溫度label | 原Courier New／700／白字黑底，與MiSans紙面不一致；主代理已加語意class | P0：scoped CSS使用MiSans400/600、text/surface token與明確邊框；保持label貼近當前溫度、不遮擋柱，邊緣沿用原left/transform策略。P1：溫度單位在既有detail或當前文字表達，不能只顯示數字讓用戶猜單位 |

證據：研究中的 `TireRadar.tsx:201-218,270-283,301-366,395-444`；此檔被同步修改，行號須再確認。來源範圍／計算固定，絕不把167/221直接標為攝氏。

### 5. 四輪懸吊

| 元素 | 現況／問題 | 可實作建議與優先序 |
| --- | --- | --- |
| Relative／Absolute操作 | 實際變更量測模式，不是主題選項 | P0：保持既有按鈕、順序、模式及history重置策略；已選狀態充分區分、keyboard焦點清楚。P1：保持翻譯與完整accessible name，窄尺寸只調控制對齊，不縮字到不可讀 |
| 四輪軌道 | pill外觀與Rhine平直量測不一致 | P0：Rhine限定方正槽與中線，保留寬20px／既有高度、四角位置與鏡像，不更改相對顯示為centered zero |
| 曲線／兩端警示帶 | 正改為平面primary線、兩端danger警示 | P0：保留警示帶與界線，品牌色線不應蓋過危險；range帶是既有顯示邊界，不因外觀宣稱為新的底盤故障判定。P1：避免額外 `opacity-75`再降低整個Canvas對比，改由token控制背景/資料分層 |
| Min／現在／Max、單位 | 已清楚三組，但小寬度時難容納；當下值單位緊貼 | P1：維持順序、精度、單位與minmax記錄；當前600／墨色，極值次級；微小間隔或static label簡化應經三語實際檢查，不能隱藏讀值或改單位 |

證據：`SuspensionBar.tsx:36-44,51-65,84-86,126-147,177-194`、`TelemetryView.tsx:355-369`。警示區與曲線仍依既有`getSuspensionDisplayValue`，不新增物理模型、不改圖表尺寸。

## 優先序、共用改善與驗收

| 階段 | 共用改善 | Rhine限定部分 |
| --- | --- | --- |
| P0，本輪 | Canvas token在切換時刷新；閒置/暫停時重繪；history保留；DOM圖例對應真實繪製色／形；功能色脫離品牌色 | 平直RPM、細方向盤刻度、紙面guide、方形history/torque、平面懸吊線、MiSans溫度label、內層平面材質、靜態SHIFT |
| P1，下一階段 | 可讀完整單位與圖例、精度/符號保留、三語窄尺寸、鍵盤焦點與tooltip內容可達 | 現有內距中的標題定位線、固定檔案式標籤欄、量測刻度層級、讀值/單位統一字階 |
| P2，有實際需求再做 | 有證據後才補圖表說明和診斷顯示，複用既有detail | 不以新增mock檔案編號、掃描線、音效、3D或持續動畫增加辨識度 |

明／暗需分別檢查每條曲線、危險色、marker、thin guide與紙面之間的對比，尤其 custom三色、溫度normal綠和淺色RPM。不要只用整張卡的文字對比代表圖表可讀性。閾值或危險用文字/形狀/邊界輔助，保留原語意與門檻。

窄尺寸沿用已有 responsive卡片排列與圖表尺寸；不得靠 `order`重排四輪或五卡。以320／768／1024／1280×720／1920×1080、200%縮放與三語檢查：卡名縮略但完整名稱可達、圖例不遮擋資料、懸吊操作不被裁切、ANG/RAT/胎溫與單位可讀、四輪位置仍能辨識。`RenderSwitch.tsx:41-49` 的 nowrap提示與`TelemetryCardShell.tsx:55` 的overflow-hidden可能相互裁切，需實際驗收；若發生，先在既有提示樣式中限制可用寬度並允許文字換行，不預先新增通用tooltip框架。

驗收沿用 frontend test、build、git diff --check與設計系統往返檢查，勿新增 Canvas API調用次數／硬編碼座標測試。用同資料比較Rhine／Swiss／Halfmoon，確認切換後歷史不重置、暫停時style已更新、切回無殘留；既有reduced motion不等於Canvas閃爍已關閉。資料來源為合成時須明示，真實遊戲及WebView2設備證據另列。p95退化界線依`docs/frontend/rhine-lab.md`為10%；本研究沒有執行瀏覽器、性能或真實裝置驗收。

## 最小實作方式

繼續使用現有CSS模組、少量語意class及`canvasTheme.ts`，在各Canvas當前draw function內讀取快取 token。功能色的中性預設集中定義在共同token層，各system只覆寫值。Rhine幾何差異用existing `instrument-linear`能力；頁面不增加core判斷，不複製5套組件、不引依賴、不把所有系列統一成方塊。

字階、尺規文字與額外說明屬下一階段，應先證明確有可讀問題並以當前繪圖區域內可行的改動實現。3D、持續掃描、額外啟動場景與視覺假數據都不進入方案。
