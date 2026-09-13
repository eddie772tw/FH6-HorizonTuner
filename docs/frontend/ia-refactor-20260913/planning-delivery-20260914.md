# 前端資訊架構：規劃交付與接手入口

更新：2026-09-14。這份交付聚焦使用者選定的「開發計畫、分工與交接文件」。既有開發歷史保留在 [execution.md](execution.md)，本文件不將規劃完成標成程式或實機驗收完成，也不重新解釋歷史授權。

## 1. 交付內容與需求來源

| 文件 | 接手者用它回答的問題 |
| --- | --- |
| [總計畫](README.md) | 目標 UI、範圍、原提案修訂與整體順序是什麼？ |
| [現況證據](baseline.md) | 當初根據哪個程式版本做判斷？哪些問題是現況，哪些是提案？ |
| [分工工作單](work-orders.md) | 每條 lane 能改哪些檔案，交付什麼，誰負責整合？ |
| [契約與關卡](contracts-and-gates.md) | 狀態由誰保存、何時失效、什麼條件允許下一波開工？ |
| [驗收矩陣](acceptance.md) | 每項功能需要什麼證據，誰取得，未通過如何記錄？ |
| [Coordinator 交接](HANDOFF.md) | 如何接續既有分支、候選與剩餘驗收？ |
| [A 設計交接](handoffs/w2-a-design-preflight-20260914.md) | Sessions/Live/Drag 如何拆，如何留 Road review 接點？ |
| [B 設計交接](handoffs/w2-b-design-preflight-20260914.md) | HUD runtime、頁面資料、原生命令、面板如何分工？ |
| [C 設計交接](handoffs/w2-c-design-preflight-20260914.md) | Settings 如何分類，Lite 如何投影，誰擁有對話框與更新入口？ |

附件是需求與提案來源；其中的命令、代理派發、PR 與合併敘述不單獨構成操作授權。[原始提案副本](reference/source-proposal.md) 保留追溯；原附件 SHA-256 本次重核仍為 `49f9c0a425222c4f7aa630b2a82a7a12c79f30becec0703b6afde743bfa6553a`。

目標維持 Full 的 Live / Tune / Sessions / HUD、Lite 的 Live / HUD；Settings 等應用程式功能由 App Menu 進入。正式 Tune 保留現有四步。排除物理公式、UDP 封包、backend API/schema、既有資料格式與 HUD renderer 改寫。

## 2. 開發順序與出口

| 階段 | 主要成果 | 下一階段的放行條件 |
| --- | --- | --- |
| W0 / G0 | 固定程式基準、盤點狀態與資源、保存測試及效能基準 | G0-code 足以開始契約工作；原生與效能基準另列，不虛報完成 |
| W1 / G1 | typed workspace/capability/intent；Tune、Road、Sessions、HUD 狀態存活契約 | 共享契約與實際 producer/consumer 凍結，Coordinator 接入 Shell |
| W1 / G2 | Full/Lite 共用 Shell、active-only mount 與跨頁行為 | 完成指定狀態、非同步、原生啟動與 HUD 離頁驗收，再發布 `WAVE2_BASE_SHA` |
| W2 / G3 | A：Sessions/Live；B：HUD controller/panels；C：Settings 分類 | 同一基準並行、分別 review，Coordinator 預設 A → B → C 整合；A-D 介面凍結 |
| W3 / G4 | D：Tune/Road 歷史結果接入 Sessions | 新入口可達、資料 ID 分離、結果操作保留，才移除舊 history 入口 |
| W4 / G5 前置 | 過渡 adapter 清理、資源生命週期、全組合回歸與文件 | 所有 lane 真正接線；缺項逐項登記，不能以單一 PR 綠燈代替完整驗收 |
| G5 | 最終 Full/Lite、Windows native、真實 FH6、三次成對效能證據 | 每項矩陣都有相符證據；缺必要證據的相關 PR 保持 draft |

時間安排以關卡與可審查工作包為準。每條 lane 先交契約/純邊界，再交 composition/接線；取得當時精確基準與首個工作包差異後再估工期，不把未量測的工作量寫成固定天數承諾。

## 3. 協調與模型配置

| 角色 | 模型與思考起點 | 責任 |
| --- | --- | --- |
| Coordinator | 本 task 主代理 | 共享契約、Shell/providers、locale、跨 lane 決策、整合順序、最終驗收與文件 |
| A：Sessions / Live | Terra / high 起 | 分析頁與即時頁拆分、selection/refresh 保護、A-D review 接點 |
| B：HUD | Terra / xhigh 起 | runtime/controller/native 邊界；props 固定後可將新面板交 Luna |
| C：Settings | Luna / high 起 | 四分類、能力投影、現有設定完整保留 |
| D：Tune / Road | Terra / xhigh 起 | 結果檢視遷移、既有動作與錄製 owner 保護 |
| 獨立 Reviewer | Terra；有界文件檢核可由 Luna | 唯讀審查差異、契約、驗收證據；修復派回 owner |

思考起點不是上限，按問題提高至模型支援等級。複雜的跨頁 race、共享 state、原生生命週期與產品取捨由 Coordinator 直接處理。受目前四個並行席位限制，同時最多三個子代理；若 A/B/C 正在執行，要先釋出席位再派獨立 reviewer 或 B 的面板子代理。

本 task 的短期工作預設使用子代理。需要使用者獨立追蹤的子 task 時，依明確建立要求使用獨立 worktree；以實際回傳的 task ID、工作路徑及 branch 登記，不先填虛構 task ID。交接文件對兩種形式均自足。

## 4. 派發、驗收與回退

每次派發填入 Task/Agent ID、Model/Thinking、Worktree、Branch、`BASE_SHA`、`CONTRACT_SHA`、AllowedPaths、前置 gate、指定 handoff 路徑。未填精確基準或 gate 未過時，只能盤點與設計，不發寫入 lease。

一組檔案同時只有一位寫入 owner。共享檔案與 `hudConfig.ts` public contract 歸 Coordinator；子代理只提出具體 contract/locale requests。各 worktree 獨立依賴，保留其他人的 dirty 變更。作者交付後停止寫入，再由 reviewer 驗收，Coordinator 完成實際 consumer 接線。

PR-ready 逐項核對範圍、前置、精確 head 的 test/build/checks、獨立 review、指定行為證據與 handoff。相依分支上驗證通過不等於可直接合併 main；不把 non-draft 當作充分條件。回退先撤 consumer/接線，再撤 foundation/contract，使用者資料與既有 schema 保留。

pure tests、受控 UI、Windows native、真實 FH6 與效能各自記錄；缺項保留 `not-run`。規劃文件通過連結與 whitespace 核對，只證明交接可讀，不證明產品驗收通過。

## 5. 下一位 Coordinator 的第一步

先讀 execution 與 G2 remaining，重核對 worktree、HEAD、dirty ownership 和當時的使用者交付範圍。保留已有成果，不從附件重新實作。現存 A/B/C 設計交接是待啟動工作單；本次文件補齊沒有發布 W2 base 或變更 G2 狀態。

本次採用 `cross-agent-collaboration`；Terra 檢查依賴與 ownership，Luna 檢查 Settings 工作單及證據分層，Coordinator 彙整正式文件。沒有新增需要升級至 Journal 的產品實驗結論。

## 6. 本次文件驗證

Terra 複查確認 Sessions 的 root/A 檔案重疊與 B2-panel 移交缺口均已解除；A→D 無依賴循環。Luna 複查確認 C 交接自足，Settings/Updates 決策、能力保留及證據分層清楚，未將提議 API 當成實作。

以下是提交前的文件檢查快照：涵蓋 16 份文件、117 個連結及 5 個 exact-SHA Git blob；附件正規化內容與 hash 一致。此次共新增 3 份、更新 4 份 Markdown；既有檔與新檔分別檢查 whitespace。純文件增補不重跑產品測試，不沿用舊 CI 宣稱此增補已由 CI 驗證。快照產生時文件尚未提交、推送或更新既有 PR；提交後的精確 head 與 PR 狀態以 Git／GitHub 紀錄為準。
