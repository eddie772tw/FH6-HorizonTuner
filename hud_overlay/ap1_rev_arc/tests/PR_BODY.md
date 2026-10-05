### Summary of Changes

新增 `ap1_rev_arc` HUD 原型，以 **1999 Honda S2000 AP1 日本上市初期的琥珀數位儀表**為明確研究對象，回應先從具有辨識度的真實車款儀表發展新樣式的方向。

整體採低寬煙燻黑儀表罩、密集琥珀 LCD 分段、上拱轉速帶與中央大型速度；左下新增適合遊戲的低調檔位，右下呈現有實際資料的燃油。目標是喜歡 1990 年代末 Honda/JDM、高轉自然進氣與簡潔道路駕駛 HUD 的玩家。

本 PR 為可執行原型。本地程式 gate 與 sandbox 啟用的遠端 Chromium 視覺／實際 launcher 檢查已通過，且已獨立目視實際截圖；Windows 原生與遊戲內驗收仍保留。完整專案 CI 在此更新時仍執行中，請另看 PR checks。

### Key Modifications

- **獨立 HUD**：新增 HTML/CSS、原創分段數字／RPM renderer、canonical telemetry model 與 HUDCore controller。套用 `ap1_rev_arc` registry ID 和動態掃描，不改 backend 或共用生命週期
- **設計與玩家**：AP1 的弧形轉速、琥珀數字與低矮外殼有別於既有 VFD 收音機式介面；保留原型可辨識元素，不加入沒有來源的水溫、油溫或里程表
- **真實資料語意**：速度使用 canonical 單位並顯示倒車速度絕對值；0=R、11=N；RPM 刻度支援不同車款與 `max_rpm` alias；紅線使用 Coordinator 的共用門檻；缺少燃油時顯示 `--`
- **斷線／清理**：以遙測 timestamp 是否前進判定鮮度，避免 Coordinator smoothing 重播舊資料使儀表永遠維持假即時狀態；處理 partial/error/pause/reconnect、config、elements、純裝飾 sweep 與 destroy 清理
- **原創美術**：Inkscape 1.4 可編輯 fascia source 與實際透明 PNG export，經 ImageMagick 最佳化；未新增產品第三方依賴，未複製 OEM 圖像或字型
- **文件與驗證**：`docs/hud/ap1-rev-arc.md` 說明研究來源、改編、資料契約與限制；34 個 style-owned Vitest 案例；portable Chromium runner 與手動 fixture 位於 `tests/visual`，不進入靜態 HUD 發行包；新增單一選單名稱
- **視覺 artifact**：專屬 GitHub Actions workflow 使用隔離 Playwright 測試工具，輸出多解析度、DPR2、單位、R/N、紅線、缺值、斷線與重連的 PNG/JSON，不停用 Chromium sandbox。另由維護者加入真實 launcher＋Coordinator audit

### Pre-Commit & Local Verification

驗證基底：`a9335b158e658faa86bcfcbe4d36beb602f6c9c7`；已 frozen-lockfile 安裝並在此固定 main 版本重新執行 gate。

- **Frontend Tests:** `pnpm -C frontend test` → 157 files passed、1 skipped；1139 tests passed、1 skipped；其中新樣式 34 cases
- **Frontend Build:** `pnpm -C frontend build:web-hud` → pass；確認 dist 包含新 HUD 且排除 `tests`
- **JavaScript Syntax:** `node --check` model、renderer、controller 與 visual runner → pass
- **Whitespace:** `git diff --check` → pass
- **Original Asset:** Inkscape 匯出 1440×600 RGBA PNG，47,491 bytes；ImageMagick 驗證角落 alpha=0，已目視原創外殼輸出
- **HUD Browser Review:** Linux Chrome 154.0.8037.57、Chromium sandbox 啟用，視覺 fixture 與實際 launcher／Coordinator job pass。head `8b783d080511ad5b49939f7f6603bd5d86e9a659`；[run 37255610983](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37255610983)／[artifact 11322980570](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37255610983/artifacts/11322980570)。三解析度、DPR2、十種狀態、smoothing 斷線／重連、config、resize、reload、destroy 已自動驗證；DPR2、狀態集、720p／1440p 與 host 重連的實際像素已目視，未發現裁切或文字重疊
- **Local Browser Limitation:** 本地程序曾因 UNIX socket `EPERM` 受阻，CUA 本地 origin 為 `ERR_BLOCKED_BY_CLIENT`；保留此歷史限制，透過正常 CI 驗證，沒有繞過限制或停用 sandbox
- **General CI:** 在此紀錄更新時仍執行中；視覺 job 成功不代表完整專案 CI 已完成
- **Native Platform:** Windows 原生 overlay、滑鼠穿透、Forza 遊戲畫面與右下安全區未驗收。此 HUD 預期取代原生右下角儀表，同時啟用可能重疊
- **Backend / Python:** 未修改，不以不相關測試取代前端 gate

### Living Changelog & Review Iterations

- 2026-10-05（Bagley as Codex）：以官方 1999 Fact Book 研究原型並實際查看座艙圖片；完成原創外殼、遙測與生命週期
- 2026-10-05（Bagley as Codex）：依獨立檢查補上 timestamp replay 斷線偵測、負值倒車、max_rpm、null payload/config、legacy unit fallback；擴充純行為測試
- 2026-10-05（Bagley as Codex）：本地 frontend gate 通過；正常 GitHub Actions Chrome 154 視覺與實際 launcher 檢查通過並完成獨立像素檢查，收錄三張精選實際 PNG 與完整 JSON 證據；原生平台仍待驗收

### Related Issues / References

- [Honda 1999.04 S2000 Fact Book / Interior](https://www.honda.co.jp/factbook/auto/s2000/199904/046.html)
- [實際檢視的官方座艙圖](https://www.honda.co.jp/factbook/auto/s2000/199904/image/037_001.gif)
- [Honda S2000 99 官方新聞資料](https://hondanews.eu/eu/fi/cars/media/pressreleases/34329/honda-s2000-99)（文字索引可讀；直接擷取 502，未以此聲稱已目視額外照片）
- [原型與資料契約](../../docs/hud/ap1-rev-arc.md)
- 實際截圖：`docs/assets/ap1-rev-arc/detail-metric.png`、`states.png`、`metric-1280x720.png`；來源／版本／檢視記錄：`review-evidence.json`
- 原創程式與圖形依 repository MIT license；參考照片僅供研究，未封裝。Honda 商標與原廠圖像所有權仍屬原權利人；本樣式無官方合作／授權背書
- 採用技能：`halfmoon-design-system`、`telemetry-udp-protocol`、`pr-author-maintainer`

---
Author / Maintainer: Bagley as Codex
