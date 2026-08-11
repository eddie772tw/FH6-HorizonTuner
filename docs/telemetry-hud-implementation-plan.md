# PR#185 Drift HUD 實作與驗證計畫

## 目的

本計畫只處理 PR#185 的 Drift HUD visual slice：Style Meter、combo display、central／secondary instrument、counter-steer pointer、torque unit display，以及移除 resolution preset 後的整合驗證。

它不是 TelemetryView、HUD cards、recorder、replay、map 或 telemetry transport 的重構計畫。

## 現有實作基線

目前分支已包含：

- `hud_overlay/drift/assets/drift_style_engine.js`：不持有 DOM／Canvas 的 Style Meter state engine。
- `hud_overlay/drift/assets/drift_display_math.js`：steer normalization、counter state 與 torque unit resolution。
- `hud_overlay/drift/index.html`：central oval、右下 secondary instrument、Style Meter container 與 render loop。
- `frontend/src/features/overlay_control/OverlayView.tsx`：移除 Drift-specific resolution profile controls。
- `frontend/src/utils/driftStyleEngine.test.ts` 與 `driftDisplayMath.test.ts`：domain／display math isolation tests。

## 不可破壞的整合邊界

1. Drift HUD 只使用現有 `HUDCore`／`onFrame` frame，不開新的 WebSocket、UDP socket 或 polling loop。
2. 主 GUI `TelemetryView` 維持既有 consumer 行為；本 PR 不修改其 React snapshot 或 Canvas emitter。
3. HUD telemetry cards 的顯示開關維持既有設定；Style Meter 是 Drift HUD-local container，不新增一套跨視窗 card registry。
4. `driftProfile` 移除後，外層 global HUD scale、monitor 選擇、theme／color config 仍由既有 overlay framework 管理。
5. Style score、combo event、counter percentage 是 presentation／heuristic state，不宣稱是 Forza 內部物理或遊戲分數的精確重建。

## 實作工作包

### A. Style Meter 與 combo container

- 只顯示與 Drift run 直接相關的 rank、meter、flow、hold、risk 與 special event。
- run active 時顯示即時狀態；run 結束後顯示短暫 summary；idle 或 reset 時清理狀態。
- event TTL、merge window、score decay 與 summary duration 必須由 engine 統一處理，DOM 只負責呈現。
- container 的 opacity、row visibility、文字更新與 80ms paint throttle 不應新增 per-frame object allocation。

### B. Central／secondary instrument 分工

- central oval：主要速度／RPM／drift angle／counter-steer 閱讀區。
- secondary instrument：較低優先級的 angle、counter、flow、risk、hold 或 event context。
- Style Meter combo container：只放在既定 HUD-local 區域，不覆蓋 central pointer、torque 或核心 RPM readout。
- 不把第二螢幕 TelemetryView 的完整 tire／suspension／power chart 搬進 Drift HUD。

### C. Counter-steer pointer

現有 `drift_display_math.js` 的 contract 應保持清楚：

```text
raw steer
  → normalize to [-100, 100]
  → require |driftAngle| >= 8 and angle * steer > 0
  → counter percent with angle-dependent weight
  → pointer arc clamp to [-60°, 60°]
```

這個 pointer 是「counter-steer input 的視覺投影」，不是物理前輪角度。需要固定驗證：

- drift angle 為零或小於 threshold 時，counter 狀態為 false、百分比為 0。
- drift 與 steer 同向時才進入 counter state；反向時不能誤亮。
- raw steer 若是 `[-1, 1]` 或較大的 normalized／byte-derived 值，都要得到 bounded output。
- extreme steer、`NaN`、`undefined` 與負零不應讓 Canvas transform 出現無效值。

### D. Torque unit display

Torque resolution 維持既有 payload 優先順序：

1. 使用 normalized `data.torque`。
2. 缺少時依 unit fallback 到 `torque_nm` 或 `torque_ftlbs`。
3. 最終仍無有效數字時使用安全零值。
4. metric 顯示 `N·M`，imperial 顯示 `LB·FT`。

驗證重點是 value 與 label 必須同時切換；不要在 Drift HUD 重新換算 raw `TorqueNewtons`，也不要把 TelemetryView 的單位設定複製一份到 HUD-local state。

## 邊界條件驗證表

| 情境 | 預期行為 |
|---|---|
| 沒有 telemetry／尚未 race | central instrument 顯示安全 idle 狀態，Style Meter 不殘留上一段 run |
| `IsRaceOn`／車輛切換 | engine reset；不把上一台車的 score、peak event 或 summary 帶到下一段 |
| frame 間隔不規則 | score decay／TTL 依 `now` 運作，不假設固定 60Hz |
| 短暫 counter-steer | pointer 隨 input 顯示，不立即觸發錯誤的 run reset |
| steer／angle 符號相反 | counter state 關閉，不能顯示正的 counter percentage |
| torque 欄位缺失 | fallback 或零值；不可出現 `NaN`／`undefined` |
| metric／imperial 切換 | torque number 與 unit label 同步更新 |
| HUD cards 關閉 | 只影響既有 cards；不影響 Drift HUD frame source |
| TelemetryView 被 pause | 不建立第二條資料源；本 PR 不改 pause／resume 邏輯 |
| 移除 `driftProfile` 後載入舊設定 | 忽略舊欄位，由 global overlay scale 管理外層尺寸 |

## 驗證順序

1. 執行 Drift display math 與 Style engine isolation tests。
2. 執行 frontend baseline tests，確認 OverlayView 移除 preset 後沒有 stale config／translation 依賴。
3. 執行 Drift HUD inline-script parse check。
4. 用 synthetic frames 驗證 idle、entry、sustain、direction switch、break、summary、missing torque 與 unit switch。
5. 以既有 HUD frame path 做手動 visual QA：
   - 1920×1080 基準視窗
   - 不同 global overlay scale
   - light／dark theme 與 custom color
   - HUD cards 開／關
   - TelemetryView active／paused
6. 執行 `git diff --check`，確認只涉及 PR#185 的 Drift HUD、OverlayView、tests、translations／guide 與本研究文件。

## 完成條件

- Style Meter、combo container 與 central／secondary split 在既有 Drift HUD frame path 下穩定顯示。
- counter pointer 在符號、threshold、clamp 與缺失資料條件下行為可預期。
- torque value／unit 與既有 metric／imperial contract 一致。
- 移除 `driftProfile` 後沒有新的解析度分支或 stale control。
- 不改變 TelemetryView、HUD cards、recorder、replay、map、UDP parser 或 WebSocket topology。
- 測試與 inline parse check 通過後，PR 才適合恢復 Ready for Review。

## 後續工作如何另案處理

若日後要做 telemetry rate diagnostics、TelemetryView frame store、HUD cards registry、replay、session 或 map，應另開 issue／PR，先定義新的 scope 與驗收條件，不把它們偷偷併入 PR#185。
