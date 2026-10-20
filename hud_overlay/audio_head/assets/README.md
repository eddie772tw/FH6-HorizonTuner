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

`normalize-brand-fragment.mjs` 只處理已審查、納入版本控制的品牌片段，不是任意 SVG 的通用 sanitizer。移除標籤、註解及既有屬性清理會重複至固定點；成對標籤名稱必須相符。每段限制 65,536 個 UTF-16 code units、最多 32 輪，未收斂或殘留禁止／不完整 markup 就拋錯；六段全部通過後才開始寫入面板。保留 Alpine `cls-1` 幾何選取、`fill="none"`、CDDA 非 fill inline styles 與既有空白格式。

安全回歸與重建測試位於 `../tests/unit/brandNormalization.test.ts`，由完整 frontend Vitest 入口執行；涵蓋 delimiter 重組、拒絕不完整輸入、失敗時不寫入任何面板，以及六段既有片段與九張重建 SVG 的位元組相容性。

瀏覽器驗證應逐款切換並檢查 scale／DPR、亮暗背景下的透明度、文字與既有頻譜視窗的對位。來源正規化／重建測試與離線圖片不代表遊戲或跨更新率視覺驗收。
