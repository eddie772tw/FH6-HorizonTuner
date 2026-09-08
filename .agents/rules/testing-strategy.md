# 測試策略與反過度測試規範 (Testing Strategy & Anti-Over-Engineering)

本專案的前後端測試體系旨在保障 60Hz 即時賽車遙測數據流與車輛物理調校運算的正確性，並透過嚴格的分層隔離防止測試集膨脹、脆弱性 (Flakiness) 與過度工程。

---

## 一、 測試金字塔與分層隔離原則 (Test Pyramid & Isolation)

專案測試架構依執行開銷與職責嚴格劃分為三個層級：

| 層級 | 測試路徑 / 標記 | 測試範疇 | 執行時機與預期耗時 | 標準執行命令 |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 1: 產品核心單元測試** | `tests/`<br>`frontend/src/**/*.test.ts` | 60Hz UDP 封包解碼、FastAPI 端點、路徑安全、懸吊與齒比純物理計算 | 提交前每次必跑<br>(後端 < 5s, 前端 < 10s) | 後端：`uv run --no-project --python .venv\Scripts\python.exe python -m pytest tests/`<br>前端：`cmd /c "pnpm -C frontend run test"` |
| **Tier 2: 內部治理與工具測試** | `scripts/tests/` | Agent 協作腳本、PR 審查工具 (`manage_pr_author.py`, `submit_pr_review.py`) | 僅在修改對應工具腳本時觸發 | `uv run --no-project --python .venv\Scripts\python.exe python -m pytest scripts/tests/` |
| **Tier 3: 發行與驗收整合測試** | `@pytest.mark.host_diagnostics`<br>`@pytest.mark.executable_bundle` | 啟動真實二進位產物 (`.exe`)、Windows WinRT / 音訊裝置生命週期、PE 元數據 | 僅由 Release CI 與打包發行驗收執行；日常 pytest 預設排除 | `uv run --no-project --python .venv\Scripts\python.exe python -m pytest tests/ -m host_diagnostics` |

> **日常開發保護**：`pyproject.toml` 已配置 `addopts = "-m 'not host_diagnostics and not executable_bundle'"`，確保日常單元測試毫秒級反饋，不被本機殘留的舊二進位檔干擾。

---

## 二、 反過度測試四項準則 (Anti-Over-Testing Mandate)

為防止測試脆弱性並保障重構自由度，所有測試編寫必須嚴格遵守以下四項準則：

1. **測試行為與狀態，嚴禁測試微觀實作細節 (Test Behavior, Not Implementation Details)**：
   - UI 與 Canvas 繪圖測試應驗證輸入數值到幾何比例、角度、Token 映射的純運算邏輯，或以無拋出異常/可觀察輸出為準。
   - **嚴禁**在測試中 Mock 攔截底層 Canvas 2D API 呼叫次數（如 `arcs.length >= 5`）或寫死微觀像素座標（如 `x: 320, y: 224`），此類斷言具有極高脆弱性且嚴重阻礙 UI 重構。
2. **嚴禁測試靜態宣告式設定檔 (No Testing Declarative Configurations)**：
   - **嚴禁**編寫以 Python 正則表達式或字串包含去斷言 `.github/dependabot.yml`、`ci.yml`、`tauri.conf.json` 靜態文字內容的單元測試。
   - 宣告式設定檔一律交由平台（如 GitHub Actions、Dependabot、Cargo）的原生 Schema Validation 負責。
3. **單一真理（SSOT）與消除多層重複測試**：
   - 底層 Domain 模組（如 `domain/tuning/`）已覆蓋的物理計算，Façade / 轉發層僅需驗證型別契約與轉發無誤，嚴禁在多個層次重複斷言相同的物理數據邊界。
   - 避免為無狀態、純靜態的 React 簡單包裝元件撰寫瑣碎的 HTML tag 存在性斷言（如僅斷言是否有 `<section>` 標籤）。
4. **零破壞原則**：
   - 嚴禁為了使測試通過而隨意放寬測試條件或修改斷言閾值。

---

## 三、 前端單元測試規範 (Vitest)

專案前端採用 **Vitest** 作為單元測試框架（整合於 Vite 工具鏈）。

* **測試檔命名慣例**：測試檔與被測模組同目錄，命名為 `<模組名>.test.ts`（例如 `tuningMath.ts` → `tuningMath.test.ts`）。
* **測試原則**：
  - 驗證**邊界值**（0%/100% 分佈、極端輸入）、**相對關係**（前 > 後、drift vs road）與 **clamp 限界**。
  - 對於由遙測逆向工程得出的校準常數（如 `CALIBRATION_CONST`），不硬編碼期望值，改以範圍與相對關係斷言。
  - 測試函數必須為純函數測試，不得引入 React render 或 DOM 依賴。
* **標準執行指令**：
  ```powershell
  # 全量測試 (Windows 下務必以 cmd /c 包裹並加上 -C frontend)
  cmd /c "pnpm -C frontend run test"

  # 單檔聚焦極速測試
  cmd /c "pnpm -C frontend exec vitest run src/utils/tuningMath.test.ts"
  ```
