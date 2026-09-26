# 遙測單位契約與架構標準 (Telemetry Units Contract & Architecture Standard)

- **版本 (Version)**: 1.0.0
- **狀態 (Status)**: 正式規範 (Single Source of Truth / SSOT)
- **管轄範圍 (Scope)**: Forza Horizon 遙測資料流（UDP 接收端、Python/Rust 後端、MCP 診斷服務、WebSocket 廣播、React 前端與 HUD 疊加層）
- **關聯 Issue**: #423 (前後端調校與遙測責任釐清 Stacked PR 1)

---

## 1. 架構概述與三層職責模型 (3-Tier Telemetry Architecture)

為了徹底消除跨語言（Rust、Python、TypeScript）與前後端之間的單位混淆、雙重二次換算（Double Conversion）以及防禦性啟發式猜測（Heuristic Guessing），本專案將遙測資料流嚴格劃分為三層架構：

```
+-------------------------------------------------------------------------+
| Tier 1: 原生封包層 (Raw Wire UDP Layer)                                  |
| Forza Horizon Data Out UDP Socket (預設 Port: 8000, 324 bytes Little-Endian) |
| 原生物理單位: Pa, m/s, W, N·m, m/s², rad, rad/s, °F, 0..255 / -127..127  |
+-------------------------------------------------------------------------+
                                    │
                                    ▼ (二進位解包 & Plausibility 檢驗)
+-------------------------------------------------------------------------+
| Tier 2: 領域標準層 (Domain Canonical Layer)                             |
| Python / Rust 後端核心、記憶體模型、/ws/telemetry JSON 廣播契約          |
| 嚴格物理 SI 單位規範:                                                    |
| - 增壓值 (Boost): 帕斯卡 (Pa, 表壓)                                      |
| - 車速 (Speed): 公尺/秒 (m/s)                                            |
| - 功率 (Power): 瓦特 (W)                                                 |
| - 扭力 (Torque): 牛頓·米 (N·m)                                           |
| - 加速度 (Acceleration): 公尺/秒² (m/s²)                                 |
| - 角度與角速度 (Angles / Rates): 弧度 (rad), 弧度/秒 (rad/s)              |
| - 輪胎溫度 (Tire Temp): 華氏度 (°F, 保留硬體原始刻度)                     |
| - 滑移率與行程 (Slip / Travel): 無因次比值 (Ratio, 0.0..1.0 / >=1.0)     |
| - 駕駛輸入 (Driver Inputs): 原生 Byte (0..255) 與 正規化百分比 (0..100%)|
+-------------------------------------------------------------------------+
                                    │
                                    ▼ (依使用者偏好進行唯讀呈現轉換)
+-------------------------------------------------------------------------+
| Tier 3: 呈現展示層 (Presentation Layer)                                  |
| 前端 UI 組件、HUD 疊加面板、MCP 智慧診斷輸出、MoTeC / CSV 匯出            |
| 人性化顯示單位:                                                          |
| - 增壓: bar (Pa/100,000), psi (Pa/6894.76), kPa (Pa/1,000)              |
| - 車速: km/h (m/s * 3.6), mph (m/s * 2.23694)                           |
| - 功率: kW (W/1000), HP (W/745.7), PS (kW * 1.35962)                     |
| - 扭力: N·m, lb·ft (N·m * 0.737562)                                     |
| - 加速度: G 值 (m/s² / 9.81)                                             |
| - 輪胎溫度: 攝氏度 (°C, (°F-32)*5/9), 華氏度 (°F)                        |
| - 輪胎滑移: 滑移角角度 (° = rad * 180 / π), 滑移率百分比 (% = ratio * 100)|
+-------------------------------------------------------------------------+
```

### 1.1 架構核心不變量 (Core Invariants)
1. **單一轉換點 (Single Point of Conversion)**：資料從 Tier 1 到 Tier 2 僅進行二進位解構，數值維持原始物理量；從 Tier 2 到 Tier 3 僅進行一次性展示轉換。嚴禁在 Tier 3 內部對已經轉換過的單位再次執行二次轉換。
2. **零啟發式猜測 (Zero Heuristics)**：各層介面皆具備嚴格的型別與單位合約。嚴禁任何基於數值大小（如 `if > 1000` 或 `if > 5`）的單位猜測程式碼。

---

## 2. 86 遙測欄位完整位元組映射 (Exhaustive 86 Fields Byte Map)

Forza Horizon Data Out V2 封包總長度為 **324 位元組 (324 Bytes, Little-Endian)**。
前 232 位元組為 Legacy Common 區塊，232 至 321 位元組為 FH6 V2 擴充區塊，321 至 324 位元組為對齊與保留位元組。
完整解析欄位共計 **86 個欄位 (索引 0 至 85)**，詳見下表：

| # (索引) | 欄位名稱 (Field Name) | 資料型別 (C/Rust) | Python Struct | 位元組偏移 (Offset) | 大小 (Bytes) | 原生單位 (Raw Wire) | 領域標準單位 (Domain Canonical) | 呈現單位與轉換公式 (Presentation Formula) |
|---|---|---|---|---|---|---|---|---|
| 0 | `IsRaceOn` | `i32` (`s32`) | `<i` | 0..4 | 4 | flag (0/1) | integer (0=暫停, 1=比賽中) | "Racing" / "Paused" / "Menu" |
| 1 | `TimestampMS` | `u32` | `<I` | 4..8 | 4 | ms | milliseconds (`ms`) | 秒數: `TimestampMS / 1000.0` |
| 2 | `EngineMaxRpm` | `f32` | `<f` | 8..12 | 4 | RPM | RPM (`f32`) | 整數顯示: `round(rpm, 0)` |
| 3 | `EngineIdleRpm` | `f32` | `<f` | 12..16 | 4 | RPM | RPM (`f32`, 0.0=EV) | 怠速轉速 (或純電車 EV 標記) |
| 4 | `CurrentEngineRpm` | `f32` | `<f` | 16..20 | 4 | RPM | RPM (`f32`) | 即時轉速儀錶顯示: `round(rpm, 0)` |
| 5 | `AccelerationX` | `f32` | `<f` | 20..24 | 4 | m/s² | m/s² (車身座標 右 +X) | 側向 G 值: `accel_x / 9.81` |
| 6 | `AccelerationY` | `f32` | `<f` | 24..28 | 4 | m/s² | m/s² (車身座標 上 +Y) | 垂直 G 值: `accel_y / 9.81` |
| 7 | `AccelerationZ` | `f32` | `<f` | 28..32 | 4 | m/s² | m/s² (車身座標 前 +Z) | 縱向 G 值: `accel_z / 9.81` |
| 8 | `VelocityX` | `f32` | `<f` | 32..36 | 4 | m/s | m/s (車身座標 右 +X) | km/h (`* 3.6`), mph (`* 2.23694`) |
| 9 | `VelocityY` | `f32` | `<f` | 36..40 | 4 | m/s | m/s (車身座標 上 +Y) | km/h (`* 3.6`), mph (`* 2.23694`) |
| 10 | `VelocityZ` | `f32` | `<f` | 40..44 | 4 | m/s | m/s (車身座標 前 +Z) | km/h (`* 3.6`), mph (`* 2.23694`) |
| 11 | `AngularVelocityX` | `f32` | `<f` | 44..48 | 4 | rad/s | rad/s (俯仰角速度 Pitch Rate) | 度/秒: `rad_s * 180.0 / π` |
| 12 | `AngularVelocityY` | `f32` | `<f` | 48..52 | 4 | rad/s | rad/s (偏航角速度 Yaw Rate) | 度/秒: `rad_s * 180.0 / π` |
| 13 | `AngularVelocityZ` | `f32` | `<f` | 52..56 | 4 | rad/s | rad/s (翻滾角速度 Roll Rate) | 度/秒: `rad_s * 180.0 / π` |
| 14 | `Yaw` | `f32` | `<f` | 56..60 | 4 | rad | 弧度 (`rad`) | 角度: `yaw * 180.0 / π` |
| 15 | `Pitch` | `f32` | `<f` | 60..64 | 4 | rad | 弧度 (`rad`) | 角度: `pitch * 180.0 / π` |
| 16 | `Roll` | `f32` | `<f` | 64..68 | 4 | rad | 弧度 (`rad`) | 角度: `roll * 180.0 / π` |
| 17 | `NormalizedSuspensionTravel[0]` (FL) | `f32` | `<f` | 68..72 | 4 | ratio (0..1) | 無因次比值 (0=全放伸, 1=觸底) | 行程百分比: `ratio * 100.0` |
| 18 | `NormalizedSuspensionTravel[1]` (FR) | `f32` | `<f` | 72..76 | 4 | ratio (0..1) | 無因次比值 (0=全放伸, 1=觸底) | 行程百分比: `ratio * 100.0` |
| 19 | `NormalizedSuspensionTravel[2]` (RL) | `f32` | `<f` | 76..80 | 4 | ratio (0..1) | 無因次比值 (0=全放伸, 1=觸底) | 行程百分比: `ratio * 100.0` |
| 20 | `NormalizedSuspensionTravel[3]` (RR) | `f32` | `<f` | 80..84 | 4 | ratio (0..1) | 無因次比值 (0=全放伸, 1=觸底) | 行程百分比: `ratio * 100.0` |
| 21 | `TireSlipRatio[0]` (FL) | `f32` | `<f` | 84..88 | 4 | ratio | 無因次比值 (1.0 = 100% 滑移) | 滑移率百分比: `ratio * 100.0` |
| 22 | `TireSlipRatio[1]` (FR) | `f32` | `<f` | 88..92 | 4 | ratio | 無因次比值 (1.0 = 100% 滑移) | 滑移率百分比: `ratio * 100.0` |
| 23 | `TireSlipRatio[2]` (RL) | `f32` | `<f` | 92..96 | 4 | ratio | 無因次比值 (1.0 = 100% 滑移) | 滑移率百分比: `ratio * 100.0` |
| 24 | `TireSlipRatio[3]` (RR) | `f32` | `<f` | 96..100 | 4 | ratio | 無因次比值 (1.0 = 100% 滑移) | 滑移率百分比: `ratio * 100.0` |
| 25 | `WheelRotationSpeed[0]` (FL) | `f32` | `<f` | 100..104 | 4 | rad/s | rad/s (輪圈轉速) | 輪圈轉速 RPM: `rad_s * 30.0 / π` |
| 26 | `WheelRotationSpeed[1]` (FR) | `f32` | `<f` | 104..108 | 4 | rad/s | rad/s (輪圈轉速) | 輪圈轉速 RPM: `rad_s * 30.0 / π` |
| 27 | `WheelRotationSpeed[2]` (RL) | `f32` | `<f` | 108..112 | 4 | rad/s | rad/s (輪圈轉速) | 輪圈轉速 RPM: `rad_s * 30.0 / π` |
| 28 | `WheelRotationSpeed[3]` (RR) | `f32` | `<f` | 112..116 | 4 | rad/s | rad/s (輪圈轉速) | 輪圈轉速 RPM: `rad_s * 30.0 / π` |
| 29 | `WheelOnRumbleStrip[0]` (FL) | `i32` (`s32`) | `<i` | 116..120 | 4 | flag (0/1) | integer (0/1) | 路緣石接觸指示 |
| 30 | `WheelOnRumbleStrip[1]` (FR) | `i32` (`s32`) | `<i` | 120..124 | 4 | flag (0/1) | integer (0/1) | 路緣石接觸指示 |
| 31 | `WheelOnRumbleStrip[2]` (RL) | `i32` (`s32`) | `<i` | 124..128 | 4 | flag (0/1) | integer (0/1) | 路緣石接觸指示 |
| 32 | `WheelOnRumbleStrip[3]` (RR) | `i32` (`s32`) | `<i` | 128..132 | 4 | flag (0/1) | integer (0/1) | 路緣石接觸指示 |
| 33 | `WheelInPuddle[0]` (FL) | `f32` | `<f` | 132..136 | 4 | ratio / depth | 無因次深度比值 (0.0..1.0) | 水坑深度百分比: `val * 100.0` |
| 34 | `WheelInPuddle[1]` (FR) | `f32` | `<f` | 136..140 | 4 | ratio / depth | 無因次深度比值 (0.0..1.0) | 水坑深度百分比: `val * 100.0` |
| 35 | `WheelInPuddle[2]` (RL) | `f32` | `<f` | 140..144 | 4 | ratio / depth | 無因次深度比值 (0.0..1.0) | 水坑深度百分比: `val * 100.0` |
| 36 | `WheelInPuddle[3]` (RR) | `f32` | `<f` | 144..148 | 4 | ratio / depth | 無因次深度比值 (0.0..1.0) | 水坑深度百分比: `val * 100.0` |
| 37 | `SurfaceRumble[0]` (FL) | `f32` | `<f` | 148..152 | 4 | ratio (0..1) | 無因次震動比值 (0.0..1.0) | 路面粗糙度百分比: `val * 100.0` |
| 38 | `SurfaceRumble[1]` (FR) | `f32` | `<f` | 152..156 | 4 | ratio (0..1) | 無因次震動比值 (0.0..1.0) | 路面粗糙度百分比: `val * 100.0` |
| 39 | `SurfaceRumble[2]` (RL) | `f32` | `<f` | 156..160 | 4 | ratio (0..1) | 無因次震動比值 (0.0..1.0) | 路面粗糙度百分比: `val * 100.0` |
| 40 | `SurfaceRumble[3]` (RR) | `f32` | `<f` | 160..164 | 4 | ratio (0..1) | 無因次震動比值 (0.0..1.0) | 路面粗糙度百分比: `val * 100.0` |
| 41 | `TireSlipAngle[0]` (FL) | `f32` | `<f` | 164..168 | 4 | rad | 弧度 (`rad`) | 角度: `slip_angle * 180.0 / π` |
| 42 | `TireSlipAngle[1]` (FR) | `f32` | `<f` | 168..172 | 4 | rad | 弧度 (`rad`) | 角度: `slip_angle * 180.0 / π` |
| 43 | `TireSlipAngle[2]` (RL) | `f32` | `<f` | 172..176 | 4 | rad | 弧度 (`rad`) | 角度: `slip_angle * 180.0 / π` |
| 44 | `TireSlipAngle[3]` (RR) | `f32` | `<f` | 176..180 | 4 | rad | 弧度 (`rad`) | 角度: `slip_angle * 180.0 / π` |
| 45 | `TireCombinedSlip[0]` (FL) | `f32` | `<f` | 180..184 | 4 | ratio | 無因次綜合滑移比值 | 綜合滑移率數值: `round(val, 2)` |
| 46 | `TireCombinedSlip[1]` (FR) | `f32` | `<f` | 184..188 | 4 | ratio | 無因次綜合滑移比值 | 綜合滑移率數值: `round(val, 2)` |
| 47 | `TireCombinedSlip[2]` (RL) | `f32` | `<f` | 188..192 | 4 | ratio | 無因次綜合滑移比值 | 綜合滑移率數值: `round(val, 2)` |
| 48 | `TireCombinedSlip[3]` (RR) | `f32` | `<f` | 192..196 | 4 | ratio | 無因次綜合滑移比值 | 綜合滑移率數值: `round(val, 2)` |
| 49 | `SuspensionTravelMeters[0]` (FL) | `f32` | `<f` | 196..200 | 4 | m | 公尺 (`m`) | 毫米: `m * 1000.0`, 英吋: `m * 39.37` |
| 50 | `SuspensionTravelMeters[1]` (FR) | `f32` | `<f` | 200..204 | 4 | m | 公尺 (`m`) | 毫米: `m * 1000.0`, 英吋: `m * 39.37` |
| 51 | `SuspensionTravelMeters[2]` (RL) | `f32` | `<f` | 204..208 | 4 | m | 公尺 (`m`) | 毫米: `m * 1000.0`, 英吋: `m * 39.37` |
| 52 | `SuspensionTravelMeters[3]` (RR) | `f32` | `<f` | 208..212 | 4 | m | 公尺 (`m`) | 毫米: `m * 1000.0`, 英吋: `m * 39.37` |
| 53 | `CarOrdinal` | `i32` (`s32`) | `<i` | 212..216 | 4 | ID | 車輛資料庫序號 ID | 車輛識別顯示名稱 |
| 54 | `CarClass` | `i32` (`s32`) | `<i` | 216..220 | 4 | enum (0..7) | integer (0=D, 1=C, 2=B, 3=A, 4=S1, 5=S2, 6=X) | 車輛組別徽章 ("D".."X") |
| 55 | `CarPerformanceIndex` | `i32` (`s32`) | `<i` | 220..224 | 4 | PI | PI 性能分級數值 (100..999) | 性能分級標籤 (如 "S1 900") |
| 56 | `DrivetrainType` | `i32` (`s32`) | `<i` | 224..228 | 4 | enum (0..2) | integer (0=FWD, 1=RWD, 2=AWD) | "FWD" / "RWD" / "AWD" |
| 57 | `NumCylinders` (`Cylinders`) | `i32` (`s32`) | `<i` | 228..232 | 4 | count | 汽缸數量 | 引擎規格字串 (如 "V8", "4 cyl") |
| 58 | `CarGroup` | `u32` / `i32` | `<I` | 232..236 | 4 | ID | 車輛群組 ID | 分類標籤 |
| 59 | `SmashableVelDiff` | `f32` | `<f` | 236..240 | 4 | m/s | m/s (碰撞速度差) | km/h (`* 3.6`) |
| 60 | `SmashableMass` | `f32` | `<f` | 240..244 | 4 | kg | 公斤 (`kg`) | kg, lbs (`* 2.20462`) |
| 61 | `PositionX` | `f32` | `<f` | 244..248 | 4 | m | 公尺 (`m`) | 座標顯示: `round(x, 2)` |
| 62 | `PositionY` | `f32` | `<f` | 248..252 | 4 | m | 公尺 (`m`) | 高程顯示: `round(y, 2)` |
| 63 | `PositionZ` | `f32` | `<f` | 252..256 | 4 | m | 公尺 (`m`) | 座標顯示: `round(z, 2)` |
| 64 | `SpeedMetersPerSecond` (`Speed`) | `f32` | `<f` | 256..260 | 4 | m/s | 公尺/秒 (`m/s`) | **km/h (`* 3.6`), mph (`* 2.23694`)** |
| 65 | `PowerWatts` (`Power`) | `f32` | `<f` | 260..264 | 4 | W | 瓦特 (`W`) | **kW (`/1000.0`), HP (`/745.7`), PS (`kW*1.35962`)** |
| 66 | `TorqueNewtons` (`Torque`) | `f32` | `<f` | 264..268 | 4 | N·m | 牛頓·米 (`N·m`) | **N·m, lb·ft (`* 0.737562`)** |
| 67 | `TireTemp[0]` (FL) | `f32` | `<f` | 268..272 | 4 | °F | 華氏度 (`°F`) | **攝氏度: `(°F - 32.0) * 5.0 / 9.0`** |
| 68 | `TireTemp[1]` (FR) | `f32` | `<f` | 272..276 | 4 | °F | 華氏度 (`°F`) | **攝氏度: `(°F - 32.0) * 5.0 / 9.0`** |
| 69 | `TireTemp[2]` (RL) | `f32` | `<f` | 276..280 | 4 | °F | 華氏度 (`°F`) | **攝氏度: `(°F - 32.0) * 5.0 / 9.0`** |
| 70 | `TireTemp[3]` (RR) | `f32` | `<f` | 280..284 | 4 | °F | 華氏度 (`°F`) | **攝氏度: `(°F - 32.0) * 5.0 / 9.0`** |
| 71 | `Boost` | `f32` | `<f` | 284..288 | 4 | Pa | **帕斯卡 (`Pa`)** | **bar (`/ 100000.0`), psi (`* 0.0001450377`), kPa (`/ 1000.0`)** |
| 72 | `Fuel` | `f32` | `<f` | 288..292 | 4 | ratio (0..1) | 燃油比值 (0.0..1.0) | 燃油百分比: `fuel * 100.0` |
| 73 | `DistanceTraveled` | `f32` | `<f` | 292..296 | 4 | m | 公尺 (`m`) | m, km (`/ 1000.0`), mi (`/ 1609.344`) |
| 74 | `BestLap` | `f32` | `<f` | 296..300 | 4 | s | 秒數 (`s`) | 圈速格式化: `mm:ss.xxx` |
| 75 | `LastLap` | `f32` | `<f` | 300..304 | 4 | s | 秒數 (`s`) | 圈速格式化: `mm:ss.xxx` |
| 76 | `CurrentLap` | `f32` | `<f` | 304..308 | 4 | s | 秒數 (`s`) | 本圈時間: `mm:ss.xxx` |
| 77 | `CurrentRaceTime` | `f32` | `<f` | 308..312 | 4 | s | 秒數 (`s`) | 賽事累計時間: `hh:mm:ss.xxx` |
| 78 | `LapNumber` | `u16` | `<H` | 312..314 | 2 | count | 圈數 (整數計數) | 圈數標籤 (如 `Lap 3`) |
| 79 | `RacePosition` | `u8` | `<B` | 314..315 | 1 | rank | 排名 (1..24) | 排名標籤 (如 `P1`) |
| 80 | `AccelInput` (`Accel`) | `u8` | `<B` | 315..316 | 1 | 0..255 | 原始 byte (0..255) | 油門開度: `val / 255.0 * 100.0` (%) |
| 81 | `BrakeInput` (`Brake`) | `u8` | `<B` | 316..317 | 1 | 0..255 | 原始 byte (0..255) | 煞車開度: `val / 255.0 * 100.0` (%) |
| 82 | `ClutchInput` (`Clutch`) | `u8` | `<B` | 317..318 | 1 | 0..255 | 原始 byte (0..255) | 離合器開度: `val / 255.0 * 100.0` (%) |
| 83 | `HandBrakeInput` (`HandBrake`) | `u8` | `<B` | 318..319 | 1 | 0..255 | 原始 byte (0..255) | 手煞車開度: `val / 255.0 * 100.0` (%) |
| 84 | `Gear` | `u8` | `<B` | 319..320 | 1 | 0..11 | 原始 byte (0=R, 11=N, 1..10) | 檔位字串: 0->"R", 11->"N", 1..10->數字 |
| 85 | `SteerInput` (`Steer`) | `i8` (`s8`) | `<b` | 320..321 | 1 | -127..127 | 原始 signed byte (-127..127) | 轉向開度: `val / 127.0 * 100.0` (%) 或 轉向角: `val / 127.0 * 45.0` (°) |

### 2.1 封包尾端對齊與保留位元組 (Offsets 321..324)

| 偏移 (Offset) | 型別 (Type) | 欄位定義 / 語意 | 說明與解析器狀態 |
|---|---|---|---|
| 321..322 | `i8` (`s8`) | `NormalizedDrivingLine` | 官方預留走線偏差 (-127..127)；目前解析器保留不暴露於 UI |
| 322..323 | `i8` (`s8`) | `NormalizedAIBrakeDifference` | 官方預留 AI 煞車差值 (-127..127)；目前解析器保留不暴露於 UI |
| 323..324 | `u8` | `AlignmentByte` | Struct 4 位元組記憶體邊界對齊填充 (Padding)；非遙測數據 |

總計封包大小：$321 + 3 = 324$ 位元組。

---

## 3. 核心物理量與高風險欄位轉換標準 (High-Risk Conversions SSOT)

### 3.1 增壓值 (Boost) 規範與 Issue #423 根因修復

#### 物理事實 (SSOT)
- Forza Horizon 物理引擎在二進位 UDP 封包（Offset 284..288）所傳送之 `Boost`，為 **帕斯卡 (Pa) 為單位之表壓 (Gauge Pressure)**。
- 渦輪增壓 1.50 bar 時，遊戲輸出為 `150,000.0 Pa`。
- 自然進氣 (NA) 車款或怠速時，增壓值為 `0.0 Pa`。

#### Issue #423 錯誤根因排查
在 `frontend/src/hooks/useTelemetry.ts` 原有實作中，存在以下錯誤：
```typescript
// 錯誤實作 (DEFECTIVE):
const boostPsi = Math.max(0, raw.Boost || 0); // 誤將 Pa 當作 PSI
const boostBar = Math.max(0, (raw.Boost || 0) / 14.5038); // 二次換算造成 10,000 倍放大！
const boostKpa = Math.max(0, (raw.Boost || 0) * 6.89476);
```
當 `raw.Boost = 150000.0 Pa` 時：
- `boostPsi` 被算成 **150,000 PSI**；
- `boostBar` 被算成 $150000 / 14.5038 =$ **10,342.12 bar**；
- HUD 顯示出數千倍天文數字。

#### 正確轉換公式 (SSOT)
```typescript
// 正確實作 (CORRECT):
const rawBoostPa = Math.max(0, raw.Boost || 0);
const boostBar = rawBoostPa / 100000.0;
const boostPsi = rawBoostPa * 0.0001450377377; // 或 rawBoostPa / 6894.75729
const boostKpa = rawBoostPa / 1000.0;
```
- $150,000\text{ Pa} \rightarrow 1.50\text{ bar}$, $21.76\text{ PSI}$, $150.0\text{ kPa}$。
- 嚴禁進行任何「先將 Pa 視為 PSI，再除以 14.5038 換算為 bar」之二次換算。

---

### 3.2 加速度 (Acceleration) 與 G 值規範

#### 物理事實 (SSOT)
- Forza Horizon UDP 封包中的 `AccelerationX`、`AccelerationY`、`AccelerationZ`，其單位唯一且固定為 **$m/s^2$**。
- 座標系：車身局部座標系（Local Vehicle Space），$X$ 為向右，$Y$ 為向上（重力靜止時約為 $+9.81\ m/s^2$），$Z$ 為向前。

#### 啟發式錯誤分析與嚴格禁用
在舊版 MCP 服務中：
```python
# 致命啟發式 (FORBIDDEN HEURISTIC):
"lateral_g": round(accel_x / 9.81 if abs(accel_x) > 5 else accel_x, 3)
```
- **破壞場景**：當車輛於一般巡航或微幅轉向時，側向加速度介於 0.1 G 至 0.5 G 之間（即 $0.981 \sim 4.905\ m/s^2$）。因為 $|accel\_x| < 5$，該條件直接略過除以 9.81，**將 $3.924\ m/s^2$ 誤當作 3.924 G 輸出**，產生 981% 的離譜失真！
- **規範約束**：轉換為 G 值必須**無條件除以 9.81**，嚴禁任何 `if abs(accel) > 5` 條件判斷。

---

### 3.3 輪胎滑移角 (Tire Slip Angle) 與滑移率 (Tire Slip Ratio)

#### 物理事實 (SSOT)
- `TireSlipAngle`：單位為 **弧度 (rad)**。
  - 呈現轉換：$\text{deg} = \text{rad} \times 180.0 / \pi$。
  - 嚴禁 `if abs(slip_angle) < 10` 猜測。
- `TireSlipRatio`：單位為 **無因次比值 (Ratio, 1.0 = 100%)**。
  - 呈現轉換：$\text{pct} = \text{ratio} \times 100.0$。
  - **啟發式危害**：舊代碼 `r * 100.0 if abs(r) <= 5.0 else r` 在車輛原地燒胎 (Burnout) 或極端打滑時（$\text{ratio} = 6.0$，即 600% 滑移），會誤判為已經是百分比，直接輸出 $6.0\%$！
  - 規範約束：必須**無條件乘以 100.0**，嚴禁 `if abs(r) <= 5.0`。

---

### 3.4 懸吊行程 (NormalizedSuspensionTravel)

#### 物理事實 (SSOT)
- 封包欄位名稱為 **`NormalizedSuspensionTravel`**，為 4 輪 Float32 陣列，範圍在 0.0（完全拉伸 Droop）到 1.0（完全壓縮 Bump / 觸底 Bottoming）之間。
- 呈現轉換：`travel_pct = clamp(travel, 0.0, 1.0) * 100.0`。
- 觸底判定閥值：`is_bottoming = travel >= 0.95`。
- 鍵值規範：MCP 與分析服務必須優先讀取 `NormalizedSuspensionTravel`，兼容歷程別名 `SuspTravel`，嚴禁因缺少鍵名退回全 0 預設值。

---

## 4. MCP 服務 `sample_data` 輸入規格與啟發式清理規範

### 4.1 介面合約 (Interface Contract)
`backend-rust/src/mcp/service.rs` 中的 4 個遙測工具函式（原 Python 參考保存於 Git `ec7d769`）：
- `get_driver_cockpit_telemetry`
- `get_vehicle_dynamics_telemetry`
- `get_tires_status_telemetry`
- `get_suspension_telemetry`

**輸入規範 (Strict Precondition)**：
1. `sample_data` 參數若有提供，**必須為解碼後之 Raw UDP 封包字典**（即 Tier 1 解碼後、尚未進行呈現轉換之原始數值字典）。
2. 字典欄位鍵名以 Forza 原始命名為準（如 `AccelerationX`, `Boost`, `TireSlipAngle`, `TireSlipRatio`, `NormalizedSuspensionTravel`）。
3. 若 `sample_data` 為 `None`，服務自動向即時遙測佇列或資料庫索取最新 Raw 樣本。

### 4.2 徹底移除之啟發式代碼清單
- ❌ 移除 `if abs(accel) > 5`
- ❌ 移除 `if boost > 1000`
- ❌ 移除 `if abs(slip) < 10`
- ❌ 移除 `if abs(r) <= 5.0`
- ❌ 移除對預先換算單位（G、PSI、度數、百分比）的模糊相容分支。

---

## 5. 跨端 Golden Fixture 驗證標準 (`telemetry_canonical_fixtures.json`)

為了防止任何語言或端點發生規格偏離，建立跨前後端之標準測試資料夾具 `tests/fixtures/telemetry_canonical_fixtures.json`。

### 5.1 必備測試案例矩陣 (Test Cases Matrix)

1. **`typical_gt_racing`** (典型 GT 賽道巡航/過彎):
   - `Boost`: 150000.0 Pa (1.5 bar)
   - `SpeedMetersPerSecond`: 50.0 m/s (180 km/h / 111.85 mph)
   - `AccelerationX`: 11.772 m/s² (1.20 G 側向過彎)
   - `AccelerationY`: 9.81 m/s² (1.00 G 重力基準)
   - `AccelerationZ`: -7.848 m/s² (-0.80 G 減速煞車)
   - `TireSlipAngle`: [0.06, 0.06, 0.02, 0.02] rad (約 3.44° / 1.15°)
   - `TireSlipRatio`: [0.08, 0.08, 0.01, 0.01] (8.0% / 1.0%)
   - `TireTemp`: [190.0, 192.0, 185.0, 186.0] °F (87.8°C ~ 88.9°C)
   - `NormalizedSuspensionTravel`: [0.45, 0.48, 0.40, 0.42] (無觸底)

2. **`high_boost_extreme`** (極限雙渦輪高增壓):
   - `Boost`: 350000.0 Pa (3.50 bar / 50.76 PSI / 350.0 kPa)
   - `SpeedMetersPerSecond`: 85.0 m/s (306 km/h)
   - `PowerWatts`: 750000.0 W (750 kW / 1005.8 HP)
   - `TorqueNewtons`: 1050.0 N·m (774.4 lb·ft)
   - 驗證高壓下之增壓值、馬力與極速計算無溢位與單位截斷。

3. **`na_low_accel_vacuum`** (自然進氣與輕度加速 — 專項破解 `abs(accel) > 5` 與 `boost > 1000` 舊漏洞):
   - `Boost`: 0.0 Pa (自然進氣，無增壓)
   - `AccelerationX`: 3.924 m/s² (換算為 0.40 G，此數值 $< 5.0\ m/s^2$；舊代碼會誤當作 3.924 G 輸出，本案例專用於斷言新代碼必須正確輸出 0.40 G！)
   - `AccelerationZ`: 1.962 m/s² (0.20 G 縱向加速)
   - 驗證增壓值為 0.0 bar / 0.0 PSI，且 G 值為精確 0.40 G 與 0.20 G。

4. **`high_slip_burnout`** (原地燒胎極限打滑 — 專項破解 `abs(r) <= 5.0` 舊漏洞):
   - `TireSlipRatio`: [6.0, 6.0, 0.0, 0.0] (驅動輪輪速為車速 7 倍，滑移率 600%；舊代碼會誤判定為已是百分比直接輸出 6.0%，本案例專用於斷言新代碼必須正確輸出 600.0%！)
   - `NormalizedSuspensionTravel`: [0.98, 0.98, 0.40, 0.40] (前懸吊嚴重壓縮觸底，驗證 `is_bottoming: true`)
   - `TireTemp`: [248.0, 248.0, 180.0, 180.0] °F (前輪過熱 120.0°C)

---

## 6. 三端消費與驗證指引 (Cross-Stack Verification Guidelines)

| 測試框架 | 測試檔案位置 | 驗證項目 | 執行指令 |
|---|---|---|---|
| **Vitest (前端)** | `frontend/src/hooks/__tests__/useTelemetry.test.ts` | 驗證 `formatHudTelemetry` 在各種增壓與車速下之單位顯示，確保無 10,000x 放大 | `cmd /c "pnpm -C frontend run test"` |
| **Pytest (後端)** | `tests/test_telemetry_canonical_contract.py` | 驗證 `McpService` 遙測格式化函式接收 Raw UDP 字典並產出標準 Canonical 輸出 | `uv run --no-project --python .venv\Scripts\python.exe python -m pytest tests/` |
| **Cargo (後端)** | `backend-rust/tests/telemetry_canonical_contract.rs` | 驗證 Rust `McpService` 與封包解析產出完全相同的 Canonical 輸出 | `cargo test --locked --manifest-path backend-rust/Cargo.toml` |
