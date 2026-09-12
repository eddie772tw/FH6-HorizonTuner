# Forza Horizon 6 Data Out 324-byte packet reference

本表是 `telemetry-udp-protocol` skill 的現行欄位參考，並把「官方封包欄位」與「目前 parser 是否解碼／保存」分開。官方來源是 [Forza Horizon 6 Data Out Documentation](https://support.forza.net/hc/en-us/articles/51744149102611-Forza-Horizon-6-Data-Out-Documentation)。封包固定 324 bytes、little-endian；遊戲以單向 UDP、通常依 frame rate 傳送到設定的 IP，專案開發預設為 `127.0.0.1:8000`。FastAPI/WebSocket 預設為 `127.0.0.1:8001`，兩者不可混用。

## 單位與 status 約定

- `decoded`：`backend/telemetry_listener.py` 已由 offset 解出，並經 finite／範圍檢查。
- `stored`：解碼值進入 `telemetry_contract.py`、WebSocket 或 `raw_json`；不表示每個 MoTeC 相容欄位都保留相同表示法。
- `unsupported`：官方欄位已知，但目前 parser 不解碼或產品不使用；保持 `unknown`，不得用 0 假裝觀測值。
- `normalized` slip 是無量綱值；它不是百分比、度或弧度。官方語意是 0 代表完整抓地，絕對值大於 1 代表失去抓地。

## 欄位表

| Offset | 官方型別／欄位 | 官方單位／語意 | 目前實作狀態 |
| --- | --- | --- | --- |
| 0–3 | S32 `IsRaceOn` | 1 race on，0 menu／停止 | decoded／used；停止封包不進 parser 的正常 race stream。 |
| 4–7 | U32 `TimestampMS` | 遊戲模擬毫秒 timestamp，可 eventually overflow | decoded／stored；用於 delta、單調性與 downsample。 |
| 8–11 | F32 `EngineMaxRpm` | RPM | decoded／used；實測 engine gate 的 redline source。 |
| 12–15 | F32 `EngineIdleRpm` | RPM | decoded／stored。 |
| 16–19 | F32 `CurrentEngineRpm` | RPM | decoded／used。 |
| 20–31 | F32×3 `AccelerationX/Y/Z` | m/s²；車輛 local X right、Y up、Z forward | decoded／stored；顯示或分析才轉 G。 |
| 32–43 | F32×3 `VelocityX/Y/Z` | m/s；車輛 local space | decoded／stored。 |
| 44–55 | F32×3 `AngularVelocityX/Y/Z` | rad/s；X pitch、Y yaw、Z roll | decoded／stored。 |
| 56–67 | F32×3 `Yaw/Pitch/Roll` | radians | decoded／stored。 |
| 68–83 | F32×4 `NormalizedSuspensionTravel` | 0 max stretch、1 max compression | decoded／stored。 |
| 84–99 | F32×4 `TireSlipRatio` | normalized、無量綱 | decoded／stored／used as context。 |
| 100–115 | F32×4 `WheelRotationSpeed` | rad/s | decoded／stored in decoded point；不是目前 Road gate。 |
| 116–131 | S32×4 `WheelOnRumbleStrip` | 1 on rumble strip、0 off | decoded／stored in decoded point；目前不作 Road completeness gate。 |
| 132–147 | S32×4 `WheelInPuddle` | 1 in puddle、0 out | unsupported；目前 parser 不解碼。 |
| 148–163 | F32×4 `SurfaceRumble` | non-dimensional controller rumble | decoded／stored。 |
| 164–179 | F32×4 `TireSlipAngle` | normalized、無量綱；不是 degrees/radians | decoded／stored／used in descriptive Road local comparison。 |
| 180–195 | F32×4 `TireCombinedSlip` | normalized、無量綱 | decoded／stored。 |
| 196–211 | F32×4 `SuspensionTravelMeters` | m | decoded／stored。 |
| 212–215 | S32 `CarOrdinal` | 車輛 make/model ID | decoded／stored；identity gate。 |
| 216–219 | S32 `CarClass` | 0 D 至 7 X | decoded／stored；identity gate。 |
| 220–223 | S32 `CarPerformanceIndex` | 100–999 官方範圍 | decoded／stored；identity gate。 |
| 224–227 | S32 `DrivetrainType` | 0 FWD、1 RWD、2 AWD | decoded／stored。 |
| 228–231 | S32 `NumCylinders` | 引擎缸數 | decoded／stored as `Cylinders`。 |
| 232–235 | U32 `CarGroup` | 車輛群組 ID | **unsupported／not generic padding**；官方 FH6 欄位，現行 parser 跳過。 |
| 236–239 | F32 `SmashableVelDiff` | 與可破壞物碰撞的速度損失，m/s | unsupported／not generic padding；contract 可識別名稱但現行 parser 未賦值。 |
| 240–243 | F32 `SmashableMass` | 最近撞到的可破壞物質量，kg | unsupported／not generic padding；contract 可識別名稱但現行 parser 未賦值。 |
| 244–255 | F32×3 `PositionX/Y/Z` | world position，m | decoded／stored。 |
| 256–259 | F32 `Speed` | m/s | decoded as `SpeedMetersPerSecond`；UI 可轉 km/h。 |
| 260–263 | F32 `Power` | W | decoded as `PowerWatts`；UI 可轉 HP（W / 745.7）。 |
| 264–267 | F32 `Torque` | N·m | decoded as `TorqueNewtons`。 |
| 268–283 | F32×4 `TireTemp` | 官方 tire temperature；目前 app raw contract 為 °F | decoded／stored；Road 報告明確轉 °C，不推論 IM／OM、輪胎內部溫度或胎壓。 |
| 284–287 | F32 `Boost` | PSI above atmospheric | decoded／stored。 |
| 288–291 | F32 `Fuel` | 0 empty 至 1 full | decoded／stored。 |
| 292–295 | F32 `DistanceTraveled` | m | decoded／stored。 |
| 296–307 | F32×3 `BestLap/LastLap/CurrentLap` | seconds；0 if not applicable | decoded／stored；`CurrentLap` 是目前圈經過秒數，不是圈 ID。 |
| 308–311 | F32 `CurrentRaceTime` | seconds since driving started | decoded／stored；race boundary context。 |
| 312–313 | U16 `LapNumber` | number of laps completed | decoded／stored／used as lap identity；不可由 `int(CurrentLap)` 取代。 |
| 314 | U8 `RacePosition` | current position | decoded／stored。 |
| 315–318 | U8×4 `Accel/Brake/Clutch/HandBrake` | 0–255 | decoded／stored；engine WOT gate 要求 Accel ≥250 且其他三者為 0。 |
| 319 | U8 `Gear` | current gear | decoded／stored；engine gate 使用前進檔 1–10。 |
| 320 | S8 `Steer` | -127 left 至 127 right | decoded as `SteerInput`。 |
| 321 | S8 `NormalizedDrivingLine` | -127 至 127 | unsupported；目前不解碼。 |
| 322 | S8 `NormalizedAIBrakeDifference` | -127 至 127 | unsupported；目前不解碼。 |
| 323 | alignment byte | packet alignment | not a field；不可當 telemetry value。 |

## 重要解析邊界

官方文件明確指出 FH6 在 `NumCylinders` 後插入 `CarGroup`、`SmashableVelDiff`、`SmashableMass`，因此 `232–243` 不是 12-byte reserved padding。現行 parser 為了維持既有解碼範圍仍跳過它們；未完成欄位補解析前，任何報告都應把這三欄視為 unsupported／unknown。

`CurrentLap`、`LastLap` 與 `LapNumber` 的角色不同：`CurrentLap` 是本圈經過時間，`LastLap` 是遊戲回報上圈秒數，`LapNumber` 是已完成圈數。race recorder 以 `LapNumber` 識別圈，以 `TimestampMS` 做 0.1 秒 downsample；race clock 單獨倒退不會分割 session。完整圈時間必須同時觀察圈起點與可歸屬的 `LastLap` 更新。

`TireSlipAngle`、`TireSlipRatio`、`TireCombinedSlip` 在 decoded contract 中都維持 normalized 無量綱。任何舊的 MoTeC／SQLite 相容 projection 若有角度轉換，只代表相容輸出；canonical 新資料以 `raw_json`／decoded contract 為準，不能反向把 normalized 值宣稱成角度。

## 驗證指令

```powershell
uv run --no-project --python .venv\Scripts\python.exe .agents/skills/telemetry-udp-protocol/references/verify_telemetry_v2_v3.py --scan --port 8000
uv run --no-project --python .venv\Scripts\python.exe python -m pytest tests/
cmd /c "pnpm -C frontend run test"
```

固定 324-byte、offset、型別或單位若要變更，必須先加入 binary fixture／replay regression test；沒有真實 FH6 packet 或官方協議佐證時，不得把 unsupported 欄位寫成已驗證實作。
