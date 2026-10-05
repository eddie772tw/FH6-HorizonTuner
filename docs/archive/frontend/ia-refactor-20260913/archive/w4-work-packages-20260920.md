# 已封存：原 W4 工作包與執行指令

> **superseded（2026-09-20）；不是目前工作單。** W4-0/P7/P8 已交付，請從 [交付索引](../handoffs/w4-plan-20260920.md) 及 [P8 handoff](../handoffs/w4-p8-candidate-20260920.md) 接續。以下逐字保留原計畫自「W4 工作包與依賴」起的歷史內容；其授權／ownership／next action 不自動延續。

來源：candidate `88cf28e6152c125c1cca18dc21c3c1f46e4fbcff` 的 `handoffs/w4-plan-20260920.md`；原檔 blob `aaf9e43f7f20c7a25710c1edf2c84c8199ee6bb6`。草稿內 `4e24fac` 起點已被實際 [W4-0 lock](../handoffs/w4-0-acceptance-ledger-20260920.md) 的 `147981c3ea0d68f146e0b2400d147e2346d7930e` 取代。原生／game／X3／G5 限制仍有效；封存不代表這些 gate 已通過。

## W4 工作包與依賴

### W4-0：候選鎖定與 acceptance ledger

**Owner：Coordinator/root。**

1. 從 `4e24fac` 建立 `codex/frontend-ia-w4-20260920` 與獨立 worktree；記錄 `BASE_SHA`、`CONTRACT_SHA`、整合來源與 dirty paths。
2. 在 ledger 中逐項登記 C/L/T/S/R/H/U/X 的目前結果：`pass`、`fail` 或 `not-run`，每項包含環境、步驟、觀察、artifact、owner、時間與下一步。
3. 重新跑整合 head 的 frontend gate，只有在 W4 有程式變更時才擴跑受影響的 backend/tool gate；不沿用未在 exact head 重驗的舊綠燈。
4. 本包完成後先 commit/push，才放行其他 W4 work package。

出口：新 W4 branch 與 worktree、可追溯 ledger、乾淨的 baseline commit。

### W4-P7-A：相容層與單一 state owner 審計

**建議 owner：Astra xhigh（複雜 async/lifecycle lane）；Coordinator 持有 shared/App 接線。**

建議 allowlist 先限定在下列現有 feature 檔案，若需要跨檔先提出 contract request，不搶寫 shared Shell：

- `frontend/src/features/tuning/TuningView.tsx`
- `frontend/src/features/tuning/TuneSessionProvider.tsx`
- `frontend/src/features/road/RoadValidationController.tsx`
- `frontend/src/features/road/RoadWorkflowView.tsx`
- D review 相關既有 consumer（實際路徑以開工時 `rg` inventory 為準）

工作順序：

1. 建立 `adapter register`：每個 wrapper/prop 的 consumer、存活範圍、保留理由、移除條件、測試與 owner。
2. 先以 R1/R3/R4/R5 受控 fixture 驗證 Sessions review 能開舊 workflow、讀 documents、執行 decision、返回 Tune 並保留未完成 workflow；驗證前不刪 `reviewHistory`。
3. 以 T1–T4 的 restore/readiness/identity 測試與瀏覽器往返確認 Tune provider 沒有第二個 step owner，再處理 `TuneSessionBoundary`、`RoadValidationBoundary` 與 `currentStep` compatibility。
4. 對晚回應、切換 workflow、pending mutation、capture/save identity 只修正可重現的 ordering 問題；不改 backend schema、tuning formula、Road active controller 或既有 persistence key。

出口：每個 adapter 都是 `removed` 或有具名保留理由；R/T 回歸測試與瀏覽器 evidence 更新；完成一個可單獨回退的 commit/push。

### W4-P7-B：瀏覽器 resource/lifecycle matrix（X1）

**建議 owner：Coordinator；可由 Luna 執行不涉及程式決策的操作記錄與 evidence 整理。**

只使用 Full/Lite web entry 與隔離 fixture，實際操作：

- Live ↔ Tune ↔ Sessions ↔ HUD 往返，含 Sessions library/detail/empty/error 與 Road review return。
- Settings、Updates、Data Out、Diagnostics、Theme 的開啟、關閉、Escape、再進入。
- HUD Setup/Layout/Advanced 切換、快速 patch、pending save、離頁再入；不操作 Tauri/native window。
- backend fixture disconnect/reconnect、延遲 response 與 page re-entry；只關閉本輪自己啟動的程序。

記錄 page timer、BroadcastChannel、listener、canvas/recorder subscription 的建立與釋放；重複往返後不得持續增長。瀏覽器觀察只可證明 web page/resource lifecycle，不能延伸成 external HUD 或 native resource pass。

出口：X1 evidence 含 Full/Lite、次數、觀察值、fixture、限制與未測 native 邊界。

### W4-P7-C：瀏覽器 UI 組合矩陣（X2、部分 C/U/H/R）

**建議 owner：Coordinator；Luna 可做固定步驟的矩陣執行與文件整理。**

- Full/Lite：入口、禁用 workspace、App Menu、Settings/Updates、Sessions/Road review、HUD 三分頁均可達。
- `dark/light × default/modern/elegant`，至少窄視窗約 390px 與桌面寬度；檢查不水平溢出、不推擠 Live/60Hz grid、modal/popover layering 正確。
- 鍵盤 tab/focus、Escape 關閉、焦點回復、空狀態/錯誤/Loading/stale-response 文案可理解。
- 所有觀察記錄「browser only」；不把按鈕存在、config saved 或 Web fallback 當作 native 成功。

出口：X2 與受影響的 C1/C2/C4/U1/U2/H1/H2/H6/R1/R3/R4 browser evidence；任何 backend/native 缺口保持 `not-run`。

### W4-P7-D：候選前的效能與量測準備（X3 pre-G5）

**Owner：Coordinator/root；必要時由 Astra xhigh 設計量測邊界，不能由簡單腳本自行解釋回歸。**

1. 固定 W4 candidate SHA、build mode、OS/CPU/GPU、視窗大小、theme、資料源、HUD style、backend port 與工具版本。
2. 先保存可重測的 browser/fixture baseline；情境至少含 idle/disconnected、Live synthetic telemetry、Sessions、HUD page、固定往返。
3. 每組 baseline/candidate 至少三次、暖機 30 秒、觀測 60 秒；分列 WebView、backend 與（若尚未可用則標為 `not-run`）外部 HUD 的 CPU/RSS/working set、切頁時間與 frame/drop 指標。
4. 本階段只完成可重測 artifact 與方法；沒有 native/external HUD/真實 FH6 時，不把 X3 標成 final pass，也不宣稱改善百分比。

出口：X3 measurement protocol、baseline artifacts、候選 measurement placeholder 與未測原因；可在最後實機 gate 直接重跑。

### W4-P8：整合固定與文件同步

**Owner：Coordinator/root；唯讀 reviewer 可用 Astra xhigh；Luna 只處理固定格式的 handoff/連結檢查。**

1. 在同一 W4 integration head 完成 frontend test/build/diff-check 與 browser-only Full/Lite smoke。
2. 更新 `w4-plan` 的實際 commit、acceptance ledger、adapter register、X1/X2/X3 evidence 路徑與 remaining boundaries。
3. 檢查 README、README.en、架構/hand-off 文件與實際 workspace registry、provider ownership 一致；只同步已驗證事實。
4. 推送 W4 integration branch，`git ls-remote` 核對 SHA；不合併 `main`，不以 branch clean 或 CI 綠燈取代 G5。

出口：W4 candidate branch、完整 browser evidence、可供最後實機驗收直接接手的 G5 checklist；仍缺的 native/game/performance 項目明列 owner 與取得方法。

## 建議執行順序

```text
W4-0 candidate lock
  ├─ W4-P7-A adapter/state-owner audit (Astra xhigh)
  ├─ W4-P7-B browser lifecycle inventory (Coordinator + bounded Luna)
  └─ W4-P7-C browser UI matrix (Coordinator + bounded Luna)
          ↓
     W4-P7-D measurement preparation
          ↓
     W4-P8 integration/document freeze
          ↓
     最後實機 gate：Tauri/native + real FH6 + MoTeC/HUD + final X3/G5
```

P7-A 的 feature 檔案與 P7-B/C 的 evidence/docs 可以平行，但任何 Agent 不得同時寫相同檔案；Coordinator 的 App、shared context、locale、README 與整合分支由 root 單獨持有。每個可交付階段都先寫 handoff、跑對應驗證、commit、push，再釋放 ownership。

## 最後實機驗收的明確入口

W4 完成後才進入下列不屬於本輪 browser-only 目標的 gate：

- Full/Lite Tauri 啟動、backend-ready、dynamic port、StrictMode、theme 首幀與實際導覽（C1–C5）。
- Windows HUD monitor enumerate/move、launch/close、click-through、reload、audio，以及 HUD 離頁/重入（H3/H5）。
- 真實 FH6 UDP/Live、race completion/latest、Tune capture 中跨頁、Road start/record/finish、MoTeC open/import/export（L1–L3、S3、R2、T3）。
- 固定環境的三次 baseline/candidate 成對量測與任何可重現的 >10% regression 說明（X3）。
- 同一候選 head 的 Full/Lite/native smoke、文件一致性與 reviewer sign-off（X4/G5）。

缺少裝置、遊戲或 native surface 時，該項維持 `not-run`，不可用 browser screenshot、mock、config saved 或 build success 代替。

## 每階段 commit/push 與停止條件

- W4 計畫文件：`docs(w4): record pre-acceptance implementation plan`。
- 每個 P7 子包使用獨立 commit，訊息包含 scope；push 後以 `git rev-parse HEAD` 與 `git ls-remote origin <branch>` 核對。
- 發現外來 dirty path、共享檔 ownership 衝突、backend schema 需求、無法重現的行為或 native-only 阻塞時，停止該子包並寫 handoff，不 reset、clean、stash 或覆寫他人變更。
- W4 完成的定義是：程式/adapter 處理已接線、browser evidence 可重現、X1/X2/X3 preparation/X4 文件狀態完整；它不等同最後實機驗收完成。
