# Issue #485 主題同步切片審查報告

這是供獨立 review 的第一個切片，Related to #485。Android CI 已完成 MainActivity 編譯、11 個 unit tests、lint 與 debug assemble，並留存 APK；native＋WebView 裝置執行尚未驗收，Issue 保持 open。

分支：`feature/issue-485-theme-sync`。基準及提交前核對的遠端 main：`d4e0fe3762c613240f7d6902d07edcb212aa5926`。產品程式碼在測試後沒有修改；後續只更新審查文件／日誌並補 CI 證據留存。使用者已授權 commit／push／draft PR，未授權合併或發布，SDK License 接受步驟保持暫停。

## 實際設計與可交付範圍

視覺來源是 Rust `ConfigService`。既有 authenticated `GET /api/companion/workflow` 的頂層 `visualTheme` 位於 tuning snapshot 外，schema version 1 只投影 `mode`、`halfmoonCore`、`primaryColor`、`secondaryColor`、`accentColor`，另帶 `schemaVersion`。沿用 polling，不新增 LAN route／allowlist 權限，不暴露完整 settings、CSS、script、URL 或 credential。desktop host bridge 沒有新增主題權威。

投影更新不依賴 tuning revision 或 desktop lease：desktop offline、backend reachable 時仍可接收。command response 可以缺省主題；command busy 的 workflow acknowledgement polling 仍接收投影。缺省、錯誤或失敗保留最後有效值，不重置 dark、不回寫遠端。

React receive-only 路徑與一般 settings POST 分離。Companion 首幀 DOM 和 React 使用同一已驗證 bootstrap；receive 更新不重掛工作區，不改 profileKey、revision、draft、measurement、readiness 或 Step 1–4 eligibility／計算。一般 desktop 設定路徑保留。

Native 專用 `HorizonTunerCompanionTheme` bridge 只有 `themeBootstrap()` 與 `updateVisualTheme(json, generation)`。1024 bytes codec 原子驗證完整六欄位、版本、七 core、light/dark、六位 HEX；未知欄位／錯誤／過大 payload 整份拒絕。主執行緒套用時再次檢查 lease、generation 和目前 WebView document。配對及 Cookie 的舊回呼另受 connection attempt 檢查。

Private preferences 快取以 canonical endpoint origin 的 SHA-256 分離 scheme／host／port。冷啟動 Native 首次繪製與 Web bootstrap 使用同一驗證快取，backend refresh 為最終權威。相同 endpoint 在離線、重連及重開保留最後有效值；新 endpoint 只使用自己的有效快取或初始預設，不繼承舊 host 主題。原有 URL／Cookie／session／origin 安全邊界保留。

Native 色彩、表面、文字、border、shape、字階和 navigation token 集中於 `:theme`，對應既有 Halfmoon／Swiss／Rhine CSS 與 palette normalization，Rhine 是獨立 core。功能性成功／警告／錯誤色另設，不被三色主題改寫。Native tabs 依內容寬度、上限 224dp、48dp 觸控目標、可橫向捲動。Halfmoon 實色 tab、Swiss 底線、Rhine 刻度由 tokens 決定。Web 區段導覽使用既有 workspace-tabs/nav-link hooks，保留 scrollspy、scroll-to、aria-current。

契約與執行命令見 [Companion 主題契約](../../../companion/theme/README.md)、[實作邊界](../../architecture/companion-implementation-boundary.md)。未處理額外 Companion 功能、公式更換或 #487 P2/P3；未修改 PR #497 分支、mind-the-shop、main 或 release。

## 本地工具與來源

新增工具、dependency caches 與原始大型證據均留在 repo 外的 `/workspace/toolchains`、`/workspace/evidence/issue-485`。沒有改系統安全設定或使用未知來源工具。

| 工具 | 可用性與來源 |
| --- | --- |
| Node 24.19.0／pnpm 11.19.0 | 環境既有；依 frozen lockfile 安裝 |
| Rust 1.99.0／rustfmt | static.rust-lang.org 官方 rustup；任務專用 CARGO_HOME／RUSTUP_HOME |
| JDK 17.0.19 | deb.debian.org 官方 OpenJDK package，抽取於任務目錄；只修復指向系統 /etc 的解壓 symlink 路徑，security 原內容未改 |
| Gradle 8.13 | downloads.gradle.org 官方 ZIP，SHA-256 與 checked-in wrapper 相同 |
| AGP 8.13.2／Kotlin 2.2.21／Compose compiler | 已依既有 project 版本透過 Google／Maven／Gradle repositories 解析 |
| Android SDK 36／min SDK 33／Build Tools 35.0.0 | project 需求已核對；SDK Platform／Build Tools／Platform Tools 因未接受授權尚未安裝 |
| Android command-line tools | dl.google.com 官方 ZIP |
| Android emulator/device | 未提供；環境沒有 /dev/kvm |

## 已執行驗證與證據範圍

順序為前端 tests／build、具 Companion assets 的 Rust tests、Android 檢查。下列結果均為實際執行，未執行的項目明列 blocked。原始輸出與補充 runner 在 `/workspace/evidence/issue-485` 保留，未上傳大型原始證據；GitHub 讀者需由本次交付取得該證據目錄。

| 檢查 | 結果 | 原始證據檔 |
| --- | --- | --- |
| `pnpm -C frontend run test` | 198 passed files；1747 passed／1 skipped tests | `frontend-test.log` |
| Linux 預設 build | 通過；LAN profile 不含 Companion，不作 sidecar 證據 | `frontend-build.log` |
| `FH6_PLATFORM=windows pnpm -C frontend run build` | 通過；Companion index/assets 已確認，用於 Rust tests | `frontend-companion-build.log` |
| `cargo test --locked --manifest-path backend-rust/Cargo.toml` | 184 passed／2 ignored | `rust-test.log` |
| 同上，加 `--no-default-features` | 176 passed／2 ignored | `rust-no-default-test.log` |
| Rust fmt／git diff check | 通過 | `final-checks.log` |
| Gradle `:protocol-core:test` | 5 passed，真正 Gradle task | `android-protocol-test.log`、`protocol-test-results/` |
| codec／tokens／ThemeSession 同一份 native 測試 | 6 passed；Kotlin 2.2.21＋Compose compiler、實際 libraries 的純 JVM JUnit；不是 Android Gradle gate | `native-contract-test.log`、`run-native-contracts.cjs` |
| CompanionShell compile-only | 通過；Activity enums／BuildConfig 用 stubs，不包含 MainActivity | `shell-compile.log`、`compile-shell.cjs`、`shell-contract-stubs.kt` |
| 本地完整 Android gate | **Blocked**：task dependency 階段因 SDK 授權未接受停止；沒有重複安裝 SDK | `android-gate.log`、`android-sdk-install.log` |
| 遠端 Android 完整 gate | **通過**：MainActivity 所在 app Kotlin compile、protocol/theme/app unit tasks、lint、packageDebug／assembleDebug | `android-ci-original-job.log`；[run 37967243385](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37967243385) |
| 證據留存及實際 XML 計數 run | **通過**：protocol 5／theme 4／app 2，共 11 tests，0 failure／error／skipped；lint／assemble 與 APK 留存成功 | `android-ci-counts-job.log`、`android-ci-summary.json`；[run 37969337059](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37969337059) |
| Chromium Web matrix | Chromium 151.0.7922.173，390×844，14 core×mode variants；dirty draft 保留、頁面無水平溢出 | `browser-results.json`、`web-check.cjs` |

前端新增案例涵蓋缺欄位、錯誤／過大／可執行 payload、cache 損壞、bootstrap origin、backend offline／reconnect、desktop lease offline、相同 revision、command busy／缺省 command theme、late callbacks、七 core×日夜、自訂及預設 palette，以及 dirty draft／區段／量測／eligibility 保留。native 純 JVM 案例涵蓋冷啟動、重開、離線、重連、host switch、generation、rapid updates／late callbacks、codec 與 token。Rust LAN tests 確認一般 settings/admin 仍拒絕，session／revocation／origin 保護維持。

[Android CI](../../../.github/workflows/companion.yml) 的 [job 113944549082](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37967243385/job/113944549082) log 確認 `:theme:testDebugUnitTest`／`:app:testDebugUnitTest` 實際執行，沒有 NO-SOURCE／UP-TO-DATE 標記；`:app:compileDebugKotlin`、protocol tests、lint、packageDebug／assembleDebug 均完成，`BUILD SUCCESSFUL in 3m 25s`。

此 run 綁定 head `c8ad8e479c087a31327beea7c6a864afba9e7a76`，實際 checkout 為 GitHub PR 合成 merge `f52ef7a6a49571ec75cc6f0f23c74449113f1fda`，將 head 合入既有基準 `d4e0fe3762c613240f7d6902d07edcb212aa5926`；這不是把 PR 合併進 main。初次 run 沒有 artifacts，log 沒有 JUnit 計數，不能憑 source 中的 @Test 數量宣稱實際執行數，也沒有可下載 APK 或 APK hash。

後續 [run 37969337059／job 113951643171](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37969337059/job/113951643171) 已 success。測試 head 是 `add0c1fde401f99a2789c8f97e5a5d895c632fa9`，checkout 是 PR 合成 merge `31bfe5ab23e635fff4011bed01b7921b23b08a9a`。實際 XML suite header 計數為 protocol 5、theme 4（VisualThemeCodecTest 2／VisualThemeTest 2）、app 2（ThemeSessionTest），合計 11，failure／error／skipped 均為 0；不以 source 中的 @Test 數量推估。

此 run 留存三個模組的原始 JUnit XML、lint XML／HTML、debug APK、APK SHA-256、head／checkout SHA、Android source hash 及 Java version。並實際檢查各模組 XML、lint XML 與 APK 存在。runner 的 30 個 Android source hashes 與本機來源相同，包含 MainActivity SHA-256 `af84cfe9a9a4246fbeb7ae41d40be3b44f4493403a2c35626b3752dfb59c6fc5`。runner JDK 為 Temurin 17.0.20.1；這不是 Android 裝置／WebView 版本。

可下載 [artifact 11635360782](https://github.com/eddie772tw/FH6-HorizonTuner/actions/runs/37969337059/artifacts/11635360782)，保留至 2026-10-23。ZIP size 21,942,905 bytes；artifact digest 是 `8eec20b4f139c640456c3d652d89535a216594685a41eb97cdb57495d61e5cc0`。內含的 `app-debug.apk`，CI 實際計算 SHA-256 為 `75b5d34cfe35365e7d57703d367108516d52a84346f688aee870b6dc34cce12e`。debug APK 是 CI artifact，未發布 release。

工作區的下載路徑及檔案匯入均受環境阻擋，未取得本機 ZIP／APK bytes，沒有宣稱本地重算 hash 或解析完整 XML。實際計數來自 CI 輸出的原始 XML suite headers，完整 XML／APK 留在上述 GitHub artifact；原始 CI logs、API artifact metadata 與可重現的計數／source hash 摘要保存在交付目錄。最後報告更新只改 Markdown，產品來源與此測試 head 相同。

## 截圖、未驗收項目與剩餘界線

`browser-{swiss,rhine-lab}-{light,dark}.png` 是四張 Web 補充截圖。workflow 為合成 fixture，其他 API 模擬 LAN 拒絕，因此部分翻譯退回 key。它們只代表 Chromium Web 層，不是實際 LAN、Android、WebView 或 native＋WebView 同框驗收。

**尚未驗證 Android／WebView 版本與 native＋WebView 裝置執行。** MainActivity 已在上述 CI 真正編譯；unit／lint／debug assemble 已通過，APK 及 runner hash 已留存。本機 APK byte verification 未做。窄螢幕、旋轉、鍵盤、長標籤、頁尾可達、LAN／USB／QR／revocation 的裝置整合及真實遊戲亦未驗證。

Compose 字體仍為 Android sans-serif fallback，未新增／轉換 MiSans、Inter、Outfit 素材；Halfmoon native 沒有 CSS blur／radial anchor，Rhine native 沒有分頁動畫。這不是 Issue #485 全部視覺與手機驗收。

## SDK 授權保持暫停

sdkmanager 的完整授權名稱為 **Android Software Development Kit License Agreement**，識別碼 `android-sdk-license`，本次提示正文日期為 **January 16, 2019**。官方 [Android SDK Terms](https://developer.android.com/studio/terms) 目前日期為 April 28, 2026；不能將兩版視為相同文字，實際提示全文在 `android-sdk-install.log`。

已核對 Google 官方 `repository2-3.xml`：指定的 `platforms;android-36`、`build-tools;35.0.0`、`platform-tools` 都只引用 `android-sdk-license`，此次安裝沒有其他接受提示。metadata 摘要另保存在 `sdk-license-packages.json`。沒有選取 emulator／system images／NDK／Google APIs add-ons。

SDK 條款亦提及開源元件各自授權（3.5）、第三方及 Google Data APIs 額外條款（7.3／8.1.1），以及使用 Android Recognition Service API 時的 [Data Processing Addendum for Products where Google is a Data Processor](https://privacy.google.com/businesses/gdprprocessorterms/)（8.1.2）。這些條件不等於本次有另一個安裝接受提示；使用統計收集亦需另行同意（6.1）。沒有代使用者接受 SDK 或其他條款，亦沒有 automatic approval review rejection。

遠端 runner 已完成 compile／unit／lint／assemble，不為重複編譯要求安裝本地 SDK。本地 SDK 授權保持暫停；若後續確有本地 SDK 需求，才由使用者確認。裝置驗收須同時看到 native／WebView 並記錄 commit、APK hash、Android／WebView 版本。純 JVM tests、瀏覽器截圖或 APK build 不替代該驗收。

## 完整檔案清單（37 個）

```text
.agents/Journal.md
.agents/skills/halfmoon-design-system/HALFMOON_SPECIFICATION.md
.github/workflows/companion.yml
README.en.md
README.md
backend-rust/src/app.rs
backend-rust/src/companion_theme.rs
backend-rust/src/config_service.rs
backend-rust/src/lib.rs
backend-rust/tests/companion_lan.rs
companion/README.md
companion/app/build.gradle.kts
companion/app/src/main/kotlin/org/horizontuner/companion/app/CompanionShell.kt
companion/app/src/main/kotlin/org/horizontuner/companion/app/MainActivity.kt
companion/app/src/main/kotlin/org/horizontuner/companion/app/ThemeSession.kt
companion/app/src/test/kotlin/org/horizontuner/companion/app/ThemeSessionTest.kt
companion/theme/README.md
companion/theme/build.gradle.kts
companion/theme/src/main/kotlin/org/horizontuner/companion/theme/Color.kt
companion/theme/src/main/kotlin/org/horizontuner/companion/theme/Theme.kt
companion/theme/src/main/kotlin/org/horizontuner/companion/theme/VisualTheme.kt
companion/theme/src/test/kotlin/org/horizontuner/companion/theme/VisualThemeCodecTest.kt
companion/theme/src/test/kotlin/org/horizontuner/companion/theme/VisualThemeTest.kt
docs/architecture/companion-implementation-boundary.md
docs/frontend/companion-theme-sync-review/README.md
docs/frontend/design-systems.md
frontend/src/AppProviders.tsx
frontend/src/companion-main.tsx
frontend/src/context/ThemeContext.tsx
frontend/src/features/companion/CompanionApp.tsx
frontend/src/features/companion/CompanionTuning.tsx
frontend/src/features/companion/companion.css
frontend/src/features/companion/companionProtocol.ts
frontend/src/features/companion/companionTheme.test.ts
frontend/src/features/companion/companionTheme.ts
frontend/src/features/companion/companionThemeSync.test.tsx
frontend/src/features/companion/useCompanionSession.ts
```

完整 diff 可由 draft PR Files changed 取得；本機另保留初次交付 `issue-485.patch`／`source-manifest.json`，以及提交版本的 patch／publication manifest。工具鏈、SDK、dependency cache、原始 logs、runner、截圖都沒有加入 commit。

Author / Maintainer: Codex as Codex
