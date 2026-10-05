### Summary of Changes

新增 `lfa_center_ring` HUD，以 **2012 Lexus LFA 車主手冊的 Normal display** 為原型：厚金屬中央錶環、黑底白字、0–10 環形轉速刻度、上方數位速度與中央檔位，搭配克制的窄側翼。

設計方向是精密、簡潔的量產超跑儀表，適合喜歡真實車輛儀表、手排換檔與山路巡航，希望降低賽車資料面板資訊密度的玩家。Normal 指手冊的主儀表版面，不宣稱遊戲有原車駕駛模式。

### Side-Gauge Revision Status

依使用者最新回饋，只重建兩側子錶。已補看 Lexus UK 正面／斜角實車照片、MotorTrend 2012 近照及 C Ling Fan 攝影作品，改回冷卻液／油溫／燃油／油壓四個曲線量尺；沒有資料的溫度與壓力顯示 N/A，只有 canonical fuel_ratio 驅動燃油條。已核准中央 PNG／SVG、CSS、刻度／指針繪圖與讀數位置保留不變。**本次新側錶的遠端截圖與中央圓形區域像素比對待完成；以下是上一版中央核准基準，不代表側錶修訂已通過。**

來源：Lexus UK T_6820 照片本身標示 Issued 10/2009、中央 AUTO；MotorTrend 2012 近照中央是 SPORT。只採用一致的側錶結構，2012 年式範圍仍以官方 OM77006U 為準。詳見 docs/hud/lfa-center-ring.md。

### Actual Renderer Previews

以下為 source head `93085acd2ff238650dd9e2ac6c552e224ebdd060` 的真正 Chrome renderer 截圖。使用合成遙測 fixture，**不是 Forza 遊戲截圖，也不是效果示意圖**。

**公制儀表細節**

![LFA Center Ring 實際公制儀表截圖](RAW_PREFIX/docs/assets/lfa-center-ring/metric-detail.png)

**換檔警示、倒車、空檔、部分資料、斷線與 16,000 rpm 量尺**

![LFA Center Ring 六種真實 renderer 狀態](RAW_PREFIX/docs/assets/lfa-center-ring/state-contact-sheet.png)

**1280×720 完整 viewport**

![LFA Center Ring 720p 右下角完整構圖](RAW_PREFIX/docs/assets/lfa-center-ring/metric-720p.png)

狀態拼圖僅縮小／排列實際截圖；未重新繪製儀表。完整 viewport 與 detail 圖只移除 metadata 並最佳化 PNG 壓縮。

### Key Modifications

- **原創外觀**：Inkscape 1.4 製作 SVG 並匯出透明金屬環 PNG，ImageMagick 7 最佳化；靜態材質、Canvas 刻度／指針與 DOM 讀數分層
- **誠實遙測**：公英制速度、R／N／1–10 檔位、RPM 與 coordinator 紅線；側面保留四子錶原型，只有燃油讀取 canonical fuel_ratio，冷卻液／機油溫度／壓力清楚標記 N/A
- **跨車種量尺**：刻度始終代表真實 `×1000 r/min`；高轉速車重新標示量尺，不把其他引擎硬套為 LFA 轉速
- **資料失效**：以 timestamp 變化辨識新封包，避免 coordinator RAF 重播延長過期讀數；缺失、錯誤、暫停與斷線清空顯示，新封包可恢復
- **生命週期**：沿用 HUDCore 設定、縮放與顯隱；DISPLAY CHECK 不產生虛構車速／檔位；destroy／pagehide 取消 RAF 與本樣式監聽器
- **整合範圍**：新增單一 dropdown 顯示名稱；未修改 shared 協定、HUDCore、coordinator 或後端
- **可維護性**：29 個新樣式行為測試、可重現 browser fixtures、實際 launcher audit，以及原型／來源／限制文件

### Pre-Commit & Local Verification

- **Frontend Tests:** `pnpm -C frontend test`，156 files passed／1 skipped；1,134 tests passed／1 skipped，含 29 個 LFA 行為測試
- **Frontend Build:** `pnpm -C frontend run build:web-hud` 通過；新 HUD 檔案已打包，tests 與本 PR body 不隨產品散布
- **Syntax / Whitespace:** 新增 JS 的 `node --check` 與 `git diff --check` 通過
- **Remote Browser Gate:** [GitHub Actions run 37256008636](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37256008636) 通過；artifact ID `11322413248`；Chrome `154.0.8037.57`，`chromiumSandbox: true`
- **Renderer Fixtures:** 1280×720、1920×1080、2560×1440、1920×1080 DPR2 全部通過；涵蓋 init/config、公英制、R／N、紅線、高轉速、缺失／非法值、錯誤、暫停、重播 timestamp 逾時、重連、顯隱、resize、動畫與 destroy；四組均 `errors: []`
- **Real Launcher / Coordinator:** 動態探索、raw telemetry、smoothing 持續重播後逾時、帶負號倒車重連、公英制、720p、隱藏恢復、樣式重載與 destroy 通過；`errors: []`、`missing: []`
- **Pixel Review:** 已實際檢視主要狀態及 720p 圖片；修正狀態框碰到刻度 1、高轉速長標籤碰到主刻度，以及 fixture UTF-8 caption 問題，第二輪截圖確認消除
- **Evidence:** `docs/assets/lfa-center-ring/evidence.json` 與 `launcher-report.json` 為 artifact 原始 JSON；`verification.json` 記錄來源與 SHA-256

本機曾受 Chromium UNIX socket EPERM 與雲端瀏覽器 localhost 存取限制，因此 browser 驗證使用正常 GitHub Actions runner，沒有停用 sandbox。以上不等同 Windows 原生 overlay、click-through、置頂或 Forza 實機驗收，這些仍未驗證。

預設約 420 × 277.5 CSS px、右下 30 px 邊界，**假設取代遊戲原生右下儀表**；仍需實機檢查右側提示、字幕與自訂 HUD 比例。

### Living Changelog & Review Iterations

- 2026-10-05（Bagley as Codex）：完成官方 Normal display 像素核對、原創金屬環資產與獨立 HUD 實作
- 2026-10-05（Bagley as Codex）：加入重播 timestamp 逾時、帶正負號倒車速度、缺失／錯誤處理與生命週期測試
- 2026-10-05（Bagley as Codex）：更新至 main `a9335b158e658faa86bcfcbe4d36beb602f6c9c7`，完整前端測試與 web HUD build 通過
- 2026-10-05（Bagley as Codex）：根據實際遠端截圖修正刻度／狀態框間距；source head `93085acd2ff238650dd9e2ac6c552e224ebdd060` 的兩項 browser gate 通過並完成像素複核

### Related Issues / References

- 使用者要求：每個新 HUD 獨立 PR，說明原型、設計方向、整體風格、適合玩家並內嵌實際 PNG 預覽
- [Lexus USA：2012 Lexus LFA 官方圖庫](https://pressroom.lexus.com/album/2012-lexus-lfa/)
- [官方 OM77006U：印刷第 116 頁／PDF 第 118 頁](https://assets.sia.toyota.com/publications/en/om-s/OM77006U/pdf/OM77006U.pdf#page=118)，已實際檢視 Normal display 圖片。圖庫縮圖於開發環境回傳 AccessDenied，未冒稱已看見其中照片
- 詳細文件：`docs/hud/lfa-center-ring.md`
- **授權**：所有新增圖形、CSS 與程式為原創，沿用 repository MIT license；不散布 OEM 圖片、商標、字體或貼圖。Lexus／LFA 名稱僅用於原型辨識，不代表官方合作
- 採用技能：`halfmoon-design-system`、`telemetry-udp-protocol`、`pr-author-maintainer`

---
Author / Maintainer: Bagley as Codex
