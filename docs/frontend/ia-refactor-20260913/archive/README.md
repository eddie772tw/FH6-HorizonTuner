# IA 歷史索引

現行狀態請先讀 [W4 候選入口](../README.md) 與 [P8 handoff](../handoffs/w4-p8-candidate-20260920.md)。本索引是歷史導覽，沒有授予重新開工、取回 ownership 或刪除分支的權限。

舊 handoff 與 evidence 留在原路徑，避免破壞既有引用。下列 `superseded` 指其進度／下一步已被後續交付取代；原始驗證、精確 SHA、contract 及未驗證邊界繼續保留。

| 歷史範圍 | 保留文件 | 現行解讀 |
| --- | --- | --- |
| W1 狀態基礎 | [HUD](../handoffs/hud-state.md)、[Road](../handoffs/road-state.md)、[Sessions](../handoffs/sessions-state.md)、[Tune](../handoffs/tune-state.md) | `superseded` 進度：root/provider 接線已進入後續整合；W4 owner/adapter 以 P7-A 為準，歷史 contract 不因此失效 |
| P2 Shell / G2 | [Shell handoff](../handoffs/shell-20260914.md)、[native checklist](../handoffs/g2-native-20260914.md) | `superseded` 開工 gate：本文的「W2 尚未開始」與舊 shell/head 只適用當時；native `not-run` 保留，接續實機必須用 P8 候選 |
| G2 已驗證 evidence | [browser](../evidence/g2-shell-browser-20260914.md)、[handoff race fix](../evidence/g2-race-handoff-fix-20260914.md)、[mounted reentry](../evidence/g2-mounted-reentry-20260914.md) | `historical-evidence`：原始測量／測試結果保留，只證明所列版本與條件；其 W2–W4 尚未開工的敘述已過時 |
| W2 A / C | [A handoff](../handoffs/w2-a.md)、[C handoff](../handoffs/w2-c.md) | `superseded` 待整合指令：已進 W2/W3 integration；各 lane 的當時限制仍可追溯 |
| W2 B1 / B2 | [B handoff](../handoffs/w2-b.md)、[B2 panels](../handoffs/w2-b-panels.md) | `superseded` composition 待辦：B1 歷史、B2 panel 與正式 composition 已整合；完整 native H3/H5 沒有因此通過 |
| A→D freeze | [interface contract](../handoffs/ad-interface-20260920.md) | `retained-contract`：保留設計與 ownership 的交付來源；D 實作與 coordinator 接線見後續 handoff，不重開舊 lease |
| W2 / W3 integration | [W2 snapshot](../handoffs/w2-integration-20260920.md)、[W3 snapshot](../handoffs/w3-integration-20260920.md)、[D handoff](../handoffs/w3-d.md) | `superseded` 最新候選身分：W4 已從最終 integration `147981c3ea0d68f146e0b2400d147e2346d7930e` 接續；原 branch/head/測試是歷史證據 |
| 原 W4 工作包 | [封存工作指令](w4-work-packages-20260920.md) | `superseded` 執行計畫：W4-0/P7/P8 已交付，進度看 [交付索引](../handoffs/w4-plan-20260920.md)；舊草稿 `4e24fac` 不是實際 W4 lock base |
| Original IA plan from PR #339 | [2026-09-13 plan](ia-refactor-plan-20260913.md) | `superseded` current-state entry：原計畫正文保留供追溯；目前 candidate、merge state 與實機邊界以 W4 入口及 P8 handoff 為準 |

W4-0 ledger 仍在主要索引中，因為它保留逐列 acceptance baseline 與 Post-lock 更新。P7/P8 handoff 和 evidence 也繼續作為現行候選的可追溯證據，不移入歷史目錄。

Remote WIP 名稱的 `superseded` 狀態與刪除資格分開處理。exact refs、ancestry、registered worktree 及前後快照見 [cleanup handoff](../handoffs/w4-doc-cleanup-20260920.md)；本輪只建立 audit，未刪 refs 或 worktree。
