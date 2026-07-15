# ForzaHUD 逆向工程反饋與架構建議企劃書

此文件彙整了針對 `ForzaHUD.exe` 進行靜態分析與虛擬碼還原的技術結果，並提出可回饋給主專案 (`FH6-HorizonTuner`) 的架構與實作建議。

## 1. UI 與 Overlay 渲染技術分析

### 技術實作細節
透過反編譯 `InitD3D()` 函式（位於 RVA `0x140013200`），我們釐清了 ForzaHUD 達成高效能、低延遲無邊框半透明 Overlay 的關鍵技術：
1. **DirectX 11 + DXGI SwapChainForComposition**：程式摒棄了傳統的 GDI 或 Layered Window，而是使用 DXGI 的 `CreateSwapChainForComposition` 來建立交換鏈 (Swap Chain)。
2. **DirectComposition (dcomp.dll)**：透過 `DCompositionCreateDevice` 將 DX11 的渲染結果直接綁定到 Windows 的合成層。這種作法稱為 **Flip-Model Composition**，能允許 Overlay 視窗在半透明狀態下依然保持硬體加速，大幅降低畫面撕裂與延遲 (Latency)。
3. **Waitable Object (低延遲同步)**：程式中使用了 DXGI 的 Frame Latency Waitable Object 來同步渲染迴圈，確保 UI 更新頻率能完美契合螢幕更新率，避免無謂的 GPU 消耗。

### 給主專案的建議
*   **導入 DirectComposition**：如果 `FH6-HorizonTuner` 需要開發自己的 UI Overlay，強烈建議採用與 ForzaHUD 相同的 `DirectComposition` 架構，而不是傳統的 `SetLayeredWindowAttributes`。這能解決遊戲在全螢幕無邊框模式下，Overlay 導致掉幀或閃爍的問題。

## 2. Drift Assist 飄移輔助演算法分析

### 技術實作細節
透過反編譯 `vigem_target_x360_update` 的呼叫端（位於 RVA `0x140040b50` 與 `0x1400414c0`），我們解析了 Drift Assist 是如何運作的：
1. **ViGEmClient 虛擬手把**：程式透過 `vigem_target_add` 與作業系統建立了一個虛擬的 Xbox 360 手把。
2. **訊號轉換邏輯**：
    *   在 `FUN_140040b50` 中，系統讀取傳入的遙測狀態結構 (Offset `0x4` 到 `0x14`)。
    *   利用一系列的浮點數乘法 (例如 `fVar2 * DAT_1400bfcf8`) 將遙測的浮點數值 (0.0 ~ 1.0 或特定角度/速度) 映射到 Xbox 搖桿的 `short` 範圍 (-32768 ~ 32767) 以及扳機的 `byte` 範圍 (0 ~ 255)。
    *   在轉換前，有執行數值夾擠防護 (Clamp)，例如 `if (fVar2 <= 0.0) fVar2 = 0.0;`，以防止異常遙測數據導致驅動程式崩潰。
3. **安全退出機制**：在 `FUN_1400414c0` 的執行緒終止流程中，程式實作了非常嚴謹的解構：先發送 `vigem_target_remove`，再發送 `vigem_disconnect` 與 `vigem_free`。若未正確釋放，可能會導致 Windows 出現幽靈手把。

### 給主專案的建議
*   **PID 控制器的引入**：雖然我們還原出了線性的數值映射邏輯，但對於進階的「自動反打方向盤」，單純的線性映射可能不夠平滑。建議主專案在實作時，可以在遙測數據 (如車身偏航角 Yaw) 與虛擬搖桿輸出之間加入一個 PID Controller 演算法，能讓漂移過彎更為平順。
*   **例外處理 (Exception Handling)**：主專案整合 ViGEm 時，務必參考 ForzaHUD 實作 Thread-safe 的 Mutex Lock (`_Mtx_lock`) 與嚴謹的 Disconnect 流程，避免遊戲關閉後虛擬手把仍卡在系統裝置管理員中的情況。

## 3. 架構總結
ForzaHUD 採用了非常現代且貼近底層的 Windows API (DirectComposition + ViGEmBus)。它的架構解耦得很好：**Telemetry 接收執行緒**、**UI 渲染迴圈**、以及**手把模擬控制迴圈** 是相互獨立的，並透過 Mutex 來同步狀態 (`param_1 + 0x4c`)。這種多執行緒無鎖/微鎖 (Micro-locking) 的設計模式，非常值得在下一代的 `HorizonTuner` 系統中借鑑。
