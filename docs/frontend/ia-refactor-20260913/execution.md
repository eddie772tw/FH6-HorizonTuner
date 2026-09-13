# IA 執行紀錄

更新：2026-09-14。Owner：Coordinator / Codex。Status：active。

## 目標與交付狀態

依開發計畫實作至 G5 真實證據驗收前。G0–G4 與非 G5 細項 PR 必須完成實作、對應本機檢查、精確 head 的 CI、獨立審查及評論處置；尚待 G5 真實證據的相關 PR 保留 draft。Ready for review 與實際可合併條件分開核對，不以 draft flag 代替審查。未授權自動合併 main，採有明確相依順序的 PR 與隔離整合分支。

| Gate | 狀態 | 當前證據 / 下一步 |
| --- | --- | --- |
| G0 | active | main 與 origin/main 均為 `5891d21bca35161836d84c51d1b6e9c279ec4709`，main clean；獨立 baseline worktree 正在準備 test/build。native/performance 尚未執行。 |
| G1 | active | Coordinator 建立 pure workspace/variant/intent 契約；Tune、Road 各自建立 session controller。尚未 freeze。 |
| G2 | pending | 等待狀態 controller、Shell 與跨頁驗證；未允許 W2 寫入。 |
| G3 | pending | A/B/C 尚未啟動。 |
| G4 | pending | D 尚未啟動。 |
| G5 | pending external evidence | 開發與驗收準備仍在本次 scope；真實 native/game/performance 的必要證據未取得前不宣告整體 done。 |

## 目前 ownership

所有工作區均在 `D:/FH6-frontend-ia-20260913/`；main 與其他 tuning worktree 不修改。

| 任務 | 模型 / owner | Worktree / branch | 獨占寫入 |
| --- | --- | --- | --- |
| 計畫、PR 協調 | Coordinator | `plan` / `codex/plan/frontend-ia-20260913` | 本計畫與索引 |
| P1 contracts | Coordinator | `contracts` / `codex/frontend-ia-contracts-20260914` | `app/**`、App/LiteApp、Navigation/LiteNavigation 及 dead HUD props；其餘共享路徑按需要宣告 |
| W1 Tune state | Terra xhigh / `tune_state` | `tune-state` / `codex/frontend-ia-tune-state-20260914` | `features/tuning/**` 與自身 handoff；不移除 reviewHistory |
| W1 Road state | Terra xhigh / `road_state` | `road-state` / `codex/frontend-ia-road-state-20260914` | `features/road/**` 與自身 handoff；保留既有結果操作 |
| G0 evidence | Luna high / `baseline_evidence` | `baseline` / detached baseline SHA | 僅 scratch 證據，產品唯讀；不啟動共用 port 的程序 |

共同 BASE_SHA 為上表 G0 SHA。Tune/Road 先各自通過 baseline test，再修改；完整 test/build/diff-check 通過後可 commit 自己的 scope，root 統一接線、審查與發布 PR。每個 worktree 獨立依賴。G2 未通過前，不啟動 W2 A/B/C。

## 採用技能

`cross-agent-collaboration`、`halfmoon-design-system`、`huge-component-refactoring`、`modular-refactoring`、`pr-author-maintainer`。公式、UDP、backend/schema、HUD renderer、release runtime 不在此次變更範圍。

## PR / 驗證記錄

尚未建立此計畫的 PR。既有 #337、#338 為其他工作，未納入本任務。規劃期間的 test/build not-run 是歷史狀態；本次執行結果逐項追加於此，不回填虛構證據。
