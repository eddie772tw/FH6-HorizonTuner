# 第三方相依套件引入與防幻覺查驗協議 (Dependencies & Anti-Hallucination Protocol)

為防範大語言模型 (LLM)「幻覺套件引用 (Package Hallucination)」、拼寫搶註 (Typosquatting) 與依賴混淆攻擊，所有 Agent 在提議或引入任何新依賴前，**必須嚴格執行以下三步驟驗證協議**：

---

## 一、 防幻覺三步驟驗證協議 (Three-Step Verification)

### 1. 嚴禁憑記憶直接寫入設定檔
- 嚴禁未經查驗直接在 `package.json`、`requirements.txt`、`pyproject.toml` 或 `Cargo.toml` 中填入套件名稱。

### 2. 強制執行 Registry 官方查驗指令
在終端執行官方 Registry 指令，查驗套件真實存在、維護者、最新發布日期、版本號與目標平台相容性：
- **Node.js / npm 套件**：
  ```powershell
  pnpm info <package-name>
  ```
- **Python / PyPI 套件**：
  ```powershell
  uv run --no-project --python .venv\Scripts\python.exe python -m pip index versions <package-name>
  ```
- **Rust / crates.io 套件**：
  ```powershell
  cargo search <package-name>
  ```

### 3. 開源授權審查與使用者明確確認
1. **開源授權合約**：確認套件採用寬鬆開源授權（如 MIT、Apache-2.0、BSD-3-Clause 等）。**嚴禁引入強傳染性 GPL 授權套件**，防止本專案二進位發行產物受到授權污染。
2. **取得授權後安裝鎖定**：經使用者明確核准後，方可安裝並同步鎖定版本檔案（`pnpm-lock.yaml` / `requirements.txt` / `Cargo.lock`）。
