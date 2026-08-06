---
name: telemetry-udp-protocol
description: 處理 Forza Horizon UDP 遙測封包解析、324-byte 二進位 struct 格式、高頻 UDP 效能維護與物理單位轉換時觸發此技能。
---

# Forza UDP 遙測協議與位元組封包處理指南 (Telemetry UDP Protocol Skill)

## 核心原則

1. **零同步阻塞 (Zero Blocking I/O)**：
   - UDP 接收主循環 (`telemetry_listener.py`) 執行頻率高達 60Hz+。
   - **嚴禁**在主循環中放置同步阻塞檔案寫入、HTTP 請求或高開銷運算。

2. **小端序 (Little-Endian) 與 324 位元組 Data Out 實測結構**：
   - 封包資料採 UDP 單向廣播，長度固定為 324 位元組 (Bytes)，採用小端序 (Little-Endian) 編碼。
   - **避坑經驗 1 (V2 區塊對齊)**：232 ~ 243 位元組為 12 位元組的保留間隔 (Reserved Padding)，因此 V2 區塊之真實解包 Offset 必須由 **244 位元組** 起算（`Position` 從 244 開始、`Speed` 從 256 開始）。
   - **避坑經驗 2 (尾部欄位實測掃描結果)**：
     - **`DataPacketId` 處理**：全封包中**不存在**獨立的 +1 遞增整數 `DataPacketId` 欄位。遊戲以 Offset 4 的 `TimestampMS` (毫秒時間戳記) 作為影格時間依據。
     - **`DeltaT` 處理**：全封包中**不存在**獨立 Float32 `DeltaT` 欄位。每幀模擬時間間隔必須由兩幀 `TimestampMS` 相減得出：$\Delta T = (TimestampMS_k - TimestampMS_{k-1}) / 1000.0$（實測影格間隔約 `0.016786 s`，對應 59.57Hz）。
     - **位元組 312 ~ 323 真實內容**：實測為 `LapNumber` (312), `RacePosition` (314), `AccelInput` (315), `BrakeInput` (316), `ClutchInput` (317), `HandBrakeInput` (318), `Gear` (319), `SteerInput` (320), `DrivingLine` (321), `AIPrbBrake` (322)。

3. **原生單位與顯示單位轉換規範**：
   - 速度：公尺/秒 ($m/s$) 轉 $km/h$ (乘以 $3.6$)。
   - 壓力/增壓：磅/平方英寸 ($PSI$) / 帕斯卡 ($Pa$)。
   - 功率/馬力：瓦特 ($W$) 轉 $hp$ (除以 $745.7$)。
   - 扭力：牛頓米 ($N \cdot m$)。
   - 加速度：$m/s^2$ 轉 $G$ 值 (除以 $9.81$)。
   - 胎溫：華氏 (℉) 轉 攝氏 (℃) ($℃ = (℉ - 32) \times 5 / 9$)。

---

## 324 位元組 Data Out 遙測封包實測真值表 (Verified Byte Offsets)

經由實時多封包連貫掃描工具 (`tools/verify_telemetry_v2_v3.py --scan`) 實機探測驗證，數據結構如下：

### 1. 遊戲基礎狀態與物理模擬（0 ~ 231 位元組）

| 位元組範圍 (Byte Offset) | 資料型態 | 欄位名稱 (Field Name) | 物理意義與實測數值範例 |
| :--- | :--- | :--- | :--- |
| 0 ~ 3 | s32 (Int32) | `IsRaceOn` | 是否在比賽中（1 = 開始，0 = 選單/暫停） |
| 4 ~ 7 | u32 (UInt32) | `TimestampMS` | 遊戲模擬時間戳記（毫秒，可用於推算 $\Delta T$） |
| 8 ~ 11 | f32 (Float) | `EngineMaxRpm` | 引擎最高轉速限制（紅線區，RPM） |
| 12 ~ 15 | f32 (Float) | `EngineIdleRpm` | 引擎怠速轉速（RPM） |
| 16 ~ 19 | f32 (Float) | `CurrentEngineRpm` | 當前引擎轉速（RPM） |
| 20 ~ 31 | f32[3] | `AccelerationX, Y, Z` | 車輛局部座標系加速 G 力（右/上/前，單位：$m/s^2$） |
| 32 ~ 43 | f32[3] | `VelocityX, Y, Z` | 車輛局部座標系速度向量（右/上/前，單位：$m/s$） |
| 44 ~ 55 | f32[3] | `AngularVelocityX, Y, Z` | 車輛局部座標系角速度（俯仰 Pitch/偏航 Yaw/翻滾 Roll） |
| 56 ~ 67 | f32[3] | `Yaw, Pitch, Roll` | 車輛世界座標系姿態角（單位：弧度 rad） |
| 68 ~ 83 | f32[4] | `NormalizedSuspensionTravel` | 四輪懸吊壓縮量（FL, FR, RL, RR），範圍 0.0 ~ 1.0 |
| 84 ~ 99 | f32[4] | `WheelSlipRatio` | 四輪輪胎滑移率（> 1.0 或 < -1.0 代表輪胎打滑/鎖死） |
| 100 ~ 115 | f32[4] | `WheelRotationSpeed` | 四輪輪胎旋轉速度（單位：弧度/秒 rad/s） |
| 116 ~ 131 | s32[4] | `WheelOnRumbleStrip` | 四輪是否壓在路沿石/減速帶上（1 = 是，0 = 否） |
| 132 ~ 147 | f32[4] | `WheelInPuddleDepth` | 四輪壓過水坑積水深度（0.0 ~ 1.0） |
| 148 ~ 163 | f32[4] | `SurfaceRumbleTouchdownMagnitude` | 四輪路面震動觸地力道 |
| 164 ~ 179 | f32[4] | `WheelSlipAngle` | 四輪輪胎滑移角（單位：弧度 rad） |
| 180 ~ 195 | f32[4] | `WheelCombinedSlip` | 四輪複合打滑係數 |
| 196 ~ 211 | f32[4] | `SuspensionTravelMeters` | 四輪懸吊實際行程絕對值（單位：公尺 m） |
| 212 ~ 215 | s32 (Int32) | `CarOrdinal` | 當前駕駛車輛內部編號 ID |
| 216 ~ 219 | s32 (Int32) | `CarClass` | 車輛等級（0 = D, 1 = C, 2 = B, 3 = A, 4 = S1, 5 = S2, 6 = X） |
| 220 ~ 223 | s32 (Int32) | `CarPerformanceIndex` | 車輛性能分數（PI 值，例如 899） |
| 224 ~ 227 | s32 (Int32) | `DrivetrainType` | 驅動配置（0 = FWD, 1 = RWD, 2 = AWD） |
| 228 ~ 231 | s32 (Int32) | `NumCylinders` | 引擎氣缸數 |

### 2. V2 儀表板擴充欄位實測真值（232 ~ 323 位元組）

| 位元組範圍 (Byte Offset) | 資料型態 | 欄位名稱 (Field Name) | 物理意義與實測驗證範例 |
| :--- | :--- | :--- | :--- |
| 232 ~ 243 | 12 Bytes | `Reserved Padding` | 遊戲內部對齊/保留區塊 |
| 244 ~ 255 | f32[3] | `PositionX, Y, Z` | 車輛地圖絕對 3D 位置座標（實測: `2280.6, 141.2, 2937.0`） |
| 256 ~ 259 | f32 (Float) | `Speed` | 車速（公尺/秒 $m/s$，實測 `36.56 m/s` = `131.6 km/h`） |
| 260 ~ 263 | f32 (Float) | `Power` | 引擎功率（瓦特 $W$，實測 `587664 W` = `788.1 HP`） |
| 264 ~ 267 | f32 (Float) | `Torque` | 引擎扭力（牛頓米 $N \cdot m$，實測 `770.27 N·m`） |
| 268 ~ 283 | f32[4] | `TireTemp` | 四輪輪胎表面溫度（FL, FR, RL, RR，實測 `105.6℉, 151.9℉, 94.5℉, 94.5℉`） |
| 284 ~ 287 | f32 (Float) | `Boost` | 增壓值（磅/平方英寸 $psi$，實測 `13.99 psi`） |
| 288 ~ 291 | f32 (Float) | `Fuel` | 剩餘油量/電量（實測 `1.00` = 100%） |
| 292 ~ 295 | f32 (Float) | `DistanceTraveled` | 本次總里程（公尺 m，實測 `753,108.8 m`） |
| 296 ~ 307 | f32[3] | `BestLap, LastLap, CurrentLap` | 最快單圈 / 上圈 / 本圈用時（秒 s） |
| 308 ~ 311 | f32 (Float) | `CurrentRaceTime` | 整場比賽總計時間（秒 s，實測 `6707.4 s` = 111.7 分鐘，Hex: `12 17 ce 45`） |
| 312 ~ 313 | u16 (UInt16) | `LapNumber` | 當前圈數（Hex: `00 00` = `0`） |
| 314 | u8 (UInt8) | `RacePosition` | 當前比賽名次（Hex: `00` = `0`） |
| 315 | u8 (UInt8) | `AccelInput` | 油門踩踏深度（0 ~ 255，Hex: `ff` = 全油門 `255`） |
| 316 | u8 (UInt8) | `BrakeInput` | 煞車踩踏深度（0 ~ 255，Hex: `00` = `0`） |
| 317 | u8 (UInt8) | `ClutchInput` | 離合器踩踏深度（0 ~ 255，Hex: `00` = `0`） |
| 318 | u8 (UInt8) | `HandBrakeInput` | 手煞車拉起深度（0 ~ 255，Hex: `00` = `0`） |
| 319 | u8 (UInt8) | `Gear` | 當前檔位（Hex: `02` = `2` 檔） |
| 320 | s8 (Int8) | `SteerInput` | 方向盤轉向角（-127 ~ 127，Hex: `ff` = `-1` 轉角） |
| 321 | s8 (Int8) | `DrivingLine` | 行車線偏離（-127 ~ 127） |
| 322 | s8 (Int8) | `AIPrbBrake` | AI 預期煞車 |
| 323 | 1 Byte | `Padding` | 尾部對齊位元組（Hex: `00`） |

---

## 驗證 SOP
- 使用實時 UDP 多封包探測腳本：`python tools/verify_telemetry_v2_v3.py --scan --port 8000`。
- 修改 UDP 解包與處理邏輯後，必須執行 Pytest 單元測試：`pytest tests/`。
- 前端遙測介面異動後，執行前端 Vitest 單元測試：`cmd /c "pnpm -C frontend run test"`。
