# 自動調校發行與驗證記錄

日期：2026-11-24。來源為 `codex/auto-tune-native-release`，base `99c4e2dd` 加本功能分支變更；版本仍為 `11.45.27`，未發布新的 Release。

## 本機建置與離線資產

使用 `prepare_auto_tune_runtime.py` 準備固定 SHA-256 的官方來源，再建置 Rust release backend 及 Tauri Full EXE。驗證 EXE 為 162,506,240 bytes，SHA-256 `6735ca2961dd459cc839bf3c7db8114746dd3e439044c3fe1e6313977f4ae84c`。

將 EXE 複製至新的測試目錄，以 `scripts/smoke_auto_tune_release.py` 清空 PATH、提供無效的外部 Python/OCR 環境設定，呼叫產品的 `--auto-tune-verify`。內附 Python 3.13.17 isolated mode、原生 adapter、ONNX Runtime CPU 和 PP-OCRv6 small 均載入成功；驗證子程序禁止 socket 連線、DNS 和外部子程序。

空白 PNG 兩輪成功，整個子程序 0.701 秒。這只驗證發行封裝，不代表 OCR 準確度。接著以同一 EXE 重播 Abarth／Integra／NSX 的 18 張固定 hash 原圖，兩輪 36/36 screenshot-cases 符合人工答案，首輪 5.639 秒、第二輪 5.503 秒，包含子程序啟動的總時間 11.414 秒。沒有操作或修改這三台車的參數。

先前同一資產展開實作的建置（SHA-256 `838711b2edffe3c77fa983efba2f38e7846e9e2b3bb61e5360b8aff51b006dfa`）另故意損壞測試目錄內的 `python313._pth`，再執行 EXE 驗證入口；程式自動恢復原始 bytes，兩輪 OCR 通過。這是同機隔離測試，不是全新 Windows VM 驗證。

## 產品與工具測試

| 檢查 | 結果 |
| --- | --- |
| Rust backend，locked default features | 346 passed、6 既有 ignored |
| Rust backend，locked no-default-features | 334 passed、4 既有 ignored |
| Tauri host | 11 passed |
| Frontend Vitest，maxWorkers=2 | 245 files、1754 tests passed |
| Frontend TypeScript／Vite build | 通過 |
| 八個 auto_tune 工具測試模組 | 60 passed、43 subtests passed，使用真實 DB5／跨車原圖與發行 DLL |
| Ruff check／format check | 通過 |

MCP 契約涵蓋未開開發選項仍可探索工具、實驗性說明、工作互斥、request ID 重試、舊 run ID 拒絕、關閉桌面分頁不停止 MCP 工作。控制器測試涵蓋錯車拒絕、父程序結束、異常遙測、失效拉桿與辨識矛盾。

## 實際打包程式與 MCP

從新資料目錄啟動 Full EXE，後端回報 HTTP 8001、Companion 8002、UDP 8000；本機 MCP initialize 與工具回傳正常，`developerOptions=false` 時 `available=true`。MCP 圖片工具回傳有效 PNG。

錯車負例：遊戲為 1964 Aston Martin DB5，MCP 指定 2022 Acura NSX Type S；控制器在讀取車卡後 5.953 秒拒絕，未進入零件與調校參數操作。此負例未切換車輛。

## 最終 DB5 全流程驗收

上述 SHA-256 的 Full EXE 經 MCP 啟動 `run-1795512538466790-84516`，開發人員選項關閉，目標 Road／Circuit（Winter）。**232.298 秒，全程無人工介入，26 項最終建議已套用並重新開啟調校讀回確認**。64.890秒完成參數抓取，79.723秒完成底盤套用讀回；三檔因距離不足／缺高轉於137.784秒自動改用二檔，202.629秒取得合格量測，最後30秒返回、計算、套用與讀回。

二檔取得15.201秒有效資料、16個RPM區間、有效限轉7002 RPM。終傳4.07，各檔1.84／1.43／1.15／0.96／0.82／0.72。底盤包含胎壓、定位、防傾桿、彈簧、車高、阻尼和後差速器；沒有只完成齒比而略過底盤。胎壓建議29.3／28.1 psi，依遊戲0.5psi步進落在29.5／28.0psi；其他單位換算及取位結果一併保存在[驗收摘要](auto-tune-acceptance.json)。原始跑次、截圖及資料留在本機 scratch，摘要保存逐檔SHA-256以供核對。

本次起始底盤已含前次測試的建議值，因此232.298秒代表本次重讀、核對、實測與齒比更新，不能代表任意未知起始拉桿需要全幅移動時的最差耗時。先前實際改值、固定步進及彈簧微調另有測試；這次成功也不代表全車型均能自動完成。

## 額外車輛與重跑規則

2022 Acura NSX Type S（S1 728、AWD、九檔）使用正式量測流程，從三檔起步。含九個調校頁前後讀值、導航、量測與返回，共 87.674 秒；Rust 接受 9.439 秒、16 個轉速區間。前後欄位、單位和鎖定狀態完全相同，沒有執行調校套用或算牌。此測試是量測與辨識驗證，不是 NSX 完整自動調校驗收；其固定變速箱不符合全流程套用條件。

DB5 早期打包測試在109.797秒因固定起跑移動未到位而停止；改成地圖道路傳送後，三檔仍因541.14m內未取得高轉覆蓋而在134.290秒失敗。兩次負例保留，不列為成功。現在以道路圖標與寬度選點，游標移動後再次核對最後一幀，落地後核對遙測位置、朝向及靜止；距離不足且缺高轉時降檔，高轉完整但有效時間不足時升檔。最多三趟且不重複檔位，每趟獨立經 Rust 資格判斷。

升檔分支目前只由測試驗證，未在遊戲觸發；同趟斷油一秒、減速再加速的累積方案未實作。NSX 實跑在最後一幀守衛補強前，補強後其原始落點截圖重播通過；最終 DB5 打包全流程包含此守衛。

## 視覺備查與適用範圍

[完整圖集](../visual-review/auto-tune/README.md) 使用正式 AppShell 與隔離後端，但自動調校狀態為展示 fixture，與實機結果分開。涵蓋七個 core 的日夜模式、繁中／英文／日文、1280 與 320px、執行／停止／失敗等狀態，以及獨立的開發人員選項段落。

目前遊戲操作辨識以繁中、英制、16:9 畫面驗證；Abarth／Integra／NSX 提供截圖辨識樣本，NSX 另做不改值的實際量測。未驗證其他遊戲語言、全車型自動調校、乾淨 Windows VM 或 Narrator/NVDA。控制器仍內附 Python；[Rust 遷移評估](../../native/auto_tune_ocr/README.md) 列出後續替換順序與驗證條件。
