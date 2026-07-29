# Forza Horizon 6 HUD 儀表樣式開發與擴充規範規格書 (HUD Development Guide)

本規範規格書旨在為 Forza Horizon 6 Custom HUD 計畫的貢獻者與 Agent 提供統一的儀表開發標準與擴充指南。透過標準化的 `HUDCore` 註冊引擎，任何新增的 HUD 樣式均能在不改動底層通訊與 Launcher 邏輯的前提下，流暢對接全功能遙測數據與 UI 控制項。

---

## 🏛 1. 系統架構概覽 (Architecture Overview)

FH6 Custom HUD 採用原生 HTML5 Canvas + JavaScript 多層分離與解耦架構：

```mermaid
graph TD
    UDP[Forza 60Hz UDP Telemetry] --> Backend[Python Backend / telemetry_listener.py]
    Backend --> WS[WebSocket Server / Overlay API]
    WS --> ControlPanel[OverlayView.tsx / Control Panel (3x2 Grid)]
    ControlPanel --> BC[BroadcastChannel: horizon_tuner_hud_channel]
    BC --> Host[hud_overlay/index.html (Launcher Host)]
    Host -- postMessage / iframe src --> IFrame[HUD IFrame (hud_overlay/<style_name>/index.html)]
    IFrame --> HUDCore[hud_overlay/shared/hud-core.js Engine]
    HUDCore --> Style[Registered Style Hooks (onInit, onFrame, onElementsChange, onAnimate, onScale)]
    HUDCore --> TelemetryCards[hud_overlay/shared/telemetry-cards.js (Central Cluster)]
```

### 關鍵目錄與職責分工：
- **`hud_overlay/index.html` (Launcher Host)**：負責與 Tauri 視窗、控制面板進行廣播通訊，維護 `HUDS` 映射字典，並嵌入當前選定的 HUD IFrame。
- **`hud_overlay/shared/hud-base.css`**：標準 HUD 視窗佈局、賽車字型宣告（`ForzaFont`, `ForzaGear`）與全螢幕無邊框容器定位。
- **`hud_overlay/shared/hud-core.js`**：HUD 樣式註冊中心 (Registry) 與生命週期事件監聽器。支援發光強度、自訂色彩、縮放計算與 `hud:reload` / `hud:destroy` 動態訊息。
- **`hud_overlay/shared/telemetry-cards/`**：畫面中央對稱遙測 Cluster（G-Force 雷達、四角懸吊行程、輪胎滑移角與胎溫、油門煞車波形、馬力扭力圖）。
- **`hud_overlay/<style_name>/index.html`**：8 款純原生 HTML5 Canvas+JS 儀表（`advanced`, `simple`, `fm4ui`, `gt7`, `mw2005`, `nfs15`, `shift_tacho`, `vfd`）。

---

## ⚙️ 2. `HUDCore` 註冊引擎 API 規格書 (API Specification)

所有 HUD 樣式必須呼叫 `HUDCore.registerStyle(id, definition)` 進行聲明式註冊。

### 語法 (Syntax)
```javascript
HUDCore.registerStyle(id, {
    containerId: 'myHudContainer',
    scaleMultiplier: 0.8,
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
| `containerId` | `string` | **[必填]** 該 HUD 的主 Gauge DOM 容器 ID（例如 `'simpleContainer'`）。`HUDCore` 將自動控制其 `zoom` 縮放與 `showGauge` 顯隱。 |
| `scaleMultiplier` | `number` | **[必填]** 基礎縮放乘數。應根據容器原始寬高進行校準，使 1.0 全域縮放下的目標視覺寬度在 **360px ~ 400px** 之間。 |
| `onInit(payload)` | `function` | 當 HUD 載入或收到初始化配置時呼叫。`payload` 包含 `isMetric` 等單位資訊。 |
| `onElementsChange(elements)` | `function` | 當玩家在控制面板勾選/取消 HUD 元素時呼叫。`elements` 物件包含：`showGauge`, `showMotionEffect`, `showTeleSuspension`, `showTeleTires`, `showTeleAttitude`, `showTelePedals`, `showPowerTorque` 等。 |
| `onFrame(data, payload)` | `function` | **[核心]** 60Hz UDP 數據更新時呼叫。`data` 包含 `rpm`, `speed`, `gear`, `susp_fl`, `slip_fl`, `TireTemp` 等轉譯遙測；`payload` 包含 `redlineRpm`, `lockup` 等資訊。 |
| `onAnimate()` | `function` | 當玩家點擊 **Launch HUD Overlay**、刷新或啟動時呼叫。應在內部觸發該儀表專屬的 Sweep 掃表動畫。 |
| `onScale(scale)` | `function` | 當玩家調整 HUD 縮放比例時呼叫。`scale` 為最終計算出的 `zoom` 數值。 |

### 動態 CSS 變數支援 (Injected CSS Variables)
`HUDCore` 會自動將控制面板設定注入為最頂層的 CSS 變數：
- `--hud-glow-intensity`：發光強度 ($0.0 \sim 2.0$)
- `--hud-custom-color`：自訂色彩 HEX 或預設樣式色彩
- `--tc-elem-scale`：中央遙測卡片元素獨立縮放倍率

---

## 🎨 3. 新增 HUD 樣式步驟教學 (Step-by-Step Template)

若您想建立名為 `custom_dash` 的新儀表樣式：

### 步驟 1：建立目錄與 HTML 檔案
於 `hud_overlay/custom_dash/index.html` 建立標準模板：

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Custom Dash HUD</title>
    <!-- 1. 引入共享 Base 樣式 -->
    <link rel="stylesheet" href="../shared/hud-base.css">
    <style>
        /* 專屬 HUD CSS 樣式：注意右下角儀表容器不可寫死 position: absolute; bottom/right */
        .custom-dash-container {
            width: 400px;
            height: 300px;
            pointer-events: none;
        }
        canvas { display: block; width: 400px; height: 300px; }
    </style>
</head>
<body>
    <!-- 2. 共享中央遙測掛載點 (必須保留) -->
    <div id="teleCardsMount"></div>

    <!-- 3. 標準根視窗與儀表容器 -->
    <div class="hud-root-wrapper">
        <div class="hud-gauge-container custom-dash-container" id="customDashContainer">
            <canvas id="customDashCanvas" width="400" height="300"></canvas>
        </div>
    </div>

    <!-- 4. 引入共享 JavaScript 模組 -->
    <script type="module" src="../shared/telemetry-cards.js"></script>
    <script src="../shared/hud-core.js"></script>

    <script>
        (function() {
            var canvas = document.getElementById('customDashCanvas');
            var ctx = canvas ? canvas.getContext('2d') : null;

            // 5. 註冊並激活新樣式
            HUDCore.registerStyle('custom_dash', {
                containerId: 'customDashContainer',
                scaleMultiplier: 1.0, // 校準目標視覺寬度約 400px

                onInit: function(payload) {
                    console.log('Custom Dash HUD Initialized');
                },

                onElementsChange: function(elements) {
                    var c = document.getElementById('customDashContainer');
                    if (c) c.style.display = elements.showGauge === false ? 'none' : 'block';
                },

                onFrame: function(data, payload) {
                    // 渲染 60Hz 數據
                    if (!ctx) return;
                    ctx.clearRect(0, 0, 400, 300);
                    // 繪製轉速、時速與檔位...
                },

                onAnimate: function() {
                    // 執行專屬掃表動畫
                }
            });

            // 6. 激活
            HUDCore.init('custom_dash');
        })();
    </script>
</body>
</html>
```

### 步驟 2：在 Launcher 註冊導向
在 `hud_overlay/index.html` 的 `HUDS` 對照地圖中新增條目：
```javascript
const HUDS = {
    simple: './simple/index.html',
    advanced: './advanced/index.html',
    // ...
    custom_dash: './custom_dash/index.html'
};
```

### 步驟 3：建立 `author.json` 作者元數據
在您的 HUD 目錄下建立 `hud_overlay/custom_dash/author.json`：
```json
{
  "author": "Your Name",
  "description": "A brief description of your custom dash."
}
```
控制面板會在選單切換時動態 `fetch` 載入此檔案，並快取於記憶體中避免重複請求。

### 步驟 4：在控制面板 `OverlayView.tsx` 註冊選單
1. 於 `HudConfig['hudStyle']` 聯合型別加入 `'custom_dash'`。
2. 於 `<select>` 中加入對應的 `<option value="custom_dash">`。

---

## 步驟 4. 版面與佈局對齊規範 (Layout & Alignment Rules)

1. **右下角邊距對齊 (Bottom-Right Alignment)**：
   - 除了設計上必須居中置底 (`align-self: center; transform-origin: bottom center;`) 或有特定指定位置的情況外，其餘儀表容器**嚴禁寫死 `position: absolute; bottom/right`**。
   - 容器必須維持 relative/flex 靜態定位，統一由 `.hud-root-wrapper` (flex padding: 30px, `transform-origin: bottom right`) 約束對齊，確保與螢幕邊界 100% 齊平。
2. **視覺尺寸等比例校準 (Scale Multipliers Calibration)**：
   - 各儀表的 `scaleMultiplier` 必須精確校準，使全域 1.0 縮放下的實際視覺目標寬度收斂在 **360px ~ 400px** 之間。
   - 應利用 `HUDCore` 已內建的 **`hud:set-scale`** 廣播訊息，動態調整縮放比例，以適應不同解析度的螢幕。可參考 `GT7 HUD` 

---

## 步驟 5. 60Hz 渲染與效能防護守則 (Performance Rules)

為確保在高影格率賽車情境下 HUD 不發生卡頓，請嚴格遵守以下規則：

1. **純 DOM / Canvas 語意更新，避免深拷貝 (No Deep Copy in onFrame)**：
   - 在 `onFrame` 內嚴禁進行 `JSON.parse(JSON.stringify(data))` 或高開銷陣列操作。
2. **圖像與 Sprite 靜態預載 (Image Preloading)**：
   - 針對序列切片或 Sprite 圖像（如數字、檔位、轉速弧條），必須於頁面載入時建立 `Image` 物件陣列靜態預載，在 `onFrame` 內直接呼叫 `ctx.drawImage`，嚴禁每幀建立 DOM 物件。
3. **適度使用 `requestAnimationFrame`**：
   - 定時 Sweep 掃描動畫必須透過 `requestAnimationFrame` 更新，並在動畫結束時及時解除標記 (`sweepActive = false`)。
