# G2：重入輪詢修正與受控 identity／賽事交錯證據

> **歷史 evidence；進度敘述已 superseded（2026-09-20）。** 下列觀察只適用其原始 SHA／條件；原測試、限制與 `not-run` 完整保留。目前 W4 狀態請讀 [候選入口](../README.md)，勿沿用本文的 W2–W4 開工狀態。

日期：2026-09-14。Owner：IA Coordinator as Codex。程式及語意獨立審查：Terra。

本次操作使用實際 App、providers 與 backend，輸入全部為隔離合成資料。它補足下列指定 browser 場景，不代表 Windows 原生視窗、真實 FH6 或完整 G2/G5 通過。

## 精確來源與操作環境

- 修正前：`54165303f12c9598872905571f7162cc5f80effa`。
- 修正後：同一 parent，加上 `frontend/src/context/TelemetryRecorderContext.tsx` 的 Git blob `4b53495569904fb95a19d6195037834f3f8f14ca`。驗證期間此檔 SHA-256 為 `7fdcd53e8eb95c150615a36d0b09bf40d1fe5cf0d5172b4a9c5e0566a8b2bad9`；提交時只正規化 CRLF，Git blob 不變。提交後完整 SHA 與遠端 checks 另登記於 PR #345。
- 工作樹：`D:/FH6-frontend-ia-20260913/shell-race-fix`。Vite 1421、HTTP 8123、UDP 8124；原 `shell` 的 c5 候選及 1420/8001/8000 沒有變更。
- 臨時 `frontend/scratch/ia-g2.html` 掛載實際 App、現有 providers、StrictMode、Halfmoon 與 theme 初始化，只將 backend transport 指向 8123。它沒有執行 `main.tsx` 的 readiness gate，不能作 C5 啟動證據。操作後保存於本地忽略目錄 `scratch/ia-g2.html`，不納入產品。
- backend 使用既有 `main.app`、middleware、lifespan；隔離 DATA_ROOT 首次建立時拒絕覆寫既有目錄，只複製本任務先前的 synthetic settings/car fixture 與 SQLite backup。停用 forwarding/Discord；未改安全策略、endpoint、packet layout 或資料 schema。
- Network 計數只採時間窗內 HTTP request metadata；每 500ms 讀取事件，按 request wallTime 篩選。以下有效序列全部 `truncated=false`。請求數只證明列出的 page reads，不等同 channel/listener 總數或效能改善。

## 已重現問題與最小修正

錄製中的 `recordingCount` 每次改變，原 recorder status effect 會重新執行並立即發 request；provider 每次 render 又建立新的 laps/debrief callbacks，使 AnalysisView 的依賴 effect 重新讀資料。離頁雖停止 page requests，重入仍會放大資料讀取。

修正保留 2 秒 status 與 AnalysisView 原 4 秒更新節奏：status effect 只依賴 `race_recording`，同時最多一個 in-flight read；停用或 cleanup 時 abort 並拒絕舊回應。saved-list/laps/debrief callbacks 使用穩定 identity。没有改 AnalysisView、race observer 或 currentSessionId 的既有 last-session 語意。

Terra 最初提出 disabled 時清除 currentSessionId 的建議；比對原程式與 backend current/latest fallback 後撤回，因為那是既有選擇語意，並非此修正新增的缺陷。最終獨立 review 無 P1/P2。

### Sessions 兩輪往返

所有 mounted 視窗均在實際合成錄製進行中，資料選擇為 current；HUD 視窗是離開 Sessions 後的觀察。

| 序列 | 修正前 data / debrief / status | 修正後 data / debrief / status |
| --- | --- | --- |
| 初次 Sessions | 7 / 6 / 14（6017ms） | 2 / 1 / 9（6008ms） |
| HUD 1 | 0 / 0 / 14（6018ms） | 0 / 0 / 9（6018ms） |
| Sessions 重入 1 | 7 / 6 / 14（6014ms） | 2 / 1 / 9（6010ms） |
| HUD 2 | 0 / 0 / 12（6010ms） | 0 / 0 / 9（6016ms） |
| Sessions 重入 2 | 31 / 30 / 37（6015ms） | 3 / 2 / 9（6008ms） |

修正後沒有隨重入累積；最後 3/2 含 mount／時間窗邊界讀取。Global status 由 1 秒 race runtime 與 2 秒 display polling 繼續讀取，離頁不要求其歸零。第一輪探索曾有事件截斷，已排除；上表是重新以有限 90 秒 sender 取得的有效序列。

### Road 與 Diagnostics 重入

- Road 在修正前同一 parent 完成：Tune → HUD → Tune → HUD → Tune，各 8 秒 `/api/road/live` 次數為 **8 / 0 / 8 / 0 / 8**。本次 Context 修改不涉及 Road polling。
- Diagnostics 在修正後完成：開啟 → 關閉 → 開啟 → 關閉 → 開啟，各 5 秒 `/api/logs` 次數為 **5 / 0 / 5 / 0 / 5**；實際時間窗 5011 / 5007 / 5014 / 5017 / 5020ms。最後明確關閉 Diagnostics。

## Archive／Road identity

在 parent `5416530` 的 mounted provider 上：

1. Tune 的車 A（合成 ordinal 999902）回讀既有 archive 與 8000 RPM；使用者式確認並 reuse 後，peak power RPM 7205、torque RPM 1800，Next／Step 4 可用。
2. 離頁至 HUD、送入車 B（999903）、返回 Tune：顯示 B、沒有沿用 A 的 archive 選擇，量測 0 bins，Next／Step 4 不可用。
3. Road A run 進行中離頁至 HUD，連續有限 1800 frames 在第 1200 frame 換為 B，沒有中途停止送資料。A run 結算為 `identity-changed`，152 samples、0 dropped、0 failed writes；返回後 A 歷史仍可讀，但新 run 的 confirmed／unchanged 均 false，Start 不可用。

Road 證據 locator：workflow `25862ebea11e481482723de2745826b6`；run `3c997a4c78114ea6b6c0b29201eb9610`；summary `a33f72de5b6d4bb7b6feaac853a11c08`。首次手動操作曾因送資料結束而得到 `telemetry-stopped`／27 samples，未列作 identity pass。

這次 mounted 場景涵蓋 ordinal 改變；PI/class/RPM 的純邊界測試不能寫成全部 UI 組合已測。Terra 核對 Road domain：已結算 A 歷史可在目前車輛為 B 時補填實際賽事 finish；需要失效的是新 run 的 identity confirmation，不能把禁止閱讀／補填 A 歷史當成原需求。

## Mounted A／B completion 第二段交接

在修正後候選使用有限序列：A（999908）900 frames，停送 5 秒，B（999909）600 frames。sender 起送前等待 15 秒，讓 observer 先就緒。沒有修改回應內容。

- A：`session_d1dbf88b95494781a883ee2ede661a11`。第一個 exact saved-data GET 200 正常放行；第二個同 identity GET 200 在 lifecycle 已交給 Shell 後暫停，時間 `1789334493581`ms。
- `SessionsRuntime` 的真實 status consumer 在 `1789334495484`ms 已觀察到 B `session_d0991b55faaf40da898b683fd1227240`、recording、4 samples；立即釋放 A，持有 **1903ms**，未超過 request timeout。Observer：released=true、truncated=false、errors=[]。
- A 釋放後仍顯示 Live；B 完成後開啟 Sessions，Loaded Session 精確為 B、車 999909、**100 samples**。A 沒有導頁或覆蓋選擇。
- 清除 Fetch interception patterns，有限 sender 兩段均終態完成。先前缺少 interception、21911ms 過期 hold 或事件截斷的探索全部排除；那些 timeout/retry UI 不作產品回歸或成功證據。

此操作補足實際 mounted 第二段 handoff；各 list/samples/refresh 等待邊界及 dispose/retry 仍由 [純整合回歸](g2-race-handoff-fix-20260914.md) 補充。原 c5 的 HUD completion/pending entry 局部證據保留於 [browser 紀錄](g2-shell-browser-20260914.md)，不可擴稱本次又重跑全部場景。

## 驗證與交付邊界

- 此一 Context blob 已執行完整 frontend tests：**119 files／794 tests PASS**；TypeScript + Full/Lite production build PASS；`git diff --check` PASS。hash 重核一致；文件整理沒有再改產品 source，不為相同內容重跑測試。
- Terra 獨立審查 Context 變更及 Road confirmation 語意；mounted 驗證使用真實 provider/consumer，不新增違反專案規範的 React/DOM unit harness。
- Vite、backend、sender 均已停止；停止後 TCP 1421/8123、UDP 8124 listener 為 0。隔離 fixture 和 logs 保留。原 native c5 worktree 未 pull／切版。
- Terra 另對照 G2 remaining、實際 consumer 與上述觀測：操作 1–3 已具所需的受控證據；non-Live pending 及 page cleanup 沒有因這次 polling 變更失效，不重跑已通過場景。完整資源與後期矩陣仍按各自 gate 取得。
- G2 仍 partial，最小剩餘為 Full/Lite 的 C5/H5 native。G0 native/performance baseline、W2–W4、G5 未完成；PR #345 保持 draft，沒有發布 WAVE2_BASE_SHA。
