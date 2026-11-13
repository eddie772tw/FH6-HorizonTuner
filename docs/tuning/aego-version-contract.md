# ICE AEGO 獨立版本與歷史重播契約

正式切換後的新推薦使用 `rust/ice-measured-workflow-v4`，並明確記錄個別模型 ID。Rally 為 `aego-rally-joint/v1`、Drift 為 `aego-drift-working/v1`、Drag 為 `aego-drag-joint/v1`，Road 保留 `aego-road-launch-envelope/v3`。下列歷史映射、wire 格式及數值繼續凍結；新保存格式、必要輸入、圖表與回退見 [v4 整合契約](aego-model-integration-v4.md)。

本文件保留 #652 建立時的歷史版本基線，其數值來自 `1ddb092d90f3aca4c02c86d633e6cfe3e7fc587b` 的 Rust owner。正式路由已依上方 v4 整合契約切換；新 Rally／Drift／Drag 使用獨立 ID，歷史映射繼續凍結。版本辨識不代表實車性能驗收。

## 分開的版本責任

- `tuning-workflow-result/vN`：請求／回應結構及工作流程。v2 引入底盤基準，v3 是獨立確認 EV，均不表示四個 ICE 模型一起升級。
- `loaded-sweep/v4` 等量測分析版本：原始 capture 的資格與 reducer，由 `measurement`／`evidence` 擁有；本次不改資格或分析常數。
- `aego_model::AegoModel`：四個 ICE 賽事各自的數值 owner，序列化為不可拆解且嚴格辨識的 ID/version 字串。
- `rust/chassis-load-baseline/v1`：底盤版本；本次不更動任何底盤公式、結果、診斷與版本。
- `rust/ice-measured-workflow-vN`：保存推薦的組合版本，決定原始工作流程與模型重播。

## 缺少模型標籤的歷史映射

| 推薦 formulaVersion | workflow schema | Road | Rally | Drift | Drag |
| --- | --- | --- | --- | --- | --- |
| `rust/ice-measured-workflow-v1` | `tuning-workflow-result/v1` | `aego-road-joint/v2` | `aego-rally/v1` | `aego-drift/v1` | `aego-drag/v1` |
| `rust/ice-measured-workflow-v2` | `tuning-workflow-result/v1` | `aego-road-launch-envelope/v3` | 不合法 | 不合法 | 不合法 |
| `rust/ice-measured-workflow-v3` | `tuning-workflow-result/v2` | `aego-road-launch-envelope/v3` | `aego-rally/v1` | `aego-drift/v1` | `aego-drag/v1` |

這是逐項列舉的凍結表，不呼叫會隨未來切換改變的 `production(goal)`。未知 formula、schema、model、goal/model 不符及已知但錯配的 model/formula 一律拒絕；不得落到最新模型。DangerSign 不在四模型 registry，保留獨立既有數值；EV 三個既有 formula/schema 配對沒有 ICE model，不得附上 ICE 標籤。CVT 不產生離散齒比推薦。

`RoadJointV2`、`RallyV1`、`DriftV1`、`DragV1` 依凍結 `calculate_aego_gearing_v2` 重播；`RoadLaunchV3` 使用現有 Road launch owner。此階段不把非 Road 歷史缺陷當作新候選的正確標準。

## 最小結果與診斷 schema

既有 `GearingResult` 保持 `finalDrive`、`gears`、`unsupported`、`unsupportedReason`；其中有限正數並不表示目標可行。保存仍從原始證據重建完整推薦並比對，不信任客戶端宣稱的數值、版本或診斷。

`inputSnapshot` 的後端保留欄位：

| 欄位 | 本階段契約 |
| --- | --- |
| `gearingModelVersion` | 合併 ID/version 字串。Road v2 歷史可缺少或為 `aego-road-joint/v2`；Road v3 由後端寫入 `aego-road-launch-envelope/v3`。其他歷史推薦維持原先缺少此欄位的 wire 格式。保存時先嚴格驗證，再依原 owner 重建比對。null、非字串、未知值及錯配拒絕。 |
| `roadLaunch` | 只屬於 Road v3，由後端重算；歷史 Road v2 不得附加，其他賽事不得在保存時冒稱此診斷。 |
| `gearingModelId` | 保留名稱，尚未定義獨立 ID 欄位；禁止與完整 `gearingModelVersion` 雙重宣稱。新計算丟棄此客戶端欄位，歷史保存拒絕。 |
| `gearingDiagnostics` | 保留給候選模型後端診斷。本階段沒有歷史 owner 產生此欄位：新計算丟棄客戶端宣稱，歷史保存拒絕。候選可以另行回傳診斷，但不在本階段混入正式推薦。 |

後續候選診斷至少須揭露模型版本、狀態／不可行原因、輸入來源與單位、目標、實際值、取位誤差、限制來源及未驗證假設。來源須區分工程先驗、user-observed 配件界限、合格量測；不以 `status=available` 宣稱最快或最佳。正式切換時須同時定義該結構的後端重建與比對，不能直接沿用 inputSnapshot 的物件。

原 21 組 tuning、10 組 EV golden 保持值與容差；新增 characterization 是獨立、具完整輸入與來源 SHA 的基線。正常測試只讀 fixture，沒有 regenerate 路徑。歷史 TS 是比對參考，Rust 測試與正式 workflow 才是產品證據；合成速度為純滾動運動學速度，不是可達車速或真實漂移地面速度。

完整重播數字與逐項版本差異見 [2026-11-12 characterization](aego-characterization-20261112.md)。

採用技能：`physics-tuning-math`、`modular-refactoring`、`pr-author-maintainer`、`cross-agent-collaboration`、`ponytail`。
