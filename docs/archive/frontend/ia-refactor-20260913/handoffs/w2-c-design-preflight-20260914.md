# W2-C：Settings 設計交接

Task：Settings 分類與能力投影。Status：`proposed`。Owner：Coordinator 保管設計，未發 W2-C write lease。Model：Luna / high 起。更新：2026-09-14。

盤點來源：Shell `54165303f12c9598872905571f7162cc5f80effa`，工作區 `D:/FH6-frontend-ia-20260913/shell-race-fix`。Luna 已盤點 Settings/manifest/Shell，Coordinator 本次補讀 AppDialog 與 UpdateSettingsCard。來源 SHA 不等於 W2 開工基準；須先取得 G2 PASS、共同 `WAVE2_BASE_SHA` 及 [工作單 C](../work-orders.md) 的 ownership。

## 第一張工作單

可寫 `frontend/src/features/settings/**` 與指定 C handoff。不能改 `SettingsContext`、Shell、shared contract、locale、App.css、backend、Tauri、HUD renderer 或 persistence schema/key/queue。所需 Shell callback 與型別差異由 Coordinator 接線。

建立作為 AppDialog 內容的 `SettingsSurface`，沿用 SettingsSection/Item/Switch、useSettings/updateSettings 與既有子卡片。保留相容 export 直到 Shell 接線完成，不能先讓原設定失去入口。

| 分類 | 必須保留的內容 |
| --- | --- |
| General | language、general unit system、power、spring-rate units |
| Telemetry | receiver port、forwarding enable/host/port、dyno/race recording |
| Integrations | Discord status、MCP enable/live/downsample、動態 endpoint/status |
| Maintenance | Developer Tuning、auto check updates/手動更新入口、storage overview |

能力來自 `workspaceManifest` 的既定契約；Lite 僅隱藏 Developer Tuning，不能推論其餘進階設定都不支援。section registry 留在 Settings feature，除非真實 consumer 需要，不建立額外共享 export。

## Coordinator 已選定的接線方向

1. Shell 的 AppDialog 是 Settings 最外層 portal、Escape 與焦點 owner；SettingsSurface 提供內容，不建立第二個 Settings dialog。
2. Settings 與 App Menu 的更新入口都保留，並導向同一個 Updates surface。Settings 使用窄 `onOpenUpdates: () => void`，由 Coordinator 接到既有 `openSurface('updates')`；切換 surface，不疊加第二個 app dialog。
3. Settings 的 Maintenance 保留自動檢查設定及更新入口；手動檢查、進度、下載/套用與既有 UpdateModal 由 Updates surface 的單一 UpdateSettingsCard 路徑承接。可抽取自動檢查的純呈現列共用，不能複製 updater state/queue。
4. capability prop 只消費既定 `developerTuning` 能力；C 不改 AppCapabilities。Appearance/Diagnostics 的既有入口保留 Shell owner，不複製其內容。

以上是本次規劃決策，不是已實作或已凍結的 public API。開工前 root 核對 exact base 的 updater lifecycle、AppDialog/useModalFocus 與 SettingsContext，再將實際 props/consumer 登記；不要求 C 猜測 shared 改動，也不將例行接線再交給使用者決定。既有 UpdateModal 的焦點/關閉流程需一併驗證，不能僅以消除第二份卡片宣稱更新流程通過。

## 完成與交接

用 semantic section/capability projection 取代綁死舊三欄順序的 `SettingsLayout.test.ts`，保留 persistence/queue/service 回歸測試。新測試驗證哪些能力與設定可用，避免改成 DOM 微觀快照。

依 [U1–U3/X2 驗收](../acceptance.md) 檢查 Full/Lite 開關、Escape/focus、窄畫面、深淺/core theme、Live grid 不被推擠、所有原欄位可達、Settings→Updates 的單一入口及關閉流程、隔離設定重啟讀回。保留 Discord/MCP/storage page read 清理；telemetry/recorder/HUD runtime 不由 Surface 接管。

交付精確 base/head、changed files、欄位對照、export/consumer、locale requests、test/build/diff 結果及未測範圍。Coordinator 完成 Shell 接線並獨立 review 後才算 lane 交付。重啟讀回與 native/更新能力證據分開記錄，不以 browser toast 證明 OTA 可用。

Next action：G2 通過後，由 Coordinator 指定基準、核對上述 shared 依賴並發 C lease。尚無 `WAVE2_BASE_SHA`、產品變更或 C PR。
