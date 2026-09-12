# VFD 媒體與音訊視覺化效能優化實作計畫

## 1. 文件目的

本計畫針對 Retro VFD HUD 在啟用系統媒體顯示、音訊等化器與 VU fallback 時的效能問題，提出可分階段實作、可量測、可回滾的改造方案。

研究基線：

- 分支：`research/vfd-media-audio-performance`
- 基底：`main`，commit `0db6a847`
- 主要路徑：`backend/audio_spectrum.py`、`backend/system_media.py`、`backend/main.py`、`hud_overlay/shared/ws.js`、`hud_overlay/index.html`、`hud_overlay/vfd/index.html`

本文件是實作計畫，不在本階段直接修改執行邏輯。

## 2. 目前問題與目標

### 2.1 已確認的問題

| 區域 | 現況 | 影響 |
| --- | --- | --- |
| VFD Canvas | `requestAnimationFrame` 每幀清空並重繪整個 1120×520 Canvas；面板網格、文字、glow、EQ 384 個 segment 都會重複繪製 | 主執行緒長時間佔用，VFD 成為 overlay 的主要渲染成本 |
| 音訊發布 | WASAPI worker 約 30Hz 更新快取，但 `broadcast_overlay_state()` 約每 16ms 複製快取並廣播 | 重複 JSON 序列化、WebSocket 傳輸、事件建立與 iframe `postMessage` |
| 音訊 fallback | 使用 `has_audio` 布林值判斷資料是否有效；`last_update` 沒有轉成 stale timeout | 音訊來源中斷時可能持續顯示舊值，且每幀仍執行 fallback 衰減工作 |
| 媒體查詢 | WinRT 失敗時可能每秒建立 PowerShell process；桌面視窗 fallback 目前被註解 | CPU／process 啟動成本不可控，fallback 行為也難以觀測 |
| DOM 更新 | VFD render loop 內重複 `getElementById`，motion 關閉分支每幀寫入 `transform` 與 `filter` | 產生不必要的 style 更新與 compositor 工作 |
| 模組邊界 | VFD runtime 主要邏輯集中於 inline script，React 端 utility 與 HUD runtime 有重複實作 | 難以單元測試 scheduler、stale state 與 fallback 契約 |

### 2.2 成功標準

優化後需同時滿足：

1. 音訊資料只在新 sample 或狀態改變時發布；目標上限為 30 個 `hud:audio` message／秒。
2. VFD 不再每幀執行完整 Canvas redraw；靜態面板與動態數值分離。
3. 音訊中斷後 250ms 內進入 `stale`，再衰減至明確的 silent state，不顯示無限期舊值。
4. 健康的 WinRT 媒體來源不啟動 PowerShell；PowerShell fallback 具備 backoff 與 single-flight 保護。
5. 啟用與停用音訊／媒體功能時，其他 HUD style 不應承擔 VFD 專屬的高頻渲染成本。
6. 在相同 telemetry 與音訊輸入下，VFD 視覺效果、單位、VU offset、Audio offset、media marquee 與 motion toggle 行為保持相容。

## 3. 建議目標架構

```text
WASAPI worker 30Hz
      │
      ▼
AudioSnapshot { sequence, capturedAt, spectrum, vu, state }
      │ 只在 sequence/state 改變時發布
      ▼
backend overlay publisher ── hud:audio ──► host ws.js
                                             │ sequence 去重
                                             ▼
                                      iframe postMessage
                                             │
                                             ▼
                                VFD audio state machine
                                             │ dirty flags
                    ┌────────────────────────┴────────────────────────┐
                    ▼                                                 ▼
             static canvas/layer                              dynamic canvas/layer
       grid、面板、固定標籤、暗 segment                 RPM、speed、EQ、VU、marquee、motion
```

系統媒體走同一個原則：來源查詢與 fallback 在 backend 做 cache、backoff、single-flight；HUD 只接收已標準化的狀態，不自行重試或重複解析。

## 4. 實作分層

### 4.1 建立 overlay audio/media contract

新增共享資料契約，至少包含：

```json
{
  "success": true,
  "sequence": 1234,
  "captured_at_ms": 1720000000000,
  "state": "live",
  "spectrum": [0.0],
  "vu_left": 0.0,
  "vu_right": 0.0,
  "has_audio": true,
  "source": "wasapi"
}
```

音訊 `state` 建議固定為：`live`、`silence`、`stale`、`unavailable`。媒體則使用：`playing`、`paused`、`none`、`stale`。

契約規則：

- `sequence` 只在實際取得新 sample 時遞增；讀取同一份 cache 不得產生新 sequence。
- `captured_at_ms` 使用 monotonic age 判斷 stale，不能只依賴 wall-clock。
- `spectrum` 固定 32 段；invalid payload 必須轉為明確的 `unavailable`，不可讓前端猜測。
- 保留既有欄位 `spectrum`、`vu_left`、`vu_right`、`has_audio`、`success`，分階段加入新欄位，避免舊 HUD 立即失效。

建議新增純邏輯模組：

- `hud_overlay/shared/vfd/audio-state.js`：payload 驗證、sample age、平滑與 peak hold。
- `hud_overlay/shared/vfd/render-scheduler.js`：dirty flag、RAF coalescing、最小更新間隔。
- `hud_overlay/shared/overlay-contract.js`：事件欄位與狀態常數。

React 的 `frontend/src/utils/vfdAudioMath.ts` 不直接被 HTML HUD import；應與上述純邏輯保持同一組案例測試，避免把 React bundle 引入 overlay。

### 4.2 Backend 音訊服務與發布器

修改 `backend/audio_spectrum.py`：

1. worker 寫入 cache 時更新 `sequence` 與 monotonic timestamp。
2. 將 FFT band index、Hanning window 等固定資料預先建立；避免每個 sample 重複建立可重用結構。
3. `get_audio_spectrum_data()` 回傳 snapshot，並根據 sample age 計算 `state`。
4. `start_audio_spectrum_service()` 必須具備明確生命週期與 single-start 保護；worker 失敗時不要在每次讀取中立即重啟。
5. 加入 stale timeout：例如 150ms 進入 `stale`，250ms 後回傳零值／`unavailable`，實際數值以 benchmark 校準。

修改 `backend/main.py` 的 `broadcast_overlay_state()`：

1. 將音訊發布頻率對齊 worker sample，預設 30Hz 上限，不再每 16ms 廣播同一份快取。
2. publisher 記錄上一個 `sequence` 與 `state`；sequence 未變且 state 未變時不送出訊息。
3. 可保留低頻 health heartbeat，但 heartbeat 不應帶完整 32-band payload。
4. 只有在有 overlay client 時才啟動音訊服務；沒有 client 時停止或暫停 capture，避免背景常駐 WASAPI。
5. 加入 metrics：sample rate、publish rate、dedupe count、stale count、broadcast duration。

### 4.3 WebSocket 與 host forwarding

修改 `hud_overlay/shared/ws.js` 與 `hud_overlay/index.html`：

1. host 端記住最後一個 audio `sequence`，重複 sequence 直接丟棄。
2. iframe forwarding 使用 latest-value coalescing：同一個 event loop 內只轉發最後一份 audio snapshot。
3. media 只在 `title`、`artist`、`status` 或 `state` 改變時轉發；不重複觸發 marquee 解析。
4. overlay WebSocket disconnect 時送出本地 `stale` 狀態，讓 VFD 不依賴「下一個封包」才能停止顯示舊資料。
5. 保留既有 `hud:audio`／`hud:media` event 名稱，避免同步改動所有 HUD style。

### 4.4 VFD renderer 分層與 scheduler

重構 `hud_overlay/vfd/index.html` 的 inline script；建議最後只保留初始化與 hook wiring。

#### 靜態層

使用第二個 Canvas layer 或初始化時建立的 cached bitmap，保存：

- panel background、grid、border
- 固定標籤與暗色 segment
- 不隨 telemetry、audio、media 改變的固定裝飾

只有在以下事件發生時重建靜態層：初始載入、尺寸／DPR 改變、palette 改變、固定 layout 改變。

#### 動態層

只繪製：

- RPM active cells、peak marker、speed、gear、power／torque／boost
- EQ active cells、peak hold、VU meter
- marquee window 與 media lamp
- motion transform／blur

所有 DOM reference 在初始化時 cache，禁止在 render loop 呼叫 `document.getElementById`。固定迴圈使用 `for`，移除 hot path 的 `reduce`、臨時 fallback object、重複字串拼接。

#### Scheduler

以 dirty flag 取代無條件 60FPS full redraw：

- `telemetryDirty`：收到新 telemetry 才更新儀表動態層。
- `audioDirty`：收到新 audio sequence 才更新 EQ／VU。
- `mediaDirty`：media state 或 marquee 內容改變才更新 media 區塊。
- `motionDirty`：motion 開啟時才以需要的頻率更新 transform。
- `animationActive`：marquee、peak decay 或 sweep 期間才保留 RAF。

建議更新策略：

- telemetry／motion：視覺需求最多 60Hz，但只畫動態層。
- audio／peak hold：最多 30Hz，與 WASAPI sample 對齊。
- marquee：30Hz 足夠；若無 scrolling text，不啟動動畫 loop。
- idle／stale：沒有 dirty flag 時停止 RAF；不使用永遠遞迴的 `requestAnimationFrame`。

motion 關閉時只在狀態真正改變時寫入 `transform = 'none'` 與 `filter = 'none'`。Canvas 尺寸需透過 ResizeObserver 處理，明確支援零尺寸與 DPR；DPR 必須設上限，避免高 DPI 直接放大繪製成本。

### 4.5 系統媒體查詢與 fallback

修改 `backend/system_media.py`：

1. WinRT `winsdk` 作為主要來源；同一時間只允許一個查詢進行。
2. 成功的 WinRT 結果使用較長 cache，例如 1 秒；同一首歌只發布一次。
3. PowerShell fallback 只在 WinRT 不可用或查詢失敗時進入，採用 exponential backoff，例如 1s、2s、5s、10s，上限 10s。
4. PowerShell process 必須在 `asyncio.to_thread` 中執行，並記錄 timeout、return code、fallback source。
5. 原本的桌面視窗掃描若要保留，只能作為最後 fallback，且至少 5 秒一次；不得在 overlay 16ms loop 中執行。
6. 沒有媒體時回傳 `status=none` 與 `has_media=false`；查詢暫時失敗時優先保留上一個有效曲目一小段時間，再轉成 `stale`，避免 marquee 每秒重置。
7. 移除或集中 frontend／VFD 端的重複「自身程式名稱過濾」與文字清理規則，讓 backend contract 保持原始資料、VFD formatter 只做一次呈現轉換。

## 5. 分階段工作拆分

### Phase 0：建立基準與 feature flag

- 加入 backend publish rate、audio sequence、media query duration metrics。
- 加入 `VFD_RENDER_MODE=legacy|optimized` 或等價的開發設定。
- 以相同 telemetry replay、相同音訊 mock、相同 media mock 建立 baseline。
- 驗收：不改變既有畫面與資料，能取得 30 秒 profiling 結果。

### Phase 1：先修正 backend 發布與 stale contract

- 實作 audio snapshot sequence、sample age、stale state。
- 將 overlay audio publisher 限制為新 sample／狀態變更才廣播。
- 加入 media single-flight 與 PowerShell backoff。
- 驗收：`hud:audio` 不超過 30Hz；沒有 overlay client 時不啟動音訊 capture；fallback 不會 process storm。

### Phase 2：修正 host forwarding

- 在 `ws.js` 去重 audio sequence。
- 在 host → iframe forwarding 做 coalescing。
- 斷線時送 stale transition。
- 驗收：同一 sequence 不會重複建立 CustomEvent／postMessage；重連後能恢復 live。

### Phase 3：VFD 靜態／動態 Canvas 與 scheduler

- 抽離 renderer、audio state、render scheduler。
- 建立 static layer 與 dynamic layer。
- 將 continuous RAF 改為 dirty-driven scheduler。
- 保留 legacy mode 作為像素與行為回歸對照。
- 驗收：閒置時停止 full redraw；播放音訊時最多 30Hz 動態音訊更新；RPM、marquee、motion 仍達到可接受延遲。

### Phase 4：fallback 行為與跨平台驗證

- 驗證 WASAPI 不可用、音訊中斷、WebSocket 斷線、WinRT 缺失、PowerShell timeout、無媒體等情境。
- 確認 VU fallback 由 `live → stale → silent`，不保留舊值。
- 確認 media fallback 不會頻繁重置 marquee。

### Phase 5：性能門檻與 rollout

- 執行 30 秒與 5 分鐘 profiling。
- 預設開啟 optimized mode；保留 legacy mode 作為診斷開關一個版本週期。
- 收集真機低階 GPU／高 DPI／無音訊裝置結果後，再移除 legacy path。

## 6. 測試與驗收矩陣

### 單元測試

- `tests/test_audio_spectrum.py`
  - sequence 只在新 sample 時遞增
  - stale timeout 與 silence transition
  - worker failure 不造成連續重啟
  - snapshot 欄位固定為 32 bands
- `tests/test_system_media.py`
  - WinRT 成功時不呼叫 PowerShell
  - PowerShell fallback backoff
  - single-flight 防止並行 process
  - no-media、paused、timeout 狀態
- `frontend/src/utils/vfdAudioMath.test.ts` 或 overlay 對應測試
  - scheduler dirty flag
  - sequence dedupe
  - media marquee 只在曲目變更時重置
  - peak hold 依 elapsed time 衰減

### 整合／E2E 測試

- mock `/ws/overlay` 發送 60Hz 重複 audio packet，確認 host 只轉發新 sequence。
- mock 30Hz audio + 60Hz telemetry，確認 VFD 動態層不觸發 60Hz full static redraw。
- 模擬音訊停止，確認 250ms 內進入 stale／silent。
- 模擬 WinRT 失敗與 PowerShell timeout，確認 event loop 不被阻塞且 process 啟動遵守 backoff。
- 視覺回歸：RPM、gear、speed、EQ、VU、media marquee、motion toggle、DPR resize。

### 性能門檻

| 指標 | 目前基線 | 目標 |
| --- | --- | --- |
| audio WS publish | 約 60Hz | ≤ 30Hz，重複 sequence 不發布 |
| VFD full static redraw | 每 RAF | 只在 config／resize／palette 變更 |
| audio dynamic redraw | 每 RAF | ≤ 30Hz |
| idle RAF | 持續執行 | 無動畫時停止 |
| audio stale detection | 無明確 timeout | ≤ 250ms |
| PowerShell fallback | cache miss 可能每秒一次 | backoff，上限每 10 秒一次 |
| main-thread long task | 需建立基線 | 30 秒測試不得新增 >50ms 長任務 |

## 7. 風險與回滾

### 主要風險

- 靜態／動態 layer 的合成順序可能改變 glow、alpha 或 zoom 視覺。
- 降低 audio 更新頻率可能讓 peak hold 或 VU 感覺延遲。
- stale timeout 在低速或音訊裝置暫停時可能過早清空畫面。
- media fallback backoff 可能延遲曲目切換通知。
- 高 DPI backing buffer 上限可能改變細字清晰度。

### 回滾策略

- Phase 1～3 均保留 legacy publisher／renderer feature flag。
- 契約新增欄位但保留既有欄位，舊 HUD 可繼續運作。
- 發現視覺回歸時，只切回 `legacy` renderer，不回退 backend stale safety 修正。
- 每個 phase 只合併一類改動，避免無法判斷效能改善來源。

## 8. 建議實作順序

優先順序是：

1. 先限制 backend 重複音訊發布與 media fallback process 啟動。
2. 再處理 WebSocket sequence 去重與 iframe forwarding。
3. 最後拆 VFD Canvas 靜態／動態層與 dirty-driven scheduler。
4. 以真機 profiling 決定是否將音訊更新固定在 30Hz，以及是否需要 DPR 上限或 motion blur 降級。

這樣可以先消除跨程序與跨 iframe 的無效工作，再處理 Canvas 本身的繪製成本；每一步都能以既有畫面和 feature flag 進行對照。
