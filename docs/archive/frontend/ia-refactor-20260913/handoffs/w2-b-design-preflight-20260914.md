# W2-B：HUD 設計交接

Task：HUD controller 與面板拆分。Status：`proposed`。Owner：Coordinator 保管設計，未發 W2-B write lease。Model：Luna / xhigh 起；所有面板 lane 亦僅派 Luna。更新：2026-09-14。

盤點來源：Shell `54165303f12c9598872905571f7162cc5f80effa`，工作區 `D:/FH6-frontend-ia-20260913/shell-race-fix`。這是來源 SHA，並非 `WAVE2_BASE_SHA`。正式開工須依 [契約與關卡](../contracts-and-gates.md) 取得 G2 PASS、當時共同基準與 ownership。

## 邊界與現有成果

可寫 `frontend/src/features/overlay_control/**`，排除 Coordinator 擁有的 `hudConfig.ts` public contract；另可寫指定 B handoff。不能改 Shell、context、locale、App.css、backend、Tauri command 或 `hud_overlay/**` renderer。

`OverlayControlRuntimeProvider.tsx` / `overlayControlRuntime.ts` 已持有 app-session config、串行保存、pending writes、units 與 runtime channel。B 沿用它，不再建第二套 store 或將設定搬回 page state。`OverlayView.tsx` 仍持有 metadata、native invoke、動作錯誤、WIP 與大量控制項，是本次拆分來源。

## 可派發工作包

| 包 | 產出提議 | 必須保留的責任 |
| --- | --- | --- |
| B1-a | `hudNativeAdapter.ts` | 封裝現有 monitor/move/toggle/click-through/reload 名稱與參數、timeout；明確區分 unsupported、失敗與成功 |
| B1-b | `useHudMetadata.ts` | styles、author cache/generation、audio、monitor 的 page reads；保留 user prefix、fallback、force refresh，離頁清理 |
| B1-c | `useHudController.ts`、`hudCapabilities.ts` | 組合現有 runtime、native、metadata；capability 只取已確認的 renderer/normalization 證據，不寫入新 config key |
| B2 | `HudWorkspace`、Setup/Layout/Advanced panels | typed props 後才委派純呈現檔案；舊 controls 逐項映射，新 composition 不遺漏樣式差異 |

Setup 預設承載啟閉、style/author、monitor、全域 scale 與 units 入口；Layout 承載 visibility/position/offset/size/opacity；Advanced 承載 colors/glow/audio/performance、style-specific 與 WIP。實作前列舊控制項到新面板的一對一清單；同一設定不重複建立 owner，沿用既有值與預設。

launch/close 的 native 結果與 config 保存結果分開呈現；不能從 `enabled` 推論外部視窗存在。audio selection 既有 config 加 `/api/audio/device` 流程、reset、S650 normalization、style discovery 均保留。page metadata 失效不得取消使用者已提交的持久寫入；離開 HUD 不關閉外部 HUD。

B 主作者持有 OverlayView/controller/native adapter。只有 props 固定並提供具體檔案名後，Luna 才能獨占新 panel 檔案；若 A/B/C 已占滿席位，先等待一條 lane 交付。不得為了多開代理而共寫相同檔案。

### 選用 B2-panel 子 lane 的移交規則

| 欄位 | 派發契約 |
| --- | --- |
| Model / task | Luna / high 起；B2-panel 子代理 ID 在實際派發後登記 |
| Branch / base | 預定 `codex/frontend-ia-hud-panels-20260914`；從已固定 B1 props 的精確 `B1_BASE_SHA` 建立獨立 worktree，不能沿用未接入 B1 的 W2 base |
| CONTRACT_SHA | 實際 panel props/export 凍結 SHA；B 主作者停寫下列三檔後才填寫 |
| AllowedPaths | 僅 `frontend/src/features/overlay_control/panels/HudSetupPanel.tsx`、`HudLayoutPanel.tsx`、`HudAdvancedPanel.tsx`，後兩者與首檔同目錄；另寫指定 `handoffs/b2-panels.md` |
| 保留給 B | OverlayView、HudWorkspace、controller、native adapter、metadata、capabilities、props 定義、所有既有/新增 tests 與 feature CSS；hudConfig.ts public contract 仍由 root 保留 |
| Handoff | Luna 記錄實際 base/head、三檔差異與 controls 對照、驗證及需求後停寫；B 讀取 handoff、整合並重驗，再接回三檔 ownership |

這些檔名及 branch 目前是提議，不宣稱已建立。若凍結時名稱改變，Coordinator 先更新完整 allowlist 才派發；未列檔案不可自行新增。B2 是依賴 B1 的工作包，不宣稱它能獨立於 B1 合併。若不啟用子 lane，三個 panels 均由 B 主作者完成。

## 完成與交接

按 [工作單 B](../work-orders.md) 及 [H/X 驗收](../acceptance.md) 驗證快速 patch、巢狀/未知欄位、慢/失敗回應、style 交錯、pending write、離頁/重入、Full/Lite 原生控制及 browser degraded 行為。沿用 runtime/scanner/elements/scale/S650 測試；只為實際抽出的純邊界新增必要測試。

交付精確 base/head、changed files、controls 對照表、public export/consumer、contract/locale requests、test/build/diff 結果、native 缺項及下一步；停止寫入後交 reviewer，Coordinator 完成 Shell 接線。未取得原生結果時 H3/H5 維持缺項，不能以 config readback 替代。

Next action：G2 通過後，Coordinator 重核當時來源並發 B1 lease。這份文件只完成設計交接，沒有建立 branch、PR、native 證據或宣告 B1/B2 完成。
