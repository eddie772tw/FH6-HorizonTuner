# 桌面 Conversation 續接注意事項 (Desktop Session Resume Caveat)

## 識別碼模型差異

應將桌面端的 Conversation UUID 與 CLI 的 Trajectory UUID 視為不同的識別碼：
- 桌面端的對話 ID 可能存在於 `%USERPROFILE%\.gemini\antigravity-cli\cache\last_conversations.json`，且在 `%USERPROFILE%\.gemini\antigravity\brain\<id>` 下有 transcript。
- 但直接執行 `agy --conversation <id> --print ...` 或 `agy --continue --print ...` 仍可能回傳 `trajectory not found`。

## 處置方式

1. 請將此結果歸類為 `desktop_session_requires_cli_import`，而非程式碼或階段失敗。
2. 支援的復原方式為執行互動式 `/resume`，切換至 `Antigravity` 分頁，選擇並匯入該桌面對話，隨後使用新生成的 CLI Conversation ID。
3. 重新導向的 stdin pipe 並不能保證 `/resume` 成功完成，因該選擇器需要真實的互動式終端。
4. 進行機器可讀的自動化檢查時，建議採用本地包裝腳本配合精確的固定 token（例如 `AGY_PHASE4A_REVIEW_OK:<marker>`），並在保存 token 結果的同時保留原始 stdout/stderr 與失敗分類。
