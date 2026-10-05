### Summary of Changes

新增 `ap1_rev_arc` HUD，以 **1999 Honda S2000 AP1 日本上市初期儀表**為視覺原型。採低寬煙燻黑外殼、琥珀 LCD、上拱分段 RPM 與中央大型速度，面向喜歡 1990 年代末 Honda/JDM、高轉自然進氣與簡潔道路 HUD 的玩家。

依使用者指出的「上方弧表和外框弧度不一致」完成共享曲線修訂。新的遠端 renderer／實際 launcher 檢查與獨立像素複查已通過，實際預覽已替換，**目前等待使用者 review，未宣稱使用者已核准整個樣式**。一般 CI 在此更新時仍執行中，請另看 PR checks；Windows／真實遊戲驗收仍保留。

### Key Modifications

- **本輪弧度修正**：原 RPM 拋物線與非對稱 Bézier 框線互不相依，取樣間距約18.9–41.9設計單位。現由 `arc-geometry.js` 同時產生色帶兩緣、刻度中心與框線，共用 unit normal offsets。色帶中心線等弧長分段，避免兩端過密；上緣至內框間距固定36，完整弧段一致
- **有限範圍**：速度、檔位、燃油及其他讀值 anchor、720×300容器、遙測和生命週期保持不變；其餘區域暫保留，不把「其他姑且沒問題」視為最終核准
- **原創美術**：`tests/visual/export-fascia.mjs` 從相同幾何重建 SVG，再使用 Inkscape 1.4 匯出透明 PNG／ImageMagick 最佳化。沒有 OEM 圖像、Logo 或新增字型，沒有產品第三方相依新增
- **資料語意**：canonical speed 支援英制／公制與負值倒車；0=R、11=N；RPM 適應 `maxRpm`／`max_rpm`，紅線使用 Coordinator 門檻；燃油缺值顯示 `--`，不加入無來源的水溫／油溫／里程
- **生命週期**：timestamp 停止前進時清空舊值，即使 Coordinator 持續 RAF replay 也能辨識斷線；處理 partial/error/pause/reconnect、config、elements、decorative sweep 和 destroy
- **測試語意修正**：compact 檢查原本錯把 text ink bbox 當成 anchor invariant。新 CI 記錄完整矩形／字型／座標，精確驗證 SVG anchors、geometry、font、local transforms，並檢查 screen anchors 與容納。實測最大 anchor residual 0.006503 device pixel；gear ink-y 正規化差0.004431／0.006336，證明先前失敗不是讀值 anchor 移動
- **實際證據**：default／70% compact、DPR1／DPR2、十種狀態、同 viewport 前後對照及 real launcher audit；不以生成 mockup 代替真實 renderer 截圖

### Pre-Commit & Local Verification

- **Frontend Tests:** `pnpm -C frontend test` →158 files passed、1 skipped；1144 tests passed、1 skipped，其中樣式39 cases
- **Frontend Build:** `pnpm -C frontend build:web-hud` →pass；dist 包含 shared geometry，排除 style tests
- **JavaScript / Whitespace:** `node --check`、`git diff --check` →pass；SVG source regeneration deterministic
- **Actual Browser Review:** sandbox 啟用的 GitHub Actions Linux Chrome；head `662d93432243ff0d18d758651ae208436722a24a`。[run 37258259085](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37258259085)／[artifact 11323397245](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37258259085/artifacts/11323397245) 的 renderer＋launcher PASS，errors／missing 為空
- **Pixel Inspection:** default／compact DPR2、十種狀態、720p與修正前後均已獨立目視；色帶與框線穿過兩側 shoulder 時保持一致，端點文字未裁切。圖像來自原 artifact，只作裁切、排列和無損壓縮；hero／compact／full720p／state-sheet 重壓縮 AE=0
- **General CI / User Review:** 目前一般 CI 仍待完成；技術檢查不代表使用者已核准
- **Local Browser Limitation:** 本地程序 UNIX socket `EPERM`、CUA 本地 origin `ERR_BLOCKED_BY_CLIENT` 保留為歷史限制；透過正常遠端 CI 驗證，沒有停用 sandbox 或繞過限制
- **Native Platform:** Windows overlay、滑鼠穿透、真實 Forza 畫面及遊戲安全區未驗收。預期取代原生右下角儀表，同時啟用可能重疊
- **Backend / Python:** 未修改，不以不相關 gate 取代前端測試

### Living Changelog & Review Iterations

- 2026-10-05（Bagley as Codex）：查看 Honda 官方1999座艙圖片，完成原創 fascia 與 telemetry／lifecycle
- 2026-10-05（Bagley as Codex）：補 timestamp replay、負值倒車、max_rpm、null訊息、legacy單位與行為測試
- 2026-10-05（Bagley as Codex）：使用者指出弧表與外框失真。先前像素檢查漏掉此結構問題；改用共享法線曲線與等弧長分段，保留其他讀值位置
- 2026-10-05（Bagley as Codex）：修正 compact 的 ink-bbox 測試語意；新遠端實測建立 anchor 保持的證據，更新實際預覽與前後對照，待使用者 review

### Related Issues / References

- [Honda 1999.04 Fact Book / Interior](https://www.honda.co.jp/factbook/auto/s2000/199904/046.html)
- [實際檢視的官方座艙圖](https://www.honda.co.jp/factbook/auto/s2000/199904/image/037_001.gif)
- [Honda S2000 99 新聞資料](https://hondanews.eu/eu/fi/cars/media/pressreleases/34329/honda-s2000-99)（索引文字可讀；直接502，未以此聲稱檢視額外照片）
- 文件：`docs/hud/ap1-rev-arc.md`
- 當前實際預覽：`docs/assets/ap1-rev-arc/detail-metric.png`、`detail-compact.png`、`states.png`、`metric-1280x720.png`、`before-after.png`
- 測量與來源：同目錄的 `visual-evidence.json`、`launcher/host-audit.json`、`review-evidence.json`、`arc-revision-evidence.json`
- 原創程式與圖形依 repository MIT license；Honda 圖片僅供研究，未封裝，無官方合作或背書
- 採用技能：`halfmoon-design-system`、`telemetry-udp-protocol`、`pr-author-maintainer`

---
Author / Maintainer: Bagley as Codex
