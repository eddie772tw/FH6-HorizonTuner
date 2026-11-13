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
