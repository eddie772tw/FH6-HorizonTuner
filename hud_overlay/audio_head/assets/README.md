# Audio Head 向量面板

九款面板以獨立 SVG 圖層呈現，保留既有邏輯尺寸、配置、配色與矩形背景。頻譜、曲名、OEL 海豚與 VU 指針仍由原有 Canvas 繪製。SVG 不含嵌入點陣圖、外部字型或外部圖片，不經低解析度 Canvas 快取。

## 來源與重建範圍

- 原始參考：`D:/ForzaHUD/extracted_resources/dds/res_220.dds`、`radio/res_220_full.png`、`shaders_asm/res_123.asm`，以及本目錄保留的九張 `*_clean.png`。DDS header 與 PNG IHDR 的實際尺寸均為 **524×988**；研究 Markdown 所稱的 2264×2496 不符合本機原檔。
- 原面板寬 380–490 px，在預設 HUD scale=100% 時顯示約 569–733 px；單純放大原 PNG 無法增加細節。
- 文字、框線、格線、刻度及材質依原圖重建。Alpine、Pioneer、Sony、Kenwood品牌直接沿用既有SVG輪廓、等比例縮放；P835R採對應舊版大寫Pioneer標誌。來源及原檔見[brands/SOURCES.md](brands/SOURCES.md)。其他固定文字使用Windows內建Arial／Arial Narrow／Georgia與固定寬度，不宣稱是原作字型的完整復原。
- RDS、Alpine 光碟、DEX-P1R 與 P835R 圖樣、Sony DSO、JVC 光碟等保留原始輪廓，整理為 `panel-glyphs.json` 的向量路徑。每筆記錄原圖 SHA-256、區域、顏色與輪廓；這些路徑保留來源的細節上限，並非從低解析度素材還原出原本不存在的細節。
- 75% 不透明度只套在背景材質群組。完整矩形與 Panasonic 金色材質在同一群組合成後一次設定 opacity，避免背景重疊後變成 93.75%；文字及黯淡裝飾為獨立、不受背景 opacity 影響的圖層。
- 保留 `*_clean.png` 作為來源對照，執行時不再載入這些低解析度面板。

## 編輯與驗證

以 Node 標準函式庫重建，無新增相依套件：

```powershell
node hud_overlay/audio_head/assets/build-panels.mjs
node hud_overlay/audio_head/assets/build-panels.mjs --check
```

修改 `build-panels.mjs` 或 `panel-glyphs.json` 後應重新產生九款 SVG。`--check` 只比對產物是否與可編輯來源一致，不改寫檔案。

瀏覽器驗證應逐款切換並檢查 scale／DPR、亮暗背景下的透明度、文字與既有頻譜視窗的對位。離線圖片不代表遊戲或跨更新率驗收；本輪不新增個別樣式單元測試。
