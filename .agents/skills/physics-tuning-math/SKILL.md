---
name: physics-tuning-math
description: 當新增、修改車輛物理計算（懸吊、彈簧、防傾桿 ARB、阻尼 Critical Damping、AEGO 齒輪比）或診斷邏輯時觸發此技能。
---

# 車輛物理與調校演算法規範指南 (Physics Tuning Math Skill)

## 核心原則

1. **單一真理 (Single Source of Truth)**：
   - 所有物理計算演算法統一集中在 `frontend/src/utils/tuningMath.ts` 與 `tuningDiagnosis.ts`。
   - **絕不**在 React UI 組件或 Python 後端重複硬編碼物理計算公式。

2. **純函數無副作用 (Pure Functions)**：
   - 物理函數必須為「輸入無副作用、輸出確定」的純函數。
   - 禁止依賴外部全域變數或 React Component State。

3. **邊界防護與校準常數**：
   - 逆向工程常數（如 `CALIBRATION_CONST`）需加上詳細註解說明物理依據。
   - 極端輸入（如車重 0、車重分佈 0% 或 100%）必須有防呆 clamp / fallback 機制。

---

## 現行演算法架構速查

詳細物理模型與符號推導請參閱：
- [公式化底盤調校.md](../../docs/公式化底盤調校.md)
- [公式化齒比調校.md](../../docs/公式化齒比調校.md)
- [底盤調校研究原檔.md](../../docs/底盤調校研究原檔.md)

### 1. 四大賽事取向 (Race Goals) 底盤算牌速查

| 調校項目 | 公路/環道 (Road / Circuit) | 甩尾 (Drift) | 拉力/越野 (Rally / Off-Road) | 直線加速 (Drag) |
| :--- | :--- | :--- | :--- | :--- |
| **前防傾桿 ($ARB_f$)** | $64.0 \times W_f\% + 1.0$ (AWD: $\min(5, 1+4W_f\%)$) | $10.0$ | $(64.0 \times W_f\% + 1.0) \times 0.35$ | $1.0$ |
| **後防傾桿 ($ARB_r$)** | $64.0 \times W_r\% + 1.0$ (AWD: $\max(50, 65 - 0.3(100-W_r))$) | $50.0$ | $(64.0 \times W_r\% + 1.0) \times 0.35$ | $65.0$ (抑制歪斜) |
| **前彈簧 ($K_f$)** | $K_{base\_f} + \frac{Aero_f}{10} \times 0.5$ | $W \times W_f\% \times 0.035$ | $K_{base\_f} \times 0.65$ | $K_{min\_f} + 0.20 \Delta K_f$ |
| **後彈簧 ($K_r$)** | $K_{base\_r} + \frac{Aero_r}{25} \times 0.5$ | $W \times W_r\% \times 0.035$ | $K_{base\_r} \times 0.65$ | $K_{min\_r} + 0.90 \Delta K_r$ |
| **車身高度 ($H$)** | $H_{min} + 3$ Clicks | 前最低 $+ 1$ Click / 後最低 | $H_{max}$ (最高) | 前最低 ($H_{min\_f}$) / 後最高 ($H_{max\_r}$) (Forward Rake) |
| **回彈阻尼 ($D_{reb}$)** | $19.0 \times W\% + 1.0$ | 前後拉平 $6.0$ | $14.0 \times W\% + 1.0$ | 前 $3.0$ / 後 $12.0$ |
| **壓縮阻尼 ($D_{bmp}$)** | $D_{reb} \times 0.60$ | $D_{reb} \times 0.50$ | $D_{reb} \times 0.40$ | 前 $4.0$ / 後 $10.0$ |

### 2. AEGO 齒比算牌與二次修正核心
- **`calculateAEGOGearing`** 支援 Road, Drift, Rally, Drag 四種 profile。
- **Drag 4-Speed Meta**：極速採 $vDragTop = 410.0 \times (hp/kg)^{0.30} \times (1 + 0.12 \times aeroEfficiency)$。
- **Secondary Correction**：支援 `simulatedTopSpeed` 與 `softMaxSpeed` 時速上限鎖定，動態計算頂檔與閉環重分佈中間檔位。

### 3. 下壓力自動解算 (`resolveAeroDownforce`)
- 當 UI 下壓力數值未指定 ($\le 0$) 時，以車重 20% (lbs) 結合驅動偏置 (RWD 0.82, FWD/AWD 1.05) 自動導出前後軸下壓力。

---

## 驗證 SOP

- 修改物理算牌公式後，必須於 `tuningMath.test.ts` 新增/更新單元測試案例。
- 執行測試指令：`cmd /c "pnpm -C frontend run test"`。
