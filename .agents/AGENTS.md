# FH6-HorizonTuner 開發守則 (AGENTS.md)

## 專案核心事實與領域規範
1. **UDP 高頻效能保護**：`backend/telemetry_listener.py` 負責以 60Hz+ 頻率接收 Forza 遊戲 UDP 遙測封包。此循環內**絕不可放置同步阻塞 (Synchronous Blocking) 或高開銷的 I/O 操作**。
2. **車輛物理與調校邏輯單一真理 (Single Source of Truth)**：所有懸吊、彈簧磅數、防傾桿 (ARB) 與齒輪比算牌公式，必須嚴格維持為純函數 (Pure Functions)，且統一收攏於 `frontend/src/utils/tuningMath.ts`。
3. **單位嚴格性**：處理遙測數據時，必須釐清遊戲原生單位與顯示單位的轉換（例如：米/秒轉公里/小時、帕斯卡轉 PSI），不得在 UI 組件內任意硬編碼 (Hardcode) 物理公式。

## Agent 開發與測試守則

### 核心原則
1. **效能與即時性為先**：作為遊戲 Overlay / HUD，畫面渲染與數據傳遞的延遲（Latency）直接影響玩家體驗。避免在大數據流中進行不必要的深拷貝 (Deep Copy) 或頻繁的 DOM 重新渲染。
2. **測試驗證需求**：在提交任何程式碼修改前，請務必執行以下測試：
   - 語法檢查：`ruff check . --fix`以及`ruff format .`
   - 後端 UDP 與邏輯測試：`pytest tests/`
   - 前端物理與算牌測試：`npm --prefix frontend run test`
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
  cmd /c "npm --prefix frontend run test"

  # 或從 frontend/ 目錄
  npm run test
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

### 開發邊界限制
* **必須做的事**：
  - 修改 `tuningMath.ts` 或 `tuningDiagnosis.ts` 的計算邏輯後，必須新增或更新 `frontend/src/utils/` 下對應的 `.test.ts` 單元測試，並確認前端測試全數通過（`cmd /c "npm --prefix frontend run test"`）。
  - 修改後端 UDP 解析邏輯後，必須新增或更新 `tests/` 下對應的 Pytest 單元測試。
  - 任務結束後，必須主動回顧開發過程並更新 `.agents/Journal.md`。
* **詢問後才做的事**：
  - 修改 UDP 封包解構格式 (Packet Structure Byte Offsets)。
  - 引入全新的 npm 或 pip 第三方相依套件。
* **絕對不做的事**：
  - 在接收 UDP 封包的非同步主迴圈中加入同步檔案寫入或網路請求。
  - 為了方便而在 UI 組件內直接寫死物理調校計算公式。

## 開發紀錄日誌 (Journal.md)
專案設有 [.agents/Journal.md](.agents/Journal.md) 機制：
* **任務開始前**：優先閱讀 [.agents/Journal.md](.agents/Journal.md) 以瞭解之前的避坑指南與極限邊界。
* **任務結束後**：若發現物理計算陷阱、UDP 解包效能瓶頸或異步 Bug，強制寫入 [.agents/Journal.md]。
* **完成寫入後**：若發現特定錯誤或是行動出現兩次以上，代表這是一個潛在的邊界限制，應該建議寫入 [.agents/AGENTS.md]。

## Task Completion Checklist
在宣佈任何開發/重構任務完成前，Agent 必須執行：
1. 執行單元測試（`pytest` / `npm run test`）並確保全數 Pass[cite: 1, 2]。
2. 評估本次任務是否有值得傳承的「學習點/失敗經驗/架構坑點」。
3. 若有，請自動於 `.agents/Journal.md` 追加一筆紀錄，格式嚴格遵守規範。
4. 在評估有需要時，建議並詢問是否建立一個或多個SKILL來幫助未來開發。