# AEGO 堆疊獨立審查

範圍為 #652～#657 與接續的 #659。依各 PR 驗收條件檢查最終整合結果；#659 的退役政策取代上游暫時保留歷史 solver 的政策。此審查不授權合併。

採三個未參與作者實作的審查上下文，分別檢查版本／證據契約、Rally／Drag、Drift／桌面與 Companion；父代理重現問題、負責所有寫入並驗證分支整合。只讀複核與執行測試分開記錄。

| PR | 驗收重點 | 獨立審查結果與處理 |
| --- | --- | --- |
| #652 | 模型 ID、goal／schema 邊界、歷史身分及原始 fixture | 未發現新增阻擋問題；原 21 tuning／10 EV fixture 完全不變。歷史 solver 的最終處理依 #659。 |
| #653 | 四模型隔離、Road 專屬後處理、共用工具中立性 | 未發現新增阻擋問題；未新增跨模型呼叫或在 dispatcher 套用 Road 修正。 |
| #654 | Rally 末檔目標、0.01 刻度與 observed 硬範圍 | 修正最近比值刻度超差但相鄰刻度可行時誤報無解；新增一般反例及浮點邊界反例。依原速度公式、原容差直接驗收，不修改原 fixture。 |
| #655 | Drift 明確主檔／RPM／輪速、有效 RPM 上限與 FWD 語意 | 未發現 Drift 新問題；接收 #654 修正以維持堆疊祖先。 |
| #656 | Drag 起步／末速共同約束、來源與不可行目標保持 | 未發現 Drag 新問題；接收 #654 修正以維持堆疊祖先。 |
| #657 | HTTP／CLI／MCP 同 owner、保存重播、ratio balance、前端 lifecycle | 修正帶入的 ICE 快取缺口：從原始 capture 重建，不把 cached engine／summary／tire summary 當證據；快取與冷載入均核對原始 envelope／ID。原始資料缺失或無效時拒絕，讀取不改資料庫。 |
| #659 | 退役入口無法執行、Developer Tuning 移除、歷史唯讀與匯出 | 修正重啟復原會 finalize 已退役 run／新增 summary；保留 active recovery。增加各 run 的既有 capture 匯出入口，實際從 session／telemetry 資料讀取。修正文首與歷史匯出敘述。 |

## 可重現缺口與回歸證據

修正前新增的三個 Rust 行為測試與一個前端行為測試均失敗；修正後通過：

- `aego_rally_candidate_contract::rounded_endpoint_search_keeps_a_feasible_adjacent_tick`：固定 FD 6.28、功率峰 RPM 2500、HP `(99.02/28)^3`，末檔 0.49 超出原速度公差，0.50 可行；另包含恰在浮點誤差邊界的 FD 3.50 案例。
- `workflow_calculation_contract::saved_ice_cache_requires_its_original_raw_capture`：只有 qualified cache、沒有原始 capture 時不可取得 measured 推薦。
- `recommendation_archive_contract::restart_preserves_archived_pending_runs_and_session_metadata`：重啟後原始 Road documents 與 session metadata 必須完全相同。
- `RecommendationArchive` 的 run 匯出案例：實際載入共用 save request，核對既有 capture URL 與下載 JSON。

另新增 ICE 衍生快取竄改、原始 envelope 無效／原始文件移除的重播與拒絕測試；封存 HTTP 測試以真正 session／telemetry points 驗證匯出仍可讀且不寫資料庫。未恢復已移除的歷史 solver 或退役期間專用測試集。

## 本輪本地驗證

| 分支 | 完整 locked Cargo | 完整前端 |
| --- | --- | --- |
| #654 | 282 passed／3 既有 ignored | 2028 passed |
| #655 | 290 passed／3 既有 ignored | 沿用相同 frontend／lang tree 的本輪2028通過結果 |
| #656 | 299 passed／3 既有 ignored | 同上 |
| #657 | 306 passed／3 既有 ignored | 2033 passed |
| #659 | 預設功能301 passed／3既有ignored；no-default-features291 passed／2既有ignored | 1649 passed；Windows／LAN build通過 |

全部含 doc-tests。#656／#657／#659 本機使用 `CARGO_PROFILE_TEST_DEBUG=0` 只省略除錯符號，測試、debug assertions、優化、容差不變；新 head CI 使用 repository 原設定。#652／#653 程式未改，重新核對原作者 gates 的產品 tree 與目前 head 相同，並核對精確 head 的15／9項CI通過；不冒稱本輪重跑這兩個初階head。

同步後逐檔核對各分支測試時的產品來源；#659另核對558個擷取來源hash與50張PNG hash。當前head／base／CI結果由PR Body與結案Review固定，不以原head綠燈替代。

## 證據界線

完整測試與各 PR 最新 head／base／CI 在 PR Body 與結案 review 記錄。[#659 視覺備查](../visual-review/issue-658/README.md)包含更新後的真實 Rust HTTP、瀏覽器下載、來源與圖片雜湊；#657 沿用的 UI 圖集須明確標示原擷取版本與未變的 UI 來源。

程式契約、合成 SQLite／遙測資料及 headless 瀏覽器不能證明遊戲 A/B、最佳性能、原生對話框、手機或 Narrator／NVDA 驗收。DangerSign 沒有新增第五項模型、ID 或入口；EV／CVT 與底盤版本保持獨立。

Reviewer / Maintainer: Codex as Codex
