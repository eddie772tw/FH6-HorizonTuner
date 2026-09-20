# W3 D：Road review 交接

- Task / Status：Road review library/detail；active，實作與 frontend gate 完成，browser evidence 待補。
- Owner / Agent ID：Codex / `/root/w3_d_road_review`。
- Worktree：`D:/FH6-frontend-ia-w3-20260920/w3-d`。
- Branch：`codex/frontend-ia-w3-d-20260920`。
- BASE_SHA / CONTRACT_SHA / transfer SHA：`b780e0c0000a6c7ae613369e38eaa6715a7355f8`。
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
- Browser / native / game / performance：browser pending；native / game / performance not-run。本輪不要求 native/Tauri。

## Pending / next action

- 完成隔離 browser fixture smoke，補 exact implementation SHA、push evidence 與 stopped-writing timestamp。
- Coordinator 接線 library/detail、驗證 Sessions intents / Return to Tune、跨頁 lifecycle，再登記 AD_INTEGRATION_SHA。
- 尚未移交舊 reviewHistory adapter，不做 cleanup。沒有 merge main 或 PR。
- 新 UI 字串未修改 lang；coordinator 可統一處理 locale request（Saved Road workflows、Road validation review、Saved Road workflow、Return to Tune、各 loading/empty/missing/error/retry、Saved baseline and candidate setups、Saved choices 等）。
- 暫時實作資訊記於本 handoff，不修改未授權的 Journal；沒有新物理公式或 API schema。

Last updated：2026-09-20。
