### Summary of Changes

`lfa_center_ring` 以 **2012 Lexus LFA Normal／Menu display** 為原型：厚金屬中央環、黑底白字、四弧側錶與整組主錶右移。適合偏好真實量產超跑儀表、手排換檔與山路巡航的玩家。中央材質、尺寸與刻度／指針繪圖保留；展開位移96設計px與約600ms滑移是原創HUD適配，並非原車硬體量測。

此次依使用者意見完成弧形展開面板：數值依整個字形高度沿主錶曲線定位；四輪胎溫以固定FL／FR／RL／RR順序、斜線與共用單位顯示；THR／BRK改為實心橫條。新增唯讀系統媒體頁，自動模式可由比賽或有效媒體展開，比賽優先。正常模式胎溫／渦輪圖示亦改善小尺寸辨識。

**本次實際Chrome、Launcher狀態輪播／媒體及設定頁整合均通過；最新使用者視覺驗收及Windows／Forza實機驗收仍待完成。**

新增中央96px欄位的3秒輪播：PI等級＋分數、catalog車名、精確字樣`crosXover`、LIVE。沒有新鮮UDP時優先顯示`Pending......`，即使WebSocket與媒體仍正常；比賽排名及未到期圈速通知優先。長名稱在原框內省略，周圍中央幾何保留。

### Actual Renderer Previews

以下主要PNG均已替換為本次成功 [Chrome run37293719948](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37293719948)，source `30a34d8fc5eb914362a89de32f04dcd8d7bafc4e`、base artifact `11337474460`／status artifact `11337504212`。使用合成遙測／媒體，**不是遊戲截圖**；比較圖只縮放並排列真實截圖，不重繪HUD。歷史布局不再作為主要預覽。

![目前四項狀態輪播、長車名與UDP失聯](RAW_PREFIX/docs/assets/lfa-center-ring/status-carousel-connection.png)

![目前收合布局與胎溫／渦輪圖示](RAW_PREFIX/docs/assets/lfa-center-ring/metric-detail.png)

![目前展開：弧形數值錨點、四輪胎溫、實心踏板](RAW_PREFIX/docs/assets/lfa-center-ring/expanded-detail.png)

![系統媒體、比賽優先接管、比賽後回到媒體與手動fallback](RAW_PREFIX/docs/assets/lfa-center-ring/media-race-comparison.png)

![目前收合、開啟中、展開與還原中](RAW_PREFIX/docs/assets/lfa-center-ring/expansion-transitions.png)

![目前窄版繁體中文HUD設定：比賽或媒體時自動展開](RAW_PREFIX/docs/assets/lfa-center-ring/settings/settings-narrow-zh-tw.png)

更多：[媒體主圖](RAW_PREFIX/docs/assets/lfa-center-ring/media-detail.png)、[Unicode／stale／封面失敗／時間](RAW_PREFIX/docs/assets/lfa-center-ring/media-states.png)、[compact／四輪極值／缺失](RAW_PREFIX/docs/assets/lfa-center-ring/expanded-layout-states.png)、[歷史錯誤布局對照](RAW_PREFIX/docs/assets/lfa-center-ring/expanded-before-after.png)、[增壓／VAC](RAW_PREFIX/docs/assets/lfa-center-ring/lfa-boost-scale-comparison.png)、[正常資料狀態](RAW_PREFIX/docs/assets/lfa-center-ring/state-contact-sheet.png)、[單圈提示](RAW_PREFIX/docs/assets/lfa-center-ring/session-states.png)、[收合720p](RAW_PREFIX/docs/assets/lfa-center-ring/metric-720p.png)、[展開720p](RAW_PREFIX/docs/assets/lfa-center-ring/expanded-720p.png)、[英文設定](RAW_PREFIX/docs/assets/lfa-center-ring/settings/settings-dark-default.png)、[日文設定](RAW_PREFIX/docs/assets/lfa-center-ring/settings/settings-narrow-ja-jp.png)。

### Key Modifications

- **狀態輪播／優先**：Pending優先於過期race／notice；新鮮時依錯誤／暫停 → SHIFT → 未到期圈速通知 → 已確認比賽排名／LIVE → 閒置輪播。monotonic clock每3秒輪播PI、名稱、crosXover、LIVE；高優先狀態暫停輪播，重連／換車重置
- **身份／名稱**：原始CarClass整數0–7=D/C/B/A/S1/S2/R/X、CarPerformanceIndex整數100–999；class0有效，PI0／缺失／字串／越界為N/A。一次同源`/api/cars/database`快取讀取、4s timeout，依目前有效CarOrdinal查display_name；未知CAR N/A，無外部服務或猜車名，晚到資料／destroy安全。2010 Lexus LFA與長Datsun車名採用現有遊戲catalog，與2012儀表原型分開
- **UDP freshness／恢復**：只有原始uint32 timestamp有序前進可保活，RAF／socket／media不能保活；初始0需後續前進，1.5s失聯即Pending。一般遞增counter斷流立即恢復、wrap有效。倒退需可信重設背景與第二個有序counter；同車自由行重啟另需失聯≥1.5s、舊counter≥2000、新counter≤1000、相同有效ordinal且兩端lap／race clock為0，第二包在1.5s內且增量≤elapsed+1000ms。接受新epoch會清除舊race／notices。沒有來源epoch，完全模仿該重啟模式的重播無法完美辨識


- **曲面排版與資料**：用完整glyph bbox及8設計px留白計算圓形數值錨點，不採固定右欄。四輪溫度逐輪轉換、取整數，缺失保留`--`、共用°C／°F；四輪分布改變但平均相同也更新。正常模式仍須四輪皆有效才平均。實心踏板比例連續更新，相同四捨五入百分比也不凍結填充；有效0與N/A分開，數字在條外
- **媒體與頁面優先**：展開條件為 `manual || (auto && (confirmedRace || media.available))`，頁面為比賽 → 媒體 → 一般遙測。Auto OFF不由媒體展開；Manual保持展開，媒體消失後仍可回一般遙測。兩個原有boolean、預設false、持久化契約不變；EN／繁中／日文help同步更新
- **唯讀媒體**：沿用`hud:media`、GET `/api/runtime`與`/api/overlay/system_media`；只接受同源provider封面路徑，沒有播放控制。plain text、兩行曲名／單行歌手專輯、省略字串、安全封面fallback與舊請求隔離。paused需provider健康確認；最多3s暫存grace顯示琥珀色STALE，過期清空。位置／duration不外推；回報超出duration仍保留真實數字，僅夾進度條
- **移動機構**：固定560×370占位，中央整體右移96px而不縮放；反轉保留位置／速度，reduced-motion立即切換，resize不重設，首次持久化手動ON直接用終點。收合後移除transform；正常四弧在移動時淡出
- **有界比賽推論**：需新鮮有序uint32 timestamp，至少400ms且兩個不同正CurrentLap；初始0不進入。已確認後固定正值可維持，換圈有背景或grace可維持；無效／無背景0以2s退出，timestamp失聯3s退出。退出後依有效媒體／manual決定頁面；重播／倒序不保活，短error不立即收合。IsRaceOn單獨不足以進入
- **既有資料與安全**：非等比例正增壓0–1bar佔75%弧長、1–2bar佔25%；藍色VAC0–1bar共用弧且刻度同步切換，signed數字／單位保留。排名／圈速通知優先順序為失效／錯誤／暫停 → SHIFT → BEST LAP／LAP n → P# → LIVE；1.5s無新timestamp清空讀數，baseline／重連／重播不假慶祝
- **原型與授權**：LFA Menu display提供移動環視覺依據，不把SPORT／Circuit Mode當同一功能。PNG／SVG均原創、repository MIT，沒有散布或描圖OEM照片／商標／字體；沒有新增第三方runtime依賴

### Pre-Commit & Local Verification

- **Frontend:** `pnpm -C frontend test --maxWorkers=2`：**1292 passed／1 skipped；164 files passed／1 skipped**，含165個LFA測試，本次新增19個；`build:web-hud`、JS語法、PR-body格式與`git diff --check`通過
- **Rust historical local gate:** 前次設定擴充`config_contract`9/9；完整套件123通過／1失敗／2忽略，唯一LAN-IP假設在未改基底`bbf64fbd`同樣重現。不宣稱本機完整Rust全綠；本次媒體／排版不修改Rust
- **Actual browser:** source `30a34d8fc5eb914362a89de32f04dcd8d7bafc4e`、[Visual 37293719948](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37293719948)、base artifact `11337474460`／status artifact `11337504212`成功，Chrome154、sandbox開啟。正常4配置、展開6配置各28畫面／21單位cases、正常圖示20cases、媒體4配置各9畫面、狀態輪播4配置各27畫面及真實OverlayView設定整合通過；設定11功能檢查、errors與failedResponses為空。來源30a34d8的[CI Pipeline37293719829](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37293719829)與[Release Packaging37293720186](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37293720186)亦已成功；最終文件／預覽commit另待CI
- **Bounds:** 實際SVG文字bbox外加2px逐邊檢查fascia fill／shifted-ring cutout及互斥，包含完整踏板軌道；媒體另測真正HTML內容位於foreignObject中且曲名不超過兩行。涵蓋99:59.99、長signed bar／psi／kPa、四個9999°F／−999°F／缺失、default／compact DPR1／2、零值／N/A與中間幀
- **Pixel review:** 已看收合／曲面展開／四輪極值／實心踏板、playing／paused／stale／race接管／fallback／Unicode與窄版繁中日文。第一輪外框檢查未抓到36px曲名框內第三行細縫，改成34px=2×17px並補內部文字檢查，重新實際看圖確認。圖示140°F留白也保留嚴格斷言後修正
- **Central preservation:** 原中央PNG／SVG、基底lfa.css與drawScale／drawNeedle保留；新增lfa-status.css僅作用於使用者指定的96px狀態欄。對照b9a5143的8個正常detail、4個完整viewport與1個展開detail，中央幾何圓只排除實際舊／新96px狀態框矩形後，**12張為0像素差異**；Pending／no-signal另保留144個像素差異，全在狀態框正下邊界y=413.5的border一列（row413、x348–491），對應刻意變更的琥珀色邊框。半開區間遮罩沒有額外padding，這列差異未被隱藏。狀態框刻意變更另行計數；不再宣稱整個中央圓零差異，也不擴大遮罩。[精確bbox／遮罩與RGBA證據](RAW_PREFIX/docs/assets/lfa-center-ring/status-center-preservation.json)
- **Fixture corrections:** 實際CI辨識1.5s UDP stale與2s race-grace差異，現在分別斷言grace內LIVE與非比賽PI；將host的唯一正圈時增長移至400ms確認門檻後；mocked clock需先等待真正跨frame onFrame receipt，再推進paint，不能把32ms等同已渲染。production runtime／freshness規則未因此放寬，失敗也保存raw/coordinator/onFrame診斷


證據：[狀態輪播／連線](RAW_PREFIX/docs/assets/lfa-center-ring/status-report.json)、[驗證摘要](RAW_PREFIX/docs/assets/lfa-center-ring/verification.json)、[renderer／展開／圖示](RAW_PREFIX/docs/assets/lfa-center-ring/evidence.json)、[launcher](RAW_PREFIX/docs/assets/lfa-center-ring/launcher-report.json)、[媒體](RAW_PREFIX/docs/assets/lfa-center-ring/media-report.json)、[當前PNG來源與hash](RAW_PREFIX/docs/assets/lfa-center-ring/media-preview-provenance.json)、[設定頁](RAW_PREFIX/docs/assets/lfa-center-ring/settings/settings-audit.json)、[UDP／JSON稽核](RAW_PREFIX/docs/assets/lfa-center-ring/json-unit-audit.json)。

目前主GUI未傳遞獨立溫度單位：明確effectiveUnits.temperature優先，否則依HUD公英制回退。Boost依官方UDP→真正Rust parser→JSON websocket→coordinator的PSI路徑，不套用無關binary／frontend的Pa解讀，也不猜單位。合成parser與受控media provider測試不是live websocket／原生Windows媒體／遊戲實機驗收。

**Windows原生overlay、系統媒體、click-through、置頂與Forza實機未驗證；最新使用者視覺驗收待完成。** 右下槽位假設取代遊戲原生儀表，提示／字幕遮擋仍需實機檢查。

### Living Changelog & Review Iterations

- 2026-10-05（Bagley as Codex）：新增PI／車名／crosXover／LIVE輪播及優先Pending；19項回歸、1292項完整前端gate與實際Chrome通過，原圖全部更新為30a34d8來源。來源接收／paint同步與race-grace測試已分開驗證；只在狀態框以外比較中央像素

- 2026-10-05（Bagley as Codex）：依最新要求加入曲面錨點、四輪胎溫與實心踏板，及既有provider的唯讀媒體頁；比賽優先、grace／生命週期與真實Launcher回歸完整驗證。實際Chrome抓到140°F圖示留白及長CJK第三行細縫，均修正後重跑；所有主要預覽更新為本次來源
- 2026-10-05（Bagley as Codex）：先前修正展開下方踏板越出曲面、加入真正fascia／ring內含測試；該歷史布局僅保留於明確標示before的比較圖
- 2026-10-05（Bagley as Codex）：建立2012 LFA Normal原型，依實車照片重建四弧；加入平均胎溫、signed boost、非等比例／VAC、踏板與圈時計分；保留已核准中央
- 2026-10-05（Bagley as Codex）：展開首輪連續性fixture誤比不同RAF時間，改為相同時間嚴格比較；中日設定缺字以CI字型修正，不更動runtime

### Related Issues / References

- [2012官方OM77006U，印刷116／PDF118頁](https://assets.sia.toyota.com/publications/en/om-s/OM77006U/pdf/OM77006U.pdf#page=118)，Menu與圈時計分字級另參考印刷124／144–145頁
- [日本官方LFA手冊](https://manual.lexus.jp/pdf/lfa/LFA_OM_JP_M77001J_1_1012.pdf#page=100)／[官方2010–2012年份索引](https://manual.lexus.jp/lfa/)
- [Lexus UK圖庫](https://media.lexus.co.uk/images/lfa-interior/)／[T_6820](https://media.lexus.co.uk/wp-content/uploads/sites/3/2011/10/T_6820-scaled.jpg)／[T_6833](https://media.lexus.co.uk/wp-content/uploads/sites/3/2011/10/T_6833-scaled.jpg)／[DSC_4040](https://media.lexus.co.uk/wp-content/uploads/sites/3/2012/12/DSC_4040-scaled.jpg)
- [MotorTrend2012近照](https://www.motortrend.com/uploads/sites/5/2012/07/2012-Lexus-LFA-Tach.jpg)／[C Ling Fan照片](https://commons.wikimedia.org/wiki/File:Lexus_LFA_speedometer_view_01.jpg)。T_6820自身標Issued10/2009、AUTO；SPORT白底照片只參考共同側面位置，2012範圍以官方手冊為準。均已實際看圖
- [Forza官方Data Out](https://support.forza.net/hc/en-us/articles/51744149102611-Forza-Horizon-6-Data-Out-Documentation)；詳細資料／設定契約：`docs/hud/lfa-center-ring.md`
- 採用技能：`halfmoon-design-system`、`telemetry-udp-protocol`、`modular-refactoring`、`pr-author-maintainer`

---
Author / Maintainer: Bagley as Codex
