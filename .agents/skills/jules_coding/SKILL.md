---
name: jules_coding
description: 當需要在使用者明確授權且環境可用時，透過 Google Jules 委派高風險重構、大型相依套件升級或本機資源不足的測試工作。
---

# Skill: Cloud Autonomous Coding with Jules API

## Description
當需要執行高風險的重構、相依性大版本升級（如升級 Next.js/Spring Boot）、或是本地資源不足以跑完大型測試套件時，將任務外包給遠端的 Google Jules Agent。

## Requirements
- 必須在本機環境變數中設定 `JULES_API_KEY`。
- 本地專案必須已推送到與 Jules 綁定的 GitHub 倉庫。
- 必須先取得使用者對「委派至遠端 Agent」的明確授權；大型任務本身不等於已授權。
- 若環境沒有 Jules connector/API client，或缺少 `JULES_API_KEY`，不得假造 endpoint、session、狀態或 PR；應回報無法委派並採用安全的本地流程。

## Journal boundary

- `.jules/*.md` 是 Jules 的原始工作日誌，保留逐次任務紀錄。
- `.agents/Journal.md` 是本專案已採納且已驗證的知識庫；只有完成驗證的學習點才同步進去。
- 同步時保留來源檔案、日期、驗證方式與狀態（`proposed`、`adopted`、`superseded`）。

## Execution Protocol (執行流程)

1. **規劃與初始會話 (Trigger Session)**
   使用環境已配置且可驗證的 Jules connector/API client 建立遠端編碼工作區；不要猜測或硬編碼 API endpoint。若整合工具不可用，停止委派並回報限制。

2. **追蹤與進度管理 (Polling & Artifacts)**
   依 Jules connector 的正式介面追蹤進度。當 Jules 的狀態轉為 `AWAITING_PLAN_APPROVAL` 時，先將計畫呈現給使用者確認，不得自行批准或直接套用遠端變更。

3. **雙向同步與合併 (PR Review)**
   Jules 完成遠端測試並建立 GitHub Pull Request 後，先取得 PR 的 diff 與測試結果，再在本地檢視。未經使用者確認，不得自動合併、覆蓋本地變更或推送遠端分支。
