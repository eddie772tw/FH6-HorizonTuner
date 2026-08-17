---
name: portable-release-validation
description: 當建立 V1.x 發行版、portable/exe/sidecar、啟動流程、動態 HTTP port 或 Windows release artifact 時觸發此技能。
---

# Portable Release 驗證流程

## 發行前檢查

1. 確認版本號、release notes、build metadata 與產物來源一致。
2. 檢查並更新 `SECURITY.md` 的 Supported Versions（支援版本矩陣），確保新舊版本支援狀態正確。
3. 執行 frontend build、後端測試與必要的 package/build 命令。
4. 檢查 portable 目錄只包含必要檔案，sidecar、frontend 與設定檔路徑沒有依賴開發機絕對路徑。
5. 確認使用者資料、log 與設定檔寫入可攜式環境允許的位置。

## 啟動與連接埠 smoke test

- 啟動 release artifact，確認 sidecar readiness event 與 `logs/web_port.txt`。
- HTTP/WebSocket 使用 release 宣告的動態 port；UDP telemetry 仍遵守 `TELEMETRY_PORT` 契約，不能把兩者混為一談。
- 檢查 port race、重複啟動、啟動失敗與 sidecar 關閉/清理。
- 確認開發模式與 release 模式的 debug、路徑與錯誤處理差異是預期行為。

## 驗證證據

至少保留以下結果：build 命令、測試命令、artifact 清單、啟動 log、HTTP port、UDP port、sidecar lifecycle 與失敗診斷。若使用 Windows PowerShell，優先使用 repository 已定義的 `cmd /c` 或 PowerShell 相容命令。

## 完成條件

- clean Windows 環境可啟動並完成基本 UI/HTTP smoke test。
- sidecar 可正常啟動、回報 readiness 並在關閉時清理。
- portable 產物沒有 stale absolute path、缺少 runtime 檔案或未記錄的 port 假設。
- 失敗時能從 log 判斷是 build、sidecar、HTTP、UDP 或 frontend 問題。
- 執行 `git diff --check`，並將已驗證的 release 結論記錄到 Journal。
