# ForzaHUD 移植評估與 FH6-HorizonTuner 整合架構設計報告

本報告結合主專案 `FH6-HorizonTuner` 的核心架構，深入評估將 ForzaHUD 技術精髓引入主專案的可行性，並為其量身打造具體整合實作方案。

---

## 1. 主專案架構特徵與技術匹配

經過對 `FH6-HorizonTuner` 代碼庫的架構解析，主專案採用了高度靈活的**前後端分離混合桌面架構**：
*   **前端外殼 (`frontend`)**：基於 **Tauri v2 + Vite + React + TypeScript** 構建的桌面視窗系統。
*   **後端服務 (`backend`)**：基於 **Python FastAPI**，內建 `telemetry_listener.py` 透過 UDP 接收 60Hz 遙測封包，並透過 **WebSocket** 與前端進行雙向即時通訊。

### 📌 重大架構評估結論
由於主專案採用了 **Tauri** 框架，我們**完全不需要**在主專案中使用 C++ 或 Direct3D 11 從零手寫渲染引擎與 ImGUI 交互！Tauri 本身已原生支持置頂、透明的 Webview 視窗。
我們可以直接在 Web 前端（React + CSS3 + SVG/Canvas）實現 HUD UI，並利用 Tauri 2.0 與作業系統底層 API 交互，開發難度相較於原版的 C++/D3D11 下降了 90% 以上。

---

## 2. 整合實作方法設計 (Tauri v2 + React 方案)

基於主專案架構，我們針對「滑鼠穿透」、「全域熱鍵」與「HUD 貼圖繪製」三個核心逆向邏輯，在主專案中規劃如下整合方式：

### 核心 A：動態滑鼠穿透 (Mouse Passthrough)
*   **ForzaHUD 實作**：動態增減 `WS_EX_TRANSPARENT` 屬性，配合 `ImGui_ImplWin32_WndProcHandler` 攔截。
*   **主專案整合方案**：
    1.  在 `src-tauri/tauri.conf.json` 中，將 HUD 視窗設定為透明且置頂：
        ```json
        "windows": [
          {
            "label": "hud",
            "transparent": true,
            "alwaysOnTop": true,
            "decorations": false
          }
        ]
      ```
    2.  利用 Tauri 提供的 `setIgnoreCursorEvents` API 來控制滑鼠穿透。
    3.  在 React 前端，預設讓整個視窗處於「滑鼠穿透」狀態。當滑鼠移入特定可交互的 HUD 配置面板（例如設定選單）時，允許滑鼠交互；移出時恢復穿透：
        ```typescript
        import { getCurrentWindow } from '@tauri-apps/api/window';
        const appWindow = getCurrentWindow();

        // 預設啟用滑鼠穿透，讓玩家可以正常操作遊戲
        appWindow.setIgnoreCursorEvents(true);

        // React 組件事件監聽
        const handleMouseEnter = () => {
          // 當滑鼠移入 UI 設定面板時，攔截滑鼠點擊
          appWindow.setIgnoreCursorEvents(false);
        };

        const handleMouseLeave = () => {
          // 當滑鼠離開 UI 設定面板時，恢復穿透
          appWindow.setIgnoreCursorEvents(true);
        };
        ```

### 核心 B：全域熱鍵與顯示切換
*   **ForzaHUD 實作**：使用 Windows 底層的 Low-Level Keyboard Hook (`WH_KEYBOARD_LL`)。
*   **主專案整合方案**：
    直接整合 Tauri v2 的官方全域快捷鍵插件 `@tauri-apps/plugin-global-shortcut`：
    1.  在 Rust 核心端註冊熱鍵（例如 `Ctrl+F1` 或 `~` 鍵）。
    2.  當熱鍵觸發時，透過 Tauri 事件系統通知前端 React，切換 HUD 的隱藏與顯示狀態。這樣做既免去了寫 C++ Windows Hook 的麻煩，又能確保多平台的相容性與系統安全性。

### 核心 C：HUD 繪製與遙測動態同步
*   **ForzaHUD 實作**：D3D11 載入 DDS 資源，藉由著色器變形並在渲染主迴圈繪製。
*   **主專案整合方案**：
    1.  **貼圖載入**：我們從 `ForzaHUD.exe` 中提取出的 PNG 圖形資源（如指針 `res_10_410.png`），可直接放置於 `frontend/public/assets/hud/` 底下，直接透過 HTML `<img>` 或 React 元件引入。
    2.  **數據流驅動**： Fast API 後端在 `telemetry_listener.py` 中解析完 UDP 遙測封包後，透過 WebSocket 將車載數據推送至 React 前端。
    3.  **UI 變換動畫**：前端 React 訂閱此 WebSocket，並直接使用 CSS3 的高效變換來實作動畫。例如指針旋轉：
        ```jsx
        // 假設 0 rpm 對應 -120 度，9000 rpm 對應 120 度
        const rotationAngle = (currentRpm / 9000) * 240 - 120;
        
        return (
          <div className="gauge-container">
            <img src="/assets/hud/tacho_bg.png" className="gauge-bg" />
            <img 
              src="/assets/hud/needle.png" 
              className="gauge-needle"
              style={{ transform: `rotate(${rotationAngle}deg)`, transition: 'transform 16ms linear' }} 
            />
          </div>
        );
        ```

---

## 3. UI 預設樣式 (Presets) 與導出資源 (Resources) 映射對照表

經過對 `ui-presets/` 中 10 個風格設定檔（如 `Defi Advance.ini`, `GT7.ini`）進行解析，我們成功將設定檔中的 **Widget 樣式索引** 與 **導出的 PNG/DDS 圖形資源** 建立了精準映射，這將直接指導主專案的 UI 風格切換實作：

### 📊 1. 儀表板背景對照 (Dashboard Widget)
*   **設定欄位**：`dashboard_widget` (值範圍 0 ~ 5)
*   **導出資源**：2xx 系列圖形 (大小 `1024x512` 或 `512x256` 寬螢幕底圖)
*   **樣式風格對照**：
    *   **`dashboard_widget = 0`**：對應 `res_10_250.png` (Autometer + AEM 風格 / 基礎通用面板)
    *   **`dashboard_widget = 1`**：對應 `res_10_254.png` (NFS2015 風格 / 街頭動態面板)
    *   **`dashboard_widget = 2`**：對應 `res_10_255.png` (Soarer 風格 / 豐田數位老學校液晶面板)
    *   **`dashboard_widget = 3`**：對應 `res_10_256.png` (JZX100 風格 / 日系 90 年代街車面板)
    *   **`dashboard_widget = 4`**：對應 `res_10_257.png` (Altezza TRD 風格 / 經典橙光三環運動錶底)
    *   **`dashboard_widget = 5`**：對應 `res_10_258.png` (Ford GT 風格 / 賽道化超跑儀表)

### 📈 2. 轉速錶錶盤對照 (Tacho Widget)
*   **設定欄位**：`tacho_widget` (值範圍 0 ~ 3)
*   **導出資源**：4xx 系列正方形圖形 (`420x420` 錶盤底圖，搭配 `128x128` 或 `66x64` 指針)
*   **樣式風格對照**：
    *   **`tacho_widget = 0`**：對應 `res_10_410.png` (傳統機械式白底指針錶盤，搭配 `res_10_408.png` 紅色指針)
    *   **`tacho_widget = 1`**：對應 `res_10_411.png` (Defi/賽事專用黑底高對比錶盤)
    *   **`tacho_widget = 3`**：對應 `res_10_401.png` (輕量化 Speedhut 復古錶盤)

### 📻 3. 收音機面板對照 (Radio Widget)
*   **設定欄位**：`radio_widget` (值範圍 0 ~ 5)
*   **導出資源**：3xx 系列面板圖形
*   **樣式風格對照**：
    *   **`radio_widget = 0`** (Ford GT/GT7)：對應 `res_10_304.png` (`628x162` 傳統方正音樂面板)
    *   **`radio_widget = 1`** (NFS2015/JZX100)：對應 `res_10_311.png` (`792x190` 現代化半透明流線音樂面板，搭配進度條 `res_10_305.png`)
    *   **`radio_widget = 2`** (Altezza TRD)：對應 `res_10_312.png` (`204x211` 迷你圓形音樂播放器)
    *   **`radio_widget = 5`** (Defi Advance)：對應 `res_10_313.png` (`209x103` 跑馬燈極簡風格面板)

### 🕹️ 4. 手把模擬面板 (Controller Widget)
*   **設定欄位**：`controller_widget` (固定為 0)
*   **導出資源**：5xx 系列圖形
*   **對照說明**：手把只有一種樣式。
    *   `res_10_500.png` (`917x227`) 為手把完整按鍵分佈底圖。
    *   `res_10_510.png` 至 `res_10_522.png` 為各按鍵的按下高亮/搖桿撥動狀態貼圖，可根據 XInput 遙測數值在前端動態疊加顯示。

---

## 4. 開發實作優先序

為了快速將 HUD 系統引進 `FH6-HorizonTuner` 及支援上述多風格切換，建議依循以下順序進行整合：

```
[階段 1: 遙測對接] 🚀
  └── 確保 FastAPI 後端能穩定透過 WebSocket 將 Speed/RPM 發送給 React 前端。

[階段 2: 透明視窗與穿透] 🖥️
  └── 實作配置 Tauri 的透明視窗與 `setIgnoreCursorEvents` 機制，確保滑鼠能點穿 UI，但不影響面板交互。

[階段 3: React HUD 渲染與風格映射] 🎨
  └── 建立 StyleManager。根據用戶選擇的風格 INI，動態加載對應的 PNG 貼圖資源並使用 CSS3 渲染。

[階段 4: 配置保存] 💾
  └── 整合主專案的 `settings.json` 管理 HUD 視窗的預設位置與自定義快捷鍵。
```
