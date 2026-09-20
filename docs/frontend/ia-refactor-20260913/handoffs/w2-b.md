# W2-B B2 整合交接（2026-09-20）

- Task / Status：HUD Setup／Layout／Advanced 實際 composition；`handoff`，browser／native／G5 缺項仍保留，非整條 lane done。
- Owner / Agent ID：Codex / `/root/w2_b2_panels`；Model / Thinking：繼承 parent，未另行覆寫。
- Worktree / Branch：`D:/FH6-frontend-ia-20260920/w2-b-integrate` / `codex/frontend-ia-w2-b-integrate-20260920`。
- BASE_SHA / transfer parent：`bb1803679b74cd73585bd5f690409c6424f0ecb9`，已包含 B2 panel 交付。
- B1 contract：`8442bffdb9393e36a5139b751b723c220a461a08` 的 `HudPanelSharedProps` 未改。
- Integration implementation SHA：`30a211b9307c302f55a8b2ba2f32222816641c3c`，已推送並由 `git ls-remote` 讀回相同 SHA。本文件為隨後的 documentation-only commit。
- Write lease：parent 接受 B2 transfer 並將 B-owned composition/runtime/panels/tests/handoff 交回本作者。實際只修改下列五檔；沒有 root/lane overlap。
- 停寫時間：2026-09-20 10:03 +08:00；程式已停寫，完成本 handoff 後停止全部 lease 寫入。

## 本 milestone 的 changed files

1. `frontend/src/features/overlay_control/OverlayView.tsx`
2. `frontend/src/features/overlay_control/HudWorkspace.tsx`
3. `frontend/src/features/overlay_control/HudWorkspace.css`
4. `frontend/src/features/overlay_control/useHudMetadata.ts`
5. `docs/frontend/ia-refactor-20260913/handoffs/w2-b.md`

沒有修改三個 panel 的實作、config schemas/defaults/normalizers、serialized runtime、AppShell、Sessions、Road、lang、backend、Tauri 或 native code。採用 skills：`halfmoon-design-system`、`huge-component-refactoring`、`modular-refactoring`、`cross-agent-collaboration`；browser 準備沿用 `computer-use`。Journal 不在本次實際變更範圍，介面交接資訊在此保存。

## Composition 與行為

- OverlayView 由約 1,500 行縮為 204 行，移除舊的大段 controls JSX 及已搬入 panel 的數值 handlers，實際 import/consume `HudSetupPanel`、`HudLayoutPanel`、`HudAdvancedPanel`。
- HudWorkspace 從 children wrapper 改為具名 setup/layout/advanced composition，包含 tablist/tab/tabpanel、ArrowLeft/ArrowRight/Home/End、roving tabIndex 與 focus-visible 樣式。只掛載選定的純展示 panel；切 panel 不卸載 OverlayView runtime/metadata/action owner。非 Setup 頁保留 pending/error/retry 顯示。
- `HudWorkspaceCompositionProps` 在 HudWorkspace.tsx 定義；extends `Omit<HudWorkspaceProps, 'children'>`，具名 node slots、status、t 與可選 children。只有 OverlayView 消費；frozen shared panel props 不變。
- `onConfigPatch` 接 `updateConfig`，style 也直接進相同 runtime；S650／Classic JDM canonical normalization 保留在既有 runtime，未另造 page normalizer。Elements partial、胎溫／滑移相依、S650 disable→drive restore 仍由原 page action 承接。
- Audio selection 同時送 config patch 與 `/api/audio/device`，不以設定儲存成功推定音訊成功；HTTP 非 2xx 現在顯示 audio error。Audio reads 以 request generation 排除過期／離頁結果。
- Native launch/close、click-through、monitor、reload 仍經既有 adapter；unsupported 不發 enabled patch，非 success lifecycle 結果不當成功，監視器／reload 的 error/degraded 可顯示。native 行為本輪未執行。
- Reset 保留確認、保留 enabled、replace defaults、reload 及 readback；HUD units sidebar 保留原 Portal owner 與 follow-global / unit / units 寫入。WIP 保留 developer/query 強制啟用與既有 localStorage key。
- `useHudMetadata` 現在有真正 consumer，取代 OverlayView 的另一套 styles／author state。Page hook 保留 prefix-aware cache、discovery 後的 user prefix、force-refresh；author 使用單調 request ID 及 effect cleanup active guard，styles reads 也忽略離頁結果。`refresh()` 只清除 page metadata cache 並重新讀 styles/author，不碰 runtime 或 pending writes。

Locale requests（root-owned）：新增 tab key `Layout`：en `Layout`、zh-TW `版面配置`、ja `レイアウト`；`Advanced`：en `Advanced`、zh-TW `進階`、ja `詳細設定`。`Setup` 已存在。本分支使用 t() fallback，未改 lang；已向 Coordinator 提出。

## 本輪驗證

Tested code 對應上述 implementation SHA；命令於提交前執行，提交未改動已測 TSX/TS/CSS。完整輸出保留於 task tool records，本文件保存摘要。

| Command / evidence | Result |
| --- | --- |
| `cmd /c "pnpm install --frozen-lockfile"` | exit 0；此 worktree 獨立安裝，沒有共享 node_modules junction |
| 改前 `cmd /c "pnpm -C frontend run test"` | exit 0；124 files / 869 tests |
| `cmd /c "pnpm -C frontend exec tsc --noEmit"` | exit 0；shared props 與三個真實 consumers 可編譯 |
| 改後 `cmd /c "pnpm -C frontend run test"` | exit 0；124 files / 869 tests；保留 runtime/scanner/elements/scale/S650/Classic JDM/metadata/native/capability regression |
| `cmd /c "pnpm -C frontend run build"` | exit 0；Full `dist/index.html`、Lite `dist/lite/index.html`；767 modules，新增 panel modules 已由 production consumer 引用 |
| `git diff --check` / `git diff --cached --check` | exit 0；只有既有 CRLF normalization 提示 |
| ownership / imports / side-effects static audit | 四個程式路徑均為 B-owned；panel 沒有 IO/storage/native/effect/timer；OverlayView 單一 controller + metadata hook；未新增 queue/channel |

### 本輪 Full/Lite browser：not-run

已啟動記憶體 Vite/API fixture，預備載入真正 `App` / `LiteApp`，URL 為 `http://127.0.0.1:5196/` 與 `/lite/`；隔離 transport 僅在 dev server 記憶體中重定向，沒有改 repository backend 模組或使用者設定。

但在第一次 `cua.createBrowserTab('iab', ...)` 時回報 `Browser is not available: iab`；隨後 `cua.getState()` 回傳 `apps: []`、`browsers: []`。沒有成功開啟產品頁，也沒有本輪 mounted interactions、keyboard/focus、theme、layout、POST readback、頁面 reentry 或 slow-response browser 證據。Coordinator 明確指示完成靜態 gate／handoff／push 並停止 server，後續由 Coordinator 在 browser surface 恢復後重驗。

臨時 exec session `8118` 已以 Ctrl-C 停止，port 5196 已無 listener；沒有留下 fixture 檔案。先前 B2 panel-only fixture 屬另一 SHA 的隔離呈現證據，**不繼承為本次 App／LiteApp 整合通過**。

Acceptance：H1/H2/H4/H6 browser 及 X1 `not-run`；native H3/H5 `not-run`；真實 FH6 / G5 performance `not-run`。Hook cleanup／cache 行為目前由 source review 與既有 pure metadata tests 支撐，尚未取得 mounted delayed-response 證據。

## 交接下一步

Coordinator 接入此分支後，確認 locale keys，從正式 Full/Lite 重跑 Setup/Layout/Advanced、units Portal、S650/Classic JDM、reset/audio、metadata force/user-prefix、rapid patches、pending POST 跨頁／重入、initial GET failure/retry 與 slow author 切換。對 exact integration head 做 browser/native 分欄驗收；必要時再將具名檔案移交 B 修正。

本次已推送 milestone，沒有 PR、沒有 merge main，沒有宣稱 browser/native/game/performance pass。最終 documentation HEAD / remote SHA 由最後回報列出。

---

# W2-B B1 handoff（歷史紀錄）

## Scope and ownership

- Base: `ee0f7bb9f5e607a682a5136bb0785deb580e51fb`
- Branch: `codex/frontend-ia-w2-b-20260919`
- B1 keeps `hudConfig.ts`, `s650/config.ts`, and `classic_jdm/config.ts` read-only. Their schemas, defaults, and normalizers were not changed.
- Existing `OverlayView` remains the consumer of all current HUD controls, including Classic JDM and S650 paths. It now consumes the typed `useHudController` facade and renders through `HudWorkspace`.
- B2 panel files were not created. The three panel paths remain pending the B1 to B2 transfer decision and lease.

## Changed files

- `frontend/src/features/overlay_control/OverlayView.tsx`
- `frontend/src/features/overlay_control/HudWorkspace.tsx`
- `frontend/src/features/overlay_control/HudWorkspace.css`
- `frontend/src/features/overlay_control/hudPanelTypes.ts`
- `frontend/src/features/overlay_control/hudNativeAdapter.ts`
- `frontend/src/features/overlay_control/hudNativeAdapter.test.ts`
- `frontend/src/features/overlay_control/hudCapabilities.ts`
- `frontend/src/features/overlay_control/hudCapabilities.test.ts`
- `frontend/src/features/overlay_control/hudMetadata.ts`
- `frontend/src/features/overlay_control/hudMetadata.test.ts`
- `frontend/src/features/overlay_control/useHudController.ts`
- `frontend/src/features/overlay_control/useHudMetadata.ts`

## B1 boundary

`HudNativeAdapter` maps the existing native commands (`get_available_monitors`, `move_hud_to_monitor`, `toggle_hud_window`, `set_hud_click_through`, and `reload_hud_window`) to typed results. Web sessions return `unsupported`; malformed native monitor data returns `degraded`; rejected or timed-out commands return `error`. A persisted `enabled` value is never treated as native command success.

`hudCapabilities.ts` keeps persisted configuration available in web mode while reporting native window, monitor, click-through, and reload capabilities independently. Classic JDM and S650 controls remain available through the existing config contract. `hudMetadata.ts` and `useHudMetadata.ts` isolate style and author metadata IO with request generation protection against stale responses.

`HudWorkspace` is a narrow children-based composition root. It carries the complete existing `OverlayView` content and leaves future panel props in `hudPanelTypes.ts` without creating B2 panel files.

## Validation

- Browser evidence: Vite web app at `http://localhost:1420/`; selecting the HUD workspace rendered `HUD Control Panel`, all existing settings sections, `Launch HUD Overlay`, the style list containing `Ford Mustang HMI` (S650) and `Classic JDM Arcade`, and the existing backend-disconnected/error state. This was browser-only; no native bridge was present.
- `cmd /c "pnpm -C frontend run test"` — pass, 123 test files / 867 tests, validation from base `ee0f7bb9f5e607a682a5136bb0785deb580e51fb` plus B1 worktree changes.
- `cmd /c "pnpm -C frontend run build"` — pass.
- `git diff --check` — pass; Git reported only the existing CRLF normalization warning for `OverlayView.tsx`.
- Native H3/H5: not-run, as required for this B1 web preparation; not blocking.

