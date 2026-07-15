# ForzaHUD 逆向工程與技術移交指南 (Handover Guide)

本目錄包含針對 `.ref/ForzaHUD/ForzaHUD.exe` 進行深度逆向工程與技術分析的所有腳本、分析產物以及導出的 HUD 資源檔。其他 Agent 或開發人員可直接透過本指南與本目錄下的資源無縫接手後續的整合開發工作。

---

## 📂 目錄結構與檔案清單

```
/ForzaHUD_RE/
├── extracted_resources/     # [關鍵產物] 從 exe 內嵌資源中提取出的 98 個 PNG/DDS 貼圖
├── ghidra_proj/             # Ghidra Headless 專案資料庫 (包含已分析的代碼)
│
├── [自動化分析與提取腳本]
├── analyze_pe.py            # PE 基礎架構分析 (架構、區段、IAT 匯入表)
├── extract_offsets.py       # 自動定位關鍵 IAT 函數與關鍵字串的內存位址 (RVA)
├── extract_resources.py     # 自動提取 .rsrc 資源，辨識 DDS/PNG 格式並導出
├── analyze_presets.py       # 解析 ui-presets 中的 10 個風格設定檔，統計 Widget 屬性
├── map_images.py            # 掃描並分類提取出貼圖的尺寸與解析度，方便對照 UI 設計
├── find_user32_imports.py   # 定位 USER32.dll 的 API IAT 位址 (如 RegisterClassExW)
│
├── [Ghidra Headless 自動化分析 Java 腳本]
├── ExtractCode.java         # 提取手把狀態更新 (ViGEm) 與 D3D11 初始化的虛擬碼
├── ExtractWndProc.java      # 定位視窗類別註冊與全域低階鍵盤 Hook
├── ExtractDetailedWndProc.java # 詳細反編譯 WndProc 消息處理與鍵盤 Hook 回呼函數
│
├── [分析報告與數據導出]
├── analysis_offsets.json    # 自動掃描產出的關鍵字串與 IAT 函數之內存位址清單
├── decompiled_output.txt    # 遙測數據手把更新 (`vigem_target_x360_update`) 與 D3D11 初始化代碼
├── wndproc_output.txt       # WinMain/視窗類別初始化與註冊流程代碼
├── wndproc_detail.txt       # 核心 WndProc 消息分發與全域鍵盤熱鍵攔截邏輯代碼
└── README.md                # 本移交文件
```

---

## 🔑 核心逆向工程發現與關鍵內存位址

接手開發時，可直接使用已分析好的位址或調用 Ghidra 專案，重點邏輯如下：

1.  **D3D11 & DirectComposition 初始化**：
    *   **RVA / 函數位址**：`0x140013200`
    *   **邏輯**：使用 `CreateSwapChainForComposition` 與 `DCompositionCreateDevice` 建立半透明無邊框的 Flip-Model Composition 視窗。
2.  **視窗訊息處理函數 (WndProc)**：
    *   **RVA / 函數位址**：`0x140009c70`
    *   **邏輯**：在最前端將訊息導入 `ImGui_ImplWin32_WndProcHandler` (位址 `0x140079f60`)。若滑鼠移入 ImGUI 面板則攔截點擊；若在背景則配合動態增減 `WS_EX_TRANSPARENT` 屬性實現滑鼠穿透與互動的動態切換。
3.  **全域鍵盤 Hook (WH_KEYBOARD_LL)**：
    *   **RVA / 函數位址**：`0x140009870` (Hook 回呼)；`0x1400bd818` (`SetWindowsHookExW` IAT Entry)
    *   **邏輯**：在背景監聽 `WM_KEYDOWN`，比對從 `ForzaHUD.ini` 載入的按鍵碼與 Ctrl/Alt/Shift 修飾鍵，匹配時透過 `PostMessageW(..., 0x8001, EVENT_ID, 0)` 將自定義事件送回主視窗反轉 UI 顯示狀態。
4.  **Drift Assist 遙測手把更新**：
    *   **RVA / 函數位址**：`0x140040b50`
    *   **邏輯**：讀取遙測緩衝區 (Offset `0x4` ~ `0x14`) 的車輛動態數據，透過 Clamping 與線性乘法映射至 Xbox 手把範圍，調用 `vigem_target_x360_update` 輸出控制訊號。

---

## 🎨 貼圖資源與 HUD 風格對照指南

我們已經將 `.ref/ForzaHUD/ui-presets/` 中載入的風格樣式，與 [**`extracted_resources/`**](file:///d:/FH6-Bundle/FH6-HorizonTuner/tools/ForzaHUD_RE/extracted_resources/) 內提取出的貼圖完成了配對。在主專案的前端實作多風格切換時，請參考以下對照：

*   **時速/轉速錶盤 (Tacho)**：
    *   傳統機械白底錶 (Altezza/GT7)：載入 `res_10_410.png` (`420x420`) 錶盤 + `res_10_408.png` 紅色指針。
    *   Defi Advance 賽車錶：載入 `res_10_411.png` (`420x420` 黑底錶盤)。
*   **寬螢幕儀表板底圖 (Dashboard)**：
    *   Defi / Autometer 樣式 (`dashboard_widget = 0`)：載入 `res_10_250.png` (`1024x512`)。
    *   Soarer 老數位液晶樣式 (`dashboard_widget = 2`)：載入 `res_10_255.png` (`1024x512`)。
    *   Altezza TRD 三環樣式 (`dashboard_widget = 4`)：載入 `res_10_257.png` (`1024x512`)。
*   **音樂播放器 (Radio)**：
    *   NFS2015 現代透明面板：載入 `res_10_311.png` (`792x190`) + 進度條 `res_10_305.png`。
    *   Altezza 圓盤小播放器：載入 `res_10_312.png` (`204x211`)。

---

## 🚀 後續開發接手要點 (Tauri + React + Python FastAPI)

主專案 `FH6-HorizonTuner` 採用了 **Tauri v2**，這使我們能夠極為優雅地重製上述功能，請依循以下方向開發：

1.  **實作滑鼠穿透 (React + Tauri)**：
    *   不需手寫 C++，在前端 React 組件的面板區域上設置事件：
        ```typescript
        import { getCurrentWindow } from '@tauri-apps/api/window';
        const appWindow = getCurrentWindow();
        
        // 滑鼠移入 UI 控制面板時，攔截滑鼠（允許拖曳/點擊設定）
        const onMouseEnter = () => appWindow.setIgnoreCursorEvents(false);
        
        // 滑鼠移出面板時，啟用穿透（讓玩家在玩遊戲時點擊能直接穿透 UI）
        const onMouseLeave = () => appWindow.setIgnoreCursorEvents(true);
        ```
2.  **熱鍵切換**：
    *   安裝並註冊 Tauri 官方全域熱鍵插件 `@tauri-apps/plugin-global-shortcut`。在 Rust 核心端攔截快捷鍵後，透過 Tauri Event 傳遞給 React 進行顯示/隱藏的開關反轉。
3.  **動態 HUD 動畫**：
    *   將 `extracted_resources/` 下的所有 PNG 貼圖放入主專案的前端 `frontend/public/assets/hud/` 資料夾下。
    *   前端 React 元件接收來自 FastAPI 後端推送的 WebSocket 實時遙測數據 (Speed / RPM / G-force)，並直接使用 CSS3 的 2D 變換（如 `transform: rotate(...)`）在 Web 網頁上實現超低 CPU 佔用、高效能的動態儀表指針旋轉。
