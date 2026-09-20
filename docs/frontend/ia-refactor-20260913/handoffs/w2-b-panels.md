# W2-B2 Panels 交接

> **歷史快照；進度／下一步已 superseded（2026-09-20）。** 現行候選與後續 gate 請讀 [W4 入口](../README.md)；替代關係見 [歷史索引](../archive/README.md)。以下保留當時 SHA、驗證與 `not-run`，不作為目前開工或 ownership 指令。

- Task：W2-B2 三個純展示面板。
- Status：`handoff`。面板 milestone 已交付；B 的 composition、正式 App 接線及 H1–H6 驗收尚未完成，不能標記整條 B lane done。
- Owner / Agent ID：Codex / `/root/w2_b2_panels`；Model / Thinking：繼承 parent，未另行覆寫。
- Worktree：`D:/FH6-frontend-ia-20260920/w2-b-panels`。
- Branch：`codex/frontend-ia-w2-b-panels-20260920`。
- BASE_SHA / transfer parent：`f9d24a192327bd7c38d8aeab7879eddeac372fe2`。
- B1_BASE_SHA / B2_PANEL_CONTRACT_SHA：`8442bffdb9393e36a5139b751b723c220a461a08`。
- 實作 Head SHA：`9761a46a04509fb0f751c7bb3948772b9edef1c3`。已推送，同次 `git ls-remote` 讀回此 SHA；本交接文件為其後的 documentation-only commit。
- Write lease：parent 明確移交以下四個 exact paths，B1 props 與其他 B 檔案只讀。
- 面板停寫時間：2026-09-20 09:48 +08:00；僅完成本 handoff 文件後停止全部 scope 寫入，B 可於接收後收回 ownership。

## AllowedPaths / Changed

1. `frontend/src/features/overlay_control/panels/HudSetupPanel.tsx`
2. `frontend/src/features/overlay_control/panels/HudLayoutPanel.tsx`
3. `frontend/src/features/overlay_control/panels/HudAdvancedPanel.tsx`
4. `docs/frontend/ia-refactor-20260913/handoffs/w2-b-panels.md`

三個 TSX 共 477 行。未修改 OverlayView、HudWorkspace、CSS、controller、hudPanelTypes、config/schema/defaults、tests、lang、Shell、backend 或 native。

採用 skills：`halfmoon-design-system`、`huge-component-refactoring`、`modular-refactoring`、`cross-agent-collaboration`；browser 操作另讀 `computer-use`。技能路徑及 canonical ID 已核對。Journal 不在 lease；本次新增的是暫時介面接線紀錄，未擴改治理文件。

## 公開 exports 與控制項分配

每檔提供同名 named/default component export，以及同名 `*Props` interface。三個 props 都 extends frozen `HudPanelSharedProps`，不更動 shared interface。`t` 由 owner 注入，沒有 SettingsContext 訂閱。

| 面板 | 保留的控制項與語意 |
| --- | --- |
| Setup | launch/close、busy/error/retry/pending、native capability 提示、style 選單及 WIP 過濾、author、refresh/reload、monitor、global scale 0.5–2（step 0.05）、HUD units 入口與既有作者 credits |
| Layout | 主儀表／telemetry visibility、master 對子開關停用、map 子開關條件、offset、merged/individual chart position/size、font/map size、兩種 opacity、alignment anchor/grid |
| Advanced | glow 0–2（step 0.05）與百分比輸入、default/custom colors、motion、WIP、S650、既有 ClassicJdmSettingsCard、VFD offset -5–5、audio refresh/select、pause telemetry、reset 入口 |

Layout 保留原本 merged/individual 的條件分支，包括 Live Map X/Y offset 仍在 individual 分支；此 milestone 不以重排之名改變控制項出現條件。Scale／opacity／offset 的標籤、fallback、min/max/step 與原 OverlayView 對照；opacity 百分比輸入維持 clamp 0.1–1。沒有新增 smoothing 或不存在的 renderer 功能。

所有面板僅讀 props 與回呼操作；沒有 effects、subscriptions、state store、timer、fetch、storage、native command 或第二條 persistence queue。唯一 React hook 是 `useId`，用於 labels 與 sections。

## B1 介面缺口及必要接線

Frozen `hudPanelTypes.ts` 實際只有 `config/styles/disabled/onConfigPatch`，尚無三個 panel 專用 metadata/action/status contract。依 exact lease，本次只在各 panel 檔定義窄 props，沒有回頭擴改 frozen 檔案。B 整合前需 review 這些 exports；可於自己 ownership 中將型別收攏。

- Setup 必須注入 `monitors`、`author`、`metadataLoading`、`includeWip`、`busy`、`pendingWrites`、`error`，以及 `nativeWindow/monitorSelection/reload` capabilities。`onToggleHud/onStyleChange/onMonitorChange/onReloadHud/onOpenUnitSettings` 接回既有動作；只有 runtime error 可 retry 時才給 `onRetry`。native unsupported 時 launch/monitor 停用且顯示 detail；`config.enabled` 僅決定 action label，不能當 native 成功證據。Refresh/reload callback 仍可在 web 執行 config/metadata/BC 部分，native reload 能力由 owner 判斷。
- Layout 的 `onElementToggle(key)` 必須保留原 owner 對 tire slip/temp 啟用時補 `showTeleTires: true` 的行為。不能將整個舊 `elements` snapshot 送回覆寫新值。
- Shared `onConfigPatch: Partial<HudConfig>` 不能表達巢狀 `Partial<HudElements>`。因此 element toggles 使用上述窄 callback；S650 center-info 使用 `onS650CenterInfoToggle`。widget 為 `disable` 時 owner 恢復 `drive` 並送 `showCenterInfo: true`；其餘保留原 toggle。
- S650 theme/widget 由 shared patch callback 送出 `hudStyle: 's650_hmi'` 和該設定；Classic JDM 沿用既有 SettingsCard 送 partial config。`onConfigPatch`、`onStyleChange` 都必須接 frozen runtime `updateConfig`，由 runtime 既有 `normalizeS650HmiConfig` / `normalizeClassicJdmConfig` 負責 canonical IDs、defaults、相容值，面板不複製 normalization。
- Advanced 必須注入 audio devices/loading/error、`isWipActive`、`wipForced`；`onAudioDeviceChange` 同時保留 config patch 與 `/api/audio/device` 的現有寫入語意，面板只發一次 callback。`onRefreshAudioDevices` 由 page metadata owner 管理；WIP callback 由 owner 保存現有 `fh6_show_wip_huds`，`wipForced` 為 developer setting 或 query 強制啟用。
- Reset 僅發 `onResetHudConfig`；owner 保留 confirm、`enabled`、replace defaults、reload 及 readback。Units 僅發 open callback；既有 HudUnitSettingsSidebar 與 ModalPortal 繼續由 page 管理，包含 follow-global、`unit: units.speed` 與 `units` 同步。

Actual product consumers：目前 **0**；既有 OverlayView 保持原實作，沒有 import 新面板。TypeScript 已包含新檔，但 production Vite bundle 尚未消費它們。B 下一步需縮減 OverlayView 為 page/controller composition，避免保留兩套控制項或重複 metadata owner。

Locale requests：沒有新 literal translation key；全部沿用 OverlayView。靜態 locale scan 仍看到既有缺 key（en-US 14、zh-TW 6、ja-JP 8），不在本 lease 內修補；未宣稱完整翻譯覆蓋。

## 驗證

Code tested：上述 `9761a46a04509fb0f751c7bb3948772b9edef1c3` 的三個 panel 內容；命令於提交前執行，提交沒有改變已驗證 TSX。完整輸出保留在 parent task 的工具紀錄，本文件保存命令、數量及限制。

| 命令／檢查 | 結果 |
| --- | --- |
| `cmd /c "pnpm install --frozen-lockfile"` | exit 0；本 worktree 自己的 dependencies，沒有 node_modules junction |
| 實作前 `cmd /c "pnpm -C frontend run test"` | exit 0；124 files / 869 tests |
| `cmd /c "pnpm -C frontend exec tsc --noEmit"` | exit 0；三個未消費面板均在 tsconfig include 範圍 |
| 實作後 `cmd /c "pnpm -C frontend run test"` | exit 0；124 files / 869 tests |
| `cmd /c "pnpm -C frontend run build"` | exit 0；`tsc && vite build`，Full `dist/index.html` 與 Lite `dist/lite/index.html` 產出 |
| `git diff --cached --check` / ownership path audit | exit 0；code commit 僅三個具名 panel 路徑 |
| 靜態副作用／樣式／locale 檢查 | 未發現 IO/storage/native/effect/timer；無 inline 硬編碼顏色或 Emoji；沿用 App.css range/color transition 排除；新增 literal translation keys = 0 |

### 隔離 browser smoke：有限證據

以 Node stdin 啟動記憶體內 Vite virtual module，`http://127.0.0.1:5186/__hud_panel_smoke` 直接消費三面板。沒有新增 fixture 檔、修改產品 consumer 或 backend 資料。Mock config 使用既有 `applyHudConfigPatch`，所有 actions 僅在 fixture 顯示 callback payload。fixture/tab 已關閉，viewport override 已 reset。

- Setup：native unsupported 停用 launch/monitor；units callback；style 選擇；WIP options；模擬 native 可用後 launch 只顯示 `{enabled:true}` callback；busy 停用按鈕。
- Layout：merged/individual 顯示切換、telemetry master 停用子開關、opacity 輸入 0 回呼 `{telemetryOpacity:0.1}`。
- Advanced：S650 disable 選擇與 center-info 恢復 callback；audio 選擇；Classic JDM Defi 選擇與 triple 關閉後隱藏 aux selectors；全域 disabled 停用 Classic JDM 及 reset。
- 390px：Setup/Layout/Advanced 都沒有 document 水平溢出；Advanced 在 dark/light × default/modern/elegant 六組的 DOM overflow 檢查均為 false。1280px Layout 無水平溢出。最後 browser console error 記錄為空。
- 限制：第一次 virtual TSX fixture 未預編譯造成 import-analysis error，改為記憶體內 TSX transform 後檢查通過；不是產品檔修正。兩次 screenshot capture 逾時，未完成像素／視覺對比檢查。DOM overflow 與 theme 切換不等於視覺驗收。

Acceptance：isolated presentation smoke `pass`；正式 Full/Lite H1/H2/H4/H6、page cleanup、POST/BC 交錯/readback `not-run`；native H3/H5、真實 FH6、效能 G5 `not-run`。沒有新增自製 DOM test harness 或跨 lease test 檔，既有 regression suite 保留。

## 下一步

Blocked by：無 panel 實作阻塞。Remaining：B 收回三檔、review local props、正式 composition 與 owner callbacks、integration tests、Full/Lite browser 視覺與 H 系列驗收。root 才接 Shell/App；不需 root 同時進入 B 的 consumer 檔共同編寫。

本 milestone 沒有建立 PR、沒有 merge main，沒有宣稱 native launch、audio capture、backend persistence 或真實遊戲成功。交接文件與後續 remote HEAD 的 SHA 由最終回報提供，實作 SHA 固定如上。
