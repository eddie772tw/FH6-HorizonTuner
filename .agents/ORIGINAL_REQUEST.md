# Original User Request

## 2026-09-10T12:59:45Z

將已在本地分支完成驗證的 Road 賽事調校工作流（包含快速準備、無/中性季節與配方解耦、A/B 基準比較、遙測觀測持久化、賽後描述性報告與單項變更閉環迭代）反饋擴展至越野 (Offroad / Rally)、直線加速 (Drag) 與甩尾 (Drift) 賽事；其中越野與直線加速優先進行領域專屬遙測指標與工作流跟進，甩尾賽事在缺乏足夠客觀證據下僅跟上流程架構。

Working directory: d:/FH6-HorizonTuner
Integrity mode: demo

## Requirements

### R1. 越野賽事 (Offroad / Rally) 調校工作流適配（高優先級）
- 提供降低進入門檻的準備流程，採用中性初始基準且不強制要求季節或特定配方名稱。
- 支援越野專屬動態觀測與資料收集（包含懸吊長行程極限壓縮/觸底曝光、離地間隙與地形起伏適應表現）。
- 實作越野賽事之 A/B 基準比較與單項調整迭代反饋，支援衝刺與圈賽模式的賽後描述性報告與歷史留存。

### R2. 直線加速賽事 (Drag) 調校工作流適配（高優先級）
- 提供針對直線加速情境的準備與測試流程，簡化起步與檔位設定所需的前置資料。
- 支援直線加速核心動態觀測（彈射起步輪胎滑移率、各檔位加速度曲線、換檔動力中斷/銜接延遲與 0-100 / 0-400m 等速域衝刺計時）。
- 實作直線加速之 A/B 基準測試流程，提供單項調整（如胎壓、終傳/齒比、後避震剛性）賽後比較報告。

### R3. 甩尾賽事 (Drift) 調校流程架構對齊（流程跟進）
- 對齊統一調校流程架構（準備 → 基準記錄 → A/B 候選變更 → 描述性摘要）。
- 鑑於目前缺乏足夠的客觀遙測因果證據，嚴格遵循專案規範：明示觀測限制與未知項目，不捏造未經證實的甩尾物理因果模型或綜合評分。

### R4. 全域調校入口整合與架構規範遵循
- 整合調校頁面入口，提供各賽事類型（Road、Offroad、Drag、Drift）工作流的無縫切換與獨立狀態保存。
- 嚴格遵守專案架構邊界：所有物理計算統一收攏於純函數 SSOT、高頻 UDP 接收迴圈絕無同步阻塞與高開銷 I/O、檔案路徑存取使用安全驗證函式、UI 遵循 Halfmoon 設計系統。

## Acceptance Criteria

### 領域工作流與合約規範
- [ ] 越野賽事與直線加速賽事具備各自獨立且符合領域特性的觀測提取、A/B 比較與報告生成邏輯。
- [ ] 甩尾賽事具備完整的準備與 A/B 流程骨架，所有限制與未知欄位均以客觀文字明確揭露，無虛構評分。
- [ ] 所有賽事之觀測紀錄、A/B 快照與草稿皆能正常序列化持久化，且重啟後可完整讀回。

### 自動化驗證與程式碼品質
- [ ] 前端單元測試全數通過：cmd /c "pnpm -C frontend run test"
- [ ] 前端打包與 TypeScript 型別檢查通過：cmd /c "pnpm -C frontend run build"
- [ ] 後端單元與合約測試全數通過：uv run --no-project --python .venv\Scripts\python.exe python -m pytest tests/
- [ ] 靜態程式碼分析與格式檢查通過：uv run --no-project --python .venv\Scripts\python.exe ruff check . 與 uv run --no-project --python .venv\Scripts\python.exe ruff format --check .
- [ ] Git diff 檢查無格式或空白異常：git -c core.safecrlf=false diff --check
