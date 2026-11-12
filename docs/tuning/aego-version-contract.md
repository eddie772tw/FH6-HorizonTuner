# ICE AEGO 獨立版本與保存契約

#658 移除已退役公式的執行；歷史資料轉為[唯讀封存](model-retirement.md)。本文件描述現行版本，取代 #652 的凍結 solver 回放規則。

## 獨立責任

| 版本 | 責任 |
| --- | --- |
| `tuning-workflow-result/v1`／`v2` | ICE 工作流程與底盤選擇；不是齒比公式版本 |
| `tuning-workflow-result/v3` | 獨立確認的 EV workflow |
| `loaded-sweep/v4` 等 | 量測分析與原始證據資格，不由前端峰值決定 |
| `rust/chassis-load-baseline/v1` | Road／Rally 工程底盤；其他現行底盤 owner 另行保留 |
| `rust/ice-measured-workflow-v4` | 新 ICE 推薦的組合與保存版本 |
| 個別 gearing model ID | 四賽事各自的 Rust 策略、目標與重驗規則 |

## 現行四模型

- Road：`aego-road-launch-envelope/v3`
- Rally：`aego-rally-joint/v1`
- Drift：`aego-drift-working/v1`
- Drag：`aego-drag-joint/v1`

DangerSign 不進入四模型 registry，不新增第五個模型 ID。EV／CVT 維持自身契約。

ICE v4 snapshot 由後端寫入 `workflowSchemaVersion`；四模型另明列 `gearingModelVersion`、`gearingModelId` 與 `gearingDiagnostics`。Road 的 `roadLaunch` 只屬於 Road。後端保存會載入原始合格 evidence、重算推薦與等價重配，並比對完整內容。缺必要標籤、未知版本、goal/model 錯配及數值／診斷篡改均拒絕；客戶端宣稱不是資格來源。

`gearingView` 是工作流程回應的顯示資料，不是可保存的資格來源；輪軸、輪徑及有效 RPM 都由後端提供。

## 歷史資料

TS `tuningMath/measured-workflow-v1`／`ev/measured-workflow-v1` 與 Rust ICE workflow v1／v2／v3 不再重算或保存為合格推薦；退役 ID 只供分類，不再是 enum variant 或 solver。即使放進 v4 snapshot 也不能恢復執行。

原記錄的 formula/model/schema、輸入、數值與來源保留，不能改標籤或以最新結果回填。重新計算須完成現行必要輸入與證據，建立新記錄。Rust EV v1／v2／v3 的獨立保存與資格契約不變。

數值為工程約束內的結果，不是實車最優證明；資格、單位、來源、未知及不可行狀態須如實呈現。
