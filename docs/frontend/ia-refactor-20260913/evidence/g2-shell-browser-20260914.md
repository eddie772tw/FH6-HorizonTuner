# G2 Shell 受控瀏覽器驗證

> **歷史 evidence；進度敘述已 superseded（2026-09-20）。** 下列觀察只適用其原始 SHA／條件；原測試、限制與 `not-run` 完整保留。目前 W4 狀態請讀 [候選入口](../README.md)，勿沿用本文的 W2–W4 開工狀態。

日期：2026-09-14，Asia/Taipei。執行者：IA Coordinator as Codex。

## 候選與環境

- 基準：`5891d21bca35161836d84c51d1b6e9c279ec4709`。
- 狀態前置集合：`373c0b81add4b80786617c1b1358ce22ca78944d`。
- Shell 整合前 HEAD：`e9f754dc12823ec8fe2df6429fe3d4d6a4724425`；以下在此 HEAD 加上 P2 工作副本執行。最終提交與之後的重驗另記，不能把工作副本證據當成前置 HEAD 已含 Shell。
- Windows、Vite dev、Full `http://localhost:1420/` 與 Lite `/lite/index.html`、1280×720 in-app browser。操作使用 CUA；不是 Tauri WebView。
- 真實 backend 使用 `backend/main.py --dev --data-dir scratch/ia-runtime-data`，HTTP 8001、UDP 8000。資料限定此 worktree 的 scratch；沒有操作一般使用者資料、main 或其他 worktree。
- 原始 fixture 為 `tests/telemetry_replay_fixture.py` 與 `tests/fixtures/telemetry_replay/synthetic-v1.json`，契約 `fh6-telemetry-replay-fixture/v1`。衍生輸入使用合成車號 999901/999902、單調時間戳記及有限次 loopback UDP。這不是 FH6 遊戲資料或車輛校準。

## 已觀察的結果

| 子項 | 步驟與實際結果 | 範圍 |
| --- | --- | --- |
| C1/C2 | Full 只有即時／調校／賽事紀錄／HUD；Lite 只有即時／HUD。Lite Live 沒有直線加速測試。 | 受控 browser pass；最終 native 未執行 |
| C4 | 顯示 backend 已連線時，沒有 UDP 仍顯示 Data Out 待確認；合成 UDP 到達後顯示就緒，停送後顯示未持續收到。資料輸出指南可開關。 | Browser + 真實本機 backend |
| U1/U2 | Full/Lite AppMenu 可開 Settings；ModalPortal 位於 root 外，Escape 關閉後焦點返回選單。Full 有 Developer Tuning，Lite 無該 checkbox，其他 settings 類別仍可達。 | 前置薄入口；不等同 W2 Settings 重構 |
| T1 草稿 | 正式 Tune 的甩尾目標與 1423 kg 在 Tune → Sessions → Tune、Tune → HUD → Tune 後保持。 | 較早 e41fc10 工作副本觀察；相關 owner 邊界未改 |
| T1 RoadPrepare | `IA Synthetic Road Draft`、配置 `synthetic-only fixture`、條件 `controlled loopback` 尚未提交時，Tune → Sessions → Tune 後仍存在；optional details 本身重新折疊，欄位內容保留。 | 03:08 左右 e9f754d 工作副本；沒有建立 Road run |
| T2 | Developer 目標極速 301，在離開工作區並返回後保持。開啟擷取畫面、返回原工作區後也保留該內部入口。 | 隔離設定啟用 Developer；後已切回正式 Tune |
| T3 raw capture | 開始 `IA_SYNTHETIC_CROSS_PAGE` 後收 120 樣本；切至 HUD，再送 120 樣本；返回仍顯示錄製中，摘要共 240 樣本，metadata 保留。 | 合成 UDP → 真實 backend WebSocket → 真實 browser UI |
| T3 identity | 在 Tune 擷取中送新車號 999902：狀態改「已失效」，保留原 240 樣本，顯示車輛識別變更提示，沒有把新車 10 影格加進原檔。 | 未下載／未保存 raw capture |
| S1/S2 局部 | 隔離 SQLite fixtures A/B 各 80 樣本。Live 明確賽後分析會讀新 library 並選 B；選 A、主圈 2、比較圈 1，Tune 往返後仍選 A/2/1 與 40 樣本。 | 不完整合成圈速顯示 unknown，沒有捏造完整圈 |
| L4 手動 latest 失敗 | 停止自己啟動的 backend 後，在 Live 按賽後分析：保留 Live，顯示失敗與 Retry；重啟同一隔離資料 backend 後 Retry，成功進 Sessions，選 B、80 樣本。 | 最初會開舊資料的缺口已重現並修正；不是自動 race completion 證據 |
| T3 正式量測 | 1080 影格／18 秒 RPM sweep，6.8 秒時離開 Tune 至 HUD；返回後低／高轉速都完成，12/8 個 bins，「下一步」啟用。 | terminal publish 修正後以同組合成資料重驗 |
| T3 保存／失敗重試 | 對單一 engine-observations POST 做受控暫停。首次逾時顯示保存失敗並保留量測；重試時在「正在儲存」切至 HUD，再放行 POST；返回 Tune 已保存且 archive 只有一筆。攔截已清除。 | CUA DevTools 僅暫停本機 Fetch，真實 backend 保存；沒有替換 response |
| T4 archive 回讀 | 完整重載頁面、重新收到合成車 999902 後，讀到保存的 1500 kg／215 hp profile 與一筆 archive；再次確認未改配置後可沿用，Step 4 啟用。 | 只確認本輪 synthetic fixture 一致性，不是遊戲設定核實 |
| R2 基準與錄製 | 修正 capture-free snapshot 後建立 `IA_SYNTHETIC_ROAD_RUN` 成功。第一趟在 HUD 時完成保存（14.0 秒／140 樣本）；第二趟開始後 HUD → Tune，顯示仍錄製中且已有 7 樣本，明確停止後保存 4.7 秒／48 樣本。 | UI 真實呼叫隔離 backend；沒有變更 backend immutable guard，沒有提交完賽證明 |
| T1 Road finish 草稿 | 第二趟輸入 `1:23.456` 作為未提交測試文字，Sessions → Tune 後仍選第二趟、48 樣本、相同文字；完賽 checkbox 未勾，沒有提交。 | 草稿保留，不宣称合成資料完成真實賽事 |
| L3 自動完成 | 在 Live 送 480 影格後停止，真實 recorder 完成保存；UI 自動開 Sessions，選中新產生的 `session_55c75636972244dcba5f7925e5f2e753`，80 個樣本。 | 選取與本次 recorder identity 一致，未手動導航 |
| L4 非 Live 完成 | 在 HUD 送 480 影格後停止；完成時仍留 HUD，顯示分析入口。返回 Live 入口仍存在；點擊後開 `session_315e716384264c5fa5e70afb6d1146c7`、80 個樣本，入口消失。 | 實際 pending card 操作；不是 Live 的手動 latest 按鈕 |
| H4/H5 局部 | HUD offset X 從 0 改為 5，HUD → Tune → HUD 保留；新的 Lite provider 也從 backend 回讀到 5。 | 只有設定/往返；未點 native HUD launch，不宣稱 H5 native pass |
| X1 局部 | 進入 Sessions 後 Live canvases 不在主 workspace DOM。 | 其餘 request/channel/timer runtime 證據待追加 |
| X1 Road poll | 兩個 8 秒 CUA Network 視窗：Tune Road 有 8 次 `/api/road/live`；HUD 為 0。app analysis status／車輛／health 仍運作。 | 無 event truncation；僅計 request，不收集 payload |
| X1 Sessions refresh | 持續錄製下，Sessions current 的 6 秒視窗有 7 次 data、6 次 debrief；離開至 HUD 的 6 秒視窗兩者均為 0，status 仍持續。 | 涵蓋 page 的更新清理；不是所有 channel/listener 數量證明 |
| X1 diagnostics | 開啟診斷的 5 秒有 5 次 logs request；Escape 關閉後 5 秒為 0，焦點回 AppMenu。 | 無 event truncation；未清除或匯出日誌 |

## 執行中發現與修正

1. **latest 失敗導覽**：原先先切 Sessions、後讀資料，失敗時誤顯舊選取。改為先確認 exact header 與非空 samples，再檢查 operation/navigation ownership 後同時提交資料、選取與導航。CUA 失敗／恢復重試已驗證。Luna 獨立 consumer review 通過。
2. **race completion 訊號**：backend 會拒絕 `IsRaceOn=0`；原本 telemetry falling edge 不可依賴。Terra 改用既有 `/api/analysis/status` 的 recording identity 與完成狀態，新增無重疊、可 abort 的 poller。獨立 Terra review 通過；Live 自動開啟與 HUD 留頁實際驗證如上。Root 另修 pending card 返回 Live 即消失的問題，Terra 已複查。
3. **正式量測 terminal publish**：1080 合成影格 sweep 途中離頁後，provider 的 complete 轉換可能被最後一次 200ms UI throttle 略過，顯示停在 16.1 秒且繼續停用。Terra 改為 complete/invalidated/blocked 轉換強制發布，保留一般 collecting 節流；獨立 Terra review 及同資料 UI 重驗通過。
4. **擷取顯示節流**：raw capture 尾端停送後，badge 一度顯示 226 而摘要已有 240。identity 失效的強制結算後兩者為 240。沒有樣本遺失，但此顯示差異仍需記錄。
5. **Road evidence mapping**：archive 的 UI 選取物件附帶 `capture`，backend immutable observation 本身沒有該欄位，因 exact equality 而拒絕 baseline。Terra 在既有 JSON clone 之後只移除 snapshot observation 的頂層 capture，獨立 Terra review、9 個聚焦測試與實際基準／run 驗證通過。原始輸入、UI capture、公式與 backend guard 不變。

## 證據限制與下一步

後續純整合稽核在 c5e7fdf 發現 `onCompleted` 後第二段 preflight 的 race A/B 競爭，已修正並新增獨立回歸與審查；見 [交接取消修正](g2-race-handoff-fix-20260914.md)。本頁單一賽事的受控觀察不涵蓋該競爭場景，不能沿用為新版 mounted A/B pass。

G2 保持 partial。尚需完整 state/identity、race 競爭矩陣及 channel/listener 往返觀察，以及 **C5/H5 真實 Windows Tauri**。本環境沒有可用 native CUA surface，瀏覽器控制不可替代原生視窗操作或觀察。見 [native 交接](../handoffs/g2-native-20260914.md)，未完成前不開 W2。

此階段最新完整 frontend 為 **118 files／788 tests**，03:33 的 Full/Lite build 通過（包含 Road snapshot 修正）。`cargo build --manifest-path frontend/src-tauri/Cargo.toml --locked` 通過，僅證明 Debug Rust 編譯，不是 native 行為驗收。提交候選與驗證對照見 [Shell 交接](../handoffs/shell-20260914.md)；獨立 review、純測試、受控 UI、native、真實遊戲、三次效能量測保持分開記錄。
