# V1.7.2 發行說明圖片來源

本目錄圖片用於[發行說明](../../v1.7.2.md)，來源為已接受的 main `7a13423884b39942474460733b636a85a3a084b1`，tree `9e1cb2976092455c710c178d86427c94e6201616`。2026-10-11（Asia/Taipei）以既存 Chromium 148.0.7778.96、DPR 2、sandbox 啟用取得實際像素；沒有修改產品 renderer、元件、CSS 或使用生成式圖片。

## HUD 離線示意

正式 `index.html`／HUDCore 以合成遙測離線渲染，公制、預設色、scale 1。AP1／LFA／Stack viewport 為 1280×720 CSS px；R34 為 1920×1080。裁切完整可見儀表並保留 12 CSS px 邊距，PNG 保留原透明背景；沒有拼貼、重畫或縮放輸出。

| 圖片 | 正式入口／裁切 | 示範資料 |
| --- | --- | --- |
| [AP1 Rev Arc](hud-ap1-rev-arc.png) | `hud_overlay/ap1_rev_arc/index.html`／`#ap1Cluster` | 既有 visual sample：188 km/h、7300 rpm、4 檔、1.20 bar。 |
| [LFA Center Ring](hud-lfa-center-ring.png) | `hud_overlay/lfa_center_ring/index.html`／`#lfaContainer` | 既有 visual base：180 km/h、7200 rpm、4 檔、95°C、1 bar、油門 80%／煞車 20%；缺少圈次來源維持破折號。 |
| [Stack ST8100](hud-stack-st8100.png) | `hud_overlay/stack_st8100/index.html`／`#stackContainer` | 既有 visual base：180 km/h、6400 rpm、4 檔；LCD 顯示合成賽事時間 1:10.00／胎溫 98°C。 |
| [R34 MFD](hud-r34-mfd.png) | `hud_overlay/r34_mfd/index.html`／`#r34Container` 可見儀表 union | 既有 visual rawSample／baseConfig 與 80×100 ms 合成增壓曲線，Single 頁 1.20 bar／peak 1.40；包含雙指針、輔助錶與 MFD。 |

這些值只展示介面，並非真車測量、qualified capture 或遊戲驗收；R34 的一張 Single 頁截圖也不代表五頁驗收。HUD capture 的 console error、pageerror、requestfailed 與 HTTP≥400 均為 0；自有瀏覽器及 loopback server 已關閉。

## 外觀設定區塊

直接使用 `frontend/src/features/theme/ThemeView.tsx` 與真實 ToastProvider／SettingsProvider／ThemeProvider、Halfmoon／App CSS。設定來源為隔離 runtime11.45.22 sidecar 的新資料目錄與新瀏覽器 context；沒有掛載 MainApp／LiveAppRuntime，未啟動遊戲或載入使用者車輛資料。

| 圖片 | 正常 UI 操作 | 原始 DOM 裁切 |
| --- | --- | --- |
| [Swiss 三核心](theme-swiss-settings.png) | 繁中／深色；選擇 Swiss Technical 與 Swiss Signal 色彩預設。 | `.theme-system-group[aria-labelledby="theme-system-swiss"]` |
| [Rhine Lab](theme-rhine-settings.png) | 繁中／深色；選擇 Rhine Lab 核心與 Rhine Lab 色彩預設。 | `.theme-system-group[aria-labelledby="theme-system-rhine"]` |

Viewport 1500×2400 CSS px／DPR 2；僅裁切設定元件區塊，沒有重排 DOM／覆寫 CSS。離線擷取阻擋 Google Fonts，Inter／Outfit 未由網路載入，畫面保留現有本機字型資源與 fallback；manifest 有 Rhine MiSans 已載入項，但未逐字核對 glyph。該預期網路阻擋單獨記錄，pageerror 與失敗本機請求為 0。設定只寫入隔離資料，sidecar 經 stdin EOF 正常 exit0，瀏覽器與 Vite server 已關閉。

主題圖片是桌面設定元件截圖，不能代表 Android 原生／WebView 字型、七核心全畫面、安裝／升級或裝置驗收。正式發行產物與實機限制見[候選驗收紀錄](../../v1.7.2-acceptance.md)。

## 檔案尺寸與 SHA-256

| PNG | 尺寸（px） | SHA-256 |
| --- | --- | --- |
| `hud-ap1-rev-arc.png` | 1128×498 | `f77cee9a2cb20b78c3e04f65f79485b775a9de53c18e49d9053bc0181c565d1a` |
| `hud-lfa-center-ring.png` | 888×604 | `dc3baabba5c1ce7dfb1dc37c69613c422d8c08061da6964bd414431a767eb3a9` |
| `hud-stack-st8100.png` | 960×590 | `d33d715963eed239472454a5c9785e2dce9b92019c33dbf67aed2fa7ae7d6fa1` |
| `hud-r34-mfd.png` | 3036×504 | `976201cd2ac613ad15163f4be86a46dd00cb0307551aba1c9fc21b7a36fb8a91` |
| `theme-swiss-settings.png` | 780×1204 | `eb797ae7e1ebc0dbc2bfa416d759a5615134f827b2f84432ae36f3a2a4c75c7b` |
| `theme-rhine-settings.png` | 808×464 | `4efb90468c36e21b6c43683f2178c096841d0ccf672ce6322e6c7369a271148d` |
