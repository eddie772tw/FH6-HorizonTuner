# Google Play 正式發行與上架準備指南 (V1)

本文件依據 [Issue #433](https://github.com/eddie772tw/FH6-HorizonTuner/issues/433) 與 Google Play 開發者政策，定義 HorizonTuner Companion Android 應用正式發行前之產物構建、安全性合規、Data Safety 申報、權限聲明、審查存取指引及隱私權政策規範。

---

## 1. 可重現 Release AAB 構建與簽名流程

Google Play 正式分發必須採用 Android App Bundle (`.aab`) 格式，且禁止使用 Debug 簽名或已開啟 `debuggable` 的產物。

### 1.1 構建環境與工具鏈
- **JDK**：OpenJDK 17 (`JAVA_HOME`)
- **Android SDK**：API 36 (`compileSdk 36`, `targetSdk 36`, `minSdk 33`)
- **Gradle 任務**：`:app:bundleRelease`

### 1.2 金鑰管理與環境變數合約
構建腳本 (`companion/app/build.gradle.kts`) 支援透過環境變數或 `local.properties` 注入正式發行金鑰：

```bash
# 正式發行簽名環境變數
export HORIZONTUNER_KEYSTORE_PATH="/path/to/upload-keystore.jks"
export HORIZONTUNER_KEYSTORE_PASSWORD="<store_password>"
export HORIZONTUNER_KEY_ALIAS="<key_alias>"
export HORIZONTUNER_KEY_PASSWORD="<key_password>"
```

- 若上述環境變數未提供（如本機測試或 CI 自動化驗證），Gradle 會自動降級使用 Debug Keystore 進行簽名，確保構建流程可重現且不阻斷自動化 Pipeline。
- **Play App Signing**：上傳至 Play Console 時採用由 Google 管理的應用簽名金鑰，本機 keystore 僅作為「上傳金鑰 (Upload Key)」。

### 1.3 構建命令
於專案根目錄或 `companion/` 目錄執行：

```bash
# 執行測試、Lint 與 Release AAB 打包
./gradlew :protocol-core:test :app:lintDebug :app:bundleRelease
```

產物輸出路徑：
- `companion/app/build/outputs/bundle/release/app-release.aab`

---

## 2. 安全性與網路傳輸合約 (Security & Network Contract)

### 2.1 區域網路與明文限制 (RFC 1918 Enforced)
Companion 應用為區域網路即時遙測副螢幕，通常連接本機 PC 所建立之 LAN HTTP/WebSocket 服務（預設埠 8002）。
為符合 Google Play 安全政策並杜絕全網明文風險，專案實施雙層防護：

1. **Network Security Configuration (`network_security_config.xml`)**：
   - 移除頂層 `usesCleartextTraffic="true"` 全域許可。
   - 僅允許本機私有網路 (LAN) 及 Loopback 傳輸明文 HTTP，公網域名預設不允許明文 HTTP。
2. **應用層 IP 白名單校驗 (`MainActivity.kt`)**：
   - `buildOrigin` 與 `buildCompanionUrl` 強制校驗輸入主機：僅允許 RFC 1918 私有 IPv4 位址（`10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16`）、Link-Local 位址（`169.254.0.0/16`）及本機回環（`127.0.0.1`、`localhost`）。
   - 任何公網 IP 或公網網域名稱均會被直接攔截並拒絕連線。

### 2.2 工作階段與 Token 儲存安全
- **短碼安全**：QR 碼包含之 10 碼配對 Token 僅於記憶體中比對，具備 5 分鐘有效期限 (TTL) 且限單次使用。
- **Session Cookie**：配對成功後發放之 `companion_session` Cookie 具備 `HttpOnly`、`SameSite=Strict` 屬性，落盤於應用內部私有 `SharedPreferences`，重啟後可驗證恢復，PC 端撤銷後立即失效。

---

## 3. 功能分流架構 (Build Variant Gating)

依據 Google Play 發行方針，正式版應保持一般使用者的簡潔性與安全直覺：

| 功能項目 | 正式版 (Release Build) | 開發版 (Debug Build) |
| :--- | :--- | :--- |
| **預設連線模式** | 區域網路 (LAN) QR 相機配對 | 頂部提供 Local network / USB debugging 快速切換按鈕 |
| **USB / ADB 入口** | 收整於「進階選項 · 手動連線」中，標記為「開發者選項」 | 頂部明顯按鈕，支援快速連線 `127.0.0.1:8001` |
| **掃碼機制** | 僅支援 CameraX 即時相機掃描，無相簿／檔案匯入 | 僅支援 CameraX 即時相機掃描，無相簿／檔案匯入 |
| **WebView 除錯** | 關閉 (`setWebContentsDebuggingEnabled(false)`) | 開啟 (`setWebContentsDebuggingEnabled(true)`) |

---

## 4. Google Play Console Data Safety 申報清單

在 Google Play Console 的「資料安全性 (Data safety)」表單中，應依應用實際行為如實宣告：

### 4.1 資料收集與共用
- **是否收集或共用任何個人資料？**
  - **否 (No)**。HorizonTuner Companion 不會收集、儲存或向任何第三方伺服器傳輸任何個人身分資料 (PII)、帳號資訊、位置資訊或裝置識別碼。
- **是否使用廣告 ID (AAID) 或追蹤 SDK？**
  - **否 (No)**。本應用無廣告、無統計分析 SDK (如 Firebase Analytics 等)。
- **資料處理方式**：
  - 遙測數據（速度、轉速、懸吊行程等）僅於本機區域網路中即時串流顯示，不在設備持久化儲存，不向外部網際網路傳送。

### 4.2 權限用途說明表 (Permissions & Justifications)

| 權限代碼 | 用途說明 (Google Play 宣告理由) | 執行時期請求 (Runtime) |
| :--- | :--- | :--- |
| `android.permission.INTERNET` | 用於在區域網路內與本機 HorizonTuner PC 端進行 HTTP 配對與 WebSocket 即時遙測通訊。 | 否 (Normal) |
| `android.permission.ACCESS_NETWORK_STATE` | 用於偵測設備當前網路狀態（如是否已連線至 Wi-Fi），以提示使用者連線環境。 | 否 (Normal) |
| `android.permission.CAMERA` | 僅用於即時掃描 PC 螢幕顯示之一次性配對 QR 碼。本應用不具備拍照、錄影或讀取儲存空間相片之功能。已宣告 `required="false"` 提高相容性。 | 是 (Runtime) |
| `android.permission.FOREGROUND_SERVICE` | 在駕駛遊戲進行時於背景維持 60Hz UDP 遙測串流轉發，防止 Android 系統休眠中斷連線。 | 否 (Normal) |
| `android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE` | 宣告前台服務類型為「已連接的裝置 (connectedDevice)」，對應 PC 遊戲遙測資料傳輸。 | 否 (Normal) |
| `android.permission.POST_NOTIFICATIONS` | 於 Android 13+ (API 33+) 裝置上顯示前台服務執行狀態常駐通知。 | 是 (Runtime) |

---

## 5. Google Play 審查存取指引 (App Access for Reviewers)

由於 Companion 應用設計為 Forza Horizon 遊戲之輔助工具，Google Play 審查人員在審查時可能無 Forza Horizon 遊戲本體或特定主機。
在 Play Console 的「應用程式存取權 (App access)」需提供以下審查說明：

### 5.1 審查測試指引文字 (Reviewer Notes)
> **App Description & Testing Instructions:**
>
> HorizonTuner Companion is a thin-client telemetry and tuning dashboard for PC Forza Horizon games.
> The app connects to the companion PC host via local Wi-Fi or USB.
>
> **How to verify app functionality without the Forza Horizon game:**
> 1. Launch the app on an Android device or emulator. The app displays the native Jetpack Compose Connection screen.
> 2. Tap **"掃描 QR 並配對" (Scan QR & Pair)** to verify camera permission handling and live camera QR scanner preview.
> 3. Tap **"進階選項 · 手動連線" (Advanced Options / Manual Connection)** to view manual IP, Port, and Pairing Code input fields.
> 4. Enter a dummy local IP (e.g. `192.168.1.100`) and port `8002`. The app demonstrates network validation, connection timeouts, and user feedback without crashing.
> 5. Full PC Companion host software and automated protocol verification suites are maintained open-source at https://github.com/eddie772tw/FH6-HorizonTuner.

---

## 6. 隱私權政策 (Privacy Policy)

正式上架需在 Play Console 與商店頁面提供有效之隱私權政策連結。以下為 V1 條款草案：

### HorizonTuner Companion 隱私權政策 (摘要)
- **資料收集**：HorizonTuner Companion 是一款開源且無商業盈利目的的輔助工具。我們不會收集、記錄、上傳或販售任何使用者的個人資訊、聯絡人、瀏覽紀錄或設備識別碼。
- **網路通訊**：本應用所有的網路通訊皆僅發生於使用者自有的本機區域網路 (LAN) 或 USB 回環 (Loopback)。應用程式不會連線至任何外部分析伺服器或廣告伺服器。
- **相機權限**：相機權限僅供本機 ML Kit 掃描螢幕上顯示的短效配對 QR 碼，影像資料於記憶體即時運算後立即丟棄，不會保存任何影像檔案。
- **前台服務**：前台服務僅用於在遊戲進行期間維持與本機 PC 的 WebSocket 遙測數據串流，不進行背景定位或未經授權的背景資料傳輸。
- **原始碼與稽核**：本專案為完全開源專案，原始程式碼公開於 GitHub 供社群檢驗。

---

## 7. 發行前檢核清單 (Pre-Launch Checklist)

- [x] `applicationId` 確定為 `org.horizontuner.companion`。
- [x] `compileSdk` / `targetSdk` 設定為 36（符合當前 Google Play targetSdk 要求）。
- [x] `minSdk` 設定為 33。
- [x] 移除未使用的 `CHANGE_WIFI_STATE` 敏感權限。
- [x] 相機特性宣告 `android:required="false"` 確保平板設備相容。
- [x] 建立 `network_security_config.xml` 並落實 RFC 1918 私有 IP 白名單檢查。
- [x] 配置 `signingConfigs` 與 `buildTypes.release`，完成 `proguard-rules.pro` 保護 JS Bridge。
- [x] 正式驗證 `:app:bundleRelease` 產出合法 AAB 檔案。
- [ ] 於 Google Play Console 建立內部測試軌 (Internal Testing Track)。
- [ ] 上傳正式簽署之 AAB 產物並驗證 Pre-launch report 無阻斷錯誤。
- [ ] 若使用個人開發者帳號（2023-11-13 後註冊），組織 12 名封閉測試人員進行 14 天封閉測試。
