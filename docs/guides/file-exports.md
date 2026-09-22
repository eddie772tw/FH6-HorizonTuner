# 檔案匯出與另存新檔

Windows 桌面版的 MoTeC CSV、工作區 XML、診斷 ZIP、主題 JSON、調校與 Road capture 匯出都會開啟「另存新檔」。選擇資料夾與檔名後，程式完成寫入才顯示成功通知，通知包含完整路徑與「複製路徑」。取消對話框不顯示錯誤，也不另外下載檔案。

macOS／Linux Full 現在也接入原生另存視窗，沿用相同檔名、大小、取消與原子寫入契約；對話框由非 Windows 專屬的 `tauri-plugin-dialog` 提供。本機啟動 MoTeC 的按鈕只在 Windows 顯示，CSV／XML 匯出仍保留。原生 Cocoa／GTK 視窗互動與目標平台驗收尚需完成，不能沿用下方 Windows 的歷史驗證結果；詳見[跨平台發行指南](cross-platform-release.md)。

後端離線、紀錄不存在、回應格式不正確或檔案寫入失敗時，錯誤會留在程式內顯示。MoTeC 匯出與範本下載使用目前已設定的後端連接埠，不會把主視窗導覽至後端 URL。

## 瀏覽器行為

支援 `showSaveFilePicker` 的瀏覽器會先開啟儲存選擇器，再讀取資料。這個順序保留點擊時的暫時使用者啟用狀態；原生 Tauri 則先取得資料，再開平台對話框。瀏覽器只能回報所選檔名，不能取得完整磁碟路徑。

未提供該 API 的瀏覽器使用 Blob 下載，通知明確顯示「已開始下載」，請到瀏覽器下載紀錄查看儲存位置。對話框取消、拒絕或寫入失敗不會觸發這個降級路徑。

## 開發契約

- `frontend/src/services/fileSave.ts` 負責平台選擇、延後載入、取消、64 MiB 限制與後端 HTTP／MIME 驗證。`useFileSave` 集中處理進行中狀態、成功與錯誤通知；呼叫端應直接從 click handler 呼叫，避免在它之前等待網路。
- `frontend/src-tauri/src/file_export.rs` 使用既有 `windows` crate 的 `GetSaveFileNameW`。只允許主視窗、JSON／CSV／XML／ZIP 建議檔名與有限大小；IPC 不接受任意寫入路徑，目的地由原生對話框決定。全程僅允許一個原生儲存對話框。
- 檔案先寫入同資料夾的暫存檔並同步，再替換所選檔案；Windows 提供覆寫確認。失敗時清理本次暫存檔，避免先清空既有檔案。
- Road review 的非同步匯出保留原工作流 generation guard，過期結果不會寫入或下載。

## 2026-09-20 驗證紀錄

基底為 PR #397 合併後的 `844ad1b`；使用獨立 worktree 與本機 Windows debug Tauri／WebView2、Vite、真實 Python 後端。

| 檢查 | 結果與範圍 |
| --- | --- |
| 原生 XML 取消 | 顯示 Windows「另存新檔」與 XML 篩選；取消無成功／錯誤通知，匯出按鈕恢復 |
| 原生 XML 儲存 | 自選測試資料夾與中文檔名成功；4117 bytes，XML parser 讀到 `MoTeCWorkspace`；UI 顯示完整路徑及複製按鈕 |
| 不存在的 MoTeC session | 真實後端回應 HTTP 200 JSON error；UI 顯示 `Session not found`，分析頁與按鈕保留 |
| 後端離線匯出 | 停止本次 worktree 的 Python 後端後，CSV 顯示 `Failed to fetch`，主視窗保留 |
| 前端 | 127 files／909 tests 與 Full／Lite build 通過；17 個共用儲存測試涵蓋二進位資料、取消、失敗、stale guard、HTTP 與 MIME 邊界 |
| Rust | 5 tests 與 debug build 通過；包含 Unicode 名稱、大小／副檔名限制、二進位寫入、覆寫與失敗保留 |
| 後端 | 關閉本機驗證後端後 350 passed／8 deselected；Ruff check／format 通過（259 files） |

最初後端測試受正在運行的 GUI 驗證服務占用 8001 埠影響；釋放該服務後完整重跑通過，沒有放寬測試。瀏覽器 picker／fallback 以注入平台測試驗證；本次沒有逐一實際點擊所有匯出入口、驗證剪貼簿內容、不同瀏覽器、發行 EXE 或真實 FH6／MoTeC i2 匯入。這些不列為已完成的實機證據。

## 參考

- [Microsoft GetSaveFileNameW](https://learn.microsoft.com/en-us/windows/win32/api/commdlg/nf-commdlg-getsavefilenamew)：儲存對話框與取消／錯誤回傳。
- [Microsoft OPENFILENAMEW](https://learn.microsoft.com/en-us/windows/win32/api/commdlg/ns-commdlg-openfilenamew)：副檔名、路徑存在與覆寫確認旗標。
- [MDN showSaveFilePicker](https://developer.mozilla.org/en-US/docs/Web/API/Window/showSaveFilePicker)：使用者啟用狀態、取消與支援範圍。
