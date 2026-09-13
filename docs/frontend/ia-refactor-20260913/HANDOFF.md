# Coordinator 交接

以下保留 2026-09-13 規劃階段的歷史交接。2026-09-14 使用者已授權實作；當前 ownership、PR 與 gate 狀態以 [執行紀錄](execution.md) 為準，G0 新證據見 [基準執行結果](evidence/g0-baseline.md)。不要將下列「未執行」當成最新狀態。

## 本輪狀態

```text
Task: 前端資訊架構重構的開發規劃
Status: handoff
Owner: 本對話 Coordinator
Task ID: 01a09aae-8ab0-7f71-8291-9716f27e41bc
Branch: codex/plan/frontend-ia-20260913
Worktree: D:/FH6-frontend-ia-20260913/plan
Base SHA: 5891d21bca35161836d84c51d1b6e9c279ec4709
Scope: 開發計畫、現況盤點、ownership、工作單、驗收與交接文件
Code implementation: 尚未開始
Implementation tasks/PRs: 尚未建立
Last updated: 2026-09-13 +08:00
```

使用者明確選擇本輪先完成計畫與交接；不啟動程式實作。本文件保留未來執行所需的 gate，並非要求目前立即執行的指令。

## 交付檔案

| 檔案 | 用途 |
| --- | --- |
| [README.md](README.md) | 單一開發執行計畫、修訂決策、依賴與里程碑 |
| [baseline.md](baseline.md) | 當前程式證據、來源 checksum、已知缺口與未測範圍 |
| [work-orders.md](work-orders.md) | Luna/Terra 分工、路徑 ownership、可派發工作單、子對話啟動條件 |
| [acceptance.md](acceptance.md) | 各 lane 行為驗收、native/遊戲證據邊界、效能量測方法 |
| [reference/source-proposal.md](reference/source-proposal.md) | 原附件全文參考，僅正規化空白與換行 |
| 本 HANDOFF.md | 任務當前狀態與下一步 |
| [docs/README.md](../../README.md) | 新增本主題的文件索引入口 |

## 本輪已完成

- 讀取附件、專案協作/測試/UI 規範與相關現況。
- 重新 fetch origin/main，確認本機/遠端基準相同，原 main 工作樹乾淨。
- 建立獨立規劃 branch/worktree；未寫入既有 main 或其他調校 worktree。
- 使用 Terra/ Terra/ Luna 三個唯讀子代理，分別盤點 Sessions/Tune、HUD、variant/Settings/test/build。
- Coordinator 交叉核對結果並修正兩項錯誤推論：race timer 原本已有 effect cleanup；telemetry channel 並非 module-level 宣告。
- 補足卸載前 state/capture gate、latest selection race、Road editor/review、HUD write ordering、shared locale/context ownership 與依賴回退。
- Terra 完成最終唯讀計畫審核；依其唯一具體建議補上 TuneSessionController/RoadValidationController 的 owner、掛載位置、最低欄位、backend resume/stop 與草稿保留驗收。
- 實作子對話僅準備工作單；沒有建立或啟動實作任務。

## 尚未執行

- 前端/後端程式修改、dependency install。
- frontend test/build、Full/Lite native smoke、HUD/MoTeC/遊戲驗收、效能 baseline。
- 實作 commit/push/PR/merge/release。
- Journal 更新：本輪是規劃與源碼盤點，沒有新增已重現的 runtime invariant，因此不升級為長期規則。

## Gate 與任務登記

| 項目 | 狀態 | 下一步 |
| --- | --- | --- |
| 規劃交付 | 文件完成，收尾驗證見下節 | 使用者可直接閱讀計畫與工作單 |
| G0 靜態 inventory | 完成於記錄的 BASE_SHA | 實作開始時刷新 main/ownership |
| G0 執行 baseline | not-run | 測試/build、Full/Lite baseline、3 次效能測量 |
| G1/C1–C5 | proposed，未 freeze | Coordinator 將設計轉為實際 typed contract |
| G2 Shell / mount | proposed | 狀態存活驗收後才能開 W2 |
| A/B/C 子對話 | 未建立；無實際 Task ID 或 lane SHA | 同一 WAVE2_BASE_SHA 派發 |
| D 子對話 | 未建立 | A foundation 已整合後派發 |
| G5 最終驗收 | not-run | 全部接線後執行矩陣 |

## 下一次恢復工作的第一步

當使用者啟動實作時，先讀 [README](README.md) 與本文件；查當前 main、origin/main、各工作樹和仍 active 的 task ownership，不直接沿用歷史 SHA。

1. 若計畫仍未提交/合併，明確提供本工作區絕對文件路徑給所有子任務，或先安排文件交付；不要假設 feature worktree 已包含本資料夾。
2. 在獨立實作分支補齊 G0。記錄既有 Settings persistence、telemetry reconnect channel 與 HUD defaults 問題的重現結果；只處理會阻礙本次 gate 的必要前置。
3. Coordinator 完成 P1/P2，保留複雜架構取捨，待 G2 與實際 main integration 完成才建立 A/B/C。
4. 使用 [work-orders](work-orders.md) 的共同前綴與 lane prompt，填入實際 BASE_SHA、CONTRACT_SHA、worktree/branch/Task ID。
5. 每個 lane handoff 後先 review 再接線；逐次更新總登記與 acceptance evidence。

未來的常規 reversible 修復與內部分工可由 Coordinator 依已授權範圍自主推進；本輪結束只是遵循使用者選擇的交付範圍，不是技能或工具拒絕。

## 文件驗證紀錄

2026-09-13 收尾結果：

- `git diff --check`：exit 0。
- 對 6 份新增文件逐檔執行 `git diff --no-index --check -- NUL <file>`：無 whitespace 問題（no-index 的差異 exit 1 是新檔與空檔不同，不是驗證失敗）。
- 6 份新增文件 UTF-8 解碼正常；18 個文件內部連結、25 個基準程式路徑存在。
- 原附件與 repository 參考副本在正規化換行/行尾空白後全文相符。
- Terra 最終計畫審核完成；controller 補充複查通過，無待處理審核事項。
- 原 main 與 origin/main 仍為所列 BASE_SHA，原 main 無本輪修改；新變更僅在規劃 worktree 的文件範圍。
- 文件未 commit、未 push；產品 test/build/native/performance 維持 not-run。
