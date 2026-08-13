# Forza Horizon 324-Byte Data Out 遙測封包完整參數規格與使用狀態參考表

本文件為 [telemetry-udp-protocol SKILL](../SKILL.md) 之擴充參考資料，詳細記錄 Forza Horizon UDP Data Out 廣播封包全數 324 位元組 (0 ~ 323 Bytes) 的資料結構、物理意義、單位轉換公式以及在 **FH6-HorizonTuner** 專案中的實際解析與使用狀態。

> **連接埠邊界**：Forza Data Out 封包預設經由 UDP `127.0.0.1:8000` 接收；這與開發模式的 FastAPI/WebSocket HTTP/TCP `127.0.0.1:8001` 分離。下方 `--scan --port 8000` 範例只針對 UDP。

---

## 統計摘要 (Usage Summary)

* **封包總長度**：324 位元組 (Little-Endian 小端序)
* **參數欄位總數**：41 個獨立/向量欄位
* 🟢 **已解析並使用欄位**：34 個（涵蓋 G 力、速度、轉速、滑移角/率、四輪胎溫、懸吊壓縮、油門/煞車/離合/手煞/檔位/方向盤、地圖 3D 座標與單圈時間）
* ⚪ **尚未解析/未被使用欄位**：7 個（`AngularVelocity`, `WheelRotationSpeed`, `WheelOnRumbleStrip`, `WheelInPuddleDepth`, `SuspensionTravelMeters`, `DrivingLine`, `AIPrbBrake`）

---

## 1. 遊戲基礎狀態與物理模擬區塊（0 ~ 231 位元組）

| 位元組範圍 (Offset) | 資料型態 | 欄位名稱 (Field Name) | 物理意義與單位說明 | 專案使用狀態 (Usage Status) | 主要使用模組/組件 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `0 ~ 3` | s32 (Int32) | `IsRaceOn` | 是否在比賽中（1 = 開始，0 = 選單/暫停） | 🟢 已解析並使用 | `telemetry_listener.py` 封包過濾核心 |
| `4 ~ 7` | u32 (UInt32) | `TimestampMS` | 遊戲模擬時間戳記（毫秒 $ms$，用於計算 $\Delta T$） | 🟢 已解析並使用 | `telemetry_listener.py`, 前端時間軸 |
| `8 ~ 11` | f32 (Float) | `EngineMaxRpm` | 引擎最高轉速限制（紅線區，RPM） | 🟢 已解析並使用 | `VfdGauge`, `VfdAudio`, `TuningView` |
| `12 ~ 15` | f32 (Float) | `EngineIdleRpm` | 引擎怠速轉速（RPM） | 🟢 已解析並使用 | `VfdGauge`, `vfdAudioMath.ts` |
| `16 ~ 19` | f32 (Float) | `CurrentEngineRpm` | 當前引擎轉速（RPM） | 🟢 已解析並使用 | `VfdGauge`, `hud_overlay`, 音效引擎 |
| `20 ~ 31` | f32[3] | `AccelerationX, Y, Z` | 車輛局部座標系加速度向量（右/上/前，單位：$m/s^2$） | 🟢 已解析並使用 | `GForceRadar.tsx`, `tuningDiagnosis.ts`, MoTeC Exporter |
| `32 ~ 43` | f32[3] | `VelocityX, Y, Z` | 車輛局部座標系速度向量（右/上/前，單位：$m/s$） | 🟢 已解析並使用 | `tuningDiagnosis.ts` (車身滑移角 $\beta$ 計算), `customMathEngine.ts` |
| `44 ~ 55` | f32[3] | `AngularVelocityX, Y, Z` | 車輛局部座標系角速度（俯仰 Pitch/偏航 Yaw/翻滾 Roll，單位：$rad/s$） | ⚪ 未解析 / 未使用 | *預留未來賽車動態座艙/轉向過度診斷* |
| `56 ~ 67` | f32[3] | `Yaw, Pitch, Roll` | 車輛世界座標系姿態角（單位：弧度 rad） | 🟢 已解析並使用 | `hud_overlay`, `GForceRadar` 姿態補償 |
| `68 ~ 83` | f32[4] | `NormalizedSuspensionTravel` | 四輪懸吊壓縮量（FL, FR, RL, RR），範圍 0.0 ~ 1.0 | 🟢 已解析並使用 | `TuningDiagnosis`, `SuspensionCards`, 前端懸吊動態條 |
| `84 ~ 99` | f32[4] | `WheelSlipRatio` | 四輪輪胎縱向滑移率（> 1.0 代表驅動打滑，< -1.0 代表煞車鎖死） | 🟢 已解析並使用 | `tuningDiagnosis.ts`, `TireSlipCards` |
| `100 ~ 115` | f32[4] | `WheelRotationSpeed` | 四輪輪胎旋轉角速度（FL, FR, RL, RR，單位：弧度/秒 $rad/s$） | ⚪ 未解析 / 未使用 | *預留未來輪胎線速度 $v=\omega r$ 與 TCS 診斷* |
| `116 ~ 131` | s32[4] | `WheelOnRumbleStrip` | 四輪是否壓在路沿石/減速帶上（1 = 是，0 = 否） | ⚪ 未解析 / 未使用 | *預留未來路沿石吃線 (Kerb Strike) 統計* |
| `132 ~ 147` | f32[4] | `WheelInPuddleDepth` | 四輪壓過賽道水坑積水深度（範圍 0.0 ~ 1.0） | ⚪ 未解析 / 未使用 | *預留未來雨天水漂效應 (Hydroplaning) 預警* |
| `148 ~ 163` | f32[4] | `SurfaceRumbleTouchdownMagnitude` | 四輪路面震動觸地力道 | 🟢 已解析並使用 | `telemetryCards.ts` 路面震動卡片 |
| `164 ~ 179` | f32[4] | `WheelSlipAngle` | 四輪輪胎橫向滑移角（FL, FR, RL, RR，單位：弧度 rad） | 🟢 已解析並使用 | `tuningDiagnosis.ts`, `TireSlipCards` |
| `180 ~ 195` | f32[4] | `WheelCombinedSlip` | 四輪複合打滑係數（結合縱向滑移與橫向滑移） | 🟢 已解析並使用 | `tuningDiagnosis.ts`, 前端抓地力極限面板 |
| `196 ~ 211` | f32[4] | `SuspensionTravelMeters` | 四輪懸吊實際壓縮行程絕對長度（單位：公尺 $m$） | ⚪ 未解析 / 未使用 | *預留未來避震器極限衝擊行程實體診斷* |
| `212 ~ 215` | s32 (Int32) | `CarOrdinal` | 當前駕駛車輛內部編號 ID | 🟢 已解析並使用 | `useTelemetry.ts`, 車輛調校資料庫關聯 |
| `216 ~ 219` | s32 (Int32) | `CarClass` | 車輛等級（0 = D, 1 = C, 2 = B, 3 = A, 4 = S1, 5 = S2, 6 = X） | 🟢 已解析並使用 | 前端 UI 車身等級 Badge (D~X 標籤) |
| `220 ~ 223` | s32 (Int32) | `CarPerformanceIndex` | 車輛性能分數（PI 值，例如 899） | 🟢 已解析並使用 | 前端 UI PI 數值顯示 (S1 899 等) |
| `224 ~ 227` | s32 (Int32) | `DrivetrainType` | 驅動配置（0 = FWD 前驅, 1 = RWD 後驅, 2 = AWD 四驅） | 🟢 已解析並使用 | `tuningMath.ts` 彈簧/ARB 自動算牌公式 |
| `228 ~ 231` | s32 (Int32) | `NumCylinders` | 引擎氣缸數 | 🟢 已解析並使用 | `vfdAudioMath.ts` 引擎音效諧波頻率計算 |

---

## 2. V2 儀表板擴充與控制數據區塊（232 ~ 323 位元組）

> **實測重點避坑說明**：232 ~ 243 位元組為遊戲內部 12 位元組保留間隔 (Reserved Padding)，V2 區塊實際解包位址一律由 **244 位元組** 起算。

| 位元組範圍 (Offset) | 資料型態 | 欄位名稱 (Field Name) | 物理意義與單位說明 | 專案使用狀態 (Usage Status) | 主要使用模組/組件 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `232 ~ 243` | 12 Bytes | `Reserved Padding` | 遊戲內部對齊/保留區塊 | 🟢 程式碼自動跳過 | `telemetry_listener.py` (+12 Bytes 偏移對齊) |
| `244 ~ 255` | f32[3] | `PositionX, Y, Z` | 車輛地圖絕對 3D 位置座標（實測單位：公尺 $m$） | 🟢 已解析並使用 | `AnalysisView.tsx` 賽道地圖繪製, MoTeC GPS |
| `256 ~ 259` | f32 (Float) | `Speed` | 車速（公尺/秒 $m/s$，轉換：乘 3.6 轉 $km/h$） | 🟢 已解析並使用 | `VfdGauge`, `TelemetryView`, `hud_overlay` |
| `260 ~ 263` | f32 (Float) | `Power` | 引擎功率（瓦特 $W$，轉換：除以 745.7 轉 馬力 $HP$） | 🟢 已解析並使用 | `TelemetryCards`, `vfdGaugeMath.ts` |
| `264 ~ 267` | f32 (Float) | `Torque` | 引擎扭力（牛頓米 $N \cdot m$） | 🟢 已解析並使用 | `TelemetryCards`, `vfdGaugeMath.ts` |
| `268 ~ 283` | f32[4] | `TireTemp` | 四輪輪胎表面溫度（FL, FR, RL, RR，單位：華氏 ℉） | 🟢 已解析並使用 | `TireTempCards.tsx`, 胎溫三段熱能警示 |
| `284 ~ 287` | f32 (Float) | `Boost` | 增壓值（磅/平方英寸 $PSI$） | 🟢 已解析並使用 | `VfdGauge`, `BoostPressureMeter` |
| `288 ~ 291` | f32 (Float) | `Fuel` | 剩餘油量/電量（範圍 0.0 ~ 1.0） | 🟢 已解析並使用 | `TelemetryCards`, 油量百分比 Bar |
| `292 ~ 295` | f32 (Float) | `DistanceTraveled` | 本次行駛總里程（單位：公尺 $m$） | 🟢 已解析並使用 | `TelemetryRecorderContext.tsx`, 單圈里程 |
| `296 ~ 307` | f32[3] | `BestLap, LastLap, CurrentLap` | 最快單圈 / 上圈 / 本圈用時（單位：秒 $s$） | 🟢 已解析並使用 | `LapTimeDisplay.tsx`, `hud_overlay` |
| `308 ~ 311` | f32 (Float) | `CurrentRaceTime` | 整場比賽/賽事總計時間（單位：秒 $s$） | 🟢 已解析並使用 | `AnalysisView.tsx` 時間軸, MoTeC 總時長 |
| `312 ~ 313` | u16 (UInt16) | `LapNumber` | 當前圈數 | 🟢 已解析並使用 | `LapTimeDisplay.tsx`, 單圈紀錄切換器 |
| `314` | u8 (UInt8) | `RacePosition` | 當前比賽名次 (P1, P2...) | 🟢 已解析並使用 | `hud_overlay`, 名次 Badge |
| `315` | u8 (UInt8) | `AccelInput` | 油門踩踏深度（0 ~ 255） | 🟢 已解析並使用 | `PedalTraceCanvas.tsx`, 控制器踏板儀表 |
| `316` | u8 (UInt8) | `BrakeInput` | 煞車踩踏深度（0 ~ 255） | 🟢 已解析並使用 | `PedalTraceCanvas.tsx`, 控制器踏板儀表 |
| `317` | u8 (UInt8) | `ClutchInput` | 離合器踩踏深度（0 ~ 255） | 🟢 已解析並使用 | `PedalTraceCanvas.tsx` 離合器動態 Bar |
| `318` | u8 (UInt8) | `HandBrakeInput` | 手煞車拉起深度（0 ~ 255） | 🟢 已解析並使用 | `PedalTraceCanvas.tsx` 手煞車燈號 |
| `319` | u8 (UInt8) | `Gear` | 當前檔位（0 = R, 1~10 = 1~10檔, 11 = N） | 🟢 已解析並使用 | `VfdGauge`, `GearboxWidget`, `tuningMath` |
| `320` | s8 (Int8) | `SteerInput` | 方向盤轉向角（-127 至 127，代表左轉/右轉強度） | 🟢 已解析並使用 | `PedalTraceCanvas.tsx` 轉向角指針 |
| `321` | s8 (Int8) | `DrivingLine` | 賽道最佳行車線偏離量（-127 至 127） | ⚪ 未解析 / 未使用 | *預留未來走線精準度 (Racing Line Precision) 評分* |
| `322` | s8 (Int8) | `AIPrbBrake` | AI 預期煞車輔助強弱參數 | ⚪ 未解析 / 未使用 | *預留未來煞車點優化提示* |
| `323` | 1 Byte | `Padding` | 尾部單位對齊 Padding 位元組 (`0x00`) | 🟢 程式碼對齊排除 | 自動滿 324 位元組對齊 |

---

## 探測驗證工具指示

若需對未使用的 7 項參數進行驗證或開發新功能，請使用獨立探測腳本：
```bash
# 開啟實時 UDP 多封包探測探針
python tools/verify_telemetry_v2_v3.py --scan --port 8000
```
