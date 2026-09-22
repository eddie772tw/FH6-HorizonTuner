# HorizonTuner Companion APP (Android)

本目錄為 HorizonTuner 的行動端輔助應用程式（Companion APP），基於 [`ref/padlink`](../ref/padlink) 參考專案的概念與實作為基礎，為玩家提供車載副螢幕 HUD、5 大遙測卡片手勢滑動監控，以及調校工作流遠端操作能力。

詳細架構評估、技術選型與系統設計請參閱 [Companion APP 架構評估規格書](../docs/architecture/companion-app-evaluation.md)。

---

## 模組分工架構 (Architecture & Modules)

本專案採多模組 Gradle 結構設計：

- **`:protocol-core` (純 Kotlin/JVM 模組)**：
  - **完全不依賴 Android SDK**，可於桌面環境進行毫秒級單元測試與契約驗證。
  - 職責：
    - `ITransport` 傳輸抽象介面（支援 LAN WebSocket、USB 本機轉發與預留之藍牙 RFCOMM 介面）。
    - 324-byte Forza 遙測封包二進位解碼器與結構體。
    - 連線狀態機 (`ConnectionStateMachine`)、心跳監控與 Watchdog。
    - 調校遠端 RPC 通訊契約（Thin-Client 模式）。
    - Golden Vectors 黃金測試向量驗證。
- **`:theme` (視覺設計系統模組)**：
  - 將桌面端 Halfmoon CSS v2 的視覺層次、深淺主題、表面與 Accent 強調色彩精準映射為 Jetpack Compose `ColorScheme` 與 Design Tokens。
- **`:app` (Android 應用程式模組)**：
  - 基於 Android 13+ (API 33+) 與 Jetpack Compose。
  - 職責：
    - 5 大遙測卡片 (`driver`, `traces`, `dynamics`, `tires`, `suspension`) 的 `HorizontalPager` 滑動切換與展開視圖。
    - 橫向駕駛艙模式 (Cockpit Mode) 與 HUD 儀表螢幕手勢切換。
    - HUD 資源動態隨選下載與私有目錄快取 (On-Demand Cache-First Strategy)。
    - 調校工作流 5 步 Wizard 遠端輸入與算牌結果呈現。
    - CameraX 一次性 QR 碼配對與 mDNS 自動探索。
    - Android `connectedDevice` 前景服務 (`TelemetryForegroundService`) 保活。

---

## 開發環境規範 (Toolchain Requirements)

- **JDK**：Temurin 17 (Java 17)
- **Gradle**：8.13 (使用 Gradle Wrapper)
- **Android Gradle Plugin (AGP)**：8.13.2
- **Kotlin / Compose Compiler**：2.2.21
- **Android SDK**：
  - `compileSdk`: 36
  - `targetSdk`: 36
  - `minSdk`: 33 (Android 13+)
  - `buildToolsVersion`: "35.0.0"

---

## 核心設計原則 (Core Design Invariants)

1. **物理調校單一真理 (SSOT)**：
   - Companion APP 嚴禁在 Kotlin 程式碼中重複實作物理計算公式。所有懸吊、彈簧、防傾桿與齒比算牌必須透過 Thin-Client RPC 委派由 PC 端 `frontend/src/utils/tuningMath.ts` 執行。
2. **HUD 資源隨選快取 (On-Demand Caching)**：
   - HUD 儀表外觀資產（SVG/JSON/字型）採隨選下載快取機制，私有目錄比對 SHA-256 哈希值，不硬性內嵌於 APK。
3. **連線強韌度與防睡眠**：
   - 透過 Android 前景服務保持 60Hz 遙測連線，螢幕常亮控制（`KEEP_SCREEN_ON`）確保遊戲競速時不黑屏。
