### Summary of Changes

本 PR 的 `ap1_rev_arc` 以1999 Honda S2000 AP1 琥珀數位儀表為原型，面向喜歡JDM／高轉數位儀表與簡潔道路HUD的玩家。

本輪依使用者明確要求：**右側燃油區改為 BOOST，底下顯示實際數值與單位；移除左下 AP1 / REV ARC 及右下 RPM 文字**。保留先前修正的共享上弧、外框、速度和檔位位置，不修改LFA或共用backend／協定。

本地程式gate與本輪BOOST的遠端renderer／launcher已通過；新圖已複查。以下是**GitHub Actions Chrome 154的實際renderer、合成遙測**，不代表Windows／遊戲實測或使用者核准。最終文件commit的完整CI仍待完成。

![AP1 BOOST：實際Chrome154 DPR2截圖](RAW_PREFIX/docs/assets/ap1-rev-arc/detail-metric.png)

![BOOST正負零／缺值／PSI／kPa／過量程／斷線／compact狀態](RAW_PREFIX/docs/assets/ap1-rev-arc/states.png)

### Key Modifications

- **BOOST資料真實性**：官方Forza Data Out明定raw `Boost` 為高於大氣壓的PSI。HUD JSON路徑保留此值；嚴格有限值、signed／zero分開處理，不套用其他binary路徑的Pa假設，不以量級猜測單位
- **缺值保護**：原始Boost無效時不退到aliases；Coordinator-shaped frame若缺少Boost，即使aliases被共用層補為0也顯示缺值。canonical-only接受明確boost_psi／bar／kpa或明確單位，拒絕未支援的源單位
- **右側顯示**：−1…2bar及等價PSI／kPa刻度，保留zero標記；底下數值signed、可見單位，僅色帶幾何clamp，過量程仍呈現實值。缺值是`--`，真實0正常顯示；沒有虛構油量或增壓值
- **快取回歸**：signature包含boost.ratio與overflow；新增跨zero／量程邊界但rounded文字相同的案例，避免色帶或metadata凍結
- **移除文字**：刪除兩個底框SVG文字節點及專屬CSS；速度／檔位／共享上弧／fascia資產不變
- **回歸證據**：三筆合成324-byte封包經未修改production parser／serde_json得到的JSON，納入純模型測試與實際launcher輸入。這不是實際UDP或遊戲驗收
- **視覺fixture**：新增positive／zero／negative／missing（含共用層補0）／PSI／kPa／overflow與footer absence；保留default／compact、DPR、reload／destroy與smoothing斷線回歸

### Pre-Commit & Local Verification

- **Frontend Tests:** `pnpm -C frontend test` →160 files passed、1 skipped；1167 tests passed、1 skipped；AP1樣式62 cases
- **Frontend Build:** `pnpm -C frontend build:web-hud` →pass；新boost model加入runtime，tests排除
- **Syntax / Whitespace:** `node --check`與`git diff --check` →pass
- **Current BOOST Browser Review:** sandbox啟用的GitHub Actions Linux Chrome 154，合成遙測；renderer＋actual launcher／Coordinator PASS。source head `a995df88fc8c4d4b4e6989c61a03e8c8a249cb6b`；[run37263377297](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37263377297)／[artifact11325665121](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37263377297/artifacts/11325665121)
- **Pixel Preservation:** 比較`662d934`與本輪實際DPR2 PNG，只排除要求修改的右aux／底框區；416,143個比較像素中0個不同，無重取樣／容差。新hero與九狀態已獨立目視，BOOST數字／單位與缺值清楚，底框兩字樣消失
- **Final CI / Approval:** 文件commit的完整CI仍待完成；技術檢查不代表使用者核准。`before-after.png`保留為較早燃油版的歷史弧度比較，不是最新BOOST外觀
- **Native Platform:** Windows透明overlay、滑鼠穿透、真實遊戲及安全區未驗收；此HUD預期取代原生右下儀表
- **Scope:** 無backend、shared coordinator、共享生命週期、LFA或相依套件變更

### Living Changelog & Review Iterations

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
