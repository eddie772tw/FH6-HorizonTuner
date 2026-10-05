### Summary of Changes

新增 `lfa_center_ring` HUD，以 **2012 Lexus LFA 車主手冊的 Normal display** 為原型：厚金屬中央錶環、黑底白字、0–10 轉速刻度、上方數位速度與中央檔位。

依使用者最新回饋，這次**只重建兩側子錶**。已核准中央的原始 PNG／SVG、中央 CSS、讀數位置與刻度／指針繪圖保留；移除過大的踏板百分比卡片，改為實車的四個弧形子錶。側錶已完成實作、遠端瀏覽器檢查與獨立像素檢視，**等待使用者視覺回饋，尚未獲使用者核准**。

整體風格為精密、克制的量產超跑儀表，適合喜歡真實車輛儀表、手排換檔與山路巡航，希望降低賽車資料面板資訊密度的玩家。Normal 指手冊的主錶置中版面，不宣稱遊戲有原車駕駛模式。

### Actual Renderer Previews

以下為 source head `ad4458ec975678055a0b8555e3b0c99f53191aba` 的真正 Chrome renderer 截圖。使用合成遙測 fixture，**不是 Forza 遊戲截圖，也不是效果示意圖**。

**新版四弧側錶與保留的中央錶面**

![LFA Center Ring 側錶修訂後的實際公制儀表截圖](RAW_PREFIX/docs/assets/lfa-center-ring/metric-detail.png)

**換檔警示、倒車、空檔、部分資料、斷線與高轉速**

![LFA Center Ring 側錶修訂後的六種 renderer 狀態](RAW_PREFIX/docs/assets/lfa-center-ring/state-contact-sheet.png)

**1280×720 完整 viewport**

![LFA Center Ring 側錶修訂後的 720p 右下角構圖](RAW_PREFIX/docs/assets/lfa-center-ring/metric-720p.png)

狀態拼圖僅縮小／排列實際截圖，未重新繪製儀表；其他預覽只移除 metadata 並最佳化 PNG 壓縮。另保留燃油 0%／100% 的實際截圖供驗證。

### Key Modifications

- **以更多實車照片重建側錶**：Lexus UK 官方正面／斜角照、MotorTrend 2012 近照與 C Ling Fan 攝影作品都可見四個上下分區、沿外緣彎曲的量尺。新側面採細曲線、短內向刻度、通用手繪圖示與中段溫度／時鐘空隙，移除舊的直壁亮框、巨大百分比與水平條
- **量測誠實性**：左下 `fuel_ratio` 驅動燃油弧條與百分比，保留真實 0%／100%。冷卻液、機油溫度與油壓沒有可靠資料，明確顯示 N/A 且沒有讀值填條；環境溫度／車輛時鐘顯示空值，不以胎溫或踏板替代感測器
- **保留已核准中央**：中央 PNG／SVG 雜湊、中央 CSS、讀數位置、`drawScale()` 與 `drawNeedle()` 保持一致。唯一必要的邊界合成為半徑 180 的外層裁切，隱藏原圖舊側翼；新側面 PNG 在該中央區內透明
- **獨立原創圖層**：新增 Inkscape 匯出的 `side-crescents.svg`／PNG 與側錶 CSS；沒有匯入 OEM 貼圖、照片或商標，未改 HUDCore、coordinator、UDP 協定或後端
- **生命週期與失效保護**：沿用 timestamp 變化檢測，smoothing 重播不延長資料有效期；燃油隨缺失、錯誤、暫停與斷線顯示 N/A；新封包恢復。既有公英制、R／N、紅線、resize、顯隱、動畫與 destroy 契約保留

### Pre-Commit & Local Verification

- **Frontend Tests:** `pnpm -C frontend test`，156 files passed／1 skipped；**1,134 tests passed／1 skipped**，含 29 個 LFA 行為測試
- **Frontend Build:** `pnpm -C frontend run build:web-hud` 通過；新側錶 CSS／PNG／SVG 已打包，tests 與本 PR body 不隨產品散布
- **Syntax / Whitespace:** JS `node --check`、repository PR-body validator 與 `git diff --check` 通過
- **Remote Browser Gate:** [run 37258540232](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37258540232) 通過；head `ad4458ec975678055a0b8555e3b0c99f53191aba`、artifact `11323881665`；Chrome `154.0.8037.57`、`chromiumSandbox: true`
- **Renderer Fixtures:** 720p／1080p／1440p／1080p DPR2 通過，新增 fuel 0／50／100／缺失／非法值與 unsupported N/A 檢查；保留公英制、R／N、紅線、缺失／錯誤／暫停、重播 timestamp 逾時、重連、顯隱、resize、動畫、destroy，四組 `errors: []`
- **Real Launcher / Coordinator:** 動態探索、raw telemetry、smoothing 失效、倒車重連、公英制、720p、隱藏恢復、樣式重載與 destroy 通過；新增 raw Fuel → 68% 與 stale → N/A 斷言；`errors: []`、`missing: []`
- **Pixel Review:** 已實際檢視新側錶的主要狀態、燃油端點與 720p／1080p／1440p 圖片，未觀察到文字重疊或裁切
- **中央保留證據**：八張同狀態 DPR2 detail，以 `(420,277.5)`／半徑 **267 px** 的完整核准中央圓逐 RGBA 比較，均 AE=0；採像素中心的幾何判定，沒有容差、羽化或縮小半徑。最近改變的像素位於圓外 267.543 px，RGB 差 1。720p／1080p DPR1 全圖仍有 466／478 個輕微色值差異，成因未確定；不宣稱所有解析度逐位元相同。原中央素材、樣式與幾何保持一致
- **Evidence:** `docs/assets/lfa-center-ring/evidence.json`、`launcher-report.json` 為原始 artifact JSON；`central-preservation.json` 保留完整比較結果，`verification.json` 記錄來源及 SHA-256

本機 Chromium／localhost 存取受環境限制，因此 browser 驗證使用正常 GitHub Actions runner，沒有停用 sandbox。以上不等同 Windows 原生 overlay、click-through、置頂或 Forza 實機驗收，這些仍未驗證。

預設約 420 × 277.5 CSS px、右下 30 px 邊界，**假設取代遊戲原生右下儀表**；仍需實機檢查提示、字幕與自訂 HUD 比例。

### Living Changelog & Review Iterations

- 2026-10-05（Bagley as Codex）：完成官方 Normal display 研究、原創金屬環及初版 renderer
- 2026-10-05（Bagley as Codex）：依第一輪實際截圖修正中央狀態框與刻度間距，中央獲使用者肯定
- 2026-10-05（Bagley as Codex）：依使用者指定只修兩側；補看多張實車照片，重建四弧量尺，加入誠實 N/A 與 canonical 燃油條
- 2026-10-05（Bagley as Codex）：側錶修訂的本機 gate、遠端 renderer／launcher gate 與獨立像素檢視完成，等待使用者評閱新版側錶

### Related Issues / References

- 使用者要求：每個 HUD 獨立 PR，說明原型、方向、風格及適合玩家，並內嵌實際 PNG 預覽；本次只修改 LFA 左右子錶
- [2012 官方 OM77006U，印刷第 116 頁／PDF 第 118 頁](https://assets.sia.toyota.com/publications/en/om-s/OM77006U/pdf/OM77006U.pdf#page=118)：2012 年式及 Normal display 範圍
- [Lexus UK 官方內裝圖庫](https://media.lexus.co.uk/images/lfa-interior/)／[T_6820 正面照](https://media.lexus.co.uk/wp-content/uploads/sites/3/2011/10/T_6820-scaled.jpg)／[T_6833 斜角近照](https://media.lexus.co.uk/wp-content/uploads/sites/3/2011/10/T_6833-scaled.jpg)／[DSC_4040 實車內裝](https://media.lexus.co.uk/wp-content/uploads/sites/3/2012/12/DSC_4040-scaled.jpg)
- [MotorTrend 2012 近照](https://www.motortrend.com/uploads/sites/5/2012/07/2012-Lexus-LFA-Tach.jpg)／[C Ling Fan 實車攝影與來源](https://commons.wikimedia.org/wiki/File:Lexus_LFA_speedometer_view_01.jpg)
- **模式／年份區分**：T_6820 本身標示 Issued 10/2009、中央 AUTO，不能當作 2012 年式證據；MotorTrend 近照中央是 SPORT 白底。本次只採一致的側錶結構，保留使用者已核准的中央黑底與金屬環
- **授權**：新增圖形與程式為原創，沿用 repository MIT。來源照片僅供研究，未打包／裁切散布／描圖。Lexus／LFA 名稱僅用於原型辨識，不代表官方合作
- 詳細文件：`docs/hud/lfa-center-ring.md`；採用技能：`halfmoon-design-system`、`telemetry-udp-protocol`、`pr-author-maintainer`

---
Author / Maintainer: Bagley as Codex
