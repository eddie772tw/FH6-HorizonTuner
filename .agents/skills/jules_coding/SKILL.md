---
name: jules_coding
description: 當使用者明確授權且 Jules connector/API client 可用時，委派高風險重構、大型相依升級、資源密集測試或需要遠端工作區的任務。
---

# Google Jules 委派與驗收流程

## 使用邊界

- 必須取得使用者明確授權；任務很大不代表已授權。
- 必須具備可驗證的 Jules connector/API client、`JULES_API_KEY` 與已綁定的 GitHub repository。
- 沒有正式 connector 時，不得猜測 endpoint、session、狀態、PR 或測試結果。
- 小型文件調整、可在本地快速完成的修復，以及沒有清楚驗收條件的探索任務，不應委派。

## 委派前

在 request 或 handoff 中明確寫出：任務目標、檔案範圍、不可修改範圍、驗收條件、測試命令、branch/PR 預期與風險。遵守 `cross-agent-collaboration` 的 ownership 規則，不得與本地或 Antigravity 同時修改同一檔案。

## 追蹤與驗收

1. 透過正式 connector 建立任務並追蹤狀態。
2. 若 Jules 回報 `AWAITING_PLAN_APPROVAL`，先把計畫交給使用者確認，不得自行批准。
3. 完成後取得 diff、測試結果與相關 artifact；本地檢查範圍、相依套件、安全性、效能與回歸風險。
4. 在本地重新執行必要測試與 `git diff --check`；未驗證前不得合併、覆蓋 dirty worktree 或推送。

## 日誌邊界

- `.jules/*.md` 是 Jules 原始英文工作日誌，保留英文與原始紀錄，不翻譯、不重寫。
- `.agents/Journal.md` 只收錄本地驗證後的結論，並標記來源、日期、驗證方式與 `proposed`、`adopted` 或 `superseded` 狀態。
- 只有重複且已驗證的結論，才可升格到 `AGENTS.md`、rules 或其他 skill。
