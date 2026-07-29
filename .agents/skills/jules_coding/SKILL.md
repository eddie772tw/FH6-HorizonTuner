# Skill: Cloud Autonomous Coding with Jules API

## Description
當需要執行高風險的重構、相依性大版本升級（如升級 Next.js/Spring Boot）、或是本地資源不足以跑完大型測試套件時，將任務外包給遠端的 Google Jules Agent。

## Requirements
- 必須在本機環境變數中設定 `JULES_API_KEY`。
- 本地專案必須已推送到與 Jules 綁定的 GitHub 倉庫。

## Execution Protocol (執行流程)

1. **規劃與初始會話 (Trigger Session)**
   調用 Jules API 建立遠端編碼工作區。
   ```bash
   curl -X POST 'https://googleapis.com' \
     -H "x-goog-api-key: \$JULES_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "prompt": "{{TASK_DESCRIPTION}}",
       "sourceContext": { "source": "sources/github/{{REPO_OWNER}}/{{REPO_NAME}}" }
     }'
   ```

2. **追蹤與進度管理 (Polling & Artifacts)**
   每隔 30 秒向狀態接口輪詢進度。當 Jules 的狀態轉為 `AWAITING_PLAN_APPROVAL` 時，將 Jules 生成的修正計畫匯入到 Antigravity 的 **Artifacts 視角**，等待人類按下確認。

3. **雙向同步與合併 (PR Review)**
   當 Jules 成功修復並在遠端跑完測試後，它會自動建立一個 GitHub Pull Request。本技能必須引導 Antigravity 自動拉取該 PR 的 Diff 分支至本地供開發者確認。
