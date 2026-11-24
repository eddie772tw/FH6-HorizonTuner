# Altezza 計時碼錶式儀表

原創靜態向量圖 `chronograph.svg` 保留兩種錶位的金屬環、細顆粒、內圈密齒、嵌入式小錶與右側存量錶。預設中央轉速，`#speed` 啟用中央速度。轉速刻度依實際畫布解析度快取，遙測改變量程、紅線或使用者切換錶位時更新。原版點陣素材保留於本目錄供歷史版本對照。

Toyota 上市資料記載設計靈感來自計時碼錶，2001 年的改款報導記錄中央速度錶改為轉速錶。兩種配置共用使用者指定的紅橙 LCD，上排用檔位取代實車照片中的里程，下排顯示車速。金屬材質依使用者提供的零件照片繪製，未嵌入參考照片。[Toyota 上市資料](https://www.toyota.co.jp/jpn/company/history/75years/vehicle_lineage/car/id60000174/news/60000174.pdf) · [webCG 改款報導](https://www.webcg.net/articles/-/19673)

ALTEZZA 字標依零件照重繪為共用 SVG 路徑，兩種錶面各自套用實色油墨。Toyota GAZOO 的紙模型亦有車名字標可供對照；本次製作的是 HUD 用重繪稿。[GAZOO Altezza 紙模型](https://gazoo.com/-/media/TMC/gazoo/pages/contents/news/info/200515/download/altezza_color_f.pdf)

### 遙測接口

選項 `altezzaCenterDial` 使用 `tach` 或 `speed`。類比速度錶固定 0–180 km/h，LCD 依 HUD 速度單位顯示。轉速刻度根據引擎最大轉速向上取整，紅區起點沿用 HUD 的 `redlineRpm`。缺少有效引擎規格時採用照片的 0–9,000 rpm 刻度與 8,000 rpm 紅區。

| 錶位 | 選用的 frame 欄位 | 單位 | 指針顯示範圍 |
| --- | --- | --- | --- |
| 中央上方增壓 | 原始 `Boost`，或 canonical `boost_bar`／`boost_psi`／`boost_kpa` | bar | −1–2 |
| 中央右側四輪平均胎溫 | `tire_temp_f`／`TireTemp` 四輪平均 | °F 轉 °C | 70–110 |
| 中央下方最高胎溫 | 同一組四輪的最大值 | °F 轉 °C | 70–110 |

增壓保留負壓與有效零值。兩個胎溫錶要求四輪皆有有限數值；缺值停在低端。胎溫端點標示 L／H，低於75°C 為藍色、75–105°C 為暖白、超過105°C 為紅色，沿用專案胎溫提示區間。採線性70–110°C量程，70–75°C冷區及105–110°C熱區各占全刻度12.5%，中間工作區占75%。量程外讀值停在對應端點。冷熱色帶固定於刻度上，位置及長度不受指針或讀值影響。增壓圖示為渦輪，胎溫使用輪胎圖示與 AVG／MAX 區分。

設定使用「中央轉速錶」開關。預設開啟時中央轉速、左側時速；關閉時交換兩者。既有 `altezzaCenterDial` 設定持續保存這個選擇。

### 右側獨立模擬存量

每次載入 HUD 皆由100%開始，100 km 的有效里程增量消耗一整格。1.5秒沒有新封包後，以60秒補滿一整格的速率回升。存量夾在0–100%，恢復更新後停止回升。保留 F／E 與油泵外觀作為原車風格的模擬存量錶。

使用 `sourceTelemetry.DistanceTraveled` 的原始公尺值，canonical-only 輸入接受 `distance_m`。時間戳重複或順序錯亂不重複扣量；uint32 wrap 可接續。換車、距離倒退、缺值與斷流重連都重新建立基準，保留當前存量。持續收到相同里程的新時間戳代表車輛靜止，仍維持存量。沒有時間戳的 canonical-only 客戶端依資料內容變化判定更新，完全相同的資料無法代表新封包。關閉／卸載 HUD 清除回升計時器。

### 年代與材質修訂

1998 年 Lexus 原廠車展資料將同世代 IS200 儀表的靈感明確連結到運動碼錶；1999 年上市資料也以碼錶式組合儀表描述其內裝。據此採用霧銀金屬、細密內圈齒紋、深色嵌入小錶與紅色細針。紅橙 LCD 的配色仍以本次提供的 Altezza 通電照片為依據。[1998 年 Lexus 車展資料](https://media.lexus.co.uk/lexus-at-the-british-international-motor-show-3/) · [1999 年 IS200 上市資料](https://media.lexus.co.uk/wp-content/uploads/sites/3/pdf/IS200-UK-launch-pack-1999.pdf)

固定的 GEAR、SPEED 與單位標籤使用低亮度印刷字樣。km/h 與 mph 是同位置的兩個獨立文字元素，由設定互斥切換。車速、檔位與 N／R 使用固定長寬比的分段電極字形，包含細微間隙及低強度發光。LCD 有內凹暗邊、暖色背光與輕微表面反光。背光亮度及金屬微顆粒為此次視覺設計值。

最外側不規則背板已移除。兩側指針與軸心均受中央錶圈輪廓遮擋，中央主針長度也縮短以留出刻度外緣。超過三位數的 LCD 車速顯示 HI，缺值顯示短橫線。
