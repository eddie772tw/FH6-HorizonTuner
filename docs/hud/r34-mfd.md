# Skyline R34 MFD：核心錶盤、原型與遙測契約

## 當前設計與速度單位

本款採 **R34／V·spec 10,000 rpm 雙段轉速錶**，搭配 **2002 Nür 300 速度錶面**與 **NISMO MFD Ver.II** 畫面語彙。這是依使用者要求的 HUD 佈局適配，不冒稱整組原裝座艙，也不是 R35 或 NISMO 320 儀表。

**全部速度讀數刻意固定為 kmh**：由原始 `SpeedMetersPerSecond × 3.6` 取得，全球 mph 設定不改變數字、錶面或指針。原件印字是 `km/h`，本 HUD 依使用者明確要求改為字面 `kmh`；已註記於受支援的 `author.json.description`。300 以上保留真實數字與 OVER SCALE，只有指針停在最大刻度；缺失仍是 N/A。里程窗顯示遊戲 session distance（km），不是車輛累計里程。

Nür 面板為 0～300、每 20 標號、每 10 刻線，數字較緊湊粗實。兩張原件照片支持約 250° 的視覺弧形，0 附近另有相近參考刻線；無工廠工程圖可證實其精確低速校準，因此本 HUD 使用穩定的線性 0～300 視覺映射，不把照片估角冒稱工廠尺寸或電子校準曲線。V·spec 轉速錶保留型錄明載的 3,000 rpm 以下每千轉 15°、以上每千轉 30°。

## 獨立定位與固定子錶

- 中下方：轉速左、速度右；檔位與數位 kmh 放在兩錶之間，取消外框與資訊卡片
- 兩個外側子錶：左側固定 BOOST；右側固定四輪平均 TIRE TEMP。沒有自訂資料來源或角度選項
- 右下角：獨立 MFD 螢幕。取消遮光罩、銀色連續飾板、外殼、搖桿、裝飾按鍵與不可用的油壓內嵌錶
- 兩支子錶指針都只在左半部掃動：低值左下、半量正左、高值左上。胎溫採 C/H（冷／熱）及溫度計圖示，另明示 TIRE TEMP、真實數值與 °C／°F，並非水溫
- 純函式 `layout.js` 使用 viewport、HUDCore 的使用者縮放與可用空間計算各獨立元件。先同時檢查寬、高，再限制至可容納的尺寸；右子錶與 MFD 保留間隔。720p、1080p、1440p、超寬、3840×360 矮視窗及 compact／放大倍率均有幾何契約
- 隱藏儀表組時，MFD 保持獨立右下定位，不留下原機殼尺寸的空位。產品背景透明；靜態提案中的道路背景與標註不包含於產品

靜態錶面、數字筆畫與圖示皆為原創向量，初始化組裝一次；不附 Nissan/NISMO 照片、標誌圖檔、OEM 字型或軟體。沒有逐幀重建字形或材質濾鏡。

## 實際查閱的資料

1. [Nissan 1999 年 1 月原始型錄掃描](https://jdm-catalogues.com/catalogues/nissan/skyline/r34/nissan_skyline_r34_gtr/)，[第 26–27 頁影像](https://images.jdm-catalogues.com/nissan/skyline/r34/nissan_skyline_r34_gtr/images/l/page.14.webp)：實際查看原廠儀表照片、V·spec 雙段刻度說明與原始 MFD 的 SINGLE/TWIN/MULTI 版面。這是第三方保存的 Nissan 原始文件，不是現行官方主機。
2. [Forza 官方 Data Out 文件](https://support.forza.net/hc/en-us/articles/51744149102611-Forza-Horizon-6-Data-Out-Documentation)：`LapNumber` 為「已完成圈數」；車體座標 X 朝右、Z 朝前。HUD 遵循共用 G radar 的使用者指定橫向 X 反向慣例；正縱向仍向下，煞車向上。
3. [NISMO 官方 Z-tune 內裝介紹](https://www.nismo.co.jp/Z-tune/data_e/5.html)：官方明列 MFD 資料記錄、計圈功能；白底 320 km/h 儀表是 Z-tune 組合，未用來推定本 HUD 的原廠刻度。
4. [Ver.II 套件照片與產品識別](https://www.nengun.com/nismo/multi-fuction-display-version-ii)，[實際查看的六格畫面影像](https://image.nengun.com/catalogue/1024x768/nengun-0374-0000-10-nismo-multi_fuction_display_-_version_ii-90bd145a.jpg)：照片直接顯示啟動畫面、SINGLE 左側 30 秒記憶／右側扇形錶、TWIN、七列綠條 MULTI、矩形 G 格線與圈速／五列紀錄。原型增壓刻度是 −0.5 至 2.0 ×100 kPa。另查看的分析軟體影像是外部 Windows 程式，不是第六個車內模式。
5. [社群 R34 MFD 操作整理 PDF](https://www.ninni.info/downloads/R34_GTR_MFD_Manual.pdf)：下載後實際查看照片，確認四個下方按鍵、右側搖桿與 REV 燈的位置。作者 Ned 的整理不是 Nissan 原廠手冊，未當作官方硬體規格。

6. [原裝 BNR34 儀表實物](https://www.vspecperformance.com.au/products/1460)：實際查看高解析度拆下的 OEM 機殼，確認銀色連續飾板、黑色罩體、各錶大小、油壓下弧與細刻度；賣家標示 1999–2002，精確 V·spec 刻度仍由 1999 Nissan 型錄佐證。
7. [車主夜間儀表照片](https://www.flickr.com/photos/iwanta34gtr/7609565064)：確認刻度、指針與下弧細節；拍攝白平衡或改裝燈泡可能影響色調，沒有將照片的藍白色直接視為原廠燈色規格。
8. [MFD 正面操作照片](https://toprankglobal.jp/news/92/How%20to%20use%20the%20R34%20Nissan%20Skyline%20GT-R%20MFD%20:%20Part%201)、[NISMO 官方維修照片](https://npc-staffblog.nismo.co.jp/archives/2019071710004536252)：實際查看正面、拆下及裝回車內的多張照片，確認低寬遮光罩、內凹面板、四個下鍵、REV 燈和大型環形搖桿。這些標準 MFD 畫面只佐證機殼，不覆蓋 Ver.II 的 −0.5～2.0 刻度與較深畫面色。
9. [Nissan 1999 R34 Supplement 1 維修手冊掃描](https://www.yariksteel.ru/manual/R34/R34_Service_supplement_1.pdf)：實際查看封面、Nissan 前言及 EL-31（PDF 第 175 頁）的 MFD 外觀與操作圖；這不是 NISMO 擴充套件手冊。
10. [1999 全座艙照片](https://toprankglobal.jp/stockdetail/32911/1999%20Nissan%20SKYLINE%20GT-R)：實際查看銀色原型儀表與中央 MFD 的左右位置，未將後來的 320 km/h 改裝面板混入原廠參考。

Ver.II 常被泛稱為擴充「卡匣」，產品清單描述的是電路板、感測器、計圈按鈕／線束與 RS-232C 配套。2371A-RSR48-V 與 2371B-RSR48 的感測器包差異只有零件識別意義；HUD 不模擬安裝、校正或 serial 硬體。舊官方 `ie01.pdf` 連結現在轉址，未假裝已讀到原始套件手冊；也未採用零售文案含糊的油溫範圍作為實作依據。

11. [Nür 300 原裝速度錶商品與實物照片](https://nizmopartsplug.com/products/r34-skyline-gtr-v-spec-ii-nur-300kmh-speedometer)：實際查看 AA414 面板、0～300 標號、10 間隔刻線、原件 km/h 字樣及 0 附近相近刻線；不是 NISMO 320 或 GT-T 300 錶。
12. [2002 V-spec II Nür 完整儀表照片](https://www.jdmgarage.com.au/wp-content/uploads/2022/02/0960725D-A341-4B35-84E3-922E3951969B.jpg)：實際查看完整原件與速度盤裁切，交叉確認數字、弧形及原件配置。參考圖僅用於查閱，未嵌入產品或預覽資產。

## 五個 MFD 模式與真正選單

保留 **SINGLE／TWIN／MULTI／G／LAP 全部五頁**，預設 SINGLE。比照現有 S650，於主程式 HUD → 進階設定的 **R34 MFD mode** 選單切換。此選單使用既有 BroadcastChannel、POST、原子保存、WebSocket、Launcher、HUDCore 管線；原生 overlay 維持 click-through，沒有假裝能點的螢幕按鍵。

| 模式 | 保留的畫面語彙 | 遊戲資料 |
| --- | --- | --- |
| SINGLE | 左側 30 秒記憶、右側銀灰刻度／綠色扇形／PEAK | 原始 Boost，依偏好顯示 bar／psi／kPa，含負壓 |
| TWIN | 兩個扇形錶與歷史峰值 | BOOST 與 RPM／x1000 rpm；不偽裝成油溫／水溫 |
| MULTI | 七列白框、綠條、右側數字 | BOOST、ENGINE、THROTTLE、BRAKE、POWER、TORQUE、**TIRE TEMP** |
| G | 矩形交叉格線與活動點 | 車體 −X／Z 加速度 ÷9.80665，±1.5 g 視窗，保留超界數字 |
| LAP | 目前／最佳／上圈、五列紀錄 | 目前圈數=已完成圈數+1；只記錄真正觀察到的相鄰圈數推進 |

`r34ShowCluster` 控制四個核心錶盤與中間讀數，`r34Lighting` 控制 day／night。Custom Gauge Color 只改變 MFD 資料色；紅色指針與 REV 安全色保留。REV 取真實 RPM/redline，獨立於是否顯示檔位。

## 四輪平均胎溫與單位

唯一來源是唯讀原始封包的 `TireTemp = [FL, FR, RL, RR]`。專案 raw 契約是 Fahrenheit；官方 FH6 文件列出四輪溫度欄位，但沒有明寫其溫度單位。

`meanTireTemperatureC` 必須收到**剛好四個有限數字**，先算全四輪平均 °F，再一次轉成 canonical °C。缺少、null、字串、NaN 或 Infinity 任一輪均是 N/A，不計算部分平均，也不使用 Coordinator 補零的外層 alias。原始 0°F 與負值有效；例如 [32,68,104,140] 得30°C／86°F，而四個0°F得−17.78°C。

右子錶與 MULTI 的 **TIRE TEMP** 共用同一平均與比例。顯示量程固定 canonical **0～150°C（32～302°F）**，這是顯示範圍，不是冷卻水數值或輪胎安全門檻。切換 C/F 不改變指針或綠條位置；超界只限制幾何，數字仍保留負值或較高溫度。

使用既有 **HUD Unit Settings → Temperature**，可以跟隨 app 溫度偏好或獨立保存 C/F；沒有新增 R34 專用重複單位控制。缺失／無效溫度偏好回到 C，不能從 mph 猜測 Fahrenheit。effectiveUnits 仍是 renderer-only 衍生欄位，不寫入持久設定。

## 資料誠實與狀態

| 顯示 | 原始來源／轉換 |
| --- | --- |
| 速度、里程窗 | SpeedMetersPerSecond×3.6，固定 kmh；DistanceTraveled÷1000，session km |
| RPM／REV | CurrentEngineRpm；共用 payload redlineRpm |
| Boost | 原始有限 Boost（PSI），保留負壓，拒絕補零／截負 aliases |
| 胎溫 | 四個 raw TireTemp °F 的嚴格平均→canonical °C→顯示 °C／°F |
| 踏板、輸出 | AccelInput／BrakeInput 的0～255、PowerWatts、TorqueNewtons |
| G | −AccelerationX、AccelerationZ ÷9.80665；不使用垂直 Y |
| 圈速 | CurrentLap／BestLap／LastLap 秒數；LapNumber 是已完成圈數 |

沒有合成油溫、水溫、油壓、噴油嘴 duty、進排氣溫或前輪扭力分配。所有缺失即時值顯示 N/A 並隱藏指針；合法零值不等於缺失。

Recorder 優先取 `data.sourceTelemetry` 的原始唯讀封包；否則接受直接 raw fixture。原始 `TimestampMS` 必須是 uint32。重複時間戳的插值畫面不能更新峰值、歷史或最後收訊時間；即使 interpolator 顯示 7,250 rpm，原始 7,000 rpm 峰值仍保持 7,000。接收間隔超過 1,500 ms 進入 STALE，隱藏即時指針／清空即時數字，歷史峰值與過去圈速仍標示為歷史。暫停、缺失／無效 IsRaceOn 或錯誤 payload 都停止記錄並清空即時讀數；只有明確 1／true 才是 live。RPM、油量、踏板及距離等超出有效物理範圍時顯示不可用，不以截斷製造合理值。切車或有圈數／race time 共同佐證的重新開始才重設；單一倒退時間戳視為封包重排並拒收，須在 stale／重設證據存在時取得兩個車輛與時鐘一致、相隔小於 500 ms 且向前推進的候選封包才接受新 epoch。uint32 正常溢位不當成重新開始。

30 秒歷史使用預先配置 301 個樣本、最多 10 Hz 取樣，顯示最多 30 Hz。Canvas backing 隨獨立 MFD 縮放、DPR 與 resize 邊界更新，每邊最多 2048 像素；穩定畫格不量測 DOM。保留 DPR 1→2→1 回復、observer／media-query／RAF 清理與原始 sourceTelemetry 證據契約。

完整原廠離線記錄／RS-232C PC 分析、額外 DATA 頁、自製計圈器與後續高性能版本功能皆未實作。

## 驗證入口與證據邊界

採用 skills：`halfmoon-design-system`、`huge-component-refactoring`、`modular-refactoring`。沒有改 UDP 解碼或其他 HUD 的繪圖程式。

- `pnpm -C frontend exec vitest run ../hud_overlay/r34_mfd/tests/unit src/features/overlay_control/r34_mfd`：狀態／刻度／固定 kmh／嚴格四輪平均／C-F 比例／左半掃動／responsive 純函式
- `cargo test --locked --manifest-path backend-rust/Cargo.toml --test config_contract`：頁面與新增溫度單位的 POST／disk／restart／relay
- `pnpm -C frontend run test`、Windows 及 LAN 前端 build、`git diff --check`：aggregate gates
- `hud_overlay/r34_mfd/tests/visual/fixture.html`：人工操作真實 iframe，僅使用合成封包
- `PLAYWRIGHT_CHANNEL=chrome PLAYWRIGHT_MODULE_PATH=/path/to/playwright OUTPUT_DIR=/tmp/r34-preview node hud_overlay/r34_mfd/tests/visual/render.mjs`：720p／1080p 透明全畫面、五頁 DPR1 MFD 裁切、DPR2、負壓、C/F、部分缺胎溫、stale、最小／中間／最大左掃動、1440p／ultrawide／矮視窗及 compact
- 同上執行 `launcher.mjs`：真正 Launcher／Coordinator 與持續遙測下 C/F config 更新、固定 kmh、原始缺值與 stale replay
- 同上執行 `frontend/src/features/overlay_control/r34_mfd/tests/browser/verify.cjs`：真實五頁選單、day/night、cluster、單位繼承／獨立 C/F 保存重載、reset、六主題、窄版繁中／日文

Chrome fixture 保持 `chromiumSandbox:true`，不以停用 sandbox 繞過本地限制。靜態構圖不能取代真正 HTML／SVG／Canvas 像素驗證；Chrome 證據也不是 Windows 原生透明 click-through 或遊戲實測。

## 先前外殼版本

`docs/assets/r34-mfd/` 目前保存的 `bed166f` 圖片屬於已被本次無外框／Nür300 方向取代的歷史版本，不能作為新佈局完成證據。新的透明 runtime 圖與來源紀錄將在本次視覺 CI 通過並實際審閱後更新。
