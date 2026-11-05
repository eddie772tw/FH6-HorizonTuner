# Audio Head 原始面板素材

九款面板執行時使用本目錄的原始 `*_clean.png`。2026-11-05 視覺審查否決整面 SVG 重繪後，Pioneer DEH-P835R、Alpine CDA-7848、CDA-9815RB 回退至原素材；其餘六款同樣移除未逐項確認的整面重繪。這次沒有啟用任何局部向量替換。

## 執行來源與呈現

| 型號 | 執行素材 | 原生尺寸 |
| --- | --- | --- |
| Pioneer DEH-P6100R | `pioneer_clean.png` | 380×98 |
| Panasonic CQ-VX5500K | `panasonic_clean.png` | 438×110 |
| Pioneer DEX-P1R | `pioneer_dexp1r_clean.png` | 412×98 |
| Pioneer DEH-P835R | `pioneer_p835r_clean.png` | 460×125 |
| Sony CDX-CA860X | `sony_cdx_clean.png` | 440×133 |
| Alpine CDA-7848 | `alpine_7848_clean.png` | 440×112 |
| Alpine CDA-9815RB | `alpine_9815_clean.png` | 490×110 |
| Kenwood KRC-759R | `kenwood_krc_clean.png` | 392×125 |
| JVC KD-LX50R | `jvc_kameleon_clean.png` | 460×98 |

- 以上檔案與整面向量化之前的 `ff6baf5b` 位元組相同，未重新壓縮、放大或修圖。來源為原有 `res_220` 圖集與 D3D11 底圖提取流程；保留既有文字、標誌、格線、輪廓、配色及細節上限，不宣稱恢復低解析度來源不存在的資訊。
- 靜態 Canvas 沿用 `ff6baf5b` 的矩形合成：先以黑色補足矩形，再繪製原圖；只有原黑色、研究 renderer 清底色與 Panasonic 金色材質使用 alpha 191（約 75%），黯淡字樣和裝飾保留覆蓋度。沒有重疊套用透明度，也沒有亮度門檻去掉暗部細節。
- 各底圖只在載入時準備一次，靜態圖層只在切換型號時更新；頻譜、曲名、海豚與 VU 指針留在另一個動態 Canvas。現有動畫、原生視窗座標、DPR、獨立縮放與四邊對齊不變。
- [音響系統指南與逐款截圖](../../../docs/hud/audio-head.md)記錄實際 launcher 的擷取與測試；PNG 放大仍受原始解析度限制。

## 局部向量替換的界線

1. 預設保留原素材。只有能確認存在**相同圖形**的向量檔時，才考慮替換對應的局部商標、標誌或可逐點數學描述的圖樣。
2. 替換前記錄來源檔、來源網址／授權、SHA-256、對應原圖區域，以及形狀、比例、顏色與位置的核對；替換後提供同尺寸的局部及完整面板實際截圖供視覺審查。
3. 「同品牌」不等於相同年代／版式的商標。一般字型近似、看圖重畫、點陣自動描摹、猜測刻度或只因為輸出副檔名是 SVG，都不能視為已確認的相同向量來源。無法確認時保留原圖，不擴展成整面重製。
4. `brands/` 的檔案及[來源紀錄](brands/SOURCES.md)僅保留備查，不代表已核准套用到目前面板；`panel-glyphs.json` 的點陣描摹也不是原生向量來源。

## 歷史重繪與安全回歸

`*.svg`、`build-panels.mjs` 及 `panel-glyphs.json` 保留為歷史審查資料，**目前 renderer 不載入**。生成器仍可用下列命令核對歷史產物，但通過只代表來源與產物一致，不代表視覺審查通過，也不會切換執行素材：

```powershell
node hud_overlay/audio_head/assets/build-panels.mjs --check
```

`normalize-brand-fragment.mjs` 的固定點、token／range 與輸入上限安全修復，以及 `../tests/unit/brandNormalization.test.ts` 的 44 項回歸契約保留。它只處理已納入版本控制的品牌片段，不是任意 SVG 的通用 sanitizer。

獨立瀏覽器入口為 `node frontend/src/features/overlay_control/tests/browser/verify.cjs`，呼叫 `../tests/browser/verify.cjs`。除設定與 launcher 行為外，逐款比對原生尺寸、完整底圖 RGB（容許 Canvas alpha 預乘的 1 級捨入）、材質／裝飾透明度及未載入重繪 SVG。瀏覽器 fixture 與原圖一致性不代表使用者已重新通過視覺審查，亦不是遊戲、真實音訊或跨螢幕驗收。
