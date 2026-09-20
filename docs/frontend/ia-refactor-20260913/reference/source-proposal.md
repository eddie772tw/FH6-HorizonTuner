# FH6-HorizonTuner 前端資訊架構精簡與多代理並行重構實作計畫

> Repository: `eddie772tw/FH6-HorizonTuner`
> Plan status: `proposed`
> Plan date: `2026-09-13`
> Primary scope: Full / Lite React frontend information architecture, workspace shell, navigation, Sessions consolidation, HUD UI decomposition, Settings capability filtering
> Default integration target: `main`
> Planning principle: **contract-first → controlled fan-out → sequential integration → evidence-based cleanup**

---

## 0. 文件目的

本文件是本次前端資訊架構重構的**單一開發實作計畫（Single Implementation Plan）**。它不是概念提案，也不是單一 PR 的 task list；它應足以讓主代理（Coordinator / Parent Agent）、subagent、Codex、Antigravity、Jules 或其他 coding agent 在不同 branch / worktree 中，依照明確 ownership、依賴關係與驗收條件進行結構化甚至並行式開發。

本計畫的核心目標不是「把所有 UI 全部重寫」，而是：

1. 將頂層資訊架構收斂為少量清楚的工作區；
2. 讓 Feature 自己擁有自己的內部流程狀態；
3. 消除 App Shell / Navigation 對 Feature 細節的過度認知；
4. 統一 Full / Lite 的應用程式 Shell 與 capability 模型；
5. 將 Post-Race Analysis、Validation Runs、Road A/B comparison 收斂為一致的 Sessions 心智模型；
6. 將 `OverlayView` 等巨型 UI 元件拆成 controller + panels + pure contracts；
7. 讓非作用中工作區真正 unmount，而不是只以 CSS `display: none` 隱藏；
8. 在不改變既有 backend API、HUD renderer contract、調校公式與資料 schema 的前提下完成 migration。

---

## 1. 必須遵守的專案治理與技能 Gate

每一個實作 Agent 在開始修改程式碼前，必須依 `.agents/AGENTS.md` 與 `.agents/skills/README.md` 的 on-demand loading 規則讀取任務相關規範。

### 1.1 本計畫預期觸發的 canonical skills

| Skill ID | 觸發範圍 | 本計畫中的主要用途 |
|---|---|---|
| `huge-component-refactoring` | >250 行 UI、Telemetry / Overlay 巨型元件、60Hz 渲染路徑 | `TelemetryView`、`OverlayView`、`AnalysisView` 拆分與 lifecycle 保護 |
| `modular-refactoring` | TypeScript 模組邊界、typed contract、domain / controller 分層 | App Shell、capability manifest、navigation contract、HUD controller |
| `halfmoon-design-system` | UI、Halfmoon、panel、form、button、glassmorphism | 新 Workspace Shell、Settings surface、HUD panels、popover / modal 合規 |
| `cross-agent-collaboration` | 多代理、worktree、ownership、handoff | 本計畫所有並行 Wave 的協作治理 |
| `pr-author-maintainer` | 建立與維護 PR | 每一個實作 PR 的作者流程 |
| `pr-review-evaluation` | 審查並行 Agent / Jules PR | Coordinator / Reviewer 驗收其他 Agent 產出 |
| `jules_coding` | 若明確委派 Jules | Jules session / PR 的 provenance 與本地驗收 |

若某個子任務只做 read-only 分析，不進行程式碼修改，可以只讀取足以完成分析的規範；一旦進入 write scope，就必須完整遵循上述對應 skill。

### 1.2 必須遵守的規範

- `.agents/AGENTS.md`
- `.agents/rules/workspace.md`
- `.agents/rules/testing-strategy.md`
- `.agents/rules/ui-architecture.md`
- `.agents/skills/README.md`
- 實作時按需讀取上述 canonical skill 的 `SKILL.md`

### 1.3 本計畫禁止事項

- 不以本次 UI 重構為名改動車輛物理公式。
- 不在 UI component 內新增物理換算公式。
- 不更動 Forza UDP packet layout。
- 不把未驗證的 Agent 建議直接寫成 `.agents` 長期規則。
- 不讓兩個 Agent 同時修改同一個 shared integration file。
- 不使用 destructive Git 指令清掉別人的 dirty worktree。
- 不以 brittle DOM / Canvas 微觀呼叫次數測試來鎖死重構自由度。
- 不為了完成重構而引入新的 routing framework；除非後續有明確 deep-link / URL routing 需求並另行評估。
- 不改變 backend endpoint contract，除非形成獨立 proposal 並從本計畫切出去。

---

## 2. 現況問題摘要

目前前端主要存在以下結構性問題。

### 2.1 頂層 Navigation 與 Feature 內部 navigation 重複

目前全域 Navigation 已知道：

- Telemetry 的 `live / analysis / drag`；
- Tuning 的多步驟流程；
- HUD 的 `general / displays / gauges / performance`；
- Settings。

但 Telemetry 與 Tuning 本身又各自有內部 tab / stepper，因此同一組 state 被 App、Navigation 與 Feature 同時理解。

### 2.2 `App.tsx` 管理過多 Feature-specific state

目前 root shell 直接持有：

- `activeTab`
- `telemetrySubTab`
- `tuningStep`
- `developerTuningStep`
- `overlayCategory`
- `showLogs`
- `showTheme`

其中 `handleSubTabJump(..., subTarget?: any)` 讓不同 Feature 的字串 / 數字狀態經同一個 untyped 通道流動，增加耦合與錯誤風險。

### 2.3 HUD category routing 是 dead / ineffective state

`App.tsx` 與 `LiteApp.tsx` 都維護 `overlayCategory` 並傳給 `OverlayView`，但目前 `OverlayView` 並未真正消費 `category / setCategory`。這類 state 應先移除，而不是在新的架構中繼續保留。

### 2.4 Post-Race Analysis 與 Validation history 被拆成兩套心智模型

現在：

- 一般 Session 分析位於 Telemetry → Post-Race Analysis；
- Tuning 又以 `reviewHistory` 切換到 `RoadWorkflowView`；
- `RoadWorkflowView` 自己再有 prepare / drive / results。

對使用者而言，這些其實都屬於「已記錄資料 / 比較 / 驗證結果」。

### 2.5 Full / Lite Shell 漂移

Full 與 Lite 各自維護：

- App root；
- Navigation；
- active tab；
- HUD category state；
- workspace rendering。

Lite 又直接重用完整 `SettingsView`，造成例如 Developer Tuning 等 Full-only 設定有機會出現在 Lite。

### 2.6 Full 版所有主要 View 長期 mounted

Full 目前以 `display: none` 隱藏非作用中頁面，而非條件 mount。這使隱藏頁的 effect、BroadcastChannel、monitor / audio device fetch、timer、observer 等 page-level lifecycle 仍可能長期存在。

### 2.7 `OverlayView` / `AnalysisView` 等 component 職責過重

`OverlayView` 同時處理：

- HUD config fetch / save；
- Tauri window command；
- monitor control；
- audio device；
- BroadcastChannel；
- style / author metadata；
- WIP HUD；
- S650-specific options；
- 所有 layout / scale / opacity / color form UI。

這已超出合理 View Container 的職責。

---

## 3. 目標資訊架構

### 3.1 頂層工作區

Full 版目標頂層只保留四個主要 Workspace：

```text
FH6 HorizonTuner    Live    Tune    Sessions    HUD                    ● Connected   ⋯
```

Settings 不再作為主要工作區，而改為 App-level surface，由右上角 App Menu 進入。

### 3.2 Workspace 定義

| Workspace | 使用者問題 | 核心內容 |
|---|---|---|
| `Live` | 「車現在發生什麼？」 | 即時遙測 dashboard、車況、Launch / Drag Test |
| `Tune` | 「我要怎麼調這台車？」 | 四階段 tuning workflow |
| `Sessions` | 「剛剛 / 過去跑得怎樣？」 | Race sessions、lap comparison、MoTeC、Validation runs、Road A/B |
| `HUD` | 「我要在駕駛時看到什麼？」 | HUD style、preview、layout、advanced controls |
| `Settings` | 「應用程式本身怎麼運作？」 | Language、units、telemetry transport、integrations、updates、storage、developer options |

### 3.3 Live 內部結構

```text
LiveWorkspace
├── LiveHeader
├── LiveModeSwitch
│   ├── Dashboard
│   └── Launch Test
├── TelemetryDashboard
└── DragTestPanel
```

`Post-Race Analysis` 不再屬於 Live。

### 3.4 Tune 內部結構

保留現有四步 progressive disclosure：

```text
1. Goal & Setup
2. Chassis & Tires
3. Engine Data & Gearing
4. Setup Verification
```

這四步是 Feature 內部 state，由 Tune 自己管理。全域 Navigation 不再知道 Tuning 有幾步。

### 3.5 Sessions 結構

```text
SessionsWorkspace
├── SessionLibrary
├── SessionHeader
├── SessionSummary
├── LapComparison
├── TrackAnalysis
├── ValidationRuns
└── SessionActionsMenu
```

建議 UI 心智模型：

```text
┌ Session Library ─────────┬ Session Details ─────────────────────┐
│ Current / Latest         │ Summary | Laps | Compare | Validation│
│ Saved Session A          │                                      │
│ Saved Session B          │ Track Map / Lap Delta / Debrief      │
│ Road A/B Validation      │                                      │
│ Imported MoTeC           │                                      │
└──────────────────────────┴──────────────────────────────────────┘
```

### 3.6 HUD 結構

```text
HudWorkspace
├── HudHeader
├── HudPreview
├── SetupPanel
├── LayoutPanel
└── AdvancedPanel
```

建議 panel：

- **Setup**：Launch / Close、HUD style、monitor、global scale、units、author info。
- **Layout**：element visibility、position、offset、size、opacity、preview。
- **Advanced**：colors、glow、audio device、performance options、style-specific advanced options、WIP controls。

---

## 4. 目標程式架構

### 4.1 建議目錄

```text
frontend/src/
├── app/
│   ├── AppShell.tsx
│   ├── AppHeader.tsx
│   ├── AppMenu.tsx
│   ├── AppStatus.tsx
│   ├── appVariant.ts
│   ├── workspaceManifest.ts
│   └── workspaceTypes.ts
├── features/
│   ├── live/
│   │   ├── LiveWorkspace.tsx
│   │   └── LiveModeSwitch.tsx
│   ├── telemetry/
│   │   └── ...existing dashboard components...
│   ├── drag_test/
│   │   └── ...existing launch test...
│   ├── tuning/
│   │   └── TuningWorkspace.tsx / existing step components
│   ├── sessions/
│   │   ├── SessionsWorkspace.tsx
│   │   ├── SessionLibrary.tsx
│   │   ├── SessionDetails.tsx
│   │   ├── SessionActionsMenu.tsx
│   │   └── sessionSelectors.ts
│   ├── analysis/
│   │   └── ...existing analysis primitives during migration...
│   ├── road/
│   │   └── ...existing validation workflow...
│   ├── overlay_control/
│   │   ├── HudWorkspace.tsx
│   │   ├── useHudController.ts
│   │   ├── hudCapabilities.ts
│   │   ├── panels/
│   │   │   ├── HudSetupPanel.tsx
│   │   │   ├── HudLayoutPanel.tsx
│   │   │   └── HudAdvancedPanel.tsx
│   │   └── ...existing HUD-specific config...
│   └── settings/
│       ├── SettingsSurface.tsx
│       └── ...existing settings components...
```

不要求一次將所有舊路徑 move 完。優先採 compatibility wrapper / re-export 方式減少單一 PR 的 rename churn。

### 4.2 Root App state 最終應收斂為

```ts
type WorkspaceId = 'live' | 'tune' | 'sessions' | 'hud';
```

App-level state 原則上只保留：

- active workspace；
- app-level overlay / modal（Settings、Diagnostics、Appearance、Update）；
- global provider-owned state。

Feature 內部 state owner：

| State | Owner |
|---|---|
| `activeWorkspace` | `AppShell` |
| Dashboard / Launch Test | `LiveWorkspace` |
| tuning step | `TuningWorkspace` |
| selected session / lap / compare lap | `SessionsWorkspace` |
| HUD panel | `HudWorkspace` |
| HUD config | `useHudController` / backend persistence |
| settings values | `SettingsContext` |
| telemetry stream | existing telemetry provider |
| race recorder | existing recorder provider |

### 4.3 App Variant / Capability contract

建立明確的 variant contract，不再由 UI 自己猜「現在是 Full 還是 Lite」。

建議：

```ts
export type AppVariant = 'full' | 'lite';

export interface AppCapabilities {
  workspaces: readonly WorkspaceId[];
  tuning: boolean;
  sessions: boolean;
  developerTuning: boolean;
}
```

最低限度 capability：

| Capability | Full | Lite |
|---|---:|---:|
| Live | yes | yes |
| Tune | yes | no |
| Sessions | yes | no |
| HUD | yes | yes |
| Developer Tuning option | yes | no |

其他 backend-level Settings（MCP、updates、storage、Discord、telemetry transport）是否於 Lite 隱藏，不在本計畫中自行推論；只有確認為 Tune-only 的設定才直接以 capability 過濾。

---

## 5. 關鍵架構決策

### 5.1 不先導入 routing framework

第一階段不導入 React Router 或其他新依賴。現階段沒有 URL deep-link、browser navigation history 或 external route requirement，typed workspace state 即可。

如未來出現：

- deep link 到 session；
- external URL intent；
- browser history；
- restore exact nested location；

再另開 proposal 評估 router。

### 5.2 Feature state 不向上提升，除非跨 Workspace 真正需要

禁止重新創造 `subTarget?: any` 類型的全域 sub-route bus。

跨 Workspace 的最小能力為：

```ts
setActiveWorkspace('sessions');
```

需要「開啟最新 Session」時，Sessions 應直接由 recorder / saved session context 決定 default，而不是讓 AppShell 知道 session selector 的內部 schema。

若後續確實需要 cross-workspace intent，必須採 discriminated typed contract，且只傳 domain intent，不傳 component state。

### 5.3 非作用中 Workspace 必須 unmount

目標：

```tsx
{activeWorkspace === 'live' && <LiveWorkspace />}
{activeWorkspace === 'tune' && <TuningWorkspace />}
...
```

不得繼續以 `display: none` 讓整個 page tree 常駐。

跨頁仍需長期存在的 state 必須移到：

- existing Context；
- backend persistence；
- scoped persistent store；

不能依賴 DOM 不卸載來保存 state。

### 5.4 HUD window runtime 與 HUD settings page lifecycle 必須分離

HUD overlay 視窗即使在 `HudWorkspace` unmount 後仍可能持續顯示，因此：

- overlay runtime state 不能依賴 HudWorkspace component mount；
- backend / Tauri window process 是 runtime owner；
- UI controller unmount 時只清理 UI 自己建立的 subscription / BroadcastChannel / observer；
- 不可因離開 HUD 工作區自動關閉 HUD overlay。

### 5.5 不改既有 persistence schema

本計畫預設保留：

- `tuning-workflow-state`
- telemetry render config
- HUD backend config schema
- unit preference keys
- saved session schema
- Road workflow documents

若要改 localStorage / backend schema，必須建立 migration 並明確列入獨立 PR。

---

## 6. 多代理開發總體策略

採用 **Contract-first → Parallel Feature Lanes → Sequential Merge**。

### 6.1 角色

#### A. Coordinator / Parent Agent

唯一負責：

- shared contracts；
- integration files；
- Wave dependency sequencing；
- conflict resolution；
- merge order；
- final Full / Lite smoke；
- README / architecture documentation sync；
- 將已驗證 learning 升級到 `.agents/Journal.md`。

Coordinator 不應同時大量實作所有 Feature，避免成為瓶頸；但 shared integration files 只能由 Coordinator 持有 write ownership。

#### B. Read-only Scout Subagents

可並行執行：

- lifecycle inventory；
- component dependency mapping；
- dead prop / dead state search；
- localStorage / context ownership inventory；
- test coverage inventory。

Scout 預設**不修改檔案**，只交付 evidence 與建議，以降低前期衝突。

#### C. Feature Implementer Subagents

依 ownership lane 修改互不重疊的 Feature path。

建議 lane：

1. Live + Sessions lane
2. HUD lane
3. Settings capability lane
4. Tuning → Sessions integration lane（在 Sessions foundation merged 後）

#### D. Reviewer / Verification Subagent

預設 read-only，負責：

- diff review；
- architecture invariant review；
- test evidence review；
- Full / Lite regression checklist；
- 回報問題，不直接搶修他人 owned files。

若需要修正，先由 Coordinator 重新指派 ownership。

### 6.2 最重要的 ownership 原則

**同一時間只有一個 Agent 可以對同一組檔案持有 write ownership。**

任何 Agent 發現自己需要修改別人的 owned file 時：

1. 停止修改；
2. 在 handoff / PR 記錄需要的 contract 變更；
3. 由 Coordinator 決定由 owner 修改，或正式移交 ownership；
4. 不直接 cherry-pick 未協調的 conflicting patch。

---

## 7. Shared Integration Files：Coordinator Exclusive Ownership

下列檔案 / 目錄在本計畫執行期間原則上只允許 Coordinator 寫入：

```text
frontend/src/App.tsx
frontend/src/LiteApp.tsx
frontend/src/app/**
frontend/src/components/Navigation.tsx
frontend/src/components/LiteNavigation.tsx
frontend/src/main.tsx
frontend/src/lite-main.tsx
frontend/src/AppProviders.tsx
```

`frontend/src/App.css` 視為高衝突檔案：

- 預設由 Coordinator / Design-system owner 寫入；
- Feature Agent 優先使用 existing utility classes / semantic tokens；
- 若 Feature 必須新增 scoped CSS，優先建立 feature-local stylesheet 並使用既有 semantic variables；
- 若一定要改 `App.css`，先提交需要的 selector / token 說明給 Coordinator。

Plan file 本身也由 Coordinator ownership，不允許所有 subagent 同時更新 execution status，以免成為衝突熱點。

---

## 8. Feature Ownership Lanes

### Lane A — Live / Sessions

Primary ownership：

```text
frontend/src/features/telemetry/**
frontend/src/features/analysis/**
frontend/src/features/drag_test/**
frontend/src/features/sessions/**   # new
```

不得直接修改 App Shell；只 export 可被 Shell 掛載的 Workspace component。

### Lane B — HUD

Primary ownership：

```text
frontend/src/features/overlay_control/**
```

除非另有明確 scope，**不要**修改：

```text
hud_overlay/**
```

本計畫是 GUI decomposition，不是 HUD renderer rewrite。

### Lane C — Settings Capability

Primary ownership：

```text
frontend/src/features/settings/**
```

可以依 Coordinator 提供的 `AppCapabilities` contract 做 conditional rendering，但不得自行修改 capability contract。

### Lane D — Tuning / Validation integration

Primary ownership：

```text
frontend/src/features/tuning/**
frontend/src/features/road/**
```

此 lane 必須等 Sessions Workspace foundation 可用後才進入 active implementation。

---

## 9. Branch / Worktree 策略

### 9.1 基本原則

每一個 Wave 開始時，由 Coordinator 記錄：

```text
BASE_SHA=<main HEAD at wave start>
```

所有同 Wave 的並行 branch 必須從相同 `BASE_SHA` 建立。

### 9.2 建議 branch 名稱

```text
refactor/frontend-shell-foundation
refactor/frontend-sessions-workspace
refactor/frontend-hud-decomposition
refactor/frontend-settings-capabilities
refactor/frontend-tuning-session-integration
perf/frontend-active-workspace-mount
```

若要標記 agent，可使用：

```text
agent/<agent-id>/frontend-sessions-workspace
```

但 PR title 應描述產品變更，不需要暴露內部 agent 名稱。

### 9.3 Worktree 原則

每個 write-capable Agent 使用獨立 worktree：

```text
../worktrees/frontend-shell
../worktrees/frontend-sessions
../worktrees/frontend-hud
../worktrees/frontend-settings
../worktrees/frontend-tuning-integration
```

禁止兩個 Agent 共用同一 dirty worktree。

### 9.4 Dirty worktree 處理

若 Agent 啟動時看到非自己的未提交變更：

- 不 reset；
- 不 checkout --；
- 不 clean；
- 記錄 dirty paths；
- 停止對重疊 scope 寫入；
- 交給 Coordinator 協調。

---

## 10. Handoff / PR 記錄格式

每個 Feature Agent 在停止寫入前必須留下：

```text
Task: <task name>
Status: active | blocked | handoff | done
Owner: <Agent>
Branch: <branch>
Base SHA: <sha>
Scope: <owned paths / functional scope>
Changed: <files changed>
Contracts consumed: <shared contracts used>
Contracts requested: <requested shared change or None>
Pending: <remaining work>
Blocked by: <reason or None>
Verification: <commands + pass/fail/not-run>
Risks: <known behavior / migration risks>
Next action: <first action for next owner>
Last updated: <YYYY-MM-DD HH:mm +08:00>
```

Handoff 應放在：

- PR body；或
- Agent 任務輸出中；或
- Coordinator 可讀取的明確 task artifact。

**不要**讓所有 Agent 為了寫 transient status 同時修改 `.agents/Journal.md` 或本 plan。

只有經驗證、具有長期價值的 learning 才由 Coordinator / owner 寫入 `.agents/Journal.md`。

---

## 11. Dependency DAG

```text
Phase 0 Baseline & Inventory
        |
        v
Phase 1 Contract & Dead-State Cleanup
        |
        v
Phase 2 Shared App Shell Foundation
        |
        +--------------------+--------------------+
        |                    |                    |
        v                    v                    v
Phase 3 Sessions         Phase 5 HUD          Phase 6 Settings
        |                Decomposition        Capability Surface
        v
Phase 4 Tuning -> Sessions Integration
        |
        +--------------------+--------------------+
                             |
                             v
                  Phase 7 Mount / Perf / Cleanup
                             |
                             v
                  Phase 8 Final Full/Lite Acceptance
```

可安全平行：

- Phase 3 Sessions、Phase 5 HUD、Phase 6 Settings：**Phase 2 合併後**可平行。

不可平行：

- Phase 1 / 2 shared shell contract；
- Phase 4 必須等待 Sessions foundation；
- Phase 7 final cleanup 必須等待主要 Feature branches 都整合。

---

# 12. Phase 0 — Baseline、Inventory 與 Contract Freeze

## 12.1 目的

在大規模移動 component 之前建立可驗證基準，避免重構後無法判斷行為是否改變。

## 12.2 可並行 Scout 任務

### Scout A — Navigation / State ownership inventory

輸出：

- root state 清單；
- 哪些 state 被重複管理；
- 哪些 props 未被消費；
- localStorage key 清單；
- cross-feature callback 清單。

### Scout B — Lifecycle inventory

輸出每個 Workspace mount 時建立的：

- BroadcastChannel；
- timer / interval；
- WebSocket / subscription；
- backend fetch；
- observer；
- Tauri invoke。

尤其確認 unmount cleanup 是否存在。

### Scout C — Full / Lite差異 inventory

輸出：

- Full-only feature；
- Lite-only shell behavior；
- shared settings 中不適合 Lite 的項目；
- 相同 component 的不同 mount 行為。

### Scout D — Test inventory

輸出：

- 可保留的 behavior tests；
- 可建立的 pure contract tests；
- 不應新增的 DOM / Canvas brittle tests；
- 現有 build / test baseline。

## 12.3 Baseline commands

```powershell
cmd /c "pnpm -C frontend run test"
cmd /c "pnpm -C frontend run build"
git diff --check
```

記錄：

- tests pass/fail；
- build pass/fail；
- 任何現存 warning；
- Full / Lite manual smoke 的 known issue。

## 12.4 完成條件

- [ ] 四份 inventory evidence 已交付 Coordinator。
- [ ] baseline test / build 結果被記錄。
- [ ] 未發現會阻止 refactor 的未知 schema mutation。
- [ ] Coordinator 確認 Phase 1 shared contract scope。

---

# 13. Phase 1 — Dead State Cleanup 與 Typed Contract Foundation

**Owner：Coordinator**
**Parallel write：禁止**

## 13.1 目標

在改 UI 之前先清除已知無效狀態與 `any` navigation channel，並建立新架構的最小 typed foundation。

## 13.2 實作項目

1. 移除 `overlayCategory` 的 root state 與 unused props。
2. 移除 `OverlayViewProps.category / setCategory` 若確認無實際消費。
3. 清查並移除未使用的 `setActiveTab` 等 legacy props。
4. 建立：

```text
frontend/src/app/workspaceTypes.ts
frontend/src/app/appVariant.ts
frontend/src/app/workspaceManifest.ts
```

5. 定義：

```ts
WorkspaceId
AppVariant
AppCapabilities
WorkspaceDefinition
```

6. 建立 pure contract tests：

```text
workspaceManifest.test.ts
appVariant.test.ts
```

測試重點只驗證：

- Full / Lite workspace availability；
- unique WorkspaceId；
- capability relationship；
- 不測 DOM markup。

## 13.3 不做

- 不立即重新設計全部 Navigation。
- 不移動 Analysis / HUD 巨型檔案。
- 不改 Settings presentation。

## 13.4 驗收

- [ ] `overlayCategory` dead state 完全移除。
- [ ] root 不再需要 `subTarget?: any` 來承載 HUD category。
- [ ] 新 shared contract 有 pure tests。
- [ ] frontend tests pass。
- [ ] frontend build pass。
- [ ] `git diff --check` pass。

---

# 14. Phase 2 — Shared App Shell / Full-Lite Convergence

**Owner：Coordinator**
**Parallel write：禁止**

## 14.1 目標

建立單一 `AppShell`，讓 Full / Lite 差異由 `AppVariant / AppCapabilities` 決定，而不是維護兩套導航邏輯。

## 14.2 建議實作

建立：

```text
frontend/src/app/AppShell.tsx
frontend/src/app/AppHeader.tsx
frontend/src/app/AppMenu.tsx
frontend/src/app/AppStatus.tsx
```

將：

```text
App.tsx
LiteApp.tsx
```

收斂成非常薄的 variant entry：

```tsx
<AppShell variant="full" />
<AppShell variant="lite" />
```

## 14.3 Navigation 目標

Full：

```text
Live | Tune | Sessions | HUD
```

Lite：

```text
Live | HUD
```

Settings、Appearance、Diagnostics、Update、About 移入 `AppMenu` 的 migration 可以分階段；Phase 2 可先保留 Settings 舊入口，只要新 Shell contract 已就位。

## 14.4 Active Workspace mount

Phase 2 開始將 shell 改成「只 render 當前 workspace」。

但若某 Feature 因為依賴 DOM 常駐而出現 regression，可暫時在該 Feature 保留 compatibility wrapper，並在 Phase 7 清理；禁止把整個 App 回退到所有 Workspace 常駐。

## 14.5 Cross-workspace synchronization

保留既有「回到 Live 時同步 telemetry car」行為，但將其變成 Shell-level workspace entry effect，而不是 Feature subtab 邏輯。

## 14.6 驗收

- [ ] Full / Lite 使用同一個 `AppShell`。
- [ ] Workspace availability 只由 manifest / capabilities 定義。
- [ ] Full / Lite 不再各自持有獨立 navigation schema。
- [ ] 非作用中 workspace 不再預設 mount。
- [ ] existing global Providers 不因 workspace unmount 被重建。
- [ ] frontend tests / build / diff-check pass。

---

# 15. Wave 2 平行開發啟動條件

只有當 Phase 2 merge 到 `main` 後，Coordinator 才宣告新的：

```text
WAVE2_BASE_SHA=<new main SHA>
```

下列三個 Feature Agent 可以從相同 SHA 平行啟動：

- Lane A：Sessions
- Lane B：HUD
- Lane C：Settings capability

三者不得修改 Coordinator-exclusive shared files。

---

# 16. Phase 3 — Sessions Workspace 提升為頂層工作區

**Owner：Lane A Agent**
**Depends on：Phase 2**

## 16.1 目標

將 Post-Race Analysis 從 Telemetry 子 tab 升格為獨立 `SessionsWorkspace`。

## 16.2 Migration Strategy

不要第一個 PR 就重寫 `AnalysisView`。

先建立 compatibility wrapper：

```tsx
export function SessionsWorkspace() {
  return <AnalysisView />;
}
```

讓資訊架構先成功，再逐步拆分 Analysis internals。

## 16.3 Telemetry → Live

將原本：

```text
live / analysis / drag
```

收斂為：

```text
Dashboard / Launch Test
```

Post-Race Analysis 移除。

可建立：

```text
features/live/LiveWorkspace.tsx
features/live/LiveModeSwitch.tsx
```

Telemetry 的高頻卡片仍留在既有 telemetry path，避免大規模 rename 造成額外風險。

## 16.4 Race completion behavior

現有比賽結束後自動切到 analysis 的行為改為：

```text
race ends
→ recorder 完成 latest session
→ switch active workspace to Sessions
→ Sessions default 顯示 current/latest
```

Feature Agent 不直接修改 AppShell；應 export 明確 callback prop 或 domain event interface，交給 Coordinator 在 integration 時接線。

推薦介面：

```ts
interface LiveWorkspaceProps {
  onOpenLatestSession?: () => void;
}
```

這比傳 `setActiveTab` 或 generic `subTarget` 更窄。

## 16.5 AnalysisView decomposition（同 Phase 可分 PR）

在 Workspace 提升穩定後，再拆：

```text
SessionLibrary
SessionHeader
SessionActionsMenu
SessionSummary
LapComparison
TrackAnalysis
```

優先抽離 state-independent / pure selectors：

```text
sessionSelectors.ts
trackMetricMath.ts
```

避免先搬所有 JSX。

## 16.6 Session Actions priority

將目前多個同層級動作收斂：

```text
[Open in MoTeC] [⋯]
```

次要動作：

- Export CSV
- Import CSV
- Workspace Template
- Delete

## 16.7 驗收

- [ ] Full 頂層 Sessions 可直接進入。
- [ ] Live 不再存在 Post-Race Analysis subtab。
- [ ] Drag / Launch Test 仍正常。
- [ ] race completion 能導向 Sessions 或至少提供明確入口，不遺失最新資料。
- [ ] Analysis 的 saved session / lap compare / MoTeC 行為不變。
- [ ] leaving Sessions 後 interval / page-level lifecycle cleanup 正常。
- [ ] tests / build / diff-check pass。

---

# 17. Phase 4 — Tuning History / Road Validation 收斂至 Sessions

**Owner：Lane D Agent**
**Depends on：Phase 3 merged**

## 17.1 目標

消除 Tune 頁面內的 `reviewHistory` 模式切換；Tune 只負責建立與驗證 setup，Sessions 負責查看已儲存結果。

## 17.2 修改 Tuning

移除 / 淘汰：

```text
reviewHistory
Return to current setup / Review saved runs page swap
```

Step 4 保留：

- recommendation；
- setup verification；
- start / record validation；
- 完成後導向 Sessions 的明確 action。

## 17.3 修改 Sessions

加入：

```text
Validation
```

作為 Sessions Details 中的一種資料 view。

`RoadWorkflowView` 可以先作為 Validation panel 的 compatibility component，再逐步將其 prepare / drive / results UI 轉為 session-oriented 呈現。

## 17.4 Cross-workspace integration contract

Tuning Agent 不得重新把 `setActiveTab` 注入所有 Step。

建議：

```ts
interface TuningWorkspaceProps {
  onOpenSessions?: () => void;
}
```

若需要指定 validation ID，使用 typed domain ref：

```ts
interface ValidationSessionRef {
  workflowId: string;
}
```

不要傳 UI tab index。

## 17.5 驗收

- [ ] Tune 不再突然切換成 history viewer。
- [ ] existing saved Road reports 可從 Sessions 進入。
- [ ] 新 validation workflow 不需重做 backend schema。
- [ ] Road prepare / drive / result 既有流程仍可用。
- [ ] tuning workflow localStorage migration 不受影響。
- [ ] tests / build / diff-check pass。

---

# 18. Phase 5 — HUD 巨型元件拆分

**Owner：Lane B Agent**
**Depends on：Phase 2**
**Can run parallel with Phase 3 / Phase 6**

## 18.1 目標

將 `OverlayView` 從「controller + service + entire form tree」拆為：

```text
HudWorkspace
useHudController
HudSetupPanel
HudLayoutPanel
HudAdvancedPanel
hudCapabilities
```

## 18.2 Controller responsibility

`useHudController` 負責：

- backend config fetch / save；
- config normalization；
- BroadcastChannel lifecycle；
- Tauri window launch / close / reload；
- monitor enumeration / move；
- audio device enumeration / selection；
- style / author metadata；
- error / busy state。

UI panels 不直接知道 backend URL 或 Tauri invoke 細節。

## 18.3 Config update API

取代大量重複：

```ts
const updated = { ...config, field: value };
saveConfig(updated);
```

建立 typed patch helper，例如：

```ts
updateConfig({ scale: nextScale });
updateElements({ showTeleTires: true });
```

仍必須保留 config normalization 與 rollback behavior。

## 18.4 HUD capabilities

建立 pure capability mapping：

```ts
interface HudCapabilities {
  audioSpectrum: boolean;
  centerWidget: boolean;
  liveMap: boolean;
  customColors: boolean;
  styleSpecificAdvanced: boolean;
}
```

只有當 HUD 真正支援時才顯示對應控制項。

不得因 capability UI 重構而改 renderer contract。

## 18.5 Panel ownership

### Setup

- enable / disable；
- HUD style；
- monitor；
- global scale；
- units；
- author info。

### Layout

- visibility；
- offsets；
- positions；
- per-element scale；
- telemetry opacity；
- preview-related controls。

### Advanced

- color / glow；
- audio；
- performance；
- S650-specific advanced；
- WIP / developer options。

## 18.6 Lifecycle acceptance

離開 HudWorkspace 後：

- UI-created BroadcastChannel 必須關閉；
- page-only requests / observers 不應殘留；
- 已開啟的 HUD overlay window **不得**因 page unmount 被關閉；
- backend config remains authoritative。

## 18.7 Tests

優先新增 pure tests：

```text
hudCapabilities.test.ts
hudConfigPatch.test.ts
```

不新增大量 DOM snapshot。

## 18.8 驗收

- [ ] `OverlayView` 不再是所有 HUD 邏輯的唯一 God component。
- [ ] controller / panels ownership 清楚。
- [ ] existing config schema 不變。
- [ ] existing HUD styles 都可選。
- [ ] S650 options 不丟失。
- [ ] monitor / audio / launch / close 正常。
- [ ] leaving HUD page 不關閉已啟動 overlay。
- [ ] tests / build / diff-check pass。

---

# 19. Phase 6 — Settings App-level Surface 與 Lite Capability Filtering

**Owner：Lane C Agent**
**Depends on：Phase 2**
**Can run parallel with Phase 3 / Phase 5**

## 19.1 目標

Settings 不再作為 primary workspace，改由 App Menu 開啟 app-level surface。

Presentation 可以是：

- full-height modal；或
- offcanvas / drawer；

但必須依 `ui-architecture.md` 使用 `ModalPortal` 掛到 `document.body`。

## 19.2 分類

```text
General
├── Language
├── Units
└── Appearance

Telemetry
├── Port
├── UDP Forwarding
└── Recording

Integrations
├── Discord
└── MCP

Maintenance
├── Updates
├── Storage
├── Diagnostics entry
└── Developer Options
```

## 19.3 Full / Lite capability

明確隱藏 Lite 不存在的 Tune-only 設定，例如：

```text
Use Developer Tuning View
```

不自行假定所有 developer / MCP / storage 都是 Full-only；只有產品 contract 已確認的項目才能被 capability filter。

## 19.4 App Menu migration

最終 App Menu：

```text
Settings
Appearance
Diagnostics
Check for Updates / Update Available
About
```

Build info 平常不需要持續佔用 navbar；有 update 時才顯示 status badge。

## 19.5 Agent boundary

Settings Agent 只實作 `SettingsSurface` 與 capability-aware section；`AppMenu` wiring 由 Coordinator integration。

## 19.6 驗收

- [ ] Settings 不再需要 primary workspace slot。
- [ ] Settings surface 使用 ModalPortal。
- [ ] Lite 不顯示 Tune-only option。
- [ ] language / units / telemetry / MCP / update / storage 原功能不丟失。
- [ ] tests / build / diff-check pass。

---

# 20. Phase 7 — Active Workspace Mount、Lifecycle 與 Performance Cleanup

**Owner：Coordinator + designated performance reviewer**
**Depends on：Phase 3 / 4 / 5 / 6 integrated**

## 20.1 目的

清除 migration compatibility code，確認只 mount active workspace 並量測 lifecycle / 60Hz regression。

## 20.2 Cleanup

移除：

- legacy `activeTab` aliases；
- Telemetry `analysis` subtab；
- legacy Navigation dropdown；
- obsolete `Navigation.tsx / LiteNavigation.tsx`（若完全被新 Shell 取代）；
- dead props；
- unused imports；
- compatibility wrappers that are no longer required；
- `reviewHistory`；
- dead HUD category definitions。

## 20.3 Mount behavior manual checks

### Live active

- Telemetry 60Hz 顯示正常；
- Sessions page-only interval 不存在；
- HUD settings page-only device enumeration 不重跑。

### Sessions active

- Live heavy Canvas tree 已 unmount；
- recorder / backend session state 仍保持；
- saved / current session 可讀。

### HUD active

- HUD settings UI mount；
- overlay window independent。

### Switch away from HUD

- controller page-only resource cleanup；
- overlay window remains if enabled。

## 20.4 Performance evidence

不硬編碼「一定改善 X%」。比較 baseline：

- idle CPU / RSS；
- Live active CPU / RSS；
- switching workspace latency；
- hidden workspace timers / channels count；
- React profiler evidence（如可用）。

至少進行 3 次可重現測量，再宣稱改善。

若 CPU / memory 有 >10% 可重現 regression，必須在 merge 前說明原因或修正。

## 20.5 驗收

- [ ] active workspace only mount 成為預設架構。
- [ ] 所有 workspace cleanup function 有效。
- [ ] 無 ghost timers / duplicate channels。
- [ ] 60Hz Live path 無明顯 regression。
- [ ] build / tests pass。

---

# 21. Phase 8 — Final Full / Lite Acceptance

## 21.1 Full Smoke Matrix

### App Shell

- [ ] Live 可進入。
- [ ] Tune 可進入。
- [ ] Sessions 可進入。
- [ ] HUD 可進入。
- [ ] Settings 可從 App Menu 打開 / 關閉。
- [ ] Diagnostics / Appearance 不造成 layout shift。

### Live

- [ ] UDP disconnected / active status 正確。
- [ ] Dashboard 60Hz update 正常。
- [ ] Launch Test 正常。
- [ ] Unit drawer 正常。

### Tune

- [ ] Step 1-4 狀態與 gating 正常。
- [ ] workflow step persistence 正常。
- [ ] engine measurement archive 正常。
- [ ] verification 正常。
- [ ] saved validation review 改由 Sessions 進入。

### Sessions

- [ ] current session。
- [ ] saved session。
- [ ] lap list。
- [ ] compare lap。
- [ ] debrief。
- [ ] track map。
- [ ] MoTeC open / import / export / template。
- [ ] validation / Road workflow review。

### HUD

- [ ] style list。
- [ ] author info。
- [ ] launch / close。
- [ ] monitor select。
- [ ] click through。
- [ ] reload。
- [ ] audio device。
- [ ] unit settings。
- [ ] S650-specific config。
- [ ] WIP visibility behavior。

## 21.2 Lite Smoke Matrix

- [ ] 只有 Live / HUD primary workspace。
- [ ] Tune 不可見。
- [ ] Sessions 不可見。
- [ ] Settings 可開啟。
- [ ] Developer Tuning option 不可見。
- [ ] Telemetry receiver settings 正常。
- [ ] HUD 全流程正常。
- [ ] Full-only workspace code 不因 capability filtering 被錯誤 mount。

## 21.3 Theme / Layout

- [ ] dark / light。
- [ ] supported Halfmoon core modes。
- [ ] no hardcoded new black/white colors。
- [ ] no decorative emoji。
- [ ] modal / drawer uses `ModalPortal`。
- [ ] alerts / status 不造成 60Hz grid layout shift。

---

## 22. Testing Strategy

### 22.1 每個 Frontend PR 的最低驗證

```powershell
cmd /c "pnpm -C frontend run test"
cmd /c "pnpm -C frontend run build"
git diff --check
```

### 22.2 何時需要 backend tests

若本計畫某 PR 意外需要改 backend contract，該 PR 應原則上拆出去；若無法拆分，至少執行：

```powershell
uv run --no-project --python .venv\Scripts\python.exe python -m pytest tests/
uv run --no-project --python .venv\Scripts\python.exe ruff check .
uv run --no-project --python .venv\Scripts\python.exe ruff format --check .
```

### 22.3 建議新增的 pure tests

```text
app/workspaceManifest.test.ts
app/appVariant.test.ts
sessions/sessionSelectors.test.ts
sessions/trackMetricMath.test.ts
overlay_control/hudCapabilities.test.ts
overlay_control/hudConfigPatch.test.ts
```

### 22.4 不新增

- 不以 DOM tag count 測試 Shell。
- 不大量 snapshot 整個頁面。
- 不測 Canvas API call count。
- 不硬編碼 pixel coordinates。
- 不用 regex 測 Tauri / YAML / workflow config。

---

## 23. Merge Strategy

### 23.1 每個 PR 都應保持單一責任

建議 PR 順序：

1. `refactor(ui): remove dead overlay category routing and establish workspace contracts`
2. `refactor(app): converge Full and Lite on a shared workspace shell`
3. `refactor(sessions): promote post-race analysis to a top-level workspace`
4. `refactor(hud): split overlay controller from setup, layout and advanced panels`
5. `refactor(settings): add capability-aware app-level settings surface`
6. `refactor(tuning): move saved validation review into sessions workspace`
7. `perf(app): mount only the active workspace and clean legacy navigation`
8. `docs(frontend): document final workspace architecture and migration decisions`

### 23.2 Wave 2 PR merge order

Phase 3 / 5 / 6 理論上互不依賴，可按照 readiness merge；但每一次 merge 後，尚未 merge 的 branch 必須：

1. fetch 最新 main；
2. rebase / merge main（依 repo 當前慣例）；
3. 重新執行 frontend tests / build；
4. 確認未碰 shared Coordinator-owned file。

### 23.3 Conflict handling

若 Feature branch 與 main 發生 shared file conflict：

- Feature Agent 不自行選擇「全部接受 ours / theirs」；
- Coordinator review conflict intent；
- shared contract conflict 由 Coordinator 解；
- Feature-specific conflict 可重新授權原 Agent 解決。

---

## 24. Jules / Remote Agent 特別規則

若某 Phase 委派 Jules：

1. Jules scope 必須只涵蓋一個 ownership lane；
2. prompt 必須列出禁止修改的 shared files；
3. Jules PR 不可自動視為可 merge；
4. Coordinator / Reviewer 必須檢查：
   - diff；
   - changed file ownership；
   - tests；
   - security / lifecycle；
   - 是否改變 backend / persistence / physics contract；
5. Jules 的原始工作紀錄保留於 `.jules/`；
6. 只有本地驗證後的 learning 才同步至 `.agents/Journal.md`。

適合 Jules 的工作：

- dead prop cleanup；
- pure capability map；
- isolation tests；
- 大型 component 的機械式 JSX extraction（前提是 contract 已凍結）。

不建議直接委派 Jules 獨立決策：

- shared App Shell architecture；
- cross-workspace navigation contract；
- Tuning / Sessions ownership boundary；
- 60Hz lifecycle architecture；
- 多 branch merge conflict resolution。

---

## 25. Subagent Prompt Template

Coordinator 可使用以下 template 委派子代理：

```text
Task: <phase / lane>
Repository: eddie772tw/FH6-HorizonTuner
Base SHA: <exact sha>
Branch: <branch>

Read first:
- .agents/AGENTS.md
- .agents/rules/workspace.md
- .agents/rules/testing-strategy.md
- .agents/rules/ui-architecture.md
- .agents/skills/README.md
- <required canonical SKILL.md files>

Write ownership:
- <allowed paths>

Read-only / forbidden writes:
- frontend/src/app/**
- frontend/src/App.tsx
- frontend/src/LiteApp.tsx
- <other lane-owned paths>

Required behavior:
- preserve backend API
- preserve persistence schema
- preserve tuning formulas
- preserve HUD renderer contract unless explicitly scoped
- use Halfmoon semantic tokens
- clean all lifecycle resources on unmount

Deliver:
1. implementation
2. scoped tests
3. pnpm frontend test result
4. pnpm frontend build result
5. git diff --check result
6. handoff block with changed files, risks, pending items

Do not edit shared contracts. If a shared contract must change, stop and request it from Coordinator.
```

---

## 26. Review Checklist for Every Parallel PR

### Architecture

- [ ] 只修改 declared ownership paths。
- [ ] 沒有重新將 Feature state 提升到 App Shell。
- [ ] 沒有 generic `any` navigation bus。
- [ ] 沒有新增 circular dependency。
- [ ] 沒有把 shared module 變成 God module。

### Lifecycle

- [ ] effect cleanup 完整。
- [ ] timer / channel / observer / subscription 可 unmount。
- [ ] page unmount 不破壞 backend-owned runtime。

### UI

- [ ] Halfmoon / semantic CSS token 合規。
- [ ] no decorative emoji。
- [ ] modal / drawer use ModalPortal。
- [ ] no dynamic inline alert causing layout shift in 60Hz view。

### Compatibility

- [ ] backend API unchanged。
- [ ] localStorage schema unchanged or migration exists。
- [ ] Full / Lite capability respected。
- [ ] current tests pass。

### Evidence

- [ ] frontend tests result recorded。
- [ ] frontend build result recorded。
- [ ] `git diff --check` result recorded。
- [ ] known risk documented。

---

## 27. Rollback Strategy

本計畫刻意拆成小 PR，避免 big-bang rewrite。

### Rollback principles

1. 每個 Phase 都能單獨 revert，不依賴資料 migration。
2. backend contract 不變，因此 frontend rollback 不需資料回滾。
3. localStorage key 不 rename，因此舊版可繼續讀取。
4. Sessions 最初以 wrapper 方式提升，因此若 IA 發生問題，可以回復 navigation 而不丟失 Analysis code。
5. HUD controller split 不改 config schema，因此可回復單一 View 實作。
6. App Shell convergence 若失敗，可在同一 PR revert，不應與 Feature migration 混成一個超大 commit。

### Emergency compatibility

若 active-only mount 暴露某個既有 hidden-page dependency：

- 先明確標記該 dependency；
- 可局部使用 provider / context 保留 state；
- 禁止直接恢復「所有主頁永久 mounted」作為長期解法。

---

## 28. Documentation Updates

完成後至少同步：

- `README.md`
- `README.en.md`
- 前端 architecture 相關 docs（若現有有對應入口）
- `.agents/Journal.md`：只記錄經驗證的新 invariant / learning

文件應更新：

- Full Workspace：Live / Tune / Sessions / HUD；
- Lite Workspace：Live / HUD；
- Settings 改為 app-level surface；
- Analysis / Road validation 的新入口；
- Full / Lite 共用 App Shell；
- active workspace mount behavior。

---

## 29. Definition of Done

整個計畫只有在以下全部成立時才可標記 `done`：

### IA

- [ ] Full 頂層只有 Live / Tune / Sessions / HUD。
- [ ] Settings 不再作為 primary workspace。
- [ ] Lite 頂層只有 Live / HUD。
- [ ] Navigation 不再重複 Feature stepper / tabs。

### State ownership

- [ ] App Shell 不知道 Tuning step number。
- [ ] App Shell 不知道 HUD panel category。
- [ ] App Shell 不知道 selected lap / compare lap。
- [ ] Feature state owner 單一且清楚。

### Sessions

- [ ] Post-Race Analysis 在 Sessions。
- [ ] Saved validation review 在 Sessions。
- [ ] Tune 不再透過 `reviewHistory` 變身成 history viewer。

### HUD

- [ ] Controller 與 UI panels 分離。
- [ ] capability-aware controls 可用。
- [ ] HUD overlay runtime 與 settings page lifecycle 分離。

### Full / Lite

- [ ] 共用 App Shell。
- [ ] capability filtering 正常。
- [ ] Lite 不顯示 Tune-only settings。

### Performance / lifecycle

- [ ] 非 active workspace 不預設 mount。
- [ ] 沒有 ghost timer / duplicate channel。
- [ ] Live 60Hz 無可重現重大 regression。

### Verification

- [ ] frontend tests pass。
- [ ] frontend build pass。
- [ ] `git diff --check` pass。
- [ ] Full smoke pass。
- [ ] Lite smoke pass。
- [ ] README / docs synced。
- [ ] verified learning written to Journal where appropriate。

---

## 30. 後續工作（不納入本計畫）

以下項目應在本計畫完成後獨立評估：

1. Developer Tuning 與正式 Tuning solver convergence；
2. Backend Runtime v2 / 移除 PyInstaller；
3. deep-link / route framework；
4. Sessions 資料模型統一成單一 domain abstraction；
5. HUD editor 更完整的 WYSIWYG workflow；
6. CarParams legacy view 最終刪除；
7. 更完整的 accessibility navigation / keyboard UX；
8. release packaging / updater runtime 架構變更。

這些工作不應趁本次 IA refactor 一併偷偷納入，避免 scope explosion。

---

# 31. 建議執行節奏摘要

```text
Wave 0 — Read-only Scouts
    inventory state / lifecycle / Full-Lite / tests

Wave 1 — Coordinator only
    Phase 1 contract + dead state
    Phase 2 shared shell

Wave 2 — Parallel fan-out
    Agent A: Sessions / Live boundary
    Agent B: HUD decomposition
    Agent C: Settings capability surface

Wave 3 — Dependency integration
    Agent D: Tuning → Sessions validation integration

Wave 4 — Coordinator + Reviewer
    active-only mount cleanup
    lifecycle / performance acceptance
    Full / Lite smoke
    docs + Journal
```

**核心原則：平行的是 Feature implementation，不平行修改 shared contract。**

只要這條原則保持，這個重構可以使用 subagent、子代理、不同 worktree、Jules PR 或人類開發者同時推進，而不會因為所有人同時碰 `App.tsx` / Navigation / App.css 而把並行效率抵消在 merge conflict 上。
