# Agent 開發經驗日誌 (Journal) - FH6-HorizonTuner

## 2026-10-10 / source-map-js 間接依賴安全修補（Mihaly as Codex）

- **Scope**：採用 `github-security-audit`、`pr-author-maintainer`；針對 [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)，只將 css-tree 3.2.1 與 PostCSS 8.5.23 的 source-map-js edge 移至鎖檔既有 1.2.2，移除無引用的 1.2.1 區塊。父套件官方範圍皆為 `^1.2.1`，未改 importer、父版本、override、產品 API 或 audit policy。
- **Learning**：鎖檔同時存在修補版本仍可能經其他父節點到達舊版本；需以完整依賴圖與原始 audit 驗證。現行 CI 將 audit 非零結果轉成 warning，因此 job success 本身不代表 audit 無警告。
- **Evidence**：Node 24.13.0／pnpm 11.27.0 的 frozen install 與 `why` 通過，依賴圖只剩 source-map-js 1.2.2；直接 `audit --json` exit 0，advisories 為空、各嚴重度皆為 0。Vitest 1,774 passed／1 skipped、TypeScript／Vite Windows build、Cargo locked 204 passed／3 ignored、Rust fmt 與 diff check 通過；前端 build 先於 Cargo。
- **界線**：audit 僅為本次鎖定依賴圖的即時結果，沒有極大 offset DoS、完整安全稽核或實機驗收宣稱；未手動解除 alert。後續同步主線仍須 fresh exact-head CI 與合併後 dependency graph 確認。

## 2026-10-10 / PR #504 CVT 審查契約與 Companion 修補（Codex as Codex）

- **新審查重現**：新增四個 Rust fixtures，於修補前重現 canonical `is_electric` 漏判 EV+CVT、重複／衝突拼字仍可保存、等長窗先 dense 後 sparse 掉成 7 samples、fractional byte controls 被接受；兩個 mounted Companion tests 重現 Engine target 缺失與要求 CVT 執行已停用的 ICE measurement。
- **Rust owner**：qualification／save 改用既有 `TuningCarParams` serde 語意，兩種合法動力拼字共用結果，重複／衝突欄位明確拒絕。最長窗同時長時選較多 samples，保留排除幀邊界與 strictly-longer sparse policy；byte controls 只接受有限範圍內整數，不改原始單位或四捨五入。
- **Companion**：共用 `companion-engine` 外層 section，CVT／discrete 導航均實際 scroll 到目前 panel。Gearing 使用既有 CVT unavailable 訊息，即使收到 stale discrete gearing 也不顯示數值／要求 ICE measurement。未改 Step1 或語系檔，未混入其他 PR。
- **驗收界線**：新增測試全為 synthetic／DOM 契約，沒有新物理公式、真實 CVT capture 或 solver 完成宣稱。保存／workflow 的合法與拒絕結果由產品 HTTP 入口驗證；日期 Journal 條目全部保留。
- **最終 Gate**：Cargo default 196 passed／2 ignored、no-HUD 188 passed／2 ignored（含 doctest），CVT 專項 13 tests；Vitest 198 files／1,748 tests passed、1 skipped。TypeScript／Vite、Rust binaries build、Clippy all-targets（既存 warnings）、兩個 manifest fmt、Ruff check／format、版本／路徑大小寫與 diff check 通過。
- **整合紀錄**：重新讀取 Issue comment `6093430484` 與 review `5477593015`；cold-read thread 已由 Reviewer 解除，本輪不 resolve 他人 thread。review `5477570385` 對先前 #499／#504 heads 的 read-only merge-tree 報告六項內容衝突（Rust workflow、tuning README、TuneSessionProvider、TuningView 與兩個 EV／workflow transport tests）。待其中一支另經授權合併後，後者需保留 setup/evidence invalidation 與 CVT 排除兩組保護並跑 fresh CI；本輪僅記錄，未 merge／rebase 其他分支。

## 2026-10-10 / PR #504 saved CVT cold replay 唯讀修補（Codex as Codex）

- **審查與重現**：`SavedCvt` 未沿用 saved ICE／EV 的缺庫檢查，`Connection::open` 在 cold CLI／MCP 失敗查詢前會留下零位元組的 `telemetry_sessions.db`。新增兩個契約測試於修正前均失敗，精確重現資料夾由空變成新 DB。
- **最小修正**：先確認既有 DB，再以 SQLite read-only flags 查詢 `cvt-evidence/v1`，避免檢查後移除 DB 的情況建立新檔。原本 RoadStore 寫入路徑保留；僅共用既有文件查詢／kind 驗證。
- **測試邊界**：CLI／MCP 各驗證缺庫、零位元組、損壞內容、有效 SQLite 但沒有 road table 四種錯誤，執行前後完整檔案清單與每檔位元組相同。正常 HTTP／MCP／CLI 保存重播仍一致，且主 DB 位元組不變；SQLite read-only WAL reader 的輔助檔生命週期不等於寫入 evidence，不能對仍可改動的 live DB 使用 `immutable=1`。參考 [SQLite WAL 官方文件](https://www.sqlite.org/wal.html#read_only_databases)。
- **本地 Gate**：完整 Cargo default 192 passed／2 ignored、no-HUD 184 passed／2 ignored（含 doctest）；CVT 專項 9 tests。Vitest 197 files／1,746 tests passed、1 skipped；Rust binaries build、Clippy all-targets（既存 warnings）、兩個 manifest fmt、Ruff check／format、version consistency、tracked path case 與 diff check 通過。前端 source 無變動，沿用首版通過的 TypeScript／Vite build。
- **範圍**：同一 foundation 專用分支；未混入 #498／#499／#501，未增加 CVT solver 或變更 ICE／EV 演算法；所有既有 Journal 日期條目保留。

## 2026-10-10 / Issue #434 CVT 能力分流與 Rust evidence foundation（Codex as Codex）

- **來源／範圍**：`local`／`verified`；依審查留言 `6093430484` 從遠端 main `d4e0fe3762c613240f7d6902d07edcb212aa5926` 建立 `feat/issue-434-cvt-foundation`。採用 `physics-tuning-math`、`telemetry-udp-protocol`、`modular-refactoring`、`halfmoon-design-system`、`pr-author-maintainer`。不混入 PR #498／#499；Ruff 0.17 的主線 I001 僅修正 `scripts/validate_version_consistency.py` import 排序。
- **Learning**：動力類型 `isElectric` 與明確 `transmission`／能力各自保存；缺少新欄位維持 ICE／EV 序列化、依賴 key 與 capture replay。CVT 不從車名或一／兩檔推斷，也不進 ICE／EV collector 或離散齒比 solver。前端 A→B→A／延遲回覆與舊伺服器皆需 fail closed。
- **Evidence**：`cvt-capture/v1` 保存 raw JSON、來源與未知 null 時間／版本；`cvt-qualification/v1` 只做有界的資料安全檢查。保存 `cvt-evidence/v1` 後各入口重新驗證 raw，不信任舊 summary。新增 variant 後，CLI 的 saved-evidence 路由也必須新增 `SavedCvt`，否則 HTTP／MCP 可讀的 capture 在 CLI 會誤判 wrong mode；HTTP／MCP／離線 CLI 一致性測試已重現並修正。
- **驗證順序**：Rust `build.rs` 會產生 frontend dist 的 `include_bytes!` 路徑；前端重建與 Cargo doctest 不可並行，否則舊資產消失導致 doctest 編譯失敗。本次依序完成前端 build 後重跑完整 Cargo，包含 default／no-default-features 的 doctest 全數通過。
- **最終本地 Gate**：Cargo default 190 passed／2 ignored、無 HUD 182 passed／2 ignored；CVT 專項 7 cases（全部 synthetic）。Vitest 197 files／1,746 tests passed，另有 1 skipped；TypeScript／Vite、Rust binaries build、兩個 manifest 的 rustfmt、Ruff check／format、版本一致性、tracked path case、`git diff --check` 通過；維護工具 49 passed／4 skipped。Clippy all-targets 通過但仍有主線既存 warnings，本次 CVT 模組無新增 warning。
- **界線**：沒有真實 CVT capture、專用 live recorder、已校準 ratio preview 或 solver；所有 CVT gearing／recommendation 為 null，測試只能證明契約安全與舊 ICE／EV 不退化。固定／模擬檔位及 EV+CVT 保持 unsupported。真實 capture、限位來源、不可達目標與可套用 solver 的後續驗收見 [CVT foundation 文件](../docs/tuning/cvt-foundation.md)；Issue #434 保持 open，不 merge／release。

## 2026-10-07 / 遙測錄製管線解耦、計時賽修整邊界與 MoTeC 標記契約（Gemini as Antigravity）

- **Scope**：解決 PR #495 審查（Issue #484）由 Codex as Codex 提出的 13 項回歸問題。採用 `pr-author-maintainer`、`pr-review-evaluation`、`telemetry-udp-protocol`、`modular-refactoring`。
- **Learning**：
  1. **IsRaceOn 訊號不可靠性與錄製解耦**：遊戲遙測中的 `IsRaceOn` 旗標在自由漫遊及特殊賽事中經常不穩定。UDP 封包解析器與 `RaceRecorder` 絕不可將其視為封包有效性或起錄之 gate；計時賽與漫遊自訂路線起錄獨立於常規賽事開關。DragRecorder 透過追蹤起跑時的 `started_with_race_on` 狀態，使漫遊模式（`IsRaceOn == 0`）下的加速測試不再首幀誤判終止，同時完全保留常規賽事結束停止契約。
  2. **計時賽未閉合尾圈與通過時間契約**：計時賽停止時，最後一圈未通過起點閉合之殘留樣本必須自動排除於分析、最快圈速與預設匯出，維持零有效圈時不捏造圈速；圈速計算必須以相鄰起點通過事件之精確時間差為準，而非圈內樣本的 observed_span。
  3. **起點防抖與高速穿球檢測**：起點門檻採用磁滯半徑 (hysteresis) 與進入狀態追蹤，車輛停在門內時武裝起錄需等待離開後再次進入；後續高速閉圈採用線段相交球體演算法，確保兩端點皆在球外的高速幀能正確判定閉圈。
  4. **MoTeC .ld 與 .ldx 標記軸對齊與完整圈過濾**：LD 匯出以首個有效樣本重設為 0 秒起點，當遙測點經過修整時，.ldx 標記必須隨修整視窗之起始時間偏移並排除超出 log 長度之標記；且僅有 `complete == 1` 的有效圈才計入 Total Laps 與最快圈速。
  5. **自訂路線匯入原子性與格式驗證**：批次匯入自訂路線前先執行完整校驗（包含 schema 版本、UUID 格式與 roaming 終點座標），並以單一 SQLite 交易保存，避免部分成功造成資料庫髒讀。
- **Evidence**：
  - 新增 `pr495_review_regressions.rs`（16 個專項回歸測試）全部 passed。
  - 後端 `cargo test --locked --manifest-path backend-rust/Cargo.toml` 全部 passed。
  - 前端 Vitest `pnpm -C frontend run test` 196 檔案／1,730 測資全數 passed。
  - 前端 `pnpm -C frontend run build` 通過。
  - `cargo fmt --check`、`uv run ruff check .`、`git diff --check` 通過。

## 2026-10-07 / 多 PR 並行合併與 Jules 非同步協作護欄（Gemini as Antigravity）

- **Scope**：依序審核、修復並合入 PR #490、#488、#492 及 #491。採用 `pr-author-maintainer`、`pr-review-evaluation`、`cross-agent-collaboration`。
- **Learning**：
  1. **多 PR 文件追蹤衝突 (Journal Footprint Collisions)**：不同任務的 PR（如 PR #488 與 PR #492）若皆在 `.jules/bolt.md` 等歷史日誌檔尾部新增條目，會發生同位衝突。依事件日期排序（如 2026-10-04 先於 2026-10-06）循序合併與 rebase 能完整保留多 Agent 的經驗紀錄。
  2. **Jules 自動響應與本地 Worktree 漂移**：Jules 處於非 Reactive Mode 時，任何對 PR 的留言均可能觸發 Jules 重新建置並推動 commit。若 Jules 之雲端容器未即時 fetch 主線最新 merge commit，可能在舊 tree 上覆寫已合入之檔案。協作時若需手動介入修復 PR，應建立乾淨分支直接以 `origin/main` 為 base 挑出目標變更，並以 `--force-with-lease` 推送至目標分支，確認 HEAD SHA 與 diff 範圍完全吻合。
  3. **Rust 格式合約 (rustfmt in CI)**：PR #491 修正例外外洩時因長字串方法鏈超過寬度觸發 CI `cargo fmt --check` 失敗；提交前必須嚴格以 `cargo fmt --manifest-path backend-rust/Cargo.toml -- --check` 驗證。
- **Action & Result**：
  - 修復 PR #491 格式，通過全部 Rust 契約與單元測試。
  - 先後依依賴與無衝突原則依序 squash merge PR #490、PR #488。
  - 在 PR #492 中解決 `.jules/bolt.md` 衝突並跑通全部前端 Vitest，合入 PR #492。
  - 待 PR #491 CI 靜態檢查、Rust Backend Contracts、Vitest 通過後，順利合入 PR #491。
- **Evidence**：前端 195 測試檔／1,717 測資、Rust 後端 11 個契約測試套件全數 passed；`ruff check`、`ruff format --check`、`git diff --check` 通過；所有開源 PR 清空並收攏至 main 分支。

## 2026-10-06 / Live 增量分箱與保留資料的可見性繪製（Codex as Codex）

- **來源／狀態**：local／verified；使用者要求新 stacked PR 疊於 #489，只處理增量胎溫 histogram 與 off-viewport 卡片繪製。採用 halfmoon-design-system、huge-component-refactoring、modular-refactoring、cross-agent-collaboration、pr-author-maintainer；獨立審查採用 pr-review-evaluation。
- **Learning**：ring 寫入 O(1) 不代表 histogram 已增量化。每輪需獨立計數，扣除舊值後加入新值，bin 數改變才重建；最大分箱會因 eviction 降低，須重新掃描 bins。NaN 在加／減兩側都忽略，Infinity 保留既有端點 clamp。
- **Lifecycle**：卡片可見性只能 gate painting，不能 gate 取樣、峰值或 history。重入呼叫 retained-state renderer，不能假造新 telemetry event／時間。隱藏 resize 保留 CSS 尺寸，DPR／theme 可在重入重畫；IntersectionObserver 與 resolution callbacks 均須防止清理後的延遲回呼。將初次 DOM 寫入搬進 renderer 時，需保留尚無封包的 N／STEER 等初始讀值。
- **Evidence**：完整前端 195 files／1,716 tests passed，各 1 skipped；TypeScript／Vite build 與 whitespace 通過。12,000-step 分箱等值、TireRadar 1,000 次隱藏更新的完整 900 筆窗口／時間、suspension history／min-max、dynamics peaks／單位、StrictMode／DPR cleanup 等回歸通過。獨立 reviewer 最終 10 files／28 tests 與 TypeScript 通過，先前初始檔位問題已修復。
- **Boundary**：五卡 120-frame probe 為 600 ingestions／120 paint commits 的合成 contract；Node 演算法 microbenchmark 不含 Canvas／GPU／原生 host，不宣稱已解決 100ms p95。雲端 localhost browser 已受存取限制阻擋，沒有繞過；原生實測仍未完成。詳見 [Live 效能說明](../docs/frontend/live-performance.md)。

## 2026-10-06 / Swiss 遙測與跨頁 Core 圖表契約（Codex as Codex）

- **來源／狀態**：`local`／`verified`；使用者要求 Sol 研究並實作 Swiss 五卡差異化，再擴及 AEGO、賽事與其他圖表，併入 PR #489。使用 `ponytail`（full）、`halfmoon-design-system`、`huge-component-refactoring`、`modular-refactoring`、`pr-author-maintainer`、`pr-review-evaluation`；沿用隔離資料驗收與 `computer-use:computer-use`。
- **Learning**：只監聽明暗模式會漏掉同模式換 Core；Canvas 也不會因晚到的 webfont 自動刷新。共用快取需監聽 Core／系統／style 與 `document.fonts.loadingdone`，卸載時一起清理。高頻訂閱不應每幀呼叫 computed style。Bootstrap `text-body !important` 會覆蓋 inline 危險色，功能性警示必須避免該 class。
- **Action**：將 `canvasTheme` 移至共用 utils，Swiss 平面材質與穩定警示和 Rhine 線性幾何分開。AEGO、馬力、加速 SVG 與賽事 Canvas 共用字體／格線／曲線 token；只格式化 RPM 軸標籤，不更動齒比公式。圈速圖預留兩子圖間距，內層 flex 可縮小，保留外層 360px 高度。
- **Evidence**：前端 189 files／1,700 tests passed、各 1 skipped；TypeScript／Vite 通過。Swiss 三 Core 明暗截圖、Rhine／Swiss AEGO 三組相同數值與六条曲線路徑、賽事四組 Session 保留已保存。Sol 原 P2 色彩問題修正後獨立複核；三個 Canvas 掛載／字體更新／卸載的 listener 與 observer 無持續增加。完整數據與限制見 [驗收文件](../docs/frontend/rhine-lab-validation.md)。
- **Boundary**：合成 UDP／既有去識別引擎 fixture 不代表新真實遊戲量測；舊版 p95 與 WebView2 證據保留其原提交範圍。200% 已由使用者設定並實測，OS 動畫效果人工驗收依使用者要求取消。
- **追加理論優化**：本機有背景工作，使用者要求停止實際效能量測、留待稍後。保留 `6883dfa9` 的 raw runs（Live 中位 p95 基準66.9ms／Rhine100.0ms，沒有通過門檻）；不把先前約17ms的結果當新版證明。純文字讀值改為 `textContent` 相同時不覆寫，避免重複建立文字節點；不改取樣、插值、歷史、警示或圖表頻率。這是代碼層減少工作量，沒有宣稱實測 FPS 提升。原生新版 Rhine／Swiss 五卡及 Swiss 賽事畫面另外保存。
- **最終 Gate**：讀值去重後前端 189 files／1,701 tests passed、各 1 skipped；TypeScript／Vite 與 `git diff --check` 通過。Sol 核對所有 helper targets 均為葉節點，新增 DOM case 的 jsdom pragma 修正後 10 個聚焦案例通過，未發現剩餘可重現 P1／P2。

## 2026-10-06 / Rhine Lab 純 2D 設計系統與對話框生命週期（Codex as Codex）

- **來源／狀態**：`local`／`verified`；使用者核准第三設計系統計畫，實作期間再確認完整移除實驗 3D，保留全部 2D 設計。採用 `ponytail`（full，外部）、`halfmoon-design-system`、`modular-refactoring`、`huge-component-refactoring`、`agent-governance-audit`；Windows 互動驗收另使用 `computer-use:computer-use`。
- **Learning**：原生 `inert` 會在延後執行的焦點 effect 之前清除原觸發按鈕的焦點。AppDialog 必須在隔離背景前保存該元素，退出時保持隔離，卸載先還原 inert 再還原焦點；只依 transform 的 transitionend 無法涵蓋自訂 CSS／零動效，需依 computed transition duration／delay 提供完成一次的保護。
- **Action**：新增 `rhine`／`rhine-lab`、七 Core 明暗首幀契約、獨立預覽 class、六個主選單紙頁面板、刻度與短暫動畫。ArcSteerGauge 在主題變更時重繪快取數值，解決無新封包時沿用舊色問題，不增加每幀 CSS 查詢。素材使用既有 `/assets/` 路由，保留 MiSans 原始 400／600 分片、雜湊與分開的字體／工具授權；不修改來源專案。
- **Scope decision**：不透明工作面板遮住大部分 3D 效果，使用者判斷實用性不足後確認移除。刪除場景、依賴、模型、偏好讀寫、開關及文件，沒有只隱藏 UI。下一階段以閱讀編排區別 Swiss Editorial，以檔案／儀器工作台區別 Rhine；共用對話框及預覽品質改善回饋各系統。
- **Evidence**：最終前端 188 files／1,697 tests passed、各 1 skipped；TypeScript／Vite、frozen workspace install、素材雜湊、技能 validator 與 `git diff --check` 通過。Edge 七 Core 明暗矩陣、五種寬度的設定視窗與 Escape 焦點還原通過；Windows WebView2 154.0.4258.53 取得 1280×720 淺色儀表實際畫面。
- **Boundary**：使用者停止電腦操作後不再繼續 UI 驗收。完整 p95 基準比較、明暗錄影、200% 縮放、OS reduced motion、草稿／Session 狀態組合、release EXE、Android 及真實遊戲仍未驗收；詳見 [Rhine 驗收紀錄](../docs/frontend/rhine-lab-validation.md)。
- **PR 階段補驗**：後續繼續分階段 commit 與 PR 交付，新增 `pr-author-maintainer`、`pr-review-evaluation`；嘗試 `cross-agent-collaboration`／`codex-antigravity-bridge` 時發現 agy 未安裝，尚未取得外部審查。Git blob 雜湊複核找出文字檔自動換行問題，匯入器與 `.gitattributes` 固定 LF 後，382 項 index 雜湊全部符合。明暗實際設定畫面找出共用 CSS 後載入覆蓋 Rhine 單欄規則，已提高限定 selector 優先序並驗證。合成資料錄製 26 筆的已選 Session 跨三系統切換，ID／資料及底部閱讀位置保留。

- **使用者追加要求**：六個主選單 surface 統一桌面紙頁，共用 useDialogTransition 並維持常態掛載。五張遙測卡片的 Canvas 改用快取 CSS token、主題／resize 時重畫現有資料；補回 SuspensionBar 漏失 update 訂閱。新增生命週期、token 與懸吊讀值回歸；最終 188 files／1,697 tests passed、各 1 skipped。使用者指派 Sol 子代理完成五卡唯讀設計研究，本輪實作與下一階段建議分開記錄。
- **獨立核對修正**：Sol 重現停止封包後輪胎 renderCharts 關閉／開啟，effect local 樣本歸零但 DOM 讀值保留。最新原始樣本與時間須以 ref 保存；同樣修正 RPM／alert 與散點轉速上限，避免 settings converter identity 變更重啟 effect 時丟資料。新增單一資料保留／單位重繪回歸；前端 189 files／1,698 tests passed、各 1 skipped，TypeScript／Vite 通過。
- **後續驗收**：使用者保持 Edge 前景後完成同資料、同尺寸、每畫面三輪的 p95 比較；Live 三輪 p95 中位數無退化，最差輪約 +0.3%，26 筆 Session 無退化。保留一次 383.3ms 最大間隔，不將短時間合成負載推論為真實遊戲。Windows Computer Use 另補驗 WebView2 暗色 Canvas、外觀 Escape 及設定背景點擊，新增三張原生截圖；200% 縮放、OS reduced motion、錄影及其餘原生組合仍待驗收，以驗收文件為目前狀態。`7af98d56` 的 17 個 CI checks 全部成功，PR 仍維持 Draft。

## 2026-10-06 / HUD 樣式並行合併後單位型別契約修復（Gemini as Antigravity）

- **Scope**：主分支合併 PR #474、#473、#482、#483 及 #486 後的主線 CI 修復。採用 `modular-refactoring`、`pr-review-evaluation`。
- **Learning**：PR #483 擴充全域 `HudDisplayUnits` 加入大寫溫度型別 (`'C' | 'F'`)，而並行開發之 PR #482 `StackSt8100DisplayUnits` 則宣告小寫溫度單位 (`'c' | 'f'`) 並 `extends HudDisplayUnits`。單元測試 (`vitest run`) 在未全域執行 `tsc` 型別編譯時通過，但 CI 流程在 `Frontend Build Test & Audit` (`tsc && vite build`) 時遭遇 `TS2430` 型別不相容失敗。
- **Action**：將 `StackSt8100DisplayUnits` 改為 `extends Omit<HudDisplayUnits, 'temperature'>`，隔離單獨儀表小寫溫度單位與全域 HUD 單位型別，並於本地完整執行 `pnpm --prefix frontend run build` 與 `cargo test`。
- **Evidence**：`tsc && vite build` 順利產出 bundles（0 錯誤）；前端 185 測試檔案（1,677 測資）全數通過；Rust 契約測試全數通過；`git diff --check` 通過。

## 2026-10-05 / 懸吊歷史時間窗與靜止遙測一致性（Sol as Codex）

- **Scope**：以 `main`／`v1.7.1` 的 `59e9e83` 為基準；採用 `ponytail`、`halfmoon-design-system`、`huge-component-refactoring`、`pr-author-maintainer`。
- **Learning**：`telemetryEmitter` 由 `requestAnimationFrame` 驅動，不保證 60Hz。逐渲染幀覆寫 180 筆懸吊 ring buffer，卻使用固定 2500ms X 軸，會在 144Hz 只保留約 1243ms，曲線僅覆蓋右側一半。將新增歷史點限制為最多 60Hz，期間原地更新最新端點，能兼顧完整時間窗、即時讀數與固定記憶體。
- **Stationary assessment**：懸吊、輪胎與 G 力原本在靜止時仍繪圖，另以 O(N) 逐筆平移時間戳凍結歷史；這不是停止繪圖的性能保護。移除三處速度門檻及胎溫直方圖的靜止樣本過濾，改為持續 O(1) 寫入固定容量 ring，讓輪胎變化、懸吊波形與 G 力歷史正常更新／老化。既有圖表開關、HUD 暫停與比賽／車輛重置仍適用。
- **Evidence**：純歷史回歸 10 cases 涵蓋 30／60／120／144／165／240／360Hz、多次 wraparound、即時端點、恆定行程持續捲動與 reset。隔離瀏覽器回放實際三種 React 組件：144Hz 四輪曲線覆蓋率由 50% 恢復 100%，240Hz 由 30% 恢復 100%；靜止回放、停車後胎溫分佈／G 力標記、relative／absolute、亮暗主題及圖表開關皆檢查。最終前端 gate：`pnpm -C frontend run test` 156 files／1115 passed、1 skipped；`pnpm -C frontend run build` 與 `git diff --check` 通過。
- **Boundary**：瀏覽器使用合成資料及模擬時鐘，不是實際 FH6、Tauri WebView 或發行 EXE 驗收；O(1) 寫入是程式路徑分析，不代表已測得整頁 FPS 改善。

## 2026-10-05 / Swiss 開發文件與 PR 送審整理（Codex as Codex）

- **來源／狀態**：`local`／`verified`；使用者要求整理開發文件，將 PR #481 整理至 Ready to Review。
- **Learning**：規格第一節已登錄新設計系統，不代表下方元件表同步完成。原文件仍將互動位移／光暈、徽章外觀與分頁底線寫成所有核心的固定規則；frontend README 也仍指向已淘汰的 `src/utils/tuningMath.ts`。開發入口、實作責任與元件表必須共同核對。
- **Action**：新增 `docs/frontend/design-systems.md` 作為責任地圖、擴充與驗收入口；重寫 frontend README、串接中英文 README／文件索引、區分 2026-09-24 階段紀錄。規格升至 2.5.1，修正六核心、系統限定外觀、右側抽屜、焦點及 Halfmoon 即時卡片材質描述。Companion README 明示原生主題同步由 #485 追蹤。
- **Evidence**：本輪僅修改 Markdown；變更文件的本地連結、13 個 canonical skill ID、技能 validator、tracked path case 與 `git diff --check` 通過。依 AGENTS 的純文件驗證分流不重跑產品測試；前端 1,131 passed／1 skipped、Rust 122 passed／3 ignored 與瀏覽器證據仍明確歸屬產品提交 `dcd9be9f`，新 HEAD 的 CI 另在 PR 記錄。
- **Skills**：`ponytail`（full）、`halfmoon-design-system`、`pr-author-maintainer`、`agent-governance-audit`。保留既有未提交的 `frontend/src-tauri/Cargo.toml`，不納入文件提交。

## 2026-10-05 / Swiss Editorial 與 Contrast 核心主題（Codex as Codex）

- **來源／狀態**：`local`／`verified`；使用者核准規劃後，在 PR #481 新增 Swiss 的另外兩組 Core Theme。
- **Learning**：核心選擇卡若以巢狀 `data-bs-theme` 顯示獨立預覽，Halfmoon 會在該節點重新設定原生主色；必須共用 `themeColorProperties`，才能讓預覽與正式控制項使用相同三色。核心差異由各預覽節點的 token 決定，避免外層核心 selector 汙染其他預覽。反差標頭只改標題及底色，按鈕／徽章／提示保留獨立表面，焦點線改用標頭文字色。
- **Action**：catalog 登錄 `swiss-editorial`／`swiss-contrast`，保留 `swiss` ID 與 schema 2。Editorial 採暖紙色、2px 面板及閱讀標題；Contrast 採中性灰階、直角與反差標頭。共用 `workspace-panel-header` 套用即時、直線加速、調校、賽事摘要及設定；遙測標頭最小高度隨內距調整，使五張卡片對齊。外觀設定加入真實 CSS 元件預覽，更新三語文案、Cheatsheet 及規範。
- **Evidence**：前端 157 files passed／1 skipped、1,131 tests passed／1 skipped；TypeScript／Vite build、Rust 122 passed／3 ignored（含文件測試）及 `git diff --check` 通過，build 與 Cargo 不並行。新增案例涵蓋兩核心首幀／React 歸屬、UI 選取、配色保留、JSON 往返及預覽配色映射。
- **Browser**：六核心 × 日夜模式確認材質與原配色保留；Mono 日間黑／夜間白、Swiss Signal 與自訂配色正常。Editorial 重載保留。1440px 調校四步各 352px；Contrast 五張儀表標頭皆 45px。MoTeC 既有 fixture 經 UI 匯入後，四張摘要標頭等高且語意徽章可讀；320px 賽事捲到底、外觀與系統設定無水平溢出。反差標頭鍵盤焦點以深色線顯示在淺色標頭上。未啟動原生 HUD，Companion 原生同步仍由 #485 追蹤。
- **Skills**：`ponytail`（full）、`halfmoon-design-system`、`pr-author-maintainer`、`agent-governance-audit`。

## 2026-10-05 / Core Theme 的設計系統歸屬與外觀設定分組（Codex as Codex）

- **來源／狀態**：`local`／`verified`；PR #481 依使用者補充重新定義 Core Theme，同時管理配色、材質與元件細節。
- **Learning**：只分離配色 token，卻把 Swiss 徽章／分頁 selector 放在共用 CSS，仍會讓其他核心套上 Swiss 細節。使用 catalog 推導 `data-design-system`，以系統模組隔離元件 selector，首幀與 React 共用同一個 DOM 套用入口。保留 `halfmoonCore` 舊儲存欄位可避免無必要的 API／JSON 遷移。
- **Action**：Halfmoon／Swiss 模組分開；Canvas 光暈改讀快取 token，移除核心名稱判斷。外觀設定依系統分組、三個色票搭配可編輯 HEX、Color Presets 納入系統色彩調配；CSS 編輯器與 Cheatsheet 預設折疊，既有 CSS 保持套用。外觀抽屜寬度使用既有上限，避免短翻譯讓 fit-content 擠成不必要的直列。
- **Evidence**：新增 7 項整合案例涵蓋四核心首幀／React 對應、跨系統切換、舊 JSON 匯入、配色保留、UI 分組、預設折疊與 HEX 草稿。瀏覽器驗證 4 cores × 2 modes，Halfmoon 圓角／實色徽章與 Swiss 底線／細框徽章互相隔離；配色更新三欄且不換核心，重載保留設計系統；320px 無水平溢出，可捲至進階區塊並展開速查表。
- **邊界**：Companion Android 原生外殼與跨層設計同步依使用者決定留待 #485；本次瀏覽器及合成資料驗證不代表實車或 Android 驗收。
- **即時圖層修正**：使用者回報切回 Halfmoon 後，滑鼠移動會在儀表卡片角落出現毛玻璃覆蓋。DOM 確認五個 Canvas 卡片有 14px 背景模糊，開關提示另有第二層模糊；移除這兩處背景模糊，保留卡片底色、圓角與陰影，提示使用不透明模式底色。瀏覽器確認五卡與提示的 filter 均為 none；使用者再次實測回覆「目前沒有再出現」。此為實際改善證據，未宣稱已證明 Chromium 內部合成機制。
- **Halfmoon 舊版參照**：再依使用者要求對照 PR base `22f9660f`，僅還原按鈕與卡片材質。移除套到 Halfmoon 的統一按鈕圓角／secondary outline 覆寫，恢復原生 `.btn` 尺寸與 cyber hover；把整片卡片、額外投影／邊框及內層強制圓角限定於 Swiss。Halfmoon 一般即時卡片外層恢復透明排版容器，既有 glass/card 容器繼續使用原始材質。分頁、配色連動、對齊與捲動修正維持。
- **本地 Gate**：最終前端 157 files passed／1 skipped、1,125 tests passed／1 skipped；TypeScript／Vite build 與 `git diff --check` 通過。Rust 122 passed／3 ignored、文件測試通過；build 與 Cargo 未並行。瀏覽器複核 Swiss 2px 按鈕／1px 卡片與 Halfmoon 原生 4px 小按鈕／透明外層互不干擾。
- **Skills**：`ponytail`（full）、`halfmoon-design-system`、`modular-refactoring`、`huge-component-refactoring`、`pr-author-maintainer`、`pr-review-evaluation`、`agent-governance-audit`。

## 2026-10-05 / 賽事紀錄與跨頁排版巡檢（Codex as Codex）

- **來源／狀態**：`local`／`verified`；PR #481 使用者回報賽事頁尺寸、對齊與無法捲動。
- **Learning**：AppShell 的 `overflow-hidden` 需要各工作區提供有界捲動容器。只移除 AnalysisView 的固定高度，會使分析與 Road library 一同被外層裁切；應在 SessionsWorkspace 統一承接捲動。行內 tooltip 包裝也會產生文字基線空間，包住按鈕時使用 `inline-flex`。
- **Action**：賽事工具列分為狀態、選擇／分析與檔案操作；摘要卡片以 subgrid 對齊標題、徽章與數值區，圖表依寬度切換單／雙欄。補齊直線加速的共用按鈕與表面 token、修正 tooltip 包裝，手機設定抽屜使用全寬。
- **Evidence**：既有 MoTeC 測試 CSV 透過 UI 匯入；320px 賽事工作區可捲至 Road 區底部，桌面同樣能抵達頁尾，兩者無水平溢出。1440px 四張摘要卡片的標題、徽章與數值區起點各自一致。即時、直線加速、調校第 1–3 步、HUD 及六種應用程式面板完成排版巡檢；第 4 步保留量測門檻，未以假資料繞過。Vitest 1,118 passed／1 skipped、frontend build 與 `git diff --check` 通過。
- **Skills**：`ponytail`（full）、`halfmoon-design-system`、`huge-component-refactoring`、`pr-author-maintainer`、`pr-review-evaluation`。

## 2026-10-05 / 全站主題與分頁規則收攏（Codex as Codex）

- **來源／狀態**：`local`／`verified`；依 PR #481 使用者回饋補齊跨頁一致性，遠端 Checks 按新提交另核對。
- **Learning**：只更新 `--primary` 不會覆蓋 Halfmoon core 的原生 Primary/HSL、開關 SVG 與連結色，造成 Color Presets 部分失效。應由首幀與 React 共用 `themeColorProperties`，集中映射兩套變數。CSS 的核心差異也應透過 token 表達，不在每頁追加 Swiss selector。
- **Action**：`App.css` 分流至 `styles/{themes,base,components,navigation}.css`；共用按鈕、徽章、面板、表單與分頁。一般分頁無編號、依內容寬度且最大 14rem；調校保留步驟編號與等寬全列，手機兩欄。Companion 同步使用共用樣式；功能性警示色獨立於品牌配色。
- **Evidence**：4 cores × 日夜 × Swiss Signal／Bauhaus Mono 共 16 組瀏覽器檢查原生 Primary 與開關同步，另切換全部 10 組 preset。1440px 調校列寬 1408px、四步各 352px；390／320px 無頁面橫向溢出。方向鍵切換與 Portal Escape 焦點還原正常。瀏覽器使用隔離資料根目錄，未啟用原生 HUD 或真實遊戲量測。
- **本地 Gate**：Vitest 1,118 passed／1 skipped；frontend build 通過；Cargo 122 passed／3 ignored，文件測試通過。前端 build 與 Cargo 循序執行，避免嵌入 hashed assets 時互相覆寫。
- **Skills**：`ponytail`（full）、`halfmoon-design-system`、`huge-component-refactoring`、`modular-refactoring`、`pr-author-maintainer`、`pr-review-evaluation`、`agent-governance-audit`。

## 2026-10-05 / Swiss Technical 三階段實作（Codex as Codex）

- **來源／狀態**：`local`／`verified`；對應 #480、PR #481，遠端 CI 另按最終提交確認。
- **Learning**：首幀與 React 必須共用配色正規化；Bauhaus Mono 的黑白主色需隨模式轉換。Canvas 僅監聽 `data-bs-theme` 會漏掉單獨更換配色或核心；主題／style 變更時更新快取，避免每幀讀 CSS。
- **Action**：Swiss 實色表面、無模糊、1px 卡片邊框、8px 遙測節奏、16px 精靈網格、四步驟導覽；手機四輪單欄；沿用所有步驟門檻及 Portal。保留八組既有配色，新增 Swiss Signal／Bauhaus Mono，按鈕主色自動選取黑白文字。關閉 Swiss 的裝飾性 Canvas 光暈，保留物理警示色。
- **Evidence**：Vitest 1,114 passed／1 skipped；frontend build 通過；Windows Cargo 122 passed／3 ignored。實際 Rust 後端＋Vite／瀏覽器驗證四款核心的日夜模式、Mono 重載、1440／390／320px 版型與 Portal Escape 焦點。合成 UDP 回放 1111→8888 RPM 寬度皆 46.546875px，11→88 km/h 皆 42px，Canvas transition 為 0s；不代表真實遊戲或原生裝置驗收。
- **驗證順序**：Cargo 以 `include_bytes!` 嵌入 frontend/dist；不可同時執行會清換 hashed assets 的 Vite build 與 Cargo／doc-tests。此處先完成 frontend build，再跑 Cargo，已消除資源消失錯誤。
- **Skills**：`ponytail`（full）、`halfmoon-design-system`、`huge-component-refactoring`、`portable-release-validation`、`pr-author-maintainer`、`pr-review-evaluation`、`agent-governance-audit`。
## 2026-10-05 / ST8100 原始遙測與巢狀捲動截圖證據（Bagley as Codex）

- **來源／狀態**：固定 source `60dfae6` 的 sandboxed Chrome CI／verified；不是 Windows 原生或真實遊戲驗收。
- **Learning**：視覺插值可將原始7,000 RPM外插成7,250，故警示／峰值／圈事件必須使用唯讀原始sourceTelemetry與前進timestamp，不得以顯示幀當新封包。LastLap事件須記住已完成圈identity，避免相同圈時漏播或延遲更正重播。
- **截圖邊界**：Playwright元素截圖不能穿透祖先overflow:auto；即使水平fits=true，大型設定卡仍可能被巢狀scrollport裁切。先在原始viewport逐項捲動，檢查所有clipping ancestors、hit-test和focus，再於相同寬度且記錄高度的較高viewport保存完整圖；不可隱藏產品toolbar或改CSS製造通過。
- **Evidence**：[Visual run37291320148](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37291320148) 與 [style provenance](../docs/assets/stack-st8100/provenance.json)；完整設定9組，每組31內容目標／22控制項；390×844分段圖保留原viewport證據。
- **Skills**：`halfmoon-design-system`、`huge-component-refactoring`、`modular-refactoring`、`pr-author-maintainer`；相關用法詳見 [ST8100設計文件](../docs/hud/stack-st8100.md)。

## 2026-10-05 / v1.7.1 候選收尾與 Rust SSOT 邊界（Codex as Codex）

- **來源／狀態**：`local`／`verified`；另有固定 PR SHA 的 Windows Host Diagnostics 證據。
- **Learning**：Vite `generateBundle` 的 renderedLength 只能觀察 tree shaking 後結果，無法攔住已被消除的錯誤 dependency。guard 改在原始 TS transform／resolution 階段檢查，並以真實建置驗證未使用的直接匯入、re-export、dynamic import 與舊路徑。純型別抽離不改變 Rust 算法 owner；runtime defaults 不得混入型別檔。
- **Action**：43 個產品型別抽離、62 個凍結模型／測試移出 src；刪除未掛載組件與未使用 helper；Vite 8.3.2；移除 Halfmoon 未使用的 CSS 建置 CLI 及其弱點鏈。EV smoke 改接獨立 Rust HTTP，保留原始 Taycan 回放並驗證重啟持久化。SQLite 仍在資料根目錄，Diagnostics 依 v1.7 既有合約修正，不進行使用者資料遷移。
- **Evidence**：前端 1,105 passed／1 skipped；Windows／LAN build 通過；audit 0；Rust full 與 no-default-features 通過；Windows Host Diagnostics 7 passed；EV 真實 HTTP 回放、保存／重啟、六種主題與繁中／英文成功。最後候選 SHA 的 CI 與 artifact 另按 [驗收紀錄](../docs/releases/v1.7.1-acceptance.md) 核對，不能用這些歷史結果代替。
- **Skills**：`portable-release-validation`、`pr-author-maintainer`、`pr-review-evaluation`、`physics-tuning-math`、`modular-refactoring`、`agent-governance-audit`、`github-security-audit`、`ponytail`。

## 2026-10-05 / R34 原型比例與實際HUD畫面的分層驗證（Bagley as Codex）

- **來源／狀態**：原廠型錄／實物圖片比較，加上固定source `bed166f` 的sandboxed Chrome CI；不是原生Windows或FH6實機驗收。
- **Learning**：沒有文字裁切、模式能切換，不代表車輛原型外觀已成立。本次以高解析Nissan型錄、OEM儀表、完整右駕座艙與NISMO實物照，重驗銀色連續面板、儀表／MFD左右位置、低寬機殼和搖桿比例；不得拿320km/h改裝表或JGTC賽車推定原廠V·spec。透視照片只能支持HUD設計比例，不能宣稱工廠工程尺寸。
- **Action／Evidence**：先比較原創靜態SVG正視圖與照片，再以[Visual run37295509701](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37295509701)檢查真正五模式、透明背景、DPR／單位／缺值及控制顯隱；靜態樣稿不冒充runtime。隱藏速度時，獨立overscale註記也須一起隱藏，已加browser regression。
- **Boundary／Skills**：原型油壓／水溫仍N/A且無假針，只有遊戲真實欄位；`halfmoon-design-system`、`huge-component-refactoring`、`modular-refactoring`、`pr-author-maintainer`。詳見[R34設計文件](../docs/hud/r34-mfd.md)。

## 2026-10-05 / R34 分離錶盤與溫度單位契約（Bagley as Codex）

- **Learning**：app 的一般單位設定會依 speed 正規化整組公制／英制；browser fixture 若只把 temperature 改成 F、卻保留 kmh，會在 hydration 回到 C。測試應使用現有 `applyGeneralUnitSystem`，再等待真正的 effectiveUnits broadcast；HUD 獨立 C/F 設定則走既有持久化管線。
- **Action／Evidence**：使用者選定 S650 式分離定位及 Nür300 固定 kmh。HUDCore 校準保持不變，viewport root 取消整體 zoom，由純 layout 函式對獨立錶盤／MFD做寬高 fit；加入矮寬視窗、DPR、固定 kmh、四輪原始胎溫齊全與 C/F 幾何不變契約。修正檔位開關誤藏 REV 燈。
- **Boundary**：[Visual run37305964564](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37305964564) 真正 Chrome HUD／Launcher／GUI 全部成功；原型照片估角是 HUD 視覺適配，不是工廠校準。完整驗證及來源見 [R34設計文件](../docs/hud/r34-mfd.md)，不代表 Windows／遊戲實測。

## 2026-10-05 / R34 雙 LCD 與壓縮刻度的字形邊界（Bagley as Codex）

- **Learning**：SVG小字在靜態圖可辨識，不代表Chrome的字型邊界不相交。壓縮RPM低段須在固定刻度幾何之外調整數字尺寸，browser檢查亦須計入變換後的stroke；雙行LCD要保留實際字型metric間隙，不能只比較font-size與baseline距離。
- **Action／Evidence**：保留0／10、3／9對稱與等距低段；加入偏心軸共用幾何、類比kmh／數位單位分離、雙LCD包含／相鄰文字檢查，失敗時先保存bounds與截圖。CurrentLap初始0不可當有效計時，只有已觀察rollover可取得固定3秒零值期限；重複封包不延長。
- **Boundary**：[Visual run37325254056](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37325254056)通過真正HUD／Launcher／設定驗證；無計時的功率／扭力保持獨立缺值，BestLap／LastLap的0仍不可用。來源及限制見[R34設計文件](../docs/hud/r34-mfd.md)，不是原生Windows或遊戲實測。

## 歷史摘要 / v1.6 以前開發經驗與跨架構演進核心紀錄（Pre-v1.6 Architecture Archive & Core Learnings）

- **來源／狀態**：`archive`／`verified`；本條目為 v1.6 以前（2026-08-11 ~ 2026-09-15）跨版本開發經驗、歷史踩坑與架構演進之單一收攏精簡摘要（SSOT 封存）。
- **Learning**：
  1. **UDP 高頻遙測與 60Hz 效能護欄 (Hot Path Invariants)**：
     - Forza 遙測封包為 324-byte 二進位結構（位移與封包長度必須嚴格吻合協議）。
     - 60Hz+ 接收循環絕不可引入同步磁碟 I/O、阻塞式資料庫操作或重量級網路請求；日誌僅限 Ring Buffer、批次佇列或非同步落地。
     - Canvas 渲染路徑採用離屏 Double Buffering、直接像素座標變形與常數記憶體複用，嚴禁在每幀迴圈中分配垃圾或進行過深物件拷貝。
     - WASAPI 音訊捕捉與即時資料流必須獨立執行緒解耦，避免阻塞遙測事件分發。
  2. **車輛物理調校與 AEGO 齒比演算法 (Physics & Gearing SSOT)**：
     - 懸吊、彈簧、防傾桿 (ARB) 與阻尼比 (Critical Damping) 計算必須保持純函式與數學無狀態性，禁止在 UI 層硬編碼物理常數。
     - AEGO (Adaptive Engine-Gearing Optimizer) 齒比演算法歷經 Road、Circuit、Rally、Drag 等情境分流求解器演進；必須分層處理遊戲原生單位（ft-lb, rad/s, N/m）、領域物理單位與多語系顯示單位。
     - 扭力/轉速曲線平滑與斷油點判定採用特徵閉環自動識別，嚴禁仰賴未校準之常數推導有效紅線。
  3. **Halfmoon CSS 設計系統、UI/UX 與無障礙架構 (UI & A11y Standards)**：
     - 前端採用 Halfmoon CSS v2 雙層主題架構，禁止任意引入第三方重型 UI 框架或內嵌非規範樣式。
     - 嚴格落實防破圖閃爍 (Anti-FOUC) 與 DOM 快取隔離；全域彈窗必須受 `ModalPortal` 容器約束，下拉式 Popover 統一向下展開以避免位移擠壓。
     - 嚴格遵守無障礙規格 (ARIA standards)，互動元件必須具備完整鍵盤導航支援與可訪問性屬性；UI 字串與代碼中全面禁用裝飾性 Emoji。
  4. **路徑安全、儲存防護與端點隔離 (Security & Isolation Boundary)**：
     - 檔案與 Preset 存取強制採用 `safe_path`（路徑白名單與符號連結解析後的邊界判定），防範目錄穿越 (Path Traversal)。
     - 遙測 UDP 連接埠 (8000) 與 HTTP API 連接埠 (8001/動態 Release Port) 嚴格隔離，本機唯讀 MCP Server 僅限本機 loopback 調用，嚴禁對外暴露敏感系統端點。
  5. **跨語言雙端對齊、工具鏈標準與測試金字塔 (Tooling & Testing Strategy)**：
     - 產品核心後端全面向 Rust 遷移收攏；選用 Python 僅維護輔助診斷、維護工具與發行輔助腳本（統一使用 `uv` 管理）。
     - 嚴禁撰寫以正則/字串比對 YAML/JSON 設定檔之脆弱測試；嚴格禁止在 UI/Canvas 測試中斷言底層 API 呼叫次數或硬編碼像素座標。
     - 測試金字塔落實分流：Vitest 單元與合約測試、Cargo 後端整合測試、跨端 Golden Fixture 契約比對 (`tuning_golden_fixtures.json`)。
  6. **多代理人協作與架構治理協議 (Governance & Agent Collaboration)**：
     - 建立 Google Antigravity、Codex 與 Jules 之非同步協作分工機制；Jules 原始英文日誌留存於 `.jules/*.md`，經本機驗證之知識與規範始同步收攏至 `.agents/`。
     - 廢除通讀全量檔案之反模式，全面落實按需載入 (On-Demand Loading) 與技能探索閘門機制。
- **Action**：
  1. 封存 2026-08-11 至 2026-09-15 期間之歷史日誌、重複條目與過渡期規範，全面濃縮為本條六大領域架構不變量。
  2. 既有專案規則與不可違反之紅線已全面收攏至 `.agents/AGENTS.md` 與 `.agents/rules/`。
- **Evidence**：歷史 PR（#185 至 #351 等百餘項 PR）與多版本（v1.0 ~ v1.6）發行演進驗收數據；後續所有功能開發與重構均以本摘要及模組化規則為契約基準。
- **Skills**：`telemetry-udp-protocol`, `physics-tuning-math`, `halfmoon-design-system`, `modular-refactoring`, `testing-strategy`, `agent-governance-audit`。

## 2026-10-07 / 重啟賽事分析：MoTeC、計時賽與漫遊路線錄製落地 (#484)（Gemini as Antigravity）

- **來源／狀態**：`local`／`verified`；完成 Issue #484 賽事分析重啟，建立 PR #495。
- **Learning**：
  1. **無鎖 60Hz 接收與 3D 球體檢測門契約**：在 UDP 接收主線路保持零阻塞 I/O，以 $O(1)$ 歐幾里得距離運算搭配 20% 遲滯門檻保護，杜絕邊界抖動造成的重複觸發；在自由漫遊模式下允許 `IsRaceOn == 0` 持續計時與取樣。
  2. **非破壞性修剪 (Non-Destructive Trimming) 與資料主權**：SQLite 資料庫維持原始所有通道取樣點，僅於 session metadata 紀錄 `trim_analysis`（包含起步前與停車後的修剪秒數及有效邊界）；前端與匯出介面提供即時切換與「匯出時改用未修剪原始資料」選項，兼顧分析乾淨度與原始遙測完整性。
  3. **MoTeC CSV 純前端記憶體工作流與動態圈速推導**：使用者匯入本機 MoTeC CSV 時嚴格維持記憶體狀態（`selection.kind = 'local'`），不寫入後端 SQLite，透過純前端純函式 `calculateLapsFromPoints` 動態由點位推導圈數清單，無縫支援多圈切換與圈速對比。
  4. **巨型元件模組化拆分 (< 250 行)**：依據 `huge-component-refactoring` 守則，將擴增後的賽事分析 UI 拆解為 `ManualRecordingToolbar`、`TimeTrialRoutePanel`、`RoamingRoutePanel`、`SessionTrimSummaryCard`、`MotecFieldMappingModal`、`useAnalysisSessionData` 與 `useCustomRoutes`，使核心 `AnalysisView.tsx` 嚴格控制於 213 行。
- **Action**：
  1. 擴充 Rust 後端 `custom_routes` 表、CRUD API、計時賽/漫遊路線武裝與二進位回放測試。
  2. 修正 README.md 與 README.en.md 中關於 MoTeC `.ld` 的陳述為標準 41 頻道 CSV 與 i2 工作區範本。
  3. 建立 PR #495（`feat/issue-484-race-analysis`）。
- **Evidence**：後端 `cargo test` 全數通過（含 25 項 `telemetry_contract` 測試）；前端 196 個測試檔、1728 個測試通過；`pnpm build` 與 `git diff --check` 通過。
- **Skills**：`telemetry-udp-protocol`, `huge-component-refactoring`, `modular-refactoring`, `halfmoon-design-system`, `testing-strategy`, `pr-author-maintainer`。

## 2026-10-05 / v1.7.1 Release Chore 發行整備與 Rust Tuning SSOT 落地（Gemini as Antigravity）

- **來源／狀態**：`local`／`verified`；完成 v1.7.1 版本發行前置整備（Chore），雙端版本契約統一遞增至 `11.45.21`。
- **Learning**：
  1. **Tuning 核心架構單一真理 (SSOT) 正式落地**：PR #460 完成後端調校公式與責任契約全面收攏至 Rust (`backend-rust/src/tuning/`)，取代歷史雙端 SSOT，由 Rust 作為物理計算、資格審查與數值診斷之唯一擁有者，前端 TypeScript 舊模型凍結並拒絕 runtime 引用。
  2. **高頻遙測與渲染極致熱路徑優化**：整合 PR #461（Tape Compass 樣式快取）、PR #463（`.slice(0, 4).every()` 展開）與 PR #465（`readFour` 迴圈展開），消除 60Hz 渲染與遙測解碼中的高頻閉包分配與樣式計算瓶頸。
  3. **Release 版本單一真理契約與支援矩陣維護**：依據 `scripts/validate_version_consistency.py` 規範，Runtime version 以 `frontend/src-tauri/tauri.conf.json` 為 SSOT，並同步更新 `backend-rust/Cargo.toml`、`backend-rust/Cargo.lock`、`frontend/src-tauri/Cargo.toml`、`frontend/src-tauri/Cargo.lock` 至 `11.45.21`。同步更新 `SECURITY.md` 支援版本矩陣（`1.7.x` 支援、`1.6.x` 維護、`< 1.6` 停止支援）。
- **Action**：
  1. 同步遞增 `backend-rust/Cargo.toml`、`frontend/src-tauri/Cargo.toml`、`frontend/src-tauri/tauri.conf.json` 至 `11.45.21`，並刷新對應 `Cargo.lock`。
  2. 建立 `docs/releases/v1.7.1.md` 發行說明文件，涵蓋 PR #460、#457、#461、#463、#465、#464、Tauri 2.12 對齊與 Dependabot 安全升級。
  3. 更新 `SECURITY.md` 中英文支援版本矩陣至 `1.7.x`。
  4. 更新 `README.md`、`README.en.md` 與 `docs/contracts/tuning_responsibilities.md` 中的 v1.7.1 狀態。
  5. 依使用者指示做好所有 Release chore 準備工作，不執行 git commit 與 git push main。
- **Evidence**：`python scripts/validate_version_consistency.py` 驗證 `11.45.21` 通過；前端測試通過；後端測試通過；`git diff --check` 通過。
- **Skills**：`portable-release-validation`。

## 2026-10-03 / Tauri 相依 PR 的跨端版本合約（Sol as Codex）

- **依賴合約**：`tauri-plugin-process 2.4.0` 與 `tauri-plugin-updater 2.13.0` 的 Rust manifest 都要求 `tauri 2.12`；不能只補 JavaScript lockfile 就假定插件 PR 可獨立打包。先將 Rust Tauri 2.12.0 與 JavaScript API 2.12.1 對齊、保留兩端舊插件，再於後續 PR 同步更新兩端插件及 Cargo／pnpm lockfile。
- **本地證據**：原生 Tauri 5 個測試及前端 1099 個測試通過；這些證據不等於遊戲或 OTA 更新驗收。
- **採用技能**：`pr-author-maintainer`、`pr-review-evaluation`、`portable-release-validation`、`agent-governance-audit`、`halfmoon-design-system` 與 `ponytail`。

## 2026-10-01 / v1.7.1 Rust 調校唯一 owner（Bagley as Dot）

- 使用者授權取代 #430 Twin SSOT；專用分支與 draft PR #460，未合併／發行。#458、#459 未合併；loaded-sweep/v4 以 main 的完整 capture summaries 鎖定。
- Rust 擁有機械／定位、ICE/EV 量測、readiness、能力過濾、推薦、輪胎證據、profile 預設、實驗模型與 dyno 數值 guidance。桌面／Companion 使用同一 provider result；offline CLI／MCP 新 workflow 入口直接重用 library。
- CLI、MCP quick 與 desktop experimental 為三個明確 legacy model，保留既有 wire output；新推薦明確 Rust version，歷史持久化不變。
- 發現並補上 toFixed binary rounding 與 width*(aspect/100) 運算順序邊界；不可重寫既有 21 tuning／10 EV golden，也不可缺檔自動生成。
- 新增 React hook 真實非同步順序／失敗重試測試；build boundary 拒絕 TS legacy solver 進入產品。capture replay 在 receiver mutex 外；LAN allowlist 不變。
- 驗證結果見 PR 精確 commit；Windows 平台驗證交由 CI，未聲稱 Linux 已跑 Windows 原生 UI 或遊戲實測。


### 2026-10-01 / PR #460 獨立審查後的來源邊界修補

- 審查指出「把公式搬到 Rust」不等於「客戶端 supplied peaks 是後端合格證據」。撤回完成宣稱；workflow 改用 Rust 重播不可變 capture 後的 opaque qualification，裸 ICE peaks／EV moments 不得建立 measured recommendation。
- 保存時載入 backend-only、明確版本的 evidence metadata，重組推薦並比較；ICE 必須匹配保存觀測與 engine dependency，EV 同時保存原始 frames 及資格紀錄。重播只在接收器鎖外，離線 CLI 仍共用 library。
- EV preview 503 會顯示 error 並自動重試；Step 2／4 不再把 pending/error 顯示成缺少車輛或引擎輸入。新增實際 React 元件重試／訊息回歸及真實 capture persistence/restart/篡改負例。
- MCP／離線 CLI 保持唯讀：cold-cache 只重播、不新增 qualification；已保存資格可重用。新增 cache 不變回歸，完整 Rust 預設／no-default-features suites 通過。
- EV 真實桌面投影漏掉 SteerInput，完整 capture fixture 曾掩蓋 transport 缺欄；補上通道並以實際 React session 投影對照 frozen transport contract，Rust API 重播同一投影驗證資格／保存與缺 steering 拒絕。

### 2026-10-01 / #462 Road 模型修正（Bagley as Dot）

- 使用 physics-tuning-math、modular-refactoring、pr-author-maintainer；使用者授權納入PR460。逐commit固定輸入重播定位972e9c2首次引入高扭力退化；397/412、EV445、446後續limiter修補不是固定輸入公式變更來源。
- v3以兩個既有先驗的較短齒比作工程啟發式；明確不把traction上限說成物理下限，不宣稱最佳起步。保留低功率、v4量測、共同網格與無解；新增後端運動學診斷。
- Road正式推薦升v2；歷史v1依凍結gearing v2驗證。舊goldens不改，新基線分檔；歷史與新模型都須經相同資格及保存檢查。
- 實車資料仍未補齊；因果、矩陣、候選輸出及界限見docs/tuning/aego-road-launch-v3.md。沒有合併／發行或關閉462。
- 獨立審查重現歷史v1驗證曾照抄caller的v3標籤／roadLaunch；改為檢查版本專屬保留metadata，保留真正無標籤的v1相容，並拒絕非Road偽造診斷。

### 2026-10-01 / Road v3 理論覆核與有效上限診斷（Codex as Codex）

- 採用 `ponytail` full、`physics-tuning-math`、`pr-review-evaluation`、`pr-author-maintainer`；依使用者要求委派 `gpt-6-luna` 只讀研究 Rspeed。完整推導與研究路線見 [Road v3 文件](../docs/tuning/aego-road-launch-v3.md)。
- `Rfirst=max(Rspeed,A/T)` 等價於功率峰值一檔速度 `min(Vbaseline,KT/A)`，可限制高扭力長一檔退化並保留低扭力縮短。Rload仍是特定抓地先驗上限，max並非無滑移保證；#462合成例要求輪上力約3.86g，同一μ=1先驗下可傳遞扭力約峰值25.9%。固定速度、動力帶及最適換檔尚未校準。
- 正式workflow的診斷曾把名義engineMaxRpm當有效上限；原Beetle capture辨識5248但診斷輸出5999.9966，新qualification/workflow回歸先失敗。最小修正讀取proof已覆蓋的engineCalculation.effectiveRedline，缺省回退名義值；不重寫引擎身份、起步／頂檔目標或歷史v1。
- 兩組Beetle／Pajero limiter capture的正式診斷回歸通過，並檢查偽造snapshot不能決定有效上限。完整Rust locked suite為119 passed／3 ignored（兩個選用效能probe及一個需要真實Windows音訊／GSMTC的測試）；前端154 files／1099 tests passed，1既有skipped；Cargo fmt及git diff --check通過。獨立Node核對14個新基線的目標／取整誤差與扭力分段性質通過。
- Luna建議先做固定環境、同車齒比掃描與重複0–100 A/B，再補T(n)、起步控制、抓地／滑移及阻力資料建模。現有moving loaded sweep不能唯一辨認launch target，故不換另一組未校準Rspeed常數。未做新遊戲試車；#462保持開放。

### 2026-10-02 / #462 Pagani 靜態回報與端點界限（Bagley as Dot）

- 採用 `physics-tuning-math`、`pr-author-maintainer`；保留另一工作樹的6e49801有效上限修正，main仍為ca195c7。沒有平行修正或合併其他PR。
- 已補車型、完整七速與靜態規格，沒有Step 3動態資料。新增獨立report fixture、唯讀release TS重播及兩個Rust回歸；歷史1400kg合成案例不改標為Pagani，原始21/10 goldens不變。
- 正式Step 1換算得到1104.0451416kg／1117.197245Nm、名義後輪半徑.3457m。v1.7任意AWD分配的Rload≤3.72377003，而回報FD3.78／G1=1.00要求≥3.7611，不能僅靠RPM補值解釋。原始保存值／輸入入口／人工調整尚未證實；不杜撰量測覆蓋。
- 顯式8000/6000/9000RPM比較情境可得到舊版同七比值但FD3.74；v3為FD3.88、一檔3.51。另驗證缺失RPM預設與歷史合成RPM情境。新資料未確認額外公式缺陷，故不改v3常數。
- Linux Rust locked完整121 passed／2 ignored；no-default-features完整113 passed／2 ignored；前端154 files、1099 passed／1 skipped，TypeScript/Vite build、Cargo fmt、git diff --check、歷史TS唯讀重播通過。未執行新遊戲／Windows GUI驗收。
- 更新#462矛盾敘述與模型文件；PR #460維持使用者授權Ready、Issue開放，未合併／發行。README原draft敘述同步修正。

## 2026-10-01 — v1.7.1 後端 SSOT 第一階段（Bagley as Dot）

- 採用 skills：physics-tuning-math、modular-refactoring、huge-component-refactoring、halfmoon-design-system、pr-author-maintainer；測試規範來源為 rules/testing-strategy.md（無 testing/SKILL.md）。
- main ca195c7 的 Rust range normalization 曾把正值小於 1 的 minima 拉高；遷移以桌面行為為準，新增 66 組凍結 mechanical fixtures，原 21 tuning / 10 EV fixtures 不改寫。
- `/api/tuning/mechanical` 為無狀態計算入口，不使用 engine mutex。provider 使用完整草稿 key，桌面與 Companion 共用結果。engineDependencyKey 只適用量測，不足以識別底盤草稿。
- 驗證：Rust locked 全套通過；前端 150 files / 1092 tests 通過；tsc + Vite build 與 diff check 通過。Linux 原生 Windows HUD 未驗收。
- 全量 SSOT 尚未完成：量測資格、齒比、readiness、建議組合與診斷繼續遷移；PR 保持 draft。

## 2026-09-30 / v1.6.2 Release Chore 發行整備、依賴雙端對齊與多 PR 依序整合（Gemini as Antigravity）

- **來源／狀態**：`local`／`verified`；審查並依序合併 PR #451、#453、#447，關閉重複之 #452，完成 v1.6.2 版本前置整備與雙端版本契約遞增（`11.45.20`）。
- **Learning**：
  1. **Dependabot 雙端跨語言生態路徑脫鉤陷阱**：在多語言與 Desktop 架構中，若 `.github/dependabot.yml` 將 cargo 指向 `/frontend/src-tauri` 但 npm 設為根目錄 `/`（而非 `/frontend`），Dependabot 升級 Rust Crate（如 `tauri-plugin-updater` 2.12.0）時無法同步升級前端 `@tauri-apps/plugin-updater`，導致 Tauri 打包檢查拋出 fatal version mismatch。在 PR 中同步升級前端 NPM package 並刷新 `pnpm-lock.yaml` 可解除 blocker，未來應將 npm 配置路徑修正為 `"/frontend"`。
  2. **多 Agent / Jules 紀錄衝突排解**：當多個 Jules 或 Agent 同時向 `.jules/bolt.md` 末尾追加經驗紀錄時容易引發 Git 內容衝突。Rebase 循序保留各方條目可乾淨恢復 MERGEABLE 狀態且不破壞歷史脈絡。
  3. **Release 版本單一真理 (SSOT) 驗證契約**：依據 `scripts/validate_version_consistency.py` 規範，Runtime version 以 `frontend/src-tauri/tauri.conf.json` 為 SSOT，並嚴格要求 `backend-rust/Cargo.toml`、`backend-rust/Cargo.lock`、`frontend/src-tauri/Cargo.toml`、`frontend/src-tauri/Cargo.lock` 保持 100% 一致。
- **Action**：
  1. 依序合併 PR #451 (`perf: Optimize sessionDebriefMath processing loops`)、PR #453 (`perf: optimize resolveColor in telemetry chart primitives`)、PR #447 (`deps(rust)(deps): bump the rust-dependencies group in /frontend/src-tauri with 2 updates`)。
  2. 關閉已由 PR #450 覆蓋之重複 PR #452。
  3. 同步遞增 `backend-rust/Cargo.toml`、`frontend/src-tauri/Cargo.toml`、`frontend/src-tauri/tauri.conf.json` 至 `11.45.20`，並刷新對應 `Cargo.lock`。
  4. 建立 `docs/releases/v1.6.2.md` 發行說明文件。
- **Evidence**：`python scripts/validate_version_consistency.py` 驗證 `11.45.20` 通過；前端 149 檔案 1089 tests 通過；Vite build 成功；Rust sidecar & tauri check 通過；`git diff --check` 通過。
- **Skills**：`portable-release-validation`、`pr-review-evaluation`、`pr-author-maintainer`。

## 2026-09-28 / AEGO 六項實車驗收完成與 PR 文件同步（Codex as Codex）

- **最新驗收狀態**：使用者明確確認 PR #446「In-Game Confirmation & Remaining Evidence」六項均已完成，包含基準／候選各至少三次可比試車、0–30／0–60 與換檔記錄，以及 v4 補丁後的獨立新實車量測。此狀態取代下方 2026-09-27 歷史紀錄中的待完成項目。
- **證據歸屬**：六項完成依使用者確認；已保存 capture 與重播仍分開標記。不虛構本輪未附的各次秒數、候選完整齒比、新 observation ID 或性能提升比例；不把定量驗收改成由 fixture 代替。
- **同步範圍**：更新中英文 README、調校索引、[修正／驗收紀錄](../docs/tuning/aego-low-power-20260927.md) 與 PR 內文，回覆 Reviewer 的驗收缺口及後續整合順序。產品程式、fixtures、原始量測與遊戲設定不變；文件檢查採 `git diff --check`。
- **Draft 與整合**：程式碼 head `0fc20cf` 的 14 checks 成功、當前無合併衝突。可建議解除 Draft 進入正式審查，但本輪僅評估、未切換；#445 若先合併，須另行 rebase 並核對新 head 的完整驗證。驗收完成不等於全車款校準，也不授權自動合併／發布。
- **採用技能**：pr-author-maintainer、pr-review-evaluation；維持作者／審查者身分區分、Living Changelog 與精確 head 驗證。輪詢保持暫停。

## 2026-09-27 / EV 獨立量測與齒比基礎模型

- **分流契約**：EV 開關可持久化，與傳統檔位數互斥；同樣四個步驟，使用獨立的 `ev-measurement/v1`、`ev-capture/v1` 與 TS/Rust EV solver。ICE archive、peak-RPM AEGO、Companion 傳統量測命令不能接收 EV 流程。車輛／模式／量測配置改變會失效結果；驗證快照拒絕兩種模型混用。
- **實測學習**：Taycan 的持續正功率平台不等於限轉；需分開保存正輸出曲線、高轉速零輸出與低打滑的 RPM／車速映射。A/B/A 二檔 2.00→2.20→2.00 的錄製回放可重現約 +10% 並回復的映射變化；不據此宣稱辨識單顆馬達、抓地力或最佳換檔點。
- **單速與能力邊界**：單一前進檔可完成 EV 流程；檔位數與可調能力互不推導。終傳與各檔預設鎖定，未顯示的比值保存 null，仍可量測基準。只有已知、確認可調的終傳可預覽變更；鎖定或未知數值不進入待套用設定，不沿用傳統 gearbox 的 Full 預設。
- **驗證與來源**：前端 145 files／1,030 tests 與 build 通過；Rust 完整 gate 87 passed／3 ignored、Cargo fmt 通過。TS/Rust 共用十個 EV golden cases，含單速、全鎖定、未知齒比、僅終傳可調。選用瀏覽器測試 mock 全部 backend HTTP/WS，驗證跨步驟、模式失效、保存再載入、六種主題組合與繁中標籤；不注入遊戲 UDP。實際單速 EV、新 UI 遊戲操作與最佳化效果尚未實機驗收。採用技能、交接與工程一手來源見 [EV 模型文件](../docs/calibration/ev-foundation.md)。

## 2026-09-27 / Pajero 首筆切斷掉轉與功率峰值近限轉（Codex as Codex）

- **重現**：ordinal 2652／PI600 的 v3 匯出已有 30.297 秒有效資料與 13 箱，仍卡高轉。7998 RPM 正輸出後首筆負輸出已掉至 7917 RPM，低於 99% 進入門檻約 7919 RPM；取樣影格不是斷油觸發瞬間。保存前 20 秒、1,197 筆必要通道 fixture，原始完整檔不動。
- **修補**：v4 以緊鄰前一筆合格正輸出證明接近上緣，再確認有界掉轉及多影格恢復；負輸出／中斷清除該參考，不能沿用歷史最高點。保留 4% 範圍、三循環、6 秒及控制 gate，Pajero 在 17.828 秒重播就緒，Beetle 仍為 19.281 秒。
- **峰值與上限分離**：切斷／恢復循環不能依賴「功率峰值＋5%」；功率平台或上升曲線可一直延伸到斷油。新增近限轉峰值／平台／持續上升正例，沒有切斷與過期上緣負例；不外推不可達的功率、不等同最佳換檔點。軟限轉及其他輸出切斷辨識仍有工程先驗限制。
- **提示與技能**：高轉不足提示要求已反覆斷油者匯出資料，而非無限延長試車。採用 physics-tuning-math、ponytail、halfmoon-design-system、pr-author-maintainer；沿用同一分析 reducer、Halfmoon 狀態元件與 Draft PR，不加依賴。詳見 [修正紀錄](../docs/tuning/aego-low-power-20260927.md)。
- **建置順序**：Rust 的 build.rs 會將 frontend/dist 的雜湊資源路徑寫入 include_bytes!；不能與會清空 dist 的前端 build 並行。此次並行先出現資源路徑不存在，待前端完成後以同一隔離 target-dir 重跑，86 passed／3 existing opt-in ignored；不需停止 dev 服務。

## 2026-09-27 / AEGO 斷油循環與齒比顯示補強（Codex as Codex）

- **可重現盲點**：VW Beetle 已在約 5250 RPM 斷油，但功率切斷伴隨掉轉超過 50 RPM，v2 的窄平台計時反覆歸零。完整 9,070-frame capture 到 152.172 秒才就緒；不可把包含中斷的總時長寫成連續全油門。
- **最小修正**：v3 以同檔、有載、切斷／恢復各多影格的三次有界循環取代正功率平台推論。保留 5 km/h、500 ms、6 秒有效正輸出及低轉覆蓋，不將負輸出放入峰值或有效時長；控制／換檔／斷流中斷會重設待確認循環。相同完整 capture 重播於 19.281 秒就緒。
- **版本與證據**：第一份歷史 capture 在 v3 可辨識真實斷油而就緒，第二份仍不足 6 秒；這修正了下方初版 v2「兩份均需補測」的結論。v2 摘要不能直接升版，必須重播原 capture；Road 公式版本仍為 v2。加入去位置等無關通道的前 20 秒真實 fixture 及負例。
- **顯示**：左齒比窗格依檔數展開，右圖依最新要求維持 16:9，窄視窗改上下排列；Halfmoon 六種主題與 4／6／10 檔 smoke check 通過。使用既有語意色與網格，不加依賴。
- **驗收邊界**：使用者確認公式修正已讓本車產出實際可用設定；未據此虛構三次定量試車、候選套用值或跨車款校準。詳見 [修正紀錄](../docs/tuning/aego-low-power-20260927.md)。輪詢暫停，Draft 不自動解除。
- **採用技能**：physics-tuning-math、halfmoon-design-system、ponytail、pr-author-maintainer。Rust 測試採單工作與獨立 target-dir，避開 Windows 記憶體不足與正在執行的 sidecar 檔案鎖，不停止使用者遊戲或服務。

## 2026-09-27 / AEGO 起步瞬態與低功率 Road 齒比（Codex as Codex）

- **可重現盲點**：低於 1 km/h 且 ClutchInput=0 的瞬態仍會污染功率峰值。兩份本車 capture 的固定分箱峰值約 3984 RPM，不能把約 3365 RPM 的瞬時峰值當成換檔硬上限，也不能歸因為 NA 標籤。
- **相容性**：保留原始觀測，分析另帶版本與 observation ID。重播使用同一採樣 reducer，缺少 capture 或未通過 6 秒／覆蓋 gate 就阻擋新推薦；初版 v2 兩份舊 capture 均未就緒，後續 v3 斷油循環調查及更正見上方紀錄，不為了得到結果放寬門檻。
- **幾何限制**：共同分配起步與頂檔總減速比，整數百分位網格保留端點與全檔間距；無解是模型衝突，不是汽車無法行駛。重複夾至 0.40 不是合法修復。
- **證據邊界**：真實 fixture、TS/Rust golden、全量本地測試與隔離 Halfmoon 元件檢查不等於實車起步可用；Race 六速初始設定不能誤寫成原廠四速。詳見 [修正紀錄](../docs/tuning/aego-low-power-20260927.md)。
- **採用技能**：physics-tuning-math、ponytail、modular-refactoring、halfmoon-design-system、pr-author-maintainer。保留既有依賴與其他賽事公式，沒有完整曲線最佳化器。

## 2026-09-26 / Rust 原生媒體補強與 Python 後端接替（Codex as Codex）

- **證據**：基準 Rust 並未缺少 WASAPI／GSMTC；使用者啟動 Spotify 後能讀到原生頻譜與專輯資訊。但把選定裝置設為已移除 ID 可重現持續 unavailable，Python 參考會退回預設裝置。Rust 已補 fallback 與預設裝置／重新連接偵測。
- **並行邊界**：媒體 snapshot 不得同步等待原生查詢，否則共用 overlay worker 的音訊廣播會被拖慢。single flight、timeout、退避及 stale grace 可同時保護 HTTP 延遲、執行緒數與錯誤可見性；新 WS client 需收到 config／audio／media 初始快取。
- **相容性**：真實車庫使用 display_name，REST Preset 使用 car-name.json；MCP 必須依實際資料欄位與檔名讀取，且不可跨車輛 fallback。CLI 舊 `tuning-dev/v1` 與正式調校核心數值不同，移植使用 28 組 Python oracle 保留輸出，沒有重算 golden。
- **MCP 檔案邊界**：遞迴掃描需使用不跟隨連結的 entry file type，跳過 symlink／Windows junction；否則唯讀工具仍可能讀到目錄外資料或循環掃描。已用暫存目錄及真實 junction 驗證，不刪除外部 sentinel。
- **移除邊界**：Python HTTP／MCP／CLI／PyInstaller 已移除；車庫與開發資料路徑沿用。維護及發行工具仍可使用 uv，requirements 不再安裝 Python 原生音訊／HTTP runtime。第二個 Cargo binary 加入後須指定 default-run，否則舊 cargo run 入口失效。
- **驗證**：75 個繼承 HTTP method/path、26 個 MCP tools、Rust 全／無 HUD 契約、Spotify metadata／封面／真實 WASAPI 與失效裝置恢復；前端只有測試及 build，未啟動。完整命令、結果與限制見 [接替紀錄](../docs/backend-rust/parity-hardening.md)。
- **release 實機補驗**：Spotify 暫停時可能仍提供完整 GSMTC metadata／封面，但沒有可驗收的 WASAPI 串流；這不等於 WinRT 失效。取得使用者播放控制授權後，以 GSMTC 恢復播放並指定 release sidecar 重跑 opt-in：1 passed，連續 32 頻帶、124,176 bytes 封面、快取狀態及失效裝置 fallback 均通過；隨後恢復 paused 並重新查證。沿用 `portable-release-validation`，未啟動應用程式前端。
- **環境**：Windows 高平行 Rust 連結曾遇到 os 1455，使用 `-j 2` 完成；不修改 paging-file。API／CLI／裝置證據不等於 HUD 畫面、實際遊戲、Discord 或 Android 驗收。

## 2026-09-26 / Rust 效能承接、文件治理與 Wiki 對齊（Codex as Codex）

- **採用技能與 ownership**：`modular-refactoring`、`agent-governance-audit`、`cross-agent-collaboration`、`pr-author-maintainer`、`ponytail`。依使用者授權由 Luna 子代理盤點歷史 PR、處理 Road/SQLite 局部優化與文件；主線整合 writer、profile I/O、快取、測試與發布。
- **可重現缺口**：UDP socket 與 processing worker 分離不代表磁碟 I/O 已隔離。原 Rust 在持有 engine lock 時同步寫 SQLite/profile，慢磁碟仍可延遲 live frame。新增有界 FIFO writer、預留 finalizer、飽和丟樣指標、stop/shutdown drain；profile 首讀與合併寫入另由 worker 執行。外部鎖住 SQLite 時仍發布 120 個 frame，stop 後資料全數可讀；Road 身分切換亦不等待磁碟。
- **交易與生命週期**：SQLite batch prepare-once 需同時保留 rollback；lap rows、metadata、session totals 必須同交易，否則可留下 finalized metadata 卻沒有 lap rows。明確 clear 也須完成已接受 session 的 finalizer，避免反覆 start/clear 耗盡保留空間。
- **量測教訓**：減少迴圈內 Vec 不足以推定 matching 較快；初次 probe 反而變慢。索引深複製完整 JSON 才是明顯配置來源，改為借用 point，並以完整 JSON 等值與交錯舊／新量測核對。原始資料、歷史 PR 對照及限制見 [效能承接盤查](../docs/backend-rust/performance-inheritance.md)。
- **文件邊界**：Skills/README 以 Cargo 作產品後端 gate，Python 限維護／發行工具與 frozen fixtures；不重寫歷史日誌。Wiki 7 頁已推送至獨立 repo `master` 的 `2b6937c`，明確區分 v1.6.1 Rust/MCP Beta、後續 #426 平台工作及未發布的 #443。
- **驗證與限制**：Rust default 80 passed、no-HUD 72 passed；Road 9 項在最後借用修改後再通過。原生宿主與性能 probe 為 opt-in；原 Spotify 實機驗收見接替紀錄，本輪未重新控制播放器。未啟動前端、遊戲或其他裝置，不從契約測試推定高負載尾延遲或所有原生驅動皆已驗收。

## 2026-09-26 / Python Release 與 Rust 性能對照（Codex as Codex）

- **來源與方法**：v1.6 tag `cd96d86` 是引入 Rust 前公開 Release。驗證 asset SHA-256 後，從 Full portable 的 include_bytes payload 抽出原始 PyInstaller sidecar，未啟動前端；與 `caf518a` Rust release 交錯七輪，各用新資料目錄及隔離 UDP port。Road 另以 release-tag 原始 Python 模組與 Rust library、相同 fixture 做 21 次函式計時及完整輸出比對。
- **結果與邊界**：啟動 1,757.33→89.25 ms，Working Set 83.33→29.49 MiB；settings/language/MCP initialize 中位數減少 71.9%/87.4%/75.4%，Road summary/matching 減少 87.8%/94.0%。UDP→JSON WS 中位數反而 0.398→1.268 ms，七輪皆 130 processed／0 dropped，不能宣稱所有路徑加速。Private Bytes 不等於駐留實體 RAM；啟動未清 OS cache；MCP initialize 不能代表全部工具。方法、raw samples、hash 與重現命令見 [Release 性能對照](../docs/backend-rust/release-performance-comparison.md)。
- **CI 時序修正**：`caf518a` Windows portable job 在 Road start 時收到 stale telemetry 409；測試原先在送 frame 後做 SQLite 前置作業，可能超過 2 秒窗口。兩個 lifecycle 測試改為每次 start 前送新遞增 frame，產品 freshness 條件不變。
- **驗證**：完整 Cargo gate 80 passed／3 ignored；opt-in release comparison 七輪皆成功、完整輸出在 abs/rel 1e-6 容差內一致；維護工具 53 passed；Cargo fmt、兩個新 benchmark 工具 Ruff、diff check。無前端／遊戲／HUD 畫面驗收。
- **60 Hz 後續調查**：改用獨立固定 deadline sender，recorder 關閉／開啟各 30 秒，前後及 Python 控制組共八個 streams 皆 1,800/1,800 接收，Rust queue peak=1/end=0，writer 無丟樣或失敗。找到 App::process 每幀 clone 651 輛車的 Drag database；移至 App::new 一次設定後，Rust 中位數 1.309/1.294→0.231/0.230 ms，p95 2.031/2.007→0.276/0.271 ms。新增經 App prepare/process/analysis/clear 的兩車非 fallback 名稱回歸。最終 default 81 passed/3 ignored、no-HUD 73 passed/2 ignored、release bins build 成功。修正前此負載已無塞車，修正後降低固定處理成本；單 consumer/localhost 不代表遊戲滿載驗收。

## 2026-09-26 / Rust API 全量物件成本與資料庫讀取盤查（Codex as Codex）

- **可重現成本**：`json!(owned_value)` 經借用 Serialize 重建 Value，不會自動 move；analysis/MCP 已擁有的 Vec/JSON result 應直接移入 `Value::Array`／response。Drag status 原先為 len 複製整段 session；save 的 snapshot 仍需 ownership，但磁碟 I/O 不需持有 engine lock。
- **SQL 範圍與排序**：Road 清單原先在 Rust parse 完 capture 才移除，恢復舊 Python 的 SQLite JSON projection。MCP 改為讀取時先按 ordinal stride 決定是否 decode、owned map retain；snapshot 只取最後一點。原 full-session 查詢以 session/distance index 加暫存 B-tree 排序；新增 `(session_id,id)` index 保留順序並避免搬動大量 raw JSON。
- **比較陷阱**：v1.6 HTTP analysis 與 MCP 使用不同 DB 路徑，必須用相同 fixture 同時填入 root 和 sessions/，不能把空結果當成速度優勢。Storage overview 的生成檔案本來就跨版本不同，從等價與百分比比較排除。Windows `uv` 工具只做客戶端與 fixture，產品仍不依賴 Python。
- **盤查範圍**：兩個明確指定 Luna 的子代理分別實作／覆核 MCP-SQLite 與 Road projection；主線處理整合、API ownership、測試和同機 release 測量。未量測的 Discord/profile/dyno/settings/thumbnail/audio 等成本仍列候選，不將靜態 clone 清單說成 profiler 結果。詳見[盤查](../docs/backend-rust/performance-audit.md)。
- **採用技能**：`modular-refactoring`、`cross-agent-collaboration`、`pr-author-maintainer`、`ponytail`。保留 API shape、raw/legacy units、window/stride、路徑安全與交易回滾；損壞 DB 未抽中列不再 decode 的邊界另有測試與文件，不隱藏語義範圍。
- **正式 API 測量**：實際官方 Python v1.6、Rust `3cf6bb0` 與修正後 release 各三輪，每 workload 90 樣本；九個 process 的 23 個可比較回應一致，storage 因版本生成檔案不同排除。Rust 本輪 MCP sparse／snapshot、Road list、Drag status 中位數耗時減少 84.8%／97.4%／73.4%／86.7%；HTTP 10k points 減少 42.8%，Debrief／MoTeC 減少 17.0%／15.0%。Road list、laps、MCP sessions／summary 仍慢於 Python，全部樣本與限制見[正式報告](../docs/backend-rust/api-workload-performance.md)。
- **錄製與驗證**：新增索引後另跑 Python／Rust 各 30 秒固定 60 Hz；Rust 1,800/1,800 收齊，p50/p95 0.229/0.269 ms，telemetry 與 writer queue peak=1/end=0，6 batches、0 dropped／failed，未見積壓。完整 Cargo default 84 passed/3 ignored、no-HUD 76 passed/2 ignored、維護工具 53 passed；Ruff 全域 check/format、Cargo fmt、release bins build 通過。未啟動前端，未量 cold cache、100k points、多 client 或遊戲滿載。

## 2026-09-26 / Tape Compass HUD 解析度與比例修復

- **分支與技能**：`codex/fix-tape-compass-resolution` 從 `origin/main` 的 `ec7d769` 建立。採用 `ponytail`、`halfmoon-design-system`、`huge-component-refactoring`。
- **可重現根因**：#421 固定使用 `800×52` bitmap，CSS 卻以 `50vw×52px` 顯示；2560×1440 瀏覽器實測顯示為 `1280×52`，橫縱比例分別為 0.625／1，且未處理 DPR。改以 CSS 尺寸作為繪圖座標、按 DPR 配置 bitmap，尺寸不變時不重設 bitmap；隱藏時不採用舊 bitmap 尺寸，避免反覆倍增。
- **可讀性與真實 DOM**：固定讀數與捲動方位標籤分行，保留 50vw 寬度並將高度調為 76px。瀏覽器另重現上下切換時 `parentElement` 為唯讀所造成的 TypeError；移除手動賦值，交由 DOM 掛載方法維護父節點，並使既有 mock 的 `parentElement` 同樣唯讀。
- **驗證**：修改前 141 files／996 tests 通過；修改後 `pnpm -C frontend run test` 為 142 files／1004 tests 通過，`pnpm -C frontend run build` 與 `git diff --check` 通過。新增 HUD-owned 測試驗證尺寸／DPR 幾何比例、視窗縮放、DPR 改變及隱藏後恢復，不斷言繪圖 API 次數或刻度像素座標。
- **瀏覽器證據與邊界**：以實際 renderer、template、manager 與字型製成獨立靜態頁面，透過限 loopback、僅提供兩個預覽路徑的 HTTP server 驗證；未啟動前端、後端或桌面控制。720p／1080p／1440p／3440 超寬／4K 及 DPR 1／1.25／1.5／2 通過；4K、DPR 2 的羅盤為 CSS `1920×76`、bitmap `3840×152`。上下切換、隱藏後縮放恢復、重建與亮暗背景均通過；不代表 Tauri WebView、實體螢幕或真實 FH6 遊戲驗收。

## 2026-09-25 / PR #426 移除 macOS 與同步 main

- **範圍**：依使用者要求，平台發行保留 Windows Full／Lite 與 Linux x86_64 Full，移除 macOS workflow、Tauri config、打包／smoke 分支及 OTA channel。上述 macOS 紀錄保留為歷史，不代表目前支援。採用 `pr-review-evaluation`、`pr-author-maintainer`、`portable-release-validation`、`halfmoon-design-system` 與 `ponytail`。
- **整合**：先審查並合併 #436、#439、#440，#441 因輪胎輸入驗證回歸而關閉，再將 main `a0b323d` 整合至 #426。工具列同時保留 Post-Race Analysis、disabled export tooltip 與 `localMotecLaunch`；三份語系保留最新翻譯與 LAN 字串，移除本分支重複加入的兩個 key。
- **可重現測試落差**：`scripts/tests/test_build_entry.py` 仍模擬舊 uv／Python 打包，但 `build_all.bat` 已使用 PowerShell／Rust；在乾淨 fixture 中缺少 `scripts/build_backend.ps1`。改為受控 Rust 建置腳本，驗證成功、backend 失敗、frontend 失敗與跨目錄路徑，沒有改動產品打包入口。
- **驗證順序**：backend build.rs 會將 `frontend/dist` 資產以 include_bytes 嵌入；前端重建會刪除舊 hash 檔案，因此 frontend build 與 Cargo 編譯不能同時改讀同一輸出。先完成並固定 frontend dist，再執行 default／no-default-features 與 Tauri 驗證。
- **本地證據**：前端 141 files／996 tests、Windows／LAN build；Python 與工具腳本 425 passed／8 deselected，Ruff check／format、Rust format 與版本一致性通過。新增 OTA carry 測試確認歷史 macOS channel 被忽略且 Linux channel 保留；這些測試不代表真實 FH6 跨機或 OTA 安裝驗收。

## 2026-09-23 / v1.6.1 Release Chore 發行整備、雙端版本遞增與高壓測試逾時防禦（Antigravity as Antigravity）

- **來源／狀態**：`local`／`verified`；完成 v1.6.1 發行整備與多組件版本同步（`11.45.19`），更新發行日誌草稿，並排查修復高併發測試逾時問題。
- **Learning**：
  1. **高併發 Vitest 下的大型壓力測試逾時防禦**：在 138 檔案並行執行下，包含 39,000 次轉換與 312,000 項斷言的極限壓力測試（`useTelemetry.stress.test.ts`）因 CPU 爭搶而偶發超過預設 5000ms 限制。為大型計算壓力測試指定顯式 timeout（`20000ms`）可徹底防止在 CI 或本機負載時 flakiness。
  2. **多端協同版本真理同步邊界**：本專案涵蓋 Rust Backend (`backend-rust/Cargo.toml`)、Tauri Host (`frontend/src-tauri/Cargo.toml`, `tauri.conf.json`)、Python 工具與 CLI (`backend/main.py`, `backend/agent_cli.py`, `backend/version_info.txt`)。版本遞增至 `11.45.19`（發行 Tag `v1.6.1`）需同步對齊全部入口與診斷 bundle 斷言，確保執行時回報與建置資訊完全一致。
- **Action**：
  1. 建立 `docs/releases/v1.6.1.md`。
  2. 同步遞增 `backend-rust/Cargo.toml`、`frontend/src-tauri/Cargo.toml`、`tauri.conf.json`、`backend/main.py`、`backend/agent_cli.py`、`backend/version_info.txt` 至 `11.45.19` / `11.45.19.0`。
  3. 更新 `tests/test_diagnostic_support_bundle.py` 與 `docs/guides/agent-cli-guide.md`。
  4. 更新 `README.md` 與 `README.en.md` 之 Android Companion Beta 標註與發行說明。
  5. 為 `useTelemetry.stress.test.ts` 壓力測試補齊 20000ms timeout 避免 worker 爭搶逾時。
- **Evidence**：後端 Rust 55 tests 通過；Python 377 passed, 8 deselected 全部通過；前端 138 檔案 982 tests 全部通過；Vite build 通過；`ruff check .` 與 `git diff --check` 通過。
- **Skills**：`portable-release-validation`、`pr-author-maintainer`。

## 2026-09-23 / Android Google Play 上架整備、RFC 1918 私有 IP 白名單與 Release AAB 構建合約（Antigravity as Antigravity）

- **來源／狀態**：`local`／`verified`；落實 Issue #433 與 PR #425 Google Play 商店正式上架規範，完成網路安全加固、權限最小化、模式分流與 Release AAB 打包。
- **Learning**：
  1. **Android Network Security Config 與 IP 白名單之雙層明文防禦**：Android 的 `network-security-config.xml` 中 `<domain>` 標籤不支援通配 IP 或 CIDR 遮罩（如 `192.168.*.*`）。若要滿足本地區域網路 (LAN) 通訊同時禁止公網明文 HTTP，最佳架構實踐為：在 `network_security_config.xml` 中移除全域 `usesCleartextTraffic="true"` 並嚴格規範信任錨點；並在應用層（`MainActivity.kt` 的 `buildOrigin` 與 `buildCompanionUrl`）實施 RFC 1918 私有 IP（`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`）與 Loopback/Link-Local 強制白名單校驗，嚴禁向公網發送明文 HTTP 請求。
  2. **Release AAB 簽名降級與 ProGuard WebView 保護**：在無正式上傳金鑰環境（CI/本地自動化測試）中執行 `:app:bundleRelease` 時，透過 Gradle `signingConfigs` 友善降級 fallback 至 Debug 簽名，可確保 AAB 產物構建可重現；同時必須在 `proguard-rules.pro` 中加入 `-keepattributes JavascriptInterface` 與 `@android.webkit.JavascriptInterface` 保留規則，防止 R8 混淆破壞 WebView 與 Native Compose 之間的通訊 Bridge。
  3. **正式版與開發版模式分流之使用者體驗護欄**：Google Play 面向的一般玩家不應被複雜的 USB/ADB 連線選項困擾。透過 `BuildConfig.DEBUG` 判定，正式發行版預設僅呈現直覺的相機 QR 掃碼配對，將 USB/ADB 入口收折於進階選項（標示為開發者選項）；開發版維持快速切換，兼顧生產純粹度與本機偵錯效率。
- **Action**：
  1. 建立 `companion/app/src/main/res/xml/network_security_config.xml` 與 `companion/app/proguard-rules.pro`。
  2. 修改 `AndroidManifest.xml`、`build.gradle.kts`、`MainActivity.kt`、`CompanionShell.kt`、`LanQrScanner.kt`。
  3. 撰寫 `docs/architecture/google-play-distribution.md` (V1)。
- **Evidence**：`:protocol-core:test :app:lintDebug :app:assembleDebug :app:bundleRelease` 全部通過；產出 `app-release.aab` (19.29 MB)；前端 941 tests、後端 47 tests、pytest 349 tests 全部通過。
- **Skills**：`pr-author-maintainer`、`portable-release-validation`。

## 2026-09-23 / Companion 平板整合與版型驗收

- **Scope**：Android Compose/WebView 外殼、Tauri 單一算牌 owner 的工作流 bridge、Rust 命令佇列與回覆、五張共用遙測卡、內嵌 Windows ADB 及多設備選單；本輪依使用者調整暫移 APP HUD。
- **實機發現**：Android WebView 中 `html/body/#root` 被既有 flex 規則壓為 0 高，即使子層有 `100vh` 仍導致方向盤圓弧過小；根容器以 visualViewport 高度固定後，五卡皆可用。平板旋轉後 `matchMedia('(orientation: portrait)')` 曾仍回 false，寬度斷點較可靠；390px 模擬顯示 Tires/Suspension 兩欄文字擠壓，改單欄卡內捲動。
- **連線與界線**：ADB `reverse --list` 的首欄在該平板回 `UsbFfs`，不能假定等於裝置 serial；連線需以指定 serial 的反向規則與實際 port 驗證。受控 324-byte UDP 回放在 Android 實機顯示五卡；APP 草稿輸入到 Tauri working draft、桌面算牌結果回 APP 均已觀察，但不等於 FH6 gameplay 驗收。APP HUD 預覽曾遭 Android `lmkd watchdog` 終止，依新範圍移除入口與專用程式碼，桌面 HUD 保留。

## 2026-09-23 / Companion LAN 與相機 QR 配對

- **Scope**：在既有 USB 除錯模式之外，Rust sidecar 增設獨立 LAN listener、限縮 Companion 路徑、一次性短碼與含所有非 loopback IPv4／實際 port／到期時間的 QR 契約；Android 依序嘗試各位址並保存配對工作階段，桌面設定產生 QR，連線狀態合成單一三色 badge。Android launcher 改用 `frontend/src-tauri/icons/icon.ico`；根目錄 `app.ico` 實為另一專案圖樣，未採用。
- **實機發現**：平板 `bd411745` 不用 `adb reverse`，透過 192.168.4.4 → 192.168.4.3:8002 的 Wi-Fi 連上 Companion；工作流程命令由 Android 送出、桌面 host exchange 收到並 ack，Android 再讀到 applied 與 snapshot。原生 WebView 對 LAN HTTP 無 `crypto.randomUUID()`，改用 `crypto.getRandomValues()` UUID。MIUI 的 CameraX 預設 SurfaceView 在 Compose Dialog 中全黑，`PreviewView.ImplementationMode.COMPATIBLE` 後實機截圖有即時畫面。
- **驗證**：Rust `cargo test --locked` 全通過（含 LAN host/origin/session/revocation）；前端 134 files／939 tests 與 build；Python 349 passed／8 deselected、Ruff check／format；Android `:protocol-core:test :app:lintDebug :app:assembleDebug` 成功，最新 APK 已安裝於平板。LAN listener 未授權靜態與工作流請求 401、拒絕管理 API 404、已認證 WS 101；實機顯示單一黃色 badge「桌面前端未連線」符合 sidecar-only 情境。
- **QR 實機驗收**：使用者以平板相機掃描本輪 sidecar 產生、含 192.168.12.3／192.168.4.3 的五分鐘 QR 後回報已連線。後端裝置紀錄的同一平板 `paired_at=2026-09-23T05:31:06Z` 證實本輪確實重新配對；重新安裝後的 Android SharedPreferences 與 WebView Connection 均顯示成功保存的 192.168.4.3:8002，代表前一個候選位址未成而落到第二個。後端曾顯示 `active_connections=1`，實機只有單一黃色「桌面前端未連線」badge，符合 sidecar-only 情境。沒有檔案或相簿匯入 QR 的產品入口。
- **驗收界線**：控制式工作流測試不等於實際 FH6 駕駛；本輪沒有將桌面 Tauri 主視窗叫到前景，故 QR 後的綠色雙端狀態仍待桌面前端連上時確認。Google Play 發行整備另追蹤 #433，非本輪完成事項。

## 2026-09-23 / Companion 原生外框與一致化 UI

- **決策**：Android Compose 統一持有 Telemetry／Tuning／Connection 分頁、離線提示、QR 優先的連線設定、折疊式手動欄位與診斷資訊；只有連線後的共用遙測圖表與 Tuning 內容由 WebView 呈現。原生與 WebView 對齊深色面板、青色作用中分頁及藍色操作按鈕；初次連線前延後建立 WebView。
- **實機驗證**：平板 `bd411745` 在 LAN 連線前後使用同一組 Compose 分頁；Telemetry 五卡、Tuning 等待桌面快照頁、Connection 進階欄位均可切換。切換 LAN／USB 會先斷開舊連線，避免模式與實際通道不一致；USB 無反向轉發時顯示 `ERR_CONNECTION_REFUSED`、重試與返回主畫面，返回後仍可用原生分頁。連線指示區分 WebView 載入、Companion 後端輪詢及桌面前端心跳，以免後端離線誤報為只有前端未連線。
- **驗證**：Android `:protocol-core:test :app:lintDebug :app:assembleDebug` 成功；前端 135 files／941 tests 與 production build 成功；Python Ruff check／format 與 349 passed／8 deselected。實機 sidecar-only 連線為黃色「桌面前端未連線」，停止測試 sidecar 後後端輪詢轉 Offline、badge 轉紅，沒有繼續誤報黃色；CI 結果見 PR #425 的最終驗證紀錄。

## 2026-09-23 / PR #426 Linux AppImage 本機驗證（Lynn as Hermes）

- **範圍**：在本機 Ubuntu 22.04 x86_64 容器中驗證 PR #426 Linux LAN release 路徑；隔離 worktree 為 `FH6-HorizonTuner-pr-426`，未改動 main worktree。文件補上本機建置命令，並新增 root `/.pnpm-store/` ignore，避免 pnpm cache 讓 PR worktree 顯示未追蹤檔。
- **工具鏈與建置**：Node 22.23.2、pnpm 11.27.0、uv 0.12.18、Rust stable。版本一致性、Rust format、Rust no-default-features tests、release helper pytest、Tauri host tests（5 passed）、LAN frontend production build 與 Linux native backend build 均完成。Linux AppImage 與測試 updater signature 成功產生；AppImage 為 86,911,480 bytes，signature 為 436 bytes。環境原先帶有 `UV_PYTHON_PREFERENCE=only-managed` 時，`uv venv --managed-python` 會拒絕執行；本機指南用 `env -u` 限定移除此衝突變數。
- **封裝 smoke**：`smoke_native_release.py` 回報 runtime `linux`、10 個 frames、HTTP requested port 44595 fallback 至 37015、UDP telemetry port 43204，且 shutdown 為 `clean`。另以 DBus + Xvfb 啟動 AppImage，5 秒內建立 `FH6-Horizon Tuner` 視窗。
- **前端測試差異**：標準 5 秒 timeout 的完整本機 Vitest 首次有 1 個 stress test timeout；同一 stress 檔 22 tests 在 30 秒 timeout 下通過。完整 140 files／989 tests 在 `--testTimeout=30000 --maxWorkers=2 --no-file-parallelism` 下全通過，用時 107.60 秒；PR 上標準 frontend CI check 亦為 pass。沒有修改測試斷言或其標準 timeout。
- **邊界與工具限制**：Xvfb 視窗建立不等同實際桌面／Wayland 操作；OTA 真實安裝、跨裝置遊戲驗收仍未完成。容器驗證 wrapper 最後的 `git status` 因 worktree `.git` 指向未掛載的 parent repo 而退出 128；已在 host 另行檢查 Git 狀態，這不是產品 build 或 smoke failure。
- **操作文件**：[跨平台發行指南](../docs/guides/cross-platform-release.md)。使用 `portable-release-validation`、`pr-author-maintainer`、`cross-agent-collaboration`、`engineering-governance`、`agent-governance-audit`。

## 2026-09-23 / PR #426 同步最新 main 與重新驗證

- **Main 同步**：`origin/main` 在 PR #431、#432 合併後前進到 `2426238`；main worktree 已 fast-forward 且乾淨。PR 隔離分支合併最新 main，唯一內容衝突在 `AnalysisSessionToolbar.tsx`；保留 LAN 的 `localMotecLaunch` capability gate，並整合 main 的 disabled export tooltip。
- **最新 Linux 產物**：以更新後 `11.45.19` 在 Ubuntu 22.04 x86_64 建置；AppImage 86,907,384 bytes，臨時測試簽章 436 bytes，SHA-256 `9bba3a2bbd11f3923a4276e484f1017a1aa3f7f5401c918d418ac20bb25a3d1d`。`prepare_native_signing.py --cleanup` 後私鑰、公鑰與暫存 config 均不存在。
- **重新驗證**：version consistency、Rust format、backend no-default-features tests、Python Ruff check／format、pytest（375 passed／8 deselected）、release helper（19 passed）、Tauri host tests（5 passed）、LAN frontend build 與 native backend build 均通過。AppImage sidecar 處理 10 frames，HTTP requested port 41799 fallback 至 40789、UDP port 39393、shutdown `clean`；DBus + Xvfb 於 5 秒內建立主視窗。
- **Vitest 可攜性修正**：最新 main 的 Mission Stress 5 原設 20 秒 timeout；本機實測約 20.8 秒。只將此測試的 runner timeout 調為 30 秒，保留全部 39,000 iterations 與 assertions；focused stress 檔 22/22 通過，標準 `pnpm --prefix frontend run test` 140/140 files、989/989 tests 通過，用時 42.29 秒。未放寬任何產品行為或斷言門檻；新 merge commit 的 GitHub checks 待推送後驗證。
- **邊界**：Xvfb 只證明視窗可建立，不等同實體桌面／Wayland 互動；原生安裝、OTA 與跨裝置 FH6 遊玩仍未驗收。

## 2026-09-22 / GitHub Actions Host Diagnostics 建置失敗修復（Gemini as Antigravity）

- **來源／狀態**：`local`／`verified`；修復 GitHub Actions 定時與手動執行的 `Host Diagnostics` 工作流程始終在 `Build Full Portable Tauri Executable` 步驟失敗的問題。
- **Learning**：
  1. **Tauri CI 設定覆蓋 beforeBuildCommand 之依賴斷鏈**：在 `frontend/src-tauri/tauri.ci.conf.json` 與 `tauri.lite.conf.json` 中，為避免在 CI 重複編譯前端，`beforeBuildCommand` 被覆寫為 `echo Using verified frontend distribution...`，並預期 `frontendDist: "../dist"`（即 `frontend/dist`）已事先備妥。在常規 `ci.yml` 中，該目錄由前置 job 建置並透過 artifact 下載；然而在獨立單一 job 的 `diagnostics.yml` 中，流程僅安裝了依賴，未曾執行 `pnpm --prefix frontend run build`，導致 Tauri 建置時因找不到 web assets 而中斷退出。
  2. **獨立測試流水線之完整前置驗證**：任何需調用 `tauri build --config ...` 的獨立工作流程（如 nightly/on-demand diagnostics），必須確保在進入 Tauri native compilation 前，前端資源已完整產出（Full 與 Lite 雙入口）。
- **Action**：
  1. 在 `.github/workflows/diagnostics.yml` 的 `Install Python & Frontend Dependencies` 步驟後，追加 `Build Frontend Distribution`（`pnpm --prefix frontend run build`）。
- **Evidence**：本地 `pnpm --prefix frontend run build` 驗證 exit 0 且產出 `dist/index.html` 與 `dist/lite/index.html`；`git diff --check` 通過。
- **Skills**：`portable-release-validation`。

## 2026-09-22 / 以 Rust sidecar 保留後端輸入輸出契約

- **Scope**：`codex/rust-backend`；使用者授權將 Python 產品後端移至獨立 Rust crate，保留前後端分離，以輸入／輸出相容為本地驗證基準。採用 `cross-agent-collaboration`、`modular-refactoring`、`telemetry-udp-protocol`、`portable-release-validation`、`pr-author-maintainer`、`agent-governance-audit`、`github-security-audit`；三個 Luna 子代理分別持有 telemetry、Road、native/MCP，root 管理 HTTP/runtime、建置、整合與除錯。
- **Architecture**：Tokio UDP 接收只解析並送入有界佇列；同步 SQLite、錄製與分析在處理 worker。獨立 Axum HTTP／WS 契約維持前端用法，Tauri 管理 stdin ownership 與 readiness。產品 launch/build 改走 Cargo，不需要 Python／PyInstaller；Python 暫留為 oracle、CLI 與維護工具。
- **Reproduced findings**：Python fixtures 揭露 NULL SQLite metadata、Road slider grid、Dyno rounding、MoTeC 空白列、MCP 小數四捨五入與原生 PCM gain 差異；整合 review 另修 Discord 設定來源／telemetry timestamp、Windows UDP reset suppression、language list 的 en-us 順序。設定 schema 升級需落盤及保留備份，已接受的 UDP frame 在 EOF 關閉前需排空。
- **Evidence**：Rust 契約測試涵蓋設定、MoTeC、26 MCP tools/resources、Road lifecycle、232/324-byte 封包、exact 128-byte binary、Dyno／Drag／Race 與 SQLite。真實 subprocess 測試涵蓋 HTTP／multipart／UDP／三條 WS、手動錄製、動態 port、開啟中的 WS 與 stdin EOF。Rust release sidecar 可建置，Windows PE version 為 11.45.18.0。驗證命令與最新結果以 PR 內文為準。
- **Boundary**：本地 I/O 契約及 release 編譯不等同真實 FH6、原生音訊／GSMTC／Discord、GUI 或跨機驗收；不宣稱特定效能提升百分比。既有前後端調校 solver／顯示單位分工差異另提 enhancement #423，本次不重新設計。
- **CI learning**：MoTeC CSV 是 byte contract，須避免 Git 正規化 CRLF。Road JSON／SQLite 的 immutable equality 需 `serde_json/float_roundtrip`；以 CI 捕捉到的 `1790061494.4082587` 在本地重現單一 ULP 漂移，再修正解析器，保留精確相等 assertion。CodeQL path finding 的修正改為以受信任目錄列舉項目解析路徑，避免 `exists()` 略過 dangling link；Windows junction／case alias／dangling junction 均有回歸驗證。
- **Reference**：[Rust 後端指南](../docs/backend-rust/README.md)、[開發指南](../docs/guides/development.md)。
- **CodeQL source audit**：SARIF analysis `1816409922` 的三條剩餘資料流皆從 WebSocket handler 的 `State<Arc<dyn Backend>>` 出發，經 server-owned root 讀取固定 `hud_config.json`；非客戶端提供路徑。依 [Axum closure capture](https://docs.rs/axum/latest/axum/#using-closure-captures) 將啟動時 backend 注入與 request extractors 分離，讓 [CodeQL Axum parameter model](https://github.com/github/codeql/blob/main/rust/ql/lib/codeql/rust/frameworks/axum.model.yml) 保留真正 request sources；未排除規則或 dismiss alert。既有三條 WS I/O 及新增 foreign-Origin 403 契約通過，檔案 containment 防護保留。

## 2026-09-22 / 跨平台 Full 發行與獨立 OTA channel

- **範圍**：依使用者修正，先將 `codex/cross-platform-release-ota` 建立於更新後 `origin/main` 的 `b6259865a442dedf90062eb6e46bc0ef95fea686`，不沿用 Companion 架構分支。採用 `portable-release-validation`、`modular-refactoring`、`halfmoon-design-system`、`huge-component-refactoring`。產品基礎已遷移 Rust，因此原生套件使用 Rust sidecar，而非重新引入 Python 打包。
- **能力邊界**：macOS ARM64 Full 與 Linux x86_64 Full 使用 no-HUD Cargo feature profile 及前端 LAN 入口。Rust 不嵌入 HUD，不建立音訊／媒體 worker；Vite 模組圖拒絕 HUD／overlay_control imports。Live 頁面的 HUD 設定讀取與 BroadcastChannel 也必須受能力控制，僅移除 HUD 導航並不足夠。
- **可重現的 port 問題**：啟動時 `TELEMETRY_PORT` 與設定檔 port 不同，儲存語言等設定曾使新的接收器控制邏輯切回設定 port。環境變數現在在啟動及設定更新時均優先，runtime API 只回報成功 bind 的地址。重新 bind 失敗時保留原接收器，回報錯誤。
- **OTA 與重跑**：payload／signature 不可覆寫已發布的不同 bytes；驗證上傳內容後才發布 manifest。carry-forward 保存舊 runtime version、URL、簽章，不為首次失敗的平台假造 channel。GitHub asset 替換不具原子性，保留短暫空窗與重跑復原說明。publisher-only retry 必須使用不含 `run_attempt` 的 artifact 名稱，才能下載先前成功建置的同一組 bytes；實際 GitHub 重跑仍待 CI 驗證。
- **本機證據**：前端 131 files／930 tests；Windows Full／Lite 與 LAN bundle 建置；Rust 有 HUD／無 HUD 契約；Tauri host 單元測試；24 個發布／簽章工具測試；三份 workflow 的 Actionlint、Ruff、version consistency、Rust format 及 diff whitespace 檢查。Windows release sidecar 與 Tauri EXE 可編譯。macOS／Linux `cargo tree --target ... --no-default-features --edges normal` 不含 rustfft 與 Windows API crates。
- **受控介面／程序證據**：以暫存資料目錄啟動 Windows 上的 no-HUD backend 與 LAN web bundle，導航僅有 Live／Tune／Sessions；Data Out 顯示實際 LAN IP 與覆寫 port 18000，20 個合成封包顯示 20 個有效影格。檢查 default／modern／elegant 深淺主題，無新增 console error。獨立 smoke helper 驗證 `embeddedHudFiles=0`、HTTP occupied-port fallback、10 個合成封包、stdin EOF 與 UDP port 釋放；證據保存在本機 ignored `scratch/lan-backend-smoke-ig2c9ocu/`。
- **限制**：Windows no-HUD 編譯／本機 UDP 與瀏覽器介面，不等於 macOS／Linux 原生套件、GTK／Cocoa 儲存視窗、完整 OTA 安裝或真實跨機 FH6 驗收。native CI 已接入相同 reusable packaging workflow，PR／手動測試使用臨時簽章，不發布 Release。未以本次本機結果宣稱跨平台驗收完成。
- **操作文件**：[跨平台發行指南](../docs/guides/cross-platform-release.md)。

## 2026-09-21 / Canvas 60Hz 環形緩衝區優化與 FrameInterpolator 物件語意決策（Gemini as Antigravity）

- **來源／狀態**：`local`／`verified`；消除 `SuspensionBar` 與 `GForceRadar` 在 60Hz 高頻渲染循環中 `Array.shift()` 的 $O(N)$ 記憶體搬移與 GC 抖動，並確立 `FrameInterpolator` 保留 React 物件語意的架構決策。
- **Learning**：
  1. **高頻 Canvas 環形緩衝區 (Circular Buffer) 零搬移合約**：在 60Hz 高頻遙測路徑中，`SuspensionBar`（固定 180 筆）與 `GForceRadar`（固定 900 筆）若使用 `Array.shift()` 維護歷史隊列，在隊列滿載後每幀皆觸發 $O(N)$ 記憶體搬移與陣列重分配。改採固定尺寸陣列配合 `offsetRef` 原地更新，達成 $O(1)$ 常數時間複雜度，與 `PedalTraceCanvas` 及 `PowerTorqueCanvas` 模式統一。
  2. **繪圖依序模運算 vs 極值無序掃描之差異化遍歷**：波形連線組件（`SuspensionBar`）繪製時依賴時間軸連續性，須透過模運算 `(offsetRef.current + k) % len` 由舊至新依序走訪，以正確對齊最新時間錨點 `maxT`；而雷達極值標記（`GForceRadar` markers）僅尋找全局八方位極值，為順序無關（order-independent），因此直接線性遍歷，避免多餘模除運算。
  3. **FrameInterpolator 原型繼承破壞 React 物件語意之反思**：嘗試在 60Hz 遙測插值中以 `Object.create(curr)` 代替 `{ ...curr }` 雖然能加速物件複製，但會將屬性置於原型鏈（prototype chain）而非自有效屬性（own properties），導致 `Object.keys()`、展開運算子及 JSON 序列化遺失屬性，破壞 React 下游組件的資料契約。故回退該變更，嚴格維持淺拷貝以確保安全性。
- **Action**：
  1. 修改 `SuspensionBar.tsx`：引入 `offsetRef`，在重置狀態時重置 offset，將 60Hz 更新改為 $O(1)$ circular buffer，繪製時採模運算依序走訪。
  2. 修改 `GForceRadar.tsx`：引入 `offsetRef`，在重置狀態時重置 offset，將 60Hz 更新改為 $O(1)$ circular buffer，Marker 搜尋維持直接線性走訪。
  3. 更新 `.jules/bolt.md` 與 `.agents/Journal.md` 登錄學習點。
- **Evidence**：前端測試 128 檔案 920 tests 全數通過；前端 Vite 生產打包通過；`git diff --check` 通過。
- **Skills**：`huge-component-refactoring`、`modular-refactoring`。

## 2026-09-21 / HUD 刻度式羅盤功能優化、60Hz Canvas 雙級刻度與螢幕邊緣對齊（Gemini as Antigravity）

- **Scope**：遙測卡片叢集追加刻度式羅盤 HUD；採用 `halfmoon-design-system`、`pr-author-maintainer`。
- **Verified learning**：
  1. **無邊框無實體背景 HUD 的高對比抗干擾策略**：在 Canvas 繪製中同時啟用 `ctx.shadowColor = 'rgba(0, 0, 0, 0.95)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 1;`，搭配容器層 `filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.95))` 與兩側線性平滑漸層羽化（Fade Out Mask），能在不遮擋駕駛視線的前提下，使 50vw 寬度的刻度羅盤在雪地、艷陽或夜間等複雜背景中維持高對比與清晰度。
  2. **雙級刻度與八方位輔助判讀架構**：以正北 (N) 為 0°，將 360° 方位角依 5° 間距劃分。次刻度（Minor Tick）7px 長/1px 粗；每 15° 的主刻度（Major Tick）14px 長/2px 粗並附帶輔助方位角數字；其中 0°, 45°, 90°, 135°, 180°, 225°, 270°, 315° 等八方位角以主色彩突出顯示英文縮寫（`N`, `NE`, `E`, `SE`, `S`, `SW`, `W`, `NW`），兼顧航空級精確度與即時判讀性。
  3. **螢幕上緣／下緣邊界安全掛載**：利用現有 `tcTopEdgeContainer`（`flex-direction: column`）與 `tcBottomEdgeContainer`（`flex-direction: column-reverse`），以 `insertBefore(..., firstChild)` 確保羅盤無論配置於上緣或下緣皆緊貼最外側螢幕邊緣，且在 DOM Mock 環境中做好 `insertBefore` 與 `parentElement` 安全相容防護。
- **Action**：
  1. 新增 `hud_overlay/shared/telemetry-cards/compass.js`。
  2. 修改 `template.js`、`manager.js`、`telemetry-cards.js`。
  3. 修改 `hudConfig.ts`、`HudLayoutPanel.tsx`、`lang/zh-tw.json`。
  4. 擴充 `telemetryCards.test.ts`。
- **Evidence**：前端 128 files / 924 tests 全部通過；Vite build 843ms 通過；後端 pytest 350 passed, 8 deselected 全部通過；`ruff check .` 與 `git diff --check` 通過。

## 2026-09-20 / #396 零輸出斷油與窄轉速採集（Astra as Codex）

- **Scope**：在已合併 #397 的 `844ad1b` 上獨立修正；採用 `physics-tuning-math`、`modular-refactoring`、`pr-author-maintainer`。
- **Verified learning**：斷油特徵的時間戳必須與正輸出採樣時間分離。全油門、同檔、有效車輛與連續時間下的零／負輸出可支持斷油判定，但不得增加 clean duration、bins 或 peak。控制輸入／檔位／資料中斷會重置待確認的平原期。
- **Coverage**：固定最多 64 個證據桶保留正輸出 sums/counts；推定有效上限後重新聚合成最多 16 個有效轉速桶，不複製樣本。可涵蓋斷油點低於表底 55% 與舊分組少於 6 bins 的情境。額外拉轉超過暫定上限時撤銷舊推論。
- **Evidence**：前端 127 files／903 tests、production build；後端 350 passed／8 deselected；Ruff 與 whitespace 通過。
- **Boundary**：合成低轉／歸零／負輸出、控制中斷及 archive round-trip 測試；沒有實際 FH6 跨車校準。平原期、衰退仍屬觀測 heuristic，不能視為馬力機或 ECU 認證。

## 2026-09-20 / PR #397 與 session controller 整合修正（Astra as Codex）

- **Scope**：採用 `pr-author-maintainer`、`pr-review-evaluation`、`cross-agent-collaboration`、`halfmoon-design-system`、`huge-component-refactoring`、`modular-refactoring`、`physics-tuning-math`；root 持有產品實作，Luna 補快取與 API 邊界測試。
- **Verified learning**：ready、local archive、API 的完整性門檻必須一致；一般 90%／8 bins，具嚴格 boolean morphology 與有效觀測上限時才使用該上限 90%／6 bins。不能用 truthy flags、非法 limit 或無條件降低 bins 繞過採集要求。
- **Lifecycle**：Dyno 圖改讀 session-owned accepted bins，隨 5Hz UI publication、resize、主題與單位變更重畫；不再自行訂閱 raw telemetry、混入不合格 frame 或在切頁後遺失圖表資料。本版採平均 bins 平滑連線，取代 9/18 條目的 10 RPM shadow buckets 說明。
- **Evidence**：前端 126 files／892 tests、build；完整後端 349 passed／8 deselected，補測後 workflow API 4 passed；Ruff 與 diff whitespace 通過。
- **Boundary**：零／負輸出仍在 morphology 前被排除，#396 必須以後續 PR 補足，不能宣稱全面修復。未做 FH6 實車與原生 GUI 驗收；上限與動力帶仍為觀測 heuristic。

## 2026-09-20 / 原生檔案匯出與瀏覽器手勢期限（Astra as Codex）

- **Scope**：#391／#392 共用儲存流程；採用 `pr-author-maintainer`、`cross-agent-collaboration`、`halfmoon-design-system`、`modular-refactoring`、`computer-use`。Root 持有共用服務／原生 IPC，Luna 遷移三個獨立入口及補純服務測試。
- **Verified learning**：跨來源後端 anchor 可能導覽主 WebView；必須由既有 backend transport 取得且驗證 Blob，再交給儲存流程。瀏覽器 picker 必須在網路等待前消耗點擊手勢，原生 picker 則可在資料準備完成後開啟。取消／失敗不能靜默改走下載。
- **Native evidence**：Windows debug Tauri 真實 XML 儲存（中文檔名、完整路徑通知）、取消、HTTP 200 JSON error、後端離線留頁均已觀察；Rust 二進位覆寫／失敗保留測試通過。
- **Boundary**：909 frontend tests、350 backend tests、5 Rust tests 與 Full／Lite build 通過。瀏覽器 picker／fallback 是注入測試；未逐一實機覆蓋所有入口、剪貼簿內容、不同瀏覽器、發行 EXE 或真實遊戲。詳細範圍見 [檔案匯出指南](../docs/guides/file-exports.md)。

## 2026-09-18 / 斷油點特徵閉環自動判定、平滑 Dyno 曲線與齒比圖斷油端點對齊（Gemini as Antigravity）

- **來源／狀態**：`local`／`verified`；解決部分車輛實際斷油轉速低於表底導致調校工作流 Step 3 資料採集卡死問題，並將調校齒比圖端點對齊至斷油轉速。
- **Learning**：
  1. **Dyno 形態特徵閉環自適應採集判定**：部分 Forza 車輛（如特定改裝或美式大排量引擎）之實際斷油轉速遠低於表底紅線（`EngineMaxRpm * 0.9`），導致傳統固定 16-bin 與 90% 表底門檻在 Step 3 永遠無法滿足。演算法改為偵測真實 Dyno 形態特徵：後峰值動力衰退達標（$\ge 12\%$）或全油門高轉斷油平原期累加（$\ge 350\text{ms}$），即可自適應收縮採集範圍為 `effectiveRedline * 0.85` 並以 $\ge 6$ bins 閉環判定完成，徹底捨棄脆弱的手動確認按鈕。
  2. **10 RPM 聚合桶與二次貝茲平滑 Dyno 渲染**：即時 60Hz 遙測存在微小齒比震盪與離散噪聲。在 `<LiveDynoCurveCanvas />` 中採用 10 RPM 區間中位數/均值聚合，並以相鄰中點二次貝茲曲線插值繪製平滑雙曲線（Power 主色、Torque 副色），背景半透明高亮動力帶（Powerband）區域並垂直標注 Peak HP/TQ/Cutoff 指示線，提供直觀清晰的視覺回饋。
  3. **齒比圖鋸齒升檔曲線端點對齊斷油轉速**：齒比圖（Speed vs RPM Chart）各檔理論最高速原先以錶底 `yLimit` 計算，造成低斷油轉速車輛的齒比線段右側終點虛高，連帶使下一檔切入點偏離實際。修正為統一以 `cutoffRpm`（優先取 `effectiveRedline`，fallback 至 `yLimit`）計算各檔終點車速與繪圖上限，使各檔線段右側終點精確貼齊斷油轉速，並使下一檔左側起點精確對齊換檔掉轉轉速 $(cutoffRpm \times \frac{ratio_{N+1}}{ratio_N})$，完美呈現實際換檔轉速域與車速。
- **Action**：
  1. 修改 `tuningMeasurement.ts`、`engineMeasurementArchive.ts`、`road_models.py`，新增動力衰退與平原期斷油檢測及前後端資料驗證。
  2. 新增 `LiveDynoCurveCanvas.tsx`，並整合至 `TuningMeasurementStep.tsx`。
  3. 修改 `GearingTuner.tsx`，導出 `computeGearingChartData` 純函數並加入斷油轉速參考線。
  4. 擴充 `tuningMeasurement.test.ts`、`engineMeasurementArchive.test.ts`、`test_workflow_api.py`、`GearingTuner.test.ts`。
  5. 於 `lang/zh-tw.json` 補充 `Rev Limiter` 翻譯。
- **Evidence**：前端測試 110 檔案 789 tests 通過；後端 pytest 349 tests 通過；`tsc && vite build` 通過；`ruff check .` / `ruff format --check .` / `git diff --check` 通過。
- **Skills**：`physics-tuning-math`、`halfmoon-design-system`、`modular-refactoring`。

## 2026-09-16 / V1.6 Release 發行前準備、版本契約平滑推進與文檔全域同步（Gemini as Antigravity）

- **來源／狀態**：`local`／`verified`；完成 V1.6.0 Release 發行前版本號全域同步、安全支援週期轉移、發行說明撰寫與多語系主文檔更新。
- **Learning**：
  1. **Tauri OTA 序列推進與 Git Tag 雙軌相容性**：專案對外發布 Tag 為 `v1.6.0`，而 Tauri v2 updater 的內建比對機制嚴格採用 SemVer 序列（`remote > current`）。從上一版 V1.5.2 的 `11.45.17` 平滑推進至 `11.45.18`（Sidecar `11.45.18.0`），確保既有 `v1.4.x` 與 `v1.5.x` 客戶端能順利觸發 OTA 更新通知，同時維持 `validate_version_consistency.py` 的跨語言（Rust Cargo/Python/JSON/PyInstaller）強契約一致性。
  2. **支援政策生命週期轉移**：依據 `portable-release-validation` 規範更新 `SECURITY.md`，將主要支援版本推進至 `1.6.x`，上一版 `1.5.x` 轉為維護過渡期，`1.4.x` 及更早版本終止支援，同步維護中英文雙語條目。
  3. **Release Highlights 結構化梳理**：本次 V1.6 聚合三大核心革新：Tuning Workflow V2（4 階段 3 欄位佈局與 Race Evidence 實測遙測特徵驅動）、HorizonTuner-cli (`fh6-agent`) AI Agent 零相依工具鏈、Classic JDM 復古儀表群組與街機多聯錶，並包含全域 60Hz O(1) 環形緩衝區與自訂公式 RCE 重大安全修復。
- **Action**：
  1. 同步更新 `tauri.conf.json`、`Cargo.toml`、`Cargo.lock`、`backend/main.py`、`backend/agent_cli.py`、`backend/version_info.txt`、`test_diagnostic_support_bundle.py` 與 `agent-cli-guide.md` 之版本號至 `11.45.18` / `11.45.18.0`。
  2. 更新 `SECURITY.md` 支援矩陣至 `1.6.x`。
  3. 建立 `docs/releases/v1.6.0.md` 發行說明。
  4. 同步更新 `README.md` 與 `README.en.md` 核心功能與專案架構樹。
- **Evidence**：`scripts/validate_version_consistency.py` 輸出 `Application version contract OK: 11.45.18`；後端測試 335 passed, 8 deselected；前端測試 108 files / 752 tests 通過；Vite 生產建置 726 modules 通過；Ruff check/format 通過；`git diff --check` 通過。
- **Skills**：`portable-release-validation`、`modular-refactoring`。

## 2026-10-06 / Rhine Lab 主題 Live Telemetry Traces 100% 數值覆蓋問題修復（Gemini as Antigravity）

- **來源／狀態**：`local`／`verified`；修復 Rhine Lab 與 Swiss 主題下，遙測卡片 Live Telemetry Traces 之 INPUT WAVEFORM（油門/煞車）數值點在 100% 時因圖例表面 (`.telemetry-trace-legend`) 不透明背景覆蓋而隱沒之問題。
- **Learning**：
  1. **實色圖例遮擋高頻波形頂部極值之幾何失效**：Rhine Lab 與 Swiss 為呈現平直紙面與儀表檔案欄風格，將 `.telemetry-trace-legend` 樣式設定為實色 `var(--surface-1)` 及底邊框。但在既有 `PedalTraceCanvas` 與 `PowerTorqueCanvas` 中，繪圖頂部內距硬編碼為 `padTop = 26 * dpr`，而圖例使用 `p-2`（上下 8px 內距）加上文字行高，高度達 35px。使得輸入在 100%（以及 >91%）時之波形頂部數值點落在 `Y = 26px`，完全隱沒於實色圖例下方。
  2. **圖例緊湊化與繪圖幾何 SSOT 契約解耦**：
     - 於 `canvasTheme.ts` 建立統一幾何常數 `TRACE_PAD_TOP = 32` 與 `TRACE_PAD_BOTTOM = 12`，並重構 `drawTraceGrid` 的格線範圍與垂直線起點（`padTop`），同時補齊 100% 水平格線（`i <= 4`）。
     - 將圖例 padding 調整為 `px-2 py-1` 並賦予 `line-height: 1.25`，將圖例高度壓縮至約 25px，使 100% 波形值（Y = 32px）與圖例底邊保留安全間距，完全避免被實色圖例遮擋。
     - 在標準 140px 面板高度下，繪圖有效高度 `plotH = 96px` 為 4 的整數倍（每格剛好 24px），同時消除了先前 102 / 4 = 25.5px 造成的亞像素抗鋸齒模糊問題。
- **Action**：
  1. 修改 `canvasTheme.ts`：導出 `TRACE_PAD_TOP` (32) 與 `TRACE_PAD_BOTTOM` (12)，重構 `drawTraceGrid` 包含 100% 水平線與對齊垂直線。
  2. 修改 `PedalTraceCanvas.tsx` 與 `PowerTorqueCanvas.tsx`：引入 `TRACE_PAD_TOP` / `TRACE_PAD_BOTTOM`，圖例改為 `px-2 py-1`。
  3. 修改 `rhine.css` 與 `swiss.css`：為 `.telemetry-trace-legend` 補充 `line-height: 1.25` 鎖定圖例高度。
  4. 擴充 `canvasTheme.test.ts` 驗證常數餘量契約與格線無異常繪製。
- **Evidence**：`git diff --check` 通過；`pnpm -C frontend exec vitest run src/utils/canvasTheme.test.ts` 5 passed；前端全量測試 189 test files / 1702 tests 全數通過。
- **Skills**：`halfmoon-design-system`。

## 2026-10-07 / MoTeC 原生二進位 .ld 結構、.ldx 單圈標記與 60Hz 網格重取樣整合（Gemini as Antigravity）

- **來源／狀態**：`local`／`verified`；依據 Issue #484 與 PR #495 擴充賽事遙測匯出功能，實現原生 MoTeC .ld 二進位格式、.ldx XML 單圈標記 companion 輸出與前端雙軌匯出。
- **Learning**：
  1. **MoTeC .ld 二進位版面與固定偏移指標結構**：
     - Header magic 固定為 `0x00000040` (u32 LE)，通道元資料指標設於 `13384` (`0x3448`)，通道資料起始位址設於 `18468` (`13384 + 41 * 124`)。
     - 41 個通道元資料維持雙向 linked list（每個 124 bytes，包含 `data_ptr`, `data_count`, `datatype = 5`, `datasize = 4`, `sample_rate = 60`），通道資料區採小端序 `f32` 平坦連續陣列。
     - 封裝 sparse runs template（13384 bytes），確保 MoTeC i2 Pro 能正常解析檔案結構與通道元資料。
  2. **60Hz 等間隔時間網格線性重取樣**：
     - 遊戲遙測封包時間戳記受網路與影格渲染波動影響，非嚴格等間隔。透過 `resample_to_grid` 將原始點重取樣至 60Hz 均勻時間網格（`dt = 1/60s`）。
     - 連續物理通道（速度、轉速、G 值、懸吊、胎溫、油門煞車等）採線性插值，離散狀態通道（`Gear`, `LapNumber`）採 nearest step 保留整數跳變，避免非物理中間值。
  3. **.ldx Companion XML 標記契約**：
     - 伴隨產出之 `.ldx` XML 內建 `Beacons` 群組（`ClassName="BCN"`, `Flags="77"`），單圈標記時間採科學記號微秒格式（`Time="9.54200000000000000E+07"`），並包含 `Total Laps` 與 `Fastest Lap` 摘要。
     - API 匯出端點（`GET /api/analysis/export/motec/{id}?format=ld`）打包為 ZIP 格式包含 `{id}.ld` 與 `{id}.ldx`，瀏覽器下載後解壓縮即可在 MoTeC i2 Pro 中直接開啟並識別單圈區間。
  4. **無頭/測試環境之 ShellExecuteW 彈窗阻塞防護**：
     - 在 Windows 自動化測試中，調用 `open_in_viewer`（`ShellExecuteW`）可能因系統未關聯 `.ld` 應用程式而彈出「選擇開啟方式」模態對話框，導致 CI/測試工作階段無窮等待。
  5. **時間軸相對化、單圈邊界標記補齊與通道別名容錯**：
     - 若遙測 session 經歷修剪或非零時間戳起點，`resample_to_grid` 若洩漏絕對時間至通道 `Time`，會造成與自 `0.0s` 起算之 `.ldx` 單圈標記不同步達百秒以上。通道 `Time` 必須標準化為自 `0.0s` 開始的相對記錄時間（`k * dt`），且重取樣前須依時間排序防止封包微抖動。
     - 當 `laps` 表無資料但有跨圈 points 時，舊實作僅在單圈遞增處產生標記，導致最後一圈缺失終點標記，且單圈 session 僅有 1 個標記而無法在 MoTeC 構成有效單圈。修正於點序列結尾補齊終點標記，並支援以各標記區間長度計算最快單圈。
     - 若 `laps` 中包含未完賽圈（`lap_time` 為 null），退回採計 `observed_span`，防止單圈被全數略過。
     - `extract_point_channels` 支援 `accel_pct`, `brake_pct`, `DistanceTraveled`, `speed`, `NormalizedSuspensionTravel` 等欄位別名，確保無論原始 UDP 封包或 SQLite 欄位名稱皆能完整萃取 41 頻道。
- **Action**：
  1. 修改 `backend-rust/src/motec.rs`：新增 `resample_to_grid`（含時間軸相對化與點排序）、41 通道元資料 linked list 產生、.ld 二進位與 .ldx XML 序列化純函式 `export_ld`（含終點標記補齊、`observed_span` 回退、時間與賽道動態計算）。
  2. 修改 `backend-rust/src/app.rs`：於 `motec_api` 支援 `format=ld` 之 ZIP 封裝匯出與 session 本地檔案寫入啟動，加固 `storage::safe_path` 前之 `sessions` 目錄建立，並加固 `open_in_viewer` 之測試環境防護。
  3. 擴充 `backend-rust/tests/telemetry_contract.rs`：新增完整合約測試 `test_motec_ld_binary_structure_and_ldx_beacons` 與邊界測試 `test_motec_ld_edge_cases_and_beacon_robustness`。
  4. 修改 `frontend/src/context/TelemetryRecorderContext.tsx`、`AnalysisSessionToolbar.tsx`、`AnalysisView.tsx`：支援 `format: "csv" | "ld"`，工具列新增 MoTeC .ld 專用匯出按鈕，行數維持 183 行（嚴格遵守 < 250 行規範）。
  5. 更新多語系字串 `lang/en-us.json`、`lang/zh-tw.json` 與主文檔 `README.md`、`README.en.md`。
- **Evidence**：後端全量測試 30 files 通過（含 29 個 telemetry contract 測試）；前端全量測試 196 files / 1729 tests 通過；Vite build 成功；Ruff check 通過；`git diff --check` 通過。
- **Skills**：`telemetry-udp-protocol`、`huge-component-refactoring`、`pr-author-maintainer`。

## 2026-10-07 / 賽事分析 PR #495 審查反饋修復：Drag 狀態旗標解耦、起點武裝停等與 LDX 邊界約束（Gemini as Antigravity）

- **來源／狀態**：`local`／`verified`；修復 PR #495 第二輪審查回饋之 5 項阻塞項目，補齊 `pr495_review_regressions.rs` 與現有合約測試。
- **Learning**：
  1. **DragRecorder 徹底解耦 `IsRaceOn` 停錄邏輯**：遊戲自由漫遊（Free Roam）直線加速測試中，`IsRaceOn` 常態為 0 或受活動狀態波動影響。移除依賴 `IsRaceOn` 判定之停錄邏輯，改為嚴格由油門釋放（`accel < 150` 超過 0.8 秒）、最大錄製時限逾時或靜止逾時作為唯一終止判定，確保自由漫遊測試不被中斷。
  2. **停車武裝防護與連續性護欄**：在起點球體範圍內武裝路線（`armed`）時，若車輛已停在半徑內，記錄 `armed_was_inside_start = true` 並透過 $1.2 \times r$ 遲滯半徑等待車輛離開後重新進入才觸發起錄。跨幀軌跡線段檢驗前，嚴格檢驗車輛連續性：在更換車輛（`CarOrdinal` 改變）、時間戳回退、時間戳或 tick 斷層（$\ge 3.0$ 秒）或缺失 `TimestampMS` 時重設連續性，防止跨車或跨時空虛假連線觸發閘門。
  3. **LDX 單圈標記嚴格邊界約束**：產出 companion `.ldx` XML 時，排除未閉合尾圈之累加時間，且所有單圈 Beacon 時間戳記必須嚴格約束於匯出點時間跨度（`t_end - t_start`）內，即便起點時間為 `0.0s` 亦不得溢出。
  4. **CSV 匯入單圈完整度契約**：在無閘門穿越事件的 CSV 匯入情境下，移除 150 米距離門檻與本圈 `LastLap` 推定；單圈完整性必須依賴向後轉移至下一圈群組（`hasNextLap`）之事實，且以次圈之 `LastLap`（或本圈觀測區間）作為官方計時依據。
- **Action**：
  1. 修改 `backend-rust/src/telemetry/drag.rs`：徹底移除 `started_with_race_on` 與 `IsRaceOn` 停錄邏輯。
  2. 修改 `backend-rust/src/telemetry/race.rs`：加入空間與時間連續性追蹤（`last_pos_ordinal`, `last_pos_ts`, `last_pos_now`）、重設護欄與停駐起點遲滯檢驗。
  3. 修改 `backend-rust/src/motec.rs`：於 `generate_ldx_xml` 約束 beacon 不超出匯出時間窗口，排除未閉合單圈。
  4. 修改 `frontend/src/features/analysis/routeTriggerMath.ts`：以次圈轉移作為完成單圈之必要條件。
  5. 更新 `backend-rust/tests/pr495_review_regressions.rs` 與 `backend-rust/tests/telemetry_contract.rs` 合約測試。
- **Evidence**：`cargo test` 全量通過（含 22 個 review regression 測試與 29 個 telemetry contract 測試）；`cargo fmt -- --check` 通過；前端全量測試 196 test files / 1732 tests 通過；前端 build 通過；Ruff check 通過；`git diff --check` 通過。
- **Skills**：`telemetry-udp-protocol`、`pr-author-maintainer`。

## 2026-10-09 / PR #495 錄製連續性、停止刷新與匯出資格修正（Codex as Codex）

- **來源／狀態**：`local`／`verified`；接手 Issue #484 的 PR 維護，所有 tracked 修正由單一 owner 寫入，後端與前端／匯出子代理獨立只讀重現。
- **Learning**：
  1. 清除座標線段前點只能阻止虛假穿越，不能證明當圈資料完整。自訂模式的缺座標、識別、時間倒退或長缺口須保存 `invalid_laps`；SQLite 不給該圈有效圈速，並用 `valid_lap_windows` 排除中間壞圈、保留相鄰完整圈閉合點。原始樣本不刪除，後續完整圈可恢復資格。
  2. 錄製停止時的最後讀取不能沿用定期 poll 的 in-flight 略過策略；須以新 generation 取代舊讀取，並依實際 current session ID／錄製狀態刷新 metadata、laps 與最後樣本。零有效樣本不能回退成 raw 資料或被時間零點漏進。
  3. CSV 圈次資格需要觀察起點與下一圈閉合，不能用前一 group 存在、片段長度或前圈 LastLap 代替；零起算來源圈號須一次正規化，時間估算須在介面標示。累積距離 CSV 可用三秒內相鄰且沒有相矛盾遊戲圈時計的圈號轉移證明後續起點，長缺口不能冒充。
  4. 原生 LD 的固定網格重採樣會跨空洞插值，預設多段有效窗口應拒絕 LD 並保留 CSV／明確 raw 選項。Gear／LapNumber 使用前值保持；Boost 的 CSV／LD psi 通道須與領域 Pa 雙向換算。LDX 圈數、最快圈與 Beacon 都要套用同一匯出窗口。
  5. HTTP 新建與 v1 分享匯入須共用 UUID 語意：建立可生成 UUID，分享不可缺 UUID；大小寫別名統一後再查同批／已存碰撞。未知或缺 schema、錯誤／缺值 UUID 與碰撞整批拒絕，不能默默換 ID／覆寫。
- **Evidence**：完整 Cargo 契約 183 passed／3 ignored；Vitest 196 passed files、1740 passed／1 skipped；`tsc && vite build` 通過。獨立後端 17 cases、前端 16 個 hook／DOM／provider 補充案例及 180000 筆 CSV 重現通過，scratch 證據不加入產品單元 gate。最終 commit 與遠端 CI 在 PR 留言記錄。
- **Boundary**：未做真實 FH6 高速穿越、跨車種半徑校準或 MoTeC i2 開檔驗收；README／操作指南／UI 標示 LD／LDX 實驗性。`IsRaceOn` 不參與此錄製及 Road／ICE／EV 收錄資格；來源欄位與 HUD 顯示語意保留。
- **Skills**：`pr-author-maintainer`、`pr-review-evaluation`、`cross-agent-collaboration`、`telemetry-udp-protocol`、`halfmoon-design-system`、`physics-tuning-math`、`ponytail`。

## 2026-10-09 / Issue #485 主題同步第一切片（Codex as Codex）

- **來源／狀態**：`local`／`partial_verified`；基準及遠端 main 皆為 `d4e0fe3762c613240f7d6902d07edcb212aa5926`，獨立分支 `feature/issue-485-theme-sync`。初次交付保留本機 diff；後續使用者授權只提交此切片、push 並建立 draft PR，SDK 授權仍暫停，不合併／發布。完整審查範圍見 `docs/frontend/companion-theme-sync-review/README.md`。
- **Learning**：
  1. Companion LAN 不開放完整 settings；主題必須由 ConfigService 投影到 authenticated workflow GET 的 snapshot 外，不能依賴 desktop lease 或 tuning revision，也不能由 desktop host bridge 另存權威。
  2. React remote receive 要與 settings POST 分離；command busy 的 acknowledgement workflow poll 同樣須接收主題。缺省或失敗只保留最後有效值，不回寫設定或重掛工作區。
  3. Native bootstrap／cache 要綁 canonical endpoint origin；每次連線 generation 的有效性需在 main-thread 套用時再檢查。舊配對／Cookie 回呼亦須檢查 connection attempt。
  4. Linux 預設 Vite LAN profile 不輸出 Companion；驗證嵌入 sidecar 前須用 `FH6_PLATFORM=windows pnpm -C frontend run build`，確認 index/assets 存在。
- **Evidence**：Vitest 198 passed files／1747 passed tests／1 skipped；LAN 與 Windows profile build 通過。含 Companion assets 的 Cargo 184 passed／2 ignored，無預設功能 176 passed／2 ignored；Rust fmt／diff check 通過。Kotlin 2.2.21／Compose compiler＋實際 libraries 的 6 個 native contract／token 案例通過；protocol Gradle 5 tests 通過；Shell compile-only 檢查通過（Activity enums／BuildConfig 用 stubs）。Chromium 151 的 390×844 七核心 × 日夜、dirty draft 與頁面溢出檢查通過，使用合成資料。
- **Boundary**：初次本機 Android gate 被 SDK 36／Build Tools 35.0.0 未接受授權阻擋；後續遠端 compile／unit／lint／assemble／APK 證據見下節。本地 SDK 授權未接受，Android／WebView／裝置執行與真實遊戲未驗證。Compose 用 Android sans-serif fallback，CSS blur／radial anchor／Rhine 動效尚未實作。原始 log／完整 diff 另交獨立 review，不將純 JVM 或瀏覽器證據當成裝置驗收。
- **Skills**：`halfmoon-design-system`、`modular-refactoring`、`pr-author-maintainer`。

## 2026-10-09 / Issue #485 Android CI 證據留存（Codex as Codex）

- **Learning**：Android Gradle task 成功可證明編譯與 gate 執行，但預設 log 不列 JUnit 計數；未 upload artifact 就無法取得 APK hash 或原始 XML。CI 應留存各模組 XML、lint、APK、head／checkout SHA 與 source hash，而不是用 source 的 @Test 數量當執行結果。
- **Evidence**：head `c8ad8e479c087a31327beea7c6a864afba9e7a76` 的 run `37967243385` 已 success，但 artifacts 為空。補留存與 XML header 輸出後，head `add0c1fde401f99a2789c8f97e5a5d895c632fa9` 的 run `37969337059`／job `113951643171` 已 success，實際 protocol 5／theme 4／app 2 tests，0 failure／error／skipped；MainActivity compile、lint、assemble 均完成。artifact `11635360782` 包含原始 XML、lint、APK 與 provenance，APK runner SHA-256 `75b5d34cfe35365e7d57703d367108516d52a84346f688aee870b6dc34cce12e`。30 個 Android source hashes 與本機相同；產品程式碼未更動，合成 merge 不是合併 main。
- **Boundary**：本地 SDK 授權保持暫停，不為重複 compile 安裝 SDK；Android／WebView／native 同框與生命週期仍需裝置驗收。工作區下載及檔案匯入受環境阻擋，未取得本機 APK bytes／重算 hash；實際 XML suite 計數來自 CI log，完整 XML／APK 留在 GitHub artifact。原始 job logs／metadata／計數及 hash 摘要保留。
- **Skills**：`pr-author-maintainer`。

## 2026-10-09 / Issue #487 P1 中性基準預覽與就地證據（Codex as Codex）

- **來源／狀態**：`local`／`verified`（Rust／DOM 契約）；基於 main `d4e0fe3762c613240f7d6902d07edcb212aa5926`，僅本地差異供獨立審查，未做遠端寫入。
- **Learning**：
  1. 引擎相依鍵只涵蓋 powertrain，不能當作完整設定版本。完整 profile／本地基準變更必須讓 archive 保存、hydration、EV 回覆、採集與 workflow 同步失效；A→B→A 也不能讓舊 capture 自動復活。設定版本仍未知，不可由 context 的 UI 防護推論為同設定實車證據。
  2. ICE observation 的 `capturedAt` 是建立觀察的時刻；EV 沒有對等欄位。最小 provenance envelope 須把 `observationRecordedAt` 和尚未知的採集時間／session／設定版本／圈窗分開，不能用 store 或分析時間補值。
  3. Rust build script 嵌入 `frontend/dist`，前端 build 的清理／更新與 Rust doctest 不是獨立操作。平行執行可能刪掉已生成 `include_bytes!` 引用的舊資產；先固定前端產物再執行 Cargo 全套，重跑可消除這個已重現的驗證競態。
- **Evidence**：Cargo 預設 188 passed／2 ignored，無預設功能 180 passed／2 ignored；Vitest 200 passed files、1747 passed／1 skipped；typecheck／Windows frontend build、backend／Tauri fmt、Clippy 與 diff check 通過。raw logs 位於 `/workspace/issue-487-evidence/rawlogs/`，含安裝失敗、資產競態及後續成功紀錄。
- **Boundary**：沒有非中性偏好校準、WOT 圖或頻率模型；沒有修改正式 Road／frozen legacy 公式、golden fixtures、共享 ThemeContext、全域 CSS 或 Companion theme。雲端 Chromium SUID sandbox 啟動失敗，未關閉 sandbox／更改權限；窄畫面／主題視覺及真實 FH6／Android 驗收未完成。詳細契約見 [P1 文件](../docs/tuning/neutral-baseline-preview-p1.md)。
- **Skills**：`physics-tuning-math`、`halfmoon-design-system`、`modular-refactoring`、`pr-author-maintainer`。

## 2026-10-09 / Issue #487 P1 獨立審查回歸修正（Codex as Codex）

- **來源／狀態**：`local`／`verified`（Rust／DOM 契約）；在 `eda09b83` 上重現兩項審查發現。本次修正只建立本地 commit，先前已推送分支不包含這些修正。
- **Learning**：
  1. 為舊合格 ICE cache 補輪胎摘要時，readonly replay 必須保留已載入的可信 qualified evidence ID，否則 provenance 與 recommendation snapshot 會退回 imported-capture。只從成功載入的 cache 沿用 ID；cold cache 保持 null，readonly 不寫入。
  2. 完整 profile 是預覽／證據的失效邊界，不應同時用來重設草稿目標。同車 Rally／Drag、重量／範圍或引擎參數編輯需保留草稿與已套用值；換車或實際 live build identity 才重設。初次 idle identity hydration 仍保留草稿，完整 setup／sequence 防護不移除。
- **Evidence**：修正前 Rust 契約重現 evidenceId 為 null；DOM 整合測試重現 Rally／Drag 編輯後退回 Road。修正後 readonly 資料列及資料庫位元組均未改變；聚焦前端 10 項通過，完整 Vitest 201 passed files、1749 passed／1 skipped，Cargo 預設 189 passed／2 ignored、無預設功能 181 passed／2 ignored；typecheck、Windows frontend build、backend／Tauri fmt、Clippy（含 warnings）通過。原始失敗及最終 raw logs 保留於 `/workspace/issue-487-evidence/rawlogs/`。
- **Boundary**：本次沒有推送、PR 發布、留言、merge 或 release；不改瀏覽器、窄畫面／主題視覺、FH6／Android 與同設定 A/B 的未驗收標記，不改公式或共享主題檔。
- **Skills**：`physics-tuning-math`、`halfmoon-design-system`、`pr-author-maintainer`。

## 2026-10-10 / PR #499 預覽 context 與 CI lint 修正（Codex as Codex）

- **來源／狀態**：`local`／`verified`（Rust／DOM 契約）；基於審查 head `61f2222b1f5133747efbd7e2d657318da4b41902` 重現 review `5477396731` 與 inline `4236251871`，遠端新 head CI 另行核對。
- **Learning**：
  1. 草稿重設 generation 不會自動進入 workflow request：同車 Road→Road、空的已套用欄位與 PI／Class 改變可能產生相同 request key。完整 UI context 必須進入 snapshot，Apply 也須獨立核對捕獲的 context 與目前 phase；identity generation 保留 A→B→A 失效邊界。profile／season 編輯只使預覽失效，仍保留草稿目標。這個 UI token 不是可信設定版本或採集 provenance。
  2. Ruff 0.17.0 把 `tomllib` 視為標準函式庫；CI 的 I001 可由 `import re`、`import tomllib`、`from pathlib import Path` 同組排列修正，不需要降低工具版本。
- **Evidence**：修正前 9 個 PI／Class ready／late、A→B→A 與獨立 Apply 案例失敗；修正後聚焦前端 19 項及完整 Vitest 201 passed files、1758 passed／1 skipped 通過。Cargo 預設 189 passed／2 ignored、無預設功能 181 passed／2 ignored；typecheck、Windows-target frontend build、backend／Tauri fmt、Clippy（含 warnings）、Ruff 0.17.0 check／format、版本一致性、路徑大小寫與 diff check 通過。Python 維護測試 49 passed／4 skipped，不替代 Rust 產品 gate。raw logs 保留於 `/workspace/issue-499-review-evidence/rawlogs/`。
- **Boundary**：保留 Draft，審查 thread 不自行 resolve；不 merge、release 或關閉 #487。沒有擴充 provenance、懸吊證據、P2 WOT 或 P3 模型；瀏覽器／窄畫面／主題視覺、真實 FH6／Android 與同設定 A/B 仍未驗收。
- **Skills**：`halfmoon-design-system`、`pr-author-maintainer`。

## 2026-10-10 / PR #499 與 #504 中性基準及 CVT foundation 整合（Mihaly as Codex）

- **來源／狀態**：`local`／`verified`（Rust／DOM 契約）；自有 `codex/mihaly-baseline-cvt-integration` 分支保留 #504 `50baa622`、main `0dfddf7f`（含 #498）與 #499 `8b3521ef` 的 ancestry。未修改作者分支或發布遠端變更。
- **Learning**：CVT early return 仍須提供共用的中性底盤預覽，但引擎／輪胎證據及齒比推薦必須保持 null；Provider 的 EV hook 需同時接受完整 setup context 與 CVT 採集停用條件，不能在手動合併時保留重複 hook 或丟掉任一防護。設定失效 token 仍不是可信的實車設定版本。
- **Evidence**：保留兩個來源的測試，另補 CVT 與本地底盤基準共存的 Rust／產品 Provider 契約。完整 Vitest 205 passed files、1774 passed／1 skipped；TypeScript／Vite build 通過後固定 dist，再執行 Cargo 預設全套 204 passed／3 ignored，含 CVT 14 項及 workflow 13 項。backend fmt、Ruff 0.17.0 的版本工具 check／format、diff check 通過。raw logs 保留於本機 `fh6-review-20261010-mihaly` 暫存證據目錄。
- **Boundary**：既有 release performance、Windows audio／media 裝置及 cross-version comparison 測試仍 ignored；沒有真實 CVT、FH6、Android 或同設定 A/B 驗收。窄畫面／主題／鍵盤瀏覽器驗收由獨立 reviewer 執行後另記；未新增公式、求解器、採集器、來源推定或 dependency。Python 僅驗證共通 import 修正。
- **Skills**：`physics-tuning-math`、`halfmoon-design-system`、`ponytail`。

## 2026-10-10 / Issue #485 typography roles 最小切片（Codex as Codex）

- **Learning**：Swiss Technical heading `.04em` 與 control `.025em` 是不同角色；Contrast 的 readout `.08em` 繼承 Swiss，不能拿 `.02em` control tracking 代用。`Typography` 的未指定 roles 會保留 Material defaults，需集中明示 family／weight／tracking／數字特性。diagnostics dt/dd 是 body，不套用 instrument label uppercase／tracking。
- **Evidence**：新增七 core mapping tests，純 JVM 的實際 Google Maven Compose AAR／Kotlin 2.2.21 contracts 15 passed、0 failure／error／skipped；前端 1747 passed／1 skipped 與 Companion build 通過。MiSans 376 WOFF2 分片共 12,197,248 bytes 與既有 manifest 逐檔雜湊一致。來源、角色表、驗證命令與 fallback 差距見 `docs/frontend/companion-typography-fidelity/README.md`；精確 head Android CI 於 push 後保留於 stacked PR body。
- **Boundary**：專用分支基於 #498 的 `901c545d`，沒有修改 #498 分支或標 Ready。無新字體／格式轉換／協議接受；MiSans 分包工具 Apache 不代表字體本身授權，官方格式來源未核實，body 仍為明示 SansSerif fallback。native＋WebView 視覺／裝置矩陣 NOT_RUN，不宣稱像素一致；bridge／安全／主題投影／調校流程與 blur／動畫 scope 均未擴大。
- **Skills**：`halfmoon-design-system`、`pr-author-maintainer`。

## 2026-10-10 / PR #503 Rhine badge 字距審查修正（Codex as Codex）

- **Learning**：badge 不一定繼承 control 字距。`rhine.css` 的 `.badge` 明定 `.025em`，control 為 `.015em`；Swiss badge 才消費 `--control-tracking`，Halfmoon 連線狀態 badge 繼承 normal spacing。集中 role 時仍須逐用途核對 CSS。
- **Evidence**：七 core mapping test 加入 badge 字距欄位，先重現 Rhine expected `.025em`／actual `.015em`，分離 badge tracking 後純 JVM 15 passed、0 failures／errors／skipped；前端 198 passed files／1747 passed tests／1 skipped，diff check 通過。新 head 的 Android unit／lint／assemble 與 artifact 證據更新於 #503 PR body。
- **Boundary**：只改 Rhine badge 字距；heading／control／readout 未改。Halfmoon 基底 badge 字重 400 與目前 native 600 的差距另外記錄；字體 fallback、裝置／native＋WebView 視覺 QA NOT_RUN 與 #498 stacked Draft 依賴維持。
- **Skills**：`halfmoon-design-system`、`pr-author-maintainer`。

## 2026-10-10 / PR #503 Halfmoon badge 字重審查修正（Codex as Codex）

- **Learning**：Halfmoon 2.0.2 `.badge` 消費 normal=400，不能將 Swiss／Rhine 的 600 無條件套用。cores／shared／Companion CSS 與連線 status markup 沒有字重覆寫，badge weight 應獨立於 control role 管理。
- **Evidence**：完整 Companion stylesheet／status markup 的 CSSOM 字重與來源字距核對，七 core×日夜×三種狀態共 42 cases 通過。七 core mapping test 先重現 expected 400／actual 600，修正後純 JVM 15 passed／0 failures、errors、skipped；前端 198 passed files／1747 passed tests／1 skipped；diff check 通過。
- **Boundary**：只修 Halfmoon badge weight，control／selected-tab／heading／readout 原值不變。CSSOM custom-property chain 明確解析，並非字形或像素驗收；Chromium sandbox helper 配置阻止啟動，未改系統安全設定。實際字型素材／CJK／裝置 QA 缺口仍保留，新 head Android CI 證據記錄於 #503 PR body。
- **Skills**：`halfmoon-design-system`、`pr-author-maintainer`。

## 2026-10-10 / Issue #485 原始 Outfit／Inter resources 與原生 resolver（Codex as Codex）

- **Learning**：Compose font list 的 weight/style matching 不是 CSS 缺 glyph fallback；Compose 1.9.4 的 loaded Android Typeface wrapper 也不依 style request 重選 weight。每個 weight descriptor 要提供 Android `CustomFallbackBuilder` 完整 ordered chain，並讓 `wght`、native Font／Typeface style 一致。Inter `opsz` 要在角色最後字級確定後設定；其 Google Fonts archive 4.1 不等於 SFNT 內部 4.001。
- **Evidence**：固定官方 commits 的原始 Outfit 110884／Inter 876576 bytes，Git blob SHA-1 與使用者提供值一致，另計 binary SHA-256；完整原始 OFL／copyright／Inter metadata 隨 APK assets 保留。實際 SFNT name／fvar／GSUB tnum→hmtx 等寬與 resolver／七 core mapping 的純 JVM 10 tests pass；frontend 1747 passed／1 skipped。精確 head Android unit／lint／assemble、APK entries 與同 runner base APK 增量於 stacked Draft PR 保留，詳見 `docs/frontend/companion-native-fonts/README.md`。
- **Boundary**：基於 #503 `b294d634`，Depends on #503／#498，Related to #485。Rhine MiSans 來源／font 協議／4.003 仍待核實，未下載／轉換 shards，不接受永久 SansSerif；兩字型預設 lining、沒有獨立 lnum tag。無 device，mixed CJK／Latin／baseline／truncation／native＋WebView 視覺 NOT_RUN；未改 session、bridge、安全、調校、Web 設計或安裝 SDK。
- **Skills**：`halfmoon-design-system`、`pr-author-maintainer`。

## 2026-10-10 / PR #505 APK verifier pipeline 失敗傳遞（Codex as Codex）

- **Learning**：GitHub Linux 未指定 shell 的 run 使用 `bash -e`，不是明示 `shell: bash` 的 `bash --noprofile --norc -e -o pipefail`。verifier→tee 需要明示 pipefail，不能只看 step 結果；pipeline 最後一段成功可能吞掉字體驗證錯誤。
- **Evidence**：缺少 Outfit entry 的獨立 ZIP fixture 重現舊 invocation exit 0／修正 invocation exit 1；正向 fixture 與正常來源 SHA-256 前後一致。job 明示 shell，加 CI negative control，確認 missing-entry pipeline 必須拒絕；修正後 exact-head CI 留於 #505。
- **Boundary**：僅 CI／verifier 負向證據；不改正常 APK、font bytes、resolver 或 parent PR，不 resolve 外部審查。不新增安裝或協議。
- **Skills**：`pr-author-maintainer`。

## 2026-10-10 / Ready #503／#505 原生字型與 typography 整合（Mihaly as Codex）

- **來源／狀態**：`local`／`verified`（Git source／Rust／DOM 契約）；自有 `codex/mihaly-companion-integration` 正常合併 Ready #505 `28da9c9c`（含 #503 `b294d634`）至 main `60f4e4e4`，只解 Journal 衝突並完整保留兩側原始紀錄。作者分支未改寫。
- **Learning**：stacked head 的 native tree、font／notice bytes 與 workflow 可以原樣保留，同時讓主線 baseline／CVT 與前端 bridge 維持既有 tree；不能把前一 base 的 APK／synthetic checkout 證據沿用為新整合 head CI。兩側 Journal 各完整段落與目錄／blob IDs 比對可直接證明此邊界，不需為合併新增功能或改動既有 tests。
- **Evidence**：完整 Vitest 205 passed files、1774 passed／1 skipped；Cargo locked 預設 204 passed／3 ignored、無預設功能 196 passed／2 ignored，backend fmt／diff check 通過。Companion、Android workflow、字型 notices 與兩份 TTF 均與 `28da9c9c` 相同；frontend／backend／Tauri／HUD／golden fixtures 與 `60f4e4e4` 相同。現有 frontend dist 的編譯來源未變，未重建前端；Cargo gate 完成後恢復預設功能 executable，避免 reviewer 誤用無 HUD 產物。
- **Boundary**：沒有本地 JDK／SDK／Gradle／APK verifier Java 執行或裝置驗收，未安裝工具或接受協議。新整合 CI、APK provenance、native／WebView／CJK／MiSans 與實車 gate 由主線及獨立 reviewer 收斂；沒有 push、PR／GitHub 操作或 release。raw logs 於本機 `fh6-review-20261010-mihaly` 暫存證據目錄。
- **Skills**：`pr-author-maintainer`、`halfmoon-design-system`、`ponytail`。

## 2026-10-10 / PR #500／#501／#502 限定功能接手與本地驗收（Mihaly as Codex）

- **來源／狀態**：`local`／`verified`（Git source、實際 translator／DOM 與 loaded-session 契約）；自有 `codex/mihaly-pr-queue-takeover` 從 main `15f91fd3` 提取 #500 `6ea5a45c` 的三組 disabled-button 提示、#501 `1fab407b` 的兩處 Hz 翻譯及 #502 `43024f3a` 的單圈彙整功能。未匯入 flattened heads 的舊 main snapshot，原作者分支未改寫。
- **Learning**：原生 disabled button 的 wrapper title 只補充滑鼠提示；native disabled、busy、USB 未選裝置／serial request 與 HUD aria／fieldset 契約仍由原元件保留。建立／掃描／連線／選擇 USB／装置未就緒字串需三語實際字典；Hz 不能套用於輪胎 R 或方向 R。loaded-session 單 loop 避免中間陣列，不代表 live 60Hz 性能已測得提升。
- **Evidence**：新增 real SettingsProvider／USB mounted regression，修正前 en-us 1 passed、ja-jp／zh-tw 2 failed，補齊唯一字串後 focused 3 files／31 tests passed；完整 Vitest 206 passed files、1777 passed／1 skipped，TypeScript＋Windows Vite build 與 diff check 通過。full tests／build 使用本地 pnpm 11.20.0；另以 CI 同版 11.27.0 frozen install 證實 graph 前後相同，lock／manifest 未變。三語原有 key/value、主線 baseline／CVT、native fonts／APK gates 與 security lock 保留。
- **Boundary**：本輪只做本地驗收，未做遊戲、USB 裝置、native hover／視覺或實車測試；新案例驗證實際 translator 與產品 DOM，backend responses 為受控 fixture。僅 stage 指定來源提供 frozen tree；commit、PR、CI 與合併交主線及獨立 reviewer。raw logs 位於本機 `fh6-review-20261010-mihaly` 暫存證據目錄。
- **Skills**：`pr-author-maintainer`、`pr-review-evaluation`、`halfmoon-design-system`、`ponytail`。


## 2026-10-10 / V1.7.2 release preparation（Mihaly as Codex）

- **來源／狀態**：`local`／`partial_verified`；自有 `codex/chore-v1.7.2-release-prep` 由 accepted main6a8c1176建立，root獨占source／GitHub ownership，三位子代理只讀核對行為、測量證據及整合。使用者允許WIP／Known Issues，四個Issue仍開啟。
- **變更**：五個runtime owner同步11.45.22；新增v1.7.2 notes／acceptance，更新雙語README、docs index與SECURITY支援邊界。Companion以局部English fallback修正raw namespace key，保留ja／zh用語、canonical指令與全域translator契約；實際SettingsProvider三語測試先重現再通過，既有theme測試改驗可讀dirty label。
- **Evidence**：focused10及fullfrontend1780 passed／1 existing skip；TypeScript／Windows Vite build、version consistency／Rust fmt／diff checks通過。Rust完整locked suite（含doctest）依序重跑204 passed／3ignored／0failed；第一次同時重建dist造成doctest資產引用失敗，保留失敗記錄。
- **Boundary**：未新增Rust公式／依賴／權限／SDK／game／device操作；FH6保持關閉。原始車輛資料與主工作區保留。完整signedpackage／cleanWindowsGUI／LinuxGUI／publicOTA／Android仍NOT_RUN，版本準備不宣稱已發布。現存ADB payload僅hash核對後複製到ownedignoredstage，沒有下載或接受SDK條款。
- **Skills**：`portable-release-validation`、`pr-author-maintainer`、`pr-review-evaluation`、`cross-agent-collaboration`、`halfmoon-design-system`、`ponytail`（full）。
