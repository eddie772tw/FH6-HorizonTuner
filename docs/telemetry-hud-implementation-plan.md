# PR#185 Drift HUD 子儀表重製實作與驗證計畫

日期：2026-08-12
需求基準：[Drift HUD 子儀表使用者需求迭代報告](drift-secondary-instrument-user-needs-iteration-report.md)

> **Source of truth 狀態（2026-08-12）**：active renderer 是 `hud_overlay/drift/index.html`。P1–P3 與 G3 已收斂到 active secondary：speed／unit／gear 已回到 primary-owned；LC 僅保留小型 control-state badge；secondary 現在採左側 Driver Inputs／右側 Vehicle Dynamics 的低 surface／低 glow 二分結構。主儀表弧表公式維持不動，只微調 compact 刻度字級。

## 1. 計畫目標

本計畫承接已完成的 Drift 主儀表、Style Meter、Sweep、counter-steer pointer 與螢幕佈局校正，專注於子儀表的內部重製。

子儀表的目標產品定位為 **Drift Input / Vehicle Dynamics Surface**，不再是縮小版主儀表，也不再把多組曲線疊在同一個中央區域。左半只負責四個控制輸入，右半只負責車身姿態與輪胎動態摘要。

畫面仍採單一整合面板，但內部分成左右二區：左側以 G3 連續 rail 表示 throttle、brake、clutch、handbrake；右側放大 attitude glyph 與 2×2 grip mini-bars。輪胎滑移、yaw rate、抓地與車身狀態只在右側以摘要方式呈現，不建立第二 telemetry source。

責任邊界由主儀表負責速度、RPM、檔位、扭力、漂移角度與方向盤輸入；Style Meter 與 FH6 原生 Drift Zone 分數繼續負責表現／得分語意。active renderer 已移除大型角度與 `FLOW / RISK`，P1 也已收回 secondary 的 speed／unit／gear；secondary 只保留輸入、姿態／滑移提示、grip lights 與小型 LC control badge。`FLOW`、`RISK`、`STYLE` 是 coaching／performance layer 的 heuristic/event vocabulary，不是 FH 原生分數。

### P1–P3 current boundary

- **P1（implemented）**：secondary 不繪製 speed、unit、gear；主儀表仍保留並驗證 speed／gear。LC 只作為小型控制狀態 badge，不形成第二車輛 readout。
- **P2（implemented）**：secondary 保留切角 control-surface silhouette，但採較低 gradient opacity、cyan edge alpha 與 shadow/glow；throttle 是最高權重、brake 是第二權重，clutch／handbrake 降為低權重輔助 rail。
- **G3（implemented）**：副儀表量尺使用連續 quadratic rail，不使用 superellipse、數值微分 normal、segment gap 或曲線 midpoint label。`x(u)` 對 ratio 線性，`y(u)` 只加入小幅 `4H u(1-u)` 淺曲率；active fill 使用 De Casteljau 子曲線與 track 完全重合；clutch 與 handbrake 由外下向內上鏡像成長。
- **P3（implemented）**：inline CSS custom properties 與 Canvas `DRIFT_STYLE_TOKENS` 統一 label／value／warning 字級、track／edge alpha 與 glow radius family；Style Meter 維持無框、低頻 DOM paint，沿用相同 text／track／color semantics。
- **Color semantics**：brake 使用穩定 input pink；redline 保持 primary 的固定 boundary pink；slip／lockup 才使用局部 warning/pulse；Style risk 只在 event text／pulse 層表達。
- **Target distinction**：traction、combined slip、lateral G、yaw rate 的 canonical contract 與更完整 motion coaching 仍是後續 target，不得把 heuristic `FLOW`／`RISK`／`STYLE` 描述成 FH 原生分數。

## 2. 已完成基線與本階段邊界

### 2.1 已完成、不可回退的基線

- Drift HUD 維持單一 `HUDCore` telemetry lifecycle 與單一 frame source。
- 主儀表使用 viewport anchor；目前以原左邊界為新中心、放大 100%，並向下移動約 3/4 個自身高度。
- Style Meter 是 Drift HUD-local container，不併入共用 telemetry card registry。
- Sweep 啟動時會 reset Drift Style engine，並以 1.5 秒動畫完成儀表歸零校正。
- TelemetryView、HUD telemetry cards、recorder、replay、map 與既有 UDP／WebSocket topology 不在本階段重構。

### 2.2 本階段要修改的範圍

- `hud_overlay/drift/index.html`：移除舊 secondary 的 angle／counter／flow／risk 內部視覺，接入新的 Canvas cluster。
- `hud_overlay/drift/assets/`：新增或整理 secondary display math、狀態機與 Canvas primitives。
- `hud_overlay/shared/coordinator.js`：補齊子儀表需要的 canonical aliases，不建立第二資料源。
- `backend/telemetry_listener.py`：必要時解析並轉送 `AngularVelocityX/Y/Z`，但不改變封包入口與廣播拓撲。
- `frontend/src/utils/`、backend tests 與 HUD contract tests：為資料語意、閾值與退化行為建立隔離測試。
- `docs/`：持續維護需求、資料語意、佈局與驗收紀錄。

## 3. 目前資訊架構

### 3.1 單一整合面板

- 不建立 Traction、Motion State、Driver Inputs 三個並排區域；active layout 明確分成左側 Driver Inputs 與右側 Vehicle Dynamics。
- 不顯示速度、RPM、檔位、扭力、漂移角度、counter-steer、FLOW、RISK 或 HOLD。
- 外框只包住一個共享的控制輸入面板，讓四個輸入通道使用同一套幾何與刻度語言。

### 3.2 G3 左側輸入結構

- **T／油門 rail**：左側最長、最粗、最亮，代表維持甩尾的主要輸入。
- **B／煞車 rail**：位於左區中央槽位，使用 stable brake-pink，視覺權重僅次於 throttle。
- **C／離合器 rail**：左外下向中央上方成長，低權重白色。
- **H／手煞車 rail**：右外下向中央上方成長，低權重琥珀色；與 clutch 的 x 方向相反但 y 方向相同。
- 四個控制值使用固定文字槽位與可預期的連續 rail，不用曲線 midpoint 推導 label/value。

### 3.3 右側 Vehicle Dynamics 結構

- 放大的 vehicle body、heading／travel arrows 與固定 `HD`／`TRV`／`SLIP` legend。
- 右下使用 2×2 `FL`／`FR`／`RL`／`RR` grip mini-bars；只有高 slip 或 lockup 才 pulse。vehicle body 與 tire vectors 依相對 travel angle 旋轉，heading／travel reference 保持可比較。
- LC badge 顯示 `LC`／`LC ARM`／`LC GO`；upstream canonical state 優先，缺少時使用明確的低速一檔、高油門、手煞車 fallback heuristic。
- 右側動態區吸收原本的中央空白，不回復 speed／unit／gear 或大型分數文字。

### 3.4 非顯示資料

- slip ratio、slip angle、combined slip、lateral G 與 yaw rate 可先完成資料契約與 fixture，但不在本版子儀表形成獨立圖表或狀態欄位。
- 若未來要利用這些資料觸發輸入柱的外框警示，必須先另立事件語意與驗收條件，不能偷偷恢復成 Traction／Motion 三欄設計。

## 4. 資料契約與計算規則

### 4.1 P0：現有資料先標準化

第一階段先讓下列欄位有一致命名、單位與缺值規則：

- `throttle`、`brake`、`clutch`、`hand_brake`、`steer`。
- `slip_ratio_fl/fr/rl/rr`。
- `slip_angle_fl/fr/rl/rr`。
- `combined_slip_fl/fr/rl/rr`，以及 `front_combined_slip`、`rear_combined_slip` 摘要。
- `accel_x/y/z` 與 `lateral_g`／`combined_g` 派生值。

缺少輪胎資料時必須保留 `unknown`／`--` 狀態，不得把缺值當成零滑移後渲染成安全狀態。

### 4.2 後續資料工作：yaw rate contract（不等同於 P1 renderer boundary）

Forza Data Out 封包包含 `AngularVelocityX/Y/Z`，但目前 backend 尚未形成一致的 HUD aliases。這是後續 canonical data contract，不會撤回本輪已完成的 P1 primary-owned readout boundary。這個工作包必須先完成：

1. `backend/telemetry_listener.py` 解析 angular velocity 欄位。
2. `hud_overlay/shared/coordinator.js` 與 `frontend/src/hooks/useTelemetry.ts` 提供 `angular_velocity_y` 等 canonical aliases。
3. 寫明單位、正負方向與平滑策略，避免把 `Yaw` 角度誤當成 yaw rate。
4. 用 idle、直行、左／右穩定甩尾、transition 與 spin recovery frame fixture 校對範圍。

在 contract 完成前，Canvas 不得直接讀取未標準化的 `AngularVelocityY`。

### 4.3 Derived signals 的本輪邊界

本版 secondary renderer 不建立獨立的 Traction／Motion state module。`combined_slip`、`lateral_g` 與 `yawRate` 先完成資料契約與測試，作為後續擴充的候選來源；本輪只建立與四個輸入柱直接相關的 `inputEvents`：

- handbrake entry
- clutch kick
- input release／re-engagement

輸入事件必須有進入／離開 hysteresis、最短可見時間與時間戳，不可因 60Hz 的單一雜訊 frame 造成 H／C 柱閃爍。未來若把物理訊號接到輸入柱的外框效果，也必須沿用同一套事件 contract；不得藉此重新加入常駐 traction 或 motion 欄位。

## 5. Canvas 與視覺語彙實作

### 5.1 G3 Canvas 能力與主儀表邊界

主儀表已驗證的弧表公式維持不動；副儀表不再複製 Advanced 的 superellipse 量表語意，只保留切角外框、DPR、viewport scale 與低頻 glow 等可重用能力：

- outer boundary、continuous track、active fill、endpoint marker。
- quadratic rail、固定文字基線與單調 ratio mapping。
- DPR、viewport scale、resize-only layout calculation。
- 預先配置的顏色、字體與幾何物件，避免 60Hz path 持續配置。

建議先抽出無 Drift 語意的 primitives，再由 secondary renderer 決定 `T`／`B`／`H`／`C` 的顏色、刻度與事件效果。若抽取成本高於本階段收益，可先在 Drift-local module 實作相同 primitives，但必須保留未來共用的函式邊界。

### 5.2 左右二分的單一整合式面板

子儀表不沿用原本的多層曲線設計，也不建立三個互相獨立的 panel。它使用一個共享外框，左側是 inputs、右側是 dynamics：

```text
      ┌─────────────────────┐
      │  T          B       │
      │  █          █       │
      │  █          █       │
      │  █          █       │
      │  █          █       │
      │  H          C       │
      │  ▌          ▌       │
      └─────────────────────┘
```

空間配置採「左側輸入、右側車身動態」語法：

- **左側**：T／B 使用最高權重的連續 rail；C／H 以外下向內上鏡像 rail 呈現。
- **右側**：放大姿態 glyph 與四輪 2×2 mini-bars，消化原本的空白。
- **共享外框**：只保留切角 boundary、低對比 track 與少量 glow，不加入 speed／gear 或分數語意。
- **事件效果**：只附著在 H／C rail、grip mini-bars 或共享外框，不形成常駐狀態欄位。

骨架階段只使用 fixture 值，不接既有 heuristic `FLOW / RISK`，先確認：

- G3 continuous rail 與左右二分面板的視覺協調。
- 與主儀表、Style Meter、FH6 原生 Drift Zone 分數及右下原生 gauge 的距離。
- 1920×1080、2560×1440、3440×1440 與 global HUD scale 下的字體可讀性。
- T／B／H／C 在低解析度下仍能一眼分辨；C 向右上、H 向左上成長，且零值與滿值方向不反轉。

### 5.3 60Hz hot path 原則

- `renderLoop()` 只讀取已更新的 frame snapshot 與 derived state，不做 DOM layout 或 WebSocket／UDP 操作。
- layout、DPR、font metrics 與 viewport anchor 只在 resize／初始化時計算。
- 不在 render loop 使用不必要的 `.map()`、`.filter()`、`.reduce()`、`Object.keys()` 或建立短生命週期物件。
- 事件 glow、文字更新與色彩切換由 state module 控制，Canvas 只執行繪製。
- TelemetryView 與 HUD cards 不共享新的 secondary DOM；它們繼續使用既有 consumer 與顯示開關。

## 6. 分階段工作包

### Iteration 0：Contract、fixture 與可觀測性

1. 將 P0 欄位加入 canonical HUD frame，補齊 combined-slip 與前／後軸摘要。
2. 定義缺值、單位、正負方向、平滑與顯示範圍。
3. 建立 idle、直行、穩定左／右甩、transition、spin recovery、handbrake entry、clutch kick 的 frame fixtures。
4. 對照 `TelemetryView`、G-radar 與既有 HUD cards，確認不重複建立 consumer。
5. 建立 secondary state module 與 isolation tests；此階段不修改 secondary Canvas 外觀。

### Iteration 1：G3 rails 與左右二分 Canvas 骨架

1. 建立 G3 continuous rail、固定文字槽位與右側 dynamics primitives。
2. 移除舊 secondary 的大型 angle、counter、`FLOW / RISK` 與 hold 版面責任。
3. 建立共享外框、左側 T／B／C／H rails、右側 attitude glyph、2×2 grip mini-bars 與事件標記的 source layout。
4. 使用 fixture 值繪製 continuous track、active fill、endpoint marker、固定 label/value 與 transient markers。
5. 完成多解析度、global scale、DPR 與 native UI 避讓測試。

### Iteration 2：P0 物理摘要與輸入事件

1. 接入 T／B／H／C，統一四個柱子的百分比尺度、零值基線與 active／inactive 分段。
2. 加入 handbrake 與 clutch kick 的輸入柱事件脈衝；事件只改變 H／C 柱或共享外框的視覺效果。
3. 暫不渲染 `GRIP`、`HOLD`、`RECOVER`、`SPIN RISK`、前／後軸 slip 或四角異常點。
4. 用人工構造 frame 驗證四個輸入柱的數值、顏色與事件，不直接依賴遊戲連線。

### Iteration 3：Yaw rate contract 與實機校正

1. 解析並轉送 `AngularVelocityX/Y/Z`，尤其是 canonical `angular_velocity_y`。
2. 以實機資料確認 yaw rate 的單位、正負方向、雜訊與可用性，但不把它加入本版右側 dynamics 區之外的獨立視覺欄位。
3. 將 yaw rate、combined slip 與 transition／spin risk 留作後續事件語意的資料基礎，不在本輪新增狀態字或 traction 圖表。
4. 若未來要讓這些資料改變輸入柱或共享外框，必須另增明確的事件 contract 與驗收案例。

### Iteration 4：整合驗收與視覺收斂

1. 確認主儀表下移後，子儀表不覆蓋 FH6 原生 Drift Zone 分數、Style Meter 與原生右下 gauge。
2. 確認子儀表不重複 score、style、flow、risk 的評分敘事。
3. 確認 TelemetryView active／paused、HUD cards 開關、theme／unit 與全域 scale 行為不變。
4. 執行 60Hz hot-path、inline script parse、frontend baseline、backend parser 與 contract tests。
5. 以實機截圖記錄至少 idle、穩定甩尾、transition、spin recovery 四種畫面，更新 Journal 與安全區文件。

## 7. 驗證順序

1. `frontend` Drift state／display math／layout／HUD contract targeted tests。
2. backend telemetry parser 與 canonical frame tests。
3. `python -m py_compile` 檢查修改過的 Python parser／formatter。
4. `npm.cmd test -- --run` 執行完整前端 Vitest。
5. Drift HUD inline script parse check。
6. `git diff --check`。
7. 實機畫面驗證：
   - 1920×1080、2560×1440、3440×1440。
   - global HUD scale 與 DPR 變化。
   - metric／imperial unit。
   - idle、直行、左／右穩定甩尾、transition、spin recovery。
   - Style Meter、原生 Drift Zone 分數、TelemetryView active／paused 與 HUD cards 開關。

## 8. 驗收條件

- 玩家能在一眼內辨識 T／B／C／H 四個控制輸入的大小，且理解左側是輸入、右側是車身動態。
- 玩家能辨識 handbrake／clutch kick 事件，且事件效果不會形成額外的常駐資訊欄位。
- T／B 使用最高視覺權重的連續 rail，C／H 由外下向內上鏡像成長，四個輸入共享可預期的百分比方向與零值基線。
- 子儀表不重複主儀表的速度、RPM、檔位、扭力與大型漂移角度。
- Style Meter、原生 Drift Zone 分數與子儀表各自維持清楚責任。
- 60Hz 更新仍只使用單一 HUDCore frame；沒有新增 DOM layout、socket、polling 或不必要的每幀配置。
- 缺少 yaw rate 或輪胎欄位時不影響四個輸入柱；未來若接入事件效果，必須顯示 `unknown`／降級狀態，不渲染錯誤的安全值。
- TelemetryView、HUD cards、recorder、replay、map 與既有傳輸拓撲沒有行為回歸。

## 9. 明確排除項目

以下內容保留給 TelemetryView、HUD cards、事後分析或另開 issue／PR：

- Drift Zone line quality、zone progress、score prediction 與個人最佳比較。
- 完整四輪胎溫、磨耗、懸吊行程與調校診斷圖表。
- 將第二螢幕 TelemetryView 的完整 power／tire／suspension chart 搬入遊戲內。
- 新增第二 UDP listener、WebSocket、polling loop、session store 或 map pipeline。

## 10. 完成定義

Iteration 0 與 Iteration 1 完成後，才能進入子儀表的實際畫面重製；Iteration 2 完成後，才能以一般玩家的即時控制需求判斷畫面是否成立；Iteration 3 若沒有可靠的 angular velocity 資料，必須保留降級設計與明確標註；Iteration 4 完成並取得實機截圖後，才可將 PR #185 的 Drift secondary 重製標為 Ready for Review。
