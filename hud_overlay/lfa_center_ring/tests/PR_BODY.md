### Summary of Changes

`lfa_center_ring` 以 **2012 Lexus LFA Normal display** 為原型，採厚金屬中央錶環、黑底白字與四弧側錶。適合喜歡真實量產超跑儀表、手排換檔與山路巡航的玩家。

依使用者最新要求，左上與左側中央改為四輪平均胎溫；左右下弧改為油門／煞車百分比、移除舊圖示；右上改為 signed boost 與原創渦輪圖案。右側中央顯示封包回報的本圈經過時間；原 LIVE 區改為有效排名及短暫的完成圈／最佳圈通知。**中央素材、geometry、CSS、刻度／指針繪圖及四弧輪廓保留**。

### Actual Renderer Previews

以下為新版 **Chrome 154.0.8037.57 真實 renderer** 截圖，取自成功的 [run 37264359295](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37264359295)，來源 `eac1b9e5bd360a3ca4e9359bd142b43de7c6a0f6`、artifact `11324929540`。主圖與 720p 圖保留截圖像素；狀態圖只縮小並排列實際畫面。所有圖片均為合成遙測 fixture，**不是遊戲截圖**。本次資料與計圈修訂已實作並檢查，仍待使用者視覺驗收。

![四輪平均胎溫、增壓、油門與煞車](RAW_PREFIX/docs/assets/lfa-center-ring/metric-detail.png)

![C/F與增壓單位、負壓、零值、夾限與缺失](RAW_PREFIX/docs/assets/lfa-center-ring/state-contact-sheet.png)

![排名、完成圈、最佳圈與99:59.99最大時間寬度](RAW_PREFIX/docs/assets/lfa-center-ring/session-states.png)

![1280×720右下角實際位置](RAW_PREFIX/docs/assets/lfa-center-ring/metric-720p.png)

### Key Modifications

- **平均胎溫**：canonical `tire_temp_f` 必須有四個有限 number，全部有效才做算術平均；不補零、不做部分平均。明確標示 TIRE 4W，C/F 可用時遵循設定，否則沿用 HUD 公英制 fallback
- **踏板**：有限 throttle／brake ratio 夾 0–1，顯示 0–100%；真實0與缺失N/A區分，保留數字、THR／BRK，沒有舊燃油／油壓圖示
- **增壓**：官方 UDP／JSON 原始 Boost 為 PSI above atmospheric，保留正／負／0；不讓 coordinator 補零或正值夾限 aliases 掩蓋缺失／負壓。支援 bar／psi／kPa 獨立單位，原創渦輪圖示；只夾弧條，不把數字夾成量尺端點
- **量尺**：胎溫20–140°C（68–284°F）；增壓−1…2bar、負壓弧段35%／正壓65%，依既有 Classic JDM 約定；數字保留實際讀值
- **計圈與排名**：CurrentLap 使用秒，接受0、缺失保留 `—:—`，不做時間外推；最大99:59.99，超出時不擠破側錶。有效正整數排名顯示P#；有真實完成圈或最佳時間改善才通知3秒，同時發生優先BEST LAP
- **狀態優先順序**：失效／錯誤／暫停 → SHIFT → BEST LAP／LAP n → P# → LIVE。首次baseline、重連、重播、倒序或重設不產生假慶祝，通知不會因重播而延長
- **中央保留**：原PNG／SVG SHA-256、`lfa.css`、`drawScale()`／`drawNeedle()` 未變。相同中心讀值、沒有排名／通知的六個DPR2狀態，完整中央圓內逐像素比較均為零差異；rank/notice 是使用者明確允許的文字更新

### Pre-Commit & Local Verification

- **Frontend Tests:** `pnpm -C frontend test`，**1,150 tests passed／1 skipped；157 files passed／1 skipped**，含45個LFA行為測試
- **Frontend Build:** `pnpm -C frontend run build:web-hud` 通過；新模組已打包，tests／fixture／PR body不隨產品散布
- **Syntax / Whitespace:** 新JS、兩個browser runner的`node --check`及`git diff --check`通過
- **Parser／JSON Provenance:** style-owned `tests/fixtures/udp-parser-samples.json` 取自未修改的真正Rust parser與production JSON serialization：+14.5038／0／−7.2519PSI，四輪203°F平均＝95°C，踏板204／51＝80%／20%，CurrentLap34.21／LapNumber2／P3
- **Actual Browser Gate:** 上述GitHub Actions Chrome renderer與launcher均通過，`chromiumSandbox:true`；1280×720／1920×1080／2560×1440 DPR1及1920×1080 DPR2無錯誤。涵蓋C/F與bar/psi/kPa、正負零缺失boost、胎溫部分缺失、踏板夾限、排名／圈通知／重設／最大時間寬度與原生命週期；launcher以真正coordinator、開啟smoothing接收上述parser JSON，亦通過過期清空／重連／設定／重載／destroy
- **Pixel Review:** 已查看實際單位、負壓、零值、缺失、圈通知與最大寬度截圖，未見標籤重疊或侵入中央圓。對照`ad4458e`的840×556 DPR2截圖，以圓心(420,277.5)、半徑267px、像素中心落在圓內為條件逐一比較原始RGBA；metric／imperial／reverse／neutral／redline／high-RPM六個狀態，各223,942像素均為AE0，沒有容差或重新取樣。missing／no-signal因舊fixture為mph、新fixture為km/h，各504個單位文字像素不同，並非相同條件；不宣稱所有解析度逐位元一致
- **Evidence:** [renderer](RAW_PREFIX/docs/assets/lfa-center-ring/evidence.json)、[launcher](RAW_PREFIX/docs/assets/lfa-center-ring/launcher-report.json)、[中央保留比較](RAW_PREFIX/docs/assets/lfa-center-ring/telemetry-center-preservation.json)、[UDP／JSON單位稽核](RAW_PREFIX/docs/assets/lfa-center-ring/json-unit-audit.json)、[驗證摘要](RAW_PREFIX/docs/assets/lfa-center-ring/verification.json)

上述成功結果對應已驗證的runtime head；補入本次文件與預覽後的最終文件commit CI仍待執行。

目前主GUI未把獨立溫度單位送入HUD config：可明確提供effectiveUnits.temperature時採用，未提供時依HUD公英制回退。此限制已記錄，未擴大修改後端／shared設定。

frontend另一個Pa converter與binary packing通道有既存單位解讀差異；本HUD依官方UDP／JSON路徑，不做數值大小猜測或修補無關通道。Parser／合成launcher驗證**不是實際live websocket或遊戲驗收**。

Windows原生overlay、click-through、置頂與Forza實機仍未驗證。預設420×277.5 CSS px、右下30px槽位假設取代遊戲原生儀表，仍需實機檢查提示／字幕遮擋。

### Living Changelog & Review Iterations

- 2026-10-05（Bagley as Codex）：建立官方Normal display原型與原創中央素材，依截圖修正字距並保留獲使用者肯定的中央
- 2026-10-05（Bagley as Codex）：補看多張實車照片，將側面重建為四弧量尺
- 2026-10-05（Bagley as Codex）：依新要求接入平均胎溫、signed boost、踏板、圈時間、排名與3秒通知；本機gate通過
- 2026-10-05（Bagley as Codex）：首輪run37263909153發現測試已回到metric，卻僅使mph非法，錯誤期待有效180km/h為空白。只修正fixture同時使兩個速度欄位非法，runtime未改；重跑本機完整測試／build與Chrome run37264359295通過，替換實際預覽並記錄六個匹配狀態的中央AE0

### Related Issues / References

- [2012官方OM77006U，印刷116／PDF118頁](https://assets.sia.toyota.com/publications/en/om-s/OM77006U/pdf/OM77006U.pdf#page=118)
- [Lexus UK官方內裝圖庫](https://media.lexus.co.uk/images/lfa-interior/)／[T_6820](https://media.lexus.co.uk/wp-content/uploads/sites/3/2011/10/T_6820-scaled.jpg)／[T_6833](https://media.lexus.co.uk/wp-content/uploads/sites/3/2011/10/T_6833-scaled.jpg)／[DSC_4040](https://media.lexus.co.uk/wp-content/uploads/sites/3/2012/12/DSC_4040-scaled.jpg)
- [MotorTrend2012近照](https://www.motortrend.com/uploads/sites/5/2012/07/2012-Lexus-LFA-Tach.jpg)／[C Ling Fan攝影](https://commons.wikimedia.org/wiki/File:Lexus_LFA_speedometer_view_01.jpg)
- T_6820本身標示Issued10/2009、中央AUTO；MotorTrend近照為SPORT白底。只參考共同側面布局，2012範圍以官方手冊為準
- [Forza官方Data Out欄位／單位](https://support.forza.net/hc/en-us/articles/51744149102611-Forza-Horizon-6-Data-Out-Documentation)
- **授權**：原創圖形與程式沿用repository MIT；照片僅作研究，未貼用、描圖或散布OEM素材／商標／字體。Lexus／LFA名稱僅用於原型辨識
- 詳細資料路徑與限制：`docs/hud/lfa-center-ring.md`；採用技能：`halfmoon-design-system`、`telemetry-udp-protocol`、`pr-author-maintainer`

---
Author / Maintainer: Bagley as Codex
