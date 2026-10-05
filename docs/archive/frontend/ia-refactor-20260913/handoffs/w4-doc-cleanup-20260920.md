# W4-P8 後文件與 remote refs 清理交接

| Handoff 欄位 | 值 |
| --- | --- |
| Task | W4-P8 後 IA 文件清理與 W2/W3 remote refs audit |
| Status | merged |
| Owner | Codex / `/root` |
| Branch | `codex/frontend-ia-w4-doc-cleanup-20260920`（PR #408 後由 GitHub 自動清理） |
| Worktree | `D:/FH6-frontend-ia-20260920/w4-doc-cleanup` |
| Base | `33829a349277de10fa3861c366fee603bca6b307`（PR #408 merge into `main`） |
| Scope | 僅 `docs/frontend/ia-refactor-20260913/**` |
| Blocked by | None；remote deletion 不符合目前清理條件，因此保留 |
| Last updated | 2026-09-20 |

採用 `cross-agent-collaboration` 的 ownership/handoff 流程；本次只有文件狀態與保留決策，沒有可升格的產品架構新知，因此不修改 `.agents/Journal.md`。使用者 detached worktree 的未追蹤文件未被讀入、搬移或改寫；frontend/backend、formula、product schema、release artifacts、root README 及其他 worktree 都不在寫入範圍。

## 清理結果

- 新增 [W4 現況入口](../README.md) 及 [歷史索引](../archive/README.md)，讓目前工作從 P8 同一候選接續。
- [原 W4 計畫入口](w4-plan-20260920.md) 精簡為 exact 交付索引與剩餘 gate。舊工作包逐字保留於 [封存檔](../archive/w4-work-packages-20260920.md)，並指出草稿 `4e24fac` 起點已被實際 W4-0 lock `147981c3ea0d68f146e0b2400d147e2346d7930e` 取代。
- 13 份 W1/G2/W2/W3 handoff 加上 `superseded` 進度提示；A→D contract 保留有效性，3 份 G2 evidence 保留為歷史版本證據。W4-0 與 P7-A 只新增 snapshot 說明，避免舊 pending 敘述遮蔽後續有限 browser 結果。
- 原始 handoff/evidence 正文、W4-P8 handoff、P7/P8 browser evidence 與 P7-D baseline JSON 均保留；沒有把任何 `not-run` 升為 `pass`，沒有移除 `reviewHistory` 的驗證門檻。

## Stack merge reconciliation

- PR #339 merged into `main` as `7fc4795f1ff055c12df652f6f2b8f8d4b0f1c441`; aggregate PR #405 merged as `e45730e72f6ca5711f3f88c3110bb0012c0cef5b`; Shell #345 merged as `c3e04543f91b144b52b17b68354cc139d191ee11`; W2/W3 #406 merged as `28f8a0c96cb424703b6c6cbd954a578750814e99`; W4 #407 merged as `25d3f946b88f08b981d662a29152dd376d65601a`.
- After #407, this cleanup branch was re-targeted to `main`. The merge exposed one add/add conflict in `docs/frontend/ia-refactor-20260913/README.md`: the W4 current-state entry is retained as the live entry, while the original plan from #339 is preserved verbatim at [archive/ia-refactor-plan-20260913.md](../archive/ia-refactor-plan-20260913.md) and indexed in the archive README.
- The original cleanup audit recorded no ref deletion. GitHub subsequently removed merged PR head refs as part of the repository's merged-branch cleanup; the remaining W2/W3 work-package refs with registered worktrees stay retained. This handoff does not authorize further ref deletion.
- PR #408 then merged the reconciled cleanup head `d99a4dcff74ee104287a64320772b1e6b049c2f0` into `main` as `33829a349277de10fa3861c366fee603bca6b307`; the cleanup branch head was subsequently auto-removed by GitHub.

## Remote refs：audit 與 post-merge 狀態

Remote：`origin`，`https://github.com/eddie772tw/FH6-HorizonTuner.git`。前後 evidence 與 exact timestamps 見 [refs audit JSON](../evidence/w4-doc-cleanup-refs-20260920.json)。該檔保存兩次 `git ls-remote --heads origin`、工作樹 inventory、各 W2/W3 worktree status 及 ancestry 結果。

下列 7 個 heads 的 `git merge-base --is-ancestor <exact SHA> 88cf28e6152c125c1cca18dc21c3c1f46e4fbcff` 全部 exit 0，可以把「待整合」狀態標為 superseded。每個 ref 仍有 registered worktree，且 handoff 仍記錄其來源；**這不符合不再被 handoff/active worktree 使用的刪除條件**。clean status 不等於 owner 已放棄 worktree。

| Exact remote ref | 前後相同 SHA | 保留的 worktree／引用 |
| --- | --- | --- |
| `refs/heads/codex/frontend-ia-w2-a-20260919` | `c281f504de27bc387d1d4a4570d12ef0eec06eb0` | `D:/FH6-frontend-ia-20260919/w2-a`；[A handoff](w2-a.md)、[W3 integration](w3-integration-20260920.md) |
| `refs/heads/codex/frontend-ia-w2-b-20260919` | `8442bffdb9393e36a5139b751b723c220a461a08` | `D:/FH6-frontend-ia-20260919/w2-b`；[B1/B2 handoff](w2-b.md) |
| `refs/heads/codex/frontend-ia-w2-b-integrate-20260920` | `2942b3c83e1c6ab29669e9e233c69561647e9a7e` | `D:/FH6-frontend-ia-20260920/w2-b-integrate`；[B composition handoff](w2-b.md) |
| `refs/heads/codex/frontend-ia-w2-b-panels-20260920` | `288dc18659656f0906660cdecae06dcc46134456` | `D:/FH6-frontend-ia-20260920/w2-b-panels`；[B2 panel handoff](w2-b-panels.md) |
| `refs/heads/codex/frontend-ia-w2-c-20260919` | `6eb93a781f1c9a00d3a3d40815dae1d36255307e` | `D:/FH6-frontend-ia-20260919/w2-c`；[C handoff](w2-c.md) |
| `refs/heads/codex/frontend-ia-w2-integration-20260920` | `147981c3ea0d68f146e0b2400d147e2346d7930e` | `D:/FH6-frontend-ia-20260919/w2-integration`；[W3 integration](w3-integration-20260920.md)、[W4-0](w4-0-acceptance-ledger-20260920.md) |
| `refs/heads/codex/frontend-ia-w3-d-20260920` | `5cfe75e0e977d5078f253277e0bda9f8d9fcac98` | `D:/FH6-frontend-ia-w3-20260920/w3-d`；[D handoff](w3-d.md)、[W3 integration](w3-integration-20260920.md) |

原始 cleanup audit 的 before/after 中刪除 refs 為 **無**。其後 #339、#405、#345、#406、#407、#408 合併時，GitHub 自動清理已合併 PR 的 head refs；本次沒有手動刪除 remote branch、prune、刪除 local branch、移除 worktree、reset、clean、stash 或 force-push。仍存的 W2/W3 refs 與 worktree／handoff 依賴保留。branch audit 不對 tag、PR refs 或 GitHub checks 宣稱完成驗證。

JSON 的 before/after 是 cleanup 分支推送前的既有 heads 安全稽核；兩份清單須完全一致。其後唯一授權的 remote 新增是本 cleanup branch；最終 local/remote SHA 由一次 commit/push 後的交付回報提供，不把 self SHA 寫入同一 commit。

## Exact changed files

以本目錄為相對根；以下清單對應 `git diff --name-only 88cf28e6152c125c1cca18dc21c3c1f46e4fbcff`：

- `README.md`
- `archive/README.md`
- `archive/w4-work-packages-20260920.md`
- `evidence/g2-mounted-reentry-20260914.md`
- `evidence/g2-race-handoff-fix-20260914.md`
- `evidence/g2-shell-browser-20260914.md`
- `evidence/w4-doc-cleanup-refs-20260920.json`
- `handoffs/ad-interface-20260920.md`
- `handoffs/g2-native-20260914.md`
- `handoffs/hud-state.md`
- `handoffs/road-state.md`
- `handoffs/sessions-state.md`
- `handoffs/shell-20260914.md`
- `handoffs/tune-state.md`
- `handoffs/w2-a.md`
- `handoffs/w2-b-panels.md`
- `handoffs/w2-b.md`
- `handoffs/w2-c.md`
- `handoffs/w2-integration-20260920.md`
- `handoffs/w3-d.md`
- `handoffs/w3-integration-20260920.md`
- `handoffs/w4-0-acceptance-ledger-20260920.md`
- `handoffs/w4-doc-cleanup-20260920.md`
- `handoffs/w4-p7-a-adapter-register-20260920.md`
- `handoffs/w4-plan-20260920.md`

## Verification

| 檢查／命令 | 結果與範圍 |
| --- | --- |
| Node inline Markdown 相對檔案連結檢查 | pass；本目錄 30 份 Markdown、127 個相對檔案目標存在；排除 fenced code／外部 URL，不宣稱外部 URL 可用性 |
| `git show <base>:<file>` 與 Node 正文比對 | pass；19 份既有文件移除新增頂端提示後，正文與 base 完全相同（換行標準化比較） |
| 原 W4 工作包與 archive 比對 | pass；自「W4 工作包與依賴」起逐字一致（換行標準化比較）；原檔 blob 保留在 archive 來源說明 |
| W4 保護檔案比對 | pass；P8 handoff、5 份 P7/P8 Markdown evidence 及 P7-D baseline JSON 共 7 檔未變 |
| JSON parse／remote snapshot 一致性 | pass；before `2026-09-20T04:22:20.309Z`、after `2026-09-20T04:27:42.812Z`，28 個既有 heads 完全相同，deletedRefs 為空 |
| `git merge-base --is-ancestor <SHA> <candidate>` | pass；7/7 W2/W3 exact heads 已包含於 W4，7/7 仍有同 SHA 的 registered worktree |
| `git diff --check` / `git diff --cached --check` | pass；含新增文件的 whitespace／patch 檢查；Git 換行設定只造成既有 LF/CRLF normalization 提示 |
| `git diff --cached --name-only`／scope review | 25 檔，全數位於本目錄；`git diff --cached --exit-code -- frontend backend` 無差異 |

以上是本次文件／ref audit 的驗證，不是新的產品測試。最終交付另執行一次 `git commit`、`git push -u origin codex/frontend-ia-w4-doc-cleanup-20260920`，並以 `git rev-parse HEAD`、`git ls-remote origin refs/heads/codex/frontend-ia-w4-doc-cleanup-20260920` 核對；實際 commit SHA 與 clean status 記錄於交付回報。

產品 tests/build/typecheck、browser/native/game、X3/X4/G5 與 remote CI **本次未執行**：純文件修改依 `.agents/AGENTS.md` 使用 docs/link/diff 驗證；既有 P8 結果保留為原候選歷史 evidence，不冒充 cleanup head 的新產品驗證。

## Pending / Next action

已完成 root 接手、docs-only merge reconciliation、PR #408 exact-head reviewer、CI 與 main 合併；目前文件清理已納入 `main`，不再有待合併動作。

7 個 W2/W3 refs 是「可標記進度已 superseded、但目前不可刪」的清理候選。若後續仍要刪除，root 須先取得各 lane 停用／釋放 worktree 的明確證據，確認 handoff 不再依賴 branch 名稱作為活躍入口，重查 exact remote SHA、ancestry、worktree 與任何 PR/owner，再保存當次 `git ls-remote` 前後證據；此 handoff 本身不授權刪除。

root shared README 的狀態入口可另行同步：`README.md:70` 與 `README.en.md:69` 仍指向舊 Shell handoff。此次已在 Shell 頂端提供 W4 現況連結，所以舊連結可用；root 可將主 README 的進度連結改指本目錄 README。這兩檔不在本 owner 的修改範圍。
