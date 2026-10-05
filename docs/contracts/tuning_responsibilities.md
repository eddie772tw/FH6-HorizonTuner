# 車輛調校與齒比算牌責任契約 (Tuning & Gearing Responsibilities Contract)

- **版本 (Version)**: 1.7.1
- **狀態 (Status)**: 正式架構契約 (Architecture Contract)
- **管轄範圍 (Scope)**: 車輛底盤調校（防傾桿 ARB、彈簧、車高、阻尼、差速器）與 AEGO 齒比計算邏輯
- **關聯 Issue**: #423 (前後端調校與遙測責任釐清 Stacked PR 1-4)

---

## 1. v1.7.1 後端唯一 owner

經使用者明確授權，此方向取代 #430 的 Twin SSOT 與 #428 的 WASM 討論。所有會影響產品建議的公式、資格、預設、限制、readiness 與數值診斷必須有 Rust owner；UI 保留草稿、流程、格式、顯示單位轉換與版面。

目前已落地：
- `tuning::workflow` 是一般模式的推薦、能力過濾與 readiness owner；本機 `POST /api/tuning/workflow`、離線 `fh6-agent solve workflow --args JSON` 與 MCP `calculate_tuning_workflow` 呼叫相同 Rust library。
- TuneSessionProvider 只送完整草稿／goal／season／量測證據；桌面與 Companion 消費同一結果。完整輸入 key、abort、sequence、render-time invalidation 防止切車／改稿／A→B→A 舊回覆；pending、error 與 ready 分開，失敗每兩秒重試，不使用 TS fallback。
- `measurement` 擁有 loaded-sweep/v4、archive 資格與 capture replay；`ev_measurement`／`ev` 擁有 EV 觀測與求解；250ms 有界增量批次處理，非每一 telemetry frame 或 Companion 400ms exchange 重算。capture replay 在 receiver mutex 外執行。
- `alignment`／`chassis`／`gearing` 擁有機械模型；`tire_evidence` 擁有輪胎證據診斷；`profile` 擁有既有桌面預設與 EV profile 資格；`capabilities` 擁有實驗模式能力契約。Road 量化診斷維持 `backend-rust/src/road/` owner。
- `dyno_guidance` 擁有舊 dyno wizard 的數值門檻、建議測試檔位與峰值匯入；guidance 隨既有 telemetry 推送，實際 dyno 採樣仍由 Rust `telemetry/dyno.rs` 的獨立品質契約控制。
- 量測來源不接受客戶端峰值／聚合 moments 自行宣稱 measured。`evidence` 使用 `saved-engine` observationId 或 `saved-ev` evidenceId；Rust 從不可變原始 capture 重播、檢查車輛／PI／class／profile dependency，再產生有版本的 backend-only qualification cache。離線 CLI 可讀本機保存證據，或用 `--args-file PATH` 提供完整 capture 由同一 library 重播；裸峰值不會產生 measured readiness／推薦。外部 capture 明確標記 `imported-capture`，不等同硬體來源認證；正式保存仍必須有 backend-issued evidenceId。MCP 與 CLI 為唯讀：可重用現有資格 cache，cold-cache 則純重播並標記 imported-capture，不會新增資格紀錄；數值 owner 不因此分叉。
- EV 原始 frames 與 backend-qualified evidence 都不可變保存；`ev-preview` 回傳明確 `unverified-preview`，正式 `ev-gearing` 必須提供 evidenceId。保存推薦時從 backend-owned qualification metadata 重新組合並比對欄位與來源；不相信 snapshot 的峰值／moments，也不在 receiver mutex 內 replay capture。
- Road 新推薦使用 `rust/ice-measured-workflow-v2`／`aego-road-launch-envelope/v3`；非 Road ICE 仍為 `rust/ice-measured-workflow-v1`，EV 為 `rust/ev-measured-workflow-v1`。Road v1 歷史依凍結 v2 owner 驗證，詳見 [#462 修正](../tuning/aego-road-launch-v3.md)；EV 保存驗證後端資格來源與推薦一致性，未知／鎖定齒比不套用。歷史版本唯讀，不重寫。
- 計算 API 不擴大 LAN allowlist；純函式共享 library 保留離線 CLI。Vite build 拒絕將凍結 TS tuning solver／readiness／diagnosis 參考模組帶入產品 bundle。
- Road/Rally 正值 spring/height minima 保留小於 1 的數值；零值使用既有桌面預設，反向範圍把 max 提升到 min。靜態定位保留 JS 原運算順序與 toFixed 精確 binary rounding，不能以縮放 round 取代。

模型版本與相容入口：
| 模型 | 入口／用途 |
| --- | --- |
| `rust/ice-measured-workflow-v2`（Road）、`rust/ice-measured-workflow-v1`（其他 ICE／歷史）、`rust/ev-measured-workflow-v1` | 桌面、Companion、workflow API、CLI、MCP 共用 |
| `legacy-cli/v1` | 舊 `solve chassis/gearing/full`；保留歷史數值與 wire schema `tuning-dev/v1` |
| `legacy-mcp/v1` | 舊 MCP quick chassis；Drift 公式不同於 CLI，獨立凍結 |
| `legacy-desktop-experimental/v1` | 實驗 UI 呼叫 Rust developer model；保留既有 48 組 fixture 與 `tuning-dev/v1` output schema |

TypeScript 舊純模型已隔離於 `frontend/test-reference/tuning/`；產品純型別位於 `frontend/src/domain/tuning/types.ts`，只描述資料形狀，不包含公式、數值預設、資格或 readiness 判定。未掛載的 Step5TelemetryCalibration／DiagnosisPanel 已移除。Vite 在 tree shaking 前阻擋直接、間接與動態 runtime dependency，錯誤包含 importer 與 target。圖表 RPM／速度軸幾何與真正顯示單位轉換屬顯示用途，不產生設定建議。

PR #460 經使用者授權與全量驗證已合併入 main（v1.7.1）。

相容性：原 21 組 tuning 與 10 組 EV golden fixtures 不可重寫，缺少 fixture 必須測試失敗。
新增 `mechanical_desktop_v162.json` 鎖定 66 組 main ca195c7 桌面行為；正常測試不得產生它。
CLI 與 MCP 雖曾同標 `tuning-dev/v1`，其 drift 數值不同，必須保留不同明確版本，不得以同名模型合併並改寫輸出。
歷史推薦保持唯讀，未知／鎖定齒比維持 null/unapplied，EV 不可退回 ICE。

---

## 2. 領域資料結構規格 (Domain Data Contract)

### 2.1 車輛輸入參數 (`TuningCarParams`)

| 欄位名稱 | 型別 | 單位 | 限制與預設值 | 說明 |
| :--- | :--- | :--- | :--- | :--- |
| `weight` | `float` | kg | $> 0$, 預設 `1400.0` | 車輛總重量 |
| `weight_distribution` | `float` | % | `[1.0, 99.0]`, 預設 `50.0` | 前軸車重分佈百分比 |
| `drivetrain` | `enum` | - | `"AWD"`, `"RWD"`, `"FWD"` | 驅動方式（預設 `"RWD"`） |
| `maxHp` | `float` | HP | $> 0$, 預設 `300.0` | 最大馬力 |
| `maxTorque` | `float` | N·m | $\ge 0$, 若為 0 由馬力與扭力轉速推估 | 最大扭矩 |
| `maxHpRpm` | `float` | RPM | $> 0$, 預設 `maxRpm * 0.85` | 最大馬力輸出轉速 |
| `maxTorqueRpm` | `float` | RPM | $> 0$, 預設 `maxRpm * 0.60` | 最大扭力輸出轉速 |
| `aero_downforce_front` | `float` | kgf | $\ge 0$, $\le 0$ 時自動解析 | 前軸空氣下壓力 |
| `aero_downforce_rear` | `float` | kgf | $\ge 0$, $\le 0$ 時自動解析 | 後軸空氣下壓力 |
| `spring_front_min` / `max` | `float` | kgf/mm | `[10.0, 120.0]` | 前彈簧滑桿上下限 |
| `spring_rear_min` / `max` | `float` | kgf/mm | `[10.0, 120.0]` | 後彈簧滑桿上下限 |
| `height_front_min` / `max` | `float` | cm | `[10.0, 25.0]` | 前車高滑桿上下限 |
| `height_rear_min` / `max` | `float` | cm | `[10.0, 25.0]` | 後車高滑桿上下限 |
| `roadAwdRearPercent` | `float` | % | `[0.0, 100.0]`, 預設後偏置 | Road AWD 中央差速後軸分配比 |
| `rallyProfile` | `enum` | - | `"mixed-surface"`, `"cross-country"` | Rally 專屬地表分流 |

---

### 2.2 底盤輸出規格 (`ChassisTuningResult`)

所有數值需經由安全範圍 Clamping 與保留 1 位小數（Diff 為整數或 1 位小數）：

```typescript
interface ChassisTuningResult {
  arb: {
    front: number; // [1.0, 65.0]
    rear: number;  // [1.0, 65.0]
  };
  springs: {
    front: number;   // [kMinF, kMaxF] kgf/mm
    rear: number;    // [kMinR, kMaxR] kgf/mm
    heightF: number; // [hMinF, hMaxF] cm
    heightR: number; // [hMinR, hMaxR] cm
  };
  damping: {
    reboundF: number; // [1.0, 20.0]
    reboundR: number; // [1.0, 20.0]
    bumpF: number;    // [1.0, 20.0]
    bumpR: number;    // [1.0, 20.0]
  };
  diff: {
    accelF: number;     // [0, 100] %
    decelF: number;     // [0, 100] %
    accelR: number;     // [0, 100] %
    decelR: number;     // [0, 100] %
    centerRear: number; // [0, 100] %
  };
}
```

---

### 2.3 齒比輸出規格 (`GearingResult`)

```typescript
interface GearingResult {
  finalDrive: number; // [2.0, 6.1], 2 位小數
  gears: number[];    // 嚴格單調遞減 (g1 > g2 > ... > gN), 2 位小數
  unsupported?: boolean;
  unsupportedReason?: string;
}
```

---

## 3. 四大賽事取向物理演算法標準 (Discipline Physics SSOT)

| 項目 | 公路/環道 (Road) | 甩尾 (Drift) | 拉力/越野 (Rally) | 直線加速 (Drag) |
| :--- | :--- | :--- | :--- | :--- |
| **前防傾桿 ($ARB_f$)** | AWD: $\min(5.0, 1+4W_f)$<br>FWD: $1+32W_f$<br>RWD: $64W_f + 1$ | $1.0 + 64.0 / 3.0 \approx 22.3$ | $(64W_f + 1) \times 0.32 \sim 0.38$ | FWD: $55.0$<br>RWD/AWD: $65.0$ |
| **後防傾桿 ($ARB_r$)** | AWD: $\max(50.0, 65 - 0.3(100-W_r))$<br>FWD: $1+64\min(0.8, W_r+0.25)$<br>RWD: $64W_r + 1$ | $ARB_f \times 1.2 \approx 26.8$ | $(64W_r + 1) \times 0.32 \sim 0.46$ | $65.0$ (全面抗扭抑制) |
| **前彈簧 ($K_f$)** | $(kMax-kMin)W_f + kMin + \Delta K_{aero\_f}$<br>(FWD: $W_f - 0.10$ 偏置) | $W \times W_f \times 0.035$ | Base $\times (0.65 \sim 0.85)$ | $kMin + 0.15 \sim 0.20 \Delta K$ |
| **後彈簧 ($K_r$)** | $(kMax-kMin)W_r + kMin + \Delta K_{aero\_r}$<br>(FWD: $W_r + 0.10$ 偏置) | $W \times W_r \times 0.035$ | Base $\times (0.65 \sim 0.85)$ | $kMin + 0.20 \sim 0.25 \Delta K$ |
| **車身高度 ($H$)** | $hMin + 3 \text{ clicks}$ ($1.5\text{cm}$) | 前 $hMin+0.5\text{cm}$ / 後 $hMin+1.0\text{cm}$ | $hMin + (0.85 \sim 1.0)\Delta H$ | FWD: 前低/後高<br>RWD/AWD: 全最高 |
| **回彈阻尼 ($D_{reb}$)** | $19.0 W + 1.0$ (FWD 開根號剛度修正) | 依彈簧相對滑桿位置插值 | $(14.0 W + 1.0) \times (1.0 \sim 1.1)$ | 前 3.0~8.0 / 後 8.0~12.0 |
| **壓縮阻尼 ($D_{bmp}$)** | $D_{reb} \times 0.60$ | $D_{reb} \times 0.60$ | $D_{reb} \times (0.40 \sim 0.50)$ | 前 4.0~12.0 / 後 4.0~10.0 |
| **差速器分配** | 依驅動配置精確矩陣（Road AWD 中差由 `getRoadAwdRearPercent` 解析） | AWD: 85/5, 60/15, 75%<br>RWD: 90/15<br>FWD: 85/5 | 依越野地表與驅動分配 | FWD: 85/0<br>RWD: 85/0<br>AWD: 85/0, 65/10, 75% |

---

## 4. 浮點數容差與驗收標準 (Numerical Tolerance)

在 PR 3 實作 Rust 模組與 PR 4 前端 WASM 替換時：
1. **防傾桿、彈簧、車高、阻尼、差速器**：Rust 輸出與 TypeScript 基準之絕對誤差必須 $\le 0.1$。
2. **齒比 (Gearing)**：
   - Final Drive 絕對誤差 $\le 0.02$。
   - 個別檔位齒比絕對誤差 $\le 0.02$。
   - 檔位齒比必須嚴格維持單調遞減：$g_1 > g_2 > \dots > g_N$。
