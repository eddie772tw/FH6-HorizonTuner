# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## 開發常用指令

| 指令 | 說明 |
| :--- | :--- |
| `npm run dev` | 啟動 Vite 開發伺服器 (port 1420) |
| `npm run build` | TypeScript 類型檢查 + Vite 生產建置 |
| `npm run test` | 執行 Vitest 單元測試 (一次性) |
| `npm run tauri` | 啟動 Tauri 桌面應用 |

## 單元測試 (Vitest)

專案使用 [Vitest](https://vitest.dev/) 作為前端單元測試框架，與 Vite 工具鏈無縫整合，無需額外設定。

### 測試檔案慣例

- 測試檔與被測模組**同目錄**，命名為 `<模組名>.test.ts`
- 例如：`src/utils/tuningMath.ts` → `src/utils/tuningMath.test.ts`

### 執行測試

```bash
# 從 frontend/ 目錄
npm run test

# 從專案根目錄
npm --prefix frontend run test
```

### 目前的測試涵蓋範圍

| 測試檔案 | 覆蓋範圍 |
| :--- | :--- |
| `src/utils/tuningMath.test.ts` | 彈簧、ARB、阻尼器、齒輪比 (AEGO)、對齊設定、胎壓等 11 個導出純函數 |
