# LFA Center Ring HUD

作者：Bagley as Codex。樣式 ID：`lfa_center_ring`。

## 原型、設計方向與適合玩家

以 **2012 Lexus LFA、車主手冊的 Normal display（非 Menu display）** 為明確原型。此處的 Normal 是儀表版面名稱，不宣稱遊戲提供原車 NORMAL／SPORT 駕駛模式。本設計保留厚金屬中央錶環、黑底白字、順時針 0–10 轉速刻度、上方數位速度與中央檔位，以及兩側克制的窄翼資訊。

適合喜歡真實量產超跑儀表、手排換檔與山路巡航、想減少一般賽車電腦欄位密度的玩家。不是既有 Mustang S650 的換色，也不是 GT3 賽車資料面板。金屬環與側翼由原創 SVG 製作，使用 **Inkscape 1.4** 匯出透明 PNG，再以 **ImageMagick 7.1.1-43** 無損移除 metadata／最佳化壓縮；靜態材質走 PNG，轉速刻度／指針走 Canvas，文字走 DOM。

## 官方視覺來源與授權

- [Lexus USA：2012 Lexus LFA 官方圖庫](https://pressroom.lexus.com/album/2012-lexus-lfa/)：核對車型與年份；開發時圖庫的 S3 縮圖回傳 AccessDenied，因此沒有把未看見的照片列為已驗證構圖。
- [Toyota／Lexus 官方車主手冊 OM77006U](https://assets.sia.toyota.com/publications/en/om-s/OM77006U/pdf/OM77006U.pdf#page=118)：**印刷第 116 頁，PDF 第 118 頁**，已下載並實際檢視 Normal display 與 Menu display 的像素。Normal 圖可辨識金屬大環、0–10 tachometer、速度位於檔位上方、窄側翼與原車輔助儀表。此為本次可驗證的主要視覺來源。

沒有打包、裁切、描圖或重新散布官方照片、手冊圖片、商標、OEM 字體或原車面板貼圖。Lexus／LFA 名稱僅用於原型辨識，不代表合作或官方產品。`assets/center-ring.svg`／`center-ring.png`、CSS 與程式均為本 PR 原創內容，沿用 repository 的 MIT license。

## 遙測誠實性

| 顯示 | 資料 | 缺失／異常處理 |
| --- | --- | --- |
| 速度 | canonical `speed_kmh`／`speed_mph`；具 `displayUnits.speed` 才可使用 `speed` | 有限數值取絕對值以支援倒車；超過三位數容量 999 顯示 `—`，不截斷或回繞 |
| 檔位 | `gear` | 0＝R、11＝N、1–10 保留；缺失／非法值＝`—` |
| 轉速 | `rpm`、`maxRpm`／`max_rpm` | 缺失指針隱藏；不從速度或聲音推算 |
| 紅線／SHIFT | 優先 `payload.redlineRpm`，其次 canonical `data.redlineRpm`，並需有效最大轉速 | 缺失時無紅線／SHIFT；不硬套 LFA 原車 9,000 rpm |
| 左／右側翼 | canonical `throttle`／`brake`，0–1 | 明確標示 THROTTLE／BRAKE／INPUT；缺失＝`—`，條帶歸空 |
| 狀態 | timestamp、race-on、success/error | WAITING／NO DATA／PAUSED／DATA ERROR／NO SIGNAL |

原車側翼的冷卻液、機油溫度與壓力沒有可靠對應欄位，**本 HUD 不製造這些讀數**；以有來源的踏板輸入替代，並明確標示。所有速度單位轉換由共用 coordinator 負責，本樣式不重算物理或重新解碼 UDP。

0–10 刻度代表真實的 `×1000 r/min`，不是 0–100% 的偽刻度。最大轉速不高於 10,000 的車保留原型量尺；較高轉速車以 2,000 rpm 向上取整上限，維持 11 個真實數值標籤。例如 16,000 rpm 的刻度為 0、1.6、3.2…16。指針、刻度與紅線使用同一上限。

## 資料中斷與生命週期

- 以 `timestamp_ms`／`TimestampMS` 的**變化**判斷新封包，1,500 ms 未變化即清空行車值與警示，顯示 NO SIGNAL。共用 coordinator 的 RAF 重播不會延長資料有效期限
- 僅對沒有 timestamp 的第三方 fixture 使用有意義讀數變化作 fallback；相同讀數不會永久保持 LIVE，launcher 的全零待機畫面維持 WAITING
- race-off、`success:false`、truthy `error` 與完全缺失資料立即清空數值；下一個有效新 timestamp 可恢復，不保留前車讀數
- `hud:init`／`config`／`hud:elements`／縮放沿用 HUDCore。動畫只繪製有 DISPLAY CHECK 標示的錶圈亮線，不掃出虛構車速、轉速或檔位；新有效遙測立即結束檢查
- `hud:destroy`／`pagehide` 取消 RAF、解除本樣式的監聽器。destroy 後 hooks 不再更新已卸載介面
- 自訂色影響指針／油門條；紅線與煞車保留紅色語意。glow＝0 可關閉指針發光

## 尺寸與 safe zone

560 × 370 設計座標，預設 HUDCore 全域倍率 0.75，視覺槽位約 420 × 277.5 CSS px。沿用 `.hud-root-wrapper` 右下角 30 px 邊界與 framework 縮放；外殼外側透明。靜態材質 PNG 為 1120 × 740，Canvas 隨實際 DPR 1–3 重建 backing store。

此槽位**假設取代遊戲右下原生儀表**，不是承諾與原生儀表同時開啟時互不遮擋。720p 的寬度佔比最大，須在實際遊戲中確認右側提示、字幕及玩家自訂 HUD 比例。Windows click-through、置頂、原生 overlay 與 Forza 實機尚未驗收。

## 重現與驗證

採用 skill ID：`halfmoon-design-system`、`telemetry-udp-protocol`、`pr-author-maintainer`。未改 shared 協定、coordinator、HUDCore 或後端；新增的 tests 已由既有 Vitest include glob 收集。

```sh
pnpm -C frontend install --frozen-lockfile --store-dir /tmp/lfa-pnpm-store
pnpm -C frontend test
pnpm -C frontend run build:web-hud
node --check hud_overlay/lfa_center_ring/tests/visual/render.mjs
git diff --check
```

已更新至 main `a9335b158e658faa86bcfcbe4d36beb602f6c9c7`，重新 frozen install 後執行本機完整前端測試：**156 files passed／1 skipped；1,129 tests passed／1 skipped**（含新樣式 24 個行為測試）。`build:web-hud` 通過，已確認新樣式入口、JS、CSS、原創 PNG／SVG 打包至 `frontend/dist/hud/lfa_center_ring/`，測試目錄不隨產品打包。

### Chromium fixture gate

```sh
PLAYWRIGHT_MODULE_PATH=/path/to/node_modules/playwright \
OUTPUT_DIR=/tmp/lfa-evidence \
node hud_overlay/lfa_center_ring/tests/visual/render.mjs
```

預設使用 Playwright 內附 Chromium；只有明確提供 `CHROMIUM_PATH` 才指定外部執行檔。啟用 Chromium sandbox，不透過停用 sandbox 解決環境限制。不增加產品 npm dependency。

runner 以真正的 HUDCore dispatcher 檢查 1280×720、1920×1080、2560×1440、1920×1080 DPR2，涵蓋初始化、設定、公英制、倒車、空檔、高轉速、紅線、缺失／非法值、錯誤、暫停、重播 timestamp 逾時、重連、隱藏恢復、resize、動畫與 destroy；成功或失敗都輸出 `evidence.json`，有頁面時保留失敗畫面。完整 viewport 與主要狀態 PNG 供人工檢視，不採逐像素／Canvas 呼叫次數斷言。

本機無法啟動獨立 Chromium（UNIX socket EPERM），雲端瀏覽器開啟本機 fixture 被 ERR_BLOCKED_BY_CLIENT 阻擋。**因此 Chromium 視覺 gate 目前待 GitHub Actions artifact 完成後檢視，沒有宣稱本機 browser pass。** 原創外殼 PNG 已實際開啟檢視；完整 HUD 的視覺裁切、重疊與可讀性仍須由遠端截圖驗證。檢查完遠端證據後應更新此段結果。

互動手動 fixture：`node hud_overlay/lfa_center_ring/tests/visual/serve.mjs`，在可連到該伺服器的瀏覽器開啟終端顯示網址。`tests/visual/fixture.html` 可切換尺寸／狀態並執行行為檢查；此頁不打包於產品。
