# 舊調校公式移除與歷史資料封存

此變更接續 #657，實作 #658。它取代先前「永久保留凍結 solver 供歷史推薦重算／回退」的決策；歷史版本仍有身分，已退役公式不再有執行入口。Developer Tuning 依使用者追加指示完整移除。

## 現行運算範圍

| 用途 | 正式 owner／版本 | 處理 |
| --- | --- | --- |
| Road | `gearing/road.rs`，`aego-road-launch-envelope/v3` | 數值不變 |
| Rally | `gearing/rally.rs`，`aego-rally-joint/v1` | 沿用 #657 模型與原容差；包含 #654 獨立審查的相鄰刻度修正 |
| Drift | `gearing/drift.rs`，`aego-drift-working/v1` | 仍要求主檔、RPM、輪速目標 |
| Drag | `gearing/drag.rs`，`aego-drag-joint/v1` | 起步／末速約束不變 |
| DangerSign 既有路徑 | `gearing` 的內部實作 | 保留原運算，不新增第五個 AEGO 模型、ID、設定入口或獨立項目 |
| 底盤／定位 | `chassis_load.rs`、`chassis.rs`、`alignment.rs` | 現行 schema v1／v2 與其他模式仍使用的數值策略保留；歷史 wire ID 不代表整個模組已退役 |
| EV／CVT | 各自現行 Rust owner | 不改計算、證據或可用性契約 |

新的 ICE 推薦使用 `rust/ice-measured-workflow-v4`。四個 AEGO 模型有明確模型 ID；DangerSign 保持既有路由，不加入四模型 registry。推薦保存仍從合格原始證據重建比對，未受信任的版本、模型標籤或數字不構成資格。

## 移除清單與消費者

| 原始程式／入口 | 原消費者 | 本次結果 |
| --- | --- | --- |
| `frontend/test-reference/tuning/`，63 個檔案 | 舊 TS characterization 與部分前端測試 | 整個可執行目錄移除；現行流程測試改用正式型別、資料形狀與 Rust 回應 |
| Rust RoadJointV2／RallyV1／DriftV1／DragV1、`gearing/legacy` 與 wrappers | ICE workflow v1／v2／v3 推薦重算 | solver、enum variants 與歷史 dispatch 移除；版本字串只供分類封存 |
| `legacy_cli.rs`、`legacy_mcp.rs` | 舊 CLI、MCP quick solver 與處理建議 | 公式移除；舊命令／快取的 tool 名稱只回錯誤，不計算、不寫 preset、不做離線 fallback |
| `developer.rs`、`TuningView_dev`、專用面板與狀態 | Developer Tuning | 完整移除；設定區與 workspace 不再提供此功能，舊儲存開關不再控制畫面或 WIP HUD |
| 原始遙測採集工具 | 原 Developer Tuning 的採集入口 | 作為資料工具保留，入口改在正式調校 Step 3，與算牌公式無關 |

正式替代入口為 `fh6-agent solve workflow --args-file ...` 與 MCP `calculate_tuning_workflow`。必須提供完整車輛設定及可重播／已保存的合格證據；裸峰值不能轉換成已驗證引擎證據。`telemetry snapshot` 與未驗證 preset 的讀取保留；不從胎溫猜測精確調校指令。

MCP discovery 移除三個舊工具，現為24項；快取名稱只回退役錯誤。Developer設定不再出現在新預設或可更新開關中；既有檔案的未知欄位保持未使用，不為刪功能改寫原檔。所有工作流程寫入先要求存在且未退役的root，不存在的root回409，已退役root回410。

這是此 PR 合併版本的明確行為變更，沒有保留另一路可執行舊公式的過渡期，也沒有新增 feature、crate、外掛或歷史計算服務。

## 封存資料與操作

- TypeScript ICE／EV 推薦與 Rust ICE workflow v1／v2／v3 改為封存；Rust EV v1／v2／v3 的獨立契約繼續保留。
- `GET /api/road/archives` 只讀取既有資料，回傳 `status: retired`、`validated: false` 與原始 `record`。舊 Road 工作流程另附原始 `documents`，保留設定、試跑與報告；匯出的是原始記錄／記錄陣列，不把狀態包裝寫回資料庫。
- 試跑幀存於獨立的 session／telemetry 資料，不內嵌於歷史文件陣列。封存面板依每筆 run 提供「匯出錄製幀」，使用既有 capture GET 讀取錄製資料與原始 recording／references；不重新分析或求解。啟動復原略過已退役 workflow 的中斷 run，避免 finalize session 或新增 summary；現行 workflow 的復原流程維持。
- 此讀取由 App 在 telemetry engine lock 外派送；沒有執行模型、重建推薦、補新診斷、更新資格 cache 或遷移儲存。
- 現行 compatibility／workflow 清單不混入退役記錄。既有記錄的 GET 仍可讀；所有退役工作流程的寫入／試跑入口拒絕。封存不提供套用、等價重配或重新保存為合格推薦的操作。
- 重新計算是使用者明確完成正式流程後建立的新推薦，要求現行必要輸入與合格證據，產生新記錄，不改原始封存。直接修改 formula/model ID、匯入封存值或夾帶 `validated` 欄位不能取得資格。
- 未知版本不選最新模型；把已退役模型放進 v4 snapshot 也不會恢復 solver。封存分類字串不是可選執行器。
- Companion 持續顯示正式 workflow 結果；不增加封存匯入／遠端套用功能，不改配對、LAN、Origin 或 command 白名單。

## 驗證與測試整理

使用者允許在全部退役，或已有充分證據證明不可接通後，移除退役期間專用契約與測試集。本次先驗證退役身分無法選 solver／保存為推薦、舊入口不再計算，以及封存不寫資料；收尾移除只為舊模型回放或退役期建立的套件。

[階段性斷路證據](model-retirement-proof.json)記錄刪除過渡測試前的10項通過結果、108組既有DangerSign數值及當時source hash。它不是最終head測試結果；後續整理與修正另由完整現行契約驗證。最終[視覺備查](../visual-review/issue-658/README.md)包含真Rust讀取、原JSON下載比對與50張實作圖片。

持續保留的是現行功能契約：四模型目標與版本一致性、原始證據驗證、CLI／MCP 正式入口、歷史封存唯讀／不可套用、原資料匯出及現行既有數值回歸。測試總數下降來自舊執行套件刪除，不靠更新歷史預期值或放寬容差。

原 21 tuning／10 EV fixtures 不改值或容差。21 tuning 的現行底盤數字繼續驗證，已退役齒比留為歷史資料；四個現行齒比模型有各自的已審查基準。DangerSign 以 #657 的編譯 library 產生 108 組靜態輸入／輸出，涵蓋驅動、檔數、RPM 與速度修正，確認必要實作抽離後數值不變；此檔不是新的模型或實車性能證據。

歷史演算法程式碼與已移除契約可查 [#657 固定提交](https://github.com/eddie772tw/FH6-HorizonTuner/tree/2c72bed878b84d40ba47ec5c41edaa16fa9157ce)，不在目前產品或測試樹保留第二個 solver。

最終測試結果、舊入口斷開證據、畫面來源與 CI 狀態在本 PR Body／視覺備查記錄；瀏覽器、程式測試與 CI 不代表遊戲 A/B、手機實機或讀屏驗收。

採用技能：`modular-refactoring`、`physics-tuning-math`、`huge-component-refactoring`、`halfmoon-design-system`、`agent-governance-audit`、`pr-author-maintainer`、`ponytail`。
