# 開發啟動與打包

## 日常開發

先安裝 uv、Node.js／pnpm 與 Rust／Tauri 所需的 Windows 工具。於專案根目錄執行：

```powershell
# 第一次使用，或 requirements.txt / pnpm-lock.yaml 有變更時
.\setup_dev.bat

# 選擇其中一個
.\dev_full.bat
.\dev_lite.bat
```

Full 與 Lite 共用 HTTP `8001`、UDP `8000` 與 Vite `1420`，一次執行一個。啟動時只執行 Tauri／Vite 與 Python 原始碼，不安裝依賴、不自動格式化、不更新車輛資料，不呼叫 PyInstaller，也不啟動 sidecar EXE。

Tauri 透過 `uv run --offline --no-project --python .venv\Scripts\python.exe python -u backend/main.py --dev --data-dir backend` 管理 Python 程序。`--data-dir` 使用 stdin 管道關閉合約；正常關閉主視窗或開發 host 重啟時，後端會一併結束。原有設定仍存於 `backend/`。React 修改由 Vite HMR 更新；Python 修改後重新啟動應用程式。

ready 由後端在 HTTP 與應用程式初始化完成後透過 stdout 發布。`backend/logs/web_port.txt` 保留供 CLI／診斷使用，Tauri 管理的後端不依賴此檔判斷 ready。

## 單獨開發後端或前端

需要保留後端、單獨重啟 GUI 時，第一個終端執行：

```powershell
uv run --offline --no-project --python .venv\Scripts\python.exe python -u backend/main.py --dev
```

第二個 PowerShell 終端執行：

```powershell
$env:FH6_NO_SIDECAR = '1'
$env:BACKEND_PORT = '8001'
.\dev_full.bat  # 也可改用 dev_lite.bat
Remove-Item Env:FH6_NO_SIDECAR, Env:BACKEND_PORT
```

外接模式只驗證指定的 HTTP endpoint，不擁有或關閉外部後端。預設 port 是 `8001`；`BACKEND_PORT` 只控制外接位置，不修改 `--dev` 後端固定 port。純瀏覽器開發可用 `pnpm -C frontend run dev`。

CLI 直接執行 `.\fh6-agent.bat status --json` 等指令。需要手動更新車輛資料時，執行 `uv run --no-project --python .venv\Scripts\python.exe python backend/update_car_db.py`。

## 正式打包

```powershell
# 第一次打包，或依賴有變更時
.\setup_build.bat
.\build_all.bat
```

setup 安裝 Python／前端依賴與 `requirements-build.txt` 宣告的 PyInstaller。build 驗證版本，建置共用前端、Python sidecar，再建置 Full 與 Lite，輸出 `dist/FH6-HorizonTuner.exe` 與 `dist/FH6-HorizonTuner_lite.exe`。

Python 打包統一經過 `scripts/build_sidecar.py`，使 PyInstaller 及其子程序採用 CPython 的非 WMI Windows 平台資訊路徑；此設定只作用於建置程序，不修改 `.venv` 或系統。Full／Lite 都封裝共用前端資源，Lite 主視窗指定 `lite/index.html`，開發入口也使用相同頁面。

build 不呼叫 dev、不修復 `.venv`、不安裝或升級依賴。資源依 `server-sidecar.spec` 的明確清單封裝，不掃描未知目錄後互動修改排除清單。`FH6_RUN_PNPM_AUDIT=1` 可額外執行網路 audit。Python 依賴仍採 requirements 範圍，尚非完整 lockfile 重現性保證；Rust／pnpm 首次建置仍可能下載既定依賴。

正式版優先綁定 HTTP `8001`，占用時選擇動態 HTTP port；UDP 遙測 port 維持設定值。Dev 的 `--dev` 模式則在 HTTP `8001` 占用時直接失敗。

## 失敗處理

| 情況 | 處理方式 |
| --- | --- |
| 缺少 Python／前端依賴 | 執行 `setup_dev.bat`，依第一個失敗命令的輸出處理 |
| `.venv` 版本不正確或損毀 | 先關閉開發程序，手動移開 `.venv`，再執行 setup；腳本不自動刪除環境 |
| 缺少 PyInstaller | 執行 `setup_build.bat` |
| HTTP／UDP／Vite port 被占用 | 關閉先前執行個體；腳本不依 port 或程序名稱強制清除其他程序 |
| Python 啟動失敗或逾時 | 查看啟動終端與 `backend/logs/backend.log`；直接執行上方後端命令排查 |
| 主視窗關閉後後端仍存活 | 先保留 log；正常路徑透過 stdin EOF 結束，逾時只清除此 host 建立的程序樹 |

lint、format 與測試由開發者明確執行。音訊初始化使用標準庫的非 WMI 版本資訊，裝置列舉與擷取各自維護執行緒的 COM session。若原生裝置呼叫仍掛起，清單會在約 1 秒回傳快取或預設值。實機與產物的驗證結果見 [Windows 音訊診斷紀錄](windows-audio-diagnostics.md)。
