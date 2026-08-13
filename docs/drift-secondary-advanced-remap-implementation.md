# Drift secondary：G3 可讀性重製現況

日期：2026-08-12

Active renderer 為 `hud_overlay/drift/index.html`。主儀表保留已驗證的 FH6 arc grammar；副儀表則改採 G3 的低曲率、連續、單調 rail grammar，沿用既有 Drift Canvas 與 HUDCore frame path；未建立第二 telemetry source、polling loop 或 DOM overlay lifecycle。

## Active mapping（current implementation）

| G3 視覺元素 | Drift 現況語意 | 顯示行為 |
| --- | --- | --- |
| 左側連續 rail | Driver Inputs | 油門最高權重、煞車第二權重；四組 rail 共用 caption 基線與 label/value 間距，不把文字投影到曲線 midpoint |
| 左下鏡像 rail | Clutch | 由左外下向中央上方成長；白色、低權重，適合大多數時間為 0 的輸出 |
| 左半右側鏡像 rail | Handbrake | 由右外下向中央上方成長；琥珀色、低權重，與 clutch 形成水平鏡像 |
| 右側 attitude glyph | 車頭 heading／travel direction | 放大 vehicle body、heading arrow 與 travel arrow；vehicle body／tire vectors 依相對 travel angle 旋轉 |
| 右下 grip mini-bars | 四輪 slip／grip 狀態 | 放大的 FL／FR／RL／RR 2×2 mini-bars；只有高 slip／lockup 才 pulse |
| Primary-owned readout | speed／unit／gear | **不在 secondary renderer 繪製**；主儀表保留 speed／unit／gear，LC 僅作為小型 control-state badge |

Active renderer 已不再顯示舊 angle、counter、`FLOW`、`RISK`、`HOLD`、torque、power 或 boost text，也不再顯示 primary-owned speed、unit、gear。Style Meter 保有 style／risk event language；TelemetryView 與 telemetry cards 保有詳細輪胎、懸吊、replay 與診斷資訊。

## G3 與 P1–P3 收斂狀態

- **P1 implemented**：active secondary 只繪製 throttle、brake、clutch、handbrake、heading/travel/slip presentation、四輪 grip lights 與小型 LC badge。speed／unit／gear 的 source 與 Canvas draw call 仍由 primary 使用，但不進入 secondary renderer 區段。
- **G3 implemented**：active secondary 不再使用 `secondarySuperPoint`、`secondarySuperNormal`、曲線 normal offset、5／12 段 gap 或曲線 midpoint label。每一條 rail 使用 `u = clamp(ratio, 0, 1)`，並以
  `x(u) = x0 + (x1 - x0)u`、
  `y(u) = y0 + (y1 - y0)u - 4H u(1-u)` 的淺曲率 quadratic Bézier 表示；active path 與 endpoint 均沿同一單調 mapping。
- **G3 active-fill correction**：active path 使用 quadratic Bézier 的 De Casteljau 子曲線（`q0` 到 `B(u)`），因此充能條與完整 rail 使用完全相同的曲率；throttle／brake 不再退化成直線，clutch／handbrake 也不再是無曲率斜線。
- **P2 implemented**：保留切角 control-surface 身份，降低 surface gradient opacity、cyan edge alpha 與 shadowBlur；副儀表改為左側 Driver Inputs／右側 Vehicle Dynamics 二分結構，throttle 與 brake 使用較粗、較亮的連續 rail，clutch／handbrake 使用鏡像低權重 rail；`HD`／`TRV`／`SLIP` 固定在放大的姿態區。
- **P3 implemented**：`DRIFT_STYLE_TOKENS` 與 inline CSS custom properties 定義 shared label／value／warning typography、track／edge alpha 與 glow radius family。Style Meter 仍是無框、低頻 DOM layer，並採相同 semantic color vocabulary。

粉紅色語意刻意分層：brake 是穩定 input color；redline 是 primary 的固定 boundary；slip／lockup 才是 secondary 的局部 warning/pulse；Style risk 只在 event text／pulse 層呈現。`FLOW`、`RISK`、`STYLE` 仍是 coaching／performance layer 的 heuristic/event vocabulary，不是 FH 原生分數。舊 `FLOW / RISK` legacy comparison functions 即使保留在檔案中，也不屬於 active renderer，不能重新接回 current path。

## Attitude 與 grip indicator 現況

- Cyan arrow：車頭 heading reference，固定指向車頭前方。
- Amber arrow：travel direction，以 velocity heading 減去 telemetry `Yaw`。
- 四個 tire arrows：方向取自 `TireSlipAngle`，長度取自 `TireSlipRatio` 絕對值；vehicle body、crosshair 與箭頭比前版放大約 1.7--2 倍。
- 紅色 tire arrows／lights：高 slip 或既有共用 `lockup` flag。
- 四輪 grip lights 位於右側動態區底部，採較大的 2×2 mini-bar；左側不再放置過小的輪胎指示器。
- LC badge 以 `LC`／`LC ARM`／`LC GO` 表達 inactive／armed／launched；若 upstream 尚未提供 canonical state，HUD 使用低速一檔、手煞車與高油門的明確 fallback heuristic，並保留 upstream state 優先權。

`TireSlipAngle` 由既有 radian frame 轉為 degrees，並以視覺用途 clamp 至 +/-45 degrees；slip-ratio length 暫以 0.5 為 strong-slip reference。這只是 display normalization，不改變 telemetry contract。

## Review boundary 與待驗證項目

目前已完成 deterministic fake-Canvas runtime smoke test，會實際執行 inline HUD controller 的一個 RAF frame，並驗證 primary 的 speed／gear／unit 仍可繪製、secondary 不重複繪製 speed／unit／gear，以及未出現 console error。以下真實 FH6 screenshot 或 frame capture 仍為 **required**，在取得畫素證據前不得視為 final：

1. 左、右轉時 `Yaw` 與 velocity heading 的正負號是否一致。
2. 不同車輛與路面下，0.5 是否適合作為 tire slip ratio 的視覺飽和點。
3. 右側放大的 attitude glyph 與 2×2 grip mini-bars 在 conventional secondary scale 下是否可讀。
4. `lcState` 是否會在目標 launch-control flow 收到 armed／launched transitions。
5. ratio = 0／.25／.5／.75／1 時，clutch 端點持續右上移、handbrake 端點持續左上移，且兩者以中心軸鏡像。
6. 真實 FH6 capture 是否確認 G3 rail、固定文字槽位、右側動態區與低 glow 在不同解析度與 global scale 下仍可讀；這是視覺驗收，不是 fake Canvas contract 能替代的畫素證據。
7. 真實 capture 是否確認 vehicle body 的旋轉方向與 travel vector 的語意一致，以及 `LC ARM`／`LC GO` 在實際 payload／fallback 條件下可見。
