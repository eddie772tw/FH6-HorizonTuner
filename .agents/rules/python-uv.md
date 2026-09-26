# Python / uv Toolchain Policy

狀態：`adopted`。

本專案選用的 Python 維護／診斷／發行工具與測試環境統一由 `uv` 負責。產品後端、MCP 與 Agent CLI 均為 Rust；`tests/` 尚保留凍結的遷移相容性與發行驗證案例，CI 仍可能執行它們，但不能將其當作 Python 產品後端或主要產品 gate。本規範不要求 Rust 開發安裝 Python。

## 固定契約

- Python major/minor 固定為 **3.13**。
- 專案虛擬環境固定為根目錄的 `.venv`。
- Python 版本解析必須經過 `uv`，不可依賴 PATH 上任意的 `python`、`py` 或既有全域 venv。
- Python 相依套件來源是 `requirements.txt`；安裝與檢查必須使用 `uv pip`。
- Python 工具與測試必須使用 `uv run --no-project --python .venv\Scripts\python.exe` 執行（專案由 `requirements.txt` 宣告相依而非 `pyproject.toml`；若遺漏 `--no-project` 旗標，uv 會向上遞迴尋找專案根目錄宣告並報錯）。
- 不需要啟用 venv；嚴禁呼叫 `activate.ps1` 或裸 `python`/`pip`/`pytest`。命令直接指定 `.venv\Scripts\python.exe`，可徹底杜絕 subshell 無狀態遺留與 PowerShell `PSSecurityException` 策略阻擋。

## Windows 標準命令

```powershell
# 建立或重建環境；需要清除既有環境時才加入 --clear
uv venv --python 3.13 --managed-python .venv

# 安裝與修復依賴
uv pip install --python .venv\Scripts\python.exe --requirement requirements.txt

# 確認套件相依性
uv pip check --python .venv\Scripts\python.exe

# 確認實際 interpreter
uv run --no-project --python .venv\Scripts\python.exe python --version

# Ruff
uv run --no-project --python .venv\Scripts\python.exe ruff check .
uv run --no-project --python .venv\Scripts\python.exe ruff format --check .

# Pytest
uv run --no-project --python .venv\Scripts\python.exe python -m pytest tests/ scripts/tests/

# Python 語法檢查
uv run --no-project --python .venv\Scripts\python.exe python -m py_compile scripts\update_car_db.py
```

選用 Python 環境直接執行 `setup_venv.bat`。產品開發使用 `setup_dev.bat` 與 `dev_full.bat`／`dev_lite.bat`，由 Cargo 增量編譯後端。產品打包使用 `setup_build.bat` 與 `build_all.bat`，不執行 PyInstaller。

## 禁止與例外

以下命令不得作為本專案的 Python 開發、測試或打包入口：

- `py -3.13`、`python -m venv`、`python -m pip`。
- 裸 `python`、裸 `pip`、裸 `pytest`、裸 `ruff`。
- 直接執行 `.venv\Scripts\pytest.exe`、`.venv\Scripts\ruff.exe`，而沒有透過 `uv run`。

唯一允許的 `python` 字串，是作為 `uv run ... python ...` 的子命令，因為此時 interpreter 已由 uv 選定。批次檔可以將 `.venv\Scripts\python.exe` 傳給 `uv --python` 作為目標環境，但不得繞過 uv 直接執行它。

新增或修改 Python 依賴時，先更新 `requirements.txt`，再執行 `uv pip install --python .venv\Scripts\python.exe --requirement requirements.txt`。不要以臨時 `pip install` 取代依賴宣告。

## CI 同步要求

GitHub Actions 應以 uv 作為 Python bootstrap 與 package manager：保留 Python 3.13 的 job/matrix contract，但將 `pip install`、裸 `pytest`、裸 `ruff`、`python -m PyInstaller` 改為對應的 `uv pip` 與 `uv run` 命令。`actions/setup-python` 的 pip cache 不應再被視為專案依賴快取；若 workflow 啟用快取，應改用 uv cache。

若未來需要完全可重現的依賴版本，另行引入並提交 uv lockfile；在此之前，`requirements.txt` 仍是目前唯一的依賴宣告來源。
