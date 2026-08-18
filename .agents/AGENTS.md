# FH6-HorizonTuner 開發守則 (AGENTS.md)

## 任務入口與技能發現 Gate

每個任務在執行程式碼修改或任務專用命令前，必須先完成以下步驟：

1. 閱讀本檔、`.agents/rules/workspace.md`、`.agents/Journal.md`，並檢查 `.agents/skills/README.md`。
2. 以 `.agents/skills/<directory>/SKILL.md` 的資料夾名稱作為 canonical skill ID；不要從舊日誌或非現存名稱推測技能名稱。
3. 依任務觸發條件選取技能，完整讀取被選取的 `SKILL.md`，再讀取它明確要求的 references。
4. 若修改 UI、巨型元件、物理公式、UDP 協定、模組架構或執行 Jules 委派，必須在任務紀錄中列出實際採用的 skill ID。
5. 任務結束時檢查技能名稱、文件路徑與驗證命令是否仍然有效；發現命名不一致時先修正索引與 frontmatter。

Canonical skill registry 位於 `.agents/skills/README.md`。目前專案技能 ID 包含：
`halfmoon-design-system`、`huge-component-refactoring`、`jules_coding`、
`modular-refactoring`、`physics-tuning-math`、`telemetry-udp-protocol`、
`cross-agent-collaboration`、`agent-governance-audit`、
`portable-release-validation`、`pr-review-evaluation`、
`pr-author-maintainer`、`github-security-audit`。

Agent 文件、技能說明、工作日誌與規範內容以繁體中文為主。只有技能 ID、檔名、API、CI、React、TypeScript 等技術專有名詞，以及可能造成歧義的術語保留英文。

特別注意：`modular-refactoring` 與 `huge-component-refactoring` 是兩個不同技能；前者處理模組邊界與邏輯拆分，後者處理超過 250 行的 UI 元件或 60Hz rendering。Jules 流程使用 `jules_coding`，且必須先確認授權、API key、GitHub binding 與可用整合。調整 `.agents`、`.jules`、Journal 或 skill 索引時，必須使用 `agent-governance-audit`；發行 portable/exe、sidecar 或動態 HTTP port 時，必須使用 `portable-release-validation`；評估與審查 PR 時使用 `pr-review-evaluation`（若 Blocking 意見涉及 CI 未涵蓋情境，Reviewer 必須提供對應測試代碼）；撰寫 PR、持續同步 PR Body、Pre-Commit 測試門檻與回覆 Reviewer 時使用 `pr-author-maintainer`。所有 PR 審查與作者留言均須以 `{代號} as {Agent}` 身分標記以區分共用 GitHub 帳號時之發言主體。

## 專案核心事實與領域規範
1. **UDP 高頻效能保護**：`backend/telemetry_listener.py` 負責以 60Hz+ 頻率接收 Forza 遊戲 UDP 遙測封包。此循環內**絕不可放置同步阻塞 (Synchronous Blocking) 或高開銷的 I/O 操作**。
2. **車輛物理與調校邏輯單一真理 (Single Source of Truth)**：所有懸吊、彈簧磅數、防傾桿 (ARB) 與齒輪比算牌公式，必須嚴格維持為純函數 (Pure Functions)，且統一收攏於 `frontend/src/utils/tuningMath.ts`。
3. **單位嚴格性**：處理遙測數據時，必須釐清遊戲原生單位與顯示單位的轉換（例如：米/秒轉公里/小時、帕斯卡轉 PSI），不得在 UI 組件內任意硬編碼 (Hardcode) 物理公式。
4. **路徑安全與檔案存取規範 (Path Security & Containment)**：所有涉及外部輸入、檔案名稱、Preset 或 Session 存取的模組，必須使用 `backend/path_security.py` 的 `safe_resolve_path` / `safe_join_under_dir` 進行目錄包含性檢驗，或透過內部枚舉查找檔案物件，嚴禁未經校驗直接拼接使用者輸入路徑。

## Agent 開發與測試守則

### 核心原則
1. **效能與即時性為先**：作為遊戲 Overlay / HUD，畫面渲染與數據傳遞的延遲（Latency）直接影響玩家體驗。避免在大數據流中進行不必要的深拷貝 (Deep Copy) 或頻繁的 DOM 重新渲染。
2. **測試驗證需求**：在提交任何程式碼修改前，請務必執行以下測試：
   - 靜態檢查：`uv run --no-project --python .venv\\Scripts\\python.exe ruff check .` 以及 `uv run --no-project --python .venv\\Scripts\\python.exe ruff format --check .`
   - 後端 UDP 與邏輯測試：`uv run --no-project --python .venv\\Scripts\\python.exe python -m pytest tests/`
   - 前端物理與算牌測試：`pnpm -C frontend run test`
3. **無副作用設計**：`tuningMath.ts` 與 `tuningDiagnosis.ts` 中的計算工具不可以依賴 React Component State 或外部全域變數。

### 前端測試規範 (Vitest)
專案前端使用 **[Vitest](https://vitest.dev/)** 作為單元測試框架（已整合於 Vite 工具鏈，零額外設定）。

* **測試檔命名慣例**：測試檔與被測模組同目錄，命名為 `<模組名>.test.ts`。例如 `tuningMath.ts` → `tuningMath.test.ts`。
* **測試原則**：
  - 驗證**邊界值** (0%/100% 分佈、極端輸入)、**相對關係** (前 > 後、drift vs road) 與 **clamp 限界**。
  - 對於由遙測逆向工程得出的校準常數（如 `CALIBRATION_CONST`），不硬編碼期望值，改以範圍與相對關係斷言。
  - 測試函數必須為純函數測試，不得引入 React render 或 DOM 依賴。
* **執行指令**：
  ```bash
  # 從專案根目錄 (Windows PowerShell 下建議搭配 cmd /c 避免 PSSecurityException)
  cmd /c "pnpm -C frontend run test"

  # 或從 frontend/ 目錄
  pnpm run test
  ```

### 模組化與架構解耦規範 (Modular Architecture Rules)

1. **高內聚低耦合 (High Cohesion, Low Coupling)**：
   - **劃分原則**：任何新功能必須依據「業務領域 (Domain)」或「層級職責」進行模組化拆分，嚴禁在單一檔案中混雜 UDP 解包、數據計算與 UI 渲染。
   - **單一職責**：每個模組（如 `tuningMath.ts`、`telemetry_listener.py`）只做一件事。若單一檔案超過 250 行，必須主動評估拆分。

2. **模組邊界與依賴方向**：
   - **純邏輯層 (Domain/Utils)**：必須為「無狀態純函數 (Pure Functions)」，嚴禁依賴 React 組件狀態或全域 UI 變數。
   - **數據層 (Backend/UDP)**：僅負責數據接收與格式轉譯，不承載 UI 呈現邏輯。
   - **呈現層 (Frontend/Components)**：僅負責 UI 互動與視覺化，嚴禁在組件內撰寫複雜的物理計算公式。

3. **模組化變更 SOP**：
   - 新增或重構模組時，必須同步提供該模組的獨立單元測試（Unit Test）。
   - 跨模組對接時，必須透過型別宣告（TypeScript Interface / Python Type Hints）明確定義數據合約。

5. **UI 視覺與設計系統規範 (Halfmoon CSS & Design System Mandate)**：
   - 所有 Agent 在開發、重構或維護前端 UI 組件、頁面佈局與 Halfmoon CSS 樣式時，**必須嚴格遵循並主動維護**：
     1. 前端 Halfmoon CSS 規格書：[HALFMOON_SPECIFICATION.md](skills/halfmoon-design-system/HALFMOON_SPECIFICATION.md)
     2. Agent 設計系統 Skill：[halfmoon-design-system](skills/halfmoon-design-system/SKILL.md)
   - **雙層架構**：遵守 Layer 1 (Halfmoon CSS v2.0.2 核心語意標籤與 Layout) + Layer 2 (`App.css` Glassmorphism 賽車暗色/亮色皮膚與霓虹變數) 的權責劃分。
   - **防閃爍 (Anti-FOUC)**：確保頁面首幀依據 `data-bs-theme` / `data-bs-core` 正確無縫渲染。
   - **禁用硬編碼與 Emoji**：嚴禁在組件內硬編碼背景色或字體色，統一使用 CSS 語意變數；嚴禁在 UI 字串或組件內加入裝飾性 Emoji 圖示。
   - **版型零擠壓與狀態 Popover 規範**：嚴禁在 View 內部動態插入會推擠 DOM 高度的 `alert` 區塊；狀態詳細提醒一律採用 Header Badge 配合 `position: absolute` 向下展開的 `.popover.bs-popover-bottom.glass-panel`，或全域 Toast 懸浮視窗。

4. **Step 導向介面獨立規範**：
   - 對於精靈嚮導 (Wizard) 或多步驟介面（如 Tuning Workflow），**每一個 Step 必須各自獨立為一個 TSX 組件檔**（例如 `Step1GoalSetup.tsx`、`Step2GearboxSetup.tsx`、`Step3ChassisTuner.tsx`）。
   - 主 View（例如 `TuningView.tsx`）僅作為 View Container，專注於導覽進度條 (Stepper Header) 與 Step 之間狀態傳送，嚴禁將 Step 的 UI 表單細節混在主 View 中。

### 開發邊界限制
* **必須做的事**：
  - 修改 `tuningMath.ts` 或 `tuningDiagnosis.ts` 的計算邏輯後，必須新增或更新 `frontend/src/utils/` 下對應的 `.test.ts` 單元測試，並確認前端測試全數通過（`cmd /c "pnpm -C frontend run test"`）。
  - 修改後端 UDP 解析邏輯後，必須新增或更新 `tests/` 下對應的 Pytest 單元測試。
  - 前端 UI 開發或變更時，必須遵循並維護 [HALFMOON_SPECIFICATION.md](skills/halfmoon-design-system/HALFMOON_SPECIFICATION.md) 規格書與 [halfmoon-design-system](skills/halfmoon-design-system/SKILL.md) 技能標準。
  - 任務結束後，必須主動回顧開發過程並更新 `.agents/Journal.md`。
  - **主動維護說明文件 (README)**：每次涉及重大架構變更、新增核心模組或 API 路由時，**必須主動維護並更新 [README.md](../README.md) 與 [README.en.md](../README.en.md)**，確保專案目錄架構圖、核心功能清單與單元測試統計數據與現況完全對齊。
  - **維護 `.gitignore` 規範**：新增功能、模組或執行任務時，必須同步檢查並維護 `.gitignore` 檔案，確保所有動態生成之快取（`__pycache__`, `node_modules`, `target`）、使用者設定、運行數據與臨時檔均被嚴格排除，維護 Repository 之純潔性。
* **詢問後才做的事**：
  - 修改 UDP 封包解構格式 (Packet Structure Byte Offsets)。
  - 引入全新的 npm、pip 或 cargo 第三方相依套件（必須嚴格遵守下方防幻覺查驗協議）。
* **絕對不做的事**：
  - 在接收 UDP 封包的非同步主迴圈中加入同步檔案寫入或網路請求。
  - 為了方便而在 UI 組件內直接寫死物理調校計算公式。
  - 嚴禁在 UI 字串或 UI 組件內直接加入 Emoji 圖示（請保持極簡專業視覺）。
  - **嚴禁使用命令列操作 (如 `echo` 或 `>>`) 來寫入或附加內容至檔案** (尤其是 Markdown 文件如 Journal.md)。由於 Windows 命令列的字元編碼 (Code Page) 差異，這將導致中文編碼毀損。必須使用 `apply_patch` 或其他能保留 UTF-8 的檔案編輯工具。

## 第三方套件引入與防幻覺查驗協議 (Anti-Hallucination Package Verification Protocol)

為防範大語言模型 (LLM)「幻覺套件引用 (Package Hallucination)」、拼寫搶註 (Typosquatting) 與依賴混淆攻擊，所有 Agent（Google Antigravity、Codex、Jules）在提議或引入任何新依賴前，**必須嚴格執行以下三步驟驗證協議**：

1. **嚴禁憑記憶直接寫入設定檔**：嚴禁未經查驗直接在 `package.json`、`requirements.txt`、`pyproject.toml` 或 `Cargo.toml` 中填入套件名稱。
2. **強制執行 Registry 官方查驗指令**：
   - **Node.js / npm 套件**：在終端執行 `pnpm info <package-name>` 或 `npm view <package-name>`，查驗套件真實存在、維護者、最新發布日期與版本號。
   - **Python / PyPI 套件**：在終端執行 `uv run --no-project --python .venv\Scripts\python.exe python -m pip index versions <package-name>` 或 `uv pip show <package-name>`，驗證 PyPI 註冊資訊及 Python 3.13 / Windows 相容性。
   - **Rust / crates.io 套件**：在終端執行 `cargo search <package-name>` 查驗官方 crates.io 註冊資訊。
3. **開源授權與使用者確認**：
   - 確認該套件授權為寬鬆開源授權（如 MIT、Apache-2.0、BSD-3-Clause），嚴禁引入強傳染性 GPL 導致發行版授權污染。
   - 經由使用者明確核准後，方可安裝並同步鎖定依賴檔案（`pnpm-lock.yaml` / `requirements.txt` / `Cargo.lock`）。

## 開發紀錄日誌 (Journal.md)
專案設有 [Journal.md](Journal.md) 機制：
* **任務開始前**：優先閱讀 [Journal.md](Journal.md) 以瞭解之前的避坑指南與極限邊界。
* **任務結束後**：若發現物理計算陷阱、UDP 解包效能瓶頸或異步 Bug，強制寫入 [Journal.md](Journal.md)。
* **完成寫入後**：若發現特定錯誤或是行動出現兩次以上，代表這是一個潛在的邊界限制，應該建議寫入 [.agents/AGENTS.md]。

## Python / uv toolchain requirement

所有 Python 開發、測試、格式化、lint、PyInstaller 與資料庫更新命令都必須遵循 [python-uv.md](rules/python-uv.md)：使用 Python 3.13、根目錄 `.venv`，並透過 `uv venv`、`uv pip` 與 `uv run` 管理。任何較早段落中的裸 `python`、`pip`、`pytest` 或 `ruff` 範例均視為 legacy，應以該規範中的命令取代。

後端測試標準命令：

```powershell
uv run --no-project --python .venv\Scripts\python.exe python -m pytest tests/
```

## Task Completion Checklist
在宣佈任何開發/重構任務完成前，Agent 必須執行：
1. 執行單元測試（`pytest` / `pnpm run test`）並確保全數 Pass[cite: 1, 2]。
2. 評估本次任務是否有值得傳承的「學習點/失敗經驗/架構坑點」。
3. 若有，請自動於 `.agents/Journal.md` 追加一筆紀錄，格式嚴格遵守規範。
4. 在評估有需要時，建議並詢問是否建立一個或多個SKILL來幫助未來開發。
5. **維護 `.gitignore`**：檢查是否有新增或遺漏的編譯快取、運行數據或產物檔，確認 `.gitignore` 保持完備，維持 Repository 純潔。
6. **維護 README 說明文件**：若本次任務包含重大架構變更或核心模組增修，確認已同步更新 `README.md` 與 `README.en.md` 的架構圖與功能列表。

