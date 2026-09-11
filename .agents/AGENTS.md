# FH6-HorizonTuner 開發守則 (AGENTS.md)

## 任務入口與技能發現 Gate

每個任務在執行程式碼修改或任務專用命令前，應遵循按需載入 (On-Demand Loading) 原則：

1. 以 `.agents/skills/<directory>/SKILL.md` 的資料夾名稱作為 canonical skill ID；不要從舊日誌或非現存名稱推測技能名稱。
2. 依任務需求從 [`.agents/skills/README.md`](skills/README.md) 比對觸發條件，僅完整讀取被選取的 `SKILL.md`，再依該技能指示讀取其特定 references；嚴禁在無關任務中預先通讀所有規則或歷史日誌。
3. 若修改 UI、巨型元件、物理公式、UDP 協定、模組架構或執行 Jules 委派，必須在任務紀錄中列出實際採用的 skill ID。
4. 任務結束時檢查技能名稱、文件路徑與驗證命令是否仍然有效；發現命名不一致時先修正索引與 frontmatter。

Canonical skill registry 位於 [`.agents/skills/README.md`](skills/README.md)。目前專案技能 ID 包含：
`halfmoon-design-system`、`huge-component-refactoring`、`jules_coding`、
`modular-refactoring`、`physics-tuning-math`、`telemetry-udp-protocol`、
`cross-agent-collaboration`、`agent-governance-audit`、
`portable-release-validation`、`pr-review-evaluation`、
`pr-author-maintainer`、`github-security-audit`。

Agent 文件、技能說明、工作日誌與規範內容以繁體中文為主。只有技能 ID、檔名、API、CI、React、TypeScript 等技術專有名詞，以及可能造成歧義的術語保留英文。所有 PR 審查與作者留言均須以 `{代號} as {Agent}` 身分標記以區分共用 GitHub 帳號時之發言主體。

---

## 文件與規範權責分工 (Documentation SSOT Architecture)

| 文件 / 目錄 | 管轄範圍 (Single Source of Truth) | 查閱時機 |
| :--- | :--- | :--- |
| **`.agents/AGENTS.md`** | 專案核心不變量 (Core Invariants)、不可違反之架構紅線與授權邊界。 | 專案全域共通規範。 |
| **`.agents/rules/`** | 穩定的環境合約、架構標準與分流規範（workspace, python-uv, network-ports, testing-strategy, ui-architecture, dependencies）。 | 涉及該技術領域開發時按需查閱。 |
| **`.agents/skills/`** | 具體任務的可執行 SOP、專用工具鏈與驗證指引。 | 依任務觸發條件選取單一 skill 載入，不預先通讀。 |
| **`.agents/Journal.md`** | 經本地驗證的歷史踩坑知識庫、架構決策與暫存經驗。 | 僅於排查疑難雜症或任務結束登錄新學習點時查閱。 |
| **`tests/` vs `scripts/tests/`** | 核心業務測試 vs 開發治理腳本測試。 | 遵循 testing-strategy.md 進行分流驗證。 |

---

## 專案核心事實與領域規範 (Core Invariants)

1. **UDP 高頻效能保護**：`backend/telemetry_listener.py` 負責以 60Hz+ 頻率接收 Forza 遊戲 UDP 遙測封包。此循環內**絕不可放置同步阻塞 (Synchronous Blocking) 或高開銷的 I/O 操作**。
2. **車輛物理與調校邏輯單一真理 (SSOT)**：所有懸吊、彈簧磅數、防傾桿 (ARB) 與齒輪比算牌公式，必須嚴格維持為純函數 (Pure Functions)，且統一收攏於 `frontend/src/utils/tuningMath.ts`。
3. **單位嚴格性**：處理遙測數據時，必須釐清遊戲原生單位、領域單位與顯示單位的分層轉換，不得在 UI 組件內任意硬編碼物理計算公式。
4. **路徑安全與檔案存取規範 (Path Security)**：所有涉及外部輸入、檔案名稱、Preset 或 Session 存取的模組，必須使用 `backend/path_security.py` 的 `safe_resolve_path` / `safe_join_under_dir` 進行目錄包含性檢驗，嚴禁直接拼接外部輸入路徑。
5. **Agent CLI 工具鏈效率導引 (Agent CLI Tooling)**：專案提供官方面向 AI Agent 的命令列工具 `fh6-agent.bat`（或 `python -m backend.agent_cli` / `fh6-agent.exe`）。Agent 在進行車輛規格檢索、底盤/齒比算牌、調校 Preset 讀寫、閉環遙測診斷或 MCP 連接埠探測時，**應優先調用 `fh6-agent.bat <subcommand> --json`** 獲取結構化輸出，大幅提升決策效率並維持算牌真理一致性。詳細指令參閱 [`docs/agent-cli-guide.md`](../docs/agent-cli-guide.md)。

---

## 專案架構規範體系 (Modular Rules Index)

具體架構、環境契約與實作合約收攏於 `.agents/rules/` 模組化體系，Agent 執行對應領域任務時按需遵循：

- **[工作區邊界與驗證關卡 (workspace.md)](rules/workspace.md)**：前後端職責隔離、HUD 目錄合約與任務驗證關卡。
- **[Python 3.13 / uv 工具鏈標準 (python-uv.md)](rules/python-uv.md)**：虛擬環境管理、`uv run --no-project` 命令防呆與禁止激活規範。
- **[網路連接埠傳輸契約 (network-ports.md)](rules/network-ports.md)**：UDP 8000 遙測與 HTTP 8001 API 端點隔離、Release 動態 Port 機制。
- **[測試策略與反過度測試規範 (testing-strategy.md)](rules/testing-strategy.md)**：測試金字塔三層分流、反微觀 Canvas 座標斷言、反 YAML 測試與 Vitest 單元測試合約。
- **[前端 UI 與設計系統架構 (ui-architecture.md)](rules/ui-architecture.md)**：Halfmoon CSS 雙層架構、Anti-FOUC、全域 `ModalPortal` 護欄、向下 Popover 與 Wizard 獨立組件規範。
- **[第三方套件引入與防幻覺查驗協議 (dependencies.md)](rules/dependencies.md)**：Registry 官方 CLI 驗證指令、寬鬆開源授權核准與依賴鎖定。

---

## 開發邊界限制與有條件授權 (Boundary Guardrails & Bounded Authorizations)

* **必須做的事 (Mandatory Practices)**：
  - 遵循變更範圍分流驗證：修改前端/物理執行前端測試，修改後端執行後端測試。
  - 前端 UI 開發或變更時，必須遵循 [ui-architecture.md](rules/ui-architecture.md) 與 [halfmoon-design-system](skills/halfmoon-design-system/SKILL.md)。
  - 任務結束後若發現具體且可重現的架構學習點，登錄至 [Journal.md](Journal.md)。
  - 重大架構或核心模組變更時，主動同步更新 `README.md` 與 `README.en.md`。
  - 維護 `.gitignore`，確保快取、使用者數據與暫存檔被嚴格排除。
* **有條件明確授權 (Pre-authorized Bounded Rules)**：
  - **修改 UDP 封包解構格式**：當符合以下全部前提時，Agent 獲明確授權可直接修改 `backend/telemetry_parser.py` 與 `packet_format_reference.md`：
    1. 取得真實遊戲封包 dump 或協議佐證，能重現證明現有 offset 錯誤；
    2. 於 `tests/` 補齊二進位封包回放測試確保解構正確；
    3. 維持 324-byte 總長度與非同步高頻接收效能不變。若無客觀封包證據或涉及破壞性協定變更，則須於計畫中提請使用者確認。
  - **引入全新的第三方相依套件**：當符合以下全部前提時，Agent 獲明確授權可直接加入相依設定並更新 lockfile：
    1. 現有標準庫與專案既有依賴無法滿足需求，且自研代價過高；
    2. 已執行 `dependencies.md` 規定之官方 Registry CLI 防幻覺查驗，確認套件真實存在且活躍維護；
    3. 套件授權為經核准之寬鬆開源授權（MIT, Apache-2.0, BSD, ISC）；
    4. 屬輕量輔助函式庫，非重型框架且不顯著增加打包負擔。若涉及非寬鬆授權 (如 GPL)、引入重量級框架或系統級原生二進位依賴，則須於計畫中提請使用者確認。
* **絕對不做的事 (Strict Invariants)**：
  - 在接收 UDP 封包的非同步主迴圈中加入同步檔案寫入或網路請求。
  - 為了方便而在 UI 組件內直接寫死物理調校計算公式。
  - 嚴禁在 UI 字串或 UI 組件內直接加入裝飾性 Emoji 圖示。
  - 嚴禁編寫以正則/字串比對 YAML/JSON/Workflow 設定檔內容的單元測試。
  - 嚴禁在 UI/Canvas 測試中斷言底層 API 呼叫次數或硬編碼像素座標。
  - 嚴禁將啟動 Live Binary 的 Heavy E2E 測試混入日常 Unit Gate。
  - 嚴禁使用 Windows 命令列（如 `echo` 或 `>>`）附加中文文字至 Markdown 檔案（防止 Code Page 編碼損毀）。

---

## 任務完成檢核表與分流驗證 (Task Completion Checklist & Scoped Verification)

在宣佈任何開發/重構任務完成前，Agent 依據變更範圍執行分流驗證：
1. **代碼檢查**：執行 `ruff check .` / `ruff format --check .` / `git diff --check`，確保無格式與空白異常。
2. **範圍分流測試 (Scoped Tests)**：
   - **純文檔/規範變更**：以 `git diff --check` 驗證，不需執行代碼測試。
   - **前端/物理/UI 變更**：執行 `cmd /c "pnpm -C frontend run test"` 確保通過。
   - **後端/遙測/CLI 變更**：執行 `uv run --no-project --python .venv\Scripts\python.exe python -m pytest tests/` 確保通過。
   - **跨端或發行變更**：同時執行前後端測試與構建檢查。
3. **架構學習點回顧**：評估本次任務是否有值得傳承的架構學習點，依規範追加紀錄至 [Journal.md](Journal.md)。
4. **狀態維護**：維護 `.gitignore` 與 `README.md` 說明文件狀態。
