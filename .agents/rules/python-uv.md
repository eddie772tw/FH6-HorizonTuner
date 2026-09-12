# Python / uv Toolchain Policy

狀態：`adopted`。

本專案的 Python 執行環境、虛擬環境與 Python 套件管理統一由 `uv` 負責。這條規範適用於本機開發、批次檔、測試、PyInstaller 打包，以及未來要同步的 GitHub Actions 工作流程。

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
uv run --no-project --python .venv\Scripts\python.exe python -m pytest tests/

# Python 語法檢查
uv run --no-project --python .venv\Scripts\python.exe python -m py_compile backend\main.py
```

環境準備使用 `setup_dev.bat`（內部呼叫 `setup_venv.bat`）；日常開發使用 `dev_full.bat` 或 `dev_lite.bat`，直接執行 Python 原始碼，不建立後端 EXE、不重新安裝依賴。打包前明確執行 `setup_build.bat`，再執行 `build_all.bat`。

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
