# EV 測量與 AEGO 基礎模型

狀態：本地實作與回放驗證。Issue #435；CVT / #434 暫不納入。分支 `codex/aego-ev-foundation-435`，起點 `10a1ad2`。

## 使用方式與範圍

車輛參數及 Tune 步驟 1 提供可儲存的 `isElectric` 開關。啟用後隱藏傳統 4–10 檔數量欄位；關閉時恢復原值。舊車輛設定缺此欄位等同 false。沒有自動把怠速 RPM = 0 的瞬間判斷寫成車輛類型：本次 Taycan 預檢曾出現非零 idle metadata，單一訊號不足以可靠覆寫使用者設定。

前端仍是「目標設定 → 底盤輪胎 → 動力量測與齒比 → 設定驗證」。EV 在同一個第三步顯示獨立的收集與計算畫面：

1. 列出**所有前進檔**，單速保留一列、雙速增加至兩列。抄入遊戲有顯示的終傳及各檔比值；未顯示的數值留空（以 null 保存）。終傳與每個檔位的可調能力分別確認，預設皆為鎖定，不能沿用傳統 gearbox 預設 Full。
2. 開始收集後切回遊戲，各檔分開進行全油門固定檔測試。換檔後最初 300 ms 不納入；不需要非零怠速，也不要求 ICE 峰值扭力或功率轉速。
3. 完成後暫停收集，計算實測基準；只有確認終傳可調、且基準終傳值已知時，才開放候選終傳預覽。終傳鎖定或所有比值未知，也可建立逐檔實測基準。
4. 結果可進入相同的設定驗證流程。候選值需在遊戲內確認可調範圍，軟體的輸入防呆界限不代表遊戲滑桿範圍。

**單速 EV 為正式支援的輸入形狀**：只有第一檔也可量測、計算與進入步驟 4，不會自動補出第二檔。最多接受十個前進檔；已知的相鄰比值須依序遞減。必須由使用者確認已列出所有檔位，因為單靠已觀測檔位不能證明車輛沒有未測的更高檔。只收集到雙速車的第二檔不會被當成完整單速車。

**檔位數與可調能力相互獨立**：每檔的 `gearAdjustable` 及 `finalDriveAdjustable` 預設 false。鎖定或未知比值不會列為步驟 4 待套用的設定，亦不會以 0、1 或慣用比值補齊。模型本版只改變終傳候選；各檔可調標記用來保護驗證清單，不表示已實作各檔齒比最佳化。未知終傳無法進行終傳變更預覽；已知且可調的終傳可依實測 k 映射推算，即使個別齒比被鎖定且未顯示，也無須猜測其數值。

EV 設定隨車輛參數保存。量測在本次程式工作階段內跨頁保留，最多 30,000 個 decoded WebSocket frames；需在重新收集、變更設定或關閉程式前匯出 `ev-capture/v1`。本版不把 EV scan 寫入 `engine-observation/v1`，也沒有 EV 歷史量測匯入功能。Companion 讀到相同 EV 計算結果，但量測操作須使用電腦端 EV 控制；其傳統引擎量測命令會明確拒絕。

## 平行模組

| 職責 | 傳統引擎 | EV |
| --- | --- | --- |
| 量測 | `features/tuning/tuningMeasurement.ts` | `domain/tuning/ev/measurement.ts` |
| runtime | `TuneSessionProvider.engineMeasurement` | 獨立 `useEvMeasurementSession` |
| 量測結構 | `engine-observation/v1` | `ev-measurement/v1`、`ev-capture/v1` |
| TS 計算 | `utils/tuningMath.ts` | `domain/tuning/ev/solver.ts` |
| Rust 計算 | `backend-rust/src/tuning/gearing.rs` | `backend-rust/src/tuning/ev.rs` |
| 驗證快照 | `tuningMath/measured-workflow-v1` | `ev/measured-workflow-v1` |

`calculateWizardMeasuredGearing` 只負責選擇模型。EV 無有效結果就返回 unavailable，不把 EV 資料轉成 ICE peak inputs。直接呼叫的舊 TS/Rust gearing solver 也會拒絕 EV profile；驗證快照拒絕車輛模式與計算結果模式不一致的輸入。底盤與輪胎估算維持共用。

切換車輛、模式、動力參數、量測時齒比配置或可調能力會清除 EV 結果；car ordinal、PI、class 改變或時間戳回退會中止收集。背景 dyno polling 不會覆寫 EV 設定。畫面更新至多每 200 ms，量測使用插值之前的 decoded frames，無額外 UDP listener。傳統參數頁的延遲自動儲存會使用該次編輯的 snapshot，避免 EV 開關寫回前一版值；保存失敗不會啟動量測。

## 數學與量測條件

逐檔記錄正功率、正扭力資料，按 500 RPM 分箱。負功率（回充）不納入驅動曲線；零輸出仍保留於完整匯出與獨立計數。持續正功率平台**不會**判為 cutoff。至少三個高轉速零功率樣本才標記「觀測到輸出中斷」，不宣稱辨識到實際控制器或保證它是馬達硬限轉。

每檔需至少 3 秒相鄰正輸出資料、90 個正輸出樣本、8 個各含至少 3 樣本的 RPM 分箱；低／高轉涵蓋門檻為遊戲回報上限的 40%／85%。超過 100 ms 的採樣間隔不累計時間。這些數字是本版品質門檻，**不是跨車校準後的物理常數**。

速度映射另要求車速 ≥40 km/h、方向輸入絕對值 ≤5、四輪 normalized slip 絕對值 <0.1、四輪輪速皆有效。至少 30 個樣本，RPM／車速以及 RPM／前後軸輪速的變異係數均 ≤2%。Normalized slip 不是實體打滑百分比，更不是輪胎 μ。

對每檔估計 `k = mean(RPM / speedKmh)`。有顯示齒比的檔位，其 `k / enteredGearRatio` 須在第一個已知比值的 ±5% 以內，避免混用不一致設定。未知齒比不參與此檢查，也不反推出名義齒比。候選終傳預覽假設同一終傳變更對每檔的映射具有相同比例，這項跨設定推算仍需遊戲 A/B 測試確認：

```text
scale = candidateFinalDrive / measuredFinalDrive
boundarySpeedKmh = observedBoundaryRpm / (k * scale)
```

無零輸出證據時 boundary 是**已量到的最高轉速範圍**，不是推定限轉。功率平台區間由至少 3 樣本的分箱求峰值，再標記達到該峰值 95% 的已觀測區間；它不代表最佳換檔點。模型不把單一 CurrentEngineRpm 解釋為某顆實體馬達轉速，前後軸比值只用來檢查映射穩定性。

結果是可解釋的量測基準與終傳變更預覽，目前**不做**自動最佳起步齒比、輪胎抓地力辨識、效率圖、道路阻力／實際極速預測、換檔損失或最佳換檔點求解。各賽事目標使用同一個 EV 基礎動力模型；沒有把傳統引擎的賽事齒比啟發式移植進來。

## 實測來源與工程來源

原始資料來自使用者手動操作的改裝 Taycan Turbo S（CarOrdinal 3445、PI 795、AWD），FD 4.03，一檔 4.00，二檔 2.00 → 2.20 → 2.00。A1 分別測第一、第二檔，B／A2 只測第二檔。整車實機資料目前只有此雙速 EV；單速案例驗證的是軟體契約，尚未用真正單速 EV 車款實機驗收。

`tests/fixtures/ev_taycan_replay.json` 記錄來源 run 名稱、SHA-256 與所需通道；約 20 Hz 取樣，保留所有全油門零功率樣本，移除位置等無關通道。`scripts/extract_ev_replay.mjs` 可由原始 runs 重建。原始 NDJSON 保留在既有研究工作區的 scratch；本分支不修改原始錄製。

回放測試驗證二檔比例約 +10% 並於回復後回到原值，A1 第二檔沒有被誤標輸出中斷，B／A2 的高轉速零功率仍可辨識。這是既有實機資料回放，不等於新 UI 已經過使用者操作遊戲驗收，也不是任意 EV 的精度保證。

- [Porsche：Taycan powertrain](https://newsroom.porsche.com/en/products/taycan/powertrain-18555.html)：原車後軸具兩速變速箱，第一檔偏重起步、第二檔偏重高速效率。此來源支持不能把所有 EV 視為單速，**不證明遊戲實作完全對應實體結構**。
- [MathWorks：Field-Weakening Control](https://www.mathworks.com/help/mcb/gs/field-weakening-control.html)：基速以上可進入低扭力、近恆功率工作區。它支持正功率平台不可直接視為 ICE 限轉；沒有將其中的馬達參數套入遊戲。

## 驗證

- 原有前端基線：1,004 tests。
- 前端最終：1,030 tests / 145 files、TypeScript 與 production build 通過。
- Rust 完整 gate：87 passed / 3 ignored；Cargo fmt 通過。三個 ignored 為既有選用測試，未作為通過項目計數。
- EV unit / replay：單速、多速、全鎖定、僅終傳可調、未知比值、缺檔、未確認設定、錯誤齒比、missing channels、回充、煞車／離合器、恆功率平台、時間戳／車輛變更、模式分流。
- `tests/fixtures/ev_golden_fixtures.json` 同時由 TS、Rust 讀取。單速 fixture 使用一段已量測第一檔輸入，僅作單檔契約測試。
- `scripts/verify_ev_browser.cjs` 為選用瀏覽器測試：所有後端 HTTP／WebSocket 都由 mock 接管，重播真實錄製通道。已驗證開關互斥、保存再載入、跨步驟、僅終傳可調的雙速及全鎖定／未知比值的單速、步驟 4 gating、模式失效、六種 theme/core 組合及繁中標籤。不向遊戲或真實 UDP/backend 注入測試資料。

```powershell
pnpm --dir frontend test
pnpm --dir frontend run build
cargo test --locked --manifest-path backend-rust/Cargo.toml -j 1 -- --test-threads=1
# 另啟獨立 Vite port，再執行選用 smoke；PLAYWRIGHT_MODULE 可指定已安裝的模組路徑。
pnpm --dir frontend exec vite --host 127.0.0.1 --port 1421 --strictPort
node scripts/verify_ev_browser.cjs
```

Windows 全量 Rust 平行編譯曾受系統 commit memory 限制而失敗；單工重試通過，未更動系統分頁檔或既有遊戲／開發服務。

## 實作交接

- Task / Status：Issue #435 EV 基礎模型，`done`（實作與本地驗證範圍）。
- Owner：Codex 主代理持有全部寫入；Luna 只讀研究與最後審查。已補上其指出的快照模式一致性檢查，含雙向回歸測試。
- Branch：`codex/aego-ev-foundation-435`，獨立工作樹；未切換原有遊戲量測開發服務。
- Scope / Changed：上述 TS/Rust EV domain、車輛模式與可調能力、量測 runtime、四步流程分流、驗證快照、Taycan 回放 fixtures、中英文 UI 與文件。未更動 UDP 格式、Release 版本或原始錄製。
- Skills：`physics-tuning-math`、`modular-refactoring`、`halfmoon-design-system`、`huge-component-refactoring`、`cross-agent-collaboration`、`ponytail`。
- Pending / Next action：後續由使用者操作遊戲，驗收新 UI 的 Taycan 與真正單速 EV 流程，再進行終傳 A/B 校準；完整最佳化與 CVT 另行處理。
- Blocked by：None。Verification：見上節命令與結果。Last updated：2026-09-27。
