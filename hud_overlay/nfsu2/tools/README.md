# NFSU2 材質與透明度

上一版把合成錶面所有暗像素當成底板，將 `max(R,G,B) <= 24` 的 alpha 降至 15%。這會把 Tabby 的眼睛／鬍鬚、Tribal／Skull／Circuit 等實心圖案也挖成透明洞。亮度無法區分黑色圖案與黑色底板。

現在的 11 張 `assets/nfsu2_face_*.png` 已離線準備正確的 alpha，執行時用普通 `Image` 載入，不再呼叫全圖的暗色透明化工具。RGB、原有外部透明區、設計座標、baseline=2.1 與 `filter: none` 保留。沒有在遙測／繪製迴圈加入影像掃描或配置。

## 原始渲染依據

- 原研究：`D:/ForzaHUD/docs/acceptance_screenshots/02_dash_NFS_Underground_2.png`、`docs/render_ground_truth_acceptance_suite.py`。
- `res_125.asm` 的 NFSU2 分支：t61=`res_660..670` 是錶面圖案與環框；t62=`res_671` 是共同底板、N2O 與讀值區。
- 原 shader 對 t61 的 alpha 與顏色分開混合，黑色圖案仍可不透明。不能從最終 RGB 猜測材質。
- 對每款錶面，以原 D3D11 shader 分別載入 DDS 與對應 decoded atlas PNG，驗證完整輸出的 alpha 逐像素相同，最大差異 **0/255**。
- 產生靜態圖案覆蓋範圍時，t62 與字型槽位使用透明材質；t61 僅清除主指針 `(1028,844)`、增壓指針 `(1028,910)` 所在的 atlas 區域，避免把動態指針誤當成固定底圖。座標來自原 ASM，未改動研究資料。

若原合成圖 alpha 為 A、靜態圖案覆蓋 alpha 為 M，先限制 M ≤ A。對剩餘底板使用舊有亮色保護係數 F：

```text
F = 0.15 + 0.85 × clamp((max(R,G,B) - 24) / 32, 0, 1)
A_new = M + (A - M) × F
```

因此實心圖案保持 A=255；不含圖案的純黑底板為 38/255（15% 四捨五入）；亮色材質保留原 alpha；原本 A=0 的區域維持 0。反鋸齒與原有半透明圖案保留其覆蓋量，不被當作洞移除。共用 HUD 的整體 opacity 仍另外作用。

## 影響範圍

11 款均恢復原始圖案／環框覆蓋量；其中 9 款有下表的完全不透明暗色材質。Stock、Flames 沒有完全不透明的暗色圖案，但仍保留原環框的部分覆蓋 alpha。

| Face | UI 名稱 | 保留的實心暗色像素數 |
|---:|---|---:|
| 0 | Stock | 0 |
| 1 | Flames | 0 |
| 2 | Street Tribal | 36,307 |
| 3 | Tabby Cat | 15,574 |
| 4 | Biohazard Skull | 6,906 |
| 5 | Redline Classic | 1,490 |
| 6 | Gold Chrono | 1,524 |
| 7 | Techno Arc | 1,057 |
| 8 | Speed Pulse | 779 |
| 9 | Circuit Board | 16,050 |
| 10 | Bling | 3,055 |

計數是來源圖中 M=255 且 max(R,G,B)≤24 的像素，代表可明確核對的實心暗圖案；不等於全部修正像素數。完整原始貼圖／shader 雜湊及每款數據在 [material-audit.json](material-audit.json)。

## 離線重現

使用 Windows PowerShell 5.1、系統 System.Drawing 與原研究既有的 D3D11 host，不需安裝產品相依。來源必須是透明化以前的原始 PNG，固定來源提交為 `bd7849d830065e306efc1a790a8a3b2fff1a65e1`（該版透明化在執行時進行，PNG 尚未修改）。

1. 從上述提交的 `hud_overlay/nfsu2/assets` 匯出到獨立目錄。
2. 指定原研究、原始資產與另一個輸出目錄：

```powershell
powershell.exe -NoProfile -File hud_overlay/nfsu2/tools/prepare-materials.ps1 -ResearchRoot D:/ForzaHUD -SourceAssets D:/temp/nfsu2-original/assets -Output D:/temp/nfsu2-prepared
```

工具驗證 DDS／PNG 的 alpha 一致性、RGB 不變、原透明區不變、實心暗圖案不變、alpha 不增加及純黑底板 15%，輸出 11 張準備好的 PNG、圖案覆蓋遮罩、原始 D3D11 參照與審計 JSON。先檢視輸出再替換產品資產。遮罩與原始 shader 參照是離線證據，不能標為遊戲實機截圖。
