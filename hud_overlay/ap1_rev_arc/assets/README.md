# AP1 原始點陣字元

- `ap1_native_atlas.png` 原樣複製自 D:/ForzaHUD/extracted_resources/previews/res_507.png；res_125 style 10 的 t64。邏輯 atlas 900×700，時速 0..9 位於 y=630、每格 68×68，原圖自帶反射；依原 shader 字距 56 排列。
- `ap1_ascii_font.png` 原樣複製自 previews/res_266.png；同一分支的 t65，16×8 ASCII 格。shader 取 R 通道作 coverage；載入時只將該通道轉為白色 alpha mask。檔位、時鐘、增壓、胎溫與新標籤共用原字形；kPa／°C 使用 t64 原單位圖案。
- 研究內嵌向量字型的 name table 可辨識 Helvetica Now Display Bold、Inconsolata、Noto Sans SemiBold、Noto Sans；沒有證據可將其中某個名稱直接對應到 t64/t65 的位圖。PNG/DDS 沒有可核對的 family 名稱，因此保留原始位圖來源，不用外觀相似的系統字型代替。
- 轉速 LED 的角度、共用圓心與段數依同一原始 ASM；紅線顏色依 maxRPM−2000 動態準備，刻度、字形與圖片 alpha 保留。

SHA-256：

- ap1_native_atlas.png: `5a67e2f22dffcfe012c21fdf5f3d93bbda0eaf5573720ada2e926f79df414c4a`
- ap1_ascii_font.png: `624c3e5064021d679d8223090fd0622dbacc6ca2ca4c86ac62129a445b6f1555`
