# Drag 聯合起步／末檔候選 v1

模型識別為 `aego-drag-joint/v1`。本候選只處理離散 ICE 的 4–10 檔；
PR #656 不切換正式 workflow，不改歷史 `aego-drag/v1`、底盤、EV、CVT、
DangerSign 或 legacy CLI/MCP。有限正數齒比不代表目標可行或最佳 ET。

## 目標、單位與來源

末速定義為**末檔在合格功率峰值 RPM 的純滾動輪速對應速度**，單位 km/h。
這不是滑移中的地面速度、阻力平衡能力或紅線車速。新模型明確記錄此繼承假設，
不聲稱峰值功率 RPM 就是最佳通過終點轉速。`max_rpm` 是後端合格可用轉速上限；
workflow 候選從原始 capture 的重播資格與 effective limit 取得，不採信前端裸峰值。

- 有明確目標時，`dragFinishSpeedKmh` 必須與 `dragFinishSpeedProvenance` 成對提供。
  來源接受 `manual`／`telemetry`，但診斷明示 `caller-declared-*` 與
  `finishEvidenceVerified=false`，標籤本身不會升級為後端已驗證的遙測末速。
  secondary correction 有任一末速欄位時必須在同一入口提供完整成對資料，並優先於
  profile；不可把 profile 的來源借給 secondary 的另一個數字。
- 無明確末速時，沿用 `410 × (HP/kg)^0.30 × (1+0.12×aeroEfficiency)` 工程先驗。
  來源為既有 [Drag 研究紀錄](../archive/tuning/drag-meta-iteration-20260913.md)，
  並非 FH6 官方物理規格或已校準最優解。缺 aero 值時採明示的 0.5 工程先驗。
- 起步端同樣在功率峰值 RPM 定義第一檔輪速：FWD 100、AWD 110、RWD 125 km/h。
  這些繼承工程目標在本候選中是硬約束，不是抓地力、起步方法或實車加速保證。
  末檔目標必須大於起步目標；例如 40 km/h 與 AWD 110 km/h 互相矛盾，回報
  「在本模型工程約束內無解」，不宣稱實車物理上不可能達到 40 km/h。
- FWD 使用明示前輪尺寸，RWD/AWD 使用明示後輪尺寸；缺尺寸不補固定半徑。

`simulatedTopSpeed`／`softMaxSpeed` 是獨立的傳動預覽約束，均不是實測能力。
由可用轉速上限的預覽速度按 `peakPowerRpm / usableLimitRpm` 轉為參考 RPM 約束。
無明確末速時可縮小工程先驗，例如 330 km/h、5000/7500 RPM 得到 220 km/h；
有明確目標時不改值，若超過預覽約束則回 unavailable，保留原目標並列衝突原因。

## 先固定的硬約束與折衷順序

1. 輸入有限、正值、合法驅動與可用 RPM，離散 ICE 且為 4–10 檔。
2. 終傳及逐檔在來源明確的範圍內，0.01 刻度、嚴格遞減，不複製高檔。
3. **取位後起步與末檔均符合 `max(1 km/h, 目標×2%)`**。此容差在配置前固定，
   不依結果調整。最終 `dragFinishAvailability` 記錄目標、實際值與容差。
   兩個目標速度下所需的實際 RPM 也不得超過合格有效上限；僅速度誤差合格不足以
   證明限轉內可達目標，配置前的端點刻度區間與重配後重驗均包含此限制。
4. 僅在以上均符合後，偏好兩端總比間的幾何分配及繼承末檔錨點
   （4 檔 1.00、5–6 檔 0.90、7–10 檔 0.82）；不使用 Road 的逐檔 RPM 政策。

預設 FD 2.0–6.1、每檔 0.1–6.0 只是模型先驗，不能當成遊戲滑桿範圍。
可選 `profile.dragObservedBounds={source:"user-observed",finalDrive:{min,max,step:0.01},
gears:[每檔範圍]}` 完整替代先驗範圍；超出先驗但觀察合法的解不會被悄悄截回。
歷史首檔 2.2–5.0 的 clamp 改為診斷偏好，避免它破壞起步硬端點。
取位後若沒有完整合法候選，返回空齒比與 unsupported，不以 clamp 後的數字冒充達標。

每個終傳候選先由兩端速度容差反推齒比刻度區間，再做前綴上界／後綴下界包絡，
保留其餘檔位嚴格遞減所需空間；依總比幾何偏好配置並最終重驗兩端。
合法候選以總比對數偏差平方與小權重末檔偏好排序，同分保留較低 FD，確保可重播。
每個範圍最多 10,001 刻度且刻度值不超過 i32 上限，是資源／數字表示限制，
不是遊戲配件規格。成本 O(FD 刻度數 × 檔數)。

## 正式來源邊界與歷史比較

`workflow::measured_drag_candidate` 是明確 opt-in 的候選邊界：驗證既有
`QualifiedEvidence` 身分與引擎依賴，採後端重播的峰值／有效上限，從 profile 取得
末速，再以 `None` secondary 呼叫候選。它不建立可套用推薦，不切正式路由。
正式計算、保存、重播的切換留給 #657；拒絕候選不得包裝成可套用推薦。

`tests/fixtures/aego_drag_joint_v1.json` 記錄合成輸入與預先固定容差；
PR #652 另有具來源 SHA 的完整 Rust／歷史 TS characterization。對同組輸入，
目前 Rust profile 40 得 FD 6.1／末檔 1.43，secondary 40 得末檔 1.35，兩者均未標
unsupported；#335 確切 TS 相同齒比卻會拒絕。本候選在配置前識別兩端矛盾並拒絕，
其餘可行目標則於最終取位後重新驗收，不重寫歷史 owner 的數值或資格。

等價重配後，`respects_hard_targets` 由模型 owner 檢查兩端、刻度與遞減；
`adjusted_diagnostics` 依實際選擇的終傳／齒比重算兩端 actual／error 與
`dragFinishAvailability`，保留原目標、來源與容差。診斷必須由後端原始輸入重建，
不可接受前端提供的物件；不能沿用重配前的實際值來宣稱調整後仍符合目標。
`actualLaunchRpmAtTargetSpeed`／`actualFinishRpmAtTargetSpeed` 額外揭露取位後
在指定速度所需的 RPM，以便核對有效限轉。

## 未驗證界線

模型不新增固定 μ，也不宣稱最佳起步、最短 ET、風阻能力或真實末速。
仍待獨立 FH6 A/B：輪胎滑移、換檔延遲、離合器、不同賽道長度／坡度、車種與升級。
合成契約、來源重播及 CI 只證明工程與產品邊界，不能代替實車性能驗收。

採用技能：`physics-tuning-math`、`modular-refactoring`、`pr-author-maintainer`、
`cross-agent-collaboration`、`ponytail`。
