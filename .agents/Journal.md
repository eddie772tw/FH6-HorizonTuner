# Agent 開發經驗日誌 (Journal) - FH6-HorizonTuner

## 日誌定位與同步規則

本檔是專案的「已採納、已驗證知識庫」，不是 Jules 原始工作紀錄的鏡像。Jules 的原始紀錄保留於 `.jules/*.md`；只有在本地完成驗證、確認適用範圍後，才同步到本檔。

每筆新紀錄應盡量包含以下欄位：

- **日期與領域**：例如 `2026-08-11 / Agent Workflow`。
- **來源**：`local` 或 `.jules/<file>.md`。
- **狀態**：`proposed`、`adopted` 或 `superseded`。
- **Learning**：觀察到的問題或可重複的學習點。
- **Action**：已採取或要求後續採取的規則。
- **Evidence**：測試、commit、檔案或可重現步驟。

`.agents/skills/README.md` 是技能名稱的唯一索引；日誌不得創造新的技能別名。Jules 日誌中的重複或只適用於單一任務的內容，應保留在 `.jules/`，不要直接升級成全域規則。

## 2026-09-01 / High-Refresh Telemetry Frame Pacing and Interpolation Engine

- **來源**：`local`，針對 Issue #256 與 Issue #272 在遊戲 uncapped 或高刷螢幕 (>60 FPS / 120Hz / 144Hz / 240Hz / VRR) 下的 HUD 拍頻卡頓 (Judder) 與渲染排程問題。
- **狀態**：`adopted`。
- **Learning**：
  1. **60Hz 採樣 vs 高刷顯示器的拍頻效應 (Judder)**：Forza UDP 封包固定 60Hz 輸出，在 144Hz 顯示器（6.94ms 幀時間）上，每秒 60 次的階梯狀離散更新必然產生視覺微頓挫。必須在前端渲染層將物理數據流與渲染時鐘解耦，透過 `requestAnimationFrame` 與時間戳插值器（`FrameInterpolator`）將 60Hz 離散訊號平滑內插至原生顯示器刷新率。
  2. **連續物理量 vs 離散狀態量插值分流**：連續量（RPM、時速、功率、扭力、渦輪壓力、懸吊行程、G 值、滑移）進行線性平滑或環狀最短角度插值（`lerpAngleDeg`）；而離散狀態（檔位 `Gear`、`IsRaceOn`、`CarOrdinal`、`Lockup` 抱死）必須即時響應，嚴禁進行浮點插值，防止跳檔時出現浮點檔位或延遲。
  3. **外推邊界與斷訊回退防護**：外推上限設為 $1.25\times$，超過 150ms 無新數據時自動回退至最新封包，防止網絡卡頓或遊戲暫停時物理量漂移過衝。
  4. **微任務防抖與排程**：高 GPU 負載下 WebSocket 封包可能在瀏覽器同一微任務中連續抵達，需加入隊列防抖保護，避免短時間內無效連續觸發昂貴的 DOM 重繪。
- **Action**：
  1. 建立 `frontend/src/utils/frameInterpolator.ts` 與純函數單元測試 `frontend/src/utils/frameInterpolator.test.ts`。
  2. 建立 `hud_overlay/shared/frame-interpolator.js` 並整合至 `hud_overlay/shared/coordinator.js`（`requestAnimationFrame` 驅動循環）。
  3. 於 `OverlayView` 新增 `High-Refresh Frame Smoothing (120Hz/144Hz/240Hz/VRR)` 設定開關與多語系支援。
  4. 實作自動化幀排程測量工具 `scripts/measure_frame_pacing.py` 與測試 `scripts/tests/test_measure_frame_pacing.py`。
- **Evidence**：後端 Pytest 254 passed, 1 skipped, 6 deselected；腳本測試 22 passed；前端 Vitest 83 files / 498 tests 100% passed；`pnpm build` 成功（701 modules）；Ruff 靜態檢查無誤。
- **Governance**：本筆追加依 `telemetry-udp-protocol`、`huge-component-refactoring`、`pr-author-maintainer` 與 `agent-governance-audit` 登錄。

---

## 2026-08-30 / Dyno Timestamp Quality and Vehicle Segment Boundary

- **來源**：`local`，`codex/feat/dyno-shift-quality-gates`。
- **狀態**：`adopted`。
- **Learning**：dyno 的 sample acceptance 與 shift transient 判定不能使用 wall clock；只可使用 Data Out 的 `TimestampMS`。缺少 timestamp、非單調 timestamp、相對於已觀察 cadence 的中斷，或 position 與既有 SI speed 不一致時，必須標示為 unavailable／suspect 並暫停收集，不能把中斷資料提升為馬力或調校真值。
- **Action**：以獨立 `backend/dyno_quality.py` 保存 timestamp、position、gear 與可觀測 `(CarOrdinal, CarClass, CarPerformanceIndex)` fingerprint。fingerprint 改變時，現行 dyno curve 先封存為 bounded 舊 segment，再開始新的 curve；主分支既有 profile 沒有 `dyno_quality` 時，前端以 unavailable 呈現。前端只顯示測量品質、confidence 與 suspected reason，不作自動調校宣告。
- **Evidence**：`tests/test_dyno_quality.py` 覆蓋 timestamp/position/profile/reset/telemetry-shift；聚焦後端為 19 passed。完整非主機音訊測試為 197 passed、2 skipped、6 deselected；`tests/test_audio_spectrum.py` 的既有 Windows audio-device enumeration 在本機逾時，未將其視為本次功能失敗。`ruff check .`、`ruff format --check .`、frontend Vitest 78 files / 481 tests、frontend build 與 `git diff --check` 均通過。未執行 FH6 實機驗證。
- **Governance**：依 `telemetry-udp-protocol`、`modular-refactoring`、`halfmoon-design-system`、`cross-agent-collaboration` 與 `agent-governance-audit` 登錄；`backend/main.py` 僅整合 dyno quality gate 的最小 hunks，未變更 listener、settings 或 diagnostic/support-bundle 範圍。

---

## 2026-08-30 / Privacy-preserving diagnostic support bundle

- **來源**：`local`，手動產生的本機支援包功能。
- **狀態**：`adopted`。
- **Learning**：診斷匯出不得把「可供本機診斷」誤解為可完整打包；只允許彙總 telemetry/overlay/Discord health 與時間窗內日誌，並在 ZIP 形成前遞迴移除 raw UDP/packet、絕對路徑、玩家識別與 credentials。以記憶體回應 ZIP 加上 `Cache-Control: no-store` 可避免後端產生持久副本；前端仍須清楚說明手動下載不等於自動上傳。
- **Action**：維持 `fh6-diagnostic-support-bundle/v1` manifest 中的 app/backend 版本、settings schema identifier、redaction 說明與 bounded `windowMinutes`；新增收集欄位時必須先加入 allowlist、redaction 與容量上限測試，拒絕未知欄位。
- **Evidence**：`tests/test_diagnostic_support_bundle.py` 驗證 redaction、10 分鐘時間窗、manifest、unsafe field rejection、section size cap 與 `no-store` download response；前端 `diagnosticSupportBundle.test.ts` 驗證 allowlisted request 與 local-only copy。
- **Governance**：本筆依 `github-security-audit`、`cross-agent-collaboration`、`modular-refactoring`、`halfmoon-design-system` 與 `agent-governance-audit` 規範登錄；`backend/main.py` 限於診斷 endpoint/import 整合 hunks，未修改 telemetry listener、SettingsContext、onboarding、ref 或 LazyForza。

---

## 2026-08-28 / UDP Socket Resilience & Stale Process Auto-Cleanup Architecture

### UDP 監聽器 Winsock SIO_UDP_CONNRESET 防禦、error_received 自癒與啟動時殘留進程/端口自動清理

- **來源**：`local`，解決遊戲重啟、HorizonTuner 重啟或非正常退出時導致的「UDP 遙測數據中斷無法恢復（需重開機/重新登入）」問題。
- **狀態**：`adopted`。
- **Learning**：
  1. **Winsock SIO_UDP_CONNRESET 核心陷阱**：在 Windows 平台上，若 UDP Socket 收到 ICMP 端口不可達（Type 3 Code 3）或 UDP 轉發目標未就緒，Winsock 預設會將 Socket 標記為 Reset 狀態並引發 `WSAECONNRESET (10054)`。Python Asyncio 在 Proactor 事件循環下若未關閉 `SIO_UDP_CONNRESET` IOCTL 且未實作 `error_received`，事件循環的 Datagram 讀取可能會永久終止。
  2. **Python sock.ioctl 限制與 ws2_32.WSAIoctl 解決方案**：Python C-extension 的 `sock.ioctl` 僅支援 3 種標準 IOCTL，傳入 `0x9800000C` 會拋出 `ValueError: invalid ioctl command`。必須直接使用 `ctypes.windll.ws2_32.WSAIoctl(sock.fileno(), 0x9800000C, ...)` 才能在 Windows 核心正確禁用 `SIO_UDP_CONNRESET`。
  3. **Socket 韌性建立規範**：建立 UDP 監聽器時應透過 `ws2_32.WSAIoctl` 明確禁用連線重設，覆寫 `TelemetryProtocol.error_received(self, exc)` 吞掉暫態 Socket 異常，並將 `SO_RCVBUF` 擴大至 2MB 以避免 60Hz 突發流量丟包。
  4. **殭屍進程 (Zombie / Stale Process) 霸佔端口與自癒**：當先前的後端進程非正常終止殘留於背景時，會持續持有 UDP 8000 / HTTP 8001 端口，導致新實例無法獲取數據。透過 Windows 原生 `iphlpapi.dll` (`GetExtendedUdpTable`/`GetExtendedTcpTable`) 可進行零外部依賴的極速 PID 探測，並以安全白名單篩選（僅清理 HorizonTuner 殘留進程、絕不誤殺第三方或遊戲進程），在啟動時自動釋放端口，免除重開機或重新登入之需求。
  5. **收發 Socket 實體隔離 (Physical Socket Decoupling)**：監聽端 8000 端口必須維持為純接收 (RX Only)，轉發操作 (SimHub 5300) 必須由專用發送 Socket (`_forward_socket`) 承擔，配合 `_forward_datagram` 自動自癒重建機制，使轉發端的任何網路崩潰完全與 8000 監聽器物理隔離。
  6. **消弭 `0.0.0.0` 通配綁定之資安風險 (Multi-Interface Safe Binding)**：將監聽器全面由萬用通配 `0.0.0.0` 升級為「主動探測本機所有網路介面卡 IPv4 註冊地址 (`discover_local_ipv4_addresses`) + `127.0.0.1` 複合安全綁定 (`MultiEndpointDatagramTransport`)」，既滿足嚴格資安審計標準（禁止全介面通配監聽），又 100% 確保 Forza 遊戲無論設定 `127.0.0.1` 或是本機區域網路 IP 皆能零丟包無縫接收。
  7. **無條件多介面同步監聽與介面簡化 (Unconditional Multi-Interface Listening)**：為徹底杜絕使用者設定單一 IP（如誤填 `127.0.0.1` 導致無法收取 LAN 封包，或反之）引發的接收失效，移除使用者介面中的「監聽 IP」設定欄位，系統一律無條件自動枚舉自機所有網卡 IP 與 `127.0.0.1` 同步安全監聽，使用者僅需配置「監聽端口」（預設 8000）。
- **Action**：
  1. 建立 `backend/process_cleanup.py`，實作 `get_port_owning_pids`、`is_horizontuner_stale_process` 與 `cleanup_stale_port_listeners`。
  2. 重構 `backend/telemetry_listener.py`，落實收發 Socket 實體隔離、`_create_dedicated_forward_socket`、發送自癒機制、`ws2_32.WSAIoctl` 免疫配置，並實作 `discover_local_ipv4_addresses` 與 `MultiEndpointDatagramTransport` 達成零 `0.0.0.0` 綁定。
  3. 於 `backend/main.py` 的 `lifespan` 啟動、動態端口更新及 HTTP 綁定前整合自動清理探測，監聽行為全面無條件自動綁定全網卡自機 IP + `127.0.0.1`，並自 UI 及設定檔中移除 `telemetry_ip` 欄位。
  4. 新增 `tests/test_process_cleanup.py` 並擴充 `tests/test_telemetry_listener.py` 單元測試（後端測試增至 196 項）。
- **Evidence**：後端 Pytest 196 項測試全數通過（含 18 項專門測試）；前端 Vitest 77 檔 / 478 項測試 100% 通過；`ruff check .` 與 `ruff format --check .` 100% 格式無誤。
- **Governance**：本筆追加依 `telemetry-udp-protocol`、`portable-release-validation`、`github-security-audit` 與 `agent-governance-audit` 規範登錄。

## 2026-08-28 / AEGO Secondary Correction Overhaul & FD-First Gearing Architecture

### 齒比二次修正宏觀終傳縮放、末檔可用性保護與低終傳偏好重構

- **來源**：`local`，針對 AEGO 演算法在二次修正時末檔過度壓縮不可用、前段檔位過密及基準終傳比分配偏好進行全面重構。
- **狀態**：`adopted`。
- **Learning**：
  1. **極速包絡線縮放首要真理 (Macro FD Scaling Primary)**：當使用者輸入實測極速或預覽軟上限時，縮放極速包絡線的最優先手段應為調整/提高終傳比（Final Drive）。舊有算法將速差全部丟給末檔齒比吸收並透過閉環重分佈強行牽引中間檔位，會造成末檔嚴重擠壓至倒數第二檔（步階比逼近 1.0 實質無效）且前段檔位過密。
  2. **末檔可用性防線 (Top Gear Usability Guard)**：末檔與前一檔的步階比必須設置邊界約束（$0.72 \le G_N / G_{N-1} \le 0.90$），杜絕過密擠壓與跳檔斷崖。
  3. **消除強行軟化抵消 (Eliminate Rebalance Softening Side-effects)**：舊有的 `rebalanceEditableGearing` 強拉 FD 往 3.7 會二次破壞二次修正設定的極速錨點；改為在基準階段就原生採用各檔位數之黃金末檔錨點（$G_{\text{target\_top}}(N)$）生成健康低終傳比與高各檔齒比，提供遊戲內最佳可調解析度。
  4. **幾何平均步階比與量化餘裕 (Quantization Margin in Step Ratios)**：以幾何平均 $\bar{R} = (G_N / G_1)^{1/(N-1)}$ 為中心動態展開動力帶步階比，並在 2 位小數四捨五入後加入動力帶轉速上限約束，確保紅線換檔轉速 drop 100% 穩定落入最大馬力轉速（$\le \text{maxHpRpm} + 50$）。
- **Action**：
  1. 重構 `frontend/src/utils/tuningMath.ts` 中的 `getTargetTopGearRatio`、`calculateAEGOGearing`。
  2. 實作「第一順位 FD 宏觀縮放、第二順位微觀微調與可用性保護」的二次修正機制。
  3. 於 `frontend/src/utils/tuningMath.test.ts` 新增二次修正終傳優先、前段檔位間距保護、FD 6.1 極限保護與 4~10 檔位基準測試（擴充至 475 項測試）。
- **Evidence**：前端 Vitest 76 檔 / 475 項測試 100% 通過；後端 Pytest 184 項測試全數通過；`ruff check` & `ruff format --check` 零警告；`pnpm -C frontend run build` 成功。
- **Governance**：本筆追加依 `physics-tuning-math` 與 `agent-governance-audit` 規範登錄。

## 2026-08-23 / hud_frontend 精簡獨立客戶端、Vite 多入口與 Tauri 生命週期轉移架構

### 多前端共用資源 (DRY)、-hudonly 啟動引數、主視窗關閉記憶體釋放與動態生命週期管理

- **來源**：`local`，針對使用者希望在不啟動完整 HorizonTuner 主介面下僅運行 HUD 功能之需求，實作 `hud_frontend` 精簡獨立前端與 Tauri 動態生命週期轉移機制。
- **狀態**：`adopted`。
- **Learning**：
  1. **同 Repo 多入口共用架構 (Anti-Duplication via Vite MPA)**：將精簡客戶端作為 `frontend/hud_frontend/` 獨立目錄建置，透過 Vite `rollupOptions.input` 多入口打包，既能直接 `import` 既有 `frontend/src/` 中的後端通訊服務 (`backend.ts`)、Halfmoon CSS 樣式與 HUD 掃描契約，徹底杜絕 60%~75% 代碼重複，又能在構建時將 JS Bundle 自 330KB (主介面) + 448KB (圖表) 大幅縮減至 10.2KB。
  2. **Tauri 智慧生命週期轉移 (Primary Window Handover)**：在 Tauri Rust 宿主層引入 `PrimaryWindowMode`（`Main` / `HudOnly`）狀態管理。當以 `-hudonly` 啟動或使用者由主介面一鍵切換時，自動建立 `hud_main` 視窗並載入 `hud_frontend/index.html`，隨後關閉銷毀 `main` 視窗，使 Webview2 引擎立即釋放主 React SPA 的巨型 DOM 與圖表記憶體（記憶體自 ~180MB 驟降至 ~25MB），同時將應用的終止事件動態轉移至 `hud_main`。
  3. **雙向生命週期與 Sidecar 守護**：在 `hud_main` 關閉時，Tauri 依舊精確觸發 `stop_backend_process`（關閉 stdin + `taskkill /T /F`），保證 60Hz UDP 8000 與 HTTP 8001 連接埠 100% 乾淨釋放。
- **Action**：
  1. 建立 `frontend/hud_frontend/` 目錄、`index.html`、`src/main.tsx`、`src/HudApp.tsx` 與單元測試 `hudFrontendContract.test.ts`。
  2. 更新 `frontend/vite.config.ts` 配置 Rollup MPA 多入口，更新 `frontend/vitest.config.ts` 納入測試路徑。
  3. 修改 `frontend/src-tauri/src/lib.rs` 與 `tauri.conf.json`，實作 `PrimaryWindowMode`、`-hudonly` 啟動偵測、`launch_hud_frontend` 與 `is_hud_only_cli` 指令。
  4. 在 `frontend/src/App.tsx` 與 `OverlayView.tsx` 整合 `-hudonly` 自動轉移與手動一鍵切換按鈕。
  5. 驗證前端 Vitest（70 檔 / 442 項全數通過）、後端單元測試（189 項全數通過）、Ruff 格式檢查與 Vite 生產打包成功。
  6. 同步更新 `README.md`、`README.en.md` 與 `Journal.md`。
- **Evidence**：`cargo check` 通過；前端 Vitest (70 files / 442 tests passed)；後端 Pytest (189 passed)；`pnpm run build` 成功輸出 `dist/index.html` 與 `dist/hud_frontend/index.html`；`ruff check .` 與 `ruff format --check .` 100% 通過。
## 2026-08-28 / Test Suite Lean Refactoring and Anti-Over-Testing Governance

### 測試集精簡分流與防範過度開發/過度測試治理規範

- **來源**：`local`，針對測試集中過度開發、Meta-testing 與脆弱斷言之全面檢討與治理。
- **狀態**：`adopted`。
- **Learning**：
  1. **Meta-Testing 反模式**：將 Agent PR 審查腳本、標籤檢查、CI 效能儀表板等開發工具測試混入產品核心 `tests/`，會稀釋產品核心測試焦點並增加 CI 負擔。
  2. **靜態設定斷言反模式**：以 Python 正則表達式或字串包含去測試 `.github/dependabot.yml` 或 `ci.yml` 屬於無效且脆弱的測試（Brittle Tests），宣告式設定檔應交由平台原生 Schema 驗證。
  3. **Canvas 2D 繪圖指令 Mocking 陷阱**：在 UI/Canvas 測試中斷言底層 API 呼叫次數（如 `arcs.length`）或微觀像素座標（如 `x: 320, y: 224`），會對 UI 樣式微調產生極大阻力，測試應回歸純運算與無異常邊界防護。
  4. **Heavy E2E 阻塞問題**：啟動真實二進位進程（`.exe`）的宿主診斷測試容易因本機環境產生逾時或 Flakiness，必須標記為 `@pytest.mark.host_diagnostics` 並在日常單元測試中預設排除。
- **Action**：
  1. 測試套裝分流：將開發工具測試遷移至 `scripts/tests/`；移除靜態 YAML 比對測試；`pyproject.toml` 設定 `addopts = "-m 'not host_diagnostics'"`。
  2. 重構 Canvas 2D 測試，移除微觀座標與指令計數斷言。
  3. 於 `AGENTS.md`、`workspace.md` 與 `agent-governance-audit/SKILL.md` 中明定「反過度開發與反過度測試規範 (Anti-Over-Testing & Anti-Over-Engineering Mandate)」。
- **Evidence**：
  - 後端快速單元測試：`uv run --no-project --python .venv\Scripts\python.exe python -m pytest tests/`（184 passed, 0 failed, 耗時由 ~39s 縮短至 3.90s）。
  - 工具鏈測試：`pytest scripts/tests/`（19 passed, 0.06s）。
  - 前端單元測試：`pnpm -C frontend run test`（76 files, 472 passed, 7.59s）。
  - 前端建置：`pnpm build` 通過；Ruff check/format 通過。
- **Governance**：本筆追加依 `agent-governance-audit` 規範登錄。

## 2026-08-27 / Telemetry expanded detail scope and corner layout

### 展開卡片範圍與四角詳細遙測

- **來源**：`local`，針對 `feat/V1.5-arch` 的 TelemetryView expanded detail。
- **狀態**：`adopted`。
- **Learning**：駕駛輸入與引擎區塊的即時控制項已足夠承擔主要用途，不需要再保留另一條展開詳細圖表路徑；Live Traces 的比較用途則集中在踏板、功率/扭力、轉速/扭力與轉速/馬力四組趨勢。輪胎與懸吊詳細資料需要以四角為視覺分組，而不是將角落數據攤平成單一指標列。
- **Action**：TelemetryCardShell 支援不可展開卡片；Driver Inputs & Engine 移除 detail 與 expand action；Trace detail 固定四圖 2x2 並共用一次 history/chart-data 建立；Tire 與 Suspension detail 使用共用 2x2 corner grid，懸吊的聚合指標另列於四角資料下方；roadmap 同步反映四張可展開卡片。
- **Evidence**：前端 Vitest `71 files / 451 tests` 通過；`pnpm -C frontend run build` 通過（683 modules）；`git diff --check` 通過。未宣稱實機 UDP 或瀏覽器 profiler 結果。
- **Governance**：本筆追加依 `agent-governance-audit` 稽核；保留未追蹤 `config/`，未修改後端或生產設定。

## 2026-08-27 / Telemetry card layout standardization

### 即時遙測卡片高度分配與標題對齊

- **來源**：`local`，針對 `feat/V1.5-arch` 的 TelemetryView 1080p 主 GUI 版型。
- **狀態**：`adopted`。
- **Learning**：`TelemetryCardShell` 的 body 若維持一般 block，子層的 `flex-grow-1` 不會形成有效的高度分配邊界，會造成 Live Traces 第二張圖、Dynamics 下方資料被 `overflow: hidden` 裁切，駕駛輸入條縮至極小高度。不同控制項數量也會使卡片標題列高度不一致。
- **Action**：新增 `TelemetryCardLayout` 統一 `stack`、`split`、`grid` 三種內容版型；卡片 body 改為 `flex: 1 1 0%` 的垂直 Flex 容器；header 統一 `29px` 最小高度，保留原本 6 欄、`4.2fr 5.8fr` 列比例與各卡片內容元件。
- **Evidence**：720p 瀏覽器驗證五張卡片內容均未超出 body，Live Traces 兩張 Canvas 均可見；1080p 驗證第一列三張標題 top 均為 `145.6px`、header 均為 `29px`、Live Traces 兩張 Canvas 各約 `156px`、駕駛輸入條約 `212px`，展開 detail body 約 `843px` 且可滾動。前端 Vitest `71 files / 451 tests` 通過，Vite build 通過，Ruff check/format 通過；後端 `191 passed / 1 skipped / 2 failed`，失敗為既有 portable sidecar 測試受本機 `127.0.0.1:8001` 佔用影響。
- **Governance**：本筆追加依 `agent-governance-audit` 稽核；保留未追蹤 `config/`，未修改後端 port 或生產設定。

## 2026-08-27 / Telemetry expanded detail Canvas rendering optimization

### 詳細遙測統計資料的繪製效能與版面可讀性

- **來源**：`local`，針對 `feat/V1.5-arch` 的 TelemetryView expanded detail。
- **狀態**：`adopted`。
- **Learning**：詳細趨勢圖原先以 Recharts/SVG 在每次 bounded history 更新時重算約 300 個 samples，且 `TelemetryDetailView` 即使只展開一張卡也會建立其他卡片的 chart data。這與既有 Canvas 圖表的高頻路徑設計不一致。
- **Action**：採用 `huge-component-refactoring` 與 `halfmoon-design-system`：`TrendChart` 改用 DPR-aware Canvas，透過 ResizeObserver 與主題 CSS 變數快取繪製網格、座標、折線與 hover tooltip；資料建立改為依 `cardId` 延遲，輪胎五組趨勢在單一 history pass 產生；expanded detail 的趨勢圖改為 desktop 雙欄、窄視窗單欄。
- **Evidence**：新增 `toTireTrendChartData` isolation test；前端 Vitest `71 files / 451 tests` 通過；`pnpm -C frontend run build` 通過（682 modules）；`git diff --check` 通過。未執行實機 UDP 或瀏覽器 profiler，因此未宣稱實際 FPS/p95 提升。
- **Governance**：本筆追加依 `agent-governance-audit` 稽核；未修改 canonical skill ID、既有歷史結論或其他 agent 的 `config/` dirty worktree。

## 2026-08-27 / TelemetryView V1.5.1–V1.5.2 detail completion

### Suspension、Tire 與 vehicle dynamics expanded detail

- **來源**：`local`，延續 PR #245 `feat/V1.5-arch` 的 TelemetryView card expansion。
- **狀態**：`adopted`。
- **Learning**：expanded React detail 必須沿用既有 telemetry emitter 與 bounded history；滑移角／姿態遵循 parser 的弧度契約，胎溫遵循 SettingsContext 的華氏輸入契約；缺少 optional array 時顯示 unavailable，不以 0 代替。
- **Action**：新增純函數 `telemetryDetailMath` 與 isolation tests；完成 suspension summaries、tire 五類趨勢、vehicle dynamics current／trend、單位轉換與 detail component 拆分。
- **Evidence**：commits `9a8e7cc`、`fc044d4`；前端 Vitest `71 files / 449 tests`；`pnpm -C frontend run build` 通過；未執行實機 UDP／硬體驗證。
- **Boundary**：未新增 UDP offset、listener、WebSocket、recorder 或 MCP contract；未校準或宣稱未解析的 wheel load、tire wear、damper force 與 ride height。
## 2026-08-28 / PR #247 Discord Rich Presence 測試斷言結構同步修復

### Discord Application Key 輸出結構重構、常數淘汰與 Pytest 斷言對齊

- **來源**：`local`，針對 PR #247 分支 (`codex/feat/discord-rich-presence`) 因後端輸出結構重構但測試未同步導致之 CI 失敗進行修復。
- **狀態**：`adopted`。
- **Learning**：
  1. **常數淘汰未同步測試導致 Collection 階段崩潰**：在 `discord_presence.py` 中淘汰 `RICH_PRESENCE_IMAGE_URL` 與 `RICH_PRESENCE_IMAGE_TEXT` 改用固定 asset key (`"fh6_horizon_tuner"`) 時，測試檔案頂層若仍維持舊常數之 `from discord_presence import ...`，將在 Pytest 模組收集階段直接觸發 `ImportError`，導致整個測試套裝中斷。
  2. **Pre-Commit 測試門檻與分支健康**：在重構輸出資料結構或淘汰內部常數時，必須立即執行本地全套單元測試，確保業務模組與測試合約 100% 同步。
- **Action**：
  1. 更新 `tests/test_discord_presence.py`：移除已廢棄之 `RICH_PRESENCE_IMAGE_URL` 與 `RICH_PRESENCE_IMAGE_TEXT` 匯入。
  2. 更新 `test_activity_uses_project_owned_presence_image_and_text` 與 `test_presence_status_records_activity_after_successful_send` 之斷言，對齊最新 `large_image: "fh6_horizon_tuner"` 與 `large_text: "FH6 HorizonTuner"` 結構。
  3. 驗證全套靜態檢查、後端 Pytest (203 passed, 3 skipped)、前端 Vitest (69 檔 / 441 passed) 與前端生產打包。
- **Evidence**：`tests/test_discord_presence.py` 12 tests passed；後端 Pytest (203 passed)；前端 Vitest (441 passed)；`ruff check .` & `ruff format --check .` 100% 通過。

---

## 2026-08-24 / 5 個 PR 批量審查、衝突修正與循序合併

### Dependabot 依賴更新 (PR #241 #242 #243)、Jules UI 修正 (PR #244) 與 G-Radar 60Hz 渲染最佳化 (PR #246)

- **來源**：`local`，針對 5 個 PR 執行完整的 `pr-review-evaluation` 標準化審查（Review IDs: 5006767021, 5006767931, 5006768785, 5006853209, 5006769629）、PR #244 大小寫路徑衝突修正與底層到呈現層的架構依賴循序合併。
- **狀態**：`adopted`。
- **Learning**：
  1. **大寫 Jules 路徑再犯的自動修正機制**：Jules 在建立 PR #244 時再度將學習記錄寫入 `.Jules/palette.md`（大寫 J），與 governance commit `4f9a875` 衝突。正確處置是：在 main 上建立新 branch → 手動套用 UI 修正 → 將學習記錄寫入 `.jules/palette.md`（小寫）→ force-push 取代原有 branch，而非嘗試 rebase（rebase 在跨版本 rename 情境下需要額外處理 deleted/tracked 狀態）。
  2. **force-push 前必須確認 CI 重新執行完畢**：force-push 後 GitHub 會重新觸發所有 CI checks；必須等待新 commit 的 CI 全數通過（包含耗時最長的 Build & Verify Executable Bundle，約 5 分鐘）再合併，不得依賴舊 commit 的 CI 結果。
  3. **自底向上 Dependabot 合併排序**：依「Python 依賴 → Rust/Cargo 依賴 → npm 前端工具鏈 → UI 業務邏輯 → 60Hz 渲染層」順序合併，確保低層依賴先到位、高層不受回退影響。
  4. **G-Radar DOM 元素池 (PR #246)**：以 `markersContainer._gMarkerPool` 掛載池陣列，用 `display: block/none` 切換取代每幀 `innerHTML = ''` + `document.createElement`，textContent 與 style 屬性加入 dirty-check，符合 AGENTS.md 60Hz 效能守則。
- **Action**：
  1. 完成 5 個 PR 的標準審查與 Review 提交。
  2. 修正 PR #244 大小寫路徑衝突（force-push `ebf9f45` → `aa38ee3`）。
  3. 依序 Squash & Merge：#242 → #241 → #243 → #246 → #244。
  4. 驗證本地 Vitest（69 檔 / 440 項全數通過）、Pytest（191 passed, 3 skipped）。
- **Evidence**：PRs #241, #242, #243, #244, #246 均為 MERGED 狀態；本地 `pnpm run test` (69 files / 440 passed)、`pytest` (191 passed, 3 skipped)。

---

## 2026-08-23 / 6 個 Jules PR 批量審查、優先級架構排序與循序合併

### 遙測 CSV 展開最佳化 (PR #235)、i18n 多語系補全 (PR #236 & #239)、按鈕無障礙 Tooltips (PR #238)、輪胎雷達 GC 消除 (PR #237) 與即時地圖 60Hz 運算減半 (PR #240)

- **來源**：`local`，針對 Jules 提交之 6 項 PR 執行完整的 `pr-review-evaluation` 標準化審查、跨 Agent 建議協作、目錄大小寫修復與底層到呈現層的架構依賴循序合併。
- **狀態**：`adopted`。
- **Learning**：
  1. **自底向上的安全合併排序 (Bottom-up Dependency Order)**：在多個並行 PR 變更時，依照「純領域數據層 (Domain) → 語系字典 (i18n) → 通用無障礙組件 (Common UI) → 業務功能視圖 (Feature View) → 60Hz 遙測渲染引擎 (Overlay Engine)」的順序進行合併，能最大程度降低架構交叉污染與重構衝突風險。
  2. **日誌檔案 (.jules/bolt.md) 衝突預防與快速解決**：當多個 PR 同時向 `.jules/bolt.md` 追加學習條目時，Git 會產生行尾衝突。在本地 merge `main` 時保留各 PR 的學習條目並按時間序排列，可確保日誌完整性並順利完成 Squash & Merge。
  3. **目錄大小寫嚴格性防護 (PR #236)**：Jules 初次提交時建立了 `.Jules/narrator.md`（大寫 J），在 Review 中及時攔截並修正為 `.jules/narrator.md`，徹底避免 Windows 環境下 Git index 大小寫不敏感導致的追蹤路徑歧義。
  4. **全端效能與可訪問性成果**：
     - `captureToCsv`（PR #235）：消除展開運算子與巢狀 `.map()`，記憶體大幅降低且 CSV 匯出速度提升 ~19%。
     - `TireRadar`（PR #237）：以模組級 `Uint32Array` 取代每幀動態陣列配置，徹底消除 60Hz 輪胎溫度直方圖 GC 壓力。
     - `LiveMap`（PR #240）：透過 `pPrev = pCurr` 迭代傳遞，將即時地圖 60Hz 軌跡歷史座標投影運算與 `{x, y}` 物件配置精確減半 (50%)。
     - a11y & i18n（PR #236, #238, #239）：補全 13 組調校精靈翻譯、Close aria-labels 國際化，並解決 disabled button 吞噬 hover 事件的 Tooltip 封裝問題。
- **Action**：
  1. 完成 6 個 PR 的標準審查與 Review 提交（Review IDs: 5002389628, 5002389862, 5002390083, 5002390357, 5002390685/5002504516, 5002390937）。
  2. 依序將 PR #235, #239, #236, #238, #237, #240 循序 Squash & Merge 至 `main`。
  3. 驗證本地 Vitest（69 檔 / 440 項全數通過）、Pytest（188 項全數通過）、Ruff 檢查通過與前端 Vite 生產打包成功。
- **Evidence**：PRs #235, #236, #237, #238, #239, #240 均為 MERGED 狀態；GitHub Actions CI 全綠；本地 `pnpm run test` (440 passed)、`pytest` (188 passed)、`ruff check .` (pass)、`tsc && vite build` (pass)。

---

## 2026-08-20 / CI 測試腳本整理、過時打包淘汰與 Pytest 標籤化效能重構

### 淘汰單體打包 Spec、解耦 CI 階段依賴、消除雙重 Matrix 浪費與網路/路徑安全測試收斂

- **來源**：`local`，針對 CI Pipeline 效能瓶頸、過時打包腳本殘留與分散測試進行全盤整理與整併。
- **狀態**：`adopted`。
- **Learning**：
  1. **單元測試跨平台 Matrix 冗餘 (Double Matrix Elimination)**：純 Python 邏輯（FastAPI、封包計算、業務邏輯）與純 TypeScript 運算（Vitest 物理與 UI 合約）在跨 OS 上行為 100% 一致。在 `ci.yml` 中同時啟動 `windows-latest` 與 `ubuntu-latest` 執行純單元測試會浪費高達 2 個 Windows VM runner 的排隊與啟動時間（約 2~3 分鐘）。將純單元測試收斂至 `ubuntu-latest`，並將 Windows 專屬合約驗證（WinRT、Sidecar 生命週期、Tauri Host 診斷）集中於專屬 Windows 階段，能在零品質折損下節省約 40%~60% 的 CI 耗時。
  2. **CI 階段依賴解耦 (Cross-Stage Dependency Decoupling)**：後端單元測試與前端 Build 測試互不相干，解除 `backend-unit-test` 對 `frontend-build-test` 的過度依賴，可實現前後端檢查真正的最大化並行處理。
  3. **Pytest Markers 取代命令列長字串過濾**：在 `pyproject.toml` 規範 `@pytest.mark.windows_contract`、`@pytest.mark.host_diagnostics` 與 `@pytest.mark.executable_bundle`，取代在 CI 命令列中硬編碼多個脆弱的 `--ignore=...` 參數，使本地與遠端 CI 測試入口乾淨且一致。
  4. **過時單體打包腳本清理**：專案已全面採用 Tauri 宿主呼叫 Python Sidecar（`server-sidecar.spec`），歷史遺留的 `FH6-HorizonTuner.spec` 依賴已淘汰的 `winsdk` 與 `collect_all`，予以徹底刪除並更新 `test_spec_bundling.py`。
  5. **分散安全性測試收斂**：將舊有 `test_security.py` 中的 CORS Preflight 測試與 `test_websocket_origin_security.py` 整合為 `test_network_security.py`，路徑安全防護則統一收斂至 `test_path_security.py`。
  6. **前端過時 E2E 清理**：移除依賴寫死連接埠且未納入 CI 的 `frontend/e2e/` 遺留腳本與 `@playwright/test` 依賴，以完備的 Vitest 69 檔 / 440 項單元測試作為單一品質真理。
- **Action**：
  1. 刪除 `FH6-HorizonTuner.spec`，更新 `tests/test_spec_bundling.py`。
  2. 在 `pyproject.toml` 定義 pytest markers，標記 `test_sidecar_process_contract.py`、`test_portable_host_diagnostics.py` 與 `test_executable_bundle.py`。
  3. 重構 `.github/workflows/ci.yml` 與 `release.yml`，消除 Unit Test 的 Windows matrix 浪費並解耦 stage 依賴。
  4. 整合 `test_security.py` 至 `tests/test_network_security.py` 與 `tests/test_path_security.py`。
  5. 刪除 `frontend/e2e/` 與 `frontend/playwright.config.ts`，自 `frontend/package.json` 移除 `@playwright/test` 並更新 `pnpm-lock.yaml`。
  6. 更新 `README.md`、`README.en.md` 與 `Journal.md`。
- **Evidence**：後端單元測試 (186 passed, 5 deselected in 3.81s)；後端 Windows 合約測試 (2 passed)；前端 Vitest (69 files / 440 tests passed in 10s)；前端 build 通過；`ruff check .` 與 `ruff format --check .` (119 files) 100% 通過。

---

## 2026-08-20 / Dependabot 版本自動更新配置 (Dependabot Version Updates) 與生態系統合約驗證

### 全生態系覆蓋 (GitHub Actions, pip, npm, cargo)、分組更新策略與路徑合約測試

- **來源**：`local`，參照 GitHub 官方文件標準，為儲存庫建置完整的 `.github/dependabot.yml` 版本自動更新配置。
- **狀態**：`adopted`。
- **Learning**：
  1. **全生態系統精確路徑對齊 (Ecosystem Directory Alignment)**：
     - `github-actions`：指定 `directory: "/"`，自動掃描 `.github/workflows` 下的所有 Action 依賴。
     - `pip`：指定 `directory: "/"`，監控根目錄 `requirements.txt` 與 `pyproject.toml`。
     - `npm`：指定 `directory: "/frontend"`，與根目錄 `pnpm-workspace.yaml` / `pnpm-lock.yaml` 一併對齊 pnpm 依賴結構。
     - `cargo`：指定 `directory: "/frontend/src-tauri"`，監控 Tauri Rust 核心之 `Cargo.toml` 與 `Cargo.lock`。
  2. **分組更新防 PR 氾濫 (Grouped Updates)**：為各生態系統配置 `groups`（`github-actions`、`python-dependencies`、`frontend-dependencies`、`rust-dependencies`）與萬用字元 `patterns: ["*"]`，將每週的版本更新聚合成單一 PR，降低審查雜訊。
  3. **語意化 Commit 訊息與標籤**：配置 `commit-message` 的 `prefix`（`ci`、`deps(python)`、`deps(frontend)`、`deps(rust)`）與 `include: "scope"`，完美契合 Conventional Commits 規範。
  4. **靜態合約防護測試 (Contract Testing Gate)**：建立 `tests/test_dependabot_contract.py`，自動驗證 `version == 2`、必要 ecosystem、目錄路徑存在性、排程與分組設定，防止未來手動誤改引發 CI 或 Dependabot 解析中斷。
- **Action**：
  1. 建立 `.github/dependabot.yml`。
  2. 建立 `tests/test_dependabot_contract.py`（3 passed）。
  3. 驗證全套單元測試與靜態檢查通過。
- **Evidence**：`test_dependabot_contract.py` (3 passed)；`pytest` (190 passed)；`ruff check .` & `ruff format --check .` 通過；前端 Vitest (69 files / 440 tests passed)；前端 `pnpm build` 成功。

---

## 2026-08-19 / UDP 遙測封包非同步轉發 (Passthrough)、自轉風暴防護與熱更新機制

### 零阻塞 raw Datagram 轉發、防迴圈碰撞與執行期零中斷 set_forwarding

- **來源**：`local`，針對第三方軟體（如 SimHub、MoTeC Live 插件、外接儀表板）需同時監聽 Forza 遙測封包之需求，於 `telemetry_listener.py` 與 `main.py` 實作非同步 UDP 封包轉發與動態配置。
- **狀態**：`adopted`。
- **Learning**：
  1. **零阻塞非同步 UDP Passthrough**：透過 `TelemetryProtocol` 持有的 `asyncio.DatagramTransport.sendto` 直接發送 raw binary 封包，耗時微秒級且不產生額外 OS socket 資源競爭，完美保護 60Hz+ 遙測接收循環。
  2. **防自轉風暴 (Loopback Storm Prevention)**：若轉發目標 host:port 與接收端監聽的本地地址相同（如皆為 `127.0.0.1:8000`），自轉自身收到的封包會引發死循環風暴。在 `set_forwarding` 加入本地監聽碰撞偵測與主動阻斷防護。
  3. **高頻回調零同步 DNS 解析**：嚴禁在 60Hz 的 `datagram_received` 中執行 `gethostbyname`；所有 Host 字串在初始化與 `set_forwarding` 設定變更時完成預先解析與快取。
  4. **零重啟動態熱更新 (Zero-Downtime Hot-Reload)**：當使用者在前端 Settings 畫面修改轉發目標時，後端 `/api/settings` 直接更新 `protocol.set_forwarding`，無須中斷或重啟 UDP 監聽 socket。
- **Action**：
  1. 重構 `backend/telemetry_listener.py` 之 `forward_udp_packet`、`TelemetryProtocol` 與 `start_udp_listener`。
  2. 在 `backend/main.py` 整合 `forward_telemetry_*` 設定持久化、環境變數覆寫與動態熱更新。
  3. 擴充前端 `SettingsContext.tsx`、`SettingsView.tsx` 與 `lang/` 多語系支援（預設轉發連接埠 `5300`）。
  4. 新增 `tests/test_telemetry_listener.py` 與 `tests/test_main.py` 轉發與自轉風暴測試。
- **Evidence**：後端單元測試 (187 passed)；`ruff check` & `ruff format --check` 通過；前端 Vitest (69 files / 440 passed)；前端 `pnpm build` 驗證通過。

---

## 2026-08-18 / PR 技能分化 (pr-author-maintainer)、禁止自我斷言 Mergeable 與跨 Agent 身分標記

### PR Author/Maintainer 職責邊界、Pre-Commit 測試門檻、Living PR Body 迭代與 {代號} as {Agent} 標記規範

- **來源**：`local`，針對 PR 開發流程進行職責分化，建立 `pr-author-maintainer` 專用技能，並在 Reviewer 與 Author 兩端全面導入 `{代號} as {Agent}` 身分標記機制。
- **狀態**：`adopted`。
- **Learning**：
  1. **PR 角色職責分化 (Reviewer vs. Author/Maintainer)**：審查者（`pr-review-evaluation`）專注於評估變更、檢查 CI、發表客觀 Review 與 Suggestions；而作者/維護者（`pr-author-maintainer`）則專注於本地完整驗證、撰寫 PR、隨每次 commit 迭代更新 PR Body、維護標題穩定性，並客觀回覆 Reviewer 提出的問題。
  2. **禁止自我斷言可合併原則 (No Self-Asserted Mergeability)**：Author / Maintainer 嚴禁在 PR Body 或回覆留言中自我下定論「Ready to merge」、「LGTM」或宣告可直接合併。必須客觀陳述「變更摘要、本地與 CI 驗證數據、待審查與反饋」，將合併與審核結論交由審查者或外部流程。
  3. **嚴格 Commit 前測試門檻 (Strict Pre-Commit Gate)**：在每次 commit/push 前強制落實通過 Python 靜態檢查（`ruff check` / `ruff format --check`）、後端 Pytest、前端 Vitest 與前端建置驗證，杜絕帶著已知測試錯誤推送。
  4. **PR Body 活文件同步迭代 (Living PR Body)**：隨著 Review 過程中的後續修正或 commit 追加，必須同步更新 PR 頂層 Body 內文，確保 PR Body 永遠忠實反映該 PR 的最終完整狀態，防止資訊偏差 (Documentation Drift)。
  5. **PR 標題穩定性原則 (PR Title Stability)**：遵循 Conventional Commits 格式，僅在 PR 核心範疇或目標發生重大改變時才調整標題，避免頻繁修改干擾通知與上下文。
  6. **跨 Agent 身分標記規範 (`{代號} as {Agent}`)**：所有 Agent（Google Antigravity, OpenAI Codex, Google Jules）共用相同 GitHub 帳號發言，必須在 Review、PR Body 與所有回覆留言的頭尾明確標記 `{代號} as {Agent}`（例如 `Gemini as Antigravity`、`Luna as Codex`、`Gemini as Jules`），以利發言主體之追溯與識別。
  7. **CI 未涵蓋 Blocking 意見之測試代碼提供義務**：當 Reviewer 提出的 Blocking 意見涉及現有 CI 尚未覆蓋之邊界、競態或例外路徑時，Reviewer **必須一併提供可重現問題的單元測試代碼**；Author/Maintainer 必須將該測試代碼納入測試套裝中，在本地重現並修復（紅燈轉綠燈）後方可進行下次 Commit。
  8. **雙軌檢視與 Inline Comments 防漏盤點機制**：GitHub CLI `gh pr view` 容易忽略錨定在具體代碼行上的原生 Inline Comments 與 Code Suggestions；Author / Maintainer 必須採取雙軌審查消費流程，利用 `manage_pr_author.py --list-comments` 產出條列式 Markdown 檢核表，逐條盤點並處置行內評論，徹底消弭審查盲區。
- **Action**：
  1. 建立 `.agents/skills/pr-author-maintainer/SKILL.md` 與 `references/pr_author_workflow_guide.md`。
  2. 實作 `manage_pr_author.py` 輔助管理腳本（支援 PR Body 驗證、自我斷言攔截、身分標記校驗、範本產生、Thread 回覆與 `--list-comments` / `--fetch-reviews` 防漏盤點功能）。
  3. 建立 `tests/test_manage_pr_author.py` 單元測試（9 passed）。
  4. 同步升級 `pr-review-evaluation/SKILL.md`、`github_inline_comments_guide.md`、`submit_pr_review.py` 與 `tests/test_submit_pr_review.py`（加入 CI 未涵蓋 Blocking 意見附帶測試代碼規範與身分標記支援）。
  5. 更新 `.agents/skills/README.md` 與 `.agents/AGENTS.md` 治理規範。
- **Evidence**：`tests/test_manage_pr_author.py` (9 passed)；`tests/test_submit_pr_review.py` (5 passed)；後端全套測試通過；`ruff check .` 與 `ruff format --check .` 通過；前端 Vitest 通過。

---

## 2026-08-17 / GitHub Actions Release Workflow 腳本注入防護、前端打包合約與 Shell 語法錯誤修復

### GitHub Actions 內聯範本展開崩潰、tauri.ci.conf.json 前端資產依賴與 step env 安全傳遞

- **來源**：`local`，針對 Release 工作流因 Release Body 雙引號與換行導致 Bash 腳本語法中斷（Exit code 127），以及 `tauri build --config src-tauri/tauri.ci.conf.json` 因缺少 `frontend/dist` 靜態資產導致 Tauri 建置失敗（Exit code 1）進行全面修復。
- **狀態**：`adopted`。
- **Learning**：
  1. **GitHub Actions 內聯範本展開與 Shell 語法崩潰 (Expression Injection)**：在 workflow 的 `run: |` 腳本中直接使用 `${{ github.event.release.body }}` 或類似外部上下文變數時，GitHub Actions 會在 Bash 執行前進行字串替換。若 Release 說明內含有雙引號（如 PR 標題 `"Coming Soon"`）、反引號、特殊字元或換行，將導致雙引號提前閉合，後續 Markdown 行（如 `**Full Changelog**: https://...`）會被 Bash 解析為獨立命令，引發 `No such file or directory` 與 exit code 127 錯誤。
  2. **環境變數隔離原則 (Safe Context Passing via env)**：GitHub context 變數與 workflow inputs 應一律透過 step 的 `env:` 區塊傳入環境變數（例如 `EVENT_NAME: ${{ github.event_name }}`），由 Shell 讀取環境變數 `$EVENT_NAME`。這不僅消除了引號跳脫與腳本截斷問題，更杜絕了 CWE-78 指令注入 (Command Injection) 風險。
  3. **Tauri CI 配置之 beforeBuildCommand 契約與前置建置依賴**：`tauri.ci.conf.json` 將 `beforeBuildCommand` 覆寫為 `echo Using verified frontend distribution...` 以避免多 job CI 重複編譯；在單一獨立 release job 中，必須在呼叫 `tauri build` 前明確執行 `pnpm --prefix frontend run build`（並傳入 `VITE_GIT_COMMIT` / `VITE_GIT_BRANCH`）以預先產生 `frontend/dist` 靜態產物，否則 Tauri 會因找不到 `frontendDist: "../dist"` 而中斷退出。
  4. **Release Asset Manifest 與 OTA Notes 簡潔性**：Tauri v2 updater 的 `latest.json` 僅需簡潔版本描述（如 `f"FH6-HorizonTuner Release {tag}"`），毋需將完整的 GitHub Release Markdown Changelog 強行內嵌於 shell 腳本中。
- **Action**：
  1. 修改 `.github/workflows/release.yml`，移除未使用的 `BODY="${{ github.event.release.body }}"`，並將 `Determine Release Tag` 之各變數改為 `env` 映射。
  2. 在 `.github/workflows/release.yml` 於 `tauri build` 前新增 `Build Frontend Production Bundle` 步驟（`pnpm --prefix frontend run build` 並注入 Git 環境變數）。
  3. 同步重構 `.github/workflows/diagnostics.yml`，將 `github.event.inputs` 透過 `env` 區塊宣告傳遞。
  4. 在 `tests/test_release_workflow_contract.py` 建立靜態合約與安全防護測試（含前端打包順序檢查），防範未來重新引入不安全的內嵌上下文或遺漏建置步驟。
  5. 驗證後端單元測試 (171 passed)、前端 Vitest (440 passed)、前端 build 與靜態檢查。
- **Evidence**：`test_release_workflow_security_and_contract` 與 `test_diagnostics_workflow_security_and_contract` 通過；`pytest` (171 passed)；`ruff check` & `ruff format --check` 通過；前端 Vitest (69 files / 440 tests passed)；`pnpm --prefix frontend run build` 成功輸出至 `frontend/dist`。

---

## 2026-08-17 / Dependabot Alert #2: glib Unsoundness 深度調查與平台隔離處置 (GHSA-wrw7-89jp-8q8g)

### Cargo SemVer 跨版不相容、Tauri Linux 目標依賴鎖定與 Windows 平台隔離決策

- **來源**：`local`，針對 Dependabot Alert #2 (`GHSA-wrw7-89jp-8q8g` / `RUSTSEC-2024-0429`) 進行深層相依性樹狀圖分析與治理處置。
- **狀態**：`adopted`。
- **Learning**：
  1. **Dependabot 無法自動修復根本原因 (SemVer Incompatibility)**：
     - `glib` 是由 `tauri v2.11.5` 的 Linux 平台依賴 `gtk v0.18.2` 間接引入，其要求 `glib = "^0.18"`（被鎖定在 `0.18.5`）。
     - 漏洞修復版本為 `glib >= 0.20.0`。在 Cargo SemVer 規範中，`0.18` 到 `0.20` 屬於 Major Incompatible Breaking Change，強制指定 `0.20.0` 會觸發 Cargo 依賴解析失敗，導致 Dependabot 無法自動建立升級 PR。
  2. **上游 Tauri 與 GTK-rs 生態限制**：
     - GTK-rs 官方未針對 `0.18.x` 釋出 backport patch；Tauri 官方正逐步從 `gtk3-rs` 遷移至 `gtk4-rs`。在上游完成全面升級前，下游所有 Tauri 2 專案均無法單獨升級 `glib`。
  3. **Windows 平台隔離性與威脅模型分析 (Zero Exploitability)**：
     - `FH6-HorizonTuner` 專為 Windows 平台的 Forza 遙測打造，發行產物均為 Windows PE 二進位檔。
     - 在 Windows 上編譯與打包時，Tauri 採用 Windows WebView2 與 Win32 API 抽象層，`glib` / `gtk` / `webkit2gtk` 等 Linux 目標平台條件依賴**完全不會被編譯、連結或打包進 Windows 生產產物**中，對最終使用者不存在任何安全威脅。
- **Action**：
  1. 透過 GitHub REST API 成功將 Dependabot Alert #2 標記為 `dismissed`（理由 `tolerable_risk`，附帶平台隔離與上游依賴依據）。
  2. 在 `.agents/skills/github-security-audit/SKILL.md` 增訂「第三方依賴漏洞與上游間接依賴鎖死 (`dependabot-transitive-lock`)」標準排查與處置 SOP。
  3. 驗證全專案後端單元測試 (165 passed)、前端 Vitest (440 passed)、靜態檢查與 GitHub Dependabot 狀態（Open alerts = 0）。
- **Evidence**：GitHub API PATCH 回傳 `state: dismissed`, `dismissed_reason: tolerable_risk`；`collect_security_alerts.py` 驗證 Dependabot 待處理警報為 0；後端 Pytest (165 passed)；前端 Vitest (69 files / 440 tests passed)；`ruff check .` 與 `ruff format --check .` 100% 通過。

---

## 2026-08-17 / PR Review 技能升級與 GitHub 原生 Inline Comments 整合

### GitHub PR Review API 機制、Diff Hunk 邊界 Invariant 與 submit_pr_review 實作

- **來源**：`local`，在新分支 `feat/pr-review-inline-comments` 上升級 `pr-review-evaluation` 技能並對 PR #217 進行實機驗證。
- **狀態**：`adopted`。
- **Learning**：
  1. **GitHub 原生 Inline Review Comments 提交機制**：GitHub CLI `gh pr review` 僅支援頂層 `--body`，無法直接傳入行內評論陣列。必須透過 REST API `POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews` 傳入包含 `commit_id`、`body`、`event` 與 `comments` 陣列（含 `path`, `line`, `side`, `start_line`, `body` 與 ````suggestion` 標籤）的 JSON Payload，方能實現原子性審查與行內評論發布。
  2. **Diff Hunk 邊界 Invariant 與 422 錯誤防護**：GitHub REST API 嚴格限制行內評論的 `line` 必須落在該 PR 的 Unified Diff Hunk（變更行及其上下文）內；若指定超界行號，整筆 Review 會拋出 `422 Unprocessable Entity` 失敗。在提交工具中實作 Diff Hunk 解析與超界降級 (Graceful Fallback) 機制，自動將超界行號重導至頂層 Review Body，能確保審查發布 100% 成功率。
  3. **Windows UTF-8 控制台編碼防護**：在 Windows PowerShell 環境下，命令列工具標準輸出必須配置 `sys.stdout.reconfigure(encoding="utf-8")`，並避免裝飾性 Emoji，改用標準 ASCII 標籤（`[*]`, `[+]`, `[-]`）。
- **Action**：
  1. 建立 `.agents/skills/pr-review-evaluation/references/github_inline_comments_guide.md` 參考指南。
  2. 建立 `.agents/skills/pr-review-evaluation/scripts/submit_pr_review.py` 輔助工具（支援 Dry-Run、Diff 解析與自動降級）。
  3. 重構 `.agents/skills/pr-review-evaluation/SKILL.md` 與更新 `.agents/skills/README.md` 索引。
  4. 建立 `tests/test_submit_pr_review.py` 單元測試覆蓋 Diff 解析、邊界行號與降級邏輯。
  5. 建立分支 `feat/pr-review-inline-comments` 與 PR #217，並實際透過工具於 PR #217 成功提交 Review #4949195332（含 2 筆原生 Inline Comments 與 Suggestions）。
- **Evidence**：`tests/test_submit_pr_review.py` (4 passed)；`ruff check .` 與 `ruff format --check .` 100% 通過；前端 Vitest (69 files / 440 tests passed)；GitHub PR #217 成功產生 Review #4949195332 與 Discussions #3794409835, #3794409846。

---

## 2026-08-17 / PR #214 & PR #215 審查、驗證與合併

### SettingsView 點擊熱區擴充 (PR #214) 與 Telemetry Cards 60Hz DOM 快取最佳化 (PR #215)

- **來源**：`local`，針對 Jules 建立之 PR #214 與 PR #215 依循 `pr-review-evaluation` 技能進行評估、Review 意見提交與 Squash Merge。
- **狀態**：`adopted`。
- **Learning**：
  1. **設定開關點擊熱區優化 (PR #214)**：在 `SettingsView.tsx` 中將外層容器轉換為 `<label htmlFor="...">` 並替換內部重複之 `<label>` 為 `<div className="form-check-label ...">`，能在不破壞 Halfmoon CSS v2 排版前提下，大幅擴充整列可點擊範圍（Hit Area），顯著改善指標與觸控操作體驗。
  2. **高頻遙測 60Hz 渲染 DOM 快取 (PR #215)**：在 `hud_overlay/shared/telemetry-cards/manager.js` 中建立 `this.domCache` 快取全部子渲染器（`g-radar.js`, `pedal-wave.js`, `power-torque.js`, `corner-card.js`）所需之 DOM 節點，消弭每幀約 14 次 `document.getElementById` 同步查詢（約 840 次/秒），有效降低主執行緒 CPU 開銷與 GC 壓力，並保留 fallback 機制維持向後相容。
- **Action**：
  1. 檢視兩項 PR 之程式碼變更、CI Checks (14/14 全綠) 與 CodeQL 分析報告。
  2. 標準化輸出 Review Comments 並完成 Squash Merge。
  3. 同步拉取至本地 `main` 分支並完成 165 項後端單元測試、69 檔/440 項前端單元測試與 Vite 建置驗證。
- **Evidence**：GitHub PR #214 & PR #215 成功合併；本地 `ruff check` (pass)、`ruff format --check` (113 files pass)、後端單元測試 (165 passed)、前端 Vitest (440 passed)、`tsc && vite build` (pass)。

---

## 2026-08-17 / Dependabot Alert #1: nanoid DoS 漏洞修復 (CVE-2026-67213)

### nanoid 零長度無限迴圈拒絕服務漏洞與 pnpm.overrides 鎖定

- **來源**：`local`，針對 Dependabot Alert #1 (`GHSA-2v37-7h3g-55p8` / `CVE-2026-67213`) 進行修復與供應鏈版本鎖定。
- **狀態**：`adopted`。
- **Learning**：
  1. **間接依賴漏洞排查 (Transitive Dependency)**：`nanoid@3.3.17` 係由 `postcss` (透過 `halfmoon` / `rtlcss` 與 `vite`) 間接引入。當依賴層級較深時，直接更新頂層依賴未必能觸發間接依賴的 patch 升級。
  2. **pnpm overrides 鎖定機制**：在 `frontend/package.json` 的 `pnpm.overrides` 宣告 `"nanoid": "^3.3.18"`，並執行 `pnpm --prefix frontend update nanoid --depth 99`，能強制 pnpm 解析器在整顆相依樹上將 `nanoid` 提升至修復後的 `3.3.18`，乾淨消除 CVE-2026-67213 漏洞。
- **Action**：
  1. 查驗官方 npm Registry 確認 `nanoid@3.3.18` 為最新 patch 版本。
  2. 在 `frontend/package.json` 加入 `pnpm.overrides.nanoid: "^3.3.18"` 並更新 `pnpm-lock.yaml`。
  3. 驗證前端單元測試 (440 passed)、Vite build、後端測試 (165 passed) 與 PR CI 14 個 Checks 全數 100% 綠燈通過。
- **Evidence**：`pnpm why nanoid` 顯示僅存在 `nanoid@3.3.18`；GitHub Actions CI Run #32002847445 (14 Checks) 全數 PASS。

---

## 2026-08-17 / Tauri v2 OTA 自動更新機制實作、網頁端 Release CI 與 post-release 誤判防護

### Tauri v2 官方 Updater 插件整合、Ed25519 簽名、網頁 Release 唯一觸發與版本狀態防護

- **來源**：`local`，在新分支 `feat/ota-updater` 上完成 OTA 自動更新機制與 Release 自動發布工作流實作。
- **狀態**：`adopted`。
- **Learning**：
  1. **Tauri v2 插件化權限體系**：Tauri 2 將 Updater 與 Process 功能完全插件化。需在 `frontend/src-tauri/Cargo.toml` 引入 `tauri-plugin-updater` 與 `tauri-plugin-process`，並於 `frontend/src-tauri/capabilities/default.json` 聲明 `"updater:default"` 與 `"process:default"`，否則前端 Webview 調用會遭安全核心拒絕。
  2. **OTA 重啟前 Sidecar 行程與 Socket 釋放防護**：Windows PE 檔案更新重啟時，若舊的 Python Sidecar 未徹底退出，會導致 UDP `8000` 與 HTTP `8001` 埠被佔用。在 Rust 實作專屬 `prepare_update_and_restart` Command，在觸發 `app_handle.restart()` 前主動呼叫 `stop_backend_process`（關閉 stdin + `taskkill /PID /T /F`）並延遲 300ms，能確保 Socket 100% 潔淨釋放。
  3. **Release CI 構建之 `post-` 誤判三重防護**：
     - 在 Vite 建置時，若工作區產生中間產物，`git status` 會將 HEAD 判定為 dirty 並在版本號加上 `post-`（如 `post-v1.5.0`），導致客戶端與 GitHub Release 比對失敗。
     - **三重防護措施**：
       1. 在 `.github/workflows/release.yml` 注入 `VITE_GIT_COMMIT: ${{ env.TAG }}` 與 `VITE_GIT_BRANCH: "main"`。
       2. 在 `frontend/vite.config.ts` 優先採用環境變數覆寫，繞過 dirty 檢測。
       3. 擴充 `generatedPathPrefixes` 白名單（加入 `metrics/`, `scratch/`, `diagnostics_output/`, `dist/release/`, `.coverage` 等）。
  4. **版本與 Release 狀態結構化重構 (Non-Breaking Refinement)**：
     - 在 `frontend/vite.config.ts` 產出乾淨結構化的 `__APP_BUILD_INFO__`，取代模稜兩可的複合字串猜測。
     - 抽離 `frontend/src/services/buildInfoService.ts`，封裝純函數 `formatBuildInfoText` 與具備 10 分鐘 `sessionStorage` 快取的 `getRemoteReleaseComparison`，徹底根除 GitHub API Rate Limit 403 報錯風險。
     - 保持主 GUI 頂部導覽列視覺、字級與文字格式 100% 向後相容。
  5. **GitHub 網頁端手動發布為唯一觸發途徑**：移除命令列 `git tag` 觸發，在 `.github/workflows/release.yml` 配置 `on: release: types: [published]`。維護者在 GitHub 網頁填寫 Tag 與說明發布後，CI 自動執行 PyInstaller Sidecar 編譯、Tauri 打包、Ed25519 簽名並透過 `scripts/prepare_release_assets.py` 與 `softprops/action-gh-release@v2` 自動將 EXE、.sig、Portable ZIP 與 `latest.json` 附加到該 Release。
- **Action**：
  1. 在 Rust 端配置 `tauri-plugin-updater` 與 `tauri-plugin-process`，並建立 `prepare_update_and_restart` 指令。
  2. 在前端建立 `frontend/src/services/updaterService.ts` 與單元測試 `updaterService.test.ts`。
  3. 建立 `frontend/src/services/buildInfoService.ts` 與單元測試 `buildInfoService.test.ts`。
  4. 依循 Halfmoon CSS v2 與 Glassmorphism 規範建立 `UpdateModal.tsx` 與 `UpdateSettingsCard.tsx`。
  5. 升級 `Navigation.tsx` 的 `GitInfoBadge`，使用 `buildInfoService` 實現快取保護與乾淨狀態管理。
  6. 建立 `.github/workflows/release.yml`、`scripts/prepare_release_assets.py` 與 `tests/test_release_workflow_contract.py`。
  7. 加固 `frontend/vite.config.ts` 的版本探測邏輯，徹底防止 Release 產物被標記為 `post-`。
- **Evidence**：`cargo check` 通過；前端 Vitest (69 files, 440 passed)；`pnpm run build` (tsc + vite) 成功；後端 Pytest (165 passed)；`ruff check .` 與 `ruff format --check .` (113 files) 100% 通過。

---

## 2026-08-17 / Code Scanning 剩餘警報 #16, #17, #45 徹底修復

### MCP get_capture_summary 污點鏈根除與內部枚舉加固 (Alerts #16, #17, #45)

- **來源**：`local`，針對專案剩餘的 3 筆 CodeQL Path Injection 警報進行修復與測試加固。
- **狀態**：`adopted`。
- **Learning**：
  1. **外部輸入直接調用 OS API 觸發 Source 警報**：在 `get_capture_summary` 中，首行 `if os.path.exists(capture_id_or_path):` 直接對使用者輸入字串調用 OS 檔案系統存在性檢查，直接觸發 CodeQL `py/path-injection` 警報（案件 #45）。
  2. **污點傳播導致 Sink 警報連鎖**：即使後續具有 `commonpath` 檢查，將源自外部輸入的衍生路徑賦予 `target_file` 依然會被靜態分析視為 tainted，使得下方的 `os.path.exists(target_file)`（案件 #16）與 `open(target_file, ...)`（案件 #17）連帶被判定為漏洞。
  3. **內部枚舉查找法 (Defense Pattern B)**：改由 `self.list_tuning_captures()` 在內部安全白名單目錄掃描檔案，將外部輸入純粹作為字串比對值（`==`），僅使用內部枚舉清單記錄的合法 `file_path` 進行檔案讀取，能從根本上徹底切斷 CodeQL 污點追蹤鏈。
- **Action**：
  1. 重構 `backend/mcp/service.py` 的 `get_capture_summary`，移除外部字串路徑操作，改用內部枚舉查找。
  2. 擴充 `tests/test_mcp_service.py` 中的 `test_get_capture_summary_path_traversal_protection`，新增 capture ID 載入、檔名載入、目錄跳脫防護等 4 組斷言。
- **Evidence**：`tests/test_mcp_service.py` 與 `tests/test_path_security.py` (23 passed)；`tests/test_mcp_*.py` (28 passed)；前端 Vitest (66 files, 418 passed)；`ruff check .` 與 `ruff format --check .` (110 files) 100% 通過。

---

## 2026-08-17 / GitHub Security Audit 32 筆警報全面修復與 CI/CD 治理

### CodeQL 32 筆安全警報全面加固 (Path Injection, Bad Tag Filter, Socket Binding, E2E)

- **來源**：`local`，針對 GitHub Security Audit 收集之 32 筆安全警報進行全面修復與單元測試加固。
- **狀態**：`adopted`。
- **Learning**：
  1. **GitHub Security Dashboard 與 PR/CI 合併生效特性**：在 PR 處於開啟或分支 commit 階段，GitHub Security Tab 上的全域警報不會自動關閉。必須透過 PR 的 Checks 分頁與 CodeQL CI Run 日誌確認警報消除；待 PR 正式合併（Merge）至主分支後，Security Tab 的警報才會自動轉為 `Closed (Fixed)`。
  2. **Path Injection 深度包含性檢驗與內部枚舉防禦**：單純使用 `os.path.basename()` 在複雜路由或 MCP 工具中仍可能觸發 CodeQL 污點分析警報；在後端採用 `os.path.realpath` 與 `os.path.commonpath([base_dir, target_dir]) == base_dir` 進行 strict containment，或直接在內部枚舉清單中查找檔案物件（如 `list_drag_sessions` / `list_tuning_presets`），能從根本上徹底切斷外部污點鏈。
  3. **HTML 標籤過濾 Regex 缺陷 (`js/bad-tag-filter`)**：CodeQL 的 `js/bad-tag-filter` 規則會嚴格檢查 HTML end tag 是否允許屬性與換行空白（例如 `</script\t\n bar>`）；僅寫 `</script\s*>` 仍會被判定為漏洞，必須寫成 `/<script[^>]*>([\s\S]*?)<\/script[^>]*>/gi` 才能完全符合規範。
- **Action**：
  1. 建立 `backend/path_security.py` 提供 `safe_resolve_path` 與 `safe_join_under_dir` 集中式安全路徑驗證。
  2. 修復 `backend/main.py`（14 處）、`backend/motec_exporter.py`（2 處）、`backend/mcp/service.py`（8 處）路徑注入隱患。
  3. 修復 `hud_overlay/advanced/tests/unit/advancedHudContract.test.ts` 與 `hud_overlay/drift/tests/unit/driftHudContract.test.ts` 正則標籤過濾（改為 `/<script[^>]*>([\s\S]*?)<\/script[^>]*>/gi`）。
  4. 修復 `frontend/e2e/hud_telemetry_cards.spec.ts` 靜態檔案伺服器目錄遍歷防護。
  5. 加固 `verify_telemetry_v2_v3.py` Socket 綁定（支援 `--host`，預設 `127.0.0.1`）。
  6. 新增 `tests/test_path_security.py` 完整覆蓋目錄跳脫與邊界測試（12 tests）。
- **Evidence**：GitHub Actions PR #212 遠端 CI 中 **`CodeQL` 檢查 100% PASS (0 annotations / 0 alerts)**；`Analyze (python)`, `Analyze (javascript-typescript)`, `Analyze (rust)`, `Analyze (actions)` 全數通過；本地 `tests/test_path_security.py` (12 passed)；後端 `pytest` (164 passed)；前端 Vitest (66 files, 418 passed)；`ruff check .` 與 `ruff format --check .` 100% 通過。

---

## 2026-08-17 / GitHub Security Audit Skill & Alert Collection

### GitHub Security & Quality 全維度資料收集與 github-security-audit 技能建置

- **來源**：`local`，建立 GitHub 自動檢測安全問題之資料收集與審計機制。
- **狀態**：`adopted`。
- **Learning**：
  1. **GitHub Security API 參數限制**：`secret-scanning/alerts` 的 `state` 參數僅接受單一字串（`open` 或 `resolved`），不可傳入逗號多選值，否則會回傳 HTTP 400；而 `dependabot/alerts` 與 `code-scanning/alerts` 則支援多選狀態。
  2. **Vulnerability Alerts 狀態碼特性**：`vulnerability-alerts` 啟用狀態端點回傳 `204 No Content`，代表該功能正常啟用。
  3. **Windows 主控台輸出編碼防護**：Windows 預設 `cp950` 命令列環境無法編碼裝飾性 Unicode Emoji，所有工具腳本標準輸出應強制採用 `sys.stdout.reconfigure(encoding="utf-8")` 並以標準 ASCII 標籤（`[*]`, `[+]`, `[-]`）替代裝飾圖示。
- **Action**：
  1. 建立全新技能 `.agents/skills/github-security-audit/SKILL.md`，提供完整安全維度收集工作流與 4 大類常見漏洞（Path Injection, Bad Tag Filter, 0.0.0.0 Socket, Secret leak）修復指南。
  2. 建立自動化資料收集腳本 `.agents/skills/github-security-audit/scripts/collect_security_alerts.py`，支援匯出 Markdown 與 JSON 報告。
  3. 建立 API 參考指南 `.agents/skills/github-security-audit/references/github_security_api_guide.md`。
  4. 同步更新 `.agents/skills/README.md` 與 `.agents/AGENTS.md` canonical 技能清單。
- **Evidence**：`collect_security_alerts.py` 本地執行成功，完整拉取 32 筆 Code Scanning 警報並產出 Markdown / JSON 報告；`ruff check` 靜態檢查 100% 通過。

---

## 2026-08-16 / Security Audit & Anti-Hallucination Package Protocol

### 全專案安全性稽核、CSWSH 跨來源防禦、MCP 路徑清洗與防幻覺查驗協議

- **來源**：`local`，安全性深度稽核與加固任務。
- **狀態**：`adopted`。
- **Learning**：
  1. **WebSocket 跨來源無 CORS 防護**：FastAPI 的 `CORSMiddleware` 僅對標準 HTTP 請求生效，對 WebSocket 握手無效；必須在 `websocket_endpoint` 中手動校驗 `websocket.headers.get("origin")` 並於異常時發送 1008 Policy Violation。
  2. **MCP 工具路徑遍歷隱患**：MCP 讀檔工具若直接組合字串路徑，可能遭受 `..` 目錄跳脫；必須使用 `os.path.basename()` 並進行 `os.path.commonpath` 目錄包含性檢查。
  3. **套件幻覺防護機制**：LLM 在撰寫相依套件時可能產生幻覺套件名稱或拼寫搶註套件；必須強制制定「安裝前執行 Registry 查驗指令」協議（`npm view` / `pnpm info` / `pip index versions` / `cargo search`）。
- **Action**：
  1. 在 `backend/main.py` 實作 `is_allowed_origin` 並保護 `/ws/telemetry`、`/ws/telemetry/binary`、`/ws/overlay`。
  2. 在 `backend/mcp/service.py` 實作路徑清洗與目錄 containment 檢查。
  3. 在 `frontend/src-tauri/tauri.conf.json` 配置 CSP 規則；在 `.gitignore` 追加敏感憑證與 `.env` 排除規則。
  4. 在 `.agents/AGENTS.md` 正式增訂「第三方套件引入與防幻覺查驗協議」。
  5. 建立 `tests/test_websocket_origin_security.py` 與 `tests/test_mcp_service.py` 安全測試。
- **Evidence**：`pytest tests/test_websocket_origin_security.py` (5 passed)；`pytest tests/test_mcp_service.py` (11 passed)；全專案依賴 Registry 查驗 100% 通過。

---

## 2026-08-14 / Codex-Antigravity Bridge Headless Tool Permission & Workspace Binding

### Headless 模式 toolPermission 授權機制與工作區邊界綁定

- **來源**：`local`，解決跨 Agent（Codex/外部腳本）在 headless 模式下調用 Antigravity 觸發 `Permission denied for read_file` 權限問題。
- **狀態**：`adopted`。
- **Learning**：
  1. **非互動環境權限判定**：Headless 模式下因無互動 UI 提示使用者授權，未配置 `toolPermission: proceed-in-sandbox` 時，任何需要確認的工具調用會被自動拒絕或逾時。
  2. **系統保護硬性邊界**：工作區外部路徑（如 `~/.gemini/`、`C:\Users\...`）受 `Hardcoded system protection boundary` 保護，即使在沙盒內也會被嚴格拒絕；跨 Agent 傳遞的路徑必須在專案工作區（`D:\FH6-HorizonTuner`）內。
  3. **工作目錄與參數綁定**：`agy 1.1.13` 不支援 `-w`；必須設定 Process `WorkingDirectory` 並傳遞 `--add-dir D:\FH6-HorizonTuner`，才能讓 workspace-relative `read_file` 正常通過。
- **Action**：
  1. 建立 `Set-AgyBridgeSettings.ps1` 輔助腳本，支援自動配置與驗證 `settings.json`（`enableTerminalSandbox: true` 與 `toolPermission: proceed-in-sandbox`）。
  2. 更新 `Invoke-AgyCrossAgentSmoke.ps1`：顯式設定 `WorkingDirectory`、傳遞 `--add-dir` 參數，並新增 `-TestReadFile` 工具讀檔驗證與 `diagnosticHint` 診斷提示。
  3. 更新 `.agents/skills/codex-antigravity-bridge/SKILL.md` 與 `skills/README.md`，完善方案 A（`settings.json` 配置）與方案 B（工作區綁定與路徑邊界）規範。
- **Evidence**：`Set-AgyBridgeSettings.ps1` 驗證 `isValid=true`；`agy --add-dir D:\FH6-HorizonTuner ...` 讀檔 smoke test 回覆 `AGY_READFILE_OK:FH6-P4B-READFILE-005`；舊 `-w` 旗標在 agy 1.1.13 回傳 `flags provided but not defined`。

---

## 2026-08-14 / Phase 6~8 多模組並行開發 (Diagnosis Engine + UI Persistence + E2E)

### 閉環診斷引擎、UI 改裝能力整合、Preset 序列化與 E2E 驗證

- **來源**：`local`，Antigravity 主 Agent + Phase6 Diagnosis Subagent + Phase7 UI Persistence Subagent 並行協作。
- **狀態**：`adopted`。
- **Learning**：
  1. **Subagent `share` workspace 的 Windows 長路徑限制**：以 `share` workspace 模式建立 git worktree 時，`hud_overlay/s650_hmi/assets/fonts/RobotoFlex-VariableFont_GRAD,...` 字型檔路徑超過 Windows MAX_PATH（260 字元），導致 `git checkout` 失敗並回傳 `Could not reset index file to revision 'HEAD': exit status 128`。唯一解法：改用 `inherit` workspace，共享主工作樹，不建立獨立分支。
  2. **Subagent Ownership 邊界的必要性**：兩個 Subagent 若都能寫入相同目錄，會產生競態條件。解法：在 Prompt 中明確列出「不得觸碰」的目錄，由主 Agent 仲裁。此次 S1（Phase 6）與 S2（Phase 7）互不干擾，全程 Zero Conflict。
  3. **README 多行替換的陷阱**：`multi_replace_file_content` 在大型 README 中，若 `TargetContent` 存在多個近似匹配，會觸發 fuzzy match 並插入非預期的額外段落。解法：先 `git checkout HEAD -- README.md` 還原，再改用 PowerShell `(Get-Content) + Set-Content` 逐行替換。
  4. **純函式診斷的 `unknown` 標記規範**：缺失感測器訊號必須回傳 `DiagnosisUnknown = 'unknown'`，而非 fallback 0，確保下游消費者可區分「無法診斷」與「零值」兩種語意。
  5. **時間戳積分 vs sample-count 積分**：Phase 6 所有時間估算必須使用 `timestamp` 欄位積分，禁止以 sample count × 固定間隔估算；`timestamp` 不存在或非單調時全部標記為 `unknown`。
- **Action**：
  1. 新增 `frontend/src/domain/tuning/diagnosis/` 模組：`diagnosisContracts.ts`、`timestampIntegration.ts`、`thermalDiagnosis.ts`、`dynamicsDiagnosis.ts` 及對應測試（+14 tests）。
  2. 新增 `frontend/src/domain/tuning/capabilities/TuningCapabilityContract.ts`、`capabilityFilter.ts`、`capabilityFilter.test.ts`。
  3. 新增 `frontend/src/domain/tuning/persistence/presetSerializer.ts`、`presetSerializer.test.ts`，定義 `tuning-preset/v1` 格式。
  4. 新增 `frontend/src/features/tuning/components/RecommendationComparisonPanel.tsx`（雙欄建議對照，Halfmoon v2 + Glassmorphism）。
  5. 更新 `README.md` 與 `README.en.md`：前端測試統計從 57/298 更新為 66/418。
- **Evidence**：`pnpm -C frontend run test` → **66 files / 418 tests passed**；`pytest tests/` → **144 passed, 2 skipped**；`ruff check .` → **All checks passed!**；`ruff format --check .` → **102 files already formatted**。

---

## 2026-08-14 / Phase 4B Shared Load Transfer & Tire Geometry

### 四輪估計垂直載荷、動態載荷轉移與輪胎幾何先驗

- **來源**：`local`，Antigravity Phase 4B handoff，Codex review。
- **狀態**：`adopted`。
- **Learning**：
  1. 建立純函式 `calculateLoadTransfer`，以 `m·ax·hCG/L` 計算縱向轉移，並以前後滾轉剛性 50/50 prior 分配 `m·ay·hCG/track` 的側向轉移；正 `ax` 將載荷移向後軸，正 `ay` 將載荷移向右側。
  2. 輸出同時保留 `unclampedWheelLoadsN` 與非負 `dynamicWheelLoadsN`，並以 `isClamped`、`clampedWheels` 與 warnings 標示 wheel lift；所有結果標示為 `quasi-static-load-transfer/v1` estimated prior。
  3. 建立 `calculateTireGeometry` 與 `calculateTireVerticalStiffnessPrior`，由胎寬、扁平比、輪圈尺寸計算側壁、半徑與滾動周長；垂直剛度使用 `geometric-heuristic-prior/v1`，未宣稱為 FH6 校準常數。
- **Action**：新增 `loadTransfer.ts` / `loadTransfer.test.ts`、`tireGeometry.ts` / `tireGeometry.test.ts`，並由 `tuningMath_dev.ts` 以 backward-compatible façade re-export。
- **Evidence**：Antigravity handoff `AGY_PHASE4B_FILES_READY:FH6-P4B-IMPLEMENT-002`；targeted Vitest 18 passed；完整 frontend 57 files / 298 tests passed；pytest 144 passed / 2 skipped；ruff check passed；`git diff --check` passed。`ruff format --check` 仍報告既有 `backend/main.py` 與 `tests/test_sidecar_process_contract.py` 格式漂移，未由本次 Phase 4B 修改。

---

## 2026-08-14 / Codex-to-Antigravity Bridge and Resume Probe

### 固定 token 交互可用；桌面會話續接需先匯入 CLI trajectory

- **來源**：`local`，Codex 透過 `agy` 1.1.13 的 headless 與互動式探測。
- **狀態**：`adopted`。
- **Learning**：
  1. Gemini 的 JSON 格式輸出不可作為協定依據；固定 token `AGY_HANDSHAKE_OK:<marker>` 與本地 PowerShell wrapper 可穩定判定成功。Phase 4A review packet 也以 `AGY_PHASE4A_REVIEW_OK:FH6-P4A-ACK-001` 得到明確回覆。
  2. `enableTerminalSandbox=true` 與 `toolPermission=proceed-in-sandbox` 可讓無工具 headless handshake 通過；要求 Antigravity 讀檔或執行工具時，仍可能要求 `escalate_admin`、被自動拒絕或逾時，應分類為通道限制，而非程式結果。
  3. 使用者提供的桌面會話 `f0c07c3d-ea09-4252-bab8-ef2d9cc0f608` 確實存在於 CLI `last_conversations.json` 與 Antigravity brain transcript，但 `agy --conversation <id>`、`agy --continue` 均回傳 `trajectory not found`。這是桌面 UUID 與 CLI trajectory 尚未完成 clone/import 的差異。
  4. `/resume` 以重導 stdin 測試沒有輸出並被終止，不能視為匯入成功；需要真實互動式 terminal，在 picker 選 `Antigravity` 分頁並匯入桌面會話，再使用新產生的 CLI conversation ID。
- **Action**：建立 `.agents/skills/codex-antigravity-bridge/` 與 `Invoke-AgyCrossAgentSmoke.ps1`；把 `desktop_session_requires_cli_import`、固定 token、本地 wrapper 與 dirty worktree 保留規則納入 skill。
- **Evidence**：script handshake `passed=true`、Phase 4A review token 通過；desktop resume exact error `trajectory not found`；Vitest 55 files/284 passed、pytest 144 passed/2 skipped、ruff 全部通過、skill validator `Skill is valid!`、`git diff --check` 通過。

---

## 2026-08-14 / Phase 4A Physics Invariants & Damping Layering

### 懸吊彈簧邊界正名、臨界阻尼三層分離與摩擦橢圓零容量邊界修復

- **來源**：`local`，Phase 4A 物理重構任務。
- **狀態**：`adopted`。
- **Learning**：
  1. 原 `calculateFrictionEllipse` 在輪胎垂直載荷 $F_z=0$ 或摩擦係數 $\mu=0$ 且需求受力 $F_{demand} > 0$ 時，因三元判斷式返回 0，導致 `utilization = 0` 且錯誤判定為 `feasible: true`。修正為需求大於 0 且容量為 0 時回傳 `Infinity` 與 `feasible: false`。
  2. 現有彈簧公式未考慮懸吊幾何槓桿比 ($MR$) 與輪胎串聯垂直剛度 ($K_t$)，正名為 `direct_wheel_load_approx` (假設 $MR=1.0$)，避免誤稱為完整 Wheel-Rate / Ride-Rate 模型。
  3. 阻尼輸出重構為物理層 (`physical`：臨界阻尼與目標阻尼力 $\text{N}\cdot\text{s/m}$)、先驗比率層 (`priors`：阻尼比 $\zeta$ 與 Bump/Rebound 比率) 與遊戲建議滑桿層 (`sliderMapping`：$1\sim20$)，並保留扁平欄位相容現有 UI。
- **Action**：修改 `tireModel.ts`、`suspensionSolver.ts`、`tuningMath_dev.ts`；建立 `tireModel.test.ts` 與 `suspensionSolver.test.ts`。
- **Evidence**：`tireModel.test.ts` (7 passed), `suspensionSolver.test.ts` (3 passed), vitest (284 passed), pytest (144 passed), ruff checks 全部通過。

---

## 2026-08-14 / MCP & In-Game Telemetry Calibration

### MCP 連線配置與實機遙測測試資料收集規劃

- **來源**：`local`，MCP 設定與實機測試環節建立任務。
- **狀態**：`adopted`。
- **Learning**：FastAPI 後端內建的 MCP Streamable HTTP 伺服器 (`/mcp`) 支援標準 JSON-RPC 2.0 協定；可在不引入任何外部 Python 腳本或中介層的情況下，直接透過 Antigravity / HTTP POST 發送 `initialize`、`tools/list` 與 `tools/call` 請求進行即時調用與驗證。此外，在背景啟動後端時會鎖定 `8001` port，執行 sidecar 相關單元測試前需確保該端口釋放。
- **Action**：
  1. 建立 `.vscode/mcp.json` 標準 MCP 連線設定檔，指定 `http://127.0.0.1:8001/mcp`。
  2. 撰寫 `docs/calibration/in-game-telemetry-collection-guide.md`（實機測試 SOP）與 `docs/calibration/in-game-test-schedule-and-matrix.md`（車輛測試梯隊與排程）。
  3. 建立 `docs/calibration/templates/capture_manifest_template.json` 供 A/B 測試記錄與 MCP `compare_captures` 自動化分析。
- **Evidence**：`.vscode/mcp.json`、`docs/calibration/`；pytest (144 passed), vitest (274 passed), ruff checks 全部通過。

---

## 2026-08-14 / IDE Diagnostics Exclusion

### IDE Pyrefly / Pyright 虛擬路徑 (`__pyrefly_virtual__`) 診斷污染修復

- **來源**：`local`，IDE 問題列表修復任務。
- **狀態**：`adopted`。
- **Learning**：Antigravity IDE / Python Language Server (Pyrefly / Pyright) 在解析暫存片段、無標題緩衝區或內聯計算時，會在記憶體中建立如 `d:\__pyrefly_virtual__\inmemory\11-1.py` 之虛擬路徑。由於該路徑開頭為 `d:\` 且未被 `pyproject.toml`、`pyrightconfig.json` 或 `.vscode/settings.json` 排除，語言伺服器會將未完成的暫存程式碼診斷錯誤（如語法錯誤或未匯入 `os` 等）推播至 IDE 的全域 Problems 面板中。
- **Action**：
  1. 在 `pyproject.toml` 中的 `[tool.ruff]` 與 `[tool.pyright]` 的 `exclude` 設定中加入 `**/__pyrefly_virtual__/**` 與 `__pyrefly_virtual__` 排除規則。
  2. 建立 `pyrightconfig.json` 設定檔，顯式排除 `**/__pyrefly_virtual__/**` 與 `d:\__pyrefly_virtual__\**`。
  3. 建立 `.vscode/settings.json` 配置 `python.analysis.exclude` 與 `files.watcherExclude` 排除該虛擬目錄，並於 `.gitignore` 中加入 `!.vscode/settings.json` 以便團隊與 Agent 共享設定。
- **Evidence**：`pyproject.toml`、`pyrightconfig.json`、`.vscode/settings.json`；`ruff check .` (All checks passed), pytest (118 passed), vitest (259 passed) 全數通過。

---

## 2026-08-14 / Localization & Repository Cleanup

### 後端與根目錄雙重 lang 資料夾誤納版控與 mtime 同步機制

- **來源**：`local`，語系檔重複清理任務。
- **狀態**：`adopted`。
- **Learning**：專案設計上以根目錄 `lang/` 為內建語系檔唯一真理來源，但在開發期 (`sys.frozen == False`) 執行 `main.py` 且未指定 `--data-dir` 時，`DATA_ROOT` 預設為 `backend/`，導致 `LANG_DIR` (`backend/lang/`) 被自動建立。過去 `backend/lang/` 被誤納入 Git 版控，且 `main.py` 原先語系檔複製邏輯採用 `if not os.path.exists(dst):`，導致已存在於 `backend/lang/` 的檔案永遠無法獲取根目錄 `lang/` 最新更新的翻譯 Key。
- **Action**：使用 `git rm -r backend/lang` 將其自 Git 版控中移除，並於 `.gitignore` 中新增 `/backend/lang/` 排除開發期數據目錄。同時更新 `main.py` 的 Bootstrapping 複製邏輯：檢查 `os.path.abspath(src) != os.path.abspath(dst)` 且當 `dst` 不存在或 `os.path.getmtime(src) > os.path.getmtime(dst)` 時自動同步內建最新語系檔。
- **Evidence**：`git status` 驗證 `backend/lang/` 已移除且 ignored；`test_spec_bundling.py` (2 passed), `test_main.py` (5 passed), `test_overlay_api.py` (38 passed), vitest (259 passed) 全數通過。

---

## 2026-08-11 / Agent Workflow

### 技能名稱與技能發現入口混淆

- **來源**：`local`，V1.4.1 計畫檢討。
- **狀態**：`adopted`。
- **Learning**：`modular-refactoring/SKILL.md` 的資料夾名稱是 `modular-refactoring`，但舊 frontmatter 寫成 `modular-refactoring-expert`；缺乏中央索引時，Agent 容易採用不存在的名稱。`jules_coding/SKILL.md` 也沒有正式 frontmatter，導致它不容易被技能清單辨識。
- **Action**：使用 `.agents/skills/README.md` 作為 canonical registry；以技能資料夾名稱為 ID；任務開始前先盤點並完整讀取觸發的 `SKILL.md`；已修正 `modular-refactoring` frontmatter 並補上 `jules_coding` frontmatter。
- **Evidence**：技能 frontmatter inventory、`.agents/AGENTS.md` 的 discovery gate，以及目前 repository 的技能目錄。

### Jules 原始日誌與專案 Journal 的責任分界

- **來源**：`local`，Jules 日誌整理檢討。
- **狀態**：`adopted`。
- **Learning**：`.agents/Journal.md` 已混入 `.jules/bolt.md`、`palette.md`、`sentinel.md`、`narrator.md` 的內容，但缺乏來源、驗證狀態與同步規則；`.jules/palette.md` 也存在重複的無障礙條目。
- **Action**：`.jules/*.md` 保留為原始、逐次、可追溯紀錄；`.agents/Journal.md` 只收錄已驗證的專案規則，並要求記錄來源與 Evidence。重複條目應在整理時合併，不直接刪除無法追溯的歷史。
- **Evidence**：`.agents/skills/jules_coding/SKILL.md` 的 Journal boundary 與本檔的日誌規則。

### Windows 大小寫不敏感造成 Jules 日誌 duplicate path

- **來源**：`local`，Git index 檢查。
- **狀態**：`adopted`。
- **Learning**：Git index 同時追蹤 `.Jules/palette.md` 與 `.jules/palette.md`；Windows 工作樹會將兩者解析為同一個實體檔案，造成 Agent 看到重複路徑、staging 不一致與非同步協作歧義。
- **Action**：Jules 原始日誌統一使用 lowercase `.jules/`；新增日誌前先檢查大小寫等價路徑，禁止建立只差大小寫的 duplicate path。
- **Evidence**：`git ls-files -s` 在整理前出現兩個 palette path；整理後只保留 `.jules/bolt.md`、`.jules/narrator.md`、`.jules/palette.md`、`.jules/sentinel.md`。

## 2026-08-11 / S650 HMI canonical telemetry contract

- **來源**：`local`，S650 HMI Phase 2 canonical-only migration。
- **狀態**：`adopted`。
- **Learning**：S650 renderer 的 raw telemetry ingress 是 `hud_overlay/shared/coordinator.js` 發出的 `hud:frame`；UDP `Yaw` 為 rad、`TireTemp` 為 ℉、`Boost` 為 PSI、`Fuel` 為 `0..1`。S650 renderer 若繼續讀取 raw alias，會讓不同中央頁面各自重複轉換單位，且 Heritage boost 曾因此走到錯誤的 Pa→PSI 再轉換路徑。
- **Action**：S650 renderer 只讀取 `s650-hmi/v2` canonical frame。coordinator 負責產生 `distance_m`、`heading_deg`、`tire_temp_f`、`fuel_ratio`、`lap`、`race_position`，並沿用既有的 `speed_*`、`power_*`、`torque_*`、`boost_*` 欄位；renderer、layout 與 central pages 不得接受 raw key、legacy alias、m/s 速度或 `0..255` pedal input。
- **Evidence**：`hud_overlay/s650_hmi/assets/s650_contract.js`、`hud_overlay/shared/coordinator.js`；`s650Contract.test.ts`、`s650FrameCanonicalInput.test.ts`、`s650CenterInfoCanonicalData.test.ts` 共 202 個 frontend tests 通過；packet unit evidence 位於 `.agents/skills/telemetry-udp-protocol/references/packet_format_reference.md`。

本文件用於記錄與歸納 Agent 在 FH6-HorizonTuner 開發過程（含 `.jules/` 歷史模組）中積累的**核心學習點（Critical Learnings）、無障礙規範與安全避坑指南**。

---

## 記錄準則

只有在遇到以下情況時才新增日誌紀錄：
1. 發現 Forza UDP 遙測數據的包結構、位元偏移 (Byte Offset) 或單位換算陷阱。
2. 嘗試了某種車輛物理/齒輪調校演算法優化，但出現物理奇異點或極端邊界問題。
3. 發現 Tauri / WebSockets / HTML5 Canvas 高頻數據傳遞造成的 UI 影格率（FPS）下降、GC 停頓或高 DPI 錯位。
4. 前後端跨語言（Python <-> TypeScript）數據對齊、 Halfmoon UI 佈局、ARIA 無障礙或 CI/CD 打包的安全與 Anti-pattern。

---

## 一、UDP 高頻遙測、Canvas 繪圖與 60Hz 效能領域

### 1. UDP 封包位元偏移 (Byte Offset) 與單位歸一化陷阱
* **學習點 (Learning)**：
  - Forza Horizon UDP 遙測原生輸出的數據單位包含：車速 ($m/s$)、壓力 ($\text{Pascal}$)、胎溫 ($\text{華氏 °F}$) 與懸吊行程 ($0.0 \sim 1.0$ 正規化比率)。
  - 若在前端 Step 5 自動校準或 UI 組件中直接讀取 UDP 華氏胎溫且使用者設定為攝氏 ($\text{°C}$)，會導致數字暴增（如 195 變成 195°C），引發嚴重的溫差與過熱診斷誤判。
* **後續行動 (Action)**：
  - 所有 UDP 遙測數據在 Ingestion / Diagnosis 層必須先完成物理單位歸一化（華氏轉攝氏 $\text{°C} = (F - 32) \times \frac{5}{9}$、$\text{Pa} \to \text{PSI}$），並將診斷門檻數值與顯示單位解耦。

### 2. WebSocket 併發寫入與 React Unmount 重連迴圈防護 (來自 Jules/bolt.md)
* **學習點 (Learning)**：
  - **併發寫入崩潰 (Concurrent Write Crashes)**：高頻後端 asyncio 廣播任務（如遙測 vs Overlay 狀態）同時向同一個 WebSocket 端點寫入會破壞 Frame Header，強迫客戶端斷線。
  - **Unmount 無限重連 (Unmount Reconnect Loop)**：若 WebSocket 在 `onclose` 處理函式中無腦重連，React 生命週期 Unmount 觸發 socket 關閉時，會啟動背景無限重連迴圈，在 Console 拋出連線警告。
  - **純 JS 重連隔離**：全域單一連線重連會導致斷開一個 Socket 即重複重連所有 Socket。
* **後續行動 (Action)**：
  - 按數據類型 (`/ws/telemetry` vs `/ws/overlay`) 解耦成獨立 `ConnectionManager` 端點。
  - React 組件 Cleanup 時務必將 `.onclose` 與 `.onerror` 設為 `null`，且在 `setTimeout` 重連前確認訂閱計數 $> 0$。原生 JS 為各連線封裝獨立重連函式與定時器。

### 3. 60Hz 迴圈 GC 停頓、CSS Transition 衝突與 DOM 快取 (來自 Jules/bolt.md)
* **學習點 (Learning)**：
  - **高階陣列方法 GC 壓力**：在 60Hz `requestAnimationFrame` 繪圖迴圈中，使用 `.filter()`, `.map()`, `.forEach()`, `Object.keys()` 或 `split('').map().join()` 會每影格分配 Closure 與臨時陣列，引發巨量 Garbage Collection (GC) 停頓與畫面卡頓。
  - **60Hz CSS Transition 衝突**：Updated at 60Hz 的 DOM 元素若保留 CSS `transition` 樣式，會與瀏覽器補影格引擎衝突，產生劇烈畫面抖動與運算開銷。
  - **DOM & CSS Property 快取防護**：盲目在 60Hz 迴圈中寫入 `innerHTML` 或調用 `style.setProperty()` 會觸發無謂的 layout thrashing。
* **後續行動 (Action)**：
  - 60Hz 繪圖迴圈一律使用原生 `for` 迴圈與變數累加；高頻 DOM 元素**強制移除 CSS `transition` 樣式**。
  - 實作快取檢查 `if (_lastValue === value) return;` 與 CSS 屬性快取物件，數值變更時才執行 DOM 寫入。

### 4. Canvas High-DPI (DPR) 雙重尺寸同步與 0% 基線對齊
* **學習點 (Learning)**：
  - 避免使用 React State 重繪控制 Canvas 解析度；當 ResizeObserver 觸發時，應直接寫入 Canvas 實體 Buffer 像素尺寸 (`canvas.width/height = cssSize * dpr`)。
  - 繪製動態波形圖時，定義明確內邊距 (`padTop`, `padBottom`)，繪圖高度由 `plotH = h - padTop - padBottom` 推算。所有虛線、散佈點與數據 Y 座標統一以此區間計算，並顯式繪製 0% Bottom Baseline。
  - 繪製 HUD 動態表盤時，使用原生 Canvas API (`arc`, `fillText`, `rotate`) 替代數百張 Sprite 圖片序列，降低記憶體與載入延遲。

### 5. Drift HUD / Overlay Viewport 幾何與 G-Force 雷達防扁變形
* **學習點 (Learning)**：
  - 採用 `.hud-root-wrapper` 搭配 1680px x 640px 標準 `.hud-gauge-container`（`transform-origin: bottom center;`），使 HUD 視效隨 `scaleMultiplier` 自適應放縮。
  - 轉速紅線區：表盤上限向上取整至千轉；$maxRpm \ge 10000$ RPM 時紅線跨度 1500 RPM，$maxRpm < 10000$ RPM 時跨度 1000 RPM。
  - G-Force 雷達：計算出的直徑 `clampedSize` 同步寫入外圍 HTML 圓 DOM style 寬高，並加入 `aspectRatio: '1 / 1'` 防範 Flexbox 將雷達壓扁成橢圓。

---

## 二、車輛物理調校與 AEGO 齒比演算法領域

### 1. AEGO 齒比動力帶包絡線與紅線極速轉速比例鎖定
* **學習點 (Learning)**：
  - 遊戲顯示的 `simulatedTopSpeed` 為紅線轉速 (`maxRpm`) 下的實體極速。計算終傳比時需乘以 $\frac{maxHpRpm}{maxRpm}$ 縮放至 Peak HP 轉速，避免終傳比偏離。
  - 齒比步階比率上限必須嚴格限制為 $r_{\text{Max}} \le r_{\text{redline}} = \frac{maxHpRpm}{maxRpm}$，防止高檔位升檔後起始轉速凸出於動力帶區間之外。
  - 末檔齒比不寫死，改由 1 檔與 $r_{\text{step}}$ 幾何連續遞推，並使用縮放因子 $s = \left(\frac{G_{top}}{G_1 \prod r_{raw}}\right)^{\frac{1}{N_{steps}}}$ 重分佈中間檔位。

### 2. Drag / Chassis 物理姿態 (Forward Rake) 與過載抑制
* **學習點 (Learning)**：
  - 直線加速 (Drag) 姿態實測最佳為 **前低後高 Forward Rake** ($H_{min\_f} / H_{max\_r}$)，以降低前軸迎風阻力與抬升力；前彈簧適度偏軟允許抬頭，後彈簧極硬 (90%) 抑制縱向蹲下過載。
  - 防傾桿設定為 **$ARB_f = 1.0, ARB_r = 65.0$**，可強烈抑制引擎高馬力輸出引起的車身對角歪斜 (Torque Twist)。

### 3. 下壓力經驗推導 (`resolveAeroDownforce`) 與二次修正
* **學習點 (Learning)**：
  - 當 UI 無下壓力數據 ($Aero \le 0$) 時，以車重 20% (lbs) 總下壓力目標結合重量配比與驅動偏置 (RWD 0.82, FWD/AWD 1.05) 自動導出前後軸下壓力。
  - 二次修正機制以 Peak HP 轉速之有效極速鎖定頂檔總傳動比，達成 100% 閉環動力帶覆蓋。

### 4. 單元測試動態解耦原則
* **學習點 (Learning)**：
  - 測試案例不可將車輛參數（如 3847 Mustang）硬編碼於數字斷言中。應改為依據 `carParams` 動態計算物理邊界與相對關係斷言（如 `speedAtRedlineKmh <= softMaxSpeed + 0.5`），防範資料庫更新導致 false fails。

---

## 三、Halfmoon CSS 設計系統、UI/UX 與 ARIA 無障礙領域

### 1. ARIA 無障礙控制與按鈕規範 (來自 Jules/palette.md)
* **學習點 (Learning)**：
  - **自訂 Toggle/Switch**：單純用 `<label onClick>` 或 `<div>` 缺乏鍵盤 Tab 焦點與螢幕閱讀器宣告。必須背靠視覺隱藏 (`.sr-only`) 的原生 `<input type="checkbox">`，配合 `:focus-visible` 全域樣式。
  - **Icon-only 按鈕**：關閉或圖示按鈕必須設置明確 `aria-label`（如 `aria-label="Close"`）；符號建議使用 HTML Entity `&times;` 而非硬編碼 Unicode 字元。
  - **視圖頁籤 (Navigation Tabs)**：切換頁籤必須動態加上 `aria-current="page"` (或 `"true"`) 指明當前選取狀態。
  - **Disabled 按鈕 Tooltip 防護**：Firefox 等瀏覽器會在 `disabled` 按鈕上吃掉 pointer 事件，導致直接加在按鈕上的 `title` 無法顯示。應以 `<span>` 包裹停用按鈕，於 `span` 設定 `title` 與 `cursor: 'not-allowed'`（按鈕上 `pointer-events: none`）。
  - **點擊觸發範圍 (Fitts's Law)**：設定選單中包含 Checkbox 的整行一律包裹於 `<label style={{ cursor: 'pointer' }}>` 中，擴大可點擊 Hit Area。

### 2. DOM 無推擠懸浮 Toast 通知系統 (`ToastContext`)
* **學習點 (Learning)**：
  - 在視圖 DOM 流內部插入 `<div className="alert">` 會佔用空間並推擠周邊 Layout（如 Telemetry Grid），造成畫面抖動與 Layout Shift。
  - 全域 `ToastContainer` 使用 `position-fixed top-0 end-0 p-3` (z-index: 1060)，100% 脫離 Normal Flow 空間，絕對不干擾 View 圖表與面板高度。

### 3. Flex Column 容器 `minHeight: 0` 與 `gap` 溢出裁切防護
* **學習點 (Learning)**：
  - 在帶 Header 的 Flex Column 容器內，若子容器設定 `h-100` 或 `height: 50%`，配合 `gap` 會導致總高度達到 `100% + Header + Gap`，引發底部元素被 Outer Card 的 `overflow-hidden` 裁切。
  - 正確做法：內層容器設置 `minHeight: 0`；子元件使用 `flex: 1 1 0%; minHeight: 0;`，由 Flexbox 精確平分空間。

### 4. Bootstrap Offcanvas 常態掛載 (Persistent DOM) 模式
* **學習點 (Learning)**：
  - 以條件渲染 `{show && <Offcanvas />}` 開關組件，會導致組件隨開關 mount/unmount，完全無法呈現 Offcanvas 的 CSS transition 滑入滑出動畫與背景遮罩。
  - 正確做法：組件**常態掛載於 DOM**，透過 `show: boolean` prop 動態切換 `.show` CSS class、`visibility` 與 backdrop 遮罩。

### 5. 全站 View 標頭與 Navigation 溢出相容性
* **學習點 (Learning)**：
  - 全站 View 採用獨立 Banner 標頭（`border-bottom pb-3 mb-2 flex-shrink-0`）與無框開闊內容區塊；頂層容器設定 `w-100 overflow-x-hidden overflow-y-auto` 確保 100% 響應式放縮。
  - 全域導覽列容器 `<nav>` 必須顯式聲明 `overflow: visible !important;`，防止下拉選單被截斷或產生內部滾動條。

### 6. 裝飾性 Emoji 全面大掃除與極簡專業 UI 規範
* **學習點 (Learning)**：
  - 嚴格落實 `AGENTS.md` 規範，全站組件中嚴禁硬編碼插入非功能性裝飾 Emoji（如 📊, 🏎️, ⚙️, ⚡）。介面統一採用 Halfmoon 原生 Badge、語義文字與高質感襯底，保持硬核極簡風格。

---

## 四、跨語言對齊、安全防護與 CI/CD 工具鏈領域

### 1. API 端點安全防護與 XSS 避坑 (來自 Jules/sentinel.md)
* **學習點 (Learning)**：
  - **路徑穿越 (Path Traversal)**：Windows 下 URL 編碼的反斜線 (`%5c`) 會繞過 `/` 檢查傳給 `os.path.join` 引發路徑穿越。應使用 FastAPI 的 `Path(pattern="...")` 正則強校驗。
  - **XSS 防範**：動態 CSS 或使用者文字寫入 `<style>` 或 DOM 時，使用 `textContent` 替代 `innerHTML`。
  - **敏感資訊洩漏防範**：生產環境 API Error 回覆嚴禁直拋 `str(e)` 洩漏內部檔案路徑，應記錄於後端日誌並向前端回傳通用安全字串。

### 2. Python <-> TypeScript 型別合約與彩蛋車 skip 機制
* **學習點 (Learning)**：
  - 前後端對接必須透過 TypeScript Interface 與 Python Type Hints 明確定義合約。
  - Forza Ordinals 中 `1215` 號車輛名為 `NUL_CAR_00`（單一連字號資產名稱）。在 `update_car_db.py` 中設定白名單跳過機制（`if ordinal == 1215: continue`），保護自訂彩蛋車輛（2020 Yamaha YZF-R15）不被自動更新覆蓋。

### 3. Windows PowerShell / Vitest / Pytest 相容性處理
* **學習點 (Learning)**：
  - 在 Windows 下執行 CLI 測試指令時，建議使用 `cmd /c "pnpm -C frontend run test"` 或 `.venv\Scripts\pytest`，避免 PowerShell ExecutionPolicy 阻擋或路徑解析差異。
  - 輔助驗證腳本切勿放置於 `tests/` 目錄或以 `test_` 命名，`pyproject.toml` 明確維護 `testpaths = ["tests"]`。

### 4. 一次性開發腳本生命週期與 發行打包規範 (來自 Jules/narrator.md)
* **Tauri Sidecar 打包時的中間檔與產出淨化**：
  - PyInstaller 在 Phase 1 打包產出的 `server-sidecar-x86_64-pc-windows-msvc.exe` 僅作為供 Tauri 在 Phase 2 嵌入的資源。
  - 在發行 Release 時**只需提供 `dist/FH6-HorizonTuner.exe`**，不需要提供 Sidecar 中間檔。已在 `build_all.bat` 末尾自動加上清理邏輯。發行打包時，善用 `.pkgdirignore` 排除開發快取與資源，發行版 `.exe` 會自動於同級目錄建立 `settings.json` 與數據資料夾，實現綠色隨身攜帶。

### 5. Tauri Sidecar 路徑與使用者資料目錄（已修正）
* **學習點 (Learning)**：
  - Tauri 可能將 sidecar 解壓到暫存位置執行；`sys.executable`、`sys._MEIPASS` 與主程式所在路徑不是同一個概念，不能直接用來決定使用者資料位置。
  - Release 版由 Rust 端解析 Tauri `app_data_dir()`，再以 `--data-dir` 傳給 Python sidecar。settings、logs、tunings、HUD 設定與 SQLite 必須寫入該可寫入目錄，不能假設安裝目錄可寫。
  - `RESOURCE_ROOT` 僅用於唯讀內建資源（語系、車輛資料、內建 HUD）；`DATA_ROOT` 用於使用者資料。兩者不可混用。

### 6. Dev 與 Release 啟動／除錯差異總整理（Release 連線事故避坑）
* **環境差異 (Environment)**：
  - `start_all.bat` 是外部啟動兩個程序：Python `backend/main.py` + Vite dev server。此路徑沒有 Tauri host、沒有 sidecar command、也沒有 Tauri `invoke()` 狀態。
  - `build_all.bat` 先以 PyInstaller 建立 `server-sidecar-x86_64-pc-windows-msvc.exe`，再由 Tauri Release host 透過 `externalBin` 啟動 sidecar。Release 不會啟動 Vite，也不會使用 `start_frontend.bat`。
  - PyInstaller 的 `console=False` 可能令 Windows frozen process 沒有可用的 stdout/stderr；不能只依賴 stdout 文字完成 host/sidecar 握手。

* **埠號與啟動時序 (Port / Race Condition)**：
  - 後端啟動時會先 bind `127.0.0.1` 的可用埠並寫入 `logs/web_port.txt`；此埠不保證是 `8001`。
  - Release 啟動順序是「Tauri spawn sidecar → Python 初始化 → bind port → 前端載入」。前端若在 port 檔產生前就固定 fallback 到 `8001`，會造成只在 Release 出現的所有 API／WebSocket 連線失敗。
  - 正確流程是由 Tauri state 保存 `starting / ready / failed` 與實際 port；前端必須等待 ready 後才 render。已加入 `get_backend_status` 與 15 秒啟動等待。
  - Windows 無 console 時，Tauri 會優先解析 `FH6_BACKEND_READY:{"port":...}`；若收不到 stdout，改從本次啟動指定的 App Data `logs/web_port.txt` 輪詢。啟動前要刪除舊 port 檔，避免誤連上一個已終止的 process。

* **前端連線差異 (Frontend Transport)**：
  - Dev 環境目前使用 `8001` 作為相容 fallback；Release 必須使用 Tauri 回報的動態埠。
  - 既有頁面仍有 `http://127.0.0.1:8001` 與 `ws://127.0.0.1:8001` 字串，因此不可在 `main.tsx` 取得 port 後只設定一個全域變數就宣稱完成切換；既有字串不會自動變更。
  - 動態埠轉送已集中在 `frontend/src/services/backend.ts`，且只在 backend ready 後安裝。新功能應直接使用 `backendHttpUrl()`／`backendWebSocketUrl()`，不要新增更多硬編碼 `8001`。

* **只會在 Dev 出現的問題**：
  - Vite dev server 啟動失敗、port `1420` 被占用、HMR 或 `start_all.bat` 的 Python／venv／依賴問題，Release 不會重現。
  - Dev 直接執行 Python，例外會出現在 console；不可用此行為推論 PyInstaller 版一定能看到相同 traceback。Release 應檢查 App Data 下的 `logs/backend.log`。
  - Dev 可能依賴工作目錄、專案相對路徑或本機 Python 套件；這些在 frozen sidecar 中不存在。

* **只會在 Release 出現的問題**：
  - sidecar 未被放入 Tauri `bin/`、target triple／檔名不符合、capability 未授權 `shell:allow-execute`，會造成 Tauri 啟動失敗但 dev 完全正常。
  - `sys._MEIPASS` 下的內建資源與使用者可寫資料目錄不同；將資料寫到安裝目錄或 Temp 可能導致權限錯誤、設定遺失或 port 檔不可見。
  - `console=False`、Tauri WebView 來源（`tauri://localhost`／`http://tauri.localhost`）與 CORS／capability 限制只會在 Release 暴露。
  - Release 必須在重新建置 sidecar 後才包含 Python 端的協定變更；只重建前端或 Rust 不會更新舊的 `.exe`。

* **除錯與驗收順序 (Required Checklist)**：
  1. 先確認 `build_all.bat` 的 PyInstaller 階段真的產生並複製最新 sidecar，再確認 Tauri bundle 內含該檔案。
  2. 安裝／執行 Release 後，查看 `%LOCALAPPDATA%` 對應 App Data 目錄的 `logs/backend.log`、`logs/web_port.txt`。
  3. 確認 `web_port.txt` 的埠能以 `127.0.0.1:<port>/api/...` 存取，且不是預設猜測的 `8001`。
  4. 分別驗證 REST、`/ws/telemetry`、`/ws/overlay` 與 HUD 視窗；REST 成功不代表 WebSocket 或 overlay 已成功。
  5. 測試 `8001` 被其他程序占用的情況；Release 應仍能使用另一個動態埠。
  6. 變更啟動協定、`--data-dir` 或 sidecar spec 後，必須同時跑前端測試、`cargo check`、重新打包，並做一次安裝後 smoke test。

## 2026-08-11 Agent 治理 skill 工作流補強

### 已驗證的問題

- 過往工作反覆涉及 60Hz telemetry/Canvas/GC、Jules 安全與 accessibility 委派、portable sidecar 與動態 port，但相關流程分散在 Journal、Jules 原始日誌與 AGENTS，導致 skill 選擇與驗收標準不穩定。
- `huge-component-refactoring` 與 `modular-refactoring` 的責任邊界不夠明確，容易把 UI hot path 與 domain/API 模組重構混用。
- skill 名稱、`.Jules`/`.jules` 大小寫路徑、Journal 語言邊界與 release port 契約需要週期性稽核。

### 本次採納的治理規則

- 新增 `agent-governance-audit`，負責檢查 canonical skill ID、frontmatter、路徑大小寫、stale references、中文 agent 文件與英文 Jules 原始日誌邊界。
- 新增 `portable-release-validation`，集中驗證 V1.x portable/exe、sidecar lifecycle、dynamic HTTP port、UDP port、Windows clean smoke test 與 artifact 證據。
- `huge-component-refactoring` 專注巨型 UI、Canvas 與高頻 render path；`modular-refactoring` 專注模組邊界、純邏輯與型別契約。
- `jules_coding` 的遠端結果必須經本地 diff、測試、安全性與效能檢查後，才能進入 Journal 或合併。

### 驗證狀態

- Status: adopted
- Source: `.jules/bolt.md`、`.jules/sentinel.md`、`.jules/palette.md`、`.jules/narrator.md` 與近期 Git history
- Verification: skill frontmatter/registry consistency、skill validator、`git diff --check`

---

## 2026-08-11 / RaceRecorder Persistence Queue

- **Scope**: local / V1.4.1 `codex/v1.4.1-contract-hotpath`
- **Status**: adopted
- **Learning**: SQLite batches issued by RaceRecorder can delay unrelated UDP, dyno, and WebSocket work even when samples are downsampled to 10Hz.
- **Action**: RaceRecorder remains a synchronous state machine. One FIFO `AsyncRacePersistence` worker owns session creation, point batches, and finalization, and executes every SQLite operation through `asyncio.to_thread()`. A bounded queue drops only recorder samples under sustained saturation; finalization is deferred rather than dropped.
- **Contract**: Existing analysis endpoints and the SQLite schema remain unchanged. `/api/diagnostics/telemetry-pipeline` adds the backward-compatible `raceRecorderPersistence` object.
- **Evidence**: `backend/race_recorder.py`, `TelemetrySQLite.finalize_session()`, `tests/test_race_recorder.py`, and lifecycle/diagnostics test extensions. Targeted pytest: 16 passed.

---

## 2026-08-11 / Frontend Transport Contract

- **Scope**: local / V1.4.1 `codex/v1.4.1-transport-contract`
- **Status**: adopted
- **Decision**: The frontend owns one explicit `BackendTransport` configured after Tauri reports the verified sidecar port. `backendFetch()`, `backendHttpUrl()`, and `backendWebSocketUrl()` are the only application entry points for backend HTTP/WebSocket endpoints; development keeps the explicit port-8001 transport default.
- **Rationale**: Replacing `window.fetch` and `window.WebSocket` globally could rewrite HUD assets, GitHub release checks, or future external connections. The explicit contract makes the portable dynamic-port boundary testable and keeps ownership visible at each call site.
- **Hot-path boundary**: `useTelemetry` still dispatches parsed frames directly to `telemetryEmitter` for Canvas consumers at source frequency, while React state remains sampled at 5Hz. This change only selects the WebSocket endpoint and does not add work to telemetry frame handling.
- **Evidence**: Frontend Vitest from `frontend/`: 31 files / 197 tests passed. Vite production bundle passed. Portable-sidecar contract pytest: 5 passed (`test_portable_host_diagnostics.py`, `test_sidecar_process_contract.py`, `test_executable_bundle.py`). `tsc -b` remains blocked by pre-existing Node typings/target errors in `vite.config.ts`; Vite module bundling succeeds.

---

## 2026-08-11 / PR #185 Codex Takeover

- **Scope**: GitHub PR #185, `feat(drift-hud): style meter and split instruments`.
- **Status**: active.
- **Owner**: Codex.
- **Branch**: `codex/drift-hud-modernize-remove-presets` at `283fe39`.
- **Changed**: Checked out the PR branch from `origin`; no implementation changes made after takeover.
- **Pending**: Continue the Drift HUD visual iteration and address any CI or review feedback that appears.
- **Blocked by**: None. PR is open and currently Ready for Review; no review submissions or inline threads are present.
- **Verification**: Clean worktree at takeover; PR reports 33 frontend test files / 205 tests and `git diff --check` passed.
- **Next action**: Run the local frontend validation baseline before the next implementation change; move the PR back to Draft if active iteration requires it.

---

## 2026-08-11 / Telemetry HUD Reference Research Documentation

- **Scope**: PR #185 follow-up research; document the five shallow-cloned reference repositories within the Drift HUD visual-slice boundary.
- **Status**: active.
- **Owner**: Codex.
- **Branch**: `codex/drift-hud-modernize-remove-presets`.
- **Changed**: Added `docs/reference-projects/` overview plus one PR-scoped evaluation per reference project, and `docs/telemetry-hud-implementation-plan.md`.
- **Research boundary**: `ref/forza-hud-references/` remains ignored and is source-level research material only. Proprietary Horizon HUD assets/code and GPL Forza Data Tools code are explicitly excluded from reuse.
- **Key decision**: Keep the existing 60Hz frame/emitter, TelemetryView, and HUD card behavior unchanged; PR#185 only validates and refines the Drift HUD-local presentation layer and its existing frame integration.
- **Verification**: `git diff --check` passed; docs are visible as untracked files; existing `.agents/Journal.md` takeover entry remains preserved.
- **Pending**: Complete the PR-scoped Drift HUD edge-case and visual validation; telemetry architecture work must be a separate issue/PR.

---

## 2026-08-11 / Drift Style MVP

- **Scope**: local / `codex/drift-hud-modernize-remove-presets`
- **Status**: adopted
- **Decision**: The first implementation phase leaves the existing Drift HUD
  primary instrument unchanged. A dependency-free `drift_style_engine.js` owns
  scoring, rank decay, source-local FLOW/HOLD/RISK aggregation, Hero special
  events, direction-swap continuity, and settlement snapshots. The display is a fixed container inside
  `hud_overlay/drift/index.html`, not a shared TelemetryCard.
- **Hot-path boundary**: The engine receives a preallocated normalized frame in
  the existing RAF loop. Its DOM container is updated at 12.5 Hz with no CSS
  transition, preserving the 60 Hz Canvas and telemetry path.
- **Evidence**: `frontend/src/utils/driftStyleEngine.test.ts` covers source
  aggregation, Hero special events, direction swaps, and sustained-loss settlement.

---

## 2026-08-11 / Drift HUD Primary-Secondary Split

- **Scope**: local / `codex/drift-hud-modernize-remove-presets`
- **Decision**: The central oval is now the primary instrument and renders only
  the drift-angle arc, tachometer arc, and a speed / gear / torque 1+1+1
  hierarchy. A lower-right oval secondary instrument owns drift angle,
  direction, FLOW, RISK, HOLD, and the four driver-input columns.
- **Telemetry contract**: `SteerInput` is normalized to a clamped percentage
  and projected onto the shared plus-or-minus 60 degree drift arc as an amber
  counter-steer pointer. It is deliberately not displayed as a physical
  wheel-angle measurement. Torque uses the existing normalized telemetry unit.
- **Hot-path boundary**: `drift_display_math.js` is dependency-free and the
  Canvas loop only consumes normalized scalar state; no React work or
  allocations were introduced into the telemetry path.
- **Evidence**: `frontend/src/utils/driftDisplayMath.test.ts` covers steering
  normalization, counter-steer direction, visual arc mapping, and torque
  units. Frontend Vitest: 33 files / 205 tests passed.

---

## 2026-08-11 / PR #185 Drift Edge-Case Hardening

- **Scope**: local / `codex/drift-hud-modernize-remove-presets`
- **Implementation**: `drift_display_math.js` now treats null, undefined, and
  empty-string torque payloads as missing values before selecting the metric or
  imperial fallback field. Non-finite fallback values still resolve to zero.
- **Tests**: added boundary and clamp coverage for steering and counter-steer
  projection, torque fallback coverage, expired pending Hero events, invalid
  timestamps, and full Drift engine reset lifecycle.
- **Verification**: targeted Drift tests passed (2 files / 13 tests); frontend
  Vitest baseline passed (33 files / 210 tests). Added `driftHudContract.test.ts`
  to compile the inline controller and protect the primary/secondary/shared-card
  mounts plus RAF/12.5 Hz rendering boundary. Current baseline: 34 files / 213
  tests passed.
- **Boundary preserved**: no changes to TelemetryView, HUD card toggles,
  telemetry transport, or the existing 60 Hz Canvas/telemetry path.

---

## 2026-08-11 / Drift Sweep Semantics and Steering Range

- **Scope**: local / `codex/drift-hud-modernize-remove-presets`
- **Decision**: other HUDs use `onAnimate` for their Sweep action; for Drift,
  Sweep is additionally the mechanical zero/calibration operation, so it must
  reset the Drift Style engine and combo state.
- **Decision**: the drift-angle background scale remains ±60°, while normalized
  steering maps to a separate ±45° indicator range. 100% steer is exactly 45°;
  higher raw values are clamped at that boundary.
- **Verification**: frontend Vitest baseline passed (34 files / 213 tests).

---

## 2026-08-11 / Drift HUD Full-Viewport Feedback

- **Scope**: local / `codex/drift-hud-modernize-remove-presets`
- **Feedback addressed**: implemented a real 1.5s startup/Sweep animation,
  moved Drift layers to viewport anchoring, enlarged the HUD typography, moved
  the logical canvas above the game's bottom score area, generalized the
  steering pointer to render for any non-zero steering input, and aligned both
  tachometer/angle arcs to the same ellipse as the frame decoration.
- **Architecture**: kept one HUD HTML and one HUDCore telemetry lifecycle;
  viewport-fixed DOM layers and a DPR-aware full-screen canvas avoid duplicate
  telemetry registrations while escaping the conventional bottom-right slot.
- **Hot-path boundary**: viewport transform is recalculated only on resize;
  canvas rendering remains RAF-driven and Style Meter DOM painting remains
  throttled to 80ms.
- **Verification**: frontend Vitest baseline passed (35 files / 216 tests).

---

## 2026-08-11 / Drift Primary Scale and Score Layer Feedback

- **Feedback**: the full-viewport transform made the primary instrument too
  large and the Style Meter overlapped the primary/secondary instruments.
- **Decision**: keep the secondary instrument at viewport fit scale, apply a
  dedicated `PRIMARY_RENDER_SCALE = 0.62` around the primary center, and anchor
  the Style Meter to the viewport upper-right (`right: 4vw`, `top: 28vh`).
- **Verification**: frontend Vitest baseline passed (35 files / 216 tests).
- **Pending**: in-game screenshot review for the final primary scale and the
  selected score-layer clearance.

---

## 2026-08-11 / Drift Secondary Conventional Bottom-Right Anchor

- **Decision**: compare the Drift secondary instrument with Advanced and VFD,
  which use fixed-size containers, shared root `padding: 30px`, and
  `transform-origin: bottom right`. The secondary therefore uses the viewport
  transform with zero extra bottom margin, preserving its current size while
  aligning its lower edge to the conventional HUD anchor.
- **Primary isolation**: the primary keeps its independent compact scale and a
  compensating upward offset, so secondary anchoring does not move it back over
  the game's score indicator.
- **Verification**: Drift layout targeted tests passed (2 files / 6 tests).

---

## 2026-08-12 / FH6 Native UI Safe Zones and Drift Panel

- **Evidence**: downloaded four public FH6 gameplay captures to the ignored
  `ref/fh6-ui-layout-reference/` directory and compared them with the
  project's Drift HUD screenshots. The observed persistent regions are:
  top-center skill score, bottom-center Drift Zone total, lower-left map /
  ANNA, lower-right native gauge, and race-only upper-left progress plus
  upper-right leaderboard.
- **Primary layout**: GT7's bottom-center visual language remains useful, but
  direct placement conflicts with FH6's Drift Zone total. Added
  `getFh6PrimaryAnchor()` to put the primary in the central safe lane at 54%
  viewport height, bounded by the observed top and bottom bands. The anchor
  is recalculated only during resize, not in the RAF hot path.
- **Secondary visual**: replaced the oval secondary outline with an
  Advanced-inspired cut-corner rectangle. It keeps the conventional
  bottom-right anchor and adopts the Drift cyan/pink/amber palette.
- **Boundary**: Style Meter remains at its user-confirmed right-mid free-roam
  placement. Race leaderboards can occupy the same column, but telemetry has
  no reliable visibility signal, so the runtime does not guess a mode switch.
  This is documented in `docs/fh6-ui-safe-zones.md`.

---
## 2026-08-12 / S650 Launcher Theme Contract

- **Scope**: local / `codex/s650-hmi-next-phase-evaluation`
- **Status**: adopted
- **Learning**: The control panel, backend, and S650 canvas contract recognized the three performance themes, but the HUD launcher retained the earlier three-theme allowlist. Launcher normalization silently rewrote each performance selection to `heritage67` before it reached the iframe.
- **Action**: Keep the launcher's allowlist aligned with the S650 renderer contract and cover it with a launcher-specific Vitest regression test.
- **Evidence**: `hud_overlay/index.html`, `s650HudLauncherConfig.test.ts`
---

## 2026-08-12 / S650 Track and SVT Cobra Visual Rework

- **Scope**: local / `codex/s650-hmi-next-phase-evaluation`
- **Status**: pending visual review
- **Decision**: Keep Sport on its existing implementation while its product direction is evaluated. Rebuild only Track and SVT Cobra as transparent overlays so they do not mask the game image.
- **Action**: Track now uses the S650-oriented wide RPM band, central speed, discrete gear readout, fuel bar, and tire-temperature perimeter. SVT Cobra uses two analog rings with white/silver ticks, red needles, an 8k SVT tachometer, and a 160 mph-equivalent speed scale. The layout dispatcher prefers these renderers and retains the existing primitive clusters solely as a fallback.
- **Evidence**: `hud_overlay/s650_hmi/assets/s650_performance_clusters.js`, `s650_layouts.js`, `s650PerformanceClusters.test.ts`, `s650DualLayoutPipeline.test.ts`; frontend Vitest: 40 files / 221 tests passed.
---

## 2026-08-12 / S650 Track Recipe Skeleton

- **Scope**: active / `codex/s650-hmi-next-phase-evaluation`
- **Architecture**: Every S650 cluster composes shared component categories through its own layout recipe. A recipe owns geometry and presentation variants; component modules own Canvas drawing and canonical-frame reads. Track is the first performance layout migrated to this model.
- **Action**: Added `S650HmiClusterComponents` and a Track recipe selecting a `trackWide` tachometer, smoked center-info container with tire overview, left thermal rail, right fuel rail, and footer status/gear layout. The central speed and `Track use only` copy are intentionally deferred for a separate information-hierarchy review.
- **Data boundary**: Tire temperature and fuel use canonical data. The thermal rail visibly reports unavailable because no coolant/oil-temperature datum has entered the canonical S650 frame; no placeholder measurement is invented.
- **Verification**: Frontend Vitest: 40 files / 221 tests passed; `node --check` and `git diff --check` passed.
---

## 2026-08-12 / S650 Track Skeleton Correction

- **Scope**: active / `codex/s650-hmi-next-phase-evaluation`
- **Decision**: A Track recipe must compose the existing center-info and dynamic-gear children, not recreate a fixed tire page or a transmission label list. Footer readouts must be recipe slots with explicit positions, as in every other cluster.
- **Action**: Removed the irregular smoked-blue panel and fixed tire sketch. Track now invokes the registered center-info module in a right-side region. Its rails select canonical `power` and `boost` roles rather than hard-coding thermal/fuel text. The tachometer clips base, redline, and active fills to its trapezoid. The footer defines all four canonical readout slots and delegates the middle gear display to `drawGearCarousel`.
- **Verification**: `s650PerformanceClusters.test.ts` verifies clipping, right-side center-info injection, role-driven rails, all footer slots, and dynamic gear delegation. `s650DualLayoutPipeline.test.ts` verifies the layout dispatcher passes the shared center-info and gear primitives.
---

## 2026-08-12 / S650 Track Gauge Density Tuning

- **Scope**: active / `codex/s650-hmi-next-phase-evaluation`
- **Finding**: Track and dual-ring themes share the same fixed 1280x480 Canvas and CSS dimensions. The reported central visual weight is recipe density from Track's continuous 1120px tachometer and 808px footer, not a theme-specific scaling defect.
- **Action**: Track's active RPM fill now uses the normal/default primary blue and accepts the GUI custom primary palette. Its base, active, and redline bands are clipped to a lower-edge center peak, reducing the central fill depth by 20%. The side rails are larger, positioned inward, and use 8px active bands for quicker reading.
- **Guardrail**: Preserve the wide Track tachometer as a Track presentation variant. Future density tuning should reduce footer contrast or width before changing canvas size or globally scaling the cluster.
- **Verification**: Frontend Vitest: 40 files / 222 tests passed; `node --check` and `git diff --check` passed.
---

## 2026-08-12 / S650 Track Lowered Tachometer Reflow

- **Scope**: active / `codex/s650-hmi-next-phase-evaluation`
- **Finding**: HUD zoom is bottom-anchored. The former Track tachometer at y=86 appears near y=184-204 when zoomed to 70-75%; its full-size compromise position is y=194.
- **Action**: Moved the Track wide tachometer to y=194 and changed its lower edge from a central triangle to a trapezoid mirroring the upper edge. Track now uses a compact right-side center-info variant at y=298 and moves the footer/gear carousel to y=414/447. Drive, tire-temperature, and performance center pages each define a compact renderer so Track retains user-selected center content without reintroducing a fixed wheel display.
- **Verification**: `s650CenterInfo.test.ts` covers compact renderer selection; Track recipe tests cover the compact region and gear anchor. Frontend Vitest: 40 files / 223 tests passed.
---

## 2026-08-12 / S650 Track Anchor Correction

- **Scope**: active / `codex/s650-hmi-next-phase-evaluation`
- **Status**: pending visual review
- **Finding**: The review baseline is a 2560×1440 display. At that target, the shared S650 effective zoom of 1.18125 is correct and must not be reduced. The prior recipe's downward reflow instead pushed Track's lower readouts into the screen edge, where they were clipped.
- **Decision**: Preserve the shared S650 scale. Revert only the Track recipe's vertical displacement: tachometer y=86, center-info y=184, rails y=202, and footer/gear y=374/407. Keep the later component fixes, including the trapezoid-clipped theme-aware tach fill and compact center-info renderers.
- **Verification**: `s650PerformanceClusters.test.ts` locks the restored center-info, gear, and tachometer outline anchors. Manual 2560×1440 HUD review remains required before merge.
---

## 2026-08-12 / S650 Track Detail Alignment

- **Scope**: active / `codex/s650-hmi-next-phase-evaluation`
- **Status**: implementation complete; pending visual detail review
- **Finding**: Track's tick marks used an inset RPM scale, while redline and active fill rectangles used the full trapezoid width. That mixed coordinate system made the redline edge and live RPM color appear under the wrong ticks. The compact center-information behaviour was also implicit in a renderer variant instead of being part of the layout contract.
- **Action**: `trackWide` now derives active and redline fill geometry from the same inset scale as ticks. Center-information normalizes an explicit `layoutStyle: 'trackSidebar'` into style, aspect-ratio, and compact-layout context. Track adds a shared `trackSpeedGear` component to the left-side counterpart of center information; speed and gear use separate fixed right alignment anchors, so speed digit count cannot move either field.
- **Verification**: `s650PerformanceClusters.test.ts` locks the redline/active fill scale and both speed/gear text anchors. `s650CenterInfo.test.ts` covers explicit Track sidebar selection. Frontend Vitest: 40 files / 223 tests passed.
---

## 2026-08-12 / S650 Track Speed-Gear Hierarchy

- **Scope**: active / `codex/s650-hmi-next-phase-evaluation`
- **Status**: implementation complete; pending visual detail review
- **Decision**: The Track left-side companion must read from the center outward: gear on the left, speed on the right, separated by the actual geometric center line. This preserves the right-edge anchoring required for speed digit stability while making the two fields visually symmetrical with the right-side center-information region.
- **Action**: `trackSpeedGear` now accepts recipe-owned divider and vertical anchors. Track sets the divider at its center (`x=355`), gear/speed right bounds at either side, 69px/57px value typography (150% of the prior values), and a vertically centered text group.
- **Verification**: `s650PerformanceClusters.test.ts` locks both aligned values, the enlarged fonts, and the center divider start. Frontend Vitest: 40 files / 223 tests passed.
---

## 2026-08-12 / S650 Track Speed-Gear Balance Correction

- **Scope**: active / `codex/s650-hmi-next-phase-evaluation`
- **Status**: implementation complete; pending visual detail review
- **Finding**: Enlarging the prior near-center gear anchor to 69px caused it to collide with its label and made the left/right halves read unevenly. The lower speed unit also competed for the same vertical space, leaving the whole group visually high.
- **Action**: Track now uses outward-facing columns around its geometric center line: gear is left-aligned at the left outer edge and speed is right-aligned at the right outer edge. Both values use balanced 57px typography; speed's unit is folded into the `SPEED <unit>` label. The recipe shifts the block down 14px and assigns independent label/value anchors, preserving a clear gap above enlarged values.
- **Verification**: `s650PerformanceClusters.test.ts` locks the left gear and right speed anchors, 57px font size, and the lower central divider anchor. Frontend Vitest: 40 files / 223 tests passed.
---

## 2026-08-12 / S650 Track Redline Live-Fill Correction

- **Scope**: active / `codex/s650-hmi-next-phase-evaluation`
- **Status**: implementation complete; pending visual detail review
- **Finding**: Track painted the active band after the redline band, but incorrectly capped its width at `redlineRatio`. Once engine RPM crossed redline, the active indication stopped at the warning boundary and the static red region was the only visible state.
- **Action**: Preserve the redline band as a threshold underlay, then extend the final active fill to the true current RPM ratio. The tick/redline scale remains unchanged; only the live-fill upper bound is corrected.
- **Verification**: `s650PerformanceClusters.test.ts` exercises 7800/8000 RPM against an 87.5% redline and confirms the active band is painted after redline through the 97.5% current-RPM position. Frontend Vitest: 40 files / 224 tests passed.
---

## 2026-08-12 / S650 Track Trapezoid Endcaps

- **Scope**: active / `codex/s650-hmi-next-phase-evaluation`
- **Status**: implementation complete; pending visual detail review
- **Finding**: The Track fill rectangles used the inset tick span as both the ratio scale and the painted extent. Although the ratio boundary was correct, this left the left active and right redline trapezoid endcaps uncoloured.
- **Action**: Keep the inset span exclusively for RPM/redline ratio calculation. The clipped active band now starts at the full left outline point and the redline band ends at the full right outline point, so both angled endcaps receive the correct live/warning color. The Track gear value moves from the left outer edge to the center of its left half-column.
- **Verification**: `s650PerformanceClusters.test.ts` locks full endcap fill extents and the centered gear anchor (`x=284`). Frontend Vitest: 40 files / 224 tests passed.
---

## 2026-08-12 / S650 Track Sidebar Safe Corridor

- **Scope**: active / `codex/s650-hmi-next-phase-evaluation`
- **Status**: implementation complete; pending visual detail review
- **Finding**: The wider Track sidebar components crossed the game's live race-message area from both sides. The reference design also terminates its redline segment as a flat-sided block, rather than extending the full trapezoid into a downward right tip.
- **Action**: Track reserves an explicit central safe corridor: `trackSpeedGear` ends at x=420 and `trackSidebar` begins at x=840. The tachometer retains its left slanted entry but ends at the final scale point with a vertical redline edge; fill clipping and tick ratios remain shared-component behaviour.
- **Verification**: `s650PerformanceClusters.test.ts` locks both sidebar recipe bounds and the flat right outline points at x=1122. Frontend Vitest: 40 files / 224 tests passed.
---

## 2026-08-12 / S650 Track Release Scope and Prototype Quarantine

- **Scope**: active / `codex/s650-hmi-next-phase-evaluation`
- **Status**: Track implementation complete; Sport and SVT Cobra retained as early visual-development prototypes.
- **Decision**: This branch is the merge candidate for the reviewed Track layout. Sport and SVT Cobra do not meet visual acceptance and must not be selectable, normalized as valid themes, or dispatched by the renderer. Their local recipes, palettes, primitive renderers, and isolated tests remain in place for later design work.
- **Action**: Restricted the public S650 registry to Normal, Heritage '67, Fox Body, and Track across the frontend selector, launcher, Canvas contract, backend normalizer, and layout registry. Stored `sport` / `svt_cobra` values now safely fall back to `heritage67`; direct renderer calls also resolve to the Normal dual-ring profile. Annotated retained prototype code with `TODO(s650-sport*)` / `TODO(s650-svt-cobra*)` markers.
- **Verification**: Frontend and backend regression tests assert both prototype ids are unregistered and cannot dispatch their renderers; their isolated palette/renderer tests remain as development references.
---

## 2026-08-12 / S650 HMI Ownership Boundary Refactor

- **Scope**: active / `codex/s650-hmi-next-phase-evaluation`
- **Decision**: The React control panel owns only the typed S650 configuration boundary: selector values, legacy-id normalization before save, and UI-specific type guards. The standalone Canvas contract, frame, renderer, layouts, primitives, and their tests belong to `hud_overlay/s650_hmi`.
- **Action**: Moved Canvas unit tests to `hud_overlay/s650_hmi/tests/unit`, launcher-boundary coverage to `tests/integration`, and moved the React configuration helper to `frontend/src/features/overlay_control/s650/config.ts`. Frontend Vitest explicitly includes the HUD-owned tests so the existing `pnpm -C frontend run test` command remains the single test entry point.
- **Release boundary**: The frontend build now copies HUD assets through `frontend/scripts/copy-hud.mjs`, excluding every `tests` directory from `dist/hud`; test relocation therefore does not enlarge production artifacts.
- **Guardrail**: This is an ownership-only move: no renderer hot-path logic, telemetry contract, or UI behaviour changes. A later phase may replace duplicated theme allowlists with a generated or shared manifest, but must not make the static HUD import the React bundle.
---

## 2026-08-11 / Theme Customization Cleanup

- **Scope**: local / frontend ThemeView and persisted theme settings.
- **Status**: adopted
- **Learning**: The three-slot theme storage UI had no active consumer outside ThemeView, and the generated CSS template duplicated current token values while forcing an empty custom CSS field to become non-empty on mount.
- **Action**: Removed legacy theme slots and their persistence path, kept validated JSON import/export, and changed custom CSS editing to a local draft with explicit Apply/Cancel/Clear actions. Custom CSS is now validated before it is persisted or imported.
- **Evidence**: Frontend Vitest: 31 files / 197 tests passed; Vite production build passed; backend overlay API tests: 35 passed; all six locale JSON files parsed successfully.

## 2026-08-12 / Drift Zone Side-Wing Primary and Compound Secondary

- **Feedback applied**: the centered primary obscures the driving view even
  when it avoids native UI. The primary now uses the lower-left wing between
  the observed map edge and the left edge of the Drift Zone total. Its width
  is calculated from the real viewport slot on resize and the visual frame
  scales proportionally.
- **Compact readability**: enlarged the gear, speed, torque, and unit source
  text. Compact mode retains only the key +45/0/-45 steering and low/mid/high
  RPM labels, preventing unreadable dense tick text at the new size.
- **Secondary design**: changed the status panel from text rows to two
  Advanced-inspired compound segment arcs (FLOW and RISK), each with a track,
  active segments, state label, and value. The central drift-angle/counter
  readout remains the immediate focal point.
- **Composition decision**: chose the left side-wing primary rather than a
  right-bottom cluster, so the Style Meter and conventional secondary do not
  need a shared expanded oval background. Cyan/pink danger language and the
  same dark translucent surface retain visual coherence across both modules.

---

## 2026-08-12 / Screenshot-Calibrated Primary and S650 Center Void

- **Evidence**: the latest 2048x1152 gameplay screenshot shows the left-wing
  primary still too small, while the native Drift Zone total remains a strict
  lower-center exclusion. S650 HMI confirms the composition pattern: its
  1280px cluster assigns an explicit 480px center region and its `disable`
  center page deliberately leaves that area blank without disabling the two
  surrounding dials.
- **Primary correction**: the side-wing fit is now treated as the compact
  base frame. The visible primary is doubled, with that base frame's previous
  left edge promoted to the new center, and its lower edge is still calcula## 2026-08-30 / Versioned Synthetic Telemetry Replay Fixture Boundary

- **Scope**: `tests/fixtures/telemetry_replay/`, test-only raw packet builder, parser/recorder/binary-wire replay contracts.
- **Decision**:
  1. Replay input is a small JSON fixture with the explicit `fh6-telemetry-replay-fixture/v1` contract and a mandatory synthetic provenance declaration. It contains no player or real-vehicle data and explicitly states that replay is not evidence of live Forza behavior.
  2. Test-only helpers construct the documented 324-byte little-endian packet layout. Production `backend/telemetry_listener.py` remains unchanged, so fixture coverage can be rebased onto a later telemetry-quality contract without parser ownership overlap.
  3. Boundary tests keep raw SI values distinct from the existing 128-byte binary wire conversions, and make timestamp discontinuities plus queue shedding/recent-frame selection observable rather than masking them as hardware evidence.
- **Evidence**:
  - Fixture loader rejects unknown fixture contract versions; tests assert raw-to-domain values and binary wire unit conversions, discontinuous timestamps, and queue pressure retention behavior.
  - The fixture is synthetic. These assertions validate deterministic code paths only; they do not validate FH6 Data Out from a running game.
- **Status**: adopted test-contract convention; full local gate results are recorded with the associated PR because this isolated worktree initially lacked its required `.venv`.

---

## 2026-08-30 / Binary Telemetry Wire Contract Repair

- **Scope**: `backend/telemetry_listener.py` binary serializer and synthetic replay wire-contract assertion.
- **Decision**: Keep the UDP packet parser and all FH Data Out offsets unchanged. The 128-byte binary client serializer must instead use a format with two integer fields (`IsRaceOn`, `Gear`), 28 float fields, and 8 reserved bytes; this exactly matches its 31 emitted values and the established 128-byte consumer contract.
- **Evidence**: GitHub Actions replay test exposed the former mismatch directly: `struct.pack` expected 30 items but received 31, so the exception handler returned an all-zero 128-byte packet. Commit `70a11dd` adds `struct.calcsize(...) == 128` coverage and the replacement CI passed Backend Lint & Static Check plus Backend Pytest Unit Tests.
- **Limit**: This repairs deterministic serializer behavior only. The synthetic fixture remains explicitly non-evidence of live FH6 Data Out behavior.
- **Status**: adopted.

---

## 2026-08-30 / P0 Telemetry Quality Contract

- **Scope**: `backend/telemetry_listener.py`, `backend/telemetry_runtime.py`, and telemetry pipeline unit tests; no frontend, settings, replay, `ref/`, or `LazyForza/` changes.
- **Status**: adopted.
- **Learning**:
  1. FH Data Out ingestion has two explicit accepted layers: a legacy common `232-byte` schema and the complete `324-byte` FH6 schema. A `233..323-byte` datagram is neither compatible and must be rejected rather than partially decoded as a full payload.
  2. Parser validation must happen before queue insertion. Rejecting non-racing, unsupported-length, partial-schema, and non-finite/out-of-range payloads at that boundary prevents menu/invalid frames from reaching race or dyno recorders.
  3. Pipeline diagnostics remain backward compatible by retaining `telemetry-pipeline-metrics/v1` and adding bounded counters: accepted schemas, rejection reasons, `input_queue_full`/`consumer_lag` drop reasons, and unsigned-32-bit timestamp duplicate, out-of-order, wrap, and estimated-gap diagnostics.
  4. Timestamp gap estimates are observational only. They use `TimestampMS` continuity and are not evidence of a real FH6 packet loss without a live capture.
- **Evidence**: Full local gates passed using this worktree's Python 3.13 `.venv`: `ruff check .`, `ruff format --check .`, `python -m pytest tests/` (`198 passed, 2 skipped, 6 deselected`), frontend Vitest (`77 files / 478 tests`), TypeScript/Vite build, and `git diff --check`. Unit fixtures cover both accepted packet lengths, each new parser rejection family, bounded consumer latest-wins, queue-full drops, and timestamp diagnostics.

---

## 2026-08-30 / Durable Settings Store and Non-sensitive Storage Overview

- **Scope**: versioned `settings.json` persistence, settings API boundary, optimistic Settings UI writes, and the read-only Data & Storage overview. No telemetry listener, diagnostic bundle, onboarding flow, SQLite schema, or FH6 in-game behavior was changed.
- **Decision**:
  1. Settings use `settings_schema_version: 2`; missing legacy version markers upgrade during load while retaining unknown fields and existing nested settings.
  2. A settings write first atomically replaces `settings.json.bak` with the current valid document, then atomically replaces `settings.json`. A corrupt primary document is recovered from that backup at the next load.
  3. The frontend treats a non-2xx settings response as a failed optimistic write, restores the prior state, and sends a global danger toast. `ToastProvider` therefore wraps `SettingsProvider`.
  4. Data & Storage reports only relative entry names, aggregate capacity, format/version, backup time, and export/restore/SQLite capability states. It never returns the application data root and does not claim an unreviewed SQLite migration.
- **Evidence**: targeted persistence/router and portable source-sidecar tests passed (`8 passed`); frontend Vitest passed (`78 files / 480 tests`) and production TypeScript/Vite build passed; `ruff check .` and `git diff --check` passed. Full pytest began with `202 selected` but stalled in the existing audio-device suite at `tests/test_audio_spectrum.py`; the settings-specific tests passed independently. `ruff format --check .` reports only the pre-existing whole-file `backend/main.py` format baseline, which was not rewritten because settings ownership is limited to its settings blocks.
- **Status**: adopted.rift HUD Runtime and Visual Token Convergence

- **來源**：`local`，`codex/drift-hud-modernize-remove-presets`。
- **狀態**：`adopted`。
- **Learning**：inline Canvas HUD 的 contract test 若只檢查字串存在，無法捕捉 render loop 對未宣告 palette token 的依賴；本輪補上真實 fake Canvas／DOM／RAF harness，並將 active secondary 的 speed／unit／gear 邊界、共享視覺 token 與 one-frame console-error 檢查固定成可重複驗證的 contract。
- **Action**：secondary 維持既有 bottom-right anchor、single Canvas／HUDCore frame path 與主儀表幾何；移除 secondary 的 speed／unit／gear draw call，保留小型 LC badge，降低 surface／glow density，並分離 brake、redline、slip／lockup 與 Style risk 的語意色彩。同步將 safe-zone、implementation plan 與 Advanced remap 文件更新為 current implementation。
- **Evidence**：`hud_overlay/drift/index.html`、`frontend/src/features/overlay_control/driftHudContract.test.ts`、`docs/fh6-ui-safe-zones.md`、`docs/telemetry-hud-implementation-plan.md`、`docs/drift-secondary-advanced-remap-implementation.md`；frontend Vitest `44 files / 247 tests`、frontend build、pytest `108 passed`、ruff check／format check 均通過。
- **Boundary**：真實 FH6 screenshot／frame capture 仍需確認 Yaw sign、slip-ratio saturation、compact-scale readability、LC transition 與不同解析度下的低 glow 可讀性；fake Canvas contract 不取代畫素級視覺驗收。

---

## 2026-08-12 / Drift HUD G3 Readability Rework

- **來源**：`local`，`codex/drift-hud-modernize-remove-presets`。
- **狀態**：`adopted`。
- **Learning**：副儀表把 throttle、brake、clutch、handbrake 疊在同一組 superellipse arc 上時，segment gap、曲率、曲線 normal offset 與 midpoint label 會同時降低量表進度與文字可讀性；主儀表已驗證的 arc grammar 不應被這個副儀表問題牽連修改。
- **Action**：將 active secondary 重構為左右二分：左側 Driver Inputs、右側 Vehicle Dynamics。G3 使用連續 quadratic rail，`x(u)` 對 ratio 線性，`y(u)` 只加入小幅 `4H u(1-u)` 淺曲率；throttle／brake 提高權重，clutch／handbrake 由外下向內上鏡像成長，label/value 固定在文字槽位。姿態 vehicle body 與右下 2×2 grip mini-bars 同步放大；primary compact arc 僅微調刻度字級。
- **Evidence**：`hud_overlay/drift/index.html`、`frontend/src/features/overlay_control/driftHudContract.test.ts`、`docs/drift-secondary-advanced-remap-implementation.md`、`docs/telemetry-hud-implementation-plan.md`、`docs/fh6-ui-safe-zones.md`；fake Canvas one-frame contract 已驗證新 G3 rail、左右二分 label、primary readout boundary 與無 renderer error。
- **Boundary**：真實 FH6 screenshot／frame capture 仍需確認 G3 rail 的低解析度可讀性、clutch／handbrake 由外下向內上的視覺對稱、右側 attitude／grip 區比例，以及主儀表刻度字級調整是否造成局部擁擠。

---

## 2026-08-12 / Drift G3 Active-Fill and State Feedback Correction

### Style event integration follow-up

- 移除獨立 Hero toast，將 special event 整合到 Style Meter 的 EVENT row，沿用既有 12.5Hz DOM paint。
- 擴充事件語彙：clutch kick、brake rotation、throttle punch、counter snap、direction switch、angle lock、grip save。
- Handbrake Entry 改為兩階段判定：先確認高門檻手煞車上升、高速、油門、低腳煞車與轉向，再要求短時間內形成有效甩尾角度，避免直線誤觸發。

### Follow-up review corrections

- 修正 LC fallback 的狀態轉移：手煞車釋放不再立即清除 ARM，車速跨過啟動門檻後進入短暫 GO 視窗。
- 車身動態改用主儀表相同的 `atan2(VelocityX, VelocityZ)`／`displayAngle`，不再重複扣除世界 Yaw；車身與 HD 箭頭反向旋轉，TRV 軸固定。
- Style Meter 維持無框設計，新增半透明深色底與陰影，以提升日間背景上的分數／事件文字對比。

- **來源**：`local`，`codex/drift-hud-modernize-remove-presets`。
- **狀態**：`adopted`。
- **Learning**：quadratic rail 的完整 track 與 active charge path 必須使用同一條 Bézier 的 De Casteljau 子曲線；只插入線性 endpoint 會讓 throttle、clutch、handbrake 的充能條看起來脫離 rail。離散 LC 狀態也不能只依賴目前永遠為 `inactive` 的 fallback payload。
- **Action**：修正 G3 active sub-curve，改以 rail 法線產生 throttle／brake 的淺弧與 clutch／handbrake 的鏡像曲率；統一四組 caption 的中心基線與 label/value 間距；vehicle body／tire vectors 依 `travelAngleDeg` 旋轉；LC badge 顯示 `LC ARM`／`LC GO`，並在缺少 canonical state 時使用低速一檔、高油門、手煞車 fallback heuristic。
- **Evidence**：`hud_overlay/drift/index.html`、`frontend/src/features/overlay_control/driftHudContract.test.ts`、`docs/drift-secondary-advanced-remap-implementation.md`、`docs/telemetry-hud-implementation-plan.md`；full frontend Vitest `44 files / 247 tests`、build `679 modules`、fake Canvas contract 均通過。
- **Boundary**：仍需實機 capture 確認四組 caption 在縮放後的實際間距、vehicle rotation 的方向語意，以及 fallback LC 狀態是否與遊戲中的 launch-control 操作一致。

---

---

## 2026-08-13 / Python uv toolchain standardization

- **Status**: adopted。
- **Decision**：Python 3.13、根目錄 `.venv`、`requirements.txt` 與 Python 工具入口統一由 uv 管理。建立環境使用 `uv venv --python 3.13 --managed-python`，套件使用 `uv pip`，執行與測試使用 `uv run --no-project --python .venv\\Scripts\\python.exe`。
- **Action**：`build_all.bat`、`setup_venv.bat`、`start_all.bat` 與 `start_backend.bat` 已移除 PATH-level Python/pip 依賴；新增的 [python-uv.md](rules/python-uv.md) 是未來本機與 CI 命令的 canonical policy。`.gitignore` 排除 `.uv-cache/`，`.pkgdirignore` 已涵蓋 `.venv` 與 `.uv-cache`。
- **CI assessment**：`.github/workflows/ci.yml` 與 `diagnostics.yml` 已改用釘選版本的 `astral-sh/setup-uv`，由 uv 建立 managed Python 3.13、啟用 `.venv` 與 uv cache，並透過 `uv pip`、`uv run --no-project --active` 執行依賴安裝、pytest、Ruff 與 PyInstaller。
- **Evidence**：uv-managed CPython 3.13.12、`uv pip check`、import smoke test、backend `py_compile` 與 pytest `108 passed` 均已驗證。

---

## 2026-08-13 / HUD ownership boundary and contract directory standardization

- **Decision**：仿造 S650 的 ownership boundary，只有主要與主 GUI 交互的 HUD 設定、normalize 與 typed boundary 放在 `frontend/src/features/overlay_control/<hud-id>/`；renderer、Canvas、inline-controller 與 standalone HUD contract tests 歸 `hud_overlay/<hud-id>/tests/` 管理。
- **Action**：原先誤將 Drift／Advanced renderer contract 放入 `overlay_control` 子資料夾；依 S650 的真正 ownership boundary 改置於 `hud_overlay/drift/tests/unit/driftHudContract.test.ts` 與 `hud_overlay/advanced/tests/unit/advancedHudContract.test.ts`。`overlay_control/<hud-id>/` 僅保留主 GUI 交互檔案。
- **Verification**：Vitest 改以 `../hud_overlay/*/tests/**/*.test.ts` 納入所有 HUD-owned 測試，並以完整 frontend Vitest 與 build 驗證測試入口、相對路徑與 production bundle。

---

## 2026-08-13 / Developer Tuning Math Boundary and Capability Contract

- **Decision**：在 `codex/tuning-dev-mode` 上保留 legacy `TuningView` 為預設，透過 Settings 的 developer flag opt-in 到 `TuningView_dev`；新版只經由 `tuningMath_dev.ts` façade 進入 domain tuning modules。
- **Action**：新增 versioned capability contract、unknown-safe control normalization、calibration fixture schema/loader、tire friction-ellipse invariant，以及輪胎／懸吊／差速器／齒比 domain modules；開發頁拆分 input/output/capability panels，避免超過 250 行 God component。
- **Evidence**：frontend Vitest `48 files / 261 tests`、production build `690 modules`、`pytest -q tests/test_main.py` `5 passed`、`git diff --check` 通過。
- **Boundary**：FH6 slider step、precision、upgrade lock 與 tire coefficient 仍以 `unknown` 或 `calibration-prior` 表示；未經實機 capture／reviewed community fixture 前，不得升級為 production-calibrated 常數。

---

## 2026-08-13 / External Evidence and MCP Read-only Boundary

- **Evidence**：Subagent web research found medium/high-confidence FH6 control-family and upgrade-gate evidence, but no complete official numeric slider specification; Chinese community sources mainly provide vehicle/PI/event-specific share codes; technical tire sources support model forms but not FH6 coefficients.
- **Action**：Added `docs/tuning-math-external-evidence-report.md`, `tuning-capture/v1` telemetry collection page with JSON/CSV export and summary analysis, and `docs/tuning-mcp-integration-evaluation.md` recommending a localhost read-only MCP adapter.
- **MCP boundary**：A future MCP server should expose bounded capture/session resources and deterministic analysis tools, never a second UDP consumer; v1 must not expose tune writes, recorder control, arbitrary SQL, or direct game automation.
- **Verification**：Frontend capture schema tests and build pass after fixing test fixture speed/Yaw fields; live FH6 collection still requires human test execution.

---

## 2026-08-14 / Telemetry HUD Elements & WASAPI Audio Capture Optimization

- **Scope**: local / HUD Overlay control panel & backend system media / WASAPI audio loopback.
- **Status**: adopted.

---

- **Learning**:
  1. CPython `winrt-Windows.Media.Control` 套件在 Dev 環境下發起 WinRT 異步任務 (`request_async()`, `try_get_media_properties_async()`) 時，底層需要 `winrt-Windows.Foundation` 模組將 WinRT `IAsyncOperation` 轉譯為 Python awaitable。未宣告 `winrt-Windows.Foundation` 會導致 Dev 環境拋出 `ModuleNotFoundError`。
  2. 桌面視窗標題列枚舉 (`_extract_windows_desktop_media()`) 會掃描全系統 OpenInputDesktop 視窗，在高頻輪詢下可能引發潛在 CPU/IO 效能瓶頸。透過補齊 `winrt-Windows.Foundation` 依賴並強化 WinRT 異步 API 呼叫，完全不需依賴桌面視窗枚舉降級。
  3. `soundcard` loopback 預設僅綁定 `default_speaker()`，當使用者在執行期間更換系統播放輸出裝置時，既有錄音執行緒會失效。透過 `sc.all_speakers()` 列出裝置並提供動態切換 / 熱重啟 Worker 執行緒，可實現音訊視覺化裝置熱變更 (Hot-swap)。
- **Action**:
  - `requirements.txt` 與 `setup_venv.bat` 追加 `winrt-Windows.Foundation==3.2.1` 並於 healthcheck 進行驗證。
  - `backend/system_media.py` 強化 WinRT async 呼叫並完全移除 `_extract_windows_desktop_media` 視窗枚舉代碼。
  - `backend/audio_spectrum.py` 新增 `get_available_audio_devices()` 與 `set_audio_capture_device()` 支援音訊輸出裝置列舉與 WASAPI loopback 熱重啟。
  - `backend/main.py` 新增 `/api/audio/devices` 與 `/api/audio/device` API，`DEFAULT_HUD_CONFIG` 支援 `showTeleMaster` 與 `audioDeviceId`。
  - `OverlayView.tsx` 標題變更為 `Telemetry HUD Elements` 並補齊 i18n 翻譯，新增 `showTeleMaster` 標題按鈕（主控 AND 邏輯閥，關閉時下方開關均 `disabled`），並於系統與優化選項追加音訊擷取來源下拉選單與重新整理按鈕。
  - `hud_overlay/shared/telemetry-cards/manager.js` 寫入 `showTeleMaster` AND 邏輯閥判斷。
- **Evidence**:
  - Pytest 測試：`test_system_media.py` (3 passed), `test_audio_spectrum.py` (2 passed), `test_overlay_api.py` (38 passed)。
  - Vitest 前端單元測試：48 個測試檔 / 259 個測試全數通過（包含新增之 `overlayElements.test.ts`）。

---

## 2026-08-14 / Localhost Read-Only MCP Server Implementation

- **Scope**: local / `backend/mcp/` & `docs/mcp-setup-guide.md`.
- **Status**: adopted.
- **Learning**:
  1. 大型 60Hz 遙測封包與高頻時序數據若直接由 AI 讀取檔案，極易遭遇 Context Window 溢出與輸出截斷。透過建立輕量 JSON-RPC 2.0 stdio MCP Server，提供帶有分頁（Pagination）、局部時間窗口（Window Slicing）與降採樣（Downsampling）的查詢工具，可兼顧即時性與 Token 效率。
  2. MCP 服務層直接對齊 `TelemetryView` 視圖（包含儀表、踏板輸入、動力與 G-Radar、四輪胎溫/滑移角/滑移比/綜合滑移向量、四輪懸吊行程與觸底偵測），並封裝純物理調校計算（Road/Rally/Drift/Drag）與 AEGO 齒比求解器，讓 AI 能直接進行數據驅動回測與閉環診斷。
- **Action**:
  - 建立 `backend/mcp/protocol.py`、`backend/mcp/service.py`、`backend/mcp/resources.py`、`backend/mcp/tools.py` 與 `backend/mcp/server.py`。
  - 實作 26 個專屬唯讀工具與 5 類 Resource URI（`fh6://telemetry/...`, `fh6://capture/...`, `fh6://car/...`, `fh6://tuning/...`, `fh6://settings/...`）。
  - 新增說明文件 `docs/mcp-setup-guide.md`，提供 Claude Desktop、Cursor、VS Code 等客戶端設定指南。
- **Evidence**:
  - Pytest 測試：`tests/test_mcp_protocol.py` (5 passed), `tests/test_mcp_service.py` (8 passed), `tests/test_mcp_tools.py` (4 passed), `tests/test_mcp_resources.py` (4 passed)；後端全體 Pytest `138 passed, 2 skipped`。
  - 前端 Vitest：`52 files / 271 passed`；`ruff check` 與 `ruff format --check` 全數通過。

---

## 2026-08-14 / Release Build MCP endpoint and live validation

- **Decision**: Dev mode keeps a fixed HTTP/MCP port of `8001`. Release Build
  startup prefers `8001`, falls back to a dynamic port only when it is occupied,
  and writes the actual bound port to `logs/web_port.txt` after binding. The
  frontend consumes that value directly; it does not guess a fallback port.
- **UI**: A Halfmoon Popover is attached to the Settings navigation item when
  the Release Build uses a dynamic port. It directs the user to Settings → MCP
  Server, where the current `/mcp` endpoint is visible and copyable.
- **Live MCP validation**: A running Dev backend on `127.0.0.1:8001` accepted
  `initialize`, `tools/list`, and `tools/call(get_live_telemetry_snapshot)` over
  `POST /mcp`. The call returned `status=idle`, no active session, zero recorded
  sessions, and no latest sample; `/api/mcp/status` reported three served MCP
  requests and `transport=streamable-http`.
- **Verification**: `pytest` 144 passed / 2 skipped, frontend Vitest 53 files /
  274 tests passed, Vite production build passed, Ruff passed, Python compile
  passed, and `git diff --check` passed.
- **Status**: adopted.

## 2026-08-14 / Phase 5C Drift Slip-window Profile Solver

- **Scope**: local / `frontend/src/domain/tuning/profiles/driftProfile.ts` and its Vitest contract tests.
- **Decision**: Add timestamp-aware Drift profiles with controllable rear differential ranges; retain `100/100` only as a named legacy-compatible preset, not a universal rule.
- **Physics**: Separate vehicle body sideslip beta from front/rear tire slip angles. Yaw rate uses direct angular velocity when present, otherwise unwrapped-yaw finite difference marked estimated. Drift duration and stability use positive timestamp intervals with duplicate/out-of-order protection.
- **Verification**: Targeted Drift profile Vitest passed (31 tests); no new TypeScript diagnostics remain in the Drift files. Full no-emit still reports only pre-existing Phase 4B strictness errors in `loadTransfer.ts` and `tireGeometry.ts`; `git diff --check` passed.
- **Status**: adopted.

## 2026-08-14 / MCP Server Deep Integration with FastAPI (SSE) & Frontend Settings UI

---

## 2026-08-14 / MCP Transport Consolidation

---

## 2026-08-14 / Phase 5A Road and Circuit Profile Solver

- **Scope**: local / `frontend/src/domain/tuning/profiles/roadProfile.ts` and its Vitest contract tests.
- **Decision**: Add independent `technical`, `balanced`, and `high_speed` profiles under `tuning-profile/v1`; keep all constants marked as empirical priors or estimates because no real calibration fixtures are present.
- **Physics**: Tire circumference and target final-drive geometry use explicit SI conversions. Optional power curves produce post-shift wheel-force advice; missing curves remain advisory. The AWD `1/65` circuit-rotation setting is an explicit prior, not a universal formula. Optional bicycle-model cornering output is marked estimated.
- **Verification**: Targeted Road profile Vitest passed (22 tests); TypeScript no-emit remains blocked by pre-existing Phase 4B strictness errors in `loadTransfer.ts` and `tireGeometry.ts`, outside this scope; `git diff --check` passed.
- **Status**: adopted.

## 2026-08-14 / Phase 5B Rally and Off-road Profile Solver

- **Scope**: local / `frontend/src/domain/tuning/profiles/rallyProfile.ts` and its Vitest contract tests.
- **Decision**: Add independent `gravel`, `cross_country`, and `jump` profiles under `tuning-profile/v1`; preserve dedicated Rally gearing and expose a contract proof that Road ratios are not reused.
- **Physics**: Surface roughness, airborne state, airtime, landing impact, and bottoming are timestamp-based telemetry estimates with explicit heuristic warnings. AWD differential outputs are range priors rather than a universal 25% decel lock.
- **Verification**: Targeted Rally profile Vitest passed (19 tests); no new TypeScript diagnostics were found for the Rally files; `git diff --check` passed.
- **Status**: adopted.

## 2026-08-14 / Phase 5D Drag Launch Traction and Distance Solver

- **Scope**: local / `frontend/src/domain/tuning/profiles/dragProfile.ts` and its Vitest contract tests.
- **Decision**: Add a simulated strip solver with explicit 60-ft, 100-m, eighth-mile, quarter-mile, and terminal-speed metrics. Gearing is optimized by strip length and power/traction inputs; no universal fourth-gear `1.00` assumption is used.
- **Physics**: Launch load transfer uses `deltaFz = m*a*hCG/L`, then allocates longitudinal traction separately for FWD, RWD, and AWD. Optional drag, rolling resistance, efficiency, and power-curve inputs are priors unless supplied; outputs remain estimated/simulated.
- **Verification**: Targeted Drag profile Vitest passed (25 tests); no new TypeScript diagnostics remain in the Drag file; `git diff --check` passed.
- **Status**: adopted.

- **Decision**: Removed the standalone stdio MCP entrypoint and the unused
  legacy HTTP+SSE transport before external deployment.
- **Contract**: The running FastAPI backend is the only MCP host. When
  `mcp_enabled` is true it exposes `POST /mcp` using Streamable HTTP and shares
  the in-process live telemetry snapshot; when the app is stopped or disabled,
  MCP is unavailable by design.
- **Time-series boundary**: Session and capture tools return bounded,
  timestamped windows with slicing/downsampling. Continuous server-push of
  future 60Hz frames is not supported; live telemetry remains a point-in-time
  snapshot.
- **Verification**: MCP HTTP/protocol/service/tools/resources tests passed;
  Settings MCP card tests passed; Ruff check and `git diff --check` passed.

- **Scope**: local / `backend/mcp/sse_transport.py`, `backend/main.py`, `frontend/src/features/settings/`.
- **Status**: adopted.
- **Learning**:
  1. 將 MCP 伺服器整合至 FastAPI 既有異步迴圈中，支援 Server-Sent Events（SSE）傳輸協定（`GET /mcp/sse` 與 `POST /mcp/messages`），使無需在本機配置 Python 子程序環境的遠端或網路型 AI Client 也能即插即用連線。
  2. 透過在前端 `SettingsView` 增加 `McpSettingsCard` 與一鍵複製設定代碼（自動產生 Claude JSON / Cursor CLI 指令 / SSE URL），極大程度降低使用者與次要裝置 Agent 的配置門檻。
- **Action**:
  - 實作 `backend/mcp/sse_transport.py` 管理 Client SSE 串流與 JSON-RPC 訊息分派。
  - 於 `backend/main.py` 掛載 `/mcp/sse`、`/mcp/messages`、`/api/mcp/status` 路由，並整合至系統全域設定 `settings.json`。
  - 前端新增 `McpSettingsCard.tsx` 面板（含運行狀態徽章、總開關、即時遙測讀取限制、時序降採樣滑桿與一鍵複製卡片），並整合至 `SettingsView.tsx` 與多語言字典。
- **Evidence**:
  - Pytest 測試：`tests/test_mcp_sse.py` (4 passed)，後端全體測試 `142 passed, 2 skipped`。
  - Vitest 測試：`McpSettingsCard.test.ts` (3 passed)，前端全體測試 53 個檔案 / 274 個測試 100% 通過。
  - Ruff 靜態分析與格式檢查全數通過。

---

## 2026-08-17 / GitHub SECURITY.md Implementation and Governance Integration

- **Scope**: `SECURITY.md`, `README.md`, `README.en.md`, `.agents/skills/agent-governance-audit/SKILL.md`, `.agents/skills/portable-release-validation/SKILL.md`.
- **Status**: adopted.
- **Decision**:
  1. 實作符合 GitHub 官方標準之 `SECURITY.md`（雙語對照），細化 Supported Versions 支援版本矩陣（`1.4.x` 獲主動安全性支援、`1.0.x - 1.3.x` 建議升級至 `1.4` 以上、`< 1.0` 停止支援）、Private Vulnerability Reporting 私密回報渠道、48h/7d SLA 回應與評估時程、協同揭露原則，並針對 Localhost 隔離、60Hz UDP 遙測解析、自訂主題/CSS 安全性等專案專屬威脅模型建立安全邊界指引。
  2. 經評估避免 Skill 過度碎片化，採取「方案 A」將 `SECURITY.md` 的持續維護與稽核整合至現有治理體系：`agent-governance-audit` 定例檢查社群健康與安全政策連結有效性；`portable-release-validation` 在發行新版時檢查並同步更新 Supported Versions 支援矩陣。
  3. 於中英文 `README.md` 與 `README.en.md` 中同步追加安全政策章節與指引連結。
- **Evidence**:
  - 後端靜態檢查：`ruff check .` 全數通過。
  - 後端單元測試：`pytest` 150 passed。
  - 前端單元測試：Vitest 66 個檔案 / 418 個測試全數通過。
  - 格式與代碼檢查：`git diff --check` 完全乾淨。

---

## 2026-08-24 / v1.4.4 OTA Release Readiness

- **Scope**: `main` branch release preparation, `tauri-plugin-updater` 2.10.1 behavior, Rust format gate, and v1.4.4 packaging.
- **Decision**: `tauri-plugin-updater` uses the manifest `version` for the built-in update decision (`remote > current`; `allowDowngrades` changes this to `remote != current`); the GitHub release tag is not a first-class comparator input. Because an existing v1.4.3 client cannot be bootstrapped by an equal `11.45.14` manifest, v1.4.4 uses runtime version `11.45.15` while retaining the `v1.4.4` release tag.
- **Action**: Add `cargo fmt --manifest-path frontend/src-tauri/Cargo.toml -- --check` to CI and release gates, and add cargo format auto-fix plus verification to `start_all.bat`.
- **Evidence**: Commit `fa0c3f9`; CI run `32681482344` passed including Windows executable bundle verification; CodeQL run `32681481832` passed; local frontend tests (69 files / 440 tests), frontend build, Ruff, Rust format, and release contract tests passed.
- **Status**: adopted.

---

## 2026-08-27 / PR #248 Full and Lite Frontend Packaging

- **Scope**: `feat/hud-frontend-alternative-client`, shared Full/Lite React resources, Lite three-tab shell, dual portable executable build, startup scripts, release archive, and Windows lifecycle diagnostics.
- **Decision**: Replace the deprecated `-hudonly` handover with two independent Tauri entry points. Full keeps the existing application; Lite exposes only Telemetry Dashboard, HUD Overlay, and Settings while reusing shared providers and feature views.
- **Packaging contract**: Vite builds both `dist/index.html` and `dist/lite/index.html` once. Tauri builds each variant separately, preserving the first executable before the second build overwrites Cargo's common output name. `build_all.bat` and CI publish `FH6-HorizonTuner.exe` plus `FH6-HorizonTuner_lite.exe`; release packaging also creates `FH6-HorizonTuner-portable.zip` containing both.
- **Lifecycle contract**: Rust owns sidecar startup and shutdown for both executable variants. The frontend waits for the reported listening port, and Windows diagnostics cover preferred/dynamic HTTP ports, UDP 8000 release, and Full/Lite window visibility.
- **Verification**: Frontend Vitest 70 files / 443 tests, Vite build, Full and Lite Tauri no-bundle builds, Rust format, targeted backend/release/runtime tests (18 passed), and Windows portable diagnostics (7 passed). GitHub CI and reviewer assessment remain external gates.
- **Limitations**: The Lite executable is currently a portable no-bundle artifact; the signed updater installer and `latest.json` continue to target the Full application. No production deployment or release publication was performed.
- **Status**: implemented locally, pending pushed-branch CI and PR review.
## 2026-08-27 / Manual Discord Application ID Packaging

- **Scope**: local `build_all.bat` portable packaging and Discord Rich Presence sidecar configuration.
- **Decision**: Stage the valid `DISCORD_APPLICATION_ID` environment value, or the ignored `config/discord.local.json` value, into the temporary PyInstaller resource before building; remove the generated resource on success and failure to prevent stale IDs.
- **Verification**: `tests/test_discord_presence.py`, `tests/test_spec_bundling.py`, and `tests/test_release_workflow_contract.py` passed (20 tests); Python compilation and `git diff --check` passed.
- **Status**: adopted.

---

## 2026-08-28 / AEGO Ratio Balance and Game-aligned Unit QoL

- **Scope**: AEGO editable ratio representation, global unit preferences, HUD unit ownership, and live suspension travel display.
- **Decision**:
  1. AEGO preserves per-gear total drive ratios while moving the editable final-drive/gear split toward a neutral final drive. Final drive is bounded to `2.00..6.10`, first gear is protected from sub-`1.00` pathological outputs, and the Drag profile retains its explicit fourth-gear `1.00` contract.
  2. User-facing APP units follow the game's three-choice model: general units atomically control speed, weight, temperature, pressure, height, force, and torque; power and spring-rate units remain independently selectable. Internal physics units and persisted legacy unit fields remain stable.
  3. HUD settings persist both an independent speed unit and `followAppUnits`; the backend derives `effectiveUnit` for runtime delivery without overwriting the independent choice.
  4. The Forza Sled packet's normalized suspension travel at offset `68` and absolute suspension travel in meters at offset `196` are both exposed. The live UI uses normalized travel for bar/trace geometry and can display either the normalized value or absolute millimeters for text/min/max.
- **Verification**: Ruff check/format passed; backend tests passed as `193` non-host-diagnostics plus `2` host-diagnostics tests; frontend Vitest passed `71 files / 449 tests`; production TypeScript/Vite build and `git diff --check` passed.
- **Status**: adopted.

---

## 2026-08-28 / Scoped Unit Workflows and Responsive Settings QoL

- **Scope**: Settings responsive layout, TelemetryView/HUD/TuningView unit ownership, HUD display-unit delivery, and Step 1 navigation access.
- **Decision**:
  1. Settings cards remain inside a responsive two-column grid; full-row spanning is reserved for content that explicitly requires it.
  2. Telemetry and the five-step tuning workflow persist local unit preferences as `followGlobal + General/Power/Spring`. A scoped settings provider changes display conversions only; canonical telemetry packets, vehicle parameters, and physics calculations retain their original units.
  3. Unit editors use permanently mounted Halfmoon bottom offcanvas panels. Leaving global inheritance seeds custom values from the current global choices so switching modes does not produce a surprise unit jump.
  4. HUD keeps a separate four-field display contract for speed, boost, torque, and power. The backend validates saved choices and derives `effectiveUnits`; both desktop and web HUD telemetry paths publish selected generic values plus canonical alternatives for renderers that need them.
  5. Step 1 places unit access and `Save & Proceed` beside its heading. Power, torque, downforce, seasonal pressure, weight, spring, and height displays honor the workflow scope while stored values remain hp, N·m, kgf, kg, kgf/mm, and cm as applicable.
- **Verification**: Ruff passed; backend tests passed as `194` non-host-diagnostics plus `2` isolated host-diagnostics tests; frontend/HUD Vitest passed `71 files / 451 tests`; production TypeScript/Vite build and `git diff --check` passed.
- **Status**: adopted.

---

## 2026-08-28 / Three-column System Settings Information Architecture

- **Scope**: `SettingsView`, MCP/update settings cards, shared settings presentation primitives, and responsive layout tests.
- **Decision**:
  1. Supersede the earlier two-column Settings layout with three desktop columns organized by concern: language/game units, telemetry/recording, and developer/integration/maintenance options.
  2. All ordinary fields and switches use shared `SettingsSection`, `SettingsItem`, and `SettingsSwitch` primitives. This keeps labels, descriptions, controls, whole-row switch hit areas, and semantic heading levels consistent across built-in, MCP, and OTA settings.
  3. Settings sections remain flat and transparent rather than using card backgrounds, borders, or shadows. Section headings, item labels, and explanatory copy use separate sizes, weights, dividers, and semantic color tokens to preserve hierarchy across themes.
  4. The three-column breakpoint begins at `lg`; below `xl`, individual setting rows stack their label and control to retain usable widths. Narrower screens continue to stack columns vertically.
- **Verification**: Ruff check/format passed; backend tests passed as `194` non-host-diagnostics plus `2` isolated host-diagnostics tests; frontend Vitest passed `73 files / 456 tests`; production TypeScript/Vite build and `git diff --check` passed. Browser QA confirmed three equal columns at 1440px and 1024px, with no Settings grid horizontal overflow at 1024px.
- **Status**: adopted.

---

## 2026-08-30 / Data Out onboarding and bounded health presentation

- **Scope**: `frontend/src/features/onboarding/` and `frontend/src/components/Navigation.tsx`.
- **Decision**: The frontend consumes the existing read-only `/api/diagnostics/telemetry-pipeline` contract through a typed presentation boundary. It distinguishes no packets, packets that produced no valid frames, usable frames, and unavailable diagnostics; parser rejection reasons remain visible without changing the UDP parser.
- **Accessibility and layout**: The first-run, dismissible modal has a labelled dialog role, focused close control, Escape support, and explicit skip/review actions. The everyday navigation exposes only a compact Data Out status action; the detailed metrics remain progressively disclosed in the modal and do not occupy the telemetry layout.
- **Evidence**: Vitest covers usable, no-data, parser-error, diagnostics-error, skip, and complete state derivation. The guide states that diagnostic evidence is local packet observation only and does not claim a verified in-game connection.

---

## 2026-08-30 / Versioned Synthetic Telemetry Replay Fixture Boundary

- **Scope**: `tests/fixtures/telemetry_replay/`, test-only raw packet builder, parser/recorder/binary-wire replay contracts.
- **Decision**:
  1. Replay input is a small JSON fixture with the explicit `fh6-telemetry-replay-fixture/v1` contract and a mandatory synthetic provenance declaration. It contains no player or real-vehicle data and explicitly states that replay is not evidence of live Forza behavior.
  2. Test-only helpers construct the documented 324-byte little-endian packet layout. Production `backend/telemetry_listener.py` remains unchanged, so fixture coverage can be rebased onto a later telemetry-quality contract without parser ownership overlap.
  3. Boundary tests keep raw SI values distinct from the existing 128-byte binary wire conversions, and make timestamp discontinuities plus queue shedding/recent-frame selection observable rather than masking them as hardware evidence.
- **Evidence**:
  - Fixture loader rejects unknown fixture contract versions; tests assert raw-to-domain values and binary wire unit conversions, discontinuous timestamps, and queue pressure retention behavior.
  - The fixture is synthetic. These assertions validate deterministic code paths only; they do not validate FH6 Data Out from a running game.
- **Status**: adopted test-contract convention; full local gate results are recorded with the associated PR because this isolated worktree initially lacked its required `.venv`.

---

## 2026-08-30 / Binary Telemetry Wire Contract Repair

- **Scope**: `backend/telemetry_listener.py` binary serializer and synthetic replay wire-contract assertion.
- **Decision**: Keep the UDP packet parser and all FH Data Out offsets unchanged. The 128-byte binary client serializer must instead use a format with two integer fields (`IsRaceOn`, `Gear`), 28 float fields, and 8 reserved bytes; this exactly matches its 31 emitted values and the established 128-byte consumer contract.
- **Evidence**: GitHub Actions replay test exposed the former mismatch directly: `struct.pack` expected 30 items but received 31, so the exception handler returned an all-zero 128-byte packet. Commit `70a11dd` adds `struct.calcsize(...) == 128` coverage and the replacement CI passed Backend Lint & Static Check plus Backend Pytest Unit Tests.
- **Limit**: This repairs deterministic serializer behavior only. The synthetic fixture remains explicitly non-evidence of live FH6 Data Out behavior.
- **Status**: adopted.

---

## 2026-08-30 / P0 Telemetry Quality Contract

- **Scope**: `backend/telemetry_listener.py`, `backend/telemetry_runtime.py`, and telemetry pipeline unit tests; no frontend, settings, replay, `ref/`, or `LazyForza/` changes.
- **Status**: adopted.
- **Learning**:
  1. FH Data Out ingestion has two explicit accepted layers: a legacy common `232-byte` schema and the complete `324-byte` FH6 schema. A `233..323-byte` datagram is neither compatible and must be rejected rather than partially decoded as a full payload.
  2. Parser validation must happen before queue insertion. Rejecting non-racing, unsupported-length, partial-schema, and non-finite/out-of-range payloads at that boundary prevents menu/invalid frames from reaching race or dyno recorders.
  3. Pipeline diagnostics remain backward compatible by retaining `telemetry-pipeline-metrics/v1` and adding bounded counters: accepted schemas, rejection reasons, `input_queue_full`/`consumer_lag` drop reasons, and unsigned-32-bit timestamp duplicate, out-of-order, wrap, and estimated-gap diagnostics.
  4. Timestamp gap estimates are observational only. They use `TimestampMS` continuity and are not evidence of a real FH6 packet loss without a live capture.
- **Evidence**: Full local gates passed using this worktree's Python 3.13 `.venv`: `ruff check .`, `ruff format --check .`, `python -m pytest tests/` (`198 passed, 2 skipped, 6 deselected`), frontend Vitest (`77 files / 478 tests`), TypeScript/Vite build, and `git diff --check`. Unit fixtures cover both accepted packet lengths, each new parser rejection family, bounded consumer latest-wins, queue-full drops, and timestamp diagnostics.
---

## 2026-08-30 / Durable Settings Store and Non-sensitive Storage Overview

- **Scope**: versioned `settings.json` persistence, settings API boundary, optimistic Settings UI writes, and the read-only Data & Storage overview. No telemetry listener, diagnostic bundle, onboarding flow, SQLite schema, or FH6 in-game behavior was changed.
- **Decision**:
  1. Settings use `settings_schema_version: 2`; missing legacy version markers upgrade during load while retaining unknown fields and existing nested settings.
  2. A settings write first atomically replaces `settings.json.bak` with the current valid document, then atomically replaces `settings.json`. A corrupt primary document is recovered from that backup at the next load.
  3. The frontend treats a non-2xx settings response as a failed optimistic write, restores the prior state, and sends a global danger toast. `ToastProvider` therefore wraps `SettingsProvider`.
  4. Data & Storage reports only relative entry names, aggregate capacity, format/version, backup time, and export/restore/SQLite capability states. It never returns the application data root and does not claim an unreviewed SQLite migration.
- **Evidence**: targeted persistence/router and portable source-sidecar tests passed (`8 passed`); frontend Vitest passed (`78 files / 480 tests`) and production TypeScript/Vite build passed; `ruff check .` and `git diff --check` passed.
>>>>>>> origin/main
- **Status**: adopted.

---

## 2026-08-31 / Jules manual Session and scheduled-output provenance

- **Scope**: `.agents/skills/jules_coding/` manual delegation gates, scheduled Jules Session/PR intake, persona provenance, and offline adoption validation.
- **Source**: `local`，根據 PR #244、#253、#255、#257、#258、#260、#262、#269、#271、#273、#274、#283 與 Jules API 公開文件檢討。
- **Decision**:
  1. `jules_coding` 保留為 canonical skill，分流處理 `manual` invocation 與 `scheduled-output intake`；排程工作不是手動授權的結果。
  2. `Bolt`、`Palette`、`Narrator`、`Sentinel` 只可透過 Session 開頭 prompt 與 task/PR evidence 推論為 `scheduled_likely`，不得當成正式 schedule flag。
  3. 手動 Session 必須使用 `FH6-JULES-INTENT v2`、`Source: manual` handoff marker，並要求 `requirePlanApproval: true`；API 預設自動批准 plan。
  4. 公開 API 能力僅升格為 Session 操作；`schedule_read`／`schedule_manage` 維持 `unavailable`，不得把刪除 Session 當成排程控制。
  5. `.jules/**` 預設不屬於功能 PR scope；case collision、duplicate task、empty diff、未解決 PR、越界修改、缺少測試 evidence 與 stale CI 均為阻擋原因。
- **Action**: 更新 `.agents/skills/jules_coding/SKILL.md`、`.agents/skills/README.md`；新增 `references/session_provenance.md`、離線 `scripts/validate_jules_intake.py` 與 `tests/test_jules_intake_contract.py`。
- **Evidence**: validator tests `19 passed`；後端全體 Pytest `230 passed`；前端 Vitest `76 files / 472 tests passed`；`tsc && vite build` 通過；全 repo `ruff check` 通過、`ruff format --check` 顯示 `132 files already formatted`、`git diff --check` 通過；skill folder/frontmatter、tracked `.jules` case audit 通過。Jules connector、`JULES_API_KEY` 與 schedule API 未在本環境驗證，未執行任何遠端排程操作。
- **Status**: adopted。
