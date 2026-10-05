### Summary of Changes

**最新雙字標更新（新實際CI／像素複查待完成）**：mph固定於原km/h上方，BOOST固定於VAC上方；四個SVG文字節點持續存在，依設定或真實增壓方向切換同色opacity。正壓／真正零點亮BOOST；負值點亮VAC；缺值／stale兩者皆暗。保留km/h anchor、速度字形、RPM上弧、色帶、abs分段比例與負號處理。下方圖片是前版單字標的歷史實際截圖，尚未代表本次修正。

本 PR 的 `ap1_rev_arc` 以1999 Honda S2000 AP1 琥珀數位儀表為原型，面向喜歡JDM／高轉數位儀表與簡潔道路HUD的玩家。

本PR亦依使用者先前明確要求：**右側燃油區改為 BOOST，底下顯示實際數值與單位；移除左下 AP1 / REV ARC 及右下 RPM 文字**。保留先前修正的共享上弧、外框、速度和檔位位置，不修改LFA或共用backend／協定。

前版單色source `2d88a29993f6d0bc6b2b2c881ac7a55865cc2c70` 已通過sandbox啟用的GitHub Actions Linux Chrome 154 renderer／實際launcher＋Coordinator檢查，並完成獨立像素複查。圖片使用合成遙測；Windows／遊戲驗收尚未進行，本輪雙字標的實際CI與預覽仍待完成。

![歷史單字標BOOST：實際Chrome154 DPR2截圖](RAW_PREFIX/docs/assets/ap1-rev-arc/detail-metric.png)

![歷史單字標的絕對值映射比較：本輪選中狀態新圖待CI](RAW_PREFIX/docs/assets/ap1-rev-arc/ap1-boost-scale-comparison.png)

[歷史狀態集](RAW_PREFIX/docs/assets/ap1-rev-arc/states.png) · [歷史Compact預覽](RAW_PREFIX/docs/assets/ap1-rev-arc/detail-compact.png) · [歷史720p全幅](RAW_PREFIX/docs/assets/ap1-rev-arc/metric-1280x720.png)

### Key Modifications

- **固定雙字標**：mph／km/h與BOOST／VAC各有獨立固定節點；只切換data-active與CSS opacity，不替換文字或移動anchor。BOOST／VAC略縮小以置於既有色帶上方
- **缺值與斷線**：速度單位保留設定提示；BOOST／VAC皆暗、增壓`--`／空條，避免缺值被誤當成零；正壓／真實零與有限負值分別選中BOOST／VAC
- **雙字標回歸**：default／70%compact × DPR1／DPR2，檢查DOM identity、固定文字、上下相對位置、容納與相鄰讀值避讓，覆蓋metric／imperial、正負零／missing／stale；bar／數字／ticks同paint與caption選中opacity分開驗證

- **BOOST資料真實性**：官方Forza Data Out明定raw `Boost` 為高於大氣壓的PSI。HUD JSON路徑保留此值；嚴格有限值、signed／zero分開處理，不套用其他binary路徑的Pa假設，不以量級猜測單位
- **缺值保護**：原始Boost無效時不退到aliases；Coordinator-shaped frame若缺少Boost，即使aliases被共用層補為0也顯示缺值。canonical-only接受明確boost_psi／bar／kpa或明確單位，拒絕未支援的源單位
- **右側顯示**：正負皆對abs(bar)套用0–1佔75%、1–2佔25%的同一函式；部分segment精確填色。兩方向使用相同0／0.5／1／2 magnitude刻度與琥珀paint，bar沒有VAC換量程、色差或亮度差；固定caption的選中opacity另依模式切換。負號和VAC字樣提供方向，PSI／kPa保留等價刻度
- **零／缺值／微小負值**：真實0空條neutral；缺值`--`空條；超量程數值保留。微小有限負壓四捨五入為零時保留負號，真正負零為neutral
- **快取回歸**：signature包含boost.ratio與overflow；新增跨zero／量程邊界但rounded文字相同的案例，避免色帶或metadata凍結
- **移除文字**：刪除兩個底框SVG文字節點及專屬CSS；速度／檔位／共享上弧／fascia資產不變
- **回歸證據**：三筆合成324-byte封包經未修改production parser／serde_json得到的JSON，納入純模型測試與實際launcher輸入。這不是實際UDP或遊戲驗收
- **視覺fixture**：新增positive／zero／negative／missing（含共用層補0）／PSI／kPa／overflow與footer absence；保留default／compact、DPR、reload／destroy與smoothing斷線回歸

### Pre-Commit & Local Verification

- **Frontend Tests:** `pnpm -C frontend test` →160 files passed、1 skipped；1195 tests passed、1 skipped；AP1樣式90 cases
- **Frontend Build:** `pnpm -C frontend build:web-hud` →pass；新boost model加入runtime，tests排除
- **Syntax / Whitespace:** `node --check`與`git diff --check` →pass
- **Historical Monochrome Browser Review:** GitHub Actions Linux Chrome 154、sandbox啟用、合成遙測；renderer＋actual launcher／Coordinator PASS。source `2d88a29993f6d0bc6b2b2c881ac7a55865cc2c70`；[run37268451649](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37268451649)／[artifact11327007457](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37268451649/artifacts/11327007457)
- **Historical Render Findings:** 獨立查看hero／compact與+0.5／+1／−0.5／零、−1／−2、VAC PSI／kPa、tiny negative、missing及negative overflow；同琥珀外觀、共同刻度與VAC／負號清楚，未見重疊。該版computed paint精確相同；±0.5／±1／±2的ratio為0.375／0.75／1。renderer errors及launcher errors／missing皆為空
- **Historical Monochrome Pixel Preservation:** 實際+0.5／−0.5 bar與glow區域1,309個RGBA像素完全相同；`a995df88`→`2d88a299`右aux區外（含底框）454,320個像素中0個不同，詳見`monochrome-boost-preservation.json`
- **Historical Pixel Preservation:** `662d934`→`a995df88`燃油改BOOST時，指定aux／底框區外416,143像素中0個不同。此歷史比較不冒充本輪單色pixel-diff；`before-after.png`也是較早燃油版的弧度修正對照
- **Final CI / Approval:** 前版單色source的visual CI通過；本輪雙字標尚待新CI與像素複查，使用者review尚未完成。技術檢查不代表Windows／遊戲實測或使用者核准
- **Native Platform:** Windows透明overlay、滑鼠穿透、真實遊戲及安全區未驗收；此HUD預期取代原生右下儀表
- **Scope:** 無backend、shared coordinator、共享生命週期、LFA或相依套件變更

### Living Changelog & Review Iterations

- 2026-10-05（Bagley as Codex）：依最新要求將mph／km/h與BOOST／VAC改為上下固定字標，同色opacity呈現設定／模式。保留km/h與其餘主讀值位置；新增固定節點、missing／stale與default／compact相對版面回歸，新實際CI圖待完成

- 2026-10-05（Bagley as Codex）：最新使用者單色要求取代深淺VAC方案；刪除VAC專屬色彩／glow，兩方向共用絕對值分段函式與刻度。新增±0.5／±1／±2對稱性、同paint及負號測試；本輪Chrome／launcher實際CI通過，完成獨立像素複查與新比較預覽

- 2026-10-05（Bagley as Codex，已被最新要求取代的歷史方案）：曾使用正壓75%／25%分段映射與獨立VAC量程／深琥珀色；本輪已移除該差異，不作為目前預覽或交付

- 2026-10-05（Bagley as Codex）：研究官方AP1座艙照片，完成原創fascia與HUD
- 2026-10-05（Bagley as Codex）：依使用者弧度回饋改為共用法線與等弧長幾何；獨立檢視實際遠端前後截圖
- 2026-10-05（Bagley as Codex）：較早一輪將燃油改BOOST並移除底框文字；遵循官方PSI與實際JSON路徑，補signed／zero／missing／units／overflow與快取邊界；該輪實際CI圖像複查通過，0像素範圍外變動

### Related Issues / References

- [Forza Horizon 6 Data Out官方文件](https://support.forza.net/hc/en-us/articles/51744149102611-Forza-Horizon-6-Data-Out-Documentation)
- [Honda 1999.04 Fact Book / Interior](https://www.honda.co.jp/factbook/auto/s2000/199904/046.html)（原型為日本上市初期1999 Honda S2000 AP1）
- [實際查看的官方座艙參考圖](https://www.honda.co.jp/factbook/auto/s2000/199904/image/037_001.gif)（僅研究，未封裝）
- 原型／BOOST契約：`docs/hud/ap1-rev-arc.md`
- 本輪記錄：`docs/assets/ap1-rev-arc/dual-label-revision-evidence.json`；前版單色證據：`nonlinear-boost-revision-evidence.json`；較早燃油改BOOST的歷史記錄：`boost-revision-evidence.json`
- 單色LCD／TN僅為使用者提供的設計背景，本輪未外部查證硬體類型
- 原創程式、七段字形與Inkscape資產依repository MIT license；未封裝OEM照片、Logo或字型，無Honda官方背書
- Skills：`halfmoon-design-system`、`telemetry-udp-protocol`、`pr-author-maintainer`

---
Author / Maintainer: Bagley as Codex
