### Summary of Changes

本 PR 新增 `ap1_rev_arc`，以 **1999 Honda S2000 AP1 日本上市初期的琥珀數位儀表**為原型：低寬黑色外殼、細密上拱轉速帶與大型七段速度，面向喜歡1990年代末Honda／JDM、高轉數位儀表與簡潔道路HUD的玩家。

**最新左對齊修正已實際渲染**：mph／km/h各自共用左緣x458，VAC／BOOST共用左緣x591，皆為start anchor；順序、原有上下位置、固定DOM與選中opacity不變。保留上移後的RPM、速度／檔位數字及BOOST色帶。source `3e00409d0fbe86ee0f394581f6347349e7d7df00` 的GitHub Actions Linux Chrome154.0.8037.57／sandbox renderer、實際launcher＋Coordinator與獨立像素複查通過。下方皆為目前合成遙測實際Chrome截圖；最終文件head CI待發布後確認。PR維持Ready，不表示reviewer核准、合併或Windows／遊戲驗收。

![目前3e00409：mph與km/h、VAC與BOOST各自靠左對齊](RAW_PREFIX/docs/assets/ap1-rev-arc/detail-metric.png)

![歷史4f／目前3e左對齊比較：default及70%compact](RAW_PREFIX/docs/assets/ap1-rev-arc/rpm-before-after.png)

![目前左對齊字標：metric／imperial × BOOST／VAC選中狀態](RAW_PREFIX/docs/assets/ap1-rev-arc/ap1-boost-scale-comparison.png)

[Compact預覽](RAW_PREFIX/docs/assets/ap1-rev-arc/detail-compact.png) · [正負零／missing／stale狀態集](RAW_PREFIX/docs/assets/ap1-rev-arc/states.png) · [720p全幅](RAW_PREFIX/docs/assets/ap1-rev-arc/metric-1280x720.png)

### Key Modifications

- **本輪左對齊**：只修改四個text節點的x及text-anchor，其他HTML內容一致；兩對均留在原有區域，未移動數字或色帶。28組default／compact × DPR1／DPR2實際場景的兩組rendered left edge與screen anchor差值皆精確為0
- **既有一致上緣間隙**：保留原ellipse和fascia採樣，RPM另外沿新中線等弧長排列；整組normal offset為24，band厚18，距face contour名義12，扣除4寬stroke內側的2後淨空10。拱頂和兩端採同一構造，沒有單獨垂直推移。RPM單位由(109,172)沿左端法線移至約(88.428,159.639)
- **原型複查與密度**：實際查看官方1999.04座艙圖、Honda booklet掃描p27、1280×544點亮AP1照片及2000–03未通電OEM拆車儀表。數字位於色帶下方、細長cells與長短刻度由照片支持；120格、64% pitch fill與24單位inset是HUD適配，不聲稱OEM精確格數
- **真實引擎與顯示軸**：保留一個主區間headroom，例如engine max9000→axis10000、12000→14000。numbers／ticks／fill共用顯示軸；紅線與SHIFT仍取實際Coordinator門檻，overrange只clamp圖形。照片的無數字尾段作排版參考，不作OEM10k校準證據
- **固定字標**：mph在km/h上方，VAC在BOOST上方；兩對字標各自共用左緣；固定DOM文字皆保留，同琥珀RGB只切換選中opacity。正壓／真實零選BOOST，負壓選VAC，缺值／stale兩者皆暗
- **BOOST資料與單色顯示**：原始JSON `Boost`依官方PSI定義，嚴格區分signed／zero／missing；不使用會補0／截負值的aliases掩蓋缺值，不猜Pa或量級。正負共用abs(bar)映射：0–1佔75%、1–2佔25%，固定0／0.5／1／2刻度；等價PSI／kPa、部分cell填色、負號與微小負值均保留。bar／ticks／數值paint不因正負改色或glow
- **生命週期與誠實狀態**：timestamp須前進，1500ms不變即清空並顯示SIGNAL LOST，涵蓋Coordinator平滑重播；零timestamp standby不假裝live。支援metric／imperial、R=0／N=11、缺值、錯誤、重連、resize、config／animate／destroy
- **既有要求保留**：右側燃油已改BOOST，底框AP1／REV ARC與動態RPM文字已移除；未修改LFA、backend、共用協定或相依套件

### Pre-Commit & Local Verification

- **Frontend Tests:** `pnpm -C frontend test --maxWorkers=2` →160 files passed、1 skipped；1202 tests passed、1 skipped；AP1樣式97 cases
- **Frontend Build:** `pnpm -C frontend build:web-hud` →pass；HUD runtime包含、tests排除
- **Syntax / Whitespace / Body:** `node --check`、`git diff --check`、repository PR body validator通過
- **Actual Browser:** [run37293328206](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37293328206)／[artifact11337143995](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37293328206/artifacts/11337143995)，Chrome154.0.8037.57、Linux、sandbox啟用；93張current renderer圖、28組RPM＋4組最大glow、28組固定字標情境、38筆launcher樣本。renderer errors、launcher errors／missing及32組RPM碰撞列表皆空
- **RPM Geometry / Earlier Pixel Review:** 實測最小normal gap11.999977、扣stroke後9.999977設計單位；最大glow的1.2px blur三倍預算後6.400，僅作幾何預算，並非光暈有限邊界的像素證明。先前上移修正的四張最大glow圖已實際查看，本輪同一RPM幾何的四組自動檢查也通過，拱頂與兩端未見裁切或外溢。compact DPR1最小cell width1.725px、gap0.973px，最小數字／band normal gap8.825設計單位；未見大面積moire或合併細格，限所檢視靜態尺寸
- **Scale / Headroom:** 實際9000引擎max點亮108/120格，10000 headroom與11000 overrange皆滿條；12000引擎max採14000顯示axis，紅線仍依實際遙測
- **Scoped Pixel Comparison:** 相對4f，只排除四個新／舊字標bounds聯集及1 device pixel邊緣。compact DPR1為0／58,566、default DPR2為0／478,388、compact DPR2為0／233,858；default DPR1有69／119,277差異，位於左上RPM區bbox[741,486,883,554)。未擴張遮罩，原因未證明；保留完整記錄，不宣稱全圖相同。RPM幾何／fascia source bytes未變，詳見`left-alignment-preservation.json`
- **Source CI:** `3e00409`的[Visual37293328206](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37293328206)及[Packaging37293328721](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37293328721)成功；[CI37293328132](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37293328132)於10:01 UTC仍執行中。最終文件head CI另待發布後確認，不宣稱全綠
- **Fixture Scope:** launcher／Coordinator為實際程式，HTTP config／style discovery與WebSocket為fixture。三筆JSON源自合成324-byte封包經production parser／serde_json產生，browser測試再餵入或調整欄位；這次visual job沒有執行真實UDP／遊戲或後端parser
- **Local Browser Limitation:** 本地Chromium被UNIX socket EPERM阻擋（含approved escalation），雲端瀏覽器到本地fixture遭ERR_BLOCKED_BY_CLIENT；採正常GitHub Actions sandbox渲染，沒有迴避限制
- **Native Platform:** Windows透明overlay、滑鼠穿透、真實遊戲、面板／動態moire及遊戲安全區尚未驗收；右下槽位預期取代原生儀表。Packaging成功不代表這些驗收
- **Historical Evidence:** 先前雙字標的default DPR1外框邊緣64像素差異仍保留於`dual-label-preservation.json`，未掩蓋；`before-after.png`是更早燃油版本的弧度對照。這些歷史圖片不作目前RPM布局

### Living Changelog & Review Iterations

- 2026-10-05（Bagley as Codex）：依最後要求讓mph／km/h與VAC／BOOST各自靠左對齊；實際default／compact DPR1／2等28組字標情境的左緣與screen anchor精確相等。更新同一預覽identity，保留69個範圍外像素差異並等待最終head驗收

- 2026-10-05（Bagley as Codex）：依最新要求讓整組RPM沿共同法線向外24，保留固定外框及非RPM區；補上crest／end淨空和最大glow測試，實際Chrome通過，更新目前預覽及明確標示932→04b的歷史比較
- 2026-10-05（Bagley as Codex）：重新查看OEM照片，將RPM數字置下、密度60→120、加入主／半步刻度及顯示headroom；120是HUD適配，未聲稱原廠格數
- 2026-10-05（Bagley as Codex）：按使用者要求把VAC置上、BOOST置下並置中，mph／km/h保持上下固定字標；前版已驗證並解除draft，本輪維持Ready
- 2026-10-05（Bagley as Codex）：單色abs BOOST取代已廢棄深淺VAC方案；保留signed數字，補正負同paint與單位／缺值回歸
- 2026-10-05（Bagley as Codex）：原創fascia、共享normal／等弧長修正、燃油改BOOST及底框文字移除，歷史證據保留

### Related Issues / References

- [Honda 1999.04 Fact Book / Interior](https://www.honda.co.jp/factbook/auto/s2000/199904/046.html)與[實際查看的官方座艙圖](https://www.honda.co.jp/factbook/auto/s2000/199904/image/037_001.gif)
- [Honda booklet掃描p27](https://www.s2000.club/OM/S2Kbooklet1999.pdf)（保存站年份標記不是原件出版日期的獨立證明）
- [Motor Magazine AP1點亮照片](https://web.motormagazine.co.jp/_ct/17065339/album/16782798/image/16818352)／[1280×544原圖](https://d1uzk9o9cg136f.cloudfront.net/f/16783018/rc/2019/04/09/14f33f22cadf21d6da43ec05ae6def9f90dc3a65.jpg)（全部cells點亮、0km/h展示模式，非行駛遙測或OEM校準文件）
- [2000–03 AP1未通電OEM拆車儀表](https://www.ebay.com/itm/334214668079)／[1200×900原圖](https://i.ebayimg.com/images/g/GNwAAOSwlVphKPmS/s-l1200.jpg)（位置佐證，非精確1999日本年份證據）
- [Forza Horizon 6 Data Out官方文件](https://support.forza.net/hc/en-us/articles/51744149102611-Forza-Horizon-6-Data-Out-Documentation)
- 原型與完整契約：`docs/hud/ap1-rev-arc.md`；本輪：`docs/assets/ap1-rev-arc/left-alignment-revision-evidence.json`、`review-evidence.json`、`left-alignment-preservation.json`；RPM原型與上移歷史：`rpm-reference-revision-evidence.json`、`rpm-layout-preservation.json`
- 原創程式、七段字形、Inkscape1.4 fascia依repository MIT license；ImageMagick只作匯出／無損壓縮／實際截圖排列。未封裝OEM照片、Logo或字型，沒有Honda官方背書
- 單色LCD／TN是使用者提供的設計背景，沒有將它寫成本輪外部查證的硬體結論
- Skills：`halfmoon-design-system`、`telemetry-udp-protocol`、`pr-author-maintainer`

---
Author / Maintainer: Bagley as Codex
