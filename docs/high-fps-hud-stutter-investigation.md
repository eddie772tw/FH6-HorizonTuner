# HUD Overlay 高更新率 (>60 FPS / Uncapped) 卡頓調查與改善方案

日期：2026-09-01  
關聯 Issue：#256, #272  
作者：Gemini as Antigravity  

---

## 1. 問題概述與現象

當玩家在未限制幀率（Uncapped）或高刷新率顯示器（120Hz / 144Hz / 240Hz / VRR）上運行《極限競速》（Forza Horizon）時，HUD Overlay 會出現肉眼可見的頓挫、跳躍（Stuttering）或渲染不流暢。

- **Issue #256**：使用者回報若無手動鎖定遊戲在 60 FPS，HUD Overlay 或遊戲任一方會產生明顯掉幀/卡頓。
- **Issue #272**：記錄了原生 HUD 在 Windows DWM / DirectComposition 與 WebView2 渲染管線中的幀排程與卡頓調查路徑。

---

## 2. 根因剖析與三層交織機制

經全面審查專案架構，卡頓並非單一原因引起，而是由以下三個層級疊加產生：

### 2.1 數據源採樣與顯示刷新率拍頻錯位（數學與渲染層）
- Forza UDP Data Out 輸出頻率固定為 **60Hz**（每 ~16.6ms 一包）。
- 當顯示器運行於 144Hz（每 6.94ms 一幀）時，HUD 目前以事件驅動或未插值的狀態直接渲染，導致每 2~3 幀才更新一次數值（$144 / 60 = 2.4$），形成嚴重的階梯狀更新（Judder / Beat frequency）。

### 2.2 Windows DWM 桌面合成與 MPO（多平面重疊）破壞（系統合成層）
- 全螢幕遊戲原本能利用硬體 MPO（Multi-Plane Overlay）或 DirectFlip 直通顯示輸出。
- Tauri 透明頂層視窗（`WS_EX_TRANSPARENT | WS_EX_LAYERED` 配合 `DwmExtendFrameIntoClientArea`）覆蓋於遊戲上方時，會迫使 DWM 退出直通模式，改走桌面 Alpha Blending 合成，引發 GPU 複製負擔與遊戲幀生成時間波動。

### 2.3 GPU 滿載與 Chromium GPU Process 資源飢餓（排程層）
- 遊戲未鎖幀時 GPU 利用率通常達到 99%~100%。
- DirectX 排程器優先保障前景遊戲，導致背景 WebView2 的 D3D11 交換鏈與 Present 調度逾時，產生實際掉幀。

---

## 3. 開發改善路線圖 (Roadmap)

1. **階段一：前端渲染高刷平滑插值引擎（Client-side Frame Pacing & Interpolation）**
   - 於 `hud_overlay/shared/` 引入基於 `requestAnimationFrame` 的時間戳物理插值器（Timestamp-based Linear / Hermite Interpolator）。
   - 將 60Hz 離散遙測訊號平滑插值推導至 120Hz/144Hz/240Hz，消弭視覺拍頻頓挫。

2. **階段二：視窗樣式與 WebView2 GPU 交換鏈最佳化**
   - 評估 WebView2 視窗標誌與 DWM 屬性，降低透明通道合成開銷。
   - 優化 WebSocket 封包解包與微任務隊列排程，防止事件擠壓（Batching spike）。

3. **階段三：高刷與 A/B 測試驗證**
   - 依據 Issue #272 定義之驗收準則，在 60 FPS vs >60 FPS / VRR 環境下記錄幀生成穩定度與視覺流暢度。
