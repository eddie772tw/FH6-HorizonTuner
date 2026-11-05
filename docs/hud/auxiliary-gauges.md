# 輔助儀表

[English](auxiliary-gauges.en.md)

原生程式啟動時，共用 runtime 會依 HUD 視窗實際可見狀態校正保存值。HUD 開啟時關閉程式，下次啟動不再誤判為開啟，也不會錯誤暫停 Live；若只是 WebView 頁面重載，則保留仍可見的 HUD。原生啟用失敗不保存啟用值，校正寫入沿用串行保存／重試並保留其他設定。實際 Windows 關閉／重啟與獨立標示的 bridge fixture 證據及重現方式見[重啟驗證圖集](auxiliary-gauges-screenshots/restart/README.md)。

HUD 設定的第五個「輔助儀表」分頁管理獨立表頭，可與主儀表及音響系統並存。關閉顯示時仍可預先設定。此功能沿用原素材底圖；音響面板的 Shader／銳化研究沒有納入本次交付，清晰度改善留待獨立 PR。

## 顯示與排列

可複選 AEM、GReddy、Blitz、Defi、Speedhut，保留選取順序。橫排設定每排最多 1–5 個，直排設定每欄最多 1–5 個；沿左、右、上、下邊緣排列，短排與增排方向維持既有規則。向內位移只接受 0–4000 px，沿邊中心位移接受 ±4000 px；共用滑桿旁保留精確數值輸入。輔助儀表大小沿用共用 HUD scale，音響的獨立縮放不影響它。

分頁切換不保存、不切換 HUD 顯示，也不重建 runtime。文字與數值草稿、捲動位置在同次開啟期間保留；Enter 或移至一般控制項才提交草稿。離開整個 HUD 頁面後回到主儀表。

## 共用數值來源

「共用儀表數值來源」集中設定增壓、油壓、油溫、水溫的描述、欄位和單位。來源先由 launcher 解讀，再以同一語意數值分發給所有表頭，例如 AEM 與 Speedhut 共用增壓值，換算成各自印刷的 PSI／BAR。沒有每個表頭個別覆寫。

油壓預設為有阻尼的引擎負載估計；油溫與水溫預設為四輪平均胎溫。這些是未提供引擎感測數據的替代顯示，不是真實油壓、油溫或水溫量測。自訂來源優先，缺值或未指定顯示破折號；`native` 明確把來源數字視為 °C 或 PSI。詳細公式、單位與舊設定遷移見[獨立元素契約](../hud-independent-elements.md)。

表單只提交 `gaugeValueSources.<reading>.<field>` 的局部 patch，由同一 runtime 合併並串行保存，避免描述、來源及其他頁面修改互相覆蓋。GReddy 的既有刻度校正與純幾何測試保留。

## 實作圖集與證據

[完整圖集與擷取條件](auxiliary-gauges-screenshots/README.md)包含三種設計系統日夜、窄幅、共用來源區塊、五款原素材表頭及多表排列。圖片來自實際 AppShell／HUD renderer 與隔離 fixture，不是素材原圖或遊戲實機擷取。

重現入口：`node frontend/src/features/overlay_control/tests/browser/verify.cjs`，使用任務專用 Playwright。獨立瀏覽器驗證涵蓋五分頁鍵盤／ARIA、草稿、跨頁保存、全部核心日夜／三語／320–1920px，以及 launcher 的獨立掛載、四邊對齊、來源換算、五款切換與換排。原生 Windows 跨螢幕、遊戲及螢幕閱讀器驗收另計。
