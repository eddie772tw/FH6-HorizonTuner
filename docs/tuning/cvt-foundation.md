# CVT foundation 與後續驗收界線

來源：[Issue #434](https://github.com/eddie772tw/FH6-HorizonTuner/issues/434)、[審查留言 6093430484](https://github.com/eddie772tw/FH6-HorizonTuner/issues/434#issuecomment-6093430484)。基準 main：`d4e0fe3762c613240f7d6902d07edcb212aa5926`。本切片與 PR #498／#499 的功能變更獨立；僅包含主線 Ruff 0.17 import 排序的最小相容修正。

本切片完成明確選擇、Rust 證據契約與安全分流。**CVT solver、終傳 ratio preview 及可套用推薦尚未實作／驗收**；`ratioPreview`、`gearing`、`recommendation` 永遠為 null，`measuredEngine`／`gearingAvailable` 永遠為 false。`captureStatus: qualified` 只表示通過版本化的資料完整性與連續性規則，不表示真實 CVT 校準或最優設定。

## 相容與能力

`isElectric` 維持原動力類型語意。新增可選的 `transmission: { type, capability }`；未提供時完整沿用既有 ICE／EV 設定、capture、儲存與 replay。明確 `type: discrete` 使用原路徑。`type: cvt` 由使用者選擇，不從車名、gear 1／2 或輪速推斷。

| CVT capability | Rust foundation 結果 |
| --- | --- |
| `unknown` 或未提供 | missing：需要確認遊戲可見能力 |
| `fixed` | unsupported：變速箱鎖定 |
| `final-drive-only` | 可以驗證 raw capture；solver 仍 unsupported |
| `simulated-gears` | unsupported：需另一個實車驗證切片 |
| EV 動力加 CVT | unsupported：目前不支援此組合 |

桌面 Step 1 提供變速箱選擇；Step 3 顯示 Rust 診斷與採樣引導。CVT 不啟動 ICE RPM sweep 或 EV 逐檔 reducer；developer 模式轉回正式 workflow，Rust AEGO 與 developer gearing 也獨立拒絕 CVT。Companion 轉送同一 Rust 結果並拒絕 CVT 的 ICE measurement commands；能力契約中的 gearing controls 保持不可用。

## Rust wire 契約

正式入口保持 `tuning-workflow-result/v1`，CVT 額外回傳 `cvt-qualification/v1` 的 `cvt` 結果。Rust 型別及純資格函數位於 [cvt.rs](../../backend-rust/src/tuning/cvt.rs)，前端只做型別、選擇、傳輸與呈現。

`evidence: { kind: "cvt-capture", capture }` 的 capture 使用 `cvt-capture/v1`：

| 欄位 | 語意／必要來源 |
| --- | --- |
| `carId`, `identity` | ordinal、performanceIndex、carClass；與 `inputSnapshot.carId`／`identity` 一致 |
| `transmission` | 完整使用者選擇，須與 profile 相同 |
| `configuration` | 設定 `id`、`source`、`reference`、`installedParts`，須與使用者獨立確認的 `inputSnapshot.cvtConfiguration` 一致；不得自動把匯入 capture 宣稱為 current settings |
| `configuration.finalDrive` | 目前遊戲可見 FD；帶來源的無因次比值 |
| `configuration.finalDriveMinimum/Maximum` | 真正可見 FD 滑桿範圍；未知不給預設，目前 FD 須位於有效範圍內 |
| `configuration.tireCircumferenceM` | 輪胎周長（公尺），來自可追溯設定／量測 |
| `configuration.ratioMinimum/Maximum` | CVT 機構限位的來源量測／可見設定；不能填研究留言的先驗值 |
| 各帶來源的數值 | `{ value: number \| null, source: "unknown" \| "game-visible" \| "measurement", reference: string \| null }` |
| `provenance` | `source`：raw-udp／decoded-websocket／session-replay；`reference`；`capturedAt`／`gameBuild`／`recorderVersion` 為原始來源記錄，未知維持 null，絕不補成現在時間或工具版本 |
| `units` | 固定 `{ timestamp: "ms", speed: "m/s", rpm: "rpm", controls: "byte", slip: "normalized-ratio" }`；不猜測／自動換算 |
| `frames` | 1–30000 筆，包含 timestampMs、identity、configurationId、speedMps、engineRpm、throttle、brake、clutch、handbrake、四輪 normalizedSlip、gear、isRaceOn |

控制輸入為原生 0–255 byte；滑移為 Forza normalized ratio，不能當物理滑移百分比。原始 UDP offset／layout 沒有變更。正規化以 Rust 解析契約為準；capture producer 必須保留原始檔與轉換來源。

資格結果包含 `captureStatus`（qualified／missing／invalid／stale／unsupported）、具 `status/code/field` 的 diagnostics、最長連續時間與該窗樣本數。它不讀 wall clock，不推測資料年齡；stale 指當前車輛、PI/Class、設定或能力與來源不一致。時間／version 未知本身保持未知，不捏造 age。

`cvt-qualification/v1` 的保守資料安全政策：時間必須嚴格增加、相鄰間隔不超過 250ms；所有身份與設定一致。只計入至少 5m/s、有效 RPM、throttle ≥250、煞車／離合／手煞車為零、race on、前進檔、四輪 normalized slip 絕對值 ≤0.1 的區段。gear 改變、RPM 相鄰變化超過 10%、速度下降或任何排除幀都切斷區段。最長區段至少 1000ms／30 筆。這些是待實車校準的安全門檻，不是已驗證 CVT 物理常數；資料斷流或倒退會 invalid，不能拼接短窗。

## 保存與重播

- `/api/tuning/workflow` 與 MCP `calculate_tuning_workflow` 共用 Rust owner；離線 `fh6-agent solve workflow --args-file request.json --data-dir <dir> --json` 使用相同判定。
- 桌面本機 `/api/tuning/cvt-evidence` POST 接受包含 `profile`、`inputSnapshot` 與 raw `evidence` 的 request，只有 foundation qualification 通過才保存。保存 `cvt-evidence/v1` 的 immutable raw JSON，原始 null 時間／版本不變；資料庫 envelope 的建立時間不當 capture 時間。
- 讀回使用 `evidence: { kind: "saved-cvt", evidenceId }`。每次從 raw 重新驗證，不信任保存的 qualification summary。缺庫先回報 unavailable，再以 SQLite read-only flags 開啟，避免 cold CLI／MCP lookup 建立空資料庫。缺庫、空庫、損壞庫或無 `road_documents` 的冷庫錯誤均不得新增檔案或修改原始位元組；正常 WAL replay 可有 SQLite 輔助檔生命週期，主資料庫與結果保持不變。
- 本切片尚無 CVT 專用 live recorder／匯入嚮導；可追溯外部 raw 檔透過正式 workflow API／離線 CLI 驗證。現有 `tuning-capture/v1` 錄製檔仍原樣可讀，不能直接冒充新的 CVT 證據。
- 舊 CLI／MCP quick solvers 仍是通用、未驗證的歷史數值契約，缺乏 CVT 選擇／證據欄位，不能作為 CVT 入口或證明。正式 CVT 結果只能經由 workflow。

## 本切片的客觀證據

[Cargo foundation 契約](../../backend-rust/tests/cvt_foundation_contract.rs) 全部使用明示 `synthetic-fixture-only` 的合成資料；涵蓋分流、能力、單位、非有限／無效／缺失通道、時間倒退／重複／中斷、車輛／PI／Class／設定變更、排除區段、來源未知、schema 版本、raw JSON／SQLite 保存與 HTTP／MCP／CLI 重播一致性。前端 Vitest 覆蓋序列化、依賴 key、CVT 不進 EV collector、Companion 命令限制，以及延遲 ICE／舊伺服器回覆。既有真實 ICE captures、EV replay 與 golden 契約保留原預期值。

## 後續真實 capture／solver 驗收

1. 至少一輛確認為 CVT 的真實遊戲車，保留 raw UDP 或可追溯 session、車型／ordinal、PI/Class、改裝、FD 與範圍、輪胎幾何、game／recorder 版本及所有來源；不明值維持 unknown/null。
2. 以實車來源取得可信 CVT ratio 限位，驗證安全政策是否保留有效 WOT RPM-speed 區段、排除起步／打滑／離合／煞車／不穩定區段；明列單位與紀錄連續性。
3. 在獨立 solver 切片驗證終傳 ratio preview、可信限位、不可達目標與不足資料的診斷，才可開啟 applicable recommendation。固定／模擬兩段及 EV+CVT 各需明確產品契約與來源驗收。
4. 桌面／Companion／CLI／MCP 的同資料 replay 結果一致，再執行遊戲內套用與重測。沒有以上證據，Issue #434 保持 open。

本 foundation 不新增最佳終傳公式、預測極速、預設 Rmin/Rmax、μ／效率、賽事偏置或未校準係數；舊理論留言只作研究背景。
