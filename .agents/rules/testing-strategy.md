# 測試策略與反過度測試規範 (Testing Strategy & Anti-Over-Engineering)

本專案的前後端測試體系旨在保障 60Hz 即時賽車遙測數據流與車輛物理調校運算的正確性，並透過嚴格的分層隔離防止測試集膨脹、脆弱性 (Flakiness) 與過度工程。

Rust 後端及 Agent CLI 的主驗證入口為 `cargo test --locked --manifest-path backend-rust/Cargo.toml`，細分純領域、凍結的 Python 黃金輸出、資料往返與短時間程序迴路。後者只驗證 HTTP／UDP／WS／stdin 的產品邊界，不啟動 GUI 或遊戲，不能當成原生裝置驗收。詳見 [後端測試分層](../../docs/backend-rust/README.md)。Python 僅用於選用維護及發行工具。

---

## 一、 測試金字塔與分層隔離原則 (Test Pyramid & Isolation)

產品程式與選用工具使用不同驗證入口。產品後端及 Agent CLI 以 Cargo 測試為準；Python 只保留在部分維護、診斷與發行工具。不要把舊 Python 後端參考測試當成現行產品測試。

專案測試架構依執行開銷與職責劃分如下：

| 層級 | 測試路徑 / 標記 | 測試範疇 | 執行時機與預期耗時 | 標準執行命令 |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 1: 產品核心契約測試** | `backend-rust/tests/`<br>`frontend/src/**/*.test.ts` | UDP 封包、HTTP／WS、CLI、路徑安全、調校純函數 | 修改對應產品範圍時執行 | 後端：`cargo test --locked --manifest-path backend-rust/Cargo.toml`<br>前端：`cmd /c "pnpm -C frontend run test"` |
| **Tier 2: 內部治理與工具測試** | `scripts/tests/` | 選用 Python 維護／發行腳本 | 僅在修改對應工具時觸發 | 依 `.agents/rules/python-uv.md` 使用 uv 執行對應測試 |
| **Tier 3: 發行與平台驗收** | Rust integration tests、Release workflow 專用檢查 | 打包產物、平台功能與發布契約 | 對應平台／發行變更時執行；不可由舊 Python 後端測試推定已驗收 | 依 `docs/guides/cross-platform-release.md` 與 workflow 執行 |

> `pyproject.toml` 的 pytest 設定僅約束仍保留的 Python 工具／參考測試，不代表產品後端測試入口。

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
