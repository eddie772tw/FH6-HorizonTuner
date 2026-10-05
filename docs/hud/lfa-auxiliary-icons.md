# LFA 一般模式輪胎／渦輪圖示

本次只重畫 `hud_overlay/lfa_center_ring/assets/side-crescents.svg` 的 `tireIcon`、`turboIcon` 與同步匯出的 PNG。四條側錶曲線、刻度、數字位置、中央儀錶及展開素材不屬於此圖示變更範圍。

## 素材研究與決策

2026-10-05 查閱下列官方來源，下載來源 SVG 並以 Inkscape 實際檢視像素後比較：

- [Pictogrammers / MDI car-turbocharger](https://pictogrammers.com/library/mdi/icon/car-turbocharger/)：[官方 SVG](https://github.com/Templarian/MaterialDesign-SVG/blob/master/svg/car-turbocharger.svg)，blob `08e5abac9da881280d8f502338aa4b78e1e8b0fa`。渦殼、切線出口和轉子語意清楚，但六葉造型在本 HUD 的小尺寸較密。
- [Tabler wheel](https://tabler.io/icons?icon=wheel)：[官方 SVG](https://github.com/tabler/tabler-icons/blob/main/icons/outline/wheel.svg)，blob `8b985a423be7ccb947d95139df6b725813335ec0`。多輻輪轂容易辨認，但單獨使用不能表達胎溫。
- [Tabler temperature](https://tabler.io/icons?icon=temperature)：[官方 SVG](https://github.com/tabler/tabler-icons/blob/main/icons/outline/temperature.svg)，blob `6def54036c5add144550ce9066d334bd0259dc28`。溫度計可補足輪胎圖示的量測語意。
- MDI 的[來源授權](https://github.com/Templarian/MaterialDesign-SVG/blob/master/LICENSE)將 Icons 列為 Apache-2.0、非字型與非圖示程式碼列為 MIT；不能把圖示誤標為 MIT。Tabler Icons 的[官方授權](https://tabler.io/license)為 MIT。

最終採用自行繪製的新 SVG 幾何，沒有複製、改寫或納入上述第三方 SVG path；來源素材只用於比較語意與小尺寸的線條密度。因此交付素材沿用本專案 [MIT license](../../LICENSE)，不新增圖示套件、字型或第三方資產。

## 圖示語意與畫法

- 輪胎：以外側胎壁、內側輪轂、五輻線條與右側溫度計共同表達胎溫；原有 `TIRE 4W` 與四輪平均值保持不變。沒有 TPMS 驚嘆號、胎壓警告或單輪定位含義。
- 渦輪：單一渦殼接切線出口，中央圓形進氣口搭配三葉轉子，去除舊圖案密集交叉線與不易辨認的管路。
- 二者維持原有中性色與放置位置。輪胎 stroke 為 1.7 設計單位；渦輪為 2.1，再經原有 0.8 比例呈現為 1.68，讓最終線條重量一致。
- 無 OEM 標誌、照片貼圖、描圖或新增品牌素材。

## 匯出與驗證

SVG 是單一繪圖來源；用 Inkscape 1.4 匯出 1120×740 的透明 PNG，再由 ImageMagick 7 移除 metadata。正式 renderer 繼續載入這張 PNG，不引入逐幀 SVG 排版或額外繪圖運算。

```sh
inkscape hud_overlay/lfa_center_ring/assets/side-crescents.svg --export-width=1120 --export-filename=/tmp/lfa-side-export.png
magick /tmp/lfa-side-export.png -strip -define png:color-type=6 hud_overlay/lfa_center_ring/assets/side-crescents.png
```

與本次變更前 PNG 的逐像素 RGBA 比較：3,122 個像素改變，全部位於兩個圖示區域；圖示區域之外為 0 像素差異。沒有用重新取樣或容差豁免背景、曲線或中央區域。

獨立的實際瀏覽器驗證位於 `hud_overlay/lfa_center_ring/tests/visual/auxiliary-icons.mjs`，由既有 `render.mjs` 呼叫：

- 一般模式 default／compact × DPR1／DPR2
- 攝氏／bar、華氏／psi、負壓 bar、負壓 kPa、缺失值，共 20 張實際 renderer 截圖
- 使用來源 SVG 的圖示幾何對照即時 SVG 文字 bbox，保留 2 設計單位餘裕，檢查文字重疊、fascia 邊界與中央遮罩
- 原有胎溫／增壓資料契約仍由 `lfaAuxiliaryAndSession.test.ts` 驗證；沒有增加低階 Canvas 呼叫次數或硬編碼像素座標的單元斷言

本地已通過 `node --check`、`git diff --check` 與前端 Vitest：162 個檔案通過、1 個略過；1,268 個測試通過、1 個略過。實際 Chromium 圖示檢查及人工預設／compact 像素檢視須以本次合併程式碼的 CI artifact 為準，不能以放大的 SVG 預覽取代。

本次採用技能：`halfmoon-design-system`、`cross-agent-collaboration`。圖示原創幾何和來源授權的辨別屬於此素材的局部決策，不新增全域架構規則。
