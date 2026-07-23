# FH6-HorizonTuner 開發守則 (AGENTS.md)

## 專案核心事實與領域規範
1. **UDP 高頻效能保護**：`frontend/src-tauri/src/telemetry.rs` 負責以 60Hz+ 頻率接收 Forza 遊戲 UDP 遙測封包。此循環內**絕不可放置同步阻塞 (Synchronous Blocking) 或高開銷的 I/O 操作**。
2. **車輛物理與調校邏輯單一真理 (Single Source of Truth)**：所有懸吊、彈簧磅數、防傾桿 (ARB) 與齒輪比算牌公式，必須嚴格維持為純函數 (Pure Functions)，且統一收攏於 `frontend/src/utils/tuningMath.ts`。
3. **單位嚴格性**：處理遙測數據時，必須釐清遊戲原生單位與顯示單位的轉換（例如：米/秒轉公里/小時、帕斯卡轉 PSI），不得在 UI 組件內任意硬編碼 (Hardcode) 物理公式。

## Agent 開發與測試守則

### 核心原則
1. **效能與即時性為先**：作為遊戲 Overlay / HUD，畫面渲染與數據傳遞的延遲（Latency）直接影響玩家體驗。避免在大數據流中進行不必要的深拷貝 (Deep Copy) 或頻繁的 DOM 重新渲染。
2. **測試驗證與語法規範 (Mandatory Local Gateways)**：在提交任何程式碼修改或宣佈任務完成前，必須執行以下檢查：
   - Rust 語法與 Clippy 零警告檢查：`cargo fmt --manifest-path frontend/src-tauri/Cargo.toml -- --check` 以及 `cargo clippy --manifest-path frontend/src-tauri/Cargo.toml --all-targets -- -D warnings`
   - 前端語法檢查：`npm --prefix frontend run lint`
   - Rust 後端與 UDP 解析測試：`cargo test --manifest-path frontend/src-tauri/Cargo.toml`
   - 前端物理與算牌測試：`cmd /c "npm --prefix frontend run test"`
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
  cmd /c "npm --prefix frontend run test"
  ```

### 模組化與架構解耦規範 (Modular Architecture Rules)

1. **高內聚低耦合 (High Cohesion, Low Coupling)**：
   - **劃分原則**：任何新功能必須依據「業務領域 (Domain)」或「層級職責」進行模組化拆分，嚴禁在單一檔案中混雜 UDP 解包、數據計算與 UI 渲染。
   - **單一職責**：每個模組（如 `tuningMath.ts`、`telemetry.rs`）只做一件事。若單一檔案超過 250 行，必須主動評估拆分。

2. **模組邊界與依賴方向**：
   - **純邏輯層 (Domain/Utils)**：必須為「無狀態純函數 (Pure Functions)」，嚴禁依賴 React 組件狀態或全域 UI 變數。
   - **數據層 (Rust Backend/UDP)**：僅負責數據接收與格式轉譯，不承載 UI 呈現邏輯。
   - **呈現層 (Frontend/Components)**：僅負責 UI 互動與視覺化，嚴禁在組件內撰寫複雜的物理計算公式。

3. **維護 `.pkgdirignore` 與 `.gitignore` 規範**：
   - 新增功能、模組、檔案或執行任務時，必須同步檢查並維護 `.pkgdirignore` 與 `.gitignore` 檔案。
   - 確保所有動態生成之快取（`node_modules`, `target`）、使用者設定、運行數據與臨時檔均被 `.gitignore` 嚴格排除；同時確保非發行打包目錄正確登錄於 `.pkgdirignore`，維護 Repository 純潔性與打包精準度。

### 開發邊界限制
* **必須做的事**：
  - 修改 `tuningMath.ts` 或 `tuningDiagnosis.ts` 計算邏輯後，必須更新單元測試並確認前端測試全數通過（`cmd /c "npm --prefix frontend run test"`）。
  - 修改 Rust 程式碼後，必須執行 `cargo clippy --manifest-path frontend/src-tauri/Cargo.toml --all-targets -- -D warnings` 與 `cargo test` 確保零 Warning 與測試全數通過。
  - **同步維護 `.pkgdirignore` 與 `.gitignore` 規範**。
  - 任務結束後，必須主動回顧開發過程並更新 `.agents/Journal.md`。
* **詢問後才做的事**：
  - 修改 UDP 封包解構格式 (Packet Structure Byte Offsets)。
  - 引入全新的 npm 或 cargo 第三方相依套件。
* **絕對不做的事**：
  - 在接收 UDP 封包的非同步主迴圈中加入同步檔案寫入或網路請求。
  - 為了方便而在 UI 組件內直接寫死物理調校計算公式。

## 開發紀錄日誌 (Journal.md)
專案設有 [.agents/Journal.md](.agents/Journal.md) 機制：
* **任務開始前**：優先閱讀 [.agents/Journal.md](.agents/Journal.md) 以瞭解之前的避坑指南與極限邊界。
* **任務結束後**：若發現物理計算陷阱、UDP 解包效能瓶頸或異步 Bug，強制寫入 [.agents/Journal.md]。

## Task Completion Checklist
在宣佈任何開發/重構任務完成前，Agent 必須強制執行：
1. **Rust 靜態語法與 Clippy 嚴格驗證**：執行 `cargo fmt -- --check` 以及 `cargo clippy --all-targets -- -D warnings`，確保本地程式碼達成零警告（0 Warnings）。
2. **前端靜態與單元測試驗證**：執行 `npm run lint` 與 `npm run test`（Vitest），確保 100% Pass。
3. **Rust 單元測試**：執行 `cargo test` 並確保全數 Pass。
4. **評估經驗傳承**：評估本次任務是否有值得傳承的「學習點/失敗經驗/架構坑點」，若有，自動於 `.agents/Journal.md` 追加紀錄。
5. **維護資源專屬設定**：確認 `.pkgdirignore` 與 `.gitignore` 已正確更新排除快取或登錄發行資源。