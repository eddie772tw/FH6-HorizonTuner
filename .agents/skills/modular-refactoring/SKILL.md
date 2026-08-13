---
name: modular-refactoring
description: 當需要拆分底層邏輯、建立功能模組、整理 domain/API 邊界或建立跨前後端型別契約時觸發此技能。
---

# 模組化拆分與重構

## 與其他 skill 的分工

- 巨型 UI 元件、Canvas 或 60Hz render hot path：使用 `huge-component-refactoring`。
- Python/TypeScript 模組邊界、domain logic、API contract 與可測試性：使用本技能。
- 兩者皆適用時，先讀 `huge-component-refactoring` 保護高頻行為，再用本技能整理契約。
- Codex、Antigravity 或 Jules 非同步協作時，同時讀 `cross-agent-collaboration`。

## Python tooling

Backend Python commands follow [../../rules/python-uv.md](../../rules/python-uv.md). Use `uv run --no-project --python .venv\\Scripts\\python.exe python -m pytest tests/` and never a bare `python`, `pip`, or `pytest` command.

## SOP

1. 讀取 `AGENTS.md`、相關 rule、Journal 與目標 skill；確認 ownership、dirty worktree 與不可變更範圍。
2. 先定義輸入/輸出的 TypeScript Interface、TypedDict 或 Dataclass，不以內部實作細節作為跨模組契約。
3. 抽離純函式與 domain logic；物理計算、遙測解析與單位轉換不得散落在 UI。
4. 先補 isolation tests，再接回 UI 或主流程：前端使用 Vitest，後端使用 Pytest。
5. 驗證循環依賴、錯誤處理、向後相容性與序列化格式；不得以重構名義改變公式或 API 語意。
6. 執行 `cmd /c "pnpm -C frontend run test"`、`uv run --no-project --python .venv\\Scripts\\python.exe python -m pytest tests/` 或與範圍相符的測試，最後執行 `git diff --check`。
7. 將已驗證的新邊界或決策記錄到 Journal，並在 handoff 中寫出剩餘工作與驗證結果。

## 反模式

- 循環依賴或把 shared module 變成無界的 God module。
- 一個元件同時處理 WebSocket、物理計算、State 與 UI 繪製。
- 沒有測試基準就大量搬移檔案。
- 把未驗證的 Jules/Antigravity 建議直接升格為專案規則。
