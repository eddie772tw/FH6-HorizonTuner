# 凍結的調校測試參考

此目錄保留 TypeScript 舊模型及其 characterization tests，供歷史數值、wire version 與 golden fixtures 比對。它不是產品算法入口，也不是 Rust 不可用時的 fallback。

- 正式 owner：`backend-rust/src/tuning/`，涵蓋公式、資格、預設、限制、readiness 及數值診斷。
- 產品型別：`frontend/src/domain/tuning/types.ts` 與 `ev/types.ts`，僅包含型別／interface。舊模型可引用這些形狀，不能決定正式結果。
- Vitest 仍由 `pnpm --dir frontend test` 執行這些測試。既有 fixtures 與容差沒有改寫。
- Vite 的 `frontend/tooling/backendTuningBoundary.ts` 在型別移除與 tree shaking 前拒絕產品 runtime dependency，並保留對舊 `src` 路徑的防護。請勿建立原路徑 forwarding shim。
- `utils`、`features/tuning`、`domain/tuning` 保留原來的相對分組以便追溯；不在此繼續開發或調校新的模型。

這次搬移亦移除未掛載的 Step5TelemetryCalibration、DiagnosisPanel 與未使用的 Python Discord application-id 打包 helper。Rust 原生 Discord 設定、使用者 `backend/` 資料、legacy CLI／MCP 合約與歷史 schema 均保留。
