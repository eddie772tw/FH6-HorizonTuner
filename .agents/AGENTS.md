# FH6-HorizonTuner 開發守則 (AGENTS.md)

## 任務入口與技能發現 Gate

每個任務在執行程式碼修改或任務專用命令前，必須先完成以下步驟：

1. 閱讀本檔、[`.agents/rules/workspace.md`](rules/workspace.md)、[`.agents/Journal.md`](Journal.md)，並檢查 [`.agents/skills/README.md`](skills/README.md)。
2. 以 `.agents/skills/<directory>/SKILL.md` 的資料夾名稱作為 canonical skill ID；不要從舊日誌或非現存名稱推測技能名稱。
3. 依任務觸發條件選取技能，完整讀取被選取的 `SKILL.md`，再讀取它明確要求的 references。
4. 若修改 UI、巨型元件、物理公式、UDP 協定、模組架構或執行 Jules 委派，必須在任務紀錄中列出實際採用的 skill ID。
5. 任務結束時檢查技能名稱、文件路徑與驗證命令是否仍然有效；發現命名不一致時先修正索引與 frontmatter。

Canonical skill registry 位於 [`.agents/skills/README.md`](skills/README.md)。目前專案技能 ID 包含：
`halfmoon-design-system`、`huge-component-refactoring`、`jules_coding`、
`modular-refactoring`、`physics-tuning-math`、`telemetry-udp-protocol`、
`cross-agent-collaboration`、`agent-governance-audit`、
`portable-release-validation`、`pr-review-evaluation`、
`pr-author-maintainer`、`github-security-audit`。

Agent 文件、技能說明、工作日誌與規範內容以繁體中文為主。只有技能 ID、檔名、API、CI、React、TypeScript 等技術專有名詞，以及可能造成歧義的術語保留英文。所有 PR 審查與作者留言均須以 `{代號} as {Agent}` 身分標記以區分共用 GitHub 帳號時之發言主體。

---

## 專案核心事實與領域規範 (Core Invariants)

1. **UDP 高頻效能保護**：`backend/telemetry_listener.py` 負責以 60Hz+ 頻率接收 Forza 遊戲 UDP 遙測封包。此循環內**絕不可放置同步阻塞 (Synchronous Blocking) 或高開銷的 I/O 操作**。
2. **車輛物理與調校邏輯單一真理 (SSOT)**：所有懸吊、彈簧磅數、防傾桿 (ARB) 與齒輪比算牌公式，必須嚴格維持為純函數 (Pure Functions)，且統一收攏於 `frontend/src/utils/tuningMath.ts`。
3. **單位嚴格性**：處理遙測數據時，必須釐清遊戲原生單位、領域單位與顯示單位的分層轉換，不得在 UI 組件內任意硬編碼物理計算公式。
4. **路徑安全與檔案存取規範 (Path Security)**：所有涉及外部輸入、檔案名稱、Preset 或 Session 存取的模組，必須使用 `backend/path_security.py` 的 `safe_resolve_path` / `safe_join_under_dir` 進行目錄包含性檢驗，嚴禁直接拼接外部輸入路徑。

---

## 專案架構規範體系 (Modular Rules Index)

具體架構、環境契約與實作合約收攏於 `.agents/rules/` 模組化體系，Agent 執行對應領域任務時必須遵循：

- **[工作區邊界與驗證關卡 (workspace.md)](rules/workspace.md)**：前後端職責隔離、HUD 目錄合約與任務驗證關卡。
- **[Python 3.13 / uv 工具鏈標準 (python-uv.md)](rules/python-uv.md)**：虛擬環境管理、`uv run --no-project` 命令防呆與禁止激活規範。
- **[網路連接埠傳輸契約 (network-ports.md)](rules/network-ports.md)**：UDP 8000 遙測與 HTTP 8001 API 端點隔離、Release 動態 Port 機制。
- **[測試策略與反過度測試規範 (testing-strategy.md)](rules/testing-strategy.md)**：測試金字塔三層分流、反微觀 Canvas 座標斷言、反 YAML 測試與 Vitest 單元測試合約。
- **[前端 UI 與設計系統架構 (ui-architecture.md)](rules/ui-architecture.md)**：Halfmoon CSS 雙層架構、Anti-FOUC、全域 `ModalPortal` 護欄、向下 Popover 與 Wizard 獨立組件規範。
- **[第三方套件引入與防幻覺查驗協議 (dependencies.md)](rules/dependencies.md)**：Registry 官方 CLI 驗證指令、寬鬆開源授權核准與依賴鎖定。

---

## 開發邊界限制 (Boundary Guardrails)

* **必須做的事**：
  - 修改 `tuningMath.ts` 或 `tuningDiagnosis.ts` 後，確認前端單元測試全數通過（`cmd /c "pnpm -C frontend run test"`）。
  - 修改後端 UDP 解析或業務邏輯後，確認後端單元測試全數通過（`uv run --no-project --python .venv\Scripts\python.exe python -m pytest tests/`）。
  - 前端 UI 開發或變更時，必須遵循 [ui-architecture.md](rules/ui-architecture.md) 與 [halfmoon-design-system](skills/halfmoon-design-system/SKILL.md)。
  - 任務結束後主動回顧開發過程，並於 [Journal.md](Journal.md) 追加已驗證紀錄。
  - 重大架構或核心模組變更時，主動同步更新 `README.md` 與 `README.en.md`。
  - 維護 `.gitignore`，確保快取、使用者數據與暫存檔被嚴格排除。
* **詢問後才做的事**：
  - 修改 UDP 封包解構格式 (Packet Structure Byte Offsets)。
  - 引入全新的 npm、pip 或 cargo 第三方相依套件（必須先執行 [dependencies.md](rules/dependencies.md) 防幻覺查驗協議）。
* **絕對不做的事**：
  - 在接收 UDP 封包的非同步主迴圈中加入同步檔案寫入或網路請求。
  - 為了方便而在 UI 組件內直接寫死物理調校計算公式。
  - 嚴禁在 UI 字串或 UI 組件內直接加入裝飾性 Emoji 圖示。
  - 嚴禁編寫以正則/字串比對 YAML/JSON/Workflow 設定檔內容的單元測試。
  - 嚴禁在 UI/Canvas 測試中斷言底層 API 呼叫次數或硬編碼像素座標。
  - 嚴禁將啟動 Live Binary 的 Heavy E2E 測試混入日常 Unit Gate。
  - 嚴禁使用 Windows 命令列（如 `echo` 或 `>>`）附加中文文字至 Markdown 檔案（防止 Code Page 編碼損毀）。

---

## 開發紀錄日誌與任務完成檢核表 (Task Completion Checklist)

專案設有 [Journal.md](Journal.md) 機制，任務開始前優先閱讀以瞭解歷史避坑指南；任務結束後若發現關鍵學習點，依規範登錄。

在宣佈任何開發/重構任務完成前，Agent 必須依序確認：
1. 執行單元測試（後端 `pytest tests/` / 前端 `pnpm -C frontend run test`）並確保全數 Pass。
2. 執行代碼檢查（`ruff check .` / `ruff format --check .` / `git diff --check`）確保無格式與空白異常。
3. 評估本次任務是否有值得傳承的架構學習點，自動追加紀錄至 [Journal.md](Journal.md)。
4. 維護 `.gitignore` 與 `README.md` 說明文件狀態。
