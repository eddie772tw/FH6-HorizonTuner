# Issue #487 P1：中性預覽與就地輪胎證據

此切片沿用正式 Rust workflow，不加入非中性係數、分檔 WOT 圖或頻率模型。Road、frozen legacy 與 ICE／EV 的量測資格不變。

## 預覽與套用

`tuning-workflow-result/v1` 新增 `baselinePreview`（`tuning-baseline-preview/v1`）。`rust/chassis-alignment-neutral/v1` 標識現行底盤／定位 owner 的中性預覽契約，並非新物理公式。

- Rust 由同一組底盤／定位結果產生 canonical 欄位、目前／建議／差異、受影響欄位及缺項；前端不重算差異或資格。
- `inputSnapshot.baselineCurrent` 僅是本地已套用基準的 canonical 值與單位。沒有確認的遊戲讀值時保持 null；不能把建議當成實際遊戲設定。
- 切目標只更新草稿；取消保留目前基準。明確套用會保留可用欄位並更新現行目標；重複套用不可覆寫。此操作不寫入遊戲，也不宣稱完成實車設定確認。
- 同車編輯 Rally／Drag、重量、範圍或引擎參數會讓原預覽失效，但保留草稿目標與本地已套用值；新回覆通過 context 防護前不能套用。換車或實際 live build／session identity 變更才重設草稿；初次 idle identity hydration 不重設，取消則回到已套用目標。
- 預覽 request 的 `inputSnapshot.baselineContext` 包含 UI session／identity generation、車輛與 live PI／Class、完整靜態 profile、季節、草稿目標及已套用值。Apply 另核對回覆所屬 context 與目前 phase；同車 Road→Road、ready／late 回覆及 A→B→A 不能套用舊結果。此 context 僅是 UI 失效 token，不是可信設定版本或採集 provenance。
- 缺重量／配重禁止套用；固定零件顯示 locked。未知、非法或無法涵蓋現行數值的單車彈簧／車高／ARB 範圍顯示 unavailable，不套用該欄位。其他可用欄位可以部分套用。
- 前端的單位偏好只改展示；保存及差異分析沿用 spring kgf/mm、height cm、pressure psi、angle deg、diff %。齒比仍由既有量測 workflow 使用 ratio。

## 證據與來源

`tireEvidence` 由合格 ICE capture 呼叫既有 Rust `tire_evidence::observe` 產生並快取於既有 evidence document；Step 2 胎壓／定位與 Step 3 引擎頁重用同一結果及 `TireEvidencePanel`，不再額外傳送輪胎分析請求或建立採集器。舊快取沒有摘要時由原始已保存 capture 重播，保留成功載入的原 evidence ID 與 saved-capture 來源，包括 recommendation snapshot；read-only CLI／MCP 不因此寫入資料。Cold cache 未有可信 qualified ID 時仍為 null，不造 ID。

`evidenceProvenance`（`tuning-evidence-provenance/v1`）由合格證據產生，含車輛、powertrain、identity、evidence ID、observation ID、來源與分析版本。現有 recommendation 的 `inputSnapshot` 和公式版本不改寫，避免重標歷史結果。

ICE 的 `EngineObservation.capturedAt` 是觀察建立時刻，僅呈現為 `observationRecordedAt`（Unix ms）；不能冒充採集窗口。EV 沒有對等時間或 ICE dependency key，因此保持 null。採集時間、session、設定／改裝版本、圈窗及時間窗缺乏可信來源，全部保持 null；不從目前時間、store 建立時間或任意最近幾圈補值。

完整 profile、車輛／改裝識別或本地基準變更會清掉失效證據與採集狀態；ICE archive 保存／hydration、EV async 計算和 workflow 回覆均有 context／sequence 防護。A→B→A 也不能自動復活舊結果。

證據卡固定呈現狀態、合格樣本數、具體缺項、下一步及來源。合法零保留為零，unavailable 保留 null。縱向加速度為 m/s²；normalized slip 為無因次，不是 μ、實體百分比或最大抓地力識別。四輪溫度保留左前／右前／左後／右後順序。現有 EV capture 沒有所需完整輪胎通道，明示 unavailable；懸吊分布也沒有合格設定版本契約，保持 unavailable。

## 驗證邊界

Rust 契約涵蓋現行中性輸出、重量／配重、能力鎖定、範圍、canonical 單位、零與未知、來源及錯車／錯模式；前端 DOM／hook 契約涵蓋草稿、取消、重複套用、目標／車輛／模式／capture 變更、舊 async 回覆、翻譯、焦點與樣本／來源／單位可見性。

DOM fixture 及既有可重播資料只能證明程式契約。本輪沒有新增真實 FH6 或 Android 證據；缺少設定版本與採集窗口時不能宣稱同設定 A/B。窄畫面使用既有 tokens 和可換行 grid；雲端 Chromium 的 sandbox 啟動失敗，因此窄畫面／主題視覺驗收仍待可用瀏覽器完成，未關閉 sandbox 或更改系統權限。
