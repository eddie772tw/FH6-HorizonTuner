# Altezza 視覺自我審查

2026-11-23，基於 92c41116 的本次修訂。此目錄圖片與同次提交的 renderer 對應。主要畫面 tach.png、speed.png 與 1080p.png 由實際 AppShell 設定頁經 launcher 載入，使用模擬遙測。settings.png 為新增開關介面，已驗證預設開啟、切換、保存與重載。

Linux Chromium、DPR 1、1920×1080、HUD scale 1，透明 HUD 以 #20242b 中性背景檢視。兩款 driving 畫面為 126 km/h、5,400 rpm、最高轉速 9,000 rpm、紅線 8,000 rpm、四檔、1 bar 增壓、四輪 80／90／100／110°C 胎溫，右側模擬存量初始全滿。元素裁切約 816×494。印刷標籤為原車風格的英文，HUD 圖面不依 AppShell 的設計系統換色。

- 已檢視兩種布局的金屬圈、LCD 印刷標籤、段碼比例、N／R 字形及側錶指針遮擋。
- 各款附倒檔、空檔英制、資料缺失、十檔、LCD 超量程與滿量程畫面。英制 100 km/h 顯示 62 mph，類比速度錶仍用 km/h。
- 單位元素檢查每個狀態皆恰好顯示一種單位。
- 真實 AppShell 設定保存、重載與 BroadcastChannel → launcher 的兩種錶位切換通過，瀏覽器無 pageerror。
- 使用模擬遙測完成瀏覽器驗證，尚未進行遊戲內實機驗收。

可重現各狀態的入口為 hud_overlay/altezza_trd/tests/visual/refinement.cjs。在 repository 根目錄以靜態 HTTP 服務啟動，設定 HUD_ORIGIN 指向該服務，PLAYWRIGHT_MODULE_PATH 指向已安裝 Playwright，CHROMIUM_PATH 可指定 Chromium 執行檔，再以 Node 執行該腳本。輸出條件與互斥檢查結果見 refinement-checks.json。

胎溫使用70–110°C線性量程，藍色70–75°C與紅色105–110°C各占全刻度12.5%，固定於刻度，不會跟隨指針延伸。

本輪另附 cold／hot 胎溫圖、reserve-half／reserve-recovered 存量圖。50 km 里程增量消耗半格，受控瀏覽器時鐘前進31.5秒（含1.5秒斷流緩衝）後回滿。每款使用新載入實例驗證初始全滿。設定開關已檢查 Halfmoon Default、Swiss、Rhine 的日夜模式，以及英文、繁中、日文的320px窄幅。設定截圖使用真實 AppShell fixture，無橫向溢出。

資料合約已補單元測試覆蓋四輪平均／最高胎溫、缺值、負壓、距離消耗、重複封包、重連與換車基準、里程歸零、uint32時間戳wrap、0–100%邊界、斷流回升與destroy／pagehide清理。
