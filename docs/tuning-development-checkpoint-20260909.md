# 調校工作流與公式研究：2026-09-09 開發收尾

歷史快照：後續實作整理、目前採納範圍及2026-09-10驗證請由[調校實作與證據索引](tuning-implementation-and-evidence-20260910.md)進入。以下分支、遊戲設定及未提交狀態保留為當日紀錄。

依使用者要求，本轮先收斂實作與測試；不再開新賽事或擴充公式。整體跨車型調校研究尚未完成。本文件是目前狀態入口；其他研究文件包含歷史進度，不能將其中「目前／待完成」直接當作最新狀態。

## 版本與工作區

- 分支：`codex/fh6-tuning-meta-aego`。
- 本機HEAD及本機追蹤的origin/main均為`82ead76e31f6fa91b94f08286879134b1eec223d`。本次未fetch，不代表已重新確認遠端最新狀態。
- 所有本輪成果仍在未提交工作區，包含新文件與新模組；未commit、push、開PR或發布。
- 未新增第三方依賴、未修改UDP封包欄位偏移。

## 已實作的使用者流程

1. 在車輛參數頁設定遊戲可查的静態資料與可調上下限；分頁單位覆蓋與領域單位轉換分開處理。
2. 調校精靈先收集駕駛資料，使用解碼封包觀測引擎轉速上限與功率／扭力峰值，提示缺少的轉速區間、有效油門與換檔後穩定資料。
3. 完成量測後以快照固定靜態與動態輸入。預設自動模式不要求賽事目標速度或指定RPM，也不暗中沿用舊進階設定。
4. Step 5可輸入遊戲實際底盤、胎壓、終傳及各檔齒比，必須確認後才接受新的駕駛資料作校正。改動設定會撤銷確認；表格不是遊戲寫入介面。
5. 預設主視窗改為1600×900，啟動時配合目前螢幕可用區域縮放及定位。
6. 音訊裝置列舉改為非同步、有時間上限及快取的API，避免音訊驅動查詢阻塞後端事件迴圈。

主要程式入口：`frontend/src/features/tuning/TuningView.tsx`、`tuningMeasurement.ts`、`components/TuningMeasurementStep.tsx`、`components/Step5TelemetryCalibration.tsx`、`components/AppliedGearingTable.tsx`、`frontend/src/hooks/useTelemetry.ts`、`frontend/src/context/CarParamsContext.tsx`、`frontend/src/utils/profileUnitConversions.ts`、`frontend/src-tauri/src/main_window.rs`、`backend/main.py`。

快照目前保留於頁面生命週期，沒有完成跨重啟保存；相同性能指數的零件變更仍需使用者主動重新收集。最小採樣完整度不等於峰值或調校最佳性的證明。

## 已落地的公式及診斷修正

- 一般底盤移除下壓力彈簧補償；一般AEGO移除空力效率輸入的速度倍率。遊戲實際空力仍保留，實驗domain solver不是本輪完整改寫對象。
- AEGO既有最高檔錨點與終傳優先修正已提供調整空間，沒有再加入任意的保守係數。
- 正規化ANG／RAT不當作真實滑移百分比；原0.1推估值不再用於拒收引擎輸出量測。
- 移除單筆懸吊行程、前後胎溫差、低轉速等訊號直接生成高信心彈簧／ARB／終傳調整的相關即時規則，改為觀察與補採提示。
- Road底盤仍包含滑桿範圍及靜態配重的經驗先驗；沒有完成新的通用FWD／RWD／AWD公式。舊離線分析的診斷邏輯尚未全面同步審核。

主要程式：`frontend/src/utils/tuningMath.ts`、`tuningDiagnosis.ts`、`telemetrySlipMetrics.ts`及其測試。

## 實機證據與研究結果

- Integra已完成靜態參數、工作流資料收集、候選套用與多輪ANNA實際賽事捕捉。曾比較原Forzab、軟前彈簧、無空力公式與原／新齒比組合；整套變更不能分解成單項因果。
- 660.9前彈簧是既有三圈場中表現較好的已測候選，並非由新通用公式得出的最優值。反比剛度模型對局部行程有支持，仍不能由此推導最佳圈速或最佳彈簧；865.7探索保持暫停。
- 兩場同設定七圈資料已封存。Lap3–6圈速全距約0.566／0.520秒，Lap4／7重現局部較快走法，揭露三圈場只取單一主要飛行圈的盲區。未識別ANNA内部週期機制。
- 後續預定七圈，Lap1起跑、Lap2緩衝、Lap3–6主要比較、Lap7完賽緩衝。四圈不是四場獨立樣本，若報三場平均仍須三場實際測試。保留同圈序、同位置的動力、操控、滑移及行程比較，不以路線差或最快圈刪除資料。
- Step5已實機驗證完整實際值輸入、確認後等待新駕駛資料、齒比改動撤銷確認、改回原值也須重新確認。空值／非正齒比的原生UI禁用狀態尚未驗收，僅有單元測試。
- Dark Horse已完成遊戲靜態參數、原調校與「我的調校」入口核對。現車為S1 800 AWD，不能拿它代替RWD驗證；尚未完成同車公式A/B或有效WOT峰值驗證。
- FWD／RWD／AWD、季節輪胎、空力meta、OCR靜態導入等研究文件已整理。社群經驗與實車工程是方向依據，並未全部成為已驗證FH6公式。OCR導入仍是提案，未實作。

證據入口：[七圈驗證](integra-a700-seven-lap-validation.md)、[引擎峰值](integra-a700-engine-peak-audit.md)、[FWD公式提案](fwd-suspension-formula-proposal.md)、[Dark Horse原設定](dark-horse-reference-20260909.md)、[AEGO餘裕](aego-final-drive-headroom-audit.md)、[工作流規格](tuning-guided-measurement-workflow.md)。

## 最終本機檢查

| 命令 | 結果 |
|---|---|
| `pnpm -C frontend run test` | 96 files、673 tests通過 |
| `pnpm -C frontend run build` | TypeScript及Vite通過 |
| `uv run --no-project --python .venv/Scripts/python.exe python -m pytest tests/ -q` | 272 passed、9 deselected，15.11秒 |
| `cargo check --manifest-path frontend/src-tauri/Cargo.toml` | 通過，20.44秒；不是release打包驗收 |
| `uv run --no-project --python .venv/Scripts/python.exe ruff check .` | 通過 |
| `uv run --no-project --python .venv/Scripts/python.exe ruff format --check .` | 176 files已格式化 |
| `git diff --check` | 通過；Git提示部分檔案未來會轉CRLF |

第一次全後端測試停在直接呼叫真實音訊裝置的案例，已中止。保留原實機案例並標為host_diagnostics，新增可控speaker資料的回傳契約單元測試，未放寬既有斷言；最後完整單元測試通過不代表音訊驅動實機驗收通過。收尾格式整理限於backend/main.py、tests/test_main.py及上述測試檔。

## 停止位置與日後接續

- FH6在北部環道七圈賽前準備画面，未啟動新場；沒有活動中的本輪捕捉程序。齒比探查已選擇不套用。
- 遊戲保留前／後彈簧991.4／823.1 lb/in，終傳3.85、六檔2.12／1.59／1.23／1.00／0.83／0.72。
- Tuner Step5保留上述實際值，處於未確認狀態。
- 下一個明確候選：224058完整捕捉直接通過現行函數產生終傳4.25、六檔1.93／1.48／1.18／0.97／0.82／0.72；225514獨立完整場重播得到相同結果。尚未套用或測試，不能沿用早先4.22成績當證據。
- 使用者要求本輪收斂，故下一場及跨車驗證待重新接續；不因此宣稱整體目標完成。
