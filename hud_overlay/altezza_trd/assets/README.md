# Altezza 計時碼錶式儀表

原創靜態向量圖 `chronograph.svg` 保留兩種錶位的金屬環、髮絲紋、內圈密齒、嵌入式小錶與油量錶。預設中央轉速，`#speed` 啟用中央速度。轉速刻度依實際畫布解析度快取，遙測改變量程、紅線或使用者切換錶位時更新。原版點陣素材保留於本目錄供歷史版本對照。

Toyota 上市資料記載設計靈感來自計時碼錶，2001 年的改款報導記錄中央速度錶改為轉速錶。兩種配置共用使用者指定的紅橙 LCD，上排用檔位取代實車照片中的里程，下排顯示車速。金屬材質依使用者提供的零件照片繪製，未嵌入參考照片。[Toyota 上市資料](https://www.toyota.co.jp/jpn/company/history/75years/vehicle_lineage/car/id60000174/news/60000174.pdf) · [webCG 改款報導](https://www.webcg.net/articles/-/19673)

ALTEZZA 字標依零件照重繪為共用 SVG 路徑，兩種錶面各自套用實色油墨。Toyota GAZOO 的紙模型亦有車名字標可供對照；本次製作的是 HUD 用重繪稿。[GAZOO Altezza 紙模型](https://gazoo.com/-/media/TMC/gazoo/pages/contents/news/info/200515/download/altezza_color_f.pdf)

### 遙測接口

選項 `altezzaCenterDial` 使用 `tach` 或 `speed`。類比速度錶固定 0–180 km/h，LCD 依 HUD 速度單位顯示。轉速刻度根據引擎最大轉速向上取整，紅區起點沿用 HUD 的 `redlineRpm`。缺少有效引擎規格時採用照片的 0–9,000 rpm 刻度與 8,000 rpm 紅區。

| 錶位 | 選用的 frame 欄位 | 單位 | 指針顯示範圍 |
| --- | --- | --- | --- |
| 中央上方油溫 | `oil_temp_c` | °C | 60–150 |
| 中央右側電壓 | `battery_voltage_v` | V | 0–18 |
| 中央下方水溫 | `coolant_temp_c` | °C | 55–130 |

以上為 HUD 的映射規格。每幀獨立接受有限數值，超出範圍的讀值停在端點。沒有來源時對應的小錶停在低端。目前 Forza 封包沒有這三個實測值。後續資料提供者可經既有 HUD frame 直接傳入上述欄位。
