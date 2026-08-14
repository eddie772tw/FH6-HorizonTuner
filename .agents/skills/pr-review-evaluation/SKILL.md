---
name: pr-review-evaluation
description: 當需要評估一個 PR、或完成一個分支的開發並提交 PR 後，針對該 PR 的狀態進行 Merge 評估或修改意見發表時觸發。
---

# PR Review 評估與意見標準化

## 觸發條件
當完成一個分支的開發並提交 Pull Request (PR)，或收到評估特定 PR 的請求時，觸發此技能來檢查 PR 狀態並標準化 Review 意見的格式。

## 評估流程
1. **抓取狀態**：使用 `gh pr view <number>` 及 `gh pr checks <number>` 或相關指令抓取目前的 PR 狀態、CI/CD 測試結果。
2. **審查錯誤**：若有 CI/CD 錯誤，深入抓取相關 Log 了解失敗原因 (例如透過本地重現或拉取遠端 log)。
3. **前置意見參考**：使用 `gh pr view <number> -c` 檢視其他 Agent (如 Codex) 或使用者的 Review Comment 作為背景參考。**不需要強求意見一致性**，鼓勵 Agent 依照自身的判斷、專長與驗證結果，提出不同視角的見解與獨立意見。

## Review Comment 標準格式
所有提交的 Review 必須包含以下結構，並確保語氣專業客觀：

```markdown
{Agent Name} review — {結論摘要, e.g., blocking findings recorded / ready to merge}.

**CI Status & Local Verification:**
簡述目前的 Actions 狀態及本地驗證的結果 (例如哪些 Job 失敗、哪些成功，具體報錯點為何)。

**Findings & Assessment:**
- 條列式指出需要修正的具體問題 (型別錯誤、邏輯缺失、缺乏驗證等)。
- 提出修改建議與處理方案。
- 參考其他 Agent 的意見時，可於此明確表態同意、補充，或**提出不同的獨立見解** (例如 "While Codex suggested..., I recommend... based on...")。

**Inline Comments (Optional):**
- 若有特定的程式碼段落需要被引用並單獨發表意見（例如指出具體的問題等），可在此標明檔案名稱與行號，並附加具體意見（例如：`src/utils/math.ts:L45` - 這裡的計算缺乏邊界保護...）。

**Next Steps:**
- 說明通過條件 (例如：請修正上述錯誤並確保所有 CI matrix 全數轉綠)。
- 說明何時可以再次請求 Review 或進行 Merge。

Reviewer: {Agent Name}
```

## 提交方式
1. 將構建好的 Review Comment 存入暫存檔案 (例如 `scratch/review.md`)。
2. 使用 `gh pr review <number> --comment --body-file <path>` 或對應指令送出 Review。
3. 若 PR 完全符合規範且 CI 通過，可向使用者建議 approve 或合併。
