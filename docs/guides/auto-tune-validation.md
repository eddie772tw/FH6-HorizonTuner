# 自動調校發行與驗證記錄

日期：2026-11-24。來源為 `codex/auto-tune-native-release`，實機及離線驗收來源 commit `48af554c`（base `99c4e2dd`）；版本仍為 `11.45.27`，未發布新的 Release。

交付前另合入 main `31daaa55` 的 Altezza HUD 更新，僅合併三份語系字串衝突，完整保留雙方鍵值；自動調校控制器、OCR 與打包程式未改。下列 EXE 和遊戲數據固定於 `48af554c`，不冒稱同步 main 後重跑遊戲。整合後另重跑前端 build／測試與 Rust 兩種 feature 測試。

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
| Frontend Vitest，maxWorkers=2 | 245 files、1759 tests passed（同步 main 後） |
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

DB5 驗收當時升檔分支只由測試驗證；下列 Cadillac 驗收已實際觸發兩次升檔。同趟斷油一秒、減速再加速的累積方案未實作。NSX 實跑在最後一幀守衛補強前，補強後其原始落點截圖重播通過；最終 DB5 打包全流程包含此守衛。

## Cadillac Road 與 OCR 多數決追加驗收

使用者回報中央差速器 `85 / 65 / 65` 衝突後，依指示改為 OCR 優先多數決：兩個裁切相同就採用，字形異議寫入履歷；OCR 不同時字形提供第三票，至少兩票一致，無多數仍停止。沒有增加截圖／OCR 次數，也沒有放寬車輛、頁面、單位及保存後讀回檢查。兩個裁切共用模型，不能當作兩個獨立模型的準確度保證。

原始兩張 Cadillac 差速器畫面顯示65%，原生OCR均讀65，字形錯讀85；低解析字形的孔洞分類是誤判來源。另補資料庫 `XTS Limo` 與遊戲 `XTS Limousine` 的完整單字別名，保留年份與唯一車輛匹配。

本次 Full EXE SHA-256 為 `11a89781ae58627de2ab4c9e9118a6a0be91d5a1ef2687645944f60e69be4bc3`，來源為 `f3ee19a8` 加上述 OCR／別名修正。MCP 執行 `run-1795528583183682-83240`，2013 Cadillac XTS Limousine，S1 798、AWD，Road／Winter。**335.774 秒，全程無人工介入，30 項最終值已保存及重新開啟調校回讀**。驗收結束後另以電腦操作開啟胎壓及齒比頁人工目視核對，未改值；這段檢視不計入自動流程耗時。

| 階段 | 累計秒數／結果 |
| --- | --- |
| Step 1 完成參數採集 | 73.840 秒 |
| Step 2 完成22項底盤調整及回讀 | 118.698 秒 |
| 三檔量測 | 有效2.265秒，時間不足，自動升四檔 |
| 四檔量測 | 有效4.752秒，時間不足，自動升五檔 |
| 五檔量測 | 有效8.830秒，16個RPM區間，通過Rust資格 |
| 最終套用及保存後回讀完成 | 335.774 秒 |

終傳3.31，一至七檔3.60／2.51／1.81／1.35／1.03／0.82／0.67。胎壓建議30.3／28.8psi，依遊戲步進套用30.5／29.0psi；彈簧建議31.7／27.6kgf/mm，畫面讀回1775.1／1545.7lb/in。中央差速器從65%調整到62%，兩個值的字形異議均降為提示，沒有中止流程。全部30項建議、實際值及原始資料hash見[Cadillac驗收摘要](auto-tune-cadillac-acceptance.json)。此車起始設定與目標不同，包含實際底盤改值，仍不代表全車型或最差耗時。

同一EXE清空PATH並提供無效外部Python/OCR設定，離線驗證入口重播兩張Cadillac原圖兩輪4/4通過，worker總計2.347秒；18張Abarth／Integra／NSX原圖兩輪36/36通過，14.589秒。原圖hash固定，沒有操作其他車輛。八個工具模組60 passed、3 skipped、54 subtests passed；略過案例需要未提供的舊DB5目錄，另以既有DB5工作流原圖驗證。

保留負例：先前僅加入OCR多數決的跑次72.680秒因Limo別名停止；更新EXE後一次從調校編輯器啟動，在2.381秒被車庫起始畫面檢查拒絕，返回車庫後才開始上述完整跑次。335.774秒不包含這兩次排錯與編譯時間。

驗收後另修正CI發現的工作目錄時間戳碰撞：使用原子建立及AlreadyExists重試，避免Windows同一時刻啟動重用目錄。此修正由Rust測試驗證，不在上述EXE內；沒有改變已驗收的OCR、計算或遊戲控制流程。

依後續指示，身分辨識進一步改為有效即時遙測的CarOrdinal優先，不要求資料庫車名一致；只有取不到有效編號才退回名稱查詢。以兩個同編號且時間戳前進的封包確認，並核對車卡PI／驅動形式。Agent提供名稱不同時，只在該名稱能明確對應另一個編號時拒絕；無法對應的拼法／本地化名稱只提示。採集前後已知編號改變仍停止。

使用目前Cadillac實際封包，以不存在的名稱`unlisted localized vehicle name`呼叫新版辨識，成功得到2128，沒有遊戲輸入。此追加變更另以72 passed、3 skipped、54 subtests passed驗證；涵蓋無封包、凍結時間戳、切車、時間倒退／溢位、錯誤PI、名稱不一致以及明確不同目標編號。上述335.774秒完整跑次發生在此追加變更前，不能冒稱已對追加變更重跑整車。

工作目錄避碰後Rust完整測試347 passed／6既有ignored；更新MCP參數說明後另跑兩個MCP契約模組7 passed。前端沒有變更，沿用上方已驗證結果及固定版本截圖。

追加變更的最終EXE SHA-256 `226296e77594e31f01ec46a777ae0d473489c944617e8ccc83b25c6f717ea8e4`，後端release及Tauri Full建置通過。清空PATH／無效外部Python設定下，Cadillac兩張原圖兩輪4/4通過，worker 2.670秒；再以該EXE展開的隔離Python及控制器唯讀呼叫身分辨識，不存在的車名仍取得目前2128。展開的measurement_api／collect／worker／vision逐檔與來源bytes一致。更新版另存於本機scratch/telemetry-identity-release，驗證時使用者正駕駛，未替換正在執行的舊版；未重新自動改車。

## 視覺備查與適用範圍

[完整圖集](../visual-review/auto-tune/README.md) 使用正式 AppShell 與隔離後端，但自動調校狀態為展示 fixture，與實機結果分開。涵蓋七個 core 的日夜模式、繁中／英文／日文、1280 與 320px、執行／停止／失敗等狀態，以及獨立的開發人員選項段落。

目前遊戲操作辨識以繁中、英制、16:9 畫面驗證；Abarth／Integra／NSX 提供截圖辨識樣本，NSX 另做不改值的實際量測。未驗證其他遊戲語言、全車型自動調校、乾淨 Windows VM 或 Narrator/NVDA。控制器仍內附 Python；[Rust 遷移評估](../../native/auto_tune_ocr/README.md) 列出後續替換順序與驗證條件。
