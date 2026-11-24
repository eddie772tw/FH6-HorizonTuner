# Windows 原生 OCR 實驗

自動調校採用 PP-OCRv6 small＋原生 ONNX Runtime CPU 作為發行方向；控制器預設為 `onnx`，`windows` 保留為明確選用的比較工具。兩者使用同一份截圖與區域介面。ONNX 路徑的模型、影像前處理、文字偵測與 CTC 解碼均在 `fh6_ocr.dll` 執行；Python 只用標準庫 `ctypes` 傳入路徑、區域及讀取結果，不需要 Paddle、NumPy、Python onnxruntime 或 OpenCV。

## 建置與啟用

Windows x64 建置需要 Visual Studio C++ Build Tools、Rust、pnpm 及專案的 Python 3.13／uv 建置環境。使用者端不需安裝這些工具。

```powershell
uv run --no-project --python .venv/Scripts/python.exe python scripts/prepare_auto_tune_runtime.py
# 來源已快取時可完全離線重建：
uv run --no-project --python .venv/Scripts/python.exe python scripts/prepare_auto_tune_runtime.py --offline
```

`sources.lock.json` 固定 Python 3.13.17 embeddable、Microsoft.ML.OnnxRuntime 1.32.0、Paddle 官方 PP-OCRv6 small ONNX 模型和 18,708 字字典的 URL／SHA-256。下載只發生在建置階段；不從本機 MAAEND 複製發行資產。模型來自 PaddleX 官方 inference model 儲存庫；字典與 Apache-2.0 授權固定至 PaddleOCR commit `dab3fe35379033fdcb2d0e9572fac0b36c9a9ebf`。ONNX Runtime 套件的 LICENSE、ThirdPartyNotices 與 Python 自帶 LICENSE 一起保存。

`build_all.bat` 與 Windows Release workflow 都會先準備 `frontend/src-tauri/auto-tune-runtime/`。Tauri Windows release build 缺少 payload 時直接失敗；Linux 不包含此 Windows 功能。EXE 內嵌 runtime 與控制器，啟動桌面後端前解出到 portable data 的 `auto-tune/runtime/<內容識別碼>/`，每次啟動逐位元組核對並還原遭損毀的資源，並保留資產 handle 防止執行期間被替換。來源或 worker 改動會產生不同目錄。桌面與 MCP 共用 Rust 後端中的單一執行控制器；啟動固定使用內附解譯器和 ONNX 引擎，不搜尋 PATH，不使用使用者的 OCR 環境變數。

開發者仍可直接呼叫 worker 的 `--ocr-engine windows` 做比較；桌面產品固定使用 `onnx`。原生 session 在任何遊戲輸入前載入模型；缺少 DLL、模型或字典會明確停止，不會悄悄換引擎。

## 執行設計

- C ABI 分為 create、open、read、destroy；每個 session 保留兩個模型，每張 PNG 僅解碼一次，再依序讀取區域。Python 端以 lock 保護 session，不在 UDP 接收路徑上推論。
- ONNX Runtime 使用 CPU、2 個 intra-op threads、1 個 inter-op thread，關閉 spinning。無 CUDA／GPU runtime 依賴。官方 [C／C++ API](https://onnxruntime.ai/docs/get-started/with-c.html) 負責推論。
- 已知單行區域使用 `only_rec` 省略文字偵測，包含調校數值、車卡規格列、分離後的數字與單位、驅動型式，以及已縮窄的選單選項。PI 等其他區域維持 detection + recognition。
- 偵測後處理採 DB probability map 的連通區及水平矩形擴張，針對 FH6 水平選單文字；不等同 MaaFramework 的完整多邊形／旋轉文字處理。
- 調校讀值保留既有字形與雙區域核對。車卡在原始解析度依字距分開數字與單位，再與整列辨識核對；辨識結果矛盾時拒絕。公升 `l` 必須有獨立字距及直筆字形證據，避免當成數字 `1`。單位採白名單，不以車型預設補值。
- 驅動型式裁切排除傳動圖示，接受精確「前驅／後驅／四輪驅動／全輪驅動」標籤及 FWD／RWD／AWD；本次跨車實圖驗證到「前驅」、RWD、AWD。車卡必須與目前車輛相符；選車預覽與鎖定拉桿不能提供可套用數值。

## 比較與回歸

`scripts/benchmark_auto_tune_ocr.py` 固定 17 張真實 DB5 截圖的 SHA-256、54 個區域與人工轉錄答案。來源截圖須另行提供，沒有把遊戲錄圖加入原始碼儲存庫。

```powershell
uv run --no-project --python .venv/Scripts/python.exe python -m scripts.benchmark_auto_tune_ocr --engine windows --source C:/recorded-db5-run
uv run --no-project --python .venv/Scripts/python.exe python -m scripts.benchmark_auto_tune_ocr --engine native --source C:/recorded-db5-run
uv run --no-project --python .venv/Scripts/python.exe python -m scripts.benchmark_auto_tune_ocr --engine native-lines --source C:/recorded-db5-run
```

依序執行，避免兩個引擎搶 CPU。`native-lines` 在同樣區域中，讓人工標記的單行項目略過偵測；是比較模式，並非目前產品所有區域的設定。各引擎有 7 次獨立 session 冷啟動與 7 輪暖機後重播。冷啟動計時涵蓋 session 建立及第一張車卡辨識，不含啟動 Python 解譯器的時間，OS 檔案快取未清除。暖機計時包含 PNG 解碼與同張圖的全部區域，不包含遊戲截圖、輸入、動畫或量測。

只正規化空白、Unicode 寬度與負號；不忽略單位、負號、尾零、文字順序或繁簡差異。原始 OCR 分數不等同整個工作流正確率，後者還有字形讀取、單位解析與狀態守衛。

回歸測試以 `FH6_OCR_CORPUS=<benchmark 輸出資料夾>` 啟用實圖；原生 DLL 測試還需 `FH6_OCR_RUNTIME`。早期輪圈／胎寬及調校錄圖可用 `FH6_DB5_CAPTURE_DIR` 指定。

```powershell
uv run --no-project --python .venv/Scripts/python.exe python -m pytest -q scripts/tests/test_auto_tune_ocr.py scripts/tests/test_auto_tune_vision.py scripts/tests/test_auto_tune_sliders.py scripts/tests/test_auto_tune_measurement.py
```

## 跨車輛截圖回歸（2026-11-24）

先以 DB5 確定裁切與分離策略，再依序取得 2017 Abarth 124 Spider（RWD）、2023 Acura Integra A-Spec（前驅）、2022 Acura NSX Type S（AWD）的遊戲原始截圖。Integra 首讀揭露驅動型式白名單不接受已正確辨識的「前驅」，修正精確標籤對應後凍結版本，再測 NSX；NSX 沒有觸發辨識程式修改。首讀結果保留，不能把修正後重播當成全程盲測。

最終固定 18 張 2560×1440 繁體中文／英制畫面：三車 15 對車卡數字與單位、10 張調校頁的 19 個可讀數值及 22 個鎖定欄位、一張輪胎尺寸、一張升級選單，以及三張選車預覽負例，全部符合人工轉錄。所有遊戲操作僅切換車輛、選單與分頁，沒有改拉桿、安裝零件或確認調校；完成後切回 DB5。

`scripts/tests/fixtures/auto_tune_cross_car.json` 保存人工答案與 PNG SHA-256，原圖留在本機 `scratch/ocr-cross-car-20261124/`；可透過環境變數指定其他副本。這是三台額外車輛、單一解析度與介面語言的截圖驗證，不是所有車型、其他單位／解析度或完整自動調校的通過率。

本機同一個原生 session 重播 18 張：首輪含模型載入 5.097 秒，暖機五輪 4.831–5.141 秒、中位 4.986 秒；六輪共 108/108 screenshot-cases 符合。計時包含逐圖 SHA 檢查，以及三張車卡額外讀取一次數字／單位以核對原始格式，排除 Python 啟動、遊戲操作及截圖。這是驗證工具耗時，不是完整流程耗時；詳見本機 `validation-v2.json`。

```powershell
$env:FH6_OCR_RUNTIME = (Resolve-Path scratch/onnx-ocr-comparison/runtime).Path
$env:FH6_CROSS_CAR_CAPTURE_DIR = (Resolve-Path scratch/ocr-cross-car-20261124).Path
uv run --no-project --python .venv/Scripts/python.exe python -m pytest -q scripts/tests/test_auto_tune_cross_car.py
```

## 發行資產與離線驗證

此版本的 payload 為 54 個資產、約 76.5 MB（未壓縮；EXE 大小另計）。原生 adapter 自行實作，沒有連結 MaaFramework 或複製 MAAEND 程式碼。Visual Studio CRT 來自本機 Build Tools 的 x64 redistributable 目錄，僅複製所需 app-local DLL。

正式 EXE 提供不開遊戲、不發出輸入的驗證入口：

```powershell
& ./FH6-HorizonTuner.exe --auto-tune-verify C:/corpus C:/corpus/manifest.json C:/evidence/report.json
```

需先建立 report 所在資料夾；CLI 會經由產品共用的資源展開路徑，呼叫內附 Python、匯入所有控制器模組、核對每張圖 SHA-256，再比較辨識與人工答案。子程序清空 PATH、移除 Python/OCR 環境設定、啟用 isolated mode；驗證程序禁止 socket 連線、DNS 與外部子程序。這是本機隔離重播，不等同乾淨 Windows VM 或整段遊戲操作驗收。跨車 OCR 樣本只拍圖，不調整任何參數；另有 NSX 不改值的實際量測，見[驗證記錄](../../docs/guides/auto-tune-validation.md)。

官方 ONNX 模型與先前實驗來源的二進位 hash 不同，但字典的 18,708 個字元逐項一致，18 張跨車回歸通過。辨識新增以下保護：單位辨識失敗不能略過整列數值矛盾；公升尾端 `1` 只在精確文字匹配與直桿證據成立時處理；滑桿字形若與所有可讀 OCR 數字相反則拒絕。單位第二讀採 light mask，與原圖有不同像素輸入；這不是第二個模型，也不把兩次相同文字當獨立正確率證明。保留 `LB/IN` 斜線要求，不接受模糊的 `LBIN`。

## 剩餘控制器移植 Rust 的評估

採用 [modular-refactoring](../../.agents/skills/modular-refactoring/SKILL.md) 的模組合約：Rust 後端繼續擁有全部調校公式和量測資格；移植僅取代 Windows 操作與流程調度，不另寫算牌公式。

| 邊界 | 目前 owner | Rust 移植與必要驗證 |
| --- | --- | --- |
| 發行資源、開發選項、開始／停止、履歷讀取 | Tauri 資源管理＋Rust 後端 | 已由 Rust 管理；測試資產損毀還原、執行互斥及更新／離開時停止 |
| OCR 模型、前處理、偵測、CTC | 原生 C++／ONNX Runtime CPU | 可直接用現有 C ABI 從 Rust 載入；保留同圖多區域與 session 重用，不需要改模型 |
| 視窗擷取、前景守衛、鍵鼠批次輸入 | Python ctypes／Win32 | 優先移植為 windows crate adapter；以 RAII 放開按鍵，測試失焦、STOP、滑鼠遮擋、DPI、拖曳與固定步進 |
| 車卡、輪胎、引擎選項、滑桿解析 | Python 純邏輯與像素判斷 | 固定 JSON 輸入／輸出，以 DB5 和留出車 PNG 重播逐欄核對；保留不確定即停止與單位核對 |
| 場景導覽、預設三檔及換檔重試、返回車庫 | Python 有狀態流程 | 最後遷移；保留 HTTP 動態埠、WebSocket telemetry、取樣資格、方向／停車守衛。需要新的完整實機驗收，截圖不能替代 |

技術上沒有依賴 Python ML 套件的障礙。將控制器變成 Rust 可移除內附 CPython、減少動態資源與跨程序封裝成本；OCR 的 CPU 推論速度不會因改寫調度語言而自動變快。主要風險在視窗／輸入結構、取消與場景時序，不在計算公式。此次先以內附隔離 runtime 消除使用者安裝依賴；Python 控制器尚未宣稱完全移除。未來應逐模組替換、共用同一份截圖語意真值，再重新量測完整 Step 1～3 的耗時。
