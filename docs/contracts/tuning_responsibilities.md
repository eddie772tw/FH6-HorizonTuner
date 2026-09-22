# 車輛調校與齒比算牌責任契約 (Tuning & Gearing Responsibilities Contract)

- **版本 (Version)**: 1.1.0
- **狀態 (Status)**: 正式架構契約 (Architecture Contract)
- **管轄範圍 (Scope)**: 車輛底盤調校（防傾桿 ARB、彈簧、車高、阻尼、差速器）與 AEGO 齒比計算邏輯
- **關聯 Issue**: #423 (前後端調校與遙測責任釐清 Stacked PR 1-4)

---

## 1. 架構核心原則與單一真理 (SSOT Architecture)

依據 `.agents/AGENTS.md` 之 **Core Invariant #2**：
> 「所有懸吊、彈簧磅數、防傾桿 (ARB) 與齒輪比算牌公式，必須嚴格維持為純函數 (Pure Functions)，以 Rust `backend-rust/src/tuning/`（與前端同步對齊之 `frontend/src/utils/tuningMath.ts`）作為單一真理 (SSOT)，雙端必須經由 `tests/fixtures/tuning_golden_fixtures.json` 保持 100% 數值一致。」

### 1.1 演進階段與落地狀態 (Evolution Phases & Implementation Status)

1. **基礎建立與契約鎖定 (PR 1 ~ PR 2)**：
   - **前端基準鎖定**：以 [`frontend/src/utils/tuningMath.ts`](file:///d:/FH6-HorizonTuner/frontend/src/utils/tuningMath.ts) 為調校演算法之功能基準。
   - **黃金資料集保護**：建立 `tests/fixtures/tuning_golden_fixtures.json`，鎖定 18 組涵蓋四大賽事與驅動組合之輸入與預期輸出，並建立前端契約測試 `frontend/src/utils/tuningMath.contract.test.ts`。
   - **後端過渡求解器**：`backend/mcp/service.py` 與 `backend/agent_cli.py` 標記為 `tuning-dev/v1 (Legacy Quick Baseline Solver)`，明確與正式調校契約區隔。

2. **Rust 純函數核心實作 (PR 3)**：
   - **純 Rust 核心 (`backend-rust/src/tuning/`)**：完成 `chassis.rs`（底盤、懸吊、防傾桿、車高、阻尼、差速器）與 `gearing.rs`（AEGO 齒比優化），為零相依純數學實現。
   - **後端契約測試 (`backend-rust/tests/tuning_contract.rs`)**：直接載入 `tests/fixtures/tuning_golden_fixtures.json`，18/18 組情境全部 100% 通過。

3. **跨端整合與真理對齊 (PR 4)**：
   - **雙端 SSOT 對齊**：Rust `backend-rust/src/tuning/` 與 TypeScript `frontend/src/utils/tuningMath.ts` 經由 18 組 Golden Fixtures 保證 100% 數值一致。
   - **架構規範同步**：更新 `.agents/AGENTS.md` Core Invariant #2，確立 Rust 核心為後端算牌與未來 WASM 編譯基礎。
   - **舊求解器退場指引**：MCP 與 Agent CLI 舊有 `tuning-dev/v1` 標記為過渡/已棄用 (Deprecated) 狀態，引導工具鏈逐步調用 Rust `tuning_core`。

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
