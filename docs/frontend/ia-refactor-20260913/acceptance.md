# 驗收矩陣與證據格式

本表定義驗收要求，不是全項通過紀錄。2026-09-13 規劃時所有產品執行項均為 `not-run`；後續已執行的局部結果見 [執行紀錄](execution.md) 與 [G0 基準](evidence/g0-baseline.md)。使用者目前恢復的是 G2 closure 後的交付收尾；G2 foundation scope 已依 closure 核准，W2–W4/G5 仍按本矩陣逐項取得證據。保留已做過的測試事實；沒有對應行為/環境證據的項目仍為 `not-run`，計畫完成不代表產品通過。

G1 欄位確認、A→D 介面 freeze、每波出口與 PR-ready 定義見 [contracts-and-gates.md](contracts-and-gates.md)。某 pure test 覆蓋了 C2 的拒絕 intent 邏輯，不代表 C2 的 Lite 實際 mount 行為也通過；每項證據必須細分。

## 1. 驗證層級與命令

### 文件規劃

只驗證 relative links、引用程式路徑、附件來源內容、Git 範圍與 `git diff --check`。新增未追蹤文件必須另以 no-index whitespace check 或 intent-to-add 後 diff check 覆蓋，不能用空 diff 假裝驗證了新文件。

### 每個程式 PR 與整合 head

在自己的 worktree root 執行，記錄 HEAD、命令、exit code、結果、警告。

```powershell
cmd /c "pnpm -C frontend run test"
cmd /c "pnpm -C frontend run build"
git diff --check
```

Vite 已配置 Full/Lite multi-entry；檢查 `frontend/dist/index.html`、`frontend/dist/lite/index.html` 與各自資源可載入。一次 build 通過證明兩入口編譯成功，不代表 Tauri 原生行為或 Lite 沒有錯誤 mount。

需要準備新 worktree 依賴時，在 repo root `cmd /c "pnpm install --frozen-lockfile"`。使用 root `pnpm-lock.yaml`；每棵 worktree 獨立 node_modules。純文件階段不安裝。

新增 pure tests 用 `.test.ts` 放於對應模組旁；現有 Vitest 不包含 `.test.tsx`。不要引入 React render/DOM harness 來冒充 pure tests；非同步流程可將狀態與 IO adapter 分離，用非 React harness 測 response ordering，真正 mount/focus/native 用下列行為驗收。

若 shared build/test config 需要變更，Coordinator 明確處理；不要為了新檔名而放大 glob 掃入 heavy E2E。後端/工具未改則不跑無關 gate；如需 backend contract 更改，先拆獨立 scope，再依專案規則跑對應 pytest/ruff。

### Full/Lite 行為與原生驗收

使用現有 `dev_full.bat`、`dev_lite.bat` 分別啟動，保留工作區/資料隔離，避免同時爭用 Vite/UDP/backend port。測試者只關閉自己啟動的程序。瀏覽器與 Tauri 證據分開記錄；本計畫不要求重新設計打包或 updater。

需要 release artifact 才能證明的行為另跑 portable-release-validation，不從普通 web build 推論 EXE 已驗證。MoTeC、monitor/audio、真實 UDP/遊戲缺少條件時，該項保持 not-run，不寫 pass。

## 2. 行為矩陣

| ID | 場景 | 必須可觀察的結果 | Owner / 證據 |
| --- | --- | --- | --- |
| C1 | Full 導覽 | 只有 Live/Tune/Sessions/HUD；無全域 step/category 下拉 | Coordinator / Full UI |
| C2 | Lite 導覽與強制不允許 intent | 只有 Live/HUD；無 Tune/Sessions mount；退回 live 或拒絕禁用 intent | Coordinator / pure contract + Lite UI |
| C3 | 共用 Shell 切換 | provider 沒被重建，car/profile/settings/recording 保持 | Coordinator / mount evidence + state comparison |
| C4 | Navbar 舊能力移轉 | Data Out guide/dismiss、UDP health、動態 MCP port、更新入口、build/about 可達 | Coordinator / Full/Lite 適用矩陣 |
| C5 | 啟動 | backend-ready gate、動態 port、StrictMode、dark/light/core 首幀正確 | Coordinator / browser + Tauri |
| L1 | Live Dashboard | 遙測、unit drawer、pause、expanded card、各圖表正常 | A / Full+Lite |
| L2 | Launch Test | Full 既有流程可用；Lite 沿用 dashboard-only | A / UI + domain tests |
| L3 | race end + latest 可用 | Live active 時完成確認後開 Sessions latest；不被 current mount fetch 覆寫 | A + Coordinator / 成功回應、選擇與資料證據 |
| L4 | latest 延遲/失敗/切頁競爭 | 不誤開舊檔、不跳到空資料；retry 有上限，保留可重試入口；Tune/HUD 不被搶焦點 | A + Coordinator / 受控延遲與失敗情境 |
| T1 | 正式 Tune 往返工作區 | 四步/readiness、goal/season、profile、engine selected、RoadPrepare 表單與 candidate draft 等未保存輸入不重置；新 identity 必須重新確認 | Coordinator + D / UI + restore tests |
| T2 | Developer Tune 往返/切換模式 | 獨立輸入與 step 保持既有語意；solver 不變 | Coordinator + D / UI |
| T3 | 量測進行中/保存中切頁 | 不丟 capture 或選擇，不由晚回應覆寫新車資料；取消/完成狀態清楚 | Coordinator + D / capture/identity tests + UI |
| T4 | persistence 相容 | tuning-workflow-state v1/v2/v3 restore、unit keys、engine archive 可回讀 | D / pure restore tests + UI |
| S1 | current/latest/saved library | 開啟正確 session，資料來源與選取一致，刷新不覆寫別的選擇 | A / selector/ordering tests + UI |
| S2 | lap/compare/debrief/track | primary/compare lap、delta、summary、map、metric 與單位維持 | A / existing math tests + UI |
| S3 | MoTeC 動作 | open/import/export/template 全部可達，import 後切頁可返回，錯誤有回應 | A / UI；真正 launch 另記 native MoTeC |
| S4 | sessions save/delete/reopen | 資料與 list 正確更新；僅用隔離 fixture 驗證刪除 | A / backend 可見結果 + UI |
| R1 | 舊 Road workflow/reports | Sessions 開正確 workflow/A-B，ID 不被當成 analysis filename | D + Coordinator / UI |
| R2 | Road prepare/start/stop/record | Tune Step 4 原生流程可用、單一 active controller，離頁不誤停 backend run | D / controlled workflow + UI |
| R3 | 結果決策 | accept/revert/draft 既有能力保留；返回 Tune 繼續明確 | D / document 讀回 + UI |
| R4 | 非 Road | compatibility snapshot 仍可用且標示能力，不宣稱原生 run | D / regression tests + UI |
| R5 | history migration | 新入口接線驗收後移除 reviewHistory；未完成 workflow 可返回 Tune | D + Coordinator / UI |
| H1 | HUD style/setup | 已安裝樣式、author、WIP 顯示、units、global scale、reset 不遺失 | B / Full+Lite |
| H2 | Layout/Advanced | visibility、offset/size/opacity、colors/glow、style-specific/S650 所有舊控制逐項對照 | B / capability/patch tests + UI |
| H3 | native controls | monitor enumerate/move、launch/close、click-through/reload、audio 有真實結果 | B + Coordinator / Windows Tauri |
| H4 | 快速/交錯設定更新 | 最新有效修改保存；巢狀/未知欄位保留；失敗不虛報成功；晚回應不回退新值 | B / non-React IO harness + backend readback |
| H5 | HUD page 離開/重入 | page channel/read 清理，pending writes 妥善處理，外部 overlay 保持、config 重新一致 | B + Coordinator / resource + native evidence |
| H6 | Web/native 能力差異 | web 模式不虛報視窗啟動；unsupported/degraded 行為可理解 | B / browser |
| U1 | Settings surface | AppMenu 可開關、ModalPortal、close/Esc/focus、滾動與窄畫面可用 | C + Coordinator / Full+Lite UI |
| U2 | 能力與原設定 | Lite 無 Developer Tuning；其餘 language/units/telemetry/forwarding/recording/Discord/MCP/update/storage 保留 | C / section projection + UI |
| U3 | persisted setting reload | 對照 G0 的既有缺陷；新增 IA 變更不得造成額外回歸 | Coordinator / 隔離設定讀寫/重啟 |
| X1 | workspace resource cleanup | Live canvas、Sessions 4s refresh、Road page 1s poll、HUD page channels 正常卸載；app runtime 仍在 | 各 lane + Coordinator / resource inventory |
| X2 | appearance/diagnostics/menu | 不推擠 60Hz grid、popover/modal layering、深淺/全部 core modes、鍵盤可操作 | Coordinator + C / UI |
| X3 | 性能 | 3 次成對 baseline/candidate；CPU/RSS/切頁/幀表現無未解釋的可重現 >10% regression | Coordinator + reviewer / 下節方法 |
| X4 | 最終組合 | 各 lane + wiring 同時存在，tests/build、Full/Lite smoke、README/README.en/架構文件一致 | Coordinator + reviewer |

### 開工階段、責任與最低證據層

同一 acceptance ID 可分為前置與遷移後完整範圍。P2/G2 只驗證既有 UI 加 W1 foundation；T1–T4 由 Coordinator + W1 Tune/Road owner，L3/L4/S1 由 Coordinator + A0，H4/H5 由 Coordinator + B0，U1/U2 由 Coordinator 薄入口負責。上表 A/B/C/D 是後續完整 lane 的責任；不能反過來要求它們先完成才允許 G2。

下表覆蓋上表所有 ID，列出最早驗證位置與最低證據。所有列都是 G5 最終完整性要求；not-run 阻止該列及整體 G5 通過，但不等於每列都需要真實遊戲。受控 UI 指實際掛載前端並操作，資料可用隔離 fixtures；它不是純函式測試。後期未變的結果可由 reviewer 核對來源、candidate 與依賴後沿用，不能無條件沿用舊 SHA。

| ID | 最早 gate / 最終重驗 | 最低證據層與環境 |
| --- | --- | --- |
| C1/C2 | P2-G2；P8-G5 全組合 | Full/Lite 實際 UI；C2 加 pure 禁用 intent。最終兩個 Tauri entry 實際導覽 |
| C3 | P2-G2；任何 provider/root 改動後 | 實際 mount/往返與 state comparison；純 reducer 不足 |
| C4 | P2-G2；P8-G5 | Full/Lite UI，受控 backend/UDP health 狀態；動態 port 與 update 啟動由 C5/native 補證 |
| C5 | P2-G2 啟動前置；P8-G5 | browser 與 Windows Tauri；backend-ready、port、StrictMode、theme；不要求本次改 updater |
| L1/L2 | W2-A；P8-G5 | Full/Lite UI、既有 domain tests；L1 最終需真實 FH6 UDP 顯示，L2 真實遊戲的既有測試流程 |
| L3/L4 | P2-G2 A0；W2-A 重驗；P8-G5 | 受控成功/慢回應/失敗/新舊 race 競爭；最終 L3 加一筆真實 FH6 race completion，資料與選擇 identity 一致 |
| T1/T2/T4 | P2-G2 W1；W3-D 後重驗 | 實際 UI/跨頁/restore，既有 v1/v2/v3 測試與隔離 archive；不要求證明 solver 校準 |
| T3 | P2-G2 W1；P8-G5 | 受控 capture/save/identity 非同步情境 + UI；最終真實 FH6 capture 期間跨頁一次 |
| S1/S2/S4 | S1 在 P2-G2；其餘 W2-A；P8-G5 | 受控 UI + backend 讀回，真實或已保存 capture；刪除僅用隔離 fixture |
| S3 | W2-A；P8-G5 | 實際 CSV import/export/template、跨頁 UI；MoTeC 外部程式 launch 另需 Windows native |
| R1/R3/R4/R5 | W3-D；P8-G5 | 現有/隔離 workflow documents、實際 UI 及 action 後讀回；非 Road 保留 compatibility，不要求不存在的原生 run |
| R2 | P2 狀態前置；W3-D；P8-G5 | 受控 backend run + UI；最終加真實 FH6 Road run 的 start/record/finish 與跨頁，非多車校準 |
| H1/H2/H6 | W2-B；P8-G5 | Full/Lite UI + capability/patch tests；H6 實際 browser degraded 狀態 |
| H3 | W2-B；P8-G5 | Windows Tauri 真實 monitor/window/audio 裝置結果，不能以 mock 或 config saved 替代 |
| H4 | P2-G2 B0；W2-B 後重驗 | non-React IO ordering + 隔離 backend readback；含 initial GET fail/retry、pending GET、快速 patch |
| H5 | P2-G2 B0；W2-B/P8 後重驗 | 實際 native HUD 開啟並離頁/重入；pending write、page resource 清理，外部 HUD 不關閉 |
| U1/U2 | P2 薄入口；W2-C；P8-G5 | Full/Lite UI、keyboard/focus/capability；最終 Tauri surfaces 可達 |
| U3 | W2-C；P8-G5 | 隔離設定與程序重啟讀回，基準既有問題明列，不順帶改 schema |
| X1/X2 | P2 前置；W4/P8 全組合 | 實際 resource lifecycle、往返/reconnect、主題/鍵盤 UI；不能只用 code search |
| X3 | G0-observability 保存 baseline；W4/G5 比較 | 固定環境三次成對量測；主 app/backend/HUD 分列，依第 4 節；單次 JS heap 不等於 RSS |
| X4 | W4/P8-G5 | 同一整合 head test/build、Full/Lite/native smoke、文件核對 |

外部 native/遊戲條件缺少時，明列缺項、owner、取得方法與受影響 PR。只欠最終 G5 證據的相關 PR 保持 draft；G2 等較早關卡缺必要證據也保持未通過，不以 G5 名義提早放行。已完成的純契約 PR 可按自身範圍審查，不能宣告尚未接線的產品功能完成。

## 3. Pure tests 的範圍

- workspace manifest/variant：ID 唯一、fallback、Full/Lite 能力與禁用 intent。
- Sessions selection：current/latest/saved/validation 明確選擇、過期 response 不覆蓋目前 intent、切頁恢復。
- HUD patch/capability：不突變、巢狀欄位保留、unknown style fields、normalization、已證實能力映射。
- Settings section projection：Lite 只過濾已確認 Tune-only 項目，其他 section 不意外消失。
- 沿用 tuning workflow/engine archive、analysis math、Road contracts 的既有回歸測試。

不要用新 selectors 測試去複製完整 state implementation，不加靜態 wrapper tag tests，不把 Canvas 調用次數或 pixel 座標當合格條件。Async reducer/adapter 測試驗證情境與最終狀態，真正 React cleanup 仍需 mount/unmount 行為證據。

## 4. 效能與資源量測方法

在程式修改前保留 baseline SHA、build mode、OS/CPU/GPU、視窗大小、theme、資料源/播放長度、HUD style/monitor、backend port、工具版本。candidate 使用相同條件、相同測試資料與一致的 production/dev mode，不跨 build mode 比較。

每個 baseline/candidate 至少三次成對測量；每次先暖機 30 秒，再觀測固定 60 秒。情境：idle/disconnected、Live 相同遙測、Sessions 檢視、HUD 啟用、固定次數跨頁往返。量測主 app/WebView、backend 與外部 HUD 分開，記錄 CPU 平均、RSS/working set 中位與高值、切頁時間、幀時間/p95 或可用的 dropped-frame 指標。CPU 接近零時同時看絕對差，避免百分比失真。

資源 inventory 必須分 page/global/native owner；多個同名 BroadcastChannel 不自動等於洩漏。以反覆進出與 reconnect 後是否回到 owner 預期基準、是否持續增長來判斷。記錄 timer/channel/listener 的建立/釋放，避免以單次 code search 取代 runtime。

可重現 >10% CPU/memory regression 需修正或記錄可驗證的原因與取捨，再由 Coordinator 決定合併；未量測不得承諾改善百分比。60Hz synthetic replay 證明該輸入下前端行為，真實 FH6 遊戲另記；不要把回放稱為實車驗收。

## 5. 結果記錄模板

```text
Acceptance ID / Task:
Base SHA / Candidate SHA:
Environment / Full or Lite / browser or Tauri:
Data source: synthetic | saved capture | live game
Steps / Expected / Observed:
Command / Exit code / Test count / Warnings:
Artifact path / measurement duration / repetitions:
Result: pass | fail | not-run
Pre-existing issue or introduced regression:
Owner / Next action / Timestamp:
```

本輪文件驗證結果列於 [HANDOFF](HANDOFF.md)。後續 native/game/environment 缺項必須保留 not-run 和所需條件，整體不能先標 done。
