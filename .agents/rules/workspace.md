# FH6-HorizonTuner - 工作區邊界與驗證規範 (Workspace Rules)

## 核心物理與數學運算規範
1. **調校計算單一真理 (Source of Truth)**：正式純函數位於 `backend-rust/src/tuning/`，與 `frontend/src/utils/tuningMath.ts` 經 golden fixtures 對齊。`legacy_cli.rs` 僅保存舊版 CLI 相容數值，不作為新公式入口。
2. **確定性輸入**：嚴禁在物理計算演算法中引入非確定性狀態或副作用。

## 架構隔離原則
1. **後端 (Rust / Axum / Tokio)**：獨立 sidecar 保留既有 UDP、WebSocket、REST、MCP 與持久化契約，保持非同步接收循環無阻塞 (Non-blocking)。本次語言遷移不重新分配既有業務職責；既有模糊／重複職責另以 enhancement #423 追蹤。
   - 開發模式下 Forza Data Out 預設使用 UDP `127.0.0.1:8000`，REST/WebSocket 預設使用 HTTP/TCP `127.0.0.1:8001`；兩者不可混用。
   - `TELEMETRY_PORT` 控制 UDP 遙測端口；Dev mode 固定使用 HTTP `8001`。Release Build 優先使用 `8001`，fallback 時改用動態端口，實際 HTTP 端口以 `logs/web_port.txt` 或 sidecar readiness event 為準。
2. **前端 (Tauri / React)**：僅負責 UI 視覺化與互動展示。
3. **Agent CLI 工具鏈 (`fh6-agent`)**：專門面向 AI Agent 提供高速物理算牌、遙測監控、閉環診斷與 MCP 設定導出。
   - Agent 進行車型檢索、底盤算牌、齒比計算、Preset 讀寫與遙測診斷時，強烈推薦調用 `fh6-agent.bat <subcommand> --json`。
   - 啟動腳本合約：
     - `setup_dev.bat`：下載 Rust 與前端依賴；Python 工具選用 `setup_venv.bat`。
     - `dev_full.bat` / `dev_lite.bat`：Full／Lite 開發入口；增量編譯獨立 Rust 後端，再由 Tauri 管理程序的啟停。
     - `fh6-agent.bat`：直接執行 CLI 指令；獨立後端命令見 `docs/guides/development.md`。
     - `setup_build.bat` / `build_all.bat`：分開準備打包工具與建立發行產物。

## 任務完成驗證關卡 (Verification Gate)
- 在完成或宣佈任何開發與重構任務前，必須執行以下驗證測試（遵循反過度測試與分層原則）：
  - 後端與 CLI 輸入／輸出契約：`cargo test --locked --manifest-path backend-rust/Cargo.toml`；無 HUD 平台另加 `--no-default-features`。
  - Rust 格式：`cargo fmt --manifest-path backend-rust/Cargo.toml -- --check`。
  - 後端代碼檢查：`uv run --no-project --python .venv\Scripts\python.exe ruff check .` 與 `uv run --no-project --python .venv\Scripts\python.exe ruff format --check .`
  - 前端單元測試：`cmd /c "pnpm -C frontend run test"` (或 `pnpm run test`)
  - 工具鏈腳本測試（若有修改工具）：`uv run --no-project --python .venv\Scripts\python.exe python -m pytest scripts/tests/`
- 嚴禁為了使測試通過而隨意放寬測試條件或修改斷言閾值；嚴禁在單元測試中斷言靜態 YAML 設定或 Canvas 2D 微觀繪圖呼叫次數。

## Python / uv toolchain standard

- Python 3.13、`.venv`、`requirements.txt` 與所有 Python 工具入口遵循 [python-uv.md](python-uv.md)。
- 任何 Python、pip、pytest、ruff 或 PyInstaller 命令都必須透過 uv 選定 interpreter；不可使用裸 `python`、`pip`、`pytest` 或 `ruff`。
- 選用維護工具驗證使用 `uv run --no-project --python .venv\Scripts\python.exe python -m pytest tests/ scripts/tests/` 與 `uv run --no-project --python .venv\Scripts\python.exe ruff check .`；產品後端與 CLI 使用上列 Cargo 命令。
- GitHub Actions 若涉及 Python，必須維持相同的 uv contract；目前 workflow 的同步需求詳見 [python-uv.md](python-uv.md)。

## HUD ownership and contract directory standard

- `frontend/src/features/overlay_control/<hud-id>/` is reserved for files that primarily interact with the main GUI: selectors, configuration normalization, typed UI boundaries, and tests for those boundaries.
- HUD-owned renderer, Canvas, inline-controller, and standalone asset contract tests belong under `hud_overlay/<hud-id>/tests/unit/` (or `tests/integration/` when they exercise a launcher boundary), following the S650 HMI layout.
- The `overlay_control/` root is reserved for shared GUI components, scanners, and cross-HUD tests. Do not place HUD renderer tests there.
- When adding a HUD, first decide ownership at the GUI/HUD boundary, then keep each file beside the owning subsystem; update the single frontend Vitest include glob when introducing a new HUD-owned test tree.
