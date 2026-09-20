# W3 D：Road review 交接

- Task / Status：Road review library/detail；handoff，實作、frontend gate 與隔離 browser fixture smoke 完成，D 停寫；真實 Sessions 接線與整合驗收待 coordinator。
- Owner / Agent ID：Codex / `/root/w3_d_road_review`。
- Worktree：`D:/FH6-frontend-ia-w3-20260920/w3-d`。
- Branch：`codex/frontend-ia-w3-d-20260920`。
- BASE_SHA / CONTRACT_SHA / transfer SHA：`b780e0c0000a6c7ae613369e38eaa6715a7355f8`。
- Implementation SHA：`931ead0dad1684a51579cdf61b9172792cc90e78`（第一里程碑，已推送）。
- Final code SHA：`1f6c3abf6aa78353fb89a7045025a93396dc014c`（null-response 修正，已推送且 `git ls-remote` 核對一致）。本 handoff 的最後提交僅補交接文字，產品 tree 相同。
- 依據：`ad-interface-20260920.md`；wave2 preparation 的 work-orders / ownership / validation，以及 coordinator 的七檔 exact lease。
- 採用技能：`halfmoon-design-system`、`huge-component-refactoring`、`modular-refactoring`、`cross-agent-collaboration`。Browser smoke 使用 `computer-use` 的 browser surface。

## Changed / write lease

1. `frontend/src/features/road/RoadReviewLibrary.tsx`
2. `frontend/src/features/road/RoadReviewView.tsx`
3. `frontend/src/features/road/roadReviewIo.test.ts`
4. `frontend/src/features/road/roadReviewIo.ts`
5. `frontend/src/features/road/roadReviewTypes.ts`
6. `frontend/src/features/road/useRoadReview.ts`
7. 本 handoff。

未取得 Sessions、App/Shell、RoadValidationController、roadValidationState、Tune provider/workflow、backend、lang 或 shared CSS ownership；全部保留。

## Public exports / consumer contract

- `RoadReviewLibrary({ workflowId?: string, onSelectWorkflow: (workflowId: string) => void, io?: RoadReviewIo })`：列出 saved Road workflows，selection 只由 callback 交給 Sessions owner。
- `RoadReviewView({ workflowId: string, onReturnToTune: () => void, io?: RoadReviewIo })`：只讀所選 workflow，明確 Return to Tune。必須位於既有 `RoadValidationProvider` 與 `SettingsProvider` 下；不掛第二個 provider。
- `createRoadReviewIo(fetcher?)`：保留既有 GET library/detail/capture、POST comparisons/decisions；驗證回應 shape、workflow identity 與 capture run reference。
- `createRoadReviewGuard()`：request lease 使用 workflow id、selection generation、channel generation；舊 mutation 仍可 settlement，但不會套用到新 selection。
- `useRoadReview` 使用既有全域 `beginOperation` / `finishOperation`。Browse／decision 不调用 selectWorkflow、setSetupId、setCandidateDraft，也不寫入 `road-selected-workflow`。
- `RoadCompare` 為只讀 import；保存比較與 A/B/retest decisions。finish、saved observations、candidate setups、feedback、saved choices 與完整 documents 保留可見。candidate/finish 的編輯透過 Return to Tune 繼續。
- 真實產品 consumer 待 coordinator 在 Sessions 接線；目前 build 僅驗證 exports 的型別，不能宣稱 Sessions UI 已整合。

## Verification

- `pnpm install --frozen-lockfile`：exit 0，此 worktree 自有 node_modules。
- 修改前 `cmd /c "pnpm -C frontend run test"`：124 files / 869 tests。
- `cmd /c "pnpm -C frontend exec vitest run src/features/road/roadReviewIo.test.ts"`：1 file / 15 tests。
- 修改後 `cmd /c "pnpm -C frontend run test"`：125 files / 884 tests，exit 0。
- `cmd /c "pnpm -C frontend run build"`：exit 0，Full `dist/index.html`、Lite `dist/lite/index.html` 均生成。
- `git diff --check`：exit 0。
- build 首次找到 ES2022 `.at` / `Object.hasOwn` 與現行 target 不相容；已換為 `.slice(-1)[0]` / `hasOwnProperty.call`，沒有改 tsconfig。
- 最後完整 gate 於 09:55 再跑：125 files / 884 tests、Full/Lite build、diff check 全部 exit 0，對應 Final code SHA 的產品內容。
- 修正成功 HTTP 200 JSON `null` 不可冒充 404 missing；新增 regression assertion。404 以內部 sentinel 辨識。
- Browser / native / game / performance：browser fixture 通過下列互動；integrated Full/Sessions、native、game、performance not-run。本輪不要求 native/Tauri。

## Browser evidence 與限制

- 執行時間：2026-09-20 09:48–09:55 Asia/Taipei；background IAB、temporary Vite `127.0.0.1:1443`，完成後關閉自己建立的 tab/server。
- 可重跑 fixture 與摘要：`D:/FH6-frontend-ia-w3-20260920/w3-d-evidence/server.mjs`、`smoke.tsx`、`browser-evidence.md`（repo 外本機證據，不屬產品檔）。從本 worktree `frontend` 執行 `node D:/FH6-frontend-ia-w3-20260920/w3-d-evidence/server.mjs`，開啟 `/road-review-smoke.html`。
- 實際載入 D 的 library/view/hook/IO 模組與既有單一 RoadValidationProvider；僅 API 資料是 memory fixture。不是 Full App/Sessions 接線、真實 backend 或遊戲證明。
- 通過：library→A detail、正確 saved A/B runs、compare 路徑／payload、keep-candidate / keep-baseline / retest-baseline、saved choices、finish、four-wheel/channel/lap observations、candidate setup 展開、empty、missing、loading、503/error 與恢復。
- 全程可見 Tune selection 與 `road-selected-workflow` 維持 `tune-original`；Return callback 僅在明確按鈕點擊後觸發。
- pending A decision 期間改選 B：buttons 遵循 shared operation lock；放行 A 回應後 global operation 成為 succeeded，B heading/documents/notice 保持，沒有套用舊 A 結果。
- Capture export affordance：按鈕可用，點擊後沒有 export error；IAB 10 秒內未回報 download event，因此沒有檔案落地／內容驗證宣稱。
- 390 px main / 358 px review 的窄容器、dark/light × 三個 core DOM checks：六組 root scrollWidth=clientWidth=1272、heading text/color 可讀取。這是 layout/DOM 檢查，不是 390 px viewport 或視覺像素證明。
- IAB screenshot capture timeout，未完成 screenshot visual QA；content export 不支援。fixture 重啟時有 HMR createRoot warning 與 settings fetch errors，reload 後恢復；詳見 browser-evidence.md。
- R1–R5 / T1–T4 / S1–S2：僅上述 D-owned component 子集合有 browser fixture evidence；完整跨 Sessions/Tune contract 由 coordinator 接線後重驗。

## Pending / next action

- Stopped-writing：2026-09-20 09:58 Asia/Taipei；D 在最後 handoff commit/push 後釋放七檔 ownership。接手前以 branch HEAD 核對最後文件提交。
- Coordinator 接線 library/detail、驗證 Sessions intents / Return to Tune、跨頁 lifecycle，再登記 AD_INTEGRATION_SHA。
- 尚未移交舊 reviewHistory adapter，不做 cleanup。沒有 merge main 或 PR。
- 新 UI 字串未修改 lang；coordinator 可統一處理 locale request（Saved Road workflows、Road validation review、Saved Road workflow、Return to Tune、各 loading/empty/missing/error/retry、Saved baseline and candidate setups、Saved choices 等）。
- 暫時實作資訊記於本 handoff，不修改未授權的 Journal；沒有新物理公式或 API schema。

Last updated：2026-09-20。
