---
name: telemetry-udp-protocol
description: 處理 Forza Horizon UDP 遙測封包解析、324-byte 二進位 struct 格式、高頻 UDP 效能維護與物理單位轉換時觸發此技能。
---

# Forza UDP 遙測協議與位元組封包處理指南 (Telemetry UDP Protocol Skill)

## 核心原則與開發守則

1. **零同步阻塞 (Zero Blocking I/O)**：
   - UDP 接收主循環 (`telemetry_listener.py`) 執行頻率高達 60Hz+。
   - **嚴禁**在主循環中放置同步阻塞檔案寫入、HTTP 請求或高開銷運算。

2. **小端序 (Little-Endian) 與 324 位元組 Data Out 架構**：
   - 封包資料採 UDP 單向廣播，長度固定為 **324 位元組 (Bytes)**，採用小端序 (Little-Endian) 編碼。
   - **避坑經驗 1 (V2 區塊對齊)**：232 ~ 243 位元組為 12 位元組的保留間隔 (Reserved Padding)，因此 V2 區塊之真實解包 Offset 必須由 **244 位元組** 起算（`Position` 從 244 開始、`Speed` 從 256 開始）。
   - **避坑經驗 2 (時間間隔計算)**：全封包中**不存在**獨立 Float32 `DeltaT` 欄位。每幀模擬時間間隔必須由兩幀 `TimestampMS` (Offset 4) 相減得出：$\Delta T = (TimestampMS_k - TimestampMS_{k-1}) / 1000.0$。

3. **原生單位與顯示單位轉換規範**：
   - 速度：公尺/秒 ($m/s$) 轉 $km/h$ (乘以 $3.6$)。
   - 壓力/增壓：磅/平方英寸 ($PSI$) / 帕斯卡 ($Pa$)。
   - 功率/馬力：瓦特 ($W$) 轉 $hp$ (除以 $745.7$)。
   - 扭力：牛頓米 ($N \cdot m$)。
   - 加速度：$m/s^2$ 轉 $G$ 值 (除以 $9.81$)。
   - 胎溫：華氏 (℉) 轉 攝氏 (℃) ($℃ = (℉ - 32) \times 5 / 9$)。

---

## 324 位元組 Data Out 數據結構與使用狀態總覽

全數 324 位元組、41 項欄位細節、物理定義與專案使用狀態（34 項已解析使用、7 項未解析）已收錄於獨立參考手冊：
👉 **[完整 324 位元組欄位對照與使用狀態參考表](file:///d:/FH6-Bundle/FH6-HorizonTuner/.agents/skills/telemetry-udp-protocol/references/packet_format_reference.md)**

### 區塊概覽 (Data Out Section Summary)

| 區塊 (Section) | 位元組範圍 (Byte Offset) | 欄位數量 | 主要內容與重點說明 |
| :--- | :--- | :--- | :--- |
| **區塊一：基礎狀態與物理模擬** | `0 ~ 231` (232 Bytes) | 23 欄位 | 包含轉速, G 力, 車速向量, 懸吊壓縮, 輪胎滑移角/率, 氣缸數與等級 |
| **區塊二：V2 擴充與動態控制** | `232 ~ 323` (92 Bytes) | 18 欄位 | 包含 12B 保留區 (232~243), 3D 座標, 馬力/扭力, 胎溫, 增壓, 圈速, 踏板與檔位 |

---

## 驗證 SOP 與工具指示

- **實時 UDP 封包探針**：`python tools/verify_telemetry_v2_v3.py --scan --port 8000`
- **後端 UDP 測試**：`pytest tests/`
- **前端單元測試**：`cmd /c "pnpm -C frontend run test"`
