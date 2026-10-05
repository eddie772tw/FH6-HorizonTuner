### Summary of Changes

`lfa_center_ring` 以 **2012 Lexus LFA Normal／Menu display** 為原型：厚金屬中央錶環、黑底白字、四弧側錶，以及整個主錶右移的展開機構。適合偏好真實量產超跑儀表、手排換檔與山路巡航的玩家。

已完成四輪平均胎溫、非等比例增壓／VAC、油門／煞車、即時單圈／排名／圈速提示，以及手動／自動展開。原中央PNG／SVG、CSS、刻度／指針繪圖保留；移動時不縮放。**實際Chrome及設定頁功能整合已通過，仍待使用者視覺驗收與Windows／遊戲實機驗收**。

### Actual Renderer Previews

以下取自成功的 [Chrome run37272049555](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37272049555)，來源`f3dd06b7f17b3c12867648780d0622dcb8525b9f`、artifact`11328657701`。HUD使用合成遙測，**不是遊戲截圖**；狀態圖只縮小並排列真實截圖，沒有重繪儀表。

![收合布局](RAW_PREFIX/docs/assets/lfa-center-ring/metric-detail.png)

![展開後的單圈與遙測布局](RAW_PREFIX/docs/assets/lfa-center-ring/expanded-detail.png)

![收合、開啟中、展開、還原中的實際畫面](RAW_PREFIX/docs/assets/lfa-center-ring/expansion-transitions.png)

![實際窄版繁體中文HUD設定頁：手動與自動展開](RAW_PREFIX/docs/assets/lfa-center-ring/settings/settings-narrow-zh-tw.png)

設定頁圖片來自字型補齊重跑的`5a5daee04b1124089bb79f3c03ea03da3a6f83e5`、[run37273120011](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37273120011)、artifact`11328991695`，與上方`f3dd06b` HUD素材分開記錄；兩者HUD runtime相同。

更多：[增壓／VAC比較](RAW_PREFIX/docs/assets/lfa-center-ring/lfa-boost-scale-comparison.png)、[單位與失效狀態](RAW_PREFIX/docs/assets/lfa-center-ring/state-contact-sheet.png)、[單圈通知](RAW_PREFIX/docs/assets/lfa-center-ring/session-states.png)、[收合720p](RAW_PREFIX/docs/assets/lfa-center-ring/metric-720p.png)、[展開720p](RAW_PREFIX/docs/assets/lfa-center-ring/expanded-720p.png)。補齊CI字型後已實際查看繁體中文與日文：可讀、無溢出，字形探測通過且沒有page errors／失敗response。[英文設定](RAW_PREFIX/docs/assets/lfa-center-ring/settings/settings-dark-default.png)／[日文設定](RAW_PREFIX/docs/assets/lfa-center-ring/settings/settings-narrow-ja-jp.png)。

### Key Modifications

- **展開機構**：固定560×370設計占位，中央整體右移96設計px（預設72 CSS px）；左方顯示封包的CURRENT／LAST／BEST LAP及既有胎溫／增壓／踏板。約600ms臨界阻尼，反轉保留位置／速度，reduced-motion立即切換，resize不重設，首次持久化手動ON直接採用展開布局。位移與時間是HUD設計，非原車量測
- **兩個設定**：`lfaManualExpand`／`lfaAutoExpand`為嚴格boolean、預設false。手動ON優先；手動OFF可由已確認的自動模式維持展開。前端與Rust設定契約、持久化／重載／reset及三語說明一致；shared通訊與UDP不改
- **自動判斷**：須新鮮有序uint32 timestamp與至少400ms的正CurrentLap增長；初始0即使有排名也不進入。已確認後可維持固定正圈時、帶背景的換圈0；缺失／非法或無背景持續0以2s緩衝退出，timestamp失聯3s退出。重播／倒序不保活；短error不立即收合，pause／缺少速度RPM不破壞有效圈時判斷。這是有界單圈訊號推論，並非完美race flag；手動失聯仍展開但資料清空
- **四弧資料**：胎溫必須四個有限°F讀值全部有效才平均；一輪缺失即N/A。踏板0–100%無舊圖示。增壓0–1bar佔75%弧長、1–2bar佔25%；負壓以藍色VAC共享整弧、幅值0–1bar線性顯示，刻度同步切換，signed數字與bar／psi／kPa單位不因弧條夾限而失真
- **計圈與安全**：CurrentLap只顯示最新回報值，含有效0，缺失`—:—`；最寬99:59.99。狀態優先為失效／錯誤／暫停 → SHIFT → BEST LAP／LAP n → P# → LIVE。首次baseline／重連／重播／倒序／重設不假慶祝；讀數仍在1.5s失效
- **原型與授權**：官方LFA Menu display可移動主錶，不把SPORT或日本Circuit Mode誤當同一機構。所有PNG／SVG為原創、沿用repository MIT，沒有散布／描圖OEM照片、商標或字體

### Pre-Commit & Local Verification

- **Frontend:** `pnpm -C frontend test`：**1,208 passed／1 skipped，160 files passed／1 skipped**，含81個LFA行為測試；`build:web-hud`、JS語法、PR-body格式及`git diff --check`通過
- **Rust:** `config_contract` **9/9通過**；本機完整套件123通過／1失敗／2忽略。唯一`companion::tests::test_qr_payload_generation_and_pairing`在`src/companion.rs:378`要求非空LAN IP，同一失敗已在未修改基底`bbf64fbd`重現；**不宣稱本機完整Rust全綠**
- **Exact-head CI:** `f3dd06b7f17b3c12867648780d0622dcb8525b9f`的[CI Pipeline37272049454](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37272049454)（含Rust backend／Agent CLI contracts）、[Release Packaging37272049845](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37272049845)、[Chrome Visual37272049555](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37272049555)均SUCCESS；最終文件／預覽commit另待CI
- **Actual browser coverage:** Chrome154.0.8037.57、`chromiumSandbox:true`；720p／1080p／1440p DPR1與1080p DPR2，正常與展開套件均通過。涵蓋實際右移、快速反轉、reduced-motion、resize、初始0／換圈／固定圈時／缺失／失聯／重連、最大寬度。真正launcher／coordinator及OverlayView→BroadcastChannel→Launcher驗證設定與生命週期
- **Exact central preservation:** 對照`5c5b8f6`，八個匹配DPR2 detail中央圓各**0/223,942像素差異**；四個完整viewport的中央圓也全數0差異。原始RGBA、像素中心幾何圓判定，無容差／羽化／重採樣。1080p DPR2完整PNG圓外有14個不同像素；不宣稱所有整張圖片或未測狀態都相同。中央素材／CSS／drawScale／drawNeedle逐byte未改

證據：[renderer／展開報告](RAW_PREFIX/docs/assets/lfa-center-ring/evidence.json)、[launcher](RAW_PREFIX/docs/assets/lfa-center-ring/launcher-report.json)、[中央比較](RAW_PREFIX/docs/assets/lfa-center-ring/expansion-center-preservation.json)、[預覽來源](RAW_PREFIX/docs/assets/lfa-center-ring/expansion-preview-provenance.json)、[單位稽核](RAW_PREFIX/docs/assets/lfa-center-ring/json-unit-audit.json)、[驗證摘要](RAW_PREFIX/docs/assets/lfa-center-ring/verification.json)。

目前主GUI未傳遞獨立溫度單位：有明確effectiveUnits.temperature則採用，否則依HUD公英制回退。Boost依官方UDP→真正Rust parser→JSON websocket→coordinator路徑的PSI；不套用無關frontend／binary通道的Pa converter，也不猜單位。合成parser／launcher驗證不是live websocket或實際遊戲驗收。

**Windows原生overlay、click-through、置頂與Forza實機未驗證**。右下槽位假設取代遊戲原生儀表，仍需實機檢查提示／字幕遮擋。

### Living Changelog & Review Iterations

- 2026-10-05（Bagley as Codex）：建立官方Normal display原型；依實車照片將側錶重建為四弧，保留使用者肯定的中央
- 2026-10-05（Bagley as Codex）：加入平均胎溫、signed boost、踏板、圈時／排名／通知；首輪invalid-speed fixture誤用單位，修正測試後通過
- 2026-10-05（Bagley as Codex）：加入非等比例／VAC；實際Chrome抓到刻度與讀數相撞，僅移動右上讀數並保留真實不重疊斷言，重跑通過
- 2026-10-05（Bagley as Codex）：第一輪設定頁中日文字形缺字，僅補CI字型與字形回歸探測；run37273120011重跑後實際像素已確認可讀
- 2026-10-05（Bagley as Codex）：加入展開／還原與設定。首輪連續性fixture誤比114ms RAF與120ms config狀態，修正為同時刻嚴格比較clock／progress／transform／螢幕位置，runtime未改；移除空runner重複步驟。本輪renderer／展開／launcher／設定功能CI通過

### Related Issues / References

- [2012官方OM77006U，印刷116／PDF118頁](https://assets.sia.toyota.com/publications/en/om-s/OM77006U/pdf/OM77006U.pdf#page=118)；單圈版面另見印刷144–145頁
- [Lexus日本官方LFA手冊，印刷98／PDF100頁](https://manual.lexus.jp/pdf/lfa/LFA_OM_JP_M77001J_1_1012.pdf#page=100)／[官方2010–2012年份索引](https://manual.lexus.jp/lfa/)
- [Lexus UK官方圖庫](https://media.lexus.co.uk/images/lfa-interior/)／[T_6820](https://media.lexus.co.uk/wp-content/uploads/sites/3/2011/10/T_6820-scaled.jpg)／[T_6833](https://media.lexus.co.uk/wp-content/uploads/sites/3/2011/10/T_6833-scaled.jpg)／[DSC_4040](https://media.lexus.co.uk/wp-content/uploads/sites/3/2012/12/DSC_4040-scaled.jpg)
- [MotorTrend2012近照](https://www.motortrend.com/uploads/sites/5/2012/07/2012-Lexus-LFA-Tach.jpg)／[C Ling Fan攝影](https://commons.wikimedia.org/wiki/File:Lexus_LFA_speedometer_view_01.jpg)。T_6820標示Issued10/2009、中央AUTO；SPORT白底照片僅參考共同側面布局，2012範圍以官方手冊為準
- [Forza官方Data Out欄位／單位](https://support.forza.net/hc/en-us/articles/51744149102611-Forza-Horizon-6-Data-Out-Documentation)
- 詳細契約：`docs/hud/lfa-center-ring.md`；採用技能：`halfmoon-design-system`、`telemetry-udp-protocol`、`modular-refactoring`、`pr-author-maintainer`

---
Author / Maintainer: Bagley as Codex
