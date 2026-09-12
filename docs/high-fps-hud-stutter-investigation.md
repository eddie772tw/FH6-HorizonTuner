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
- 當顯示器運行於 144Hz（每 6.94ms 一幀）時，HUD 若以純事件驅動渲染，每 2~3 幀才更新一次數值（$144 / 60 = 2.4$），形成嚴重的階梯狀更新（Judder / Beat frequency）。

### 2.2 Windows DWM 桌面合成與 MPO（多平面重疊）破壞（系統合成層）
- 全螢幕遊戲原本能利用硬體 MPO（Multi-Plane Overlay）或 DirectFlip 直通顯示輸出。
- Tauri 透明頂層視窗（`WS_EX_TRANSPARENT | WS_EX_LAYERED` 配合 `DwmExtendFrameIntoClientArea`）覆蓋於遊戲上方時，會迫使 DWM 退出直通模式，改走桌面 Alpha Blending 合成，引發 GPU 複製負擔與遊戲幀生成時間波動。

### 2.3 GPU 滿載與 Chromium GPU Process 資源飢餓（排程層）
- 遊戲未鎖幀時 GPU 利用率通常達到 99%~100%。
- DirectX 排程器優先保障前景遊戲，導致背景 WebView2 的 D3D11 交換鏈與 Present 調度逾時，產生實際掉幀。

---

## 3. 已完成之改善架構 (Implemented Architecture)

### 3.1 前端時間戳平滑插值引擎 (`FrameInterpolator`)
- 實作於 `frontend/src/utils/frameInterpolator.ts` 與 `hud_overlay/shared/frame-interpolator.js`。
- **連續數值平滑**：對 RPM、時速、功率、扭力、渦輪壓力、懸吊行程、G 值等採用高精度線性插值（Linear Interpolation），支援環狀最短角度插值（`lerpAngleDeg`）。
- **離散狀態保護**：檔位（`Gear`）、車輛序號（`CarOrdinal`）、煞車抱死（`Lockup`）等狀態嚴格即時響應，不作中間浮點插值，防止跳檔延遲或小數檔位。
- **過推與超時防護**：外推上限設為 $1.25\times$，超過 150ms 無新數據自動 fallback 至最新封包，防止網絡卡頓時物理量漂移。
- **渲染循環解耦**：在 `coordinator.js` 中採用 `requestAnimationFrame` 自適應原生顯示器更新率（120Hz/144Hz/240Hz），將 60Hz 離散輸入轉化為極致滑順的連續動態。

### 3.2 視窗屬性與排程最佳化
- 優化 `ws.js` 遙測封包微任務排程，避免主線程繁忙時封包累積引發瞬間突波。
- 於 `OverlayView` 新增 `High-Refresh Frame Smoothing (120Hz/144Hz/240Hz/VRR)` 切換開關，支援動態熱更新並持久化。

---

## 4. 自動化測量診斷工具與 A/B 測試指引

專案提供了自動化幀排程測量工具 `scripts/measure_frame_pacing.py`，用於量化收集與比對幀間隔統計。

### 4.1 執行測量指令
```powershell
# 收集 10 秒遙測數據並產出統計報告
uv run --no-project --python .venv\Scripts\python.exe scripts/measure_frame_pacing.py --duration 10 --target-fps 60 --label "Test_60Hz_Baseline" --output scratch/pacing_report.json
```

### 4.2 A/B 驗收標準
| 指標 | 60Hz 直通模式 (基準) | 啟用平滑插值 (改善後) | 預期效果 |
|---|---|---|---|
| **視覺更新頻率** | 固定 60 次/秒（高刷上有階梯跳躍） | 與螢幕刷新率同步（120/144/240 次/秒） | 指針與數值完全無頓挫 |
| **幀間隔標準差 (Jitter StdDev)** | 較高（依賴 UDP 網路抖動） | 極低（由 rAF 與插值器穩定平滑） | 降低 >60% 抖動 |
| **離散檔位響應時間** | 即時（0 延遲） | 即時（0 延遲） | 換檔完全無小數或遲滯 |
| **斷訊/超時恢復** | 立即停止 | 150ms 內安全 fallback 最新值 | 零過衝漂移 |
