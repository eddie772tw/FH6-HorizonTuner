# Swiss 五卡設計與 P0

研究與實作：Sol as Codex。採用 `ponytail` full 與 `halfmoon-design-system`。

Swiss 以資料網格、數字層級、實色訊號建立五卡辨識；Technical 保留冷中性工程字階，Editorial 使用暖表面與自然字距，Contrast 使用黑白灰、直角與反差標頭。三核心共用資料順序、單位、閾值及圖表尺寸。Rhine 保留 MiSans、紙頁、密刻度與方形標記，Swiss 不啟用 `--instrument-linear`。

## 本次 P0

- 駕駛與引擎：內層依核心圓角；RPM 平直分段及穩定警示，方向盤保留原刻度／圓點，踏板日夜導引與功能色獨立。
- Traces：實色圖例與細分界；圖例文字、點及 Canvas 對應相同系列色；保留水平虛線與圓形標記。
- 車輛動力學：既有資料群的標籤字距消費核心 token；Regen 使用功能色，不改 Boost／EV 判定或峰值記錄。
- 輪胎：ANG／RAT 越限使用 danger、警示圈使用 warning token；胎溫標籤消費字體、文字、表面與邊框 token。功能藍／綠／紅保留原 167／221 判定。
- 懸吊：依核心控制項圓角，平面 primary 曲線與既有兩端 danger 警示；去除 Swiss 整層 opacity 衰減，保留四輪鏡像與模式行為。

`canvasTheme.ts` 新增 `flat`（`--instrument-flat`，預設 0）與 `alertFlash`（`--instrument-alert-flash`，預設 1）。Swiss／Rhine 為 1／0。能力只在主題變更讀取並重繪，沒有每幀 CSS 讀取、主題 React key、歷史重置、新依賴或持續動畫。`linear` 繼續管理 Rhine 專屬刻度與 marker。

## 後續與驗收

完整縮寫、單位說明和系列非顏色編碼適合有實際可讀性證據後再補，複用 detail；不增加編號、品牌文案或裝飾性資料。

實際畫面須覆蓋三核心明暗、預設／Swiss Signal／Bauhaus Mono／自訂三色，以及 Rhine／Halfmoon 往返。觀察閒置、HUD 暫停和 render 開關下重繪、歷史保留、圖例對應及無殘留。相同或極端三色的系列可辨識性仍需人工評估，不宣稱任意配色自動符合對比。

檢查 320／768／1024／1280×720／1920×1080、200% 縮放與繁中／英文／日文，特別是標頭、懸吊模式列、tooltip、胎溫標籤和四輪定位。確認 Contrast 標頭控制項、鍵盤 focus、展開／關閉與焦點回復。圖表、功能色和 guide 對比需逐項看，不能用整卡文字對比代替。

聚焦測試驗證 theme 能力與既有輪胎／懸吊行為；全量 frontend test、build、diff check 與瀏覽器實際畫面由整合驗收執行。禁止 CSS 字串、Canvas 呼叫次數或硬編碼座標作為外觀證據。合成資料、真實遊戲和 WebView2 證據分別標示；效能沿用 PR 的 p95 基準。
