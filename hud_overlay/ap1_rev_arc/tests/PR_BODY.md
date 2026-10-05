### Summary of Changes

**最新字標換序與對齊（實際Chrome／launcher與像素複查通過）**：依使用者要求改為VAC在上、BOOST在下，兩個固定caption以同一middle anchor置中於既有色帶上方，保留原baseline間距。選中／暗態、mph／km/h、速度字形、RPM上弧、色帶與abs映射均不改動。使用者已授權完成此輪調整與驗證後解除draft、交付review；下方已更新為本輪VAC在上、BOOST在下的實際Chrome截圖。

本 PR 的 `ap1_rev_arc` 以1999 Honda S2000 AP1 琥珀數位儀表為原型，面向喜歡JDM／高轉數位儀表與簡潔道路HUD的玩家。

本PR亦依使用者先前明確要求：**右側燃油區改為 BOOST，底下顯示實際數值與單位；移除左下 AP1 / REV ARC 及右下 RPM 文字**。保留先前修正的共享上弧、外框、速度和檔位位置，不修改LFA或共用backend／協定。

本輪換序source `d6c74ba5af2f83df94ee4a45cadaaf086e524361` 已通過sandbox啟用的GitHub Actions Linux Chrome 154 renderer／實際launcher＋Coordinator檢查，並完成獨立像素複查。圖片使用合成遙測；Windows／遊戲驗收尚未進行，本輪換序後實際Chrome通過，最終文件head checks與Ready for Review狀態切換仍待完成。

![VAC在上、BOOST在下：實際Chrome154 DPR2截圖](RAW_PREFIX/docs/assets/ap1-rev-arc/detail-metric.png)

![VAC在上：metric／imperial × BOOST／VAC實際截圖](RAW_PREFIX/docs/assets/ap1-rev-arc/ap1-boost-scale-comparison.png)

[本輪狀態集](RAW_PREFIX/docs/assets/ap1-rev-arc/states.png) · [Compact預覽](RAW_PREFIX/docs/assets/ap1-rev-arc/detail-compact.png) · [720p全幅](RAW_PREFIX/docs/assets/ap1-rev-arc/metric-1280x720.png)

### Key Modifications

- **固定雙字標**：mph／km/h保持原樣；右側改為VAC在上、BOOST在下，各有獨立固定節點與共同middle anchor，置中於未移動的色帶。模式切換只改同色opacity，正壓／零與負壓語意不變
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

- **本輪實際換序驗證**：source `d6c74ba5af2f83df94ee4a45cadaaf086e524361`，sandbox啟用，Chrome154.0.8037.57；[run37275496032](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37275496032)／[artifact11330051871](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37275496032/artifacts/11330051871)。61張截圖、28組固定字標情境、32筆launcher樣本通過；已實際查看default／compact的正負零、缺值與stale，順序與對齊正確
- **本輪像素保留**：對照`888ea8ba`，只排除兩個模式字標的新／舊ink範圍及1device pixel邊緣，四個default／compact × DPR1／2場景合計897,347像素中0變動；速度單位、數字、色帶、刻度、上弧與外框均納入比較。詳見`caption-order-preservation.json`

### Pre-Commit & Local Verification

- **Frontend Tests:** `pnpm -C frontend test` →160 files passed、1 skipped；1195 tests passed、1 skipped；AP1樣式90 cases
- **Frontend Build:** `pnpm -C frontend build:web-hud` →pass；新boost model加入runtime，tests排除
- **Syntax / Whitespace:** `node --check`與`git diff --check` →pass
- **Historical Dual-Label Browser Review:** GitHub Actions Linux Chrome 154.0.8037.57、sandbox啟用、合成遙測；renderer＋actual launcher／Coordinator PASS。source `888ea8ba9af69e65f95f96874d3563dacf620680`；[run37271674297](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37271674297)／[artifact11328239382](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37271674297/artifacts/11328239382)
- **Historical Render Findings:** 61張renderer截圖、28組雙字標情境、32筆launcher樣本；errors／missing為空。已獨立查看default／70%compact的metric／imperial × BOOST／VAC，以及zero／missing／stale；兩個固定字標可見、選中狀態正確，未見字標／色帶／數字重疊
- **Historical Scoped Pixel Comparison:** 相對`2d88a299`只排除新／舊字標ink-box聯集與1 device pixel邊緣。default DPR2為0／476,857差異、compact DPR2為0／233,439、compact DPR1為0／58,441。default DPR1有64／119,025個差異集中左外殼邊緣；完整保留記錄，未擴張遮罩或宣稱全圖相同。詳見`dual-label-preservation.json`
- **Unit Precedence Probe:** 補充唯讀model probe確認目前設定優先於舊frame單位metadata；stale保留設定字標而數值為`---`，不匹配的generic speed不改標單位。此probe不算新增Vitest case
- **Historical Evidence:** `before-after.png`仍是較早燃油版的弧度修正對照；舊單色／燃油改BOOST JSON只作歷史證據
- **Final CI / Approval:** 本輪VAC／BOOST換序與置中調整的實際Chrome與像素複查已通過；最終文件head CI仍待完成；完成驗證後依使用者明確要求解除draft、交付review。此流程不代表已完成Windows／遊戲實測或reviewer核准
- **Native Platform:** Windows透明overlay、滑鼠穿透、真實遊戲及安全區未驗收；此HUD預期取代原生右下儀表
- **Scope:** 無backend、shared coordinator、共享生命週期、LFA或相依套件變更

### Living Changelog & Review Iterations

- 2026-10-05（Bagley as Codex）：依使用者最後調整將VAC置上、BOOST置下，兩字標置中於既有色帶；更新default／compact、DPR1／DPR2的相對順序與中心對齊檢查，實際Chrome／launcher通過並更新預覽

- 2026-10-05（Bagley as Codex）：依最新要求將mph／km/h與BOOST／VAC改為上下固定字標，同色opacity呈現設定／模式。保留km/h與其餘主讀值位置；新增固定節點、missing／stale與default／compact相對版面回歸；本輪實際Chrome／launcher通過，更新hero、選中狀態比較與範圍限定pixel proof

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
- 本輪記錄：`docs/assets/ap1-rev-arc/caption-order-revision-evidence.json`；前版雙字標證據：`dual-label-revision-evidence.json`；前版單色證據：`nonlinear-boost-revision-evidence.json`；較早燃油改BOOST的歷史記錄：`boost-revision-evidence.json`
- 單色LCD／TN僅為使用者提供的設計背景，本輪未外部查證硬體類型
- 原創程式、七段字形與Inkscape資產依repository MIT license；未封裝OEM照片、Logo或字型，無Honda官方背書
- Skills：`halfmoon-design-system`、`telemetry-udp-protocol`、`pr-author-maintainer`

---
Author / Maintainer: Bagley as Codex
