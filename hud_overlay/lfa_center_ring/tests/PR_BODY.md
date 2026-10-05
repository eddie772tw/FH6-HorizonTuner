### Summary of Changes

`lfa_center_ring` 以 **2012 Lexus LFA Normal display** 為原型，採厚金屬中央錶環、黑底白字與四弧側錶。適合喜歡真實量產超跑儀表、手排換檔與山路巡航的玩家。

依使用者最新要求，左上與左側中央改為四輪平均胎溫；左右下弧改為油門／煞車百分比、移除舊圖示；右上改為 signed boost 與原創渦輪圖案。右側中央顯示封包回報的本圈經過時間；原 LIVE 區改為有效排名及短暫的完成圈／最佳圈通知。**中央素材、geometry、CSS、刻度／指針繪圖及四弧輪廓保留**。

已驗證的收合版採用右上非等比例增壓量尺：正增壓 0–1 bar 佔弧長 75%、1–2 bar 佔 25%；負壓用同一弧條的藍色 VAC 顯示。填充與刻度同步按弧長切換，保留負號與實際數值。**本機 gate 與實際 Chrome renderer／launcher 已通過**。

最新追加功能：依LFA原廠Menu display機構加入展開／還原。固定占位，中央完整組件右移96設計px，左方顯示真實單圈與遙測資料；HUD設定的手動／自動兩個開關預設關閉。動畫／狀態機本機實作完成，**新Chrome與設定頁整合驗證待CI**。

### Actual Renderer Previews — Verified Collapsed Baseline

以下是已驗證收合版，尚不能視為新增展開布局的視覺驗收。

以下為新版 **Chrome 154.0.8037.57 真實 renderer** 截圖，取自成功的 [run 37266656967](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37266656967)，來源 `5c5b8f63c735a0e55a826a263db53199958dd6ce`、artifact `11326489095`。主圖與 720p 圖保留截圖像素；狀態圖只縮小並排列實際畫面。所有圖片均為合成遙測 fixture，**不是遊戲截圖**。本次資料與計圈修訂已實作並檢查，仍待使用者視覺驗收。

![四輪平均胎溫、增壓、油門與煞車](RAW_PREFIX/docs/assets/lfa-center-ring/metric-detail.png)

![正增壓0.5／1bar、VAC−0.5bar與零值比較](RAW_PREFIX/docs/assets/lfa-center-ring/lfa-boost-scale-comparison.png)

其他實際畫面：[單位／缺失狀態](RAW_PREFIX/docs/assets/lfa-center-ring/state-contact-sheet.png)、[排名／計圈通知／最大時間](RAW_PREFIX/docs/assets/lfa-center-ring/session-states.png)、[1280×720右下位置](RAW_PREFIX/docs/assets/lfa-center-ring/metric-720p.png)

### Key Modifications

- **展開布局**：參考2012LFA官方Normal／Menu圖及日本官方LFA手冊，整個中心平移+96設計px、不縮放；固定560×370尺寸使實際螢幕右移不被右側定位抵消。左面板顯示CURRENT／LAST／BEST與既有胎溫／增壓／踏板，沒有虛構OEM選單
- **動作**：約600ms臨界阻尼，快速切換保留位置與速度，reduced-motion立即採用終點，resize不重設；首次持久化手動ON不播放啟動滑動，收合終點使用transform:none。位移／時間為HUD設計，並非原車量測
- **控制**：lfaManualExpand／lfaAutoExpand皆為嚴格boolean且預設false；manual優先，manual OFF可能由auto維持。自動進入必須新鮮有序uint32 timestamp及400ms內確認正CurrentLap增長，初始0即使有排名也不進入
- **穩定性**：已確認後容許新鮮固定正值、帶背景的換圈0；缺失／非法或無背景持續0以2s緩衝退出，timestamp失聯3s退出。重播／倒序不保活；短error不立即收合，pause或缺少速度／RPM不破壞有效圈時判斷，但仍遵守原讀數失效規則。手動可保持展開、資料仍清空
- **適配範圍**：這是有界單圈訊號推論，並非完美race flag；原車Menu display與SPORT／Circuit Mode分開說明。前端與Rust設定契約新增兩個布林欄位，shared通訊／UDP不改

- **平均胎溫**：canonical `tire_temp_f` 必須有四個有限 number，全部有效才做算術平均；不補零、不做部分平均。明確標示 TIRE 4W，C/F 可用時遵循設定，否則沿用 HUD 公英制 fallback
- **踏板**：有限 throttle／brake ratio 夾 0–1，顯示 0–100%；真實0與缺失N/A區分，保留數字、THR／BRK，沒有舊燃油／油壓圖示
- **增壓**：官方 UDP／JSON 原始 Boost 為 PSI above atmospheric，保留正／負／0；不讓 coordinator 補零或正值夾限 aliases 掩蓋缺失／負壓。支援 bar／psi／kPa 獨立單位，原創渦輪圖示；只夾弧條，不把數字夾成量尺端點
- **量尺**：胎溫20–140°C（68–284°F）不變；正增壓0–1bar佔75%弧長、1–2bar佔25%。0／0.5／1／2刻度實際位於0／37.5／75／100%弧長，bar／psi／kPa物理比例相同
- **VAC**：負壓幅值0–1bar線性使用整條藍色弧，顯示VAC；刻度同步變為0／0.25／0.5／1幅值、位置0／25／50／100%。數字仍帶負號，微小負值保留-0.00或-0.0；真實0空弧、缺失N/A無填充。只有圖形夾限，signed數字不夾限
- **計圈與排名**：CurrentLap 使用秒，接受0、缺失保留 `—:—`，不做時間外推；最大99:59.99，超出時不擠破側錶。有效正整數排名顯示P#；有真實完成圈或最佳時間改善才通知3秒，同時發生優先BEST LAP
- **狀態優先順序**：失效／錯誤／暫停 → SHIFT → BEST LAP／LAP n → P# → LIVE。首次baseline、重連、重播、倒序或重設不產生假慶祝，通知不會因重播而延長
- **中央保留**：原PNG／SVG SHA-256、`lfa.css`、`drawScale()`／`drawNeedle()` 未變。前次資料／計圈修訂eac1b9e的六個匹配DPR2狀態，完整中央圓內逐像素比較均為零差異；此歷史比較不冒充本次增壓修訂重新量測；rank/notice 是使用者明確允許的文字更新

### Pre-Commit & Local Verification

- **Frontend Tests:** `pnpm -C frontend test`，**1,208 tests passed／1 skipped；160 files passed／1 skipped**，含81個LFA行為測試
- **Frontend Build:** `pnpm -C frontend run build:web-hud` 通過；新模組已打包，tests／fixture／PR body不隨產品散布
- **Syntax / Whitespace:** 新JS、三個LFA browser runner的`node --check`及`git diff --check`通過
- **Parser／JSON Provenance:** style-owned `tests/fixtures/udp-parser-samples.json` 取自未修改的真正Rust parser與production JSON serialization：+14.5038／0／−7.2519PSI，四輪203°F平均＝95°C，踏板204／51＝80%／20%，CurrentLap34.21／LapNumber2／P3
- **Verified Collapsed Browser Gate (expansion pending):** 上述GitHub Actions Chrome renderer與launcher均通過，`chromiumSandbox:true`；1280×720／1920×1080／2560×1440 DPR1及1920×1080 DPR2無錯誤。涵蓋C/F與bar/psi/kPa、正負零缺失boost、胎溫部分缺失、踏板夾限、排名／圈通知／重設／最大時間寬度與原生命週期；launcher以真正coordinator、開啟smoothing接收上述parser JSON，亦通過過期清空／重連／設定／重載／destroy
- **Actual Boost Review:** 新增0.25／0.5／1／2bar、VAC−0.5、零／缺失、弧長刻度及bar／psi／kPa長字串搭配99:59.99檢查均通過。已實際查看+0.5、−0.5與PSI VAC，刻度、圖示、signed數字、單位與VAC分離清楚
- **Historical Center Pixel Evidence:** 前次eac1b9e對照`ad4458e`的840×556 DPR2截圖，以圓心(420,277.5)、半徑267px、像素中心落在圓內為條件逐一比較原始RGBA；metric／imperial／reverse／neutral／redline／high-RPM六個狀態，各223,942像素均為AE0，沒有容差或重新取樣。missing／no-signal因舊fixture為mph、新fixture為km/h，各504個單位文字像素不同，並非相同條件；不宣稱所有解析度逐位元一致
- **Evidence:** [renderer](RAW_PREFIX/docs/assets/lfa-center-ring/evidence.json)、[launcher](RAW_PREFIX/docs/assets/lfa-center-ring/launcher-report.json)、[中央保留比較](RAW_PREFIX/docs/assets/lfa-center-ring/telemetry-center-preservation.json)、[UDP／JSON單位稽核](RAW_PREFIX/docs/assets/lfa-center-ring/json-unit-audit.json)、[驗證摘要](RAW_PREFIX/docs/assets/lfa-center-ring/verification.json)

上述Chrome成功結果對應先前已驗證的收合runtime head；新增展開功能與設定頁的實際Chrome CI、像素比較仍待執行。

目前主GUI未把獨立溫度單位送入HUD config：可明確提供effectiveUnits.temperature時採用，未提供時依HUD公英制回退。此溫度限制已記錄，未擴大溫度設定傳遞；後端僅另增本次兩個展開布林設定，shared通訊不改。

frontend另一個Pa converter與binary packing通道有既存單位解讀差異；本HUD依官方UDP／JSON路徑，不做數值大小猜測或修補無關通道。Parser／合成launcher驗證**不是實際live websocket或遊戲驗收**。

Windows原生overlay、click-through、置頂與Forza實機仍未驗證。預設420×277.5 CSS px、右下30px槽位假設取代遊戲原生儀表，仍需實機檢查提示／字幕遮擋。

本輪5c5b8f63對照eac1b9e的八個相同DPR2狀態，中央圓223,942像素及右上區域以外430,500像素均為0差異；新證據見 `docs/assets/lfa-center-ring/boost-scale-preservation.json`。此為精確RGBA比對，沒有容差或重新取樣。

### Living Changelog & Review Iterations

- 2026-10-05（Bagley as Codex）：加入原創展開／還原機構、左方遙測布局、手動／自動設定、單圈訊號確認與防抖，補齊純狀態／motion／生命週期回歸及可重現中間幀的Chrome fixture。新功能瀏覽器驗證待CI

- 2026-10-05（Bagley as Codex）：非等比例首輪run37266270934實際抓到VAC0.25刻度與−0.5讀數相撞。保留不重疊斷言，僅將右上數字／單位／VAC移至x481、y148／160／172，並擴充長字串與單圈時間檢查；run37266656967的renderer與launcher均通過

- 2026-10-05（Bagley as Codex）：依最新要求只調整右上正增壓非等比例刻度與藍色VAC模式，刻度和填充共用弧長映射；移除舊固定刻度、微調渦輪圖示，新增單調性／轉折／單位不變／微小負值／模式切換測試與實際Chrome scenarios。本機測試與build及Chrome run37266656967通過

- 2026-10-05（Bagley as Codex）：建立官方Normal display原型與原創中央素材，依截圖修正字距並保留獲使用者肯定的中央
- 2026-10-05（Bagley as Codex）：補看多張實車照片，將側面重建為四弧量尺
- 2026-10-05（Bagley as Codex）：依新要求接入平均胎溫、signed boost、踏板、圈時間、排名與3秒通知；本機gate通過
- 2026-10-05（Bagley as Codex）：首輪run37263909153發現測試已回到metric，卻僅使mph非法，錯誤期待有效180km/h為空白。只修正fixture同時使兩個速度欄位非法，runtime未改；重跑本機完整測試／build與當時Chrome run37264359295通過，替換實際預覽並記錄六個匹配狀態的中央AE0

### Related Issues / References

- [Lexus日本官方LFA手冊，印刷98／PDF100頁](https://manual.lexus.jp/pdf/lfa/LFA_OM_JP_M77001J_1_1012.pdf#page=100)／[官方2010–2012年份範圍](https://manual.lexus.jp/lfa/)
- [2012官方OM77006U，印刷116／PDF118頁](https://assets.sia.toyota.com/publications/en/om-s/OM77006U/pdf/OM77006U.pdf#page=118)
- [Lexus UK官方內裝圖庫](https://media.lexus.co.uk/images/lfa-interior/)／[T_6820](https://media.lexus.co.uk/wp-content/uploads/sites/3/2011/10/T_6820-scaled.jpg)／[T_6833](https://media.lexus.co.uk/wp-content/uploads/sites/3/2011/10/T_6833-scaled.jpg)／[DSC_4040](https://media.lexus.co.uk/wp-content/uploads/sites/3/2012/12/DSC_4040-scaled.jpg)
- [MotorTrend2012近照](https://www.motortrend.com/uploads/sites/5/2012/07/2012-Lexus-LFA-Tach.jpg)／[C Ling Fan攝影](https://commons.wikimedia.org/wiki/File:Lexus_LFA_speedometer_view_01.jpg)
- T_6820本身標示Issued10/2009、中央AUTO；MotorTrend近照為SPORT白底。只參考共同側面布局，2012範圍以官方手冊為準
- [Forza官方Data Out欄位／單位](https://support.forza.net/hc/en-us/articles/51744149102611-Forza-Horizon-6-Data-Out-Documentation)
- **授權**：原創圖形與程式沿用repository MIT；照片僅作研究，未貼用、描圖或散布OEM素材／商標／字體。Lexus／LFA名稱僅用於原型辨識
- 詳細資料路徑與限制：`docs/hud/lfa-center-ring.md`；採用技能：`halfmoon-design-system`、`telemetry-udp-protocol`、`modular-refactoring`、`pr-author-maintainer`

---
Author / Maintainer: Bagley as Codex
