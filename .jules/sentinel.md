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

## 2026-11-03 - Comprehensive Windows Reserved Device Names & Console Handles Defense
**漏洞/脆弱點 (Vulnerability):** 前端 `fileSave.ts` 與後端 `storage.rs::safe_path` 雖然已防禦傳統 MS-DOS 設備名稱（`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`），但仍遺漏了 Win32 系統保留的核心時鐘設備（`CLOCK$`）、控制台輸入輸出句柄（`CONIN$`, `CONOUT$`）及通訊埠 0 設備（`COM0`, `LPT0`）。外部請求或匯出操作若提供如 `clock$.json`、`conin$.txt` 或 `child/clock$`，將會繞過保留名稱檢查，在 Windows 原生環境觸發 Win32 驅動程式設備存取異常或造成 I/O 阻塞/拒絕服務。
**學習 (Learning):** Windows Win32 子系統中，除了標準 `1-9` 序號的串列/並列埠外，`COM0` 與 `LPT0` 同屬保留命名空間；此外以 `$` 結尾的內部字元設備（`CLOCK$`, `CONIN$`, `CONOUT$`）會被 Win32 命名解析器直接映射至控制台或時鐘中斷驅動程序，即使附帶任何副檔名依然有效。單一端點若防禦不全，將造成前後端校驗合約不一致與潛在的設備穿透風險。
**預防 (Prevention):** 統一前後端防禦契約，將 Windows 保留設備名稱集合完整收斂為包含 `CLOCK$`, `CONIN$`, `CONOUT$`, `COM0-9`, `LPT0-9`, `COM¹-³`, `LPT¹-³` 的完整正規化集合，並於前後端單元測試中針對各大小寫、副檔名及深層子路徑補齊拒絕與轉義斷言，落實深度防禦（Defense in Depth）。
**署名:** Sentinel as Antigravity

## 2026-11-04 - Custom CSS Sanitization and Validation Side-Effect Mitigation
**漏洞/脆弱點 (Vulnerability):** 前端主題自訂 CSS 驗證器 `cssValidator.ts` 原先僅檢查大括號平衡與多行註解閉合，未過濾 `@import` 外部導入、`url(...)` 探針請求、`</style>` 標籤閉合逃逸及動態腳本表達式（`expression(...)`, `behavior:`），且在語法驗證時直接將未經驗證的 CSS 元素插入 DOM (`document.head.appendChild(style)`)，可能使社群惡意主題透過 `@import` 載入遠端惡意樣式表、發起 SSRF 探針請求或透過 CSS 屬性選擇器進行資料外洩（CSS Keylogger），同時驗證階段的 DOM 附加更會在驗證完成前立即觸發未授權網路請求。
**學習 (Learning):** 自訂 CSS 雖主要用於 UI 屬性微調，但 CSS 規格中包含強大的外部資源載入能力與歷史動態表達式。在前端允許使用者輸入或匯入外部 CSS 時，除了進行基本語法括號檢查外，必須於前置作業剝離註解進行惡意特徵掃描（避免利用註解拆分關鍵字混淆繞過），並優先採用無 DOM 副作用的現代標準 `CSSStyleSheet.prototype.replaceSync`，確保驗證階段具備純淨無副作用（Side-effect-free）的安全性。
**預防 (Prevention):** 自訂主題樣式全面禁止 `@import`、所有 `url()` 資源請求、`</style>` 閉合標籤及動態表達式，嚴格限制 UTF-8 位元組上限（64 KiB），並在任何 DOM 操作前完成安全特徵攔截，落實深度防禦（Defense in Depth）。
**署名:** Sentinel as Antigravity

## 2026-11-05 - Defense-in-Depth HTTP Security Headers & Clickjacking Mitigation
**漏洞/脆弱點 (Vulnerability):** 後端 Axum HTTP 伺服器（`backend-rust/src/network.rs`）在 `origin_security` middleware 與 LAN 路由中，原先僅針對非安全請求方法檢查 Origin 來源及處理 CORS，但所有 HTTP 回應（包含 API、靜態 UI 資源以及錯誤拒絕回應）完全缺少標準的防禦性安全標頭（`X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`），可能導致本機服務被外部惡意網站透過 `<iframe>` 進行跨來源點擊劫持（Clickjacking），或在特定瀏覽器/WebView 環境中引發 MIME 嗅探混淆攻擊。
**學習 (Learning):** 本機桌面/Companion HTTP 服務雖主要綁定 `127.0.0.1` 或 LAN IP，但在瀏覽器環境下，任何本機瀏覽的網頁皆可透過嵌入 `<iframe>` 或探針發起無聲請求。若未在伺服器管道的全路徑（包含 CSRF 403 阻擋、401 未授權及一般 API 回應）統一注入 `SAMEORIGIN` 與 `nosniff`，即使實作了 CORS，仍會暴露於 UI 點擊劫持與 MIME 類型混淆風險。同時，保留 `SAMEORIGIN` 能完整相容 HUD overlay 內嵌同源 telemetry cards 的既有機制，達成零回歸防護。
**預防 (Prevention):** 於後端 HTTP 網路層抽象 `apply_security_headers` 函式，對所有進出 `router` 與 `lan_router` 的 HTTP 回應強制注入 `X-Content-Type-Options: nosniff`、`X-Frame-Options: SAMEORIGIN` 及 `Referrer-Policy: strict-origin-when-cross-origin`，並透過整合測試驗證正常路徑、LAN 路由與拒絕路徑的安全標頭一致性，落實深度防禦（Defense in Depth）。
**署名:** Sentinel as Antigravity

## 2026-11-06 - Host Header Validation & DNS Rebinding Attack Mitigation
**漏洞/脆弱點 (Vulnerability):** 後端主要 Axum HTTP/WebSocket 服務（`backend-rust/src/network.rs`）在 `origin_security` middleware 中，原先僅對非安全請求方法（POST/PUT/DELETE 等）檢查 Origin 來源以防範 CSRF，但所有請求（包含 GET、HEAD 及 WebSocket 握手）完全未校驗 HTTP `Host` 標頭與允許的本機主機白名單，亦未阻斷缺少 Host 標頭的非法請求。當使用者在本機瀏覽外部惡意網站時，攻擊者可透過 DNS Rebinding（將惡意網域名稱的 DNS 解析短暫導向 `127.0.0.1`），誘使受害者瀏覽器發送帶有惡意 Host 標頭（如 `rebind.attacker.com`）的 GET 請求，由於瀏覽器視其為同源，使攻擊者能繞過同源政策直接讀取 `/api/settings`（使用者敏感設定）、`/api/companion/qr`（Companion 配對密鑰）、`/api/analysis/sessions` 等內部機密數據。
**學習 (Learning):** 本機桌面應用（Tauri Sidecar / Localhost HTTP）在瀏覽器生態系中具備特殊的攻擊面。許多開發者誤以為僅需驗證跨站 POST 的 `Origin` 即可抵禦跨站攻擊，然而在 DNS Rebinding 威脅模型下，瀏覽器在同源視野下發起的 GET 請求不會觸發 CORS 攔截，且通常不帶跨來源 Origin 標頭。因此，服務端若未在 HTTP 管道第一線對 `Host` 標頭執行嚴格的受信任主機（`localhost`, `127.0.0.1`, `::1`, `tauri.localhost`, `testserver`）白名單比對，將使所有同源唯讀端點暴露於無授權資料竊取風險。
**預防 (Prevention):** 於後端 HTTP 網路層實作 `allowed_host` 檢查，在 `origin_security` middleware 入口處對所有進站請求強制驗證 `Host` 標頭，嚴格限制主機名稱僅允許本機回環地址與受信任的桌面客戶端標識，凡非白名單網域或缺少 Host 標頭者一律以 403 Forbidden 拒絕，並於測試套件補齊合法主機放行、惡意重綁定網域阻斷與安全標頭一致性驗證，落實深度防禦（Defense in Depth）。
**署名:** Sentinel as Antigravity

## 2026-11-07 - Companion Device Pairing Input Sanitization and Bounded Capacity Protection
**漏洞/脆弱點 (Vulnerability):** 在 Companion 服務模組 `backend-rust/src/companion.rs` 中，外部 HTTP 端點（`POST /api/companion/pair`）傳入的 `device_name` 與 `device_id` 原先未進行長度邊界限制與控制字元過濾，且已配對裝置列表 `paired_devices` 缺乏容量上限（Unbounded Collection）。若惡意或異常客戶端傳入包含 ASCII 控制字元（`\u{0000}..\u{001f}`）、超長字串或路徑字元，或發起多次配對請求，將使儲存檔 `companion_devices.json` 與伺服器記憶體無上限膨脹，引發磁碟空間耗盡與 DoS 拒絕服務風險。
**學習 (Learning):** 本地網路（LAN）或 USB 伴侶應用程式的配對端點雖需一次性 Token 驗證，但一旦進入持久化流程，未過濾的字串會直接污染儲存層與前端 UI。此外，若缺乏容量上限（Bounded Capacity），即使具備 Token 逾期機制，持續配對仍會造成無界增長（Unbounded Growth）。在 Rust 後端處理客戶端自訂識別元與集合存儲時，必須在進入 storage 前實作字元白名單過濾、長度截斷，並以嚴格容量上限（如 32 台裝置）配合 FIFO 淘汰機制，確保記憶體與磁碟持久化永遠受控且具備彈性。
**預防 (Prevention):** 針對所有伴侶端點與外部設備登記機制，實作統一的輸入消毒（`sanitize_device_name` 過濾不可見控制字元、`sanitize_device_id` 僅允許安全字元集並自動回退至標準 UUID），且持久化集合強制配置有界容量上限（`MAX_PAIRED_DEVICES`）與載入防禦，落實深度防禦（Defense in Depth）。
**署名:** Sentinel as Antigravity

## 2026-11-08 - Language File Lookup SafePath Containment and Code Boundary Defense
**漏洞/脆弱點 (Vulnerability):** 後端語言模組 `backend-rust/src/languages.rs::Languages::get` 原先直接透過 `self.root.join("lang").join(format!("{code}.json"))` 拼接外部傳入之語言代碼，未遵循專案 Core Invariant #4 採用 `storage::safe_path` 進行目錄邊界與 Windows MS-DOS 保留設備名稱驗證；同時 `config_service.rs` 中的 `GET /api/languages/{code}` 端點亦缺少輸入長度上限，使得外部請求若傳入 DOS 保留名稱（如 `con`, `aux`, `nul`, `prn`, `com1-9`, `lpt1-9`, `clock$`, `conin$`, `conout$`），底層 Win32 `fs::metadata` 將把檔案路徑直接解析為字元設備或通訊埠，造成 I/O 阻塞（Hang）、拒絕存取或潛在的 DoS 服務拒絕。
**學習 (Learning):** 專案的核心路徑防護函式 `storage::safe_path` 雖已具備完整的目錄包含性檢驗與 MS-DOS 保留設備攔截，但若特定子系統（如語言覆蓋讀取）直接使用 `Path::join` 拼接外部參數並直接調用檔案系統 API，將形成安全防護死角。外部參數在進入檔案系統操作前，必須統一經由 `safe_path` 進行沙盒邊界校驗，並於 API 入口層針對參數長度施加嚴格邊界（如 ≤ 32 字元），防止異常過長字串消耗不必要的字串分配。
**預防 (Prevention):** 嚴格遵循專案 Core Invariant #4，所有涉及使用者輸入與動態檔名組裝的檔案系統操作，一律強制經由 `storage::safe_path` 驗證合法性，若驗證失敗則優雅略過本地檔案讀取並回退至內嵌資源；於 API 路由層嚴格限制 URL 路徑參數長度與字元白名單，落實縱深防禦（Defense in Depth）。
**署名:** Sentinel as Antigravity

## 2026-11-14 - Unauthenticated LAN Pairing Body Limit & Brute-Force Lockout
**漏洞/脆弱點 (Vulnerability):** LAN HTTP 路由器（`backend-rust/src/network.rs::lan_http`）對唯一免 Bearer 驗證之端點 `POST /api/companion/pair` 直接轉交 `http_request` 處理，導致未驗證之區域網路主機可在認證前觸發高達 64 MiB 的請求本文緩衝（Pre-Auth OOM / DoS）；同時 `backend-rust/src/companion.rs::CompanionService` 之 `pending_tokens` 集合缺乏容量上限且 `pair` 方法未對連續失敗驗證施加節流或鎖定機制，存在暴力猜測配對 Token 與記憶體累積風險。
**學習 (Learning):** 區域網路（LAN）介面雖需白名單 `Host` 檢查與特定白名單路由保護，但一旦存在免 Session Token 的初始配對入口，必須比對「免認證」邊界實作獨立的最低限度請求大小限制與失敗次數冷卻（Lockout），不可直接複用已認證本機端點的大型 Payload 緩衝配額（64 MiB）或無節流驗證路徑。
**預防 (Prevention):** 在進入通用 `http_request` 前於 `lan_http` 針對 `/api/companion/pair` 強制執行 8 KiB 的 `Content-Length` 與串流讀取雙重上限（`enforce_lan_pair_body_limit`）；於 `CompanionService` 強制限制 `pending_tokens` 最大容量（16 筆，滿載淘汰最舊憑證）並對連續 5 次無效配對嘗試啟用 60 秒鎖定（回傳 HTTP 429），成功配對或冷卻期滿即自動重置。
**署名:** Sentinel as Antigravity

## 2026-11-15 - MoTeC CSV Export Formula Injection Neutralization (CWE-1236)
**漏洞/脆弱點 (Vulnerability):** 後端 MoTeC CSV 匯出模組 `backend-rust/src/motec.rs::export` 直接將 `metadata["session_id"]`（寫入 `Date` 欄位）與 `metadata["car_name"]`（寫入 `Vehicle` 欄位）輸出至 CSV 儲存格，未防範以 `=`、`+`、`-`、`@` 或前導空白／控制字元（`\t`、`\r`、`\n`）開頭的試算表公式注入（CSV Formula Injection / CWE-1236）。由於 `car_name` 可經由錄製啟動端點（`/api/analysis/recorder/start`）設定，且外部匯入的 MoTeC CSV（`/api/analysis/import/motec`）亦會保留 `Date` 與 `Vehicle` 字串，當使用者再將該工作階段匯出為 CSV 並於 Excel 或 LibreOffice Calc 開啟時，惡意公式或 DDE 指令可能於本機觸發執行。
**學習 (Learning):** 使用 RFC 4180 相容的 CSV 序列器（如 Rust `csv::Writer`）僅能確保逗號、引號與換行的結構完整性，無法防範試算表軟體解析儲存格內容前綴作為公式執行。同時，遙測數值欄位包含合法負數（例如橫向 G 值或胎面滑移角），因此不能對全表套用盲目字串前綴，必須精準針對自由格式之文字型 Metadata 欄位進行前綴中和並保持冪等性（已含單引號 `'` 前綴者不重複加註）。
**預防 (Prevention):** 於 CSV 匯出層抽象 `sanitize_csv_cell` 輔助函式，對所有自由格式文字欄位檢查是否以 `\t`、`\r`、`\n` 或忽略前導空白後之 `=`、`+`、`-`、`@` 開頭，若是則加上單引號 `'` 前綴強制試算表視為純文字顯示，並保留數值型遙測通道與正常連字號車名不受影響；同步於 `motec_contract.rs` 補齊跨前綴與冪等性安全回歸測試。
**署名:** Sentinel as Antigravity

## 2026-11-17 - Tauri Sidecar Full-Byte Integrity Verification & Symlink-Safe Extraction
**漏洞/脆弱點 (Vulnerability):** 桌面端包裝殼 `frontend/src-tauri/src/lib.rs::extract_embedded_sidecar` 在將內嵌 `server-sidecar.exe` 解壓至共享暫存目錄 `%TEMP%\FH6-HorizonTuner` 時，僅以 `fs::metadata(&sidecar_path).len() != EMBEDDED_SIDECAR.len()` 判斷是否重寫，既未校驗檔案實際位元組內容，亦未對目標路徑與父目錄檢查符號連結/目錄連接點（Symlink / NTFS Junction）或採用原子寫入。若共享暫存目錄中存在同長度遭竄改/損毀的執行檔或預置符號連結，主程式將在啟動時直接執行未經完整性驗證的二進位檔或寫入非預期目標。
**學習 (Learning):** 與 `backend-rust/src/companion_usb_runtime.rs` 執行前比對完整位元組的作法不同，桌面啟動器對 `%TEMP%` 快取執行檔僅檢查檔案長度存在明確的 TOCTOU / 完整性繞過風險（CWE-353 / CWE-377 / CWE-59）。因為 `%TEMP%` 屬於多程序共享可寫入目錄，僅依賴長度與版本號不足以保證執行檔與內嵌映像一致。
**預防 (Prevention):** 任何自暫存目錄解壓並執行的內嵌可執行檔，於執行前必須先透過 `fs::symlink_metadata` 與 `canonicalize` 邊界驗證排除符號連結與非預期目錄目標，再比對完整位元組內容（`bytes == embedded`），且寫入時一律以 `create_new(true)` 暫存檔搭配 `sync_all()` 與原子 `rename` 取代，確保執行檔完整性與防符號連結滲透。
**署名:** Sentinel as Antigravity

## 2026-11-18 - GSMTC Media Thumbnail MIME Allowlist and Sandbox CSP Defense (CWE-79 / CWE-434)
**漏洞/脆弱點 (Vulnerability):** 原生媒體擷取模組 `backend-rust/src/native/media.rs::extract_thumbnail` 直接信任 Windows GSMTC 串流回報的 `stream.ContentType()`（且缺省時直接回退為 `image/jpeg`），並由 `backend-rust/src/app.rs` 之 `GET /api/overlay/media/thumbnail` 端點原樣輸出該 `Content-Type` 且未附加沙盒 CSP 標頭。由於任何本地瀏覽器分頁或媒體播放器皆可透過 Web Media Session API 註冊任意媒體封面串流，若來源提供 `image/svg+xml`、`text/html` 或偽裝 MIME 的 SVG/HTML 標記資料，結合本機服務之 `X-Content-Type-Options: nosniff` 與允許跨站頂層導航的 GET 端點，將在瀏覽器開啟該縮圖網址時於 `127.0.0.1` 同源上下文觸發跨站腳本（XSS）執行。
**學習 (Learning):** 來自作業系統媒體工作階段（GSMTC）的 `ContentType` 與二進位影像串流屬於未受信任的外部來源（Untrusted Input）。即使前端 HUD 以 `<img>` 嵌入時不會執行 SVG 腳本，只要該 GET 端點在同源 HTTP 伺服器上直接回傳活性文件 MIME（如 SVG/HTML）且缺少 `Content-Security-Policy` 隔離，攻擊者仍可透過頂層導航或開新視窗利用 `nosniff` 強制渲染惡意腳本。
**預防 (Prevention):** 於資料擷取與 HTTP 回應雙層強制執行點陣圖影像 MIME 白名單（僅允許 `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/bmp`, `image/x-icon`, `image/avif`），在 `media.rs` 拒收開頭為 `<` 的 SVG/HTML/XML 多態資料並在缺少 `ContentType` 時透過魔術位元組（Magic Bytes）嗅探驗證；同步於 `app.rs` 的 `/api/overlay/media/thumbnail` 回應附加 `Content-Security-Policy: default-src 'none'; sandbox` 標頭，確保縱深防禦（Defense in Depth）。
**署名:** Sentinel as Antigravity

## 2026-11-19 - Bundled ADB USB Tool Symlink/Junction Traversal & Non-Atomic Staging (CWE-59 / CWE-377)
**漏洞/脆弱點 (Vulnerability):** 後端 USB Companion 工具釋放模組 `backend-rust/src/companion_usb_runtime.rs::packaged_client` 在釋放與驗證內嵌 `adb.exe` 及相依原生 DLL（`AdbWinApi.dll`, `AdbWinUsbApi.dll`）至 `<root>/tools/adb/<version>` 時，直接以 `fs::create_dir_all`、`Path::exists()` 與非原子 `fs::write` 操作目標路徑，未對各層目錄與檔案檢查 `fs::symlink_metadata` 及 `canonicalize` 邊界包含性。在可攜式（Portable）執行模式中，`<root>` 為執行檔所在目錄（可能位於共用資料夾）；若目錄或工具路徑預置符號連結或 NTFS Junction（包含懸空符號連結使 `exists()` 回傳 `false`），將觸發任意檔案覆寫或跨目錄載入惡意執行檔／DLL 劫持風險。
**學習 (Learning):** 即使已對既存在檔案實作位元組比對，僅依賴 `Path::exists()` 與 `fs::create_dir_all()` 仍會跟隨懸空符號連結與 NTFS Junction 跳脫預期沙盒根目錄（與先前 `lib.rs` 僅修補 Tauri sidecar、卻遺漏後端 ADB 工具釋放路徑形成防禦落差）。
**預防 (Prevention):** 所有內嵌二進位與原生 DLL 工具釋放路徑，一律透過逐層 `fs::symlink_metadata`（拒絕 symlink/junction 與非預期檔案類型）與 `canonicalize().starts_with(&canonical_root)` 鎖定目錄邊界，並在寫入缺失工具時採用同目錄 `NamedTempFile` 搭配 `sync_all()` 與原子 `persist` 取代 `fs::write`，確保前後端與後端輔助工具鏈具備一致的檔案系統安全保證。
**署名:** Sentinel as Antigravity

## 2026-11-22 - MoTeC LD Uniform Resampling Memory Amplification & Overflow Defense (CWE-789 / CWE-400 / CWE-190)
**漏洞/脆弱點 (Vulnerability):** 後端 MoTeC 二進位匯出模組 `backend-rust/src/motec.rs::resample_to_grid` 直接以首尾時間差計算重採樣步數 `((t_end - t_start) * freq).round() as usize` 並執行 `Vec::with_capacity(total_steps + 1)`，既未限制最大重採樣點數、亦未檢查 `freq` 與 `t_end - t_start` 的有限性（`is_finite()`）及 `.ld` 32-bit 通道偏移量上限。由於 UDP 8000 監聽於所有區域網路介面且依遊戲協定無認證，僅需兩個偽造的 324-byte UDP 封包（`TimestampMS = 0` 與 `u32::MAX` ≈ 49.7 天），即可在匯出 `.ld` 時觸發約 84.5 GB 的記憶體配置請求導致 Rust 配置器直接 `abort()` 崩潰整個後端程序；極端 `f64` 時間差或 `LapNumber` 亦會引發整數溢位 Panic。
**學習 (Learning):** 遙測時間戳記（UDP `TimestampMS` 或外部匯入 CSV）與重採樣目標頻率之間存在嚴重的記憶體放大攻擊面（Memory Amplification）：即使僅儲存少數點位，均勻時間格（Uniform Grid）重採樣仍會依「時間跨度 × 頻率」呈線性膨脹，且在 Rust 中 OOM 配置失敗預設直接中止程序（無法被 `spawn_blocking` 的 panic 邊界攔截）。此外，二進位格式（如 MoTeC `.ld` 的 `u32` 指標）必須以 checked arithmetic 驗證總位元組長度不溢位。
**預防 (Prevention):** 在 `motec.rs` 定義明確上限常數 `MAX_RESAMPLED_SAMPLES`（432,001 點，對應 60 Hz 兩小時）並由 `try_resample_to_grid` 在任何大型配置前驗證 `freq.is_finite()`、時間跨度有限性與步數邊界，超限時於 `export_ld` 優雅回傳 HTTP 422 錯誤、直接呼叫 `resample_to_grid` 則安全失敗回傳空集合；同步於 `export_ld` 以 `checked_mul`／`checked_add`／`u32::try_from` 鎖定二進位偏移量，並於 `import` 與 `generate_ldx_xml` 採用 `saturating_add`／`checked_add` 防止極端圈數溢位。
**署名:** Sentinel as Antigravity
