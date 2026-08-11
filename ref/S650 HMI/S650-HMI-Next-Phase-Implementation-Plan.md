# S650 HMI 下一階段實作計劃

> 分支：`codex/s650-hmi-next-phase-evaluation`
> 基線 commit：`7bd499a docs: align S650 HMI reference with implementation`
> 狀態：Approved／實作進行中
> 計劃日期：2026-08-11

## 1. 目的

本階段的目標，是讓 S650 HMI 的實作契約與參考文件重新一致，並為後續功能評估建立可控的邊界。優先順序如下：

1. 將 renderer 的輸入收斂為已正規化的 canonical frame。
2. 移除實際已不具意義的 `driveMode`／`matchDriveMode` 依賴。
3. 鎖定目前已完成的三種 Cluster Theme、四種中央頁面、版面尺寸、縮放、顏色與位移行為。
4. 將 Header、Footer、Shift Light、telltale、warning 狀態，以及其餘四種 Theme 的工作拆成可評估的規格，不在需求尚未確認前直接擴大 renderer。

本分支先完成契約、回歸保護與評估資料，不預設加入副螢幕、娛樂系統、導航、媒體、電話或其他 OEM 研究項目。

## 2. 已確認的目前基準

唯一的目前實作基準為 [`S650-HMI-Visual-Research.md`](./S650-HMI-Visual-Research.md)。本計劃以該文件同步後的內容為準：

| 項目 | 目前基準 |
| --- | --- |
| Canvas | `1280 × 480` |
| 已完成 Theme | `normal`、`heritage67`、`foxbody`、`sport`、`svt_cobra`、`track` |
| 評估中 Theme | `calm` |
| 中央頁面 | `disable`、`drive`、`tire_temp`、`performance` |
| 主要版面 | 左右雙環儀表、中央資訊區、Header/Footer 保留區 |
| 有意義的使用者參數 | `Cluster Theme`、中央頁面、GUI theme、單位、元素可見性、顏色與垂直位移 |
| 過時參數 | `driveMode`、`matchDriveMode` |
| renderer 目前狀態 | 仍兼容 legacy alias 並在下游做部分單位／pedal 轉換，列為本階段技術債 |

實作對照入口：

- 契約與 frame normalization：`hud_overlay/s650_hmi/assets/s650_contract.js`
- S650 frame lifecycle：`hud_overlay/s650_hmi/assets/s650_frame.js`
- 版面 profile 與 geometry：`hud_overlay/s650_hmi/assets/s650_layout_profiles.js`、`hud_overlay/s650_hmi/assets/s650_layouts.js`
- 中央頁面：`hud_overlay/s650_hmi/assets/s650_center_info.js` 及其 page modules
- 上游 HUD frame：`hud_overlay/shared/coordinator.js`
- 前端 telemetry bridge：`frontend/src/hooks/useTelemetry.ts`
- 前端設定介面：`frontend/src/features/overlay_control/s650Hmi.ts`
- 後端設定與 API：`backend/main.py`

## 3. 範圍

### 3.1 本階段納入

- 建立 S650 renderer 所需的 canonical frame 定義與欄位責任。
- 找出並收斂目前分散在 coordinator、frontend telemetry hook 與 S650 contract 的正規化邏輯。
- 將速度、踏板、轉速上限與其他中央頁面資料的單位轉換移到明確的上游邊界。
- 讓 S650 renderer 只讀取 canonical 欄位，不再讀取 raw 欄位、legacy alias 或自行猜測單位。
- 清理 S650 執行路徑中的 drive mode 依賴；若為相容既有設定而保留讀取，必須明確標為 migration-only，不能影響 render 結果。
- 為目前三種 Theme、四種中央頁面、固定 geometry、色票、縮放、位移與元素可見性建立回歸測試。
- 產出 Header/Footer/Shift Light/telltale/warning 的需求與資料來源評估項目。
- 產出四種未完成 Theme 的評估門檻與決策紀錄格式。

### 3.2 本階段不納入

- 副螢幕或副螢幕資料同步。
- 與儀表無關的中控娛樂、媒體、電話、導航或 Track Apps。
- 直接重做 OEM 研究中未被目前實作採用的 Drive Mode、媒體或導航畫面。
- 在需求未確認前新增四種 Theme 的完整視覺實作。
- 改動 Forza UDP packet layout、offset 或原始 telemetry parser。
- 導入新的 UI framework、繪圖依賴或會改變 60Hz canvas hot path 的大型抽象層。

## 4. 實作階段

### Phase 1：契約盤點與 canonical owner 決策

**目的**：先決定「哪一層負責把 raw telemetry 轉成 HMI 可用資料」，避免同一欄位在不同層重複轉換。

工作項目：

1. 列出 `s650_contract.js` 目前接受的 canonical 欄位、legacy alias、fallback 與單位轉換。
2. 對照 `hud_overlay/shared/coordinator.js` 與 `frontend/src/hooks/useTelemetry.ts`，以「傳入 HUD 模組的資料原則上已完成標準化」為前提，確認速度、pedal、redline、gear、tire、performance 等欄位的標準化責任、來源與單位，並排除 HUD 下游重複轉換或二次正規化的情況。
3. 指定 S650 HUD 的 canonical owner。優先評估共用 coordinator 作為 HUD frame 的唯一正規化入口；若前端 hook 仍需服務其他 telemetry view，則將其資料轉換與 HUD frame contract 分開，避免兩條路徑互相覆寫。
4. 定義 page-specific optional data 的責任。中央頁面可以只宣告自己需要的欄位，但不能在 render 時自行從 raw 欄位推導。
5. 確定欄位單位與命名，尤其是 tire temperature、power、torque、boost、fuel、distance 與 heading。

交付物：

- 一份 S650 canonical frame 欄位表。
- 一份目前 legacy alias 與移除順序表。
- 一個明確的上游 owner 決策，或記錄仍需產品決策的欄位。

完成條件：任何新增 renderer 邏輯都能只依賴該欄位表，不需要查 raw telemetry 結構。

### Phase 2：canonical frame 與 renderer 邊界調整

**目的**：讓正規化發生在 renderer 之前，並讓 contract 只負責驗證／取用已正規化資料。

建議的核心欄位：

```text
S650CanonicalFrame
├─ speed_kmh
├─ speed_mph
├─ rpm
├─ maxRpm
├─ redlineRpm
├─ gear
├─ throttle
└─ brake
```

中央頁面所需的 optional 欄位，依 Phase 1 的單位決策加入，例如：

```text
├─ tire_temp
├─ power
├─ torque
├─ boost
├─ fuel
├─ distance_m
├─ heading_deg / heading_label
└─ lap / position（只有需求確認後才加入）
```

實作順序：

1. 先寫 canonical frame 的 isolation tests，再移動或刪除轉換邏輯。
2. 將 m/s→km/h、m/s→mph、pedal fallback、redline fallback 等轉換集中到上游正規化層。
3. 收窄 `s650_contract.js` 的輸入面：renderer 不再接受 `SpeedMetersPerSecond`、`Throttle`／`ThrottleInput` 等 legacy/raw alias。
4. 將缺少欄位視為明確的 invalid/absent state，不在 renderer 內偷偷猜測單位或補值；必要 fallback 必須發生在 canonicalizer 並有測試。
5. 檢查每個中央頁面是否仍有 page module 自行做 raw data conversion，並一併移除。
6. 確認 `hud_overlay/shared/hud-core.js` 的 frame dispatch、config lifecycle 與既有 HUD style 不受影響。

完成條件：S650 renderer 的 frame entry point 只接受 canonical frame；在相同 canonical input 下，三種既有 Theme 與四種中央頁面的輸出不變。

### Phase 3：移除過時 drive mode 依賴

**目的**：反映目前只有 `Cluster Theme` 有意義的產品語意，同時避免直接破壞既有設定檔或 API client。

工作項目：

1. 搜尋 `driveMode`、`matchDriveMode` 在 S650 frame、layout、theme selection、frontend control、backend API 與測試中的實際消費點。
2. 從 render decision path 移除 drive mode 分支；theme selection 只以 `s650Theme` 為準。
3. 若既有設定仍含 `driveMode` 或 `matchDriveMode`，只允許在 migration/validation 層忽略或轉換，不得再影響畫面。
4. 更新設定 schema、API response 或 UI label，使過時參數不再被宣稱為可用功能。
5. 不新增尚未核准的 theme ID，也不把 drive mode 名稱改名後繼續保留同一個錯誤語意。

完成條件：改變或刪除 drive mode 欄位不會改變 S650 renderer 輸出；目前三種 `s650Theme` 仍可正常選擇與保存。

### Phase 4：鎖定目前已完成範圍的回歸基線

**目的**：在評估新功能前，先把目前實作視為穩定基線。

測試與檢查項目：

- `1280 × 480` canvas 與主要 region geometry。
- 三種 layout profile：`normal`、`heritage67`、`foxbody`。
- 四種中央頁面：`disable`、`drive`、`tire_temp`、`performance`。
- 目前雙環儀表的中心、radius、scale 與左右對稱性。
- Theme 色票、warning/danger 色彩與 Foxbody dark GUI override。
- HUDCore 的 `scaleBaseline`、`scaleMultiplier` 與 `s650HmiOffsetY` clamp/套用範圍。
- elements visibility、custom color、metric/unit 與 GUI theme mode。
- frame 欄位缺失、零值、邊界值與不合法設定的穩定處理。
- 60Hz canvas hot path 不新增 DOM、network I/O 或不必要的大量 allocation。

完成條件：上述基線都有可重複的 automated test 或明確的 visual smoke checklist，且新契約調整不造成既有畫面回歸。

### Phase 5：未完成 Theme 與狀態元件的需求評估

**目的**：將尚未決定的視覺功能與資料需求分開評估，避免把假設寫入 renderer API。

#### 5.1 四種候選 Theme

對 `sport`、`track`、`calm`、`svt_cobra` 各自建立 decision record，並參考可由網路實際查詢的 OEM 圖片、車主手冊、官方產品文件或可信車輛媒體資料，確認其版面特徵、設計取向、設計目的與目標駕駛受眾。每份 record 至少包含：

- 可追溯的圖片或文件來源、連結、擷取日期與適用車型／年式。
- 來源中可觀察到的儀表版面、資訊層級、色彩、字體、圖形元件與狀態呈現。
- 該 Theme 服務的駕駛情境、設計目的與目標駕駛受眾。
- 參考資料與目前 S650 HMI 基線之間的相似處、差異與可採用程度。
- 視覺方向與可辨識的設計差異。
- 是否只是 palette/asset variation，或需要新的 layout profile。
- 是否需要新的 telemetry 欄位。
- 與既有三種 Theme 共用的 geometry、component 與可見性規則。
- 設計必要性的評估，以及缺乏可靠來源或需求證據時取消、延後或改為實驗性功能的條件。
- 設計驗收圖、色彩對比、警示狀態與可讀性驗證。

只有在外部參考、目標受眾、視覺方向、資料需求與驗收標準被確認後，才進入 implementation ticket。，至少包含：

- 視覺方向與可辨識的設計差異。
- 是否只是 palette/asset variation，或需要新的 layout profile。
- 是否需要新的 telemetry 欄位。
- 與既有三種 Theme 共用的 geometry、component 與可見性規則。
- 設計驗收圖、色彩對比、警示狀態與可讀性驗證。
- 取消或延後的條件。

只有在每個 Theme 的視覺方向、資料需求與驗收標準被確認後，才進入 implementation ticket。

#### 5.2 Header、Footer、Shift Light、telltale、warning

先建立狀態模型與資料來源矩陣，不直接新增零散的 `drawX()` 參數：

| 元件 | 需要確認的問題 |
| --- | --- |
| Header | 顯示哪些車輛／系統狀態？更新頻率與優先級為何？ |
| Footer | 與中央頁面如何分工？是否固定保留區？ |
| Shift Light | 來源是 rpm/redline 還是另有 calibration？閃爍與 hysteresis 如何定義？ |
| telltale | 狀態集合、icon mapping、priority、缺資料時的顯示策略為何？ |
| warning | warning/danger 等級、互斥規則、清除條件與 color token 為何？ |

評估時需特別確認：

- 這些元件是否共用同一個 canonical status model。
- 狀態是 frame-level data，還是 config-level visibility。
- 多個警示同時存在時的 priority 與 rendering order。
- 是否需要 animation state；若需要，如何維持 canvas render 的低成本。
- 是否能在不引入副螢幕／娛樂系統概念的前提下完成。

本階段的輸出是規格與驗收條件；在資料來源與優先級未確定前，不建立難以回收的公開 API。

### Phase 6：整合驗證與後續拆票

完成 Phase 1–5 後，整理成可獨立交付的 implementation tickets：

1. canonical frame owner 與 normalization。
2. S650 contract 收窄與 renderer migration。
3. drive mode migration/cleanup。
4. current baseline regression suite。
5. 各候選 Theme 的 design/implementation ticket。
6. Cluster indicator/status model ticket。

每張 ticket 必須包含：輸入契約、影響檔案、回歸測試、驗收畫面、未決事項與 rollback 方式。

## 5. 建議的設定契約

目前 S650 HMI 的設定契約應收斂為下列語意：

```text
S650HmiConfig
├─ s650Theme
├─ s650CenterWidget
├─ s650GuiThemeMode
├─ metric / unit preference
├─ elements visibility
├─ customColor
├─ useDefaultColors
└─ s650HmiOffsetY
```

`driveMode` 與 `matchDriveMode` 不屬於新的 render contract。為相容既有持久化設定，可以在 migration 層接受並忽略，但必須測試其不影響 `s650Theme`、中央頁面與畫面輸出。

設定契約與 telemetry frame 必須保持分離：

- config 決定使用者選擇、可見性、色彩與 layout offset。
- canonical frame 提供當前車輛狀態與中央頁面資料。
- renderer 不應透過 config 推導 raw telemetry 單位，也不應透過 telemetry 欄位反向改寫使用者設定。

## 6. 風險與需保留的決策點

### 6.1 正規化責任重複

目前 shared coordinator 與 frontend `useTelemetry` 都存在 telemetry 正規化邏輯。若直接在兩邊同時修改，可能造成二次換算或不同 view 使用不同單位。Phase 1 必須先完成 owner 決策，並以測試確認 HUD frame 的實際流向。

### 6.2 既有設定相容性

移除 drive mode 不等於立刻拒絕所有舊設定。應先區分「仍需讀取以完成 migration」與「已進入 render decision path」兩種責任，避免保存舊設定時破壞使用者的 theme 或中央頁面選擇。

### 6.3 Page-specific data 的單位

`drive`、`tire_temp`、`performance` 所需資料目前可能分散在不同欄位或 page module fallback。必須先定義單位與缺值語意，再移除 renderer fallback；否則只是把不一致從一個檔案移到另一個檔案。

### 6.4 新狀態元件的範圍膨脹

Header/Footer/Shift Light/telltale/warning 很容易引入新的狀態機、動畫與 icon 資產。若資料來源、priority 與驗收畫面尚未確認，應停留在 evaluation artifact，不與本階段的 canonical frame migration 綁死。

## 7. 驗收門檻

本分支後續若進入程式碼實作，至少需通過：

- S650 相關 frontend Vitest suites。
- backend overlay API 相關測試。
- 若修改共用 telemetry 或 config，執行完整 frontend/backend 測試與 lint/format checks。
- `git diff --check`。
- 三種 Theme × 四種中央頁面的 render regression 或 visual smoke check。
- 確認 renderer 不再接受 raw alias 或自行進行單位轉換。
- 確認變更 drive mode 舊欄位不會改變畫面。
- 確認 60Hz 路徑沒有新增 DOM 操作、network I/O 或不必要的 per-frame 大型配置。

若 visual output 有意改變，必須在對應 decision record 中附上變更原因與新的驗收基準，不能以「重構」名義略過視覺差異確認。

## 8. 本分支完成定義

本分支的評估階段完成時，應具備：

- 已同步的 S650 HMI 參考文件（已由 `7bd499a` 提交）。
- 本實作計劃與 phase boundaries。
- canonical frame 欄位與 owner 的決策結果，或明確列出的未決事項。
- current baseline 的測試清單與缺口。
- drive mode migration 策略。
- 四種候選 Theme 與 Cluster indicator/status 的評估項目。
- 可轉換成 implementation tickets 的拆分結果。

在上述項目完成前，不將未確認的四種 Theme 或狀態元件視為已承諾功能。

## Appendix A：Phase 1 canonical owner 決策（2026-08-11）

### 決策

S650 HMI 的 telemetry canonical owner 為 `hud_overlay/shared/coordinator.js`。

它在 HUD launcher 中接收 `shared/ws.js` 派發的 raw `telemetry` 事件，並將正規化後資料以 `hud:frame` 傳給 iframe。`shared/hud-core.js` 只轉送該 frame；S650 renderer 只消費其 `payload.data`。

`frontend/src/hooks/useTelemetry.ts` 也有一份格式化函式，但其 BroadcastChannel `telemetry` 訊息目前不會被 `hud_overlay/index.html` 接收或轉送。因此它不是 S650 renderer 的 ingress，也不應作為本次 canonical contract 的第二個 owner。該 hook 繼續服務 control panel 自身的 telemetry 使用情境；日後若 launcher 開始接收這個訊息，必須改由同一個已測試的 canonicalizer 產生 frame，不能重新建立 renderer fallback。

### v2 frame 欄位責任

| 類別 | renderer 可讀 canonical 欄位 | 單位／語意 |
| --- | --- | --- |
| 核心行車 | `rpm`、`maxRpm`、`redlineRpm`、`gear`、`throttle`、`brake` | rpm；gear 為 Forza game output；pedal 為 `0..1` |
| 速度 | `speed_kmh`、`speed_mph` | km/h 與 mph，均在 coordinator 由 m/s 轉換 |
| 行駛資訊 | `distance_m`、`heading_deg`、`lap`、`race_position` | m、`0..360` 度、缺值為 `null` |
| 胎溫 | `tire_temp_f` | 固定四輪的華氏溫度陣列；顯示轉換只依使用者單位設定 |
| 動力 | `power_hp`、`power_kw`、`torque_nm`、`torque_ftlbs`、`boost_psi`、`boost_bar`、`fuel_ratio` | 每一欄位名稱帶出固定單位；fuel 為 `0..1` 或 `null` |

renderer 可在 contract 層做有限數值、範圍與缺值防護，但不得再接受 raw key、legacy alias、m/s 速度或 `0..255` pedal input，也不得自行換算動力、胎溫或 fuel 的來源單位。

### config 影響

新 renderer config contract 不含 `driveMode` 或 `matchDriveMode`。這兩個欄位可在 backend/前端的既有設定 migration 中被讀取並忽略，但不可進入 S650 frame state、Theme 選擇或 layout decision path。

## Appendix B：Phase 2 canonical-only migration（2026-08-11）

### 已完成的邊界調整

- `S650HmiContract` 升為 `s650-hmi/v2`，`normalizeFrame()` 輸出固定 closed shape；raw key、legacy alias、m/s 速度與 `0..255` pedal input 不再被 renderer contract 接受。
- `hud_overlay/shared/coordinator.js` 仍保留 raw telemetry 給其他 HUD，但額外建立 S650 可讀的 `distance_m`、`heading_deg`、`tire_temp_f`、`fuel_ratio`、`lap` 與 `race_position`；既有 `speed_*`、`power_*`、`torque_*`、`boost_*`、`rpm`、`gear`、`throttle`、`brake` 一併構成 canonical frame。
- S650 frame、中央資訊頁面與共享 center helper 均只讀取 canonical key；standby frame 也改為 canonical shape。
- render hot path 不再對同一 frame 進行第二次 normalization；`onFrame()` 在邊界驗證一次後，layout 直接使用已驗證 frame。

### 單位確認

UDP packet reference 與既有 parser fixture 證實：`Yaw` 為 rad、`TireTemp` 為 ℉、`Boost` 為 PSI、`Fuel` 為 `0..1`。因此本階段未修改 packet parser、offset 或原始資料單位；只在 coordinator 建立明確命名的衍生欄位。先前 S650 Heritage boost readout 對 raw `Boost` 再除以 Pa→PSI 常數的錯誤路徑已改為直接讀取 `boost_psi`。

### 驗證

- `s650Contract.test.ts` 覆蓋 v2 canonical shape 與拒絕 raw alias。
- `s650FrameCanonicalInput.test.ts` 覆蓋 raw input 無法穿透 S650 layout renderer。
- `cmd /c "pnpm -C frontend run test -- ..."`：32 test files、200 tests 通過。

## Appendix C：Phase 3 obsolete drive-mode cleanup（2026-08-11）

- S650 contract 與 frame state 已移除 `driveMode`、`drive_mode`、`matchDriveMode`；Theme 選擇只依 `s650Theme`。
- backend 與前端的 generic config migration 繼續保留未知欄位，避免破壞既有持久化設定；這些 legacy 欄位即使隨 payload 到達 renderer，也會被 contract 忽略，無法影響 Theme、layout 或 render 結果。
- 搜尋確認 S650 實作路徑不存在剩餘 drive-mode 消費點；新增 contract test 針對此 migration boundary 驗證。

## Appendix D：Phase 4 current-baseline regression gate（2026-08-11）

現有測試已覆蓋目前承諾的基線，無需為未核可功能加入 placeholder implementation：

| 基線 | 驗證來源 |
| --- | --- |
| 三種 retained Theme 與雙環 profile | `s650Hmi.test.ts`、`s650LayoutProfiles.test.ts`、`s650DualLayoutPipeline.test.ts` |
| 四種中央頁面與顯示／隱藏隔離 | `s650CenterInfo.test.ts`、`s650CenterRegions.test.ts`、`s650FrameVisibility.test.ts` |
| geometry、中心固定 readout 與 side gauges | `s650NormalLayout.test.ts`、`s650NormalStatus.test.ts`、`s650HeritageStatus.test.ts`、`s650CenterDecorations.test.ts`、`s650SideGauge.test.ts` |
| Palette 與 Foxbody GUI override | `s650Tokens.test.ts` |
| Normal dial、gear carousel、base driving | `s650PrimitivesNormalDial.test.ts`、`s650BaseDriving.test.ts` |
| S650 offset、canonical input 與 central-data boundary | `s650FrameVisibility.test.ts`、`s650FrameCanonicalInput.test.ts`、`s650Contract.test.ts`、`s650CenterInfoCanonicalData.test.ts` |

驗收結果：`cmd /c "pnpm -C frontend run test"` 為 33 test files、203 tests 通過。Header、Footer、Shift Light、telltale 與 warning 仍維持 Phase 5 的獨立評估範圍，不視為目前基線缺陷。

## Appendix E：Track theme 實作（2026-08-11）

Track 為本分支第一個完成的候選 Theme，並以獨立 `track` layout type 實作，不再套用 dual-ring 的中央頁、side gauges 或 base-driving layers。它使用 canonical frame 既有的 `rpm`、`maxRpm`、`speed_*`、`gear`、`power_hp`、`boost_psi`、`fuel_ratio`、`heading_deg`、`distance_m`，沒有新增 telemetry contract。

- 視覺與資訊層級：24 段橫向 RPM／換檔帶、中央檔位與 RPM、左側速度、右側 Power／Boost／Fuel、底部方位與里程。
- Ford GT 為外部資訊架構借鑑：採黑／紅高對比、橫向轉速訊號與中央檔位；不複製 OEM 資產、不宣稱為 S650 原廠像素還原。
- 設定與相容性：`s650Theme: "track"` 由 frontend type guard、backend API 與 Canvas contract 一致接受；通用 custom gauge color 不覆寫 Track 的安全關鍵紅色 RPM 語意。
- 回歸範圍：`s650TrackCluster.test.ts` 驗證 24 段 band、資訊層級與 visibility controls；`s650DualLayoutPipeline.test.ts` 驗證不會混入 dual-ring layers；既有 config、palette、profile 與 API test 一併擴充。

## Appendix F：Sport theme 實作（2026-08-11）

Sport 以獨立 `sport` layout type 實作，使用既有 canonical frame，沒有建立 Drive Mode 依賴或新增資料來源。與 Track 相比，Sport 保留較高的動態資訊密度：中央速度與檔位、18 段暖色 RPM band、Power／Boost，以及油門／煞車輸入條。

- 色彩：預設為深色、暖橘 accent、黃色的接近紅線提示與紅色 danger；唯 Sport 維持現有 custom gauge color 行為，讓使用者可在關閉 default colors 時覆寫 primary accent。
- 回歸範圍：`s650SportCluster.test.ts` 驗證 central hierarchy、暖色／黃／紅 RPM band 與 pedal bars；`s650DualLayoutPipeline.test.ts` 驗證不會混入 dual-ring layers；frontend、backend config test 一併擴充。

## Appendix G：SVT Cobra theme 實作（2026-08-11）

SVT Cobra 是 FH6-HorizonTuner 的產品延伸，不是 S650 OEM Cluster Theme。它以獨立 `svtCobra` layout type 實作：黑／白高對比、中央檔位、左右 RPM／速度、下方十段線性紅線帶與 Power／Boost 數據。

- 色彩：固定白色 primary 與紅色 danger，避免 general custom gauge color 稀釋這個延伸主題的黑白高對比語言。
- 回歸範圍：`s650SvtCobraCluster.test.ts` 驗證資訊層級與紅線帶；profile、layout pipeline、theme guard、palette 及 backend config test 皆已擴充。
