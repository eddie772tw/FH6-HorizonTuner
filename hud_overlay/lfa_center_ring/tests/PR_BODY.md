### Summary of Changes

`lfa_center_ring` 以 **2012 Lexus LFA Normal／Menu display** 為原型：厚金屬中央環、黑底白字、四弧側錶與整組主錶右移。適合偏好真實量產超跑儀表、手排換檔與山路巡航的玩家。中央材質、尺寸與刻度／指針繪圖保留；展開位移96設計px與約600ms滑移是原創HUD適配，並非原車硬體量測。

此次依使用者意見完成弧形展開面板：數值依整個字形高度沿主錶曲線定位；四輪胎溫以固定FL／FR／RL／RR順序、斜線與共用單位顯示；THR／BRK改為實心橫條。新增唯讀系統媒體頁，自動模式可由比賽或有效媒體展開，比賽優先。正常模式胎溫／渦輪圖示亦改善小尺寸辨識。

**本次實際Chrome、Launcher及設定頁整合均通過；最新使用者視覺驗收及Windows／Forza實機驗收仍待完成。**

### Actual Renderer Previews

以下主要PNG均已替換為本次成功 [Chrome run37284549662](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37284549662)，source `b9a514366c56342b740b48cdb338855b4f2ff917`、artifact `11333404277`。使用合成遙測／媒體，**不是遊戲截圖**；比較圖只縮放並排列真實截圖，不重繪HUD。歷史布局不再作為主要預覽。

![目前收合布局與胎溫／渦輪圖示](RAW_PREFIX/docs/assets/lfa-center-ring/metric-detail.png)

![目前展開：弧形數值錨點、四輪胎溫、實心踏板](RAW_PREFIX/docs/assets/lfa-center-ring/expanded-detail.png)

![系統媒體、比賽優先接管、比賽後回到媒體與手動fallback](RAW_PREFIX/docs/assets/lfa-center-ring/media-race-comparison.png)

![目前收合、開啟中、展開與還原中](RAW_PREFIX/docs/assets/lfa-center-ring/expansion-transitions.png)

![目前窄版繁體中文HUD設定：比賽或媒體時自動展開](RAW_PREFIX/docs/assets/lfa-center-ring/settings/settings-narrow-zh-tw.png)

更多：[媒體主圖](RAW_PREFIX/docs/assets/lfa-center-ring/media-detail.png)、[Unicode／stale／封面失敗／時間](RAW_PREFIX/docs/assets/lfa-center-ring/media-states.png)、[compact／四輪極值／缺失](RAW_PREFIX/docs/assets/lfa-center-ring/expanded-layout-states.png)、[歷史錯誤布局對照](RAW_PREFIX/docs/assets/lfa-center-ring/expanded-before-after.png)、[增壓／VAC](RAW_PREFIX/docs/assets/lfa-center-ring/lfa-boost-scale-comparison.png)、[正常資料狀態](RAW_PREFIX/docs/assets/lfa-center-ring/state-contact-sheet.png)、[單圈提示](RAW_PREFIX/docs/assets/lfa-center-ring/session-states.png)、[收合720p](RAW_PREFIX/docs/assets/lfa-center-ring/metric-720p.png)、[展開720p](RAW_PREFIX/docs/assets/lfa-center-ring/expanded-720p.png)、[英文設定](RAW_PREFIX/docs/assets/lfa-center-ring/settings/settings-dark-default.png)、[日文設定](RAW_PREFIX/docs/assets/lfa-center-ring/settings/settings-narrow-ja-jp.png)。

### Key Modifications

- **曲面排版與資料**：用完整glyph bbox及8設計px留白計算圓形數值錨點，不採固定右欄。四輪溫度逐輪轉換、取整數，缺失保留`--`、共用°C／°F；四輪分布改變但平均相同也更新。正常模式仍須四輪皆有效才平均。實心踏板比例連續更新，相同四捨五入百分比也不凍結填充；有效0與N/A分開，數字在條外
- **媒體與頁面優先**：展開條件為 `manual || (auto && (confirmedRace || media.available))`，頁面為比賽 → 媒體 → 一般遙測。Auto OFF不由媒體展開；Manual保持展開，媒體消失後仍可回一般遙測。兩個原有boolean、預設false、持久化契約不變；EN／繁中／日文help同步更新
- **唯讀媒體**：沿用`hud:media`、GET `/api/runtime`與`/api/overlay/system_media`；只接受同源provider封面路徑，沒有播放控制。plain text、兩行曲名／單行歌手專輯、省略字串、安全封面fallback與舊請求隔離。paused需provider健康確認；最多3s暫存grace顯示琥珀色STALE，過期清空。位置／duration不外推；回報超出duration仍保留真實數字，僅夾進度條
- **移動機構**：固定560×370占位，中央整體右移96px而不縮放；反轉保留位置／速度，reduced-motion立即切換，resize不重設，首次持久化手動ON直接用終點。收合後移除transform；正常四弧在移動時淡出
- **有界比賽推論**：需新鮮有序uint32 timestamp，至少400ms且兩個不同正CurrentLap；初始0不進入。已確認後固定正值可維持，換圈有背景或grace可維持；無效／無背景0以2s退出，timestamp失聯3s退出。退出後依有效媒體／manual決定頁面；重播／倒序不保活，短error不立即收合。IsRaceOn單獨不足以進入
- **既有資料與安全**：非等比例正增壓0–1bar佔75%弧長、1–2bar佔25%；藍色VAC0–1bar共用弧且刻度同步切換，signed數字／單位保留。排名／圈速通知優先順序為失效／錯誤／暫停 → SHIFT → BEST LAP／LAP n → P# → LIVE；1.5s無新timestamp清空讀數，baseline／重連／重播不假慶祝
- **原型與授權**：LFA Menu display提供移動環視覺依據，不把SPORT／Circuit Mode當同一功能。PNG／SVG均原創、repository MIT，沒有散布或描圖OEM照片／商標／字體；沒有新增第三方runtime依賴

### Pre-Commit & Local Verification

- **Frontend:** `pnpm -C frontend test`：**1273 passed／1 skipped；163 files passed／1 skipped**，含146個LFA測試；`build:web-hud`、JS語法、PR-body格式與`git diff --check`通過
- **Rust historical local gate:** 前次設定擴充`config_contract`9/9；完整套件123通過／1失敗／2忽略，唯一LAN-IP假設在未改基底`bbf64fbd`同樣重現。不宣稱本機完整Rust全綠；本次媒體／排版不修改Rust
- **Actual browser:** source `b9a514366c56342b740b48cdb338855b4f2ff917`、[Visual 37284549662](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37284549662)、artifact `11333404277`成功，Chrome154、sandbox開啟。正常4配置、展開6配置各28畫面／21單位cases、正常圖示20cases、媒體4配置各9畫面及真實OverlayView設定整合通過；設定11功能檢查、errors與failedResponses為空。來源完整CI [37284549159](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37284549159)與Packaging [37284549880](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37284549880)亦成功；最終文件／預覽commit另待CI
- **Bounds:** 實際SVG文字bbox外加2px逐邊檢查fascia fill／shifted-ring cutout及互斥，包含完整踏板軌道；媒體另測真正HTML內容位於foreignObject中且曲名不超過兩行。涵蓋99:59.99、長signed bar／psi／kPa、四個9999°F／−999°F／缺失、default／compact DPR1／2、零值／N/A與中間幀
- **Pixel review:** 已看收合／曲面展開／四輪極值／實心踏板、playing／paused／stale／race接管／fallback／Unicode與窄版繁中日文。第一輪外框檢查未抓到36px曲名框內第三行細縫，改成34px=2×17px並補內部文字檢查，重新實際看圖確認。圖示140°F留白也保留嚴格斷言後修正
- **Central preservation:** 原中央PNG／SVG、CSS與drawScale／drawNeedle保留。對照`13a00e9`與`5c5b8f6`，每組八個匹配DPR2中央圓各0／223,942像素差異，四個完整viewport中央圓亦0差異。精確RGBA幾何圓比較見[本次中央證據](RAW_PREFIX/docs/assets/lfa-center-ring/media-center-preservation.json)，列出每個相同輸入／解析度的基底與差異；不宣稱整張PNG、全部解析度或未測狀態都相同

證據：[驗證摘要](RAW_PREFIX/docs/assets/lfa-center-ring/verification.json)、[renderer／展開／圖示](RAW_PREFIX/docs/assets/lfa-center-ring/evidence.json)、[launcher](RAW_PREFIX/docs/assets/lfa-center-ring/launcher-report.json)、[媒體](RAW_PREFIX/docs/assets/lfa-center-ring/media-report.json)、[當前PNG來源與hash](RAW_PREFIX/docs/assets/lfa-center-ring/media-preview-provenance.json)、[設定頁](RAW_PREFIX/docs/assets/lfa-center-ring/settings/settings-audit.json)、[UDP／JSON稽核](RAW_PREFIX/docs/assets/lfa-center-ring/json-unit-audit.json)。

目前主GUI未傳遞獨立溫度單位：明確effectiveUnits.temperature優先，否則依HUD公英制回退。Boost依官方UDP→真正Rust parser→JSON websocket→coordinator的PSI路徑，不套用無關binary／frontend的Pa解讀，也不猜單位。合成parser與受控media provider測試不是live websocket／原生Windows媒體／遊戲實機驗收。

**Windows原生overlay、系統媒體、click-through、置頂與Forza實機未驗證；最新使用者視覺驗收待完成。** 右下槽位假設取代遊戲原生儀表，提示／字幕遮擋仍需實機檢查。

### Living Changelog & Review Iterations

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
