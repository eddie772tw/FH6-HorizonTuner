## 2024-05-24 - Exception Information Disclosure in Rust Backend
**Vulnerability:** The Rust backend (`backend-rust/src/error.rs`) explicitly logged and returned exact system and application error messages (`e.to_string()`, database error descriptions, etc.) to end users in 500 Server Error HTTP responses via `ApiError::new(500, e)`.
**Learning:** Returning unredacted internal error details in API responses can leak sensitive system architecture, database schema names, file paths, or third-party service responses to malicious actors, aiding them in reconnaissance.
**Prevention:** In Axum or generic API handlers, utilize a pattern that internally logs the exact exception (`eprintln!`) but constructs a sanitized, generic error message string for the HTTP client (e.g., `ApiError::internal("Operation", "Internal Server Error")`) to maintain operability while minimizing disclosure.

## 2026-11-01 - Windows Reserved Device Names and Filename Path Sanitization in File Exports
**漏洞/脆弱點 (Vulnerability):** 前端 `fileSave.ts` 的 `exportFilename` 原先僅過濾部分特殊字元與結尾點號，未防禦 Windows MS-DOS 保留設備名稱（`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`）及連續路徑穿透點號（`..`），可能導致原生桌面環境（Tauri/Win32）在儲存檔案時發生 I/O 掛起（Hang）、崩潰或非法裝置操作。
**學習 (Learning):** Windows Win32 子系統會將副檔名前的保留設備名稱強制導向硬體串列埠或虛擬設備，即使是 Web 前端轉發給 Native Save 的檔名，也必須在應用層落實防禦性跳脫（如加上前綴底線）與連續點號折疊。
**預防 (Prevention):** 任何涉及前端匯出、Native 對話框或外部傳入檔名的情境，應強制使用正規化檢查過濾 DOS 保留名稱、去除首尾點號空白、折疊 `..` 序列並嚴格限制 255 字元上限。
**署名:** Sentinel as Antigravity

## 2026-11-02 - MS-DOS Reserved Device Names Protection in Backend Storage SafePath
**漏洞/脆弱點 (Vulnerability):** 後端路徑安全模組 `backend-rust/src/storage.rs::safe_path` 原先僅過濾 `\0`、`\`、`:`、非 Normal 元件及結尾點號/空格，未阻斷 Windows MS-DOS 保留設備名稱（如 `CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9` 及其上標字元 `COM¹..³`, `LPT¹..³`），使得外部傳入的 API 請求（如 `/api/tunings/con.json`、`/api/car_params/aux`）能通過安全路徑校驗，導致底層在嘗試開啟或建立設備時引發 Win32 I/O 阻塞（Hang）、拒絕存取或潛在的 DoS 服務拒絕。
**學習 (Learning):** Win32 檔案系統將檔名中第一個小數點前符合保留名稱的標識（無論大小寫或附帶副檔名）直接解析為字元設備或硬體通訊埠。在伺服器端若未於路徑階層的每個 Normal 元件執行基底名稱檢查，防禦目錄遍歷的邊界檢驗（`starts_with(&base)`）在檔案尚不存在時仍會回傳設備路徑，使得應用層直接暴露於設備操作風險。
**預防 (Prevention):** 核心路徑防護函式必須針對路徑的每一個 component 擷取前綴 stem，過濾 DOS 保留名稱與 Unicode 上標序號，並於非 Windows 測試環境同樣嚴格強制拒絕，確保跨平台行為一致與深度防禦（Defense in Depth）。
**署名:** Sentinel as Antigravity
