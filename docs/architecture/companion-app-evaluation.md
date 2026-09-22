# HorizonTuner Companion APP 架構評估與技術規格書

本文件基於 [`ref/padlink`](../../ref/padlink) 參考專案的概念與實作為基準，針對 **HorizonTuner Companion APP（Android 行動端輔助應用程式）** 進行深度架構評估、技術選型決策與詳細系統設計。

---

## 1. 背景與核心定位

HorizonTuner 桌面端為玩家提供 Forza Horizon 遊戲的高頻遙測監控、底盤懸吊/齒比調校算牌與 HUD 儀表顯示。然而在競速過程中，頻繁透過 `Alt-Tab` 跳出遊戲切換視窗會嚴重破壞駕駛節奏與操作體驗。

**Companion APP 的核心定位**：
作為 HorizonTuner 桌面端的前端附屬行動應用程式，將智慧型手機或平板電腦（如置於方向盤架、儀表台或鍵盤旁的螢幕）轉化為即時輔助終端：
1. **即時遙測監控**：針對行動裝置版型最佳化，在既有 5 大遙測區塊卡片之間流暢滑動切換，或展開詳細數據。
2. **專屬 HUD 儀表螢幕**：作為車載儀表顯示器，在指針/數位儀表與遙測卡片之間手勢滑動。
3. **調校工作流遠端操作**：在手機端完成車輛參數輸入、步驟導航（Step-by-step Wizard），並快速檢視算牌結果，無需中斷遊戲。
4. **Halfmoon 主題視覺繼承**：完整傳承桌面端 Halfmoon CSS v2 的視覺層次、深淺主題與強調色彩。

---

## 2. PadLink 參考專案核心概念剖析

在評估 Companion APP 時，[`ref/padlink`](../../ref/padlink) 提供了極具價值的架構範例：

| PadLink 核心概念 | 實作特點 (`ref/padlink`) | HorizonTuner 映射價值 |
| :--- | :--- | :--- |
| **通訊協定與核心解耦** | `:core` 為純 Kotlin/JVM 函式庫，完全不依賴 Android SDK，負責 Framing、RPC 狀態機與連線管理。 | 極高。遙測解碼、狀態機與連線退避應維持純 JVM/Kotlin，可在桌面開發環境進行毫秒級單元測試。 |
| **連線生命週期常駐** | 使用 Android `connectedDevice` 前景服務 (`LinkService`) 與常駐通知，防止系統於背景殺死連線。 | 必備。賽車進行時螢幕可能微暗或玩家短暫切換通訊軟體，前景服務能確保 60Hz 遙測連線不中斷。 |
| **Golden Vectors 契約驗證** | 使用固定測試向量（`golden-vectors.json`）驗證跨語言解碼正確性。 | 極高。可針對 324-byte Forza 遙測封包與調校參數 JSON 建立黃金測試向量。 |
| **多傳輸適應能力** | 透過介面隔離底層傳輸（RFCOMM / Socket），上層 RPC 邏輯一致。 | 極高。有助於平滑支援 LAN (Wi-Fi)、USB 有線與藍牙 (Bluetooth)。 |

---

## 3. 技術架構選型評估

我們針對 **方案 A (PadLink 模式：Kotlin + Jetpack Compose + 獨立 JVM 核心)** 與 **方案 B (Tauri Mobile v2：React 19 + TypeScript + Halfmoon CSS)** 進行綜合權衡：

### 3.1 權衡矩陣

| 評估維度 | 方案 A：Kotlin + Compose (PadLink 模式) | 方案 B：Tauri Mobile v2 (React 19 + Halfmoon) | 決策考量 |
| :--- | :--- | :--- | :--- |
| **60Hz/120Hz 滑動手勢與渲染效能** | **極高**。原生 `HorizontalPager` + Skia/Canvas 硬體加速，手勢跟手度與幀率極致穩定。 | **中等**。WebView 需承擔 DOM / CSS 佈局開銷，在 60Hz 高頻繪圖時滑動可能出現微卡頓或 Frame Pacing 抖動。 | 方案 A 勝出 |
| **HUD 儀表繪圖能耗與發熱** | **優異**。原生繪圖呼叫直接走 GPU，能耗低，適合長時間賽車持續亮屏運作。 | **普通**。WebView 高頻 Canvas 繪圖耗電與發熱量較高，可能觸發行動裝置溫控降頻。 | 方案 A 勝出 |
| **調校算牌物理單一真理 (SSOT)** | **需採 Thin-Client RPC 模式**：手機不重複實作 `tuningMath.ts`，由 PC 端執行算牌後回傳。 | **直接重用**：可直接 import `tuningMath.ts`，但若手機斷線離線計算仍有公式同步議題。 | 兩者皆可維持 SSOT |
| **Halfmoon CSS 主題繼承** | **需 Token 映射**：將 CSS 變數轉換為 Compose `ColorScheme` 與 Design Tokens。 | **100% 原始繼承**：直接套用既有 CSS/SCSS 樣式。 | 方案 B 勝出 |
| **連線常駐與背景服務** | **原生完整支援**：成熟的 Android Foreground Service + WakeLock 控制。 | **受限**：Tauri 缺乏官方 Android 前景服務插件，需客製 JNI/Kotlin 橋接。 | 方案 A 勝出 |
| **多傳輸擴展性 (藍牙 / USB)** | **完整原生支援**：PadLink 已具備 RFCOMM 實作；USB ADB/Tethering 支援完善。 | **極難擴充**：Tauri 目前無成熟的藍牙 Classic RFCOMM 官方外掛。 | 方案 A 勝出 |

### 3.2 評估結論

**決定採用「PadLink 架構改進型：Kotlin + Jetpack Compose + Thin-Client Protocol Core」**。
其核心決策依據在於：
1. 行動端作為 HUD 儀表與即時遙測顯示，**流暢的手勢滑動、極低繪圖延遲與穩定的幀率是核心體驗基石**。
2. 透過 **Thin-Client RPC 模式**，調校計算完全交由 PC 端執行，完美遵守專案「`frontend/src/utils/tuningMath.ts` 為物理唯一真理」之架構紅線，避免跨語言公式維護成本。
3. 採用原生 Android 技術棧能無縫繼承 PadLink 的前景連線保活機制，並為藍牙與 USB 擴展奠定堅實基礎。

---

## 4. 四大核心功能與子系統設計

### 4.1 5 大遙測卡片滑動切換與展開 (`driver`, `traces`, `dynamics`, `tires`, `suspension`)

桌面端現有 5 種遙測區塊定義於 [`TelemetryCardShell.tsx`](file:///d:/FH6-HorizonTuner/frontend/src/features/telemetry/components/TelemetryCardShell.tsx)：
1. `driver`：油門、煞車、離合器、手煞車垂直輸入條、方向盤轉角儀表與引擎轉速。
2. `traces`：踩踏曲線歷史軌跡 (Pedal Trace Canvas) 與馬力/扭力曲線 (PowerTorqueCanvas)。
3. `dynamics`：車身動態、G-Force 雷達圖 (GForceRadar) 與側向加速度。
4. `tires`：四輪輪胎溫度、胎壓、磨耗與輪胎抓地力雷達圖 (TireRadar)。
5. `suspension`：四輪懸吊作動量 (SuspensionBar) 與行程百分比。

**行動端設計**：
- 使用 Jetpack Compose `HorizontalPager` 實現 5 張卡片的水平全螢幕/半螢幕滑動。
- 卡片底部配置分頁指示器 (Pager Indicator) 與快速跳轉導航列。
- 每張卡片支援「精簡摘要檢視」與「展開詳細數據檢視（Bottom Sheet 或全螢幕對話框）」。
- 滑動過程採用硬體加速層（`graphicsLayer`），確保在 60Hz/120Hz 刷新率下零掉幀。

### 4.2 HUD 螢幕與卡片手勢切換

- 手機／平板橫向擺放時，自動切換至 **橫向專業駕駛艙模式 (Cockpit Mode)**。
- 支援透過上下滑動或側邊邊緣手勢，在 **全螢幕 HUD 儀表盤**（檔位、轉速換檔指示燈 Shift Light、時速、單圈時間）與 **5 大遙測卡片檢視** 之間瞬時切換。
- 支援螢幕常亮控制（`KEEP_SCREEN_ON`），防止車輛激烈競速時螢幕逾時鎖定。

### 4.3 HUD 資源動態載入策略 (On-Demand Download & Caching)

針對 HUD 儀表盤的外觀資產（儀表刻度盤、換檔指示燈樣式、客製向量字型、車廠標誌）：
- **載入階段**：
  - **不內嵌於 APK 靜態資源中**，避免膨脹 APK 體積與版號發行綁定。
  - **隨選下載與本機快取 (On-Demand Cache-First Strategy)**：
    1. 當 Companion APP 與 PC 端配對連線成功後，向 PC 端端點 `GET /api/hud/manifest` 請求目前啟用的 HUD 資源清單（包含檔案路徑與 SHA-256 哈希值）。
    2. APP 比對本地私有快取目錄（`context.cacheDir/hud/`）：若本地無快取或 SHA-256 不符，則透過 HTTP 動態下載相應的 SVG / 圖片 / 配置 JSON。
    3. 下載完成並通過 SHA-256 校驗後寫入磁碟，隨後由 Skia/Compose 載入記憶體。
    4. 若處於離線或弱網狀態，APP 自動降級使用本地預設的向量繪圖幾何體（Default Vector HUD），確保任何情況下儀表均可正常運作。

### 4.4 調校工作流遠端操作 (Remote Control Thin-Client)

- **架構設計**：
  - Companion APP 提供與桌面端同等的 5 步調校嚮導（Step-by-step Wizard）。
  - **參數輸入**：透過觸控最佳化的滑桿（Slider）、微調步進器（Stepper）與預設下拉選單輸入車輛參數（車重、前後配重比、驅動形式、馬力扭力等）。
  - **算牌執行**：點擊「計算調校」時，APP 將參數封裝為 JSON，透過 REST API (`POST /api/tuning/calculate`) 或 WebSocket RPC 發送至 PC 端。
  - **結果呈現**：PC 端調用 `tuningMath.ts` 取得精確的胎壓、防傾桿 (ARB)、彈簧磅數、阻尼與齒比計算結果後回傳，APP 以清晰卡片與圖表呈現結果數值與調整建議。

### 4.5 Halfmoon CSS v2 主題配色繼承

定義獨立模組 `:companion:theme`，將 Halfmoon CSS v2 的視覺變數精準映射至 Jetpack Compose：

```kotlin
// Halfmoon Design Tokens 映射範例
val HalfmoonDarkColors = darkColorScheme(
    background = Color(0xFF1A1D20),       // --bs-body-bg (Halfmoon 深灰黑底)
    surface = Color(0xFF212529),          // --bs-tertiary-bg (卡片底色)
    surfaceVariant = Color(0xFF2B3035),   // 邊框與次級表面
    primary = Color(0xFF0D6EFD),          // --bs-primary (經典 Accent 藍)
    secondary = Color(0xFF6C757D),        // 次要文字與弱化標籤
    error = Color(0xFFDC3545),            // 超轉警告與過熱
    outline = Color(0xFF495057)           // 分割線與微弱邊框
)
```

支援跟隨 PC 端的設定同步切換深色（Dark）與淺色（Light）模式，並支援高對比賽道模式（High-Contrast Track Mode）。

---

## 5. 連線與傳輸架構設計

```
+-----------------------------+                     +-------------------------------+
|     HorizonTuner PC Host    |                     |  Android Companion APP        |
|                             |                     |                               |
|  [Axum REST & WebSocket]    | <=== LAN / Wi-Fi ===> [OkHttp WebSocket / HTTP]     |
|  [mDNS / UPnP Advertiser]   | <--- Zero-conf ---- | [NsdManager mDNS Client]      |
|  [One-Time QR Token Gen]    | ---- QR Scan -----> | [CameraX QR Scanner]          |
|                             |                     |                               |
|  [ADB Reverse Manager]      | <=== USB Cable ====>| [127.0.0.1:8001 Local Socket] |
|                             |                     |                               |
|  [Phase 2: RFCOMM Listener] | <--- Bluetooth ---->| [Phase 2: Wire.kt RFCOMM]     |
+-----------------------------+                     +-------------------------------+
```

### 5.1 核心傳輸抽象層 (`ITransport`)

在 `:companion:protocol-core` 中定義統一的傳輸合約，解耦具體物理通道：

```kotlin
interface ITransport {
    val state: StateFlow<TransportState> // DISCONNECTED, CONNECTING, CONNECTED, ERROR
    suspend fun connect(): Result<Unit>
    suspend fun send(data: ByteArray): Result<Unit>
    suspend fun disconnect()
    val incomingFrames: Flow<ByteArray>
}
```

### 5.2 主要連線模式：區域網路 (LAN)

1. **配對階段 (Pairing)**：
   - 桌面端生成配對 QR Code，內容包含：`{"ip":"192.168.1.100","port":8001,"token":"<auth-uuid>","version":"1.0"}`。
   - Companion APP 透過 CameraX 掃描 QR 碼，取得連線資訊並儲存於加密 SharedPreferences。
2. **自動發現與重連 (Zero-conf Discovery)**：
   - PC 端啟動時透過 mDNS 發布服務 `_horizontuner._tcp.local`（包含動態 HTTP/WebSocket 端口）。
   - Companion APP 透過 Android `NsdManager` 自動探測已配對過的主機，開啟 APP 即可秒級自動連線。
3. **高頻串流與 RPC**：
   - 高頻遙測：WebSocket (`ws://<host>:8001/ws`) 傳輸 60Hz 結構化遙測數據。
   - 調校與控制：REST HTTP API 處理設定存取與算牌請求。

### 5.3 擴充連線 A：藍牙 (Bluetooth Classic RFCOMM) - Phase 2 介面預留

- **頻寬驗證**：60Hz 下 324-byte 二進位封包需求僅約 19.44 KB/s (155 kbps)，Bluetooth Classic 1~2 Mbps 頻寬綽綽有餘。
- **介面預留**：
  - 在 `:companion:protocol-core` 中預留 `RfcommTransport : ITransport` 介面。
  - 將 PadLink 的 `Wire.kt`、`RpcClient.kt` 與 `ConnectionManager.kt` 納入 core 模組中的通訊驅動插槽，待 PC 端完成 RFCOMM 監聽服務後即可無縫點亮。

### 5.4 擴充連線 B：USB 有線傳輸 (Zero-PC Setup + USB 偵錯自動連線)

- **使用者體驗**：
  - **PC 端零額外設定**：使用者不需要在 PC 端手動設定 IP、開啟路由器端口或配對網路。
  - **手機端唯一操作**：使用者在 Android 裝置上開啟「USB 偵錯 (USB Debugging)」。
- **自動連線機制**：
  1. 當手機透過 USB 線連接至 PC，PC 端後端（或 sidecar）背景偵測到 ADB 設備連線。
  2. PC 端自動觸發命令：`adb reverse tcp:8001 tcp:8001`（將手機本地 8001 端口反向轉發至 PC 端 HorizonTuner 伺服器）。
  3. Companion APP 的連線管理器優先探測 `127.0.0.1:8001`：一旦探測成功，立即建立近乎 0 延遲 (<1ms)、無任何 Wi-Fi 封包丟失的極致穩定連線。

---

## 6. 目錄結構與模組職責規劃

在專案中建立獨立的 `companion/` 模組目錄：

```text
companion/
├── README.md                      # Companion APP 開發環境與建置指南
├── build.gradle.kts               # 根建置設定 (Gradle 8.13, AGP 8.13.2, Kotlin 2.2.21)
├── settings.gradle.kts            # 包含 :protocol-core, :theme, :app
├── gradle/
│   └── wrapper/                   # 固定版本 Gradle Wrapper
├── protocol-core/                 # 純 JVM 模組 (無 Android SDK 相依)
│   ├── build.gradle.kts
│   └── src/
│       ├── main/kotlin/org/horizontuner/companion/core/
│       │   ├── transport/         # ITransport, WebSocketTransport, RfcommTransport (P2)
│       │   ├── telemetry/         # 324-byte Forza 封包解碼器與結構體
│       │   ├── connection/        # 連線狀態機 (ConnectionStateMachine), Heartbeat, Watchdog
│       │   └── rpc/               # 調校遠端 RPC 與 Session 管理
│       └── test/                  # Golden Vectors 與契約測試
├── theme/                         # 視覺設計模組
│   ├── build.gradle.kts
│   └── src/main/kotlin/org/horizontuner/companion/theme/
│       ├── Color.kt               # Halfmoon CSS v2 色彩 Tokens
│       ├── Type.kt                # 排版與字型規格
│       └── Theme.kt               # HalfmoonTheme Compose 主題封裝
└── app/                           # Android 應用程式模組
    ├── build.gradle.kts
    └── src/
        ├── main/
        │   ├── AndroidManifest.xml
        │   └── kotlin/org/horizontuner/companion/app/
        │       ├── MainActivity.kt
        │       ├── service/       # TelemetryForegroundService (connectedDevice 保活)
        │       ├── hud/           # HUD 儀表視圖與動態隨選快取 (On-Demand Caching)
        │       ├── telemetry/     # 5 大卡片 HorizontalPager 佈局與展開視圖
        │       ├── tuning/        # 遠端調校 5 步 Wizard 介面
        │       └── pairing/       # CameraX QR 掃描與 mDNS 探索視圖
        └── androidTest/           # 實機 UI 與連線整合測試
```

---

## 7. 分階段實施路線圖 (Implementation Roadmap)

| 階段 | 範圍與重點 | 驗收交付物 |
| :--- | :--- | :--- |
| **Phase 1 (本 PR / 基礎架構)** | • 完成架構評估規格書與目錄規劃。<br>• 設立獨立分支與佔位 PR。<br>• 建立 `:protocol-core` 純 JVM 模組骨架與傳輸介面抽象 (`ITransport`)。<br>• 定義 HUD 隨選下載快取契約與 Halfmoon 色彩 Tokens。 | `docs/architecture/companion-app-evaluation.md`<br>`companion/README.md`<br>佔位 Pull Request |
| **Phase 2 (連線與傳輸實作)** | • 實作 LAN WebSocket 串流與 mDNS 自動發現。<br>• 實作 CameraX 一次性 QR 碼配對流程。<br>• 實作 USB 偵錯 `adb reverse` 自動探測與回退連線。<br>• 串接 PC 端 HorizonTuner 後端 WebSocket 廣播。 | 連線管理模組、QR 掃描器、USB 轉發測試 |
| **Phase 3 (UI 與互動體驗)** | • 實作 5 大遙測卡片之 `HorizontalPager` 滑動切換與展開視圖。<br>• 實作 HUD 儀表螢幕與手勢切換。<br>• 實作調校工作流遠端 Thin-Client 操作（連動 PC 算牌）。<br>• 完成 HUD 資源隨選下載快取（On-Demand Cache-First）。 | Android Companion APK、UI 整合測試 |
| **Phase 4 (擴充傳輸與強化)** | • 接入 Phase 2 預留之藍牙 RFCOMM 實作（複用 PadLink 代碼）。<br>• PC 端藍牙 RFCOMM 監聽器適配。<br>• 高對比賽道模式與實機耐久性測試。 | 藍牙連線支援、發布正式 Companion 預覽版 |
