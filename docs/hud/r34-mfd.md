# Skyline R34 MFD：核心錶盤、原型與遙測契約

## 當前設計與速度單位

本款採 **R34／V·spec 10,000 rpm 雙段轉速錶**，搭配 **2002 Nür 300 速度錶面**與 **NISMO MFD Ver.II** 畫面語彙。這是依使用者要求的 HUD 佈局適配，不冒稱整組原裝座艙，也不是 R35 或 NISMO 320 儀表。

**類比速度錶面與指針刻意固定為 kmh**：由原始 `SpeedMetersPerSecond × 3.6` 取得，全域 mph 設定不改變此錶面或指針。速度錶下方 LCD 則顯示檔位與**依選定單位換算的數位速度**。原件印字是 `km/h`，類比錶面依使用者要求改為字面 `kmh`；這個僅限類比錶面的例外已註記於受支援的 `author.json.description`。300 kmh 以上保留真實數位換算值與 OVER SCALE，只有類比指針停在最大刻度；缺失仍是 N/A，不採用 Coordinator 補零 alias。原有里程窗已由新 LCD 內容取代。

Nür 面板為 0～300、每 20 標號、每 10 刻線，數字較緊湊粗實；本輪只把速度數字字形高度由 12.25 降至 10.5，不改數字中心、刻線位置或 0～300 範圍。兩張原件照片支持約 250° 的視覺弧形，0 附近另有相近參考刻線；無工廠工程圖可證實其精確低速校準，因此本 HUD 使用穩定的線性 0～300 視覺映射，不把照片估角冒稱工廠尺寸或電子校準曲線。本輪轉速錶依使用者提供的 Nür 實物照片與明確要求，採 0→3,000 rpm 的等距壓縮視覺映射（150°→180°、每千轉 10°），再以每千轉 30° 遞增至 10,000 rpm 的 390°。因此 0／10 與 3／9 刻度成對左右對稱。低段只繪主刻線，0～3 數字縮小以保留可見間隙；主刻線位置與指針映射不因字形調整而改動。這是本次 HUD 的參考圖適配，不宣稱為原廠電子校準；先前以 1999 型錄 15° 低段描述此 HUD 的說法已不適用。

## 獨立定位與固定子錶

- 中下方：轉速左、速度右，各自底部有外形一致的 LCD；兩錶之間的懸浮檔位／速度純文字已移除
- 兩個外側子錶：左側固定四輪平均 TIRE TEMP，右側固定 BOOST。沒有自訂資料來源或角度選項
- 右下角：獨立 MFD 螢幕。取消遮光罩、銀色連續飾板、外殼、搖桿、裝飾按鍵與不可用的油壓內嵌錶
- 兩個小錶採鏡像偏心軸：左胎溫軸心向左偏移，C→H 由右下掃至右上；右增壓軸心向右偏移，低→高由左下掃至左上。刻線與指針共用同一偏移中心，不把指針放在錶盤圓心。偏移約為半徑的 26%，是照片支持的 HUD 比例，非工廠尺寸。兩側均增加為 13 條刻線，端點／中點主刻線加長加粗，四分位與其餘小刻線分級；偏心軸與掃動範圍不變。胎溫保留 C/H、溫度計、TIRE TEMP 與真實 °C／°F 數字，並非水溫
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

`r34ShowCluster` 控制四個核心錶盤與其 LCD，`r34Lighting` 控制 day／night。Custom Gauge Color 只改變 MFD 資料色；紅色指針與 REV 安全色保留。REV 取真實 RPM/redline，獨立於是否顯示檔位。

## 四輪平均胎溫與單位

唯一來源是唯讀原始封包的 `TireTemp = [FL, FR, RL, RR]`。專案 raw 契約是 Fahrenheit；官方 FH6 文件列出四輪溫度欄位，但沒有明寫其溫度單位。

`meanTireTemperatureC` 必須收到**剛好四個有限數字**，先算全四輪平均 °F，再一次轉成 canonical °C。缺少、null、字串、NaN 或 Infinity 任一輪均是 N/A，不計算部分平均，也不使用 Coordinator 補零的外層 alias。原始 0°F 與負值有效；例如 [32,68,104,140] 得30°C／86°F，而四個0°F得−17.78°C。

左子錶與 MULTI 的 **TIRE TEMP** 共用同一平均與比例。顯示量程固定 canonical **0～150°C（32～302°F）**，這是顯示範圍，不是冷卻水數值或輪胎安全門檻。切換 C/F 不改變指針或綠條位置；超界只限制幾何，數字仍保留負值或較高溫度。

使用既有 **HUD Unit Settings → Temperature**，可以跟隨 app 溫度偏好或獨立保存 C/F；沒有新增 R34 專用重複單位控制。缺失／無效溫度偏好回到 C，不能從 mph 猜測 Fahrenheit。effectiveUnits 仍是 renderer-only 衍生欄位，不寫入持久設定。

## 雙 LCD 可用性與共用控制

兩個 LCD 都只顯示**單行**，馬力與扭力同時並列，沒有輪播。實體窗一致並稍加寬／減低，仍在主錶下半空白區內；所有數字、G 檔位標籤、單位、計時及 N/A 統一為 12px semibold monospace，固定相同的 0.8 水平字形比例，不按單一欄位縮字。整條可見文字（包括標籤與單位）共同置中，保留左右邊界；隱藏檔位或速度時，剩餘整行重新置中。單位與欄位之間的空白明確保留。

LCD 普通數值保留四位整數（含負號可五字元）；超過此顯示位數，改用明示 `e` 指數且保留正負與單位的科學記號，最多六字元數值，不截尾或限制成假的最大值。此壓縮只負責顯示，不改原始數字、單位轉換或類比比例；正常車速／輸出不受影響。極端長秒數先在毫秒換算安全範圍外攔下，再顯示科學記號加 `s`，避免 Infinity／NaN 計時字串；一般長圈時仍保留分／秒／毫秒格式。

- 速度 LCD：檔位與數位速度／單位；跟隨現有 HUD 或 app 的速度偏好，類比 Nür300 仍固定 kmh
- 轉速 LCD：有可用原始 CurrentLap 秒數時顯示即時圈時計時；沒有計時時顯示當前 PowerWatts 與 TorqueNewtons。預設 HP／N·m，保留既有 HP／PS／kW、N·m／lb·ft 偏好，沒有第二個固定單位例外或自訂編輯器。兩個輸出欄位獨立缺值、保留真實零值與負值
- 正數 CurrentLap 可直接證明可用計時。初始／預設 0 不表示比賽正在計時；只有已接受原始封包從有效正值進入相鄰圈數增加，且接收與來源時間間隔均小於 1,500 ms，才允許該次 rollover 的 0。零值延續最多自該事件接收時刻起固定 **3 秒**，新鮮的同圈 0 或重複／重排封包都不能延長期限；後續正值恢復正常計時
- 缺失／無效 CurrentLap、暫停、錯誤、stale、切車或 session reset 立即清除連續性。非 live 時 LCD 顯示不可用，不回退到舊的馬力／扭力。上述零值門檻是 HUD 的資料可用性啟發式，並非聲稱遊戲提供了可確定判斷起終點的事件
- 可用即時計時的 0 與 BestLap／LastLap 分開格式化；後兩者的 0 仍為不可用，不建立假的已完成圈速
- 共用 showGear／showSpeed 分別控制速度 LCD 內的檔位與數位速度；showRPM 控制轉速刻度、指針及 REV，不隱藏其他資料的 LCD。showPowerTorque 控制無計時時的輸出值，但不遮掉可用計時。REV 獨立於檔位顯示

## 資料誠實與狀態

| 顯示 | 原始來源／轉換 |
| --- | --- |
| 類比／數位速度 | 同一原始 SpeedMetersPerSecond；類比固定 ×3.6 kmh，LCD 依選定 kmh／mph 換算 |
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

- `pnpm -C frontend exec vitest run ../hud_overlay/r34_mfd/tests/unit src/features/overlay_control/r34_mfd`：狀態／對稱刻度／類比固定 kmh 與數位單位／timer 零值期限／嚴格四輪平均／C-F 比例／鏡像偏心掃動／responsive 純函式
- `cargo test --locked --manifest-path backend-rust/Cargo.toml --test config_contract`：頁面與新增溫度單位的 POST／disk／restart／relay
- `pnpm -C frontend run test`、Windows 及 LAN 前端 build、`git diff --check`：aggregate gates
- `hud_overlay/r34_mfd/tests/visual/fixture.html`：人工操作真實 iframe，僅使用合成封包
- `PLAYWRIGHT_CHANNEL=chrome PLAYWRIGHT_MODULE_PATH=/path/to/playwright OUTPUT_DIR=/tmp/r34-preview node hud_overlay/r34_mfd/tests/visual/render.mjs`：720p／1080p 透明全畫面、五頁 DPR1／DPR2 MFD 裁切、雙主錶 DPR2 原生裁切（計時、HP＋扭力、rollover0、mph＋檔位、缺值）、負壓、C/F、部分缺胎溫、stale、鏡像偏心掃動、低段字形間隙、LCD 單行共同字型／整行左右平衡／各欄位邊界／互不重疊／四位帶符號最大數字／明示科學記號、透明間隙像素、1440p／ultrawide／矮視窗及 compact
- 同上執行 `launcher.mjs`：真正 Launcher／Coordinator 與持續遙測下 C/F config 更新、類比 kmh 不變且數位 mph 跟隨、原始缺值與 stale replay
- 同上執行 `frontend/src/features/overlay_control/r34_mfd/tests/browser/verify.cjs`：真實五頁選單、day/night、cluster、單位繼承／獨立 C/F 保存重載、reset、六主題、窄版繁中／日文

Chrome fixture 保持 `chromiumSandbox:true`，不以停用 sandbox 繞過本地限制。靜態構圖不能取代真正 HTML／SVG／Canvas 像素驗證；Chrome 證據也不是 Windows 原生透明 click-through 或遊戲實測。

## 本輪實際渲染預覽

`docs/assets/r34-mfd/` 已更新為 `7827a80` 的真正 Chrome runtime 圖片：[Visual run37332115596](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37332115596)。240 項 HUD 檢查、186 張 HUD 畫面、8 項 Launcher 檢查、12 張設定圖及 3 項設定流程檢查皆無錯誤。保留透明 720p／1080p 完整定位；雙 LCD 與五模式拼版只排列原生 DPR2 裁切，逐格像素比對一致，沒有重繪或放大。詳見同目錄 `provenance.json` 的原始檔名與 SHA256。

最新 LCD 改為相同的較寬、較淺窗框；所有字元使用同一 12px 半粗等寬字與固定 0.8 橫向比例，整行置中，不依個別欄位縮放。實際 Chrome 檢查包含共同字型、單行 baseline、左右邊界／平衡、四位帶符號數字、單欄顯隱、缺值、長計時及明示科學記號。速度數字12.25→10.5，位置及300kmh量程不動；兩個子錶由7條增加至13條刻線，保留主／中／次刻線層次及偏心軸。獨立檢視確認720p字體較緊湊但可讀，1080p及DPR2均無裁切／碰撞。

低段RPM刻度未動，2／3字形含筆畫後在720p保留約1.25px、1080p約1.56px間隙。真正PNG的錶間與外部區域alpha為0；未發現額外儀表矩形背景，也未刪除合法的錶面／LCD／MFD底色。前一版兩行輸出LCD已被本輪單行修訂取代；舊圖只保留於Git歷史，不作為本輪完成證據。Windows原生overlay與FH6遊戲仍未實測。
