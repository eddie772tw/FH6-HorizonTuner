# CLI、MCP 與前端算牌共用契約

CLI 與 MCP 的一般底盤／齒比算牌委派至前端 `tuningMath.ts`。Python 僅轉接輸入、啟動運算程序及序列化輸出，不保留另一份近似公式。

## 已確認的差異

舊 CLI 不只多出空力補償。Road／Rally 彈簧使用車重倍率，前端則使用遊戲彈簧上下限；Drift、Drag、差速器、胎壓、定位與齒比也各有不同實作。舊 `AppliedTuningSetup` 把 lb/in 彈簧直接寫入應為 kgf/mm 的欄位，並把車高固定為 12 cm。MCP 原本另有第三份公式。

例如 1500 kg、54% 前重、AWD、Road、Summer，未提供彈簧上下限時：

| 項目 | 舊 CLI | 前端／共用入口 |
|---|---|---|
| 前／後彈簧 kgf/mm | 22.32／19.02 | 69.4／60.6 |
| 前／後加速差速器 | 30／65 | 15／75 |
| 後軸扭力分配 % | 65 | 66 |
| 前／後外傾角 | -1.8／-1.2 | -2.1／-1.3 |
| 後胎冷壓 PSI | 28.5 | 27.3 |

這是實作一致性案例，不是該車的建議實車設定。未輸入上下限時會沿用前端的通用預設；應使用遊戲實際數值，不能把通用預設當成已量測的車輛規格。本次未變更前端公式，也未將自然頻率研究模型升格為產品公式。

## 呼叫路徑

```text
CLI solve / MCP solver
  → backend/tuning_solver_client.py（JSON transport）
  → Node headless runner
  → frontend/src/domain/tuning/solverService.ts（輸入／輸出 adapter）
  → tuningMath.ts + tuningDiagnosis.buildBaselineSetup + units.ts
```

- 開發工作樹：runner 透過現有 Vite 載入目前的 TypeScript 原始碼，不讀取舊的算牌 bundle，也不需要啟動 UI、HTTP 或遊戲。
- 打包：`pnpm -C frontend run build:solver` 產生 `frontend/dist-solver/tuning-solver.mjs`；CLI／sidecar spec 收錄同一產物。一般 frontend build 也會執行這個步驟。CI 用 commit 對應 artifact 傳遞，不另外維護公式。
- 執行算牌需要 Node.js 22.12+；原始碼模式另需安裝既有 frontend dependencies。打包後仍需要 Node.js，不再宣稱算牌完全不需要外部 runtime。缺 runtime、缺 bundle、錯誤回應或超過 30 秒均明確失敗，沒有 Python fallback。
- MCP 算牌在 worker thread 中等待，避免阻塞 API／遙測事件迴圈。

## 與 UI 完全對齊的输入

```powershell
.\fh6-agent.bat solve workflow --input docs/examples/shared-tuning-request.json --json
```

也可用 `--input -` 從 stdin 讀取 JSON。範例是示意參數，請換成 UI 同一份車輛資料。

`tuning-solver/v1`：

- `action: workflow` 呼叫 UI 相同的 `calculateWorkflowTuning`；`goal` 為 `Road|Rally|Drift|Drag`，`season` 為四季英文名稱。
- `params` 對應 `TuningCarParams`。重量 kg、前重百分比、彈簧 kgf/mm、車高 cm、胎寬 mm、扁平比 %、輪圈 inch；扭力預設 Nm。直接帶入儲存的 lb-ft profile 時指定 `torqueUnit: lb-ft`，使用前端相同轉換。
- `engine` 提供 `maxRpm/maxHpRpm/maxTorqueRpm`，或設 `null`。資料未符合前端引擎門檻時，`workflow.gearing` 為 `null`，仍可取得機械基準。
- `correction` 可傳遞前端的事件目標 `targetSpeedKmh/targetRpm`，或既有修正欄位；省略表示一般自動計算。
- 輸出 `workflow` 是前端同型別結果；`appliedSetup` 使用同一個 `buildBaselineSetup`，單位為 kgf/mm、cm、PSI。`input` 記錄送入公式的參數，`source` 記錄來源。

## 簡易指令相容範圍

`solve chassis/gearing/full` 保留命令形式，輸出值改為共用函式的結果。簡易旗標沒有提供的輪胎、彈簧限值與引擎資料會使用前端既有 fallback；需完整對齊車輛時用 `solve workflow`。

舊 `--aero-f/--aero-r` 是 lbf，只記錄於 `ignoredLegacyAeroLbf`，不冒充前端 kgf 欄位；一般底盤公式本來就排除空力，這些旗標不改變算牌結果。

`solve gearing --top-speed` 對應事件目標速度，`--peak-hp-rpm` 對應目標 RPM；它不是自動估計的車輛極速。`--tire-diameter` 的 cm 轉成輪胎半徑後，使用與前端相同的 AEGO 核心。`solve full` 將相同用途與車輛參數傳給齒比，不再用另一套 RWD／Road 預設。

AEGO 的相鄰齒比步距不固定，輸出改為 `powerband_retention_ratios` 陣列，另保留 `target_fit`，不再宣稱單一固定 retention ratio。`ride_height.front/rear` 為 cm 數值；Preset 彈簧與車高使用前端單位，保留完整齒比 snapshot，`gameBuild` 未知時為 `unknown`。

此契約只涵蓋一般算牌與設定匯出。既有 `telemetry diagnose` 的症狀／溫差提示不是這個 solver 的一致性證明，也不是已驗證的閉環最佳化結果。

## 驗證分層

- Vitest：四用途×三驅動×四季逐欄對比 UI 函式；另核對扭力轉換、引擎門檻、空力排除、輪胎幾何、事件目標及真實 headless runner。
- Pytest：確認 CLI／MCP 轉交完整輸入、不自行計算、回傳共用結果、保持單位，以及 runtime 缺失、逾時與錯誤回應不產生替代數值。MCP 測試也確認算牌不在事件迴圈執行緒執行。
- 本機實際 CLI 與生成 bundle 使用同一輸入比對；這些是公式／傳輸一致性驗證，不是 FH6 實車性能、完整 UI 匯入或乾淨機器上的 exe 發行驗收。
