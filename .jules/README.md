# Jules 工作日誌

`.jules/` 保存 Jules 的原始、逐任務工作紀錄，不是專案最終規範層。

在 Windows 工作樹中，Jules 日誌路徑固定使用 lowercase `.jules/`；禁止建立只差大小寫的 `.Jules/` duplicate path。

## 所有權與同步流程

```text
Jules 任務輸出 -> .jules/<log>.md -> 本地驗證 -> .agents/Journal.md -> 重複後再升級至 AGENTS.md 或 skill
```

- 具有真實 Jules 任務或發現的條目可採 append-only 方式保留。
- 保留原始日期與來源上下文。
- 需要表達成熟度時，標記 `proposed`、`adopted` 或 `superseded`。
- 未在 repository 本地重現或驗證前，不要把條目同步到 `.agents/Journal.md`。
- 不要因為某項建議出現在本目錄，就直接把它視為全域專案規則。
- 兩個條目表達相同規則時，保留資訊較完整的條目，並加入整理註記，不要再建立第三份副本。

## 日誌索引

| 檔案 | 領域 | 整理規則 |
|---|---|---|
| `bolt.md` | 效能、WebSocket lifecycle、重構與 E2E 經驗 | 新增全域規則前，先合併重疊的 60Hz/GC 條目 |
| `narrator.md` | i18n 與 release/build 流程經驗 | 升級規則前，先在目前 build script 中驗證行為 |
| `palette.md` | 無障礙與 UI 互動經驗 | 每種 accessibility pattern 只保留一條 canonical 規則 |
| `sentinel.md` | Security findings 與 mitigation | 將 vulnerability、影響、預防方式與測試證據放在一起 |

專案層級的 canonical 紀錄是 `.agents/Journal.md`；技能名稱的 canonical registry 是 `.agents/skills/README.md`。

## 語言規則

新增的 Agent/Jules 文件以繁體中文為主。既有 Jules 原始紀錄中的英文技術條目先保留，以避免改寫原始上下文；整理後的摘要與已採納規則應使用中文。
