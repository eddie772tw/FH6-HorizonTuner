# Windows WMI 與 WASAPI 診斷紀錄

日期：2026-09-12。環境：本機 Windows、uv 管理的 CPython 3.13.12、SoundCard 0.4.6、PyInstaller 6.22.2。已驗證本機 source 與本次 Full／Lite 打包產物；其他 Windows 主機仍需另行驗收。

## 已確認的兩個問題

1. **WMI 查詢掛起**：SoundCard 匯入時為辨別 Windows 版本呼叫 `platform.win32_ver()`，PyInstaller 的 compatibility 模組也呼叫此函式。本機 Python traceback 停在 `_wmi_query`；獨立 `platform.system()` 探針等待 18 秒仍未完成，PowerShell `Get-CimInstance Win32_OperatingSystem -OperationTimeoutSec 3` 也回傳 `HRESULT 0x40004` timeout。因此不是單靠重裝 Python 套件即可判定能修復的問題。
2. **跨執行緒缺少 COM 初始化**：在裝置探索執行緒匯入 SoundCard 後，另一錄音執行緒會出現 `0x800401f0`（`CO_E_NOTINITIALIZED`）。使用當前執行緒的 COM session 後，正常 source 與打包產物均能收到 loopback frame。

CPython 3.13.12 的 WMI 程式對初始化與連線設定等待期限，後續讀取結果仍使用同步 `ReadFile`，不能假定版本查詢一定快速返回。[CPython 原始碼](https://github.com/python/cpython/blob/v3.13.12/PC/_wmimodule.cpp#L269-L288)

Microsoft 要求每個使用 COM 的執行緒各自初始化；成功結果包含 `S_FALSE` 時，也必須對應呼叫 `CoUninitialize`。既有 apartment 的 ownership 不應由其他執行緒釋放。[CoInitializeEx 文件](https://learn.microsoft.com/en-us/windows/win32/api/combaseapi/nf-combaseapi-coinitializeex)

## 專案內修正

- `backend/audio_devices.py` 的 SoundCard 匯入區段使用 CPython 既有的 Windows 版本 fallback：只在有鎖的匯入區段暫令可選的 `platform._wmi` provider 不可用，成功或失敗都立即恢復。版本資訊由 `getwindowsversion`、`ver` 與 registry 取得；不自行維護 Windows 版本對照表。此處依賴專案指定的 Python 3.13 標準庫實作，升級 Python／SoundCard 時應重新檢查。[CPython fallback 原始碼](https://github.com/python/cpython/blob/v3.13.12/Lib/platform.py#L388-L462)
- `backend/audio_devices.py`：一次只保留一個 native 裝置探索 worker，呼叫等待上限為 1 秒；成功清單快取 30 秒，失敗退避 5 秒。native 呼叫掛起時不持續建立新執行緒，回傳既有清單或預設裝置。
- `backend/audio_spectrum.py`：裝置列舉與 loopback 擷取分別在執行它們的執行緒初始化／釋放 COM；保留既有清單 API、FFT 與音量計算。
- `/api/audio/devices` 使用 FastAPI 的同步 worker 路由，不讓主機裝置列舉阻塞 HTTP event loop。
- HTTP 啟動採單程序 socket handoff，不依賴 Uvicorn 的多 worker OS 列舉路徑；完成 HTTP 與 lifespan 初始化後才發布 ready。
- `scripts/build_sidecar.py` 為每次建置建立暫存 `_wmi.py`，使可選模組以 `ImportError` 回報不可用，透過該次 builder 的 `PYTHONPATH` 讓 PyInstaller 與 hook 子程序都採標準庫 fallback；結束後刪除暫存目錄。`build_all.bat` 與 CI／release／diagnostics workflow 共用此入口。`server-sidecar.spec` 排除 `_wmi`，不把暫存 shim 或原生 `_wmi.pyd` 封裝進產物。
- 主機測試失敗診斷使用 `scripts/windows_process_snapshot.py` 的 Toolhelp 快照，取得 PID、父 PID 與執行檔名稱，再選出受測程序樹，不再透過 WMI 讀取全機 command lines。[Microsoft Toolhelp 文件](https://learn.microsoft.com/en-us/windows/win32/api/tlhelp32/nf-tlhelp32-createtoolhelp32snapshot)

## 驗證與限制

正常 source 入口 `get_available_audio_devices()` 在 **0.117 秒**列出 3 個實際播放裝置；WASAPI 收到有效 frame，停止後 worker 退出，匯入與擷取前後 `platform._wmi` provider 均為原物件。透過正常 `backend/main.py` 啟動後，`/api/audio/devices` 在 **0.170 秒**回應 HTTP 200、3 個實際裝置；頻譜 API 回報 `source=wasapi`、`state=live`、有效 sequence。config API 仍為 HTTP 200，stdin EOF 後 exit 0。

`build_all.bat` 實跑成功，Full／Lite 版本為 **11.45.17**。兩個新 EXE 分別複製到獨立目錄，以空白 data-dir 啟動：裝置 HTTP 回應分別為 **0.271／0.162 秒**，各列出 3 個真實裝置並收到 WASAPI frame（當時 `state=silence`）。WebView 的 React root 有內容，入口 JS／CSS 全部 200；正常關窗 exit 0 並釋放 HTTP／UDP。Lite 另修正資源根目錄：封裝共用 `dist`，主視窗進入 `lite/index.html`，避免只封裝 `dist/lite` 而遺漏 `dist/assets`。

後端 EXE 的 CArchive／PYZ 共檢查 **1726 entries**，包含音訊 helper 與 SoundCard，不含 `_wmi` 或建置暫存 shim。以上不需要在驗證探針中替產品手動注入 WMI patch。

本機 WMI 服務本身沒有修復，也沒有重建 repository、重啟服務、改驅動或修改第三方／系統 Python 檔案。應用程式所需的版本與程序資訊已有替代路徑；直接執行 `python -m PyInstaller` 等未經專案入口的其他工具仍可能遇到主機原有問題。本次沒有驗證其他音訊硬體、乾淨 Windows、音質或遊戲同步。

音訊單元測試使用受控裝置／執行緒，不依賴測試機的音訊硬體。完整 pytest **302 passed、8 deselected**；前端 **579 tests**、工具 **31 tests** 通過。另以 `-m "executable_bundle or host_diagnostics"` 執行產物 metadata 與主機測試，**8 passed、1 deselected**，含 Full／Lite 預設與動態 HTTP port、關閉釋放與重新啟動。
