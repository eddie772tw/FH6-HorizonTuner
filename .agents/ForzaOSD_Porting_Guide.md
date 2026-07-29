# 基於 Lua 腳本的通用動態 HUD 錶盤移植指引手冊 (ForzaOSD_Porting_Guide.md)

本指引手冊旨在定義一種「基於 Lua 腳本聲明繪圖指令與配置，並結合靜態 assets 資源包」的通用動態 HUD 錶盤規範，指引開發 Agent 如何在 Web 渲染架構下（`hud_overlay`）建立一個 Fengari-based JS 轉譯層，以高效率、高相容性地直接執行此格式之錶盤。

---

## 🧭 1. 技術路線評估與架構設計

為了在前端網頁環境中支援以 Lua 撰寫的錶盤配置與動態渲染，有以下兩條開發路徑可供評估：

### 方案 A：建立通用 JavaScript 轉譯層（基於 Fengari Lua VM，推薦）
- **實作原理**：在前端載入輕量級 `fengari-web.js`，作為瀏覽器端 Lua 5.4 的執行容器。透過 JS 實作與 Lua 腳本對接的虛擬 `draw` 指令集，將 Lua 提交的繪圖描述轉譯為 HTML5 Canvas 2D API 呼叫。
- **優勢**：
  - **100% 邏輯相容**：直接運行原始 Lua 腳本，完全保留原錶盤中的物理公式、條件判斷、動態插值等邏輯，免除手動翻譯帶來的精度誤差與人為錯誤。
  - **極低維護成本**：只需實作一次轉譯層，未來新增相同規格的 Lua 錶盤包時，不需修改任何 JS 代碼即可直接開箱使用。
- **效能開銷**：
  - 在每幀繪製不超過 200 個基本向量圖形的情況下，Lua 虛擬機單幀執行時間低於 0.5ms，效能負擔微乎其微。

### 方案 B：人工 JavaScript 程式碼重寫（不推薦）
- **實作原理**：人工解讀每一個錶盤 Lua 檔案的邏輯，並使用 JavaScript 重寫所有的渲染與計算。
- **劣勢**：每個錶盤皆有數百行邏輯，包含大量的數學計算（如 G 力彈簧物理、進度條插值、複雜弧形繪製、多維配置解析），手動重寫容易出錯，且日後擴充新錶盤需要重複投入開發成本。

---

## 📂 2. 目錄結構與檔案配置

建立轉譯層後，網頁端目錄架構規劃如下：

```text
d:\FH6-HorizonTuner\hud_overlay\
├── index.html                      # 擴充 HUD 選擇清單，註冊各錶盤的路徑映射
├── shared\
│   ├── fengari-web.js              # [NEW] 輕量級 Lua VM 執行庫
│   ├── forzaosd-engine.js          # [NEW] 通用 Lua-to-Canvas 2D 繪圖轉譯引擎
│   ├── hud-core.js                 # 既有註冊核心
│   └── coordinator.js              # 既有遙測數據接收與格式化中心
└── forzaosd\
    ├── index.html                  # [NEW] 通用錶盤 Host 載體，讀取 query string 來載入指定錶盤
    └── profiles\                   # [NEW] 通用 Lua 錶盤包存放目錄
        ├── fm4ui/                  #   包含 profile.lua 腳本與 assets/ 目錄
        ├── gt7/
        └── ...
```

---

## 🛠 3. 遙測數據轉換與上下文注入

轉譯引擎在接收到系統的遙測數據包後，必須建立一個虛擬的 Lua `ctx` 上下文對象傳入 Lua 的渲染方法。資料對齊規範如下：

```javascript
// forzaosd-engine.js 轉譯遙測數據對應
function makeLuaContext(data, payload, width, height, isMetric, opacity, time, isEditMode) {
    return {
        telemetry: {
            available: true,
            fresh: true,
            race_on: data.isRaceOn === true || data.isRaceOn === 1,
            speed_mps: data.SpeedMetersPerSecond || 0,
            speed_kph: data.speed_kmh || (data.SpeedMetersPerSecond * 3.6) || 0,
            speed_mph: data.speed_mph || (data.SpeedMetersPerSecond * 2.23694) || 0,
            rpm: data.rpm || 0,
            max_rpm: data.max_rpm || 8000,
            idle_rpm: data.idle_rpm || 1000,
            gear: data.gear ?? 11,
            gear_label: data.gear === 0 ? 'R' : (data.gear === 11 ? 'N' : String(data.gear)),
            throttle: data.throttle || 0,
            brake: data.brake || 0,
            clutch: data.clutch || 0,
            handbrake: !!data.hand_brake || !!data.handbrake,
            steering: data.steer || 0,
            boost: data.boost_psi || 0,
            
            // 輪胎狀態
            tire_temp_front_left: data.temp_fl || 0,
            tire_temp_front_right: data.temp_fr || 0,
            tire_temp_rear_left: data.temp_rl || 0,
            tire_temp_rear_right: data.temp_rr || 0,
            
            normalized_suspension_travel_front_left: data.susp_fl || 0,
            normalized_suspension_travel_front_right: data.susp_fr || 0,
            normalized_suspension_travel_rear_left: data.susp_rl || 0,
            normalized_suspension_travel_rear_right: data.susp_rr || 0,

            tire_slip_ratio_front_left: data.slip_fl || 0,
            tire_slip_ratio_front_right: data.slip_fr || 0,
            tire_slip_ratio_rear_left: data.slip_rl || 0,
            tire_slip_ratio_rear_right: data.slip_rr || 0,
            
            // 賽事資訊
            race_position: data.RacePosition || 0,
            lap_number: data.LapNumber || 0,
            
            // G 力映射 (加速度轉重力加速度)
            lateral_g: data.lateral_g ?? (data.accel_x / 9.80665) ?? 0,
            longitudinal_g: data.longitudinal_g ?? (data.accel_z / 9.80665) ?? 0,
        },
        settings: payload.settings || {}, // 使用者自定義設定值
        draw: createDrawProxy(),          // 繪圖代理介面
        metric: isMetric,
        opacity: opacity,
        time: time,
        edit_mode: isEditMode
    };
}
```

---

## 🎨 4. Canvas 2D 繪圖代理規範 (Draw Proxy Mapping)

轉譯引擎的核心任務是實現 Lua 所調用的繪圖描述物件與 Canvas 2D 方法的實體對映。

### 坐標系轉換與縮放變換
錶盤內所有局部坐標（`x`, `y`, `w`, `h`）必須轉換為螢幕實際坐標，計算公式如下：

$$\text{scale} = \frac{\text{viewport\_height}}{\text{reference\_height}} \times \text{settings.scale}$$

$$\text{origin\_x} = \text{viewport\_width} \times \text{settings.x} - \frac{\text{layout.width} \times \text{scale}}{2} + \text{OffsetX} \times \text{scale}$$

$$\text{origin\_y} = \text{viewport\_height} \times \text{settings.y} - \frac{\text{layout.height} \times \text{scale}}{2} + \text{OffsetY} \times \text{scale}$$

- 若繪圖指令標註 `space == "screen"`：最終坐標不加偏移量，但仍需乘以 `scale` 進行縮放。
- 若繪圖指令標註 `space == "profile"` (預設)：最終坐標需乘以 `scale` 並加上相對原點 `origin_x`/`origin_y`。

### 繪圖代理映射指令集

1. **矩形及圓角 (`draw.rect`)**
   - 屬性：`x, y, w, h, color, alpha, rounding`
   - 對應：使用 `roundRect` API，圓角半徑需乘以 `scale`。

2. **描邊及圓角外框 (`draw.outline`)**
   - 屬性：`x, y, w, h, color, alpha, rounding, thickness`
   - 對應：使用 `roundRect` API，線寬（`thickness * scale`）後執行 `stroke()`。

3. **漸層填滿 (`draw.gradient`)**
   - 屬性：`x, y, w, h, color, color2, color3, direction, alpha, rounding`
   - 對應：使用 `createLinearGradient` 建立線性漸層。若有 `rounding`，需先執行圓角 `clip()` 後再填滿。

4. **線段 (`draw.line`)**
   - 屬性：`x1, y1, x2, y2, color, alpha, thickness`
   - 對應：`beginPath()`, `moveTo()`, `lineTo()`, `stroke()`。

5. **圓形 (`draw.circle`)**
   - 屬性：`cx, cy, radius, color, alpha`
   - 對應：`arc(cx, cy, radius * scale, 0, Math.PI * 2)`。

6. **文字繪製 (`draw.text`)**
   - 屬性：`x, y, font, text, size, align, color, alpha, shadow`
   - 對應：設定 `font` 為 `"${size * scale}px ${font_family}"`，根據 `align` 設定 `textAlign`，基線設為 `middle`。若開啟 `shadow`，開啟 Canvas 的 `shadow` 屬性。

7. **圖片素材及旋轉 (`draw.image`)**
   - 屬性：`asset, x, y, w, h, color, alpha, rotation, pivot_x, pivot_y, uv_x1, uv_y1, uv_x2, uv_y2`
   - 對應：
     - 若有旋轉，計算旋轉中心 `px = x + w * pivot_x`, `py = y + h * pivot_y`，在 Canvas context 進行 `translate`, `rotate` 轉換。
     - 若有 UV 切割屬性，計算圖片實際像素區域並使用 `drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)` 進行局部剪裁渲染。

8. **錶盤總偏移 (`draw.set_offset`)**
   - 屬性：`x, y`
   - 對應：設定全域 `OffsetX = x`, `OffsetY = y`，供後續 `"profile"` 空間指令進行坐標修正。

---

## 🚀 5. 資源預載入與快取最佳化

為確保 60Hz 渲染流暢度，在啟動 Lua 渲染程序前必須保證資源載入完畢：
1. **圖片異步載入**：在轉譯層載入 Lua 時，先提取其中的 `assets` 貼圖映射表，預先建立 `Image` 物件並以 `Promise.all` 進行同步預載，加載完成前呈現 Standby 狀態。
2. **TTF 字型動態加載**：解析 `fonts` 設定表，使用瀏覽器 `FontFace` API 載入本地 TTF 檔案並動態注入 `document.fonts` 以防文字渲染時字型尚未載入完成導致佈局錯亂。
3. **雙層 Canvas 緩存機制**：針對渲染節點較多的刻度線等靜態元素，可使用獨立的背景 Canvas 緩存層，動態繪製層只處理遙測數據變動的部分，減少重繪開銷。
