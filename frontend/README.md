# HorizonTuner 前端開發

React／TypeScript／Vite 提供桌面 Full／Lite 與 Companion Web 的共用介面，Tauri 負責桌面原生整合。調校公式、資格及診斷由 Rust 後端擁有；前端僅處理草稿、流程與顯示轉換。

## 開發入口

從專案根目錄執行：

| 指令 | 用途 |
| --- | --- |
| `cmd /c "pnpm -C frontend run dev"` | 啟動 Vite，預設 port 1420；需要後端的功能另啟動 Rust |
| `.\dev_full.bat` / `.\dev_lite.bat` | 啟動完整桌面開發環境，擇一執行 |
| `cmd /c "pnpm -C frontend run test"` | 執行前端 Vitest |
| `cmd /c "pnpm -C frontend run build"` | TypeScript 檢查、Vite 建置及 tuning runtime 邊界檢查 |

安裝、埠號、sidecar 與打包流程見[開發啟動指南](../docs/guides/development.md)。Rust 會嵌入前端建置資源，前端 build 與 Cargo 編譯／測試應依序執行。

## 程式與規範入口

| 工作 | 入口 |
| --- | --- |
| 設計系統、六個 Core Theme、配色及視覺驗收 | [主題與設計系統開發指南](../docs/frontend/design-systems.md) |
| 元件／Portal／高頻繪圖規則 | [UI 架構](../.agents/rules/ui-architecture.md)、[元件規格](../.agents/skills/halfmoon-design-system/HALFMOON_SPECIFICATION.md) |
| 調校責任與 typed API | [調校開發](../docs/tuning/README.md)、[責任契約](../docs/contracts/tuning_responsibilities.md) |
| Android 原生外殼與 WebView 邊界 | [Companion README](../companion/README.md) |

Vitest 案例通常與模組並列，命名為 `*.test.ts`／`*.test.tsx`；主題入口案例為 [ThemeContext.test.ts](src/context/ThemeContext.test.ts) 與 [themeDocument.test.tsx](src/context/themeDocument.test.tsx)。凍結的 TypeScript 調校模型位於 [test-reference/tuning](test-reference/tuning/README.md)，不得由產品 runtime 匯入。完整測試分流見[測試策略](../.agents/rules/testing-strategy.md)。
