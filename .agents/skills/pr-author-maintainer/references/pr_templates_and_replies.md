# PR Body 範本與 Reviewer 互動回覆規格 (PR Templates & Replies)

## 1. PR Body 標準結構範本

所有介面調整 PR 必須依 [ui-visual-review.md](../../../rules/ui-visual-review.md) 填寫下方 Visual Review（或同義）區塊並嵌入實際圖片；純非介面 PR 可省略該區塊或註明無介面變更。產生器僅提供通用草稿，作者須補齊適用欄位；validator 只驗證格式，不判斷視覺覆蓋或圖片真實性。

```markdown
### Summary of Changes
簡述此 PR 解決的問題、背景與核心變更目標。

### Key Modifications
- **[模組/組件名稱]**：條列具體修改重點（避免流水帳，強調設計決策與架構影響）。
- **[檔案/工具變更]**：說明新增或更新的模組。

### Pre-Commit & Local Verification
- **Rust Backend / CLI Tests:** `cargo test --locked --manifest-path backend-rust/Cargo.toml` (X passed)
- **Optional Python Tool Checks (only when changed):** uv-managed Ruff and focused `scripts/tests/` (pass)
- **Frontend Tests:** `vitest` (Y tests passed, 0 failed)
- **Frontend Build:** `pnpm build` (pass, assets verified)

### Visual Review / 視覺審查
- **擷取版本與環境**：日期、commit（與現有 head 的關係）、平台／瀏覽器、viewport、語系、主題／模式。
- **畫面與狀態**：說明改動及本圖所示狀態；依覆蓋矩陣提供跨設計系統日夜、窄幅及各新增樣式圖片。
- **資料與重現**：真實資料或 fixture、相關設定、腳本／操作步驟；HUD 另列 scale／DPR／背景。
- **備查與界線**：完整圖集／紀錄連結、檢查結果、未涵蓋的原生／遊戲／裝置／讀屏驗收。

![受影響介面與狀態說明](可持續存取且對應擷取版本的實際圖片連結)

### Living Changelog & Review Iterations
- 2026-08-18 (Gemini as Antigravity): Initial PR created.
- 2026-08-18 (Gemini as Antigravity): Addressed review findings from Codex (refactored boundary checks).

### Related Issues / References
- Closes #123 (或關聯 issue / task)

---
Author / Maintainer: {代號} as {Agent}
```

---

## 2. 與 Reviewer 互動與結構化回覆範本

當收到 Reviewer（如 Codex, Jules, 人類）提出的 Top-level Review 或 Inline Comments 時，回覆時應條列式對應 Reviewer 的 Findings，保持客觀與技術嚴謹：

```markdown
### {代號} as {Agent} response — Review findings addressed.

針對審查意見之處置說明：

- **[Fixed in commit abc1234] `{path/to/file:line}`**:
  已依建議加入除數為 0 之防護邏輯，並於單元測試補足邊界測試。
- **[Test Code Integrated in commit abc1234] `{path/to/test_file.py}`**:
  已將 Reviewer 提供的邊界測試案例整合入測試套裝中，並於本地重現驗證修正後全數 Pass。
- **[Clarification / Technical Rationale] `{path/to/file:line}`**:
  針對此處架構設計，因考量 60Hz 遙測高頻循環不得有任何同步阻塞 I/O，故採用快取機制而非每次重讀。詳細物理推導如附。
- **[Suggestion Applied] `{path/to/file:line}`**:
  已套用 Reviewer 的 Code Suggestion。

**Latest Verification Status:**
- `cargo test --locked --manifest-path backend-rust/Cargo.toml`: X passed (Rust 產品案例)
- 選用 Python 工具案例（若本次修改）：uv 執行對應 `scripts/tests/`
- `vitest`: Y passed
- All pre-commit checks pass locally.

Author: {代號} as {Agent}
```

### 3. 回覆原生 GitHub Inline Review Thread API
若需要透過 API 回覆特定 Inline Review Thread，使用 GitHub REST API 端點：
`POST /repos/{owner}/{repo}/pulls/{pull_number}/comments/{comment_id}/replies`
或透過專案輔助工具：
`manage_pr_author.py --pr <number> --reply-thread <comment_id> --body-file scratch/reply.md --identity "{代號} as {Agent}"`
