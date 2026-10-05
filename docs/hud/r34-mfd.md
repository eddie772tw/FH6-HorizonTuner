# Skyline R34 MFD：原型與遙測契約

## 原型、年代與玩家

`r34_mfd` 以 **1999 Nissan Skyline GT-R BNR34 V·spec 傳統儀表**，搭配後續 **NISMO MFD 擴充套件 Ver.II** 為明確原型。這不是 R35 多功能觸控畫面，也不是以 NISMO 320 km/h／11,000 rpm 替換儀表冒充原廠版本。適合喜歡晚期 1990 年代日系實體儀表、想同時看類比速度／轉速與賽道遙測的玩家。

原廠 V·spec 錶面為 180 km/h、10,000 rpm，轉速錶在 3,000 rpm 以下每千轉 15°，以上每千轉 30°。本實作保留這個非等距幾何：轉速在左、速度在右、左側水溫、右側油量、轉速錶下方油壓。原型的實體速度錶固定標示 km/h；額外數位速度遵循使用者單位，超過原型刻度仍保留正確讀數及 `OVER SCALE`，不把極速改寫成 180。轉速超過 10,000 時同樣保留數位提示。

兩個機殼並排是為 HUD 可讀性重新構圖，不聲稱重現整個車內儀表板的空間位置。所有向量、CSS 外殼與圖示均為原創程式繪製；不附 Nissan/NISMO 照片、商標圖檔、字型或原廠軟體。

## 實際查閱的資料

1. [Nissan 1999 年 1 月原始型錄掃描](https://jdm-catalogues.com/catalogues/nissan/skyline/r34/nissan_skyline_r34_gtr/)，[第 26–27 頁影像](https://images.jdm-catalogues.com/nissan/skyline/r34/nissan_skyline_r34_gtr/images/m/page.14.webp)：實際查看原廠儀表照片、V·spec 雙段刻度說明與原始 MFD 的 SINGLE/TWIN/MULTI 版面。這是第三方保存的 Nissan 原始文件，不是現行官方主機。
2. [Forza 官方 Data Out 文件](https://support.forza.net/hc/en-us/articles/51744149102611-Forza-Horizon-6-Data-Out-Documentation)：`LapNumber` 為「已完成圈數」；車體座標 X 朝右、Z 朝前。HUD 遵循共用 G radar 的使用者指定橫向 X 反向慣例；正縱向仍向下，煞車向上。
3. [NISMO 官方 Z-tune 內裝介紹](https://www.nismo.co.jp/Z-tune/data_e/5.html)：官方明列 MFD 資料記錄、計圈功能；白底 320 km/h 儀表是 Z-tune 組合，未用來推定本 HUD 的原廠刻度。
4. [Ver.II 套件照片與產品識別](https://www.nengun.com/nismo/multi-fuction-display-version-ii)，[實際查看的六格畫面影像](https://image.nengun.com/catalogue/1024x768/nengun-0374-0000-10-nismo-multi_fuction_display_-_version_ii-90bd145a.jpg)：照片直接顯示啟動畫面、SINGLE 左側 30 秒記憶／右側扇形錶、TWIN、七列綠條 MULTI、矩形 G 格線與圈速／五列紀錄。原型增壓刻度是 −0.5 至 2.0 ×100 kPa。另查看的分析軟體影像是外部 Windows 程式，不是第六個車內模式。
5. [社群 R34 MFD 操作整理 PDF](https://www.ninni.info/downloads/R34_GTR_MFD_Manual.pdf)：下載後實際查看照片，確認四個下方按鍵、右側搖桿與 REV 燈的位置。作者 Ned 的整理不是 Nissan 原廠手冊，未當作官方硬體規格。

Ver.II 常被泛稱為擴充「卡匣」，產品清單描述的是電路板、感測器、計圈按鈕／線束與 RS-232C 配套。2371A-RSR48-V 與 2371B-RSR48 的感測器包差異只有零件識別意義；HUD 不模擬安裝、校正或 serial 硬體。舊官方 `ie01.pdf` 連結現在轉址，未假裝已讀到原始套件手冊；也未採用零售文案含糊的油溫範圍作為實作依據。

## 五個 MFD 模式

預設 **SINGLE**。使用主程式 HUD → 進階設定中的 **R34 MFD mode** 切換；設定與既有 BroadcastChannel、POST、原子持久化、WebSocket、Launcher 和 HUDCore 共用管線。

| 模式 | 保留的原型特徵 | 遊戲適配 |
| --- | --- | --- |
| SINGLE | 左側 30 秒格線／右側圓形扇形錶、PEAK 尾板 | 真實 Boost，bar／psi／kPa；缺資料顯示 N/A |
| TWIN | 兩個銀灰刻度、綠色扇形、峰值窗 | 明確標示 BOOST／ENGINE，採增壓與 RPM；不是把油溫改名成轉速 |
| MULTI | 七列白框、綠條、右側數字 | BOOST、ENGINE、THROTTLE、BRAKE、POWER、TORQUE、FUEL；頁尾標示七個遊戲欄位 |
| G | 矩形交叉格線及活動點 | 車體 −X／Z 加速度除以 9.80665，單位 g，顯示界限 ±1.5 g；數字保留超界值 |
| LAP | 左側目前／最佳／上圈，右側五列紀錄 | 目前圈數 = 已完成圈數 + 1；相鄰 LapNumber 推進時，LastLap 記在新完成的圈號，不重建錯過圈數 |

`r34ShowCluster` 只切換傳統儀表；`r34Lighting` 提供 night／day。預設原色為柔暖刻度與綠色 MFD，Custom Gauge Color 改變綠色資料色，紅色指針／REV 安全色保留。原型外殼按鍵是裝飾，不偽裝成 click-through 原生視窗內可操作按鈕。沒有額外 DATA 頁、沒有 Windows 分析軟體假畫面、沒有自製假計圈器。

## 資料誠實與狀態

| 顯示內容 | 唯一資料來源／轉換 |
| --- | --- |
| 速度 | `SpeedMetersPerSecond`；類比面固定 km/h，數位遵循 effectiveUnits |
| 轉速／REV | `CurrentEngineRpm`；REV 採共用 payload `redlineRpm` |
| 增壓 | 有限數字的原始 `Boost`（PSI），保留負值；不取已補零／截負值的 aliases |
| 油量 | 原始 `Fuel` 的 0–1 比例 |
| 踏板／輸出 | `AccelInput`／`BrakeInput` 的 0–255、`PowerWatts`、`TorqueNewtons` |
| G | `−AccelerationX`、`AccelerationZ` 除以 9.80665；依共用 G radar 反向 X，不把垂直 Y 當縱向 |
| 圈速 | `CurrentLap`、`BestLap`、`LastLap`，秒轉分／秒／毫秒；`LapNumber` 是已完成圈數，0→1 的 LastLap 屬於第 1 圈 |
| 原型油壓／水溫 | 永遠 N/A，移除假指針；UDP 未提供這些感測器 |

不推算油溫、水溫、油壓、噴油嘴 duty、進排氣溫、前輪扭力分配，也不將輪胎溫度偷偷冠上油溫名稱。資料缺失是 N/A；數值 0 是有效資料，不混淆兩者。ODO 位置明確使用遊戲 `DistanceTraveled` 的 session distance，並非真車累計里程。

Recorder 優先取 `data.sourceTelemetry` 的原始唯讀封包；否則接受直接 raw fixture。原始 `TimestampMS` 必須是 uint32。重複時間戳的插值畫面不能更新峰值、歷史或最後收訊時間；即使 interpolator 顯示 7,250 rpm，原始 7,000 rpm 峰值仍保持 7,000。接收間隔超過 1,500 ms 進入 STALE，隱藏即時指針／清空即時數字，歷史峰值與過去圈速仍標示為歷史。暫停、缺失／無效 IsRaceOn 或錯誤 payload 都停止記錄並清空即時讀數；只有明確 1／true 才是 live。RPM、油量、踏板及距離等超出有效物理範圍時顯示不可用，不以截斷製造合理值。切車或有圈數／race time 共同佐證的重新開始才重設；單一倒退時間戳視為封包重排並拒收，須在 stale／重設證據存在時取得兩個車輛與時鐘一致、相隔小於 500 ms 且向前推進的候選封包才接受新 epoch。uint32 正常溢位不當成重新開始。

30 秒記憶採 301 個預先配置容量、最多 10 Hz 的環形取樣；畫面與文字採 30 Hz，沒有每幀新增 DOM 或重建靜態錶面。資料中斷產生的長間隔不連成假曲線。G／history Canvas 的 backing store 隨 HUD 最終 scale、DPR、ResizeObserver 與視窗／螢幕密度改變重新配置；每邊最多 2048 像素。邏輯幾何只在這些邊界量測並快取，隱藏／零尺寸不配置，render loop 僅比較快取 DPR 數字以捕捉 media query 可能遺漏的返回轉換，不讀取 DOM 尺寸或在穩定畫格配置物件；destroy 時移除 observer、media query 與 resize listener。

原始 MFD 的完整離線記錄／PC 分析並未實作，不能稱為原廠資料記錄器替代品。

## 驗證入口與限制

採用的 repo skills：`halfmoon-design-system`、`huge-component-refactoring`、`modular-refactoring`。沒有修改 UDP 解碼格式或調校公式。

- `pnpm -C frontend exec vitest run ../hud_overlay/r34_mfd/tests/unit src/features/overlay_control/r34_mfd`：純函式領域狀態、刻度、資料來源、單位與 runtime 持久化設定；DOM／React 驗收僅在 browser fixture
- `cargo test --locked --manifest-path backend-rust/Cargo.toml --test config_contract r34_settings`：五模式 POST／disk／restart／WebSocket relay
- `pnpm -C frontend run test`、`pnpm -C frontend run build`、`git diff --check`：完整前端及靜態關卡
- 以既有靜態伺服器開啟 `hud_overlay/r34_mfd/tests/visual/fixture.html`：人工操作真實 iframe；合成遙測、裝飾按鍵，不修改外部帳號
- `PLAYWRIGHT_MODULE_PATH=/path/to/playwright PLAYWRIGHT_CHANNEL=chrome OUTPUT_DIR=/tmp/r34-preview node hud_overlay/r34_mfd/tests/visual/render.mjs`
- 同上執行 `frontend/src/features/overlay_control/r34_mfd/tests/browser/verify.cjs`：真實 OverlayView 控制、五模式／day-night／cluster、disk-backed HTTP、reload／reset／切換返回、六種 Halfmoon 主題及窄版繁中／日文含字形驗證
- 同上執行 `launcher.mjs`：真實 Launcher → Coordinator → sourceTelemetry → HUDCore 流程、模式 relay、缺失 boost、stale replay、切換返回

讀數可見性檢查除了 viewport 包含性，也直接比較刻度／單位與同層 PEAK 面板的幾何重疊；bar、psi、kPa 與 RPM 最大刻度都必須完整可讀。狀態提示放在機殼下方的透明留白，設定頁則驗證完整英語原文與繁中／日文翻譯，不接受顯示短 lookup key。

視覺 workflow 使用 GitHub Actions 的 Google Chrome 並維持 `chromiumSandbox: true`，輸出 720p／1080p／DPR 2 的實際 HTML／SVG／Canvas 截圖與 JSON 證據。不得用停用 sandbox 迴避本地環境限制。這些是 Chrome fixture，仍不是 Windows 原生透明 click-through 或真實遊戲驗收；完成狀態以該 PR 的實際結果為準。
