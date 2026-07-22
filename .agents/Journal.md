# Agent 開發經驗日誌 (Journal) - FH6-HorizonTuner

本文件用於記錄每一次 Agent 在 FH6-HorizonTuner 開發過程中的**關鍵學習點（Critical Learnings）**。

## 記錄準則
只有在遇到以下情況時才新增日誌紀錄：
1. 發現 Forza UDP 遙測數據的包結構或位元偏移 (Byte Offset) 陷阱。
2. 嘗試了某種懸吊/齒輪調校演算法優化，但結果不如預期（如出現物理奇異點）。
3. 發現 Tauri / WebSockets 高頻數據傳遞造成的 UI 影格率（FPS）下降問題。
4. 前後端跨語言（Python <-> TypeScript）數據對齊的 Anti-pattern。

## 日誌格式
```markdown
## YYYY-MM-DD - [標題]
**學習點 (Learning):** [簡述學到了什麼、底層原因或發現的機制]
**後續行動 (Action):** [下次開發時該如何應用此經驗]
```

---

## 2026-07-22 - 初次建立 tuningMath.ts Vitest 測試套件

**學習點 (Learning):**
- 專案原先並未安裝 Vitest，也沒有 `test` script。Vite 7.x 搭配 Vitest 4.x 可以零設定直接運行 `.test.ts` 測試檔，無需額外的 `vitest.config.ts`。
- `tuningMath.ts` 共 11 個導出函數，全部為純函數，不依賴任何 React state 或外部全域變數，非常適合單元測試。
- `calculateSpringsByFrequency` 有 anti-squat 邏輯 (hpWeightRatio > 200)，需注意 `_hp` 參數名稱帶底線但實際有使用。
- `calculateDampersCritical` 使用 `CALIBRATION_CONST = 0.00135` 這個由遙測逆向工程得出的校準常數，測試時不應硬編碼期望值，而是驗證範圍與相對關係。
- `calculateAEGOGearing` 的 `carParams` 可能為 `null`，函數內部有完整的 fallback 處理。

**後續行動 (Action):**
- 後續修改任何 `tuningMath.ts` 的公式時，務必同步更新或新增對應的測試案例。
- 考慮為 `tuningDiagnosis.ts` 也建立類似的測試套件。
- 若未來需要 snapshot 測試 AEGO 齒輪比的完整輸出，可考慮加入 `toMatchSnapshot()`。

---

## 2026-07-22 - Windows PowerShell 執行前端 Vitest 測試的 ExecutionPolicy 避坑處理

**學習點 (Learning):**
- 在 Windows PowerShell 環境中，直接執行 `npm --prefix frontend run test` 或 `npx` 時，可能觸發 `PSSecurityException` (UnauthorizedAccess)，主因是系統網域或執行策略管制阻擋了 `.ps1` 腳本執行。
- 包裹命令為 `cmd /c "npm --prefix frontend run test"` 可繞過 PowerShell 限制，穩定順利啟動 Vitest 並完成全數測試運算。

**後續行動 (Action):**
- 在 `AGENTS.md` 及重構 SKILL 指南中明確標註 `cmd /c` 指令選項，避免 Agent 後續重試陷入權限錯誤循環。

---

## 2026-07-22 - 追加 tuningDiagnosis.ts 前端遙測診斷測試套件

**學習點 (Learning):**
- `tuningDiagnosis.ts` 內部的數據結構解析同時支援舊版遙測欄位名（如 `SuspTravel`、`TireSlipAngle`）與單位轉換（如弧度轉角度 `* (180 / Math.PI)`）。
- 滯空觸地測試中需精確提供連續滯空時間 (> 0.3s) 及加速度向量 `AccelerationX` / `AccelerationZ` 才能正確認定跳躍並計算 Landing G 衝擊值。

**後續行動 (Action):**
- 後續若調整診斷邏輯或新增極限運動診斷（如 0-400m 拖孤/直線加速測試），需同步維護 `tuningDiagnosis.test.ts`。
