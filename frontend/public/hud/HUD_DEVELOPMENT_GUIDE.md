# Forza Horizon 6 HUD 儀表樣式開發與擴充規範規格書 (HUD Development Guide)

本規範規格書旨在為 Forza Horizon 6 Custom HUD 計畫的貢獻者與 Agent 提供統一的儀表開發標準與擴充指南。透過標準化的 `HUDCore` 註冊引擎，任何新增的 HUD 樣式均能在不改動底層通訊與 Launcher 邏輯的前提下，流暢對接全功能遙測數據與 UI 控制項。

---

## 🏛 1. 系統架構概覽 (Architecture Overview)

FH6 Custom HUD 採用多層分離架構：

```mermaid
graph TD
    UDP[Forza 60Hz UDP Telemetry] --> Backend[Python Backend / telemetry_listener]
    Backend --> WS[WebSocket Server]
    WS --> ControlPanel[OverlayView.tsx / Control Panel]
    ControlPanel --> BC[BroadcastChannel: horizon_tuner_hud_channel]
    BC --> Host[public/hud/index.html (Launcher Host)]
    Host -- postMessage --> IFrame[HUD IFrame (simple/index.html, advanced/index.html, etc.)]
    IFrame --> HUDCore[shared/hud-core.js Engine]
    HUDCore --> Style[Registered Style Hooks (onFrame, onElements, onAnimate)]
    HUDCore --> TelemetryCards[shared/telemetry-cards.js (Central Cluster)]
```

### 關鍵職責分工：
- **`public/hud/index.html` (Launcher Host)**：負責與 Tauri 視窗、控制面板進行廣播通訊，並嵌入當前選定的 HUD IFrame。
- **`shared/hud-base.css`**：標準 HUD 視窗佈局、賽車字型宣告（`ForzaFont`, `ForzaGear`）與滿版圖層定位。
- **`shared/hud-core.js`**：HUD 樣式註冊中心 (Registry) 與生命週期事件監聽器。
- **`shared/telemetry-cards.js`**：畫面中央對稱遙測 Cluster (G-Force 雷達、四角懸吊、輪胎滑移與胎溫)。

---

## ⚙️ 2. `HUDCore` 註冊引擎 API 規格書 (API Specification)

所有 HUD 樣式必須呼叫 `HUDCore.registerStyle(id, definition)` 進行聲明式註冊。

### 語法 (Syntax)
```javascript
HUDCore.registerStyle(id, {
    containerId: 'myHudContainer',
    scaleMultiplier: 0.5,
    onInit: function(payload) { ... },
    onElementsChange: function(elements) { ... },
    onFrame: function(data, payload) { ... },
    onAnimate: function() { ... },
    onScale: function(scale) { ... }
});

// 註冊後必須呼叫 init 激活該樣式
HUDCore.init(id);
```

### 參數與鉤子說明 (Hooks Specification)

| 鉤子 / 屬性 | 型別 | 說明 |
| :--- | :--- | :--- |
| `containerId` | `string` | **[必填]** 該 HUD 的右下角主 Gauge DOM 容器 ID（例如 `'simpleContainer'`）。`HUDCore` 將自動控制其 `zoom` 縮放與 `showGauge` 顯隱。 |
| `scaleMultiplier` | `number` | **[可選]** 基礎縮放乘數，預設為 `0.5`（對應 50% 基底比例）。 |
| `onInit(payload)` | `function` | 當 HUD 載入或收到初始化參數時呼叫。`payload` 包含 `isMetric` 等單位資訊。 |
| `onElementsChange(elements)` | `function` | 當玩家在控制面板勾選/取消 HUD 元素時呼叫。`elements` 物件包含：`showGauge`, `showRPM`, `showSpeed`, `showGear`, `showBoost`, `showPowerTorque`, `showWheelLockup` 等。 |
| `onFrame(data, payload)` | `function` | **[核心]** 60Hz UDP 數據更新時呼叫。`data` 包含 `rpm`, `speed`, `gear`, `susp_fl`, `slip_fl`, `TireTemp` 等轉譯遙測；`payload` 包含 `redlineRpm`, `lockup`, `sessionMaxima` 等防鎖死與極限資訊。 |
| `onAnimate()` | `function` | 當玩家點擊 **Launch HUD Overlay**、切換樣式或啟動時呼叫。應在內部觸發該儀表專屬的 Sweep 掃表動畫。 |
| `onScale(scale)` | `function` | 當玩家調整 HUD 縮放比例時呼叫。`scale` 為最終計算出的 `zoom` 數值。 |

---

## 🎨 3. 新增 HUD 樣式步驟教學 (Step-by-Step Template)

若您想建立名為 `retro` 的新儀表樣式：

### 步驟 1：建立目錄與 HTML 檔案
於 `frontend/public/hud/retro/index.html` 建立標準模板：

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Retro HUD</title>
    <!-- 1. 引入共享 Base 樣式 -->
    <link rel="stylesheet" href="../shared/hud-base.css">
    <style>
        /* 您的專屬 HUD CSS 樣式 */
        .retro-container {
            width: 800px;
            height: 400px;
            background: rgba(0, 0, 0, 0.5);
        }
    </style>
</head>
<body>
    <!-- 2. 共享中央遙測掛載點 (必須保留) -->
    <div id="teleCardsMount"></div>

    <!-- 3. 標準 根視窗 與 儀表容器 -->
    <div class="hud-root-wrapper">
        <div class="hud-gauge-container" id="retroContainer">
            <!-- 您的儀表 DOM & Canvas 結構 -->
            <canvas id="retroCanvas" width="800" height="400"></canvas>
            <div id="retroSpeed">0</div>
        </div>
    </div>

    <!-- 4. 引入共享 JavaScript 模組 -->
    <script src="../shared/telemetry-cards.js"></script>
    <script src="../shared/hud-core.js"></script>

    <script>
        // 5. 註冊並激活新樣式
        HUDCore.registerStyle('retro', {
            containerId: 'retroContainer',
            scaleMultiplier: 0.5,

            onInit: function(payload) {
                console.log('Retro HUD Initialized');
            },

            onElementsChange: function(elements) {
                // 控制內部組件顯隱
            },

            onFrame: function(data, payload) {
                // 渲染 60Hz 數據
                document.getElementById('retroSpeed').textContent = Math.round(data.speed || 0);
            },

            onAnimate: function() {
                // 執行專屬啟動動畫
            }
        });

        // 6. 激活
        HUDCore.init('retro');
    </script>
</body>
</html>
```

### 步驟 2：在控制面板與 Selector 註冊新樣式
在 `OverlayView.tsx` 與 `OverlayLauncher` 的樣式選擇按鈕中加入 `'retro'` 選項即可！

---

## ⚡ 4. 60Hz 渲染與效能防護守則 (Performance Rules)

為確保在高影格率賽車情境下 HUD 不發生卡頓，請遵守以下規則：

1. **純 DOM 語意更新，避免深拷貝 (No Deep Copy in onFrame)**：
   - 在 `onFrame` 內嚴禁進行 `JSON.parse(JSON.stringify(data))` 或高開銷陣列操作。
2. **使用 2D Canvas Context 緩存 (Context Caching)**：
   - 繪製儀表刻度與背景時，應區分為「靜態 Background Canvas」（只畫一次）與「動態 Needle Canvas」（每幀繪製）。
3. **適度使用 `requestAnimationFrame`**：
   - 定時 Sweep 掃描動畫必須透過 `requestAnimationFrame` 更新，並在動畫結束時及時解除標記 (`sweepActive = false`)。
