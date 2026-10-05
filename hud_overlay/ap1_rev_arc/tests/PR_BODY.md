### Summary of Changes

**最新單色更新（待新CI／使用者review）**：依使用者補充的單色LCD方向，取消VAC深淺色差異。正負共用同一琥珀RGBA、brightness、glow、文字／刻度paint及f(abs(bar))：0–1bar magnitude佔75%，1–2bar佔25%；±0.5同為37.5%、±1同為75%、±2滿條，刻度統一0／0.5／1／2。負壓保留負號與VAC文字。TN硬體說明只作為使用者設計背景，本輪未外部查證。下方歷史圖不代表本次單色版驗收。

本 PR 的 `ap1_rev_arc` 以1999 Honda S2000 AP1 琥珀數位儀表為原型，面向喜歡JDM／高轉數位儀表與簡潔道路HUD的玩家。

本輪依使用者明確要求：**右側燃油區改為 BOOST，底下顯示實際數值與單位；移除左下 AP1 / REV ARC 及右下 RPM 文字**。保留先前修正的共享上弧、外框、速度和檔位位置，不修改LFA或共用backend／協定。

前版線性BOOST曾通過實際GitHub Actions Chrome154 renderer／launcher；下圖為該歷史合成遙測版本。本輪單色程式gate已重跑，等待新實際CI圖與review。任何版本均未宣稱Windows／遊戲實測或使用者核准。

![前版線性BOOST：歷史Chrome154 DPR2截圖](RAW_PREFIX/docs/assets/ap1-rev-arc/detail-metric.png)

![前版線性BOOST歷史狀態（本輪非線性新圖待CI）](RAW_PREFIX/docs/assets/ap1-rev-arc/states.png)

### Key Modifications

- **BOOST資料真實性**：官方Forza Data Out明定raw `Boost` 為高於大氣壓的PSI。HUD JSON路徑保留此值；嚴格有限值、signed／zero分開處理，不套用其他binary路徑的Pa假設，不以量級猜測單位
- **缺值保護**：原始Boost無效時不退到aliases；Coordinator-shaped frame若缺少Boost，即使aliases被共用層補為0也顯示缺值。canonical-only接受明確boost_psi／bar／kpa或明確單位，拒絕未支援的源單位
- **右側顯示**：正負皆對abs(bar)套用0–1佔75%、1–2佔25%的同一函式；部分segment精確填色。兩方向使用相同0／0.5／1／2 magnitude刻度與琥珀paint，沒有VAC換量程、色差或亮度差。負號和VAC字樣提供方向，PSI／kPa保留等價刻度
- **零／缺值／微小負值**：真實0空條neutral；缺值`--`空條；超量程數值保留。微小有限負壓四捨五入為零時保留負號，真正負零為neutral
- **快取回歸**：signature包含boost.ratio與overflow；新增跨zero／量程邊界但rounded文字相同的案例，避免色帶或metadata凍結
- **移除文字**：刪除兩個底框SVG文字節點及專屬CSS；速度／檔位／共享上弧／fascia資產不變
- **回歸證據**：三筆合成324-byte封包經未修改production parser／serde_json得到的JSON，納入純模型測試與實際launcher輸入。這不是實際UDP或遊戲驗收
- **視覺fixture**：新增positive／zero／negative／missing（含共用層補0）／PSI／kPa／overflow與footer absence；保留default／compact、DPR、reload／destroy與smoothing斷線回歸

### Pre-Commit & Local Verification

- **Frontend Tests:** `pnpm -C frontend test` →160 files passed、1 skipped；1190 tests passed、1 skipped；AP1樣式85 cases
- **Frontend Build:** `pnpm -C frontend build:web-hud` →pass；新boost model加入runtime，tests排除
- **Syntax / Whitespace:** `node --check`與`git diff --check` →pass
- **Historical Linear BOOST Browser Review:** sandbox啟用的GitHub Actions Linux Chrome 154，合成遙測；renderer＋actual launcher／Coordinator PASS。source head `a995df88fc8c4d4b4e6989c61a03e8c8a249cb6b`；[run37263377297](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37263377297)／[artifact11325665121](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37263377297/artifacts/11325665121)
- **Pixel Preservation:** 比較`662d934`與本輪實際DPR2 PNG，只排除要求修改的右aux／底框區；416,143個比較像素中0個不同，無重取樣／容差。新hero與九狀態已獨立目視，BOOST數字／單位與缺值清楚，底框兩字樣消失
- **Current Nonlinear CI / Approval:** 非線性／VAC更新的新CI及實際圖仍待完成；技術檢查不代表使用者核准。`before-after.png`保留為較早燃油版的歷史弧度比較，不是最新BOOST外觀
- **Native Platform:** Windows透明overlay、滑鼠穿透、真實遊戲及安全區未驗收；此HUD預期取代原生右下儀表
- **Scope:** 無backend、shared coordinator、共享生命週期、LFA或相依套件變更

### Living Changelog & Review Iterations

- 2026-10-05（Bagley as Codex）：最新使用者單色要求取代深淺VAC方案；刪除VAC專屬色彩／glow，兩方向共用絕對值分段函式與刻度。新增±0.5／±1／±2對稱性、同paint及負號測試，等待新實際渲染

- 2026-10-05（Bagley as Codex）：新增正壓75%／25%分段映射及全條VAC magnitude；暖暗琥珀＋VAC文字，支援部分cell、動態unit ticks、zero／missing／tiny-negative／cache／monotonic回歸。新圖待實際CI，舊圖明確標為歷史

- 2026-10-05（Bagley as Codex）：研究官方AP1座艙照片，完成原創fascia與HUD
- 2026-10-05（Bagley as Codex）：依使用者弧度回饋改為共用法線與等弧長幾何；獨立檢視實際遠端前後截圖
- 2026-10-05（Bagley as Codex）：本輪將燃油改BOOST並移除底框文字；遵循官方PSI與實際JSON路徑，補signed／zero／missing／units／overflow與快取邊界；本輪實際CI圖像複查通過，0像素範圍外變動，更新hero與狀態圖

### Related Issues / References

- [Forza Horizon 6 Data Out官方文件](https://support.forza.net/hc/en-us/articles/51744149102611-Forza-Horizon-6-Data-Out-Documentation)
- [Honda 1999.04 Fact Book / Interior](https://www.honda.co.jp/factbook/auto/s2000/199904/046.html)（原型為日本上市初期1999 Honda S2000 AP1）
- [實際查看的官方座艙參考圖](https://www.honda.co.jp/factbook/auto/s2000/199904/image/037_001.gif)（僅研究，未封裝）
- 原型／BOOST契約：`docs/hud/ap1-rev-arc.md`
- 本輪記錄：`docs/assets/ap1-rev-arc/boost-revision-evidence.json`
- 原創程式、七段字形與Inkscape資產依repository MIT license；未封裝OEM照片、Logo或字型，無Honda官方背書
- Skills：`halfmoon-design-system`、`telemetry-udp-protocol`、`pr-author-maintainer`

---
Author / Maintainer: Bagley as Codex
