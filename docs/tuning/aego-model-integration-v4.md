# ICE AEGO 獨立模型正式整合 v4

正式 `solve workflow`、HTTP／桌面／Companion 與 MCP `calculate_tuning_workflow` 共用 Rust 的證據資格、模型選擇及結果。這次只切換 ICE 齒比；底盤公式與版本、量測 reducer、EV、CVT、DangerSign 及 legacy CLI／MCP 不變。

## 模型與輸入

| 目標 | 正式模型 | 目標語意與限制 |
| --- | --- | --- |
| Road | `aego-road-launch-envelope/v3` | 保留原數值。起步總比與末檔功率峰值錨點，仍是工程先驗。 |
| Rally | `aego-rally-joint/v1` | Mixed／Cross 自己的末檔輪速目標；沒有 Road 的逐檔 RPM 收尾。 |
| Drift | `aego-drift-working/v1` | 使用者指定主檔、工作轉速及輪速；缺任一目標不可提供可套用推薦。 |
| Drag | `aego-drag-joint/v1` | 起步與末檔共同配置，取位後檢查。明確末速不因範圍或預覽限制而改寫。 |

Drift 的 `profile.driftWorkingTarget` 為：

```json
{"mainGear":3,"targetRpm":4000,"wheelSpeedKmh":80,"source":"user-target"}
```

檔位以 1 起算。轉速不得超過後端合格擷取的有效上限，包括取位後在指定輪速需要的轉速。這是使用者目標，不是性能量測；只有峰值轉速不能建立完整工作帶。此版不新增曲線資格／reducer，不接受前端曲線自稱合格；四點形狀仍為未校準先驗。漂移滑移中的地面速度及工作帶保持未知。FWD 只聲明運動學相容性。

Rally／Drift／Drag 可分別透過保存 profile 的 `rallyObservedBounds`、`driftObservedBounds`、`dragObservedBounds` 提供 `source:"user-observed"`、`finalDrive:{min,max,step}` 與每檔 `gears:[{min,max,step}]`。沒有觀察值時使用各模型明示的先驗範圍，不能說已驗證遊戲滑桿。格式與取位由模型驗證；profile 正規化、保存及重新載入保留這些輸入，不默默丟棄。GUI 的終傳等價重配仍使用獨立 `ratio-balance/v1` 請求，不把等價重配當成修好不可行原目標的方法。

既有 `POST /api/car_params/:id` 使用淺層合併，省略欄位表示保留原值。清除 Drag 末速或來源時，桌面送出明確 `null`，避免 JSON 省略 `undefined` 後重啟復活舊 manual 目標。Drift 的 partial target object 會整個替換舊物件；缺少必要數值即 unavailable，不從舊物件補回。

## 版本與保存重播

新四模型推薦使用組合版本 `rust/ice-measured-workflow-v4`。這不改變 `tuning-workflow-result/v1`／`v2` 的結構與底盤選擇：schema v1 保留既有底盤 owner，schema v2 保留 `rust/chassis-load-baseline/v1`。EV 的 schema v3 與版本繼續獨立。

新推薦 snapshot 保存後端重建的 `workflowSchemaVersion`、`gearingModelId`、`gearingModelVersion`、`gearingDiagnostics`。保存／重啟驗證會重新載入原始引擎證據、依明確模型版本計算、重做等價重配，再比對完整推薦。未知版本、goal/model 錯配、缺標籤、診斷或欄位篡改均拒絕；不把「latest」當版本。

依 #658，原 ICE formula v1／v2／v3 改由[歷史資料封存](model-retirement.md)檢視，不再執行舊 solver；缺模型標籤不會選到新公式。原始版本、診斷與數值保留，不回填新版欄位、不遷移或覆寫。

`gearingView` 只出現在工作流程回應，由後端提供採用輪軸、輪胎半徑、參考／最高／有效 RPM 與峰值標記。前端只作圖表幾何及單位顯示；不再選擇後輪、補 0.32m 或用峰值猜 redline。缺少有效 view 時顯示不可繪圖，不製造可套用結果。峰值標記不再畫成已驗證的動力帶。客戶端夾帶的 view／版本／診斷不是資格來源。

## 等價重配與回退

每次重配都從合格原始模型重建 base，依 user-observed 範圍與 0.01 精度配置，再透過該模型 owner 重驗硬目標。profile 已保存的觀察範圍與 ratio balance 新範圍必須同時滿足；廣範圍請求不能解除既有硬體鎖定，矛盾時回 unavailable。若要更正舊觀察，先明確編輯 profile。合法終傳列表也經同一驗證；失敗不回可套用結果。Road 對原始未取位的首／末檔總比檢查半刻度誤差，避免原 base 及新重配的兩次取位累積。其他三個模型保留其預先定義的速度容差；Drift 另檢查有效 RPM 上限。選定結果的實際值與誤差隨重配重新計算，目標及來源不變。

現行模型仍依明確 ID 重建與驗證，不能把 production selector 當歷史版本 fallback。#658 已移除退役 enum variant、solver 與 ICE v1／v2／v3 重播映射；不允許透過修改 selector 恢復舊公式。必要的舊版研究以固定 Git 提交或隔離的舊版程式進行，不能接回產品推薦流程。

## 驗收界線

原 21 組 tuning／10 組 EV golden 的值與容差不變。新舊同輸入的底盤、所有正式入口的一致性、保存／重啟／未知版本／篡改、無解及等價重配屬產品契約驗證。圖集的實際 AppShell 與 Rust backend 使用隔離資料及可重播引擎 capture；頁面證據不等於 FH6 實車 A/B。

未驗證範圍包括實際滑移、抓地、最佳換檔、最短 ET、圈速、漂移分數及跨車種性能。有限正數或 `available` 只表示在已聲明的工程約束內可配置，不能保證實車最優。

採用技能：`physics-tuning-math`、`modular-refactoring`、`pr-author-maintainer`、`cross-agent-collaboration`、`halfmoon-design-system`、`huge-component-refactoring`、`ponytail`。
