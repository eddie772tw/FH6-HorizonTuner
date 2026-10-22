# Altezza TRD LCD 字形

`res_256.png` 直接取自本機原始研究 `D:/ForzaHUD/extracted_resources/previews/res_256.png`，保留原始 PNG 位元組。

`res_125.asm` 的 Altezza 分支（`cb0[5].y == 4`，約 2067–2476 行）以 `t3` 取樣檔位與時間；研究 renderer 的 dashboard slot 3 對應 `res_256`。原圖為 1024×512、16×8 ASCII 格，每格 64×64；時間數字與冒號亦使用同一張貼圖。顯示採原始分段輪廓，載入時將覆蓋度轉為深色 LCD 字形，不另行使用系統字型或光暈。

來源及 repo 資產 SHA-256 均為 `95a232acc2a42aea37caf7485be893c8a6b1cbf2f4c4f871e2eeeaab871054aa`。字形以正方形格等比縮放，字距獨立設定，不壓縮字形寬度。其餘底圖與指針座標維持原樣，僅增加容納完整背景圓的畫布留白。
