---
name: physics-tuning-math
description: 當新增、修改車輛物理計算（懸吊、彈簧、防傾桿 ARB、阻尼 Critical Damping、AEGO 齒輪比）或診斷邏輯時觸發此技能。
---

# 車輛物理與調校演算法規範指南 (Physics Tuning Math Skill)

## 🎯 核心原則

1. **單一真理 (Single Source of Truth)**：
   - 所有物理計算演算法統一集中在 `frontend/src/utils/tuningMath.ts` 與 `tuningDiagnosis.ts`。
   - **絕不**在 React UI 組件或 Python 後端重複硬編碼物理計算公式。

2. **純函數無副作用 (Pure Functions)**：
   - 物理函數必須為「輸入無副作用、輸出確定」的純函數。
   - 禁止依賴外部全域變數或 React Component State。

3. **邊界防護與校準常數**：
   - 逆向工程常數（如 `CALIBRATION_CONST = 0.00135`）需加上詳細註解說明物理依據。
   - 極端輸入（如車重 0、車重分佈 0% 或 100%）必須有防呆 clamp / fallback 機制。

## 🧪 驗證 SOP
- 修改物理算牌公式後，必須於 `tuningMath.test.ts` 新增/更新單元測試案例。
- 執行測試指令：`cmd /c "npm --prefix frontend run test"`。
