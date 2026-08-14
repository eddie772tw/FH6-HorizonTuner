# FH6-HorizonTuner - 工作區邊界與驗證規範 (Workspace Rules)

## 核心物理與數學運算規範
1. **調校計算單一真理 (Source of Truth)**：所有懸吊、彈簧磅數、防傾桿 (ARB) 或齒輪比算牌公式，必須作為「無副作用純函數 (Pure Functions)」統一收攏於 `frontend/src/utils/tuningMath.ts`。
2. **確定性輸入**：嚴禁在物理計算演算法中引入非確定性狀態或副作用。

## 架構隔離原則
1. **後端 (Python / FastAPI)**：僅負責 60Hz 高頻遙測 UDP 封包解碼與 WebSockets 廣播，保持非同步主循環無阻塞 (Non-blocking)。
   - 開發模式下 Forza Data Out 預設使用 UDP `127.0.0.1:8000`，FastAPI REST/WebSocket 預設使用 HTTP/TCP `127.0.0.1:8001`；兩者不可混用。
   - `TELEMETRY_PORT` 控制 UDP 遙測端口；Dev mode 固定使用 HTTP `8001`。Release Build 優先使用 `8001`，fallback 時改用動態端口，實際 HTTP 端口以 `logs/web_port.txt` 或 sidecar readiness event 為準。
2. **前端 (Tauri / React)**：僅負責 UI 視覺化與互動展示。

## 任務完成驗證關卡 (Verification Gate)
- 在完成或宣佈任何開發與重構任務前，必須執行以下驗證測試：
  - 後端：`uv run --no-project --python .venv\\Scripts\\python.exe python -m pytest tests/` (與語法檢查 `uv run --no-project --python .venv\\Scripts\\python.exe ruff check .`)
  - 前端：`cmd /c "pnpm -C frontend run test"`
- 嚴禁為了使測試通過而隨意放寬測試條件或修改斷言閾值。

## Python / uv toolchain standard

- Python 3.13、`.venv`、`requirements.txt` 與所有 Python 工具入口遵循 [python-uv.md](python-uv.md)。
- 任何 Python、pip、pytest、ruff 或 PyInstaller 命令都必須透過 uv 選定 interpreter；不可使用裸 `python`、`pip`、`pytest` 或 `ruff`。
- 後端驗證的標準入口是 `uv run --no-project --python .venv\Scripts\python.exe python -m pytest tests/` 與 `uv run --no-project --python .venv\Scripts\python.exe ruff check .`。
- GitHub Actions 若涉及 Python，必須維持相同的 uv contract；目前 workflow 的同步需求詳見 [python-uv.md](python-uv.md)。

## HUD ownership and contract directory standard

- `frontend/src/features/overlay_control/<hud-id>/` is reserved for files that primarily interact with the main GUI: selectors, configuration normalization, typed UI boundaries, and tests for those boundaries.
- HUD-owned renderer, Canvas, inline-controller, and standalone asset contract tests belong under `hud_overlay/<hud-id>/tests/unit/` (or `tests/integration/` when they exercise a launcher boundary), following the S650 HMI layout.
- The `overlay_control/` root is reserved for shared GUI components, scanners, and cross-HUD tests. Do not place HUD renderer tests there.
- When adding a HUD, first decide ownership at the GUI/HUD boundary, then keep each file beside the owning subsystem; update the single frontend Vitest include glob when introducing a new HUD-owned test tree.
