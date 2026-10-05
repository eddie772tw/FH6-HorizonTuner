# 分工與可派發工作單

本文件搭配 [執行計畫](README.md) 與 [介面/開工條件](contracts-and-gates.md)。使用者已恢復 G2 closure 後的交付收尾；既有 W1 分支與草稿的現況見 [執行紀錄](execution.md) 及 [實作交接快照](handoffs/implementation-snapshot-20260914.md)。W2–W4 仍為 `proposed`；本次後續 task 僅準備 W2 的 entry、ownership 與 exact SHA 重新確認，不自動開始 W2 實作，也沒有建立使用者擁有的實作子任務。root 完成 final handoff/push 後依條件暫停。未來派發時須填入當時已通過 gate 的 SHA，不能用本文的預定分支名稱推論已有授權或成果。

2026-09-16 使用者新增限制：所有後續子代理（含 W1 修正、rebase 與 review）僅使用 Luna；既定 `high`/`xhigh` 思考起點可保留。歷史 Terra 執行與 review 紀錄只描述已發生工作，不構成後續授權；複雜協調與決策由 Coordinator/root 處理。

G2 等待期間完成的 [W2-A 拆分設計](handoffs/w2-a-design-preflight-20260914.md) 只提供實際 owner、檔案分界與 A-D slot 提議；沒有移交 write lease 或建立 WAVE2_BASE_SHA。

另見 [W2-B HUD 設計交接](handoffs/w2-b-design-preflight-20260914.md) 與 [W2-C Settings 設計交接](handoffs/w2-c-design-preflight-20260914.md)。它們補齊第一個工作包與 Coordinator 的 Settings/Updates 接線方向，均為 proposed；模型配置與派發順序見 [規劃交付入口](planning-delivery-20260914.md)。

## 1. Ownership 表

| Owner | 可寫範圍 | 移交時機 |
| --- | --- | --- |
| Coordinator | `frontend/src/app/**`、App.tsx、LiteApp.tsx、AppProviders.tsx、main.tsx、lite-main.tsx、Navigation.tsx、LiteNavigation.tsx、App.css | 整個迭代 |
| Coordinator 共享範圍 | `frontend/src/context/**`、`frontend/src/hooks/**`、`frontend/src/components/**`、`frontend/src/services/**`、`lang/**`、`frontend/index.html`、`frontend/lite/index.html`、package/build/test config、root lockfile/workspace、README/README.en、docs、Journal | 必要變更由 Coordinator 寫入；預設不修改 backend/Tauri/renderer |
| Coordinator HUD public contract | `frontend/src/features/overlay_control/hudConfig.ts` 及其既有 public schema/normalization 契約 | B 可提 typed patch 需求，不自行改跨端 config 格式 |
| W1：Tune / Road state 子代理 | 分別獨占 `frontend/src/features/tuning/**`、`frontend/src/features/road/**` | G0-code + P1 精確 SHA 後；核對已對齊的 road-reviewed 與其他候選，交 root 接入 P2，尚非 W3/D |
| W1/A0：Sessions / Live 最小前置 | `frontend/src/features/live/**`、`sessions/**`、`analysis/**`、`telemetry/**`、`drag_test/**` | G0-code + P1 精確 SHA 後；selection/lifetime 與最小 adapter 完成交 root 接入 P2 |
| W1/B0：HUD runtime 前置 | `frontend/src/features/overlay_control/**`，排除 hudConfig.ts public contract | G0-code + P1 精確 SHA 後可開始；權威讀取/寫入存活完成後交 root 接入 P2，是 G2 前置 |
| W2/A：Sessions / Live 完整重構 | Live/analysis/telemetry/drag_test；Sessions 僅限下方 A 精確檔案表，排除 root 的 runtime/race/preflight | G2 + WAVE2_BASE_SHA 後，Coordinator 登記 transfer SHA；D/最終接線前 A 停寫並 handoff |
| W2/B1–B2：HUD controller / panels | 同 W1/B0 路徑 | 僅 G2 + WAVE2_BASE_SHA 後；B 接手完整 metadata/native adapter 與 OverlayView composition，root 只接 Shell |
| B2-panel（Luna） | 僅 B handoff 列明的三個新 panel 檔案；其餘測試/CSS/controller 仍由 B 持有 | B1 props freeze，具名檔案由 B 移交且停止寫入；B2 handoff 後才交回 B |
| C：Settings | `frontend/src/features/settings/**` | G2 完成後 |
| D：Tune / Road | `frontend/src/features/tuning/**`、`frontend/src/features/road/**` | A foundation 已整合，且 Coordinator 釋放 W1 的 Tune state adapter 後 |
| Reviewer | 唯讀上述程式、diff、handoff、測試結果 | 不自行修復作者檔案 |

沒有列出的檔案不是自由寫入範圍。每個任務可讀其依賴；需要越界變更時先提出受影響 consumer、最小 API 差異與理由，Coordinator 處理。這是內部 ownership 協調，不預設要再向使用者申請常規修復。

W1 曾把 Tune state、Road state、Sessions/Live A0、HUD B0 最小前置分給 Terra 子代理，並未啟動 W2 面板拆分或 W3 遷移。目前寫入 lease 由 execution.md 登記；Coordinator 依交接快照逐一重新指派，不覆蓋現存草稿。共享 Shell、公開契約與最終接線始終由 Coordinator 持有；C 尚未接手前的 SettingsSurface 薄 adapter 也由 Coordinator 管理。

Locales 統一由 Coordinator 寫。各 lane 在自己的 handoff 提供 key、英文原文、繁中/日文建議與用途，沿用既有 key 優先。`lang/zh-tw.json` 包含大小寫相異的鍵；驗證使用大小寫敏感的 JSON parser，不能用會合併鍵的處理方式。

## 2. 任務登記與分支安排

| 任務名稱（預定） | 模型/思考起點 | 形式 | Branch（預定） | 啟動條件 |
| --- | --- | --- | --- | --- |
| 前端 IA：共用 Shell 與契約 | 本對話 Coordinator | 保留本任務 | 現存 `codex/frontend-ia-contracts-20260914`、`codex/frontend-ia-shell-20260914` | 恢復實作後先核對 G0-code、既有 W1 差異 |
| W1：Tune / Road / Sessions / HUD 狀態前置（歷史執行模型） | `gpt-5.6-terra` / xhigh（歷史執行模型） | 獨立 worktree 子代理 | 現存分支見 execution.md | 核對 G0-code，指定各自 BASE_SHA；一次最多三條子代理寫入 lane |
| 前端 IA：Sessions 與 Live | `gpt-5.6-luna` / high | 子代理 A；可依使用者要求建立獨立任務 | `codex/frontend-ia-sessions-20260913`（預定） | G2、WAVE2_BASE_SHA |
| 前端 IA：HUD 控制與面板拆分 | `gpt-5.6-luna` / xhigh | 子代理 B；可依使用者要求建立獨立任務 | `codex/frontend-ia-hud-20260913`（預定） | 同上 |
| 前端 IA：Settings 能力與設定面板 | `gpt-5.6-luna` / high | 子代理 C；可依使用者要求建立獨立任務 | `codex/frontend-ia-settings-20260913`（預定） | 同上 |
| 前端 IA：Tune 與 Road 結果整合 | `gpt-5.6-luna` / xhigh | 子代理 D；可依使用者要求建立獨立任務 | `codex/frontend-ia-validation-20260913`（預定） | Shell + A foundation 已接線、A-D 介面 freeze、指定 BASE_SHA |
| 前端 IA：整合驗收 | Coordinator + Luna reviewer | 本對話 + 短期唯讀子代理 | `codex/frontend-ia-acceptance-20260913` | A/B/C/D 接線完成 |

思考起點不是上限。Luna 可依問題提升至當時工具列出的支援等級；複雜 shared 架構、跨 lane 協調與產品取捨由 Coordinator/root 直接處理。子任務不要再建立新的使用者任務；若需要短期 Luna 子代理，先劃分它獨占的新檔案範圍。

規劃 worktree 已存在於 `D:/FH6-frontend-ia-20260913/plan`。後續子對話使用獨立 worktree，記錄工具實際回傳的路徑；不假設新任務會自動使用此 plan 路徑。Git 專案預設以 worktree 建任務，先確認 branch/head，將 lane branch 對齊指定 BASE_SHA 才寫碼，不共用 main checkout。

派發前資料必須具體：Task/Agent ID、Owner、Model、Thinking、Worktree、Branch、BASE_SHA、CONTRACT_SHA、AllowedPaths、Gate、HandoffPath。不存在的使用者任務 ID 填「未建立」，不可拿子代理名稱冒充 Task ID。若計畫文件還未合併到 main，Coordinator 提供可讀的文件絕對路徑或 planning commit；不可叫新任務讀不存在的相對路徑。

## 3. 共用派發前綴

派發子代理或經要求建立獨立任務時，將本段與該 lane 工作單合併為一則自足描述，填入登記資料。不要僅傳「按照附件執行」。

```text
你負責 FH6-HorizonTuner 前端資訊架構重構的指定 lane。
先讀本輪執行計畫、baseline、acceptance、你的工作單及 Coordinator 提供的 exact BASE_SHA/CONTRACT_SHA。
本任務僅實作該 lane；以實際工作目錄核對 HEAD、git status、ownership。
閱讀 .agents/AGENTS.md、rules/workspace.md、rules/testing-strategy.md、rules/ui-architecture.md、skills/README.md，再按工作單載入相關 SKILL.md。
若遇他人 dirty 變更，保留並回報；禁止 reset/clean/覆寫。
僅寫本 lane AllowedPaths，不改 shared contracts、locale、App.css、context、backend、Tauri 或 HUD renderer。
API、persistence schema/key、調校公式與 HUD renderer contract 保持。
共享介面不合用時提出具體 contract request，由 Coordinator 解決；先做不依賴該變更的工作。
UI 使用 Halfmoon semantic tokens；覆蓋面板使用 ModalPortal；不加裝飾 emoji。
非同步操作必須明確區分 page reads、持久 writes 與跨頁 runtime，不在 unmount 後覆蓋較新的使用者操作。
新增測試聚焦純邏輯與狀態，不新增 DOM/Canvas 微觀斷言，不只搬動舊 snapshot。
每個可交付 head 執行完整 frontend test、build、git diff --check；記錄命令、exit code、SHA、警告及未測範圍。
交付精確 changed files、commit/diff、contracts consumed/requested、locale requests、風險及下一步。
把 handoff 寫入 Coordinator 指定的本 lane artifact；停止寫入後設為 handoff。
不要修改總計畫或 Journal，不自行 merge/main push，不建立額外實作子對話。
```

共通實作技能：`cross-agent-collaboration`、UI 工作的 `halfmoon-design-system`。A/B/D 與 Shell 再讀 `huge-component-refactoring`、`modular-refactoring`；C 若建立純能力分層則讀 `modular-refactoring`。建立 PR 才讀 `pr-author-maintainer`，審核他人 PR 才讀 `pr-review-evaluation`；本計畫不委派 Jules 或 Antigravity。

## 4. 工作單 A：Sessions / Live

**交付目標**：Full 從頂層開啟 Sessions；Live 僅 Dashboard/Launch Test；Analysis 的 current/latest/saved、lap compare、MoTeC、debrief、track map 全部可達。Lite 沿用 Dashboard-only 能力。

W2 寫入邊界以以下表格覆蓋 W1/A0 的寬路徑；prefix 均為 `frontend/src/features/`。派發前 Coordinator 記錄 transfer SHA、實際檔案與 handoff，沒有登記就不發 lease。

| Owner | 精確範圍 |
| --- | --- |
| A | `live/LiveWorkspace.tsx`、`analysis/**`、`telemetry/**`、`drag_test/**`；`sessions/SessionsWorkspace.tsx`、`sessions/SessionsStateProvider.tsx`、`sessions/sessionsIo.ts`/`.test.ts`、`sessions/sessionSelection.ts`/`.test.ts`。新增 Sessions presentation 檔案先在派發紀錄具名。 |
| Coordinator | `sessions/SessionsRuntime.tsx`、`sessions/raceCompletion.ts`/`.test.ts`、`sessions/raceLifecycle.ts`/`.test.ts`、`sessions/raceStatusPoller.ts`/`.test.ts`、`sessions/raceNavigationHandoff.test.ts`、`sessions/sessionIntentPreparation.ts`/`.test.ts`，以及全部 App/Shell 接線。 |

A 可讀上述 root 檔案並消費凍結的 guard/intent，不更改 background observer 或 navigation lifetime。selection/provider 的 public export 若須改動，先由 Coordinator 審核 contract/consumer；依記錄逐檔移交，不讓兩者同時寫入。

1. 接手 P2 的最小 Live/Sessions adapters，核對 immutable shared contract。
2. 改善 Sessions 選擇初始化：明確 intent 優先，普通往返保留同一 session/lap，晚回應不能重置新選擇。需要 recorder context 修改時交給 Coordinator。
3. 將 Analysis 拆成可讀的 library/header/actions/summary/comparison/track sections；沿用現有 math，不新增調校公式。只有實際抽出純運算才加 selector/math tests。
4. 消費已凍結的 race completion/intent；background observer、guard 與導航接線由 Coordinator 保管。有新需求提出具體 contract request，不重做已完成的 callback 縮窄。
5. 清理 page interval/channel/observers，保留原 Canvas 語意、granular units、HUD pause 與 Drag behavior。
6. 列出插入 Validation review 的 typed slot/adapter 需求；只建立可用的接點，不假造 Road domain 對應。

**交付 exports**：LiveWorkspace、SessionsWorkspace、selection/intents 邊界（最終名稱依 G1），以及供 D/Coordinator 接入結果 review 的接點。

**必要驗收**：acceptance 的 L、S、X 項；latest 成功/失敗、A→B 快速切換、離頁後回應、import→離頁→返回、current recording refresh、保存/刪除/比較/所有 MoTeC 操作。不得宣稱 wrapper 本身完成 Sessions 全部重構。

## 5. 工作單 B：HUD

**交付目標**：HudWorkspace + controller + Setup/Layout/Advanced；所有既有樣式與 S650/WIP 能力保留。外部 HUD 在設定頁卸載後持續運作。

1. W1/B0 先處理 authoritative config、serialized patch queue、pending write 跨頁存活與 remount 不禁用 HUD；這是 G2 前置。W2/B1 接手後才完善 capability map、metadata、typed native adapter 與 controller 分層；對 persisted config、GET 衍生欄位與 UI view-model 分界，不改跨端 schema。
2. 定義設定寫入序列、合併/正規化、失敗回復與重新抓權威值。保存成功需要真實回應，不能僅以 fetch 未 throw 判定。
3. page fetch 加取消或 generation guard；page channel cleanup；保存中的更新與 launch/close 命令具可 await 語意，離頁不能丟棄使用者已提交的更新。
4. B2 拆 Setup/Layout/Advanced、composition 與 scoped CSS。Luna 可另接新 panels 檔案，B 持有 controller/OverlayView；禁止兩者同時編輯 OverlayView 或共用契約。
5. 保留 author cache/style discovery、WIP、monitor、click-through、reload、audio、units、reset、S650 normalization；沒有 renderer 證據的控制項不臆測 capability。
6. 先保留現有 reset 預設與 audio endpoint 語意；發現既有缺陷分開記錄。native 不可用時顯示實際能力，不將 config saved 當成視窗已啟動。

**必要驗收**：acceptance 的 H、X 項；快速 slider 更動、失敗/慢回應、切 style 同時收到 server config、離頁仍開 HUD、重入沒有 duplicate UI channel、Full/Lite native 全流程。B 不負責修 renderer 或 backend。

## 6. 工作單 C：Settings

**交付目標**：使用 ModalPortal 的 SettingsSurface，讀取既定能力契約；Lite 不顯示 Developer Tuning 控制項。

1. 保留 SettingsView 或使用相容 export，直到 Coordinator 接好 AppMenu；不可讓功能暫時無入口。
2. 按 General/Telemetry/Integrations/Maintenance 組織內容；不重寫已有 settings persistence 或 queue。
3. 保留語言、各類單位、telemetry port/forwarding、dyno/race recording、Discord、MCP、update、storage。不能因其看似進階就隱藏 Lite 項目。
4. surface 接收 close 與能力；Appearance/Diagnostics/Updates 等跨 app actions 使用窄 callback，Coordinator 接線。
5. 替換綁死舊三欄 JSX 的 SettingsLayout.test；新測試驗證 section/capability projection。原有 persistence/queue/service tests 繼續跑，不用移除測試掩蓋功能缺失。
6. 文字與 style 需求列入 handoff，不直接修改 lang 或 App.css。不擴大處理 baseline 記錄的 backend/SettingsContext 既有問題。

**必要驗收**：acceptance 的 C、U、X 項；Full/Lite 打開、關閉、Esc/focus、窄視窗、深淺主題、overlay 不推擠 Live grid、原設定可達。WIP HUD 不隨 Developer Tuning 項目隱藏而被意外禁用。

## 7. 工作單 D：Tune / Road → Sessions

**交付目標**：Tune 保留四步與驗證流程，歷史資料從 Sessions 檢視；analysis session 與 Road workflow 維持不同 ID/資料源。

1. 確認 Shell + A foundation 已整合，核對 `A_FOUNDATION_SHA`、`AD_INTERFACE_SHA`、review slot 型別、workflowId 語意與返回 Tune callback；這是 D 開工前的 parent，不要求尚未產生的 D export。沿用 P2 的 Tune/Developer state 保留方案。只有 W1 狀態前置可早於此 gate，不能把它當成 D 已開工。
2. 將 Road history review 需要的 library/detail/actions 抽出為 export；不得直接修改 A 的 sessions 檔案。
3. start/record/prepare 保留 Tune；歷史中的 comparison、accept/revert/draft 等既有結果操作逐一列 ownership 與入口，不能以唯讀化名義刪除。
4. 輸出 onOpenSessions 或 typed workflow ref callback；Coordinator 把 D export 接入 Sessions，記錄後續 `AD_INTEGRATION_SHA` 並驗證舊資料可達後，才移除 reviewHistory fallback。
5. 保留 `road-selected-workflow`、已存 documents、input snapshot、四步 restore/readiness、非 Road compatibility；不改 physics math 或允許它繞過既有 validation gating。
6. 只掛載一個 active Road 編輯/controller；Sessions review 不啟動第二條錄製。離開 Tune 的未完成 run、回到 Tune 的 setup/engine 選擇要明確恢復。

**必要驗收**：acceptance 的 T、R、S、X 項；既有 Road report、進行中 workflow、accept/revert/draft、非 Road snapshot、main/developer 切換與跨頁回來。Coordinator 負責 Sessions 接線及共享檔案。

## 8. Reviewer 工作單

使用 Luna，預設 high/xhigh，唯讀。以同一 BASE_SHA、實際 head SHA 和 diff 檢查 ownership、契約 consumer、狀態保留、async ordering、lifecycle、variant、測試與未測範圍。找可重現的行為問題，不以檔案大小或名稱當缺陷。

回覆 findings 必須含檔案/行號、觸發情境、影響及最小修正方向。若無 findings 明說已檢查範圍，仍保留 native/runtime 證據限制。若需要修改，由 Coordinator 派回原 owner 或正式轉交；reviewer 不搶寫。

## 9. Handoff 與狀態更新

正式 lane handoff 統一寫本 worktree 的 `docs/frontend/ia-refactor-20260913/handoffs/<lane>.md`，與該 lane 提交；scratch 只放 log 和暫存。Coordinator 讀取後把可靠結果彙整至 execution.md；各 lane 不改總計畫或 Journal。現存 Tune/Road/Sessions/HUD handoff 保留原位置；最新提交、獨立審查與下一步由統一快照承接，不能沿用作者 handoff 中審查前的接線建議。

```text
Task:
Status: proposed | active | blocked | handoff | done
Owner / Task ID / Model / Thinking:
Worktree / Branch:
Base SHA / Head SHA / Contract SHA:
Write ownership / Transferred paths:
Changed:
Contracts consumed / requested:
Locale requests:
Verification: command, exit code, tested SHA, result, evidence path
Native / game evidence: pass | fail | not-run + reason
Risks / Pending / Blocked by:
Next action:
Last updated:
```

`handoff` 表示作者已停寫；不表示已 merge。`done` 必須同時滿足 lane 實作、Coordinator 接線、指定驗收與必要文件；規劃交付已完成；程式 lanes 依實際驗證逐一登記，不提前標 done。
