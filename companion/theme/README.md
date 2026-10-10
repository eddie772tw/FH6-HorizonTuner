# Companion 主題契約

`:theme` 維護 version 1 的受限 `VisualTheme`、atomic codec 與 Compose tokens。視覺來源是 Rust `ConfigService`；Android 與 React 只接收。桌面 host bridge 仍只管理調校工作流，不能提交另一份主題。

`GET /api/companion/workflow` 的 `visualTheme` 位於 tuning snapshot 外，包含 `schemaVersion: 1`、`mode`、`halfmoonCore`、`primaryColor`、`secondaryColor`、`accentColor`。GET 沿用 authenticated LAN allowlist；不新增設定／admin route。投影無完整 settings、CSS、script、URL 或 session credential。沒有投影、invalid payload、HTTP error、desktop lease offline 時保留最後有效視覺設定；backend 可達時仍能更新。

Web 使用既有 session polling；command busy 時同樣處理等待 acknowledgement 的 workflow GET。POST command 回應可以缺省投影。接收不呼叫 settings POST、不變更 profileKey、revision、draft、measurement、readiness 或工作區 key。

Native `HorizonTunerCompanionTheme` 僅提供 `themeBootstrap()` 與 `updateVisualTheme(json, generation)`。codec 上限 1024 bytes；只接受完整六欄位、version 1、七個 core、light/dark 與六位 HEX。解析失敗整份拒絕，主執行緒再次檢查 active lease/generation 及目前 WebView document，再更新 Compose／快取。原有 URL、Cookie、session 與 LAN origin 檢查繼續適用。

快取為 private preferences，key 是 canonical endpoint origin 的 SHA-256；不同 host／port／scheme 分離，沒有 credentials。Android 首次 Compose 繪製先讀已配對 endpoint 的快取；Web 首幀及 React 使用同一份同步 bootstrap。快取只由有效 backend 投影更新，不能回寫遠端。重連、離線與重開保留同一 endpoint 的最後有效值；新 endpoint 沒有有效快取時用安全的初始主題，不帶入其他 host 的主題。配對／Cookie 的過時回呼也受 connection attempt 檢查保護。

## CSS 映射

來源為 `frontend/src/context/themeSettings.ts`、Halfmoon 2.0.2 CSS 及 `frontend/src/styles/design-systems/{halfmoon,swiss,rhine}.css`。

| 契約 | Native owner |
| --- | --- |
| 七 core／三系統、mode、三色 | `VisualTheme.kt` |
| Mono／Rhine 完整預設三色隨 mode 轉換；custom 保留 | `VisualThemeCodec`，與 Web normalization 相同 |
| 背景、glass 表面、surface-1、文字、border、control border／focus | `companionTokens` |
| panel／control／badge shape、標頭反差 | `CompanionTokens` 與 `HalfmoonTheme` |
| family、heading／control／readout roles、數字特性 | `Typography.kt` 的 `companionTypography` |
| Halfmoon 實色 tabs、Swiss 底線、Rhine 刻度／底線 | 集中 navigation tokens；shell 只呈現 |
| 成功／警告／錯誤 | `StatusColors`，不受三色預設改寫 |

Halfmoon 保留透明表面與圓角，Swiss 使用實色、細框與各核心的形狀，Rhine 使用獨立紙面／石板色及控制項 border。Native 背景以 CSS 的 gradient 端點呈現，但沒有實作 CSS backdrop blur、radial anchor 或 Rhine 分頁動畫。

Typography 的 15 個 Material roles 均設定 family 與 `"tnum" 1, "lnum" 1`，與 `base.css` body 的數字特性繼承相符。heading／control／readout-label 各自保留 CSS 的 em tracking；Swiss Technical heading `.04em` 與 control `.025em` 分離。Shell 的標題、primary／outline buttons、selected tabs、badge、body、supporting、field 與 diagnostics 使用對應 roles。diagnostics 的 dt/dd 是 body，不套用 instrument label 的大寫／字距；目前 shell 沒有原生遙測儀表，readout roles 供儀表用途，不改調校或新增 UI。

Requested family 集中為 Halfmoon Outfit→Inter、Swiss Inter、Rhine MiSans；原生 body **仍使用明示的 Android sans-serif fallback**。Halfmoon instrument 依現有 CSS 使用 platform monospace，Swiss／Rhine instrument 沿用 body family。既有素材／授權盤點、七 core 的 mapping 與可測 fallback 差距見 [typography 切片報告](../../docs/frontend/companion-typography-fidelity/README.md)。沒有新增字體、轉換 MiSans 或接受新條款；這個角色切片不代表原生字形或像素一致性已驗收。

## 驗證

```sh
pnpm -C frontend run test
# Linux 預設 LAN profile 不含 Companion entry，sidecar 驗證須指定 Windows profile。
FH6_PLATFORM=windows pnpm -C frontend run build
cargo test --locked --manifest-path backend-rust/Cargo.toml
cargo test --locked --no-default-features --manifest-path backend-rust/Cargo.toml
cd companion
bash ./gradlew --no-daemon --stacktrace :protocol-core:test :theme:testDebugUnitTest :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
```

Android CI 已加入 `:theme`／`:app` unit tasks；測試保護 codec、七 core × 日夜、既有／Swiss Signal／Mono／Rhine／custom palette、損壞快取、offline/restart/reconnect、host switch、rapid updates、late callbacks。前端掛載案例保護 dirty draft、選取區段與量測、readiness 及 command busy。Rust LAN 契約確認投影不依賴 tuning revision／desktop lease，且 settings/admin、未配對、撤銷 session 及錯誤 origin 仍拒絕。

若 SDK 授權／安裝阻擋 Android gate，可先以已解析的 Kotlin／Compose compiler 及實際 library artifacts 執行同一份 codec、token、ThemeSession 的純 JVM 測試；這只能驗證該模組，不能宣稱 MainActivity 編譯、Android Gradle unit／lint／assemble 通過。

這些測試不能代替 Android native 與 WebView 同時可見的裝置驗收。驗收須記錄 commit／APK SHA-256、Android／WebView 版本，涵蓋連線／離線、七核心 × 日夜、配色、冷啟動、重連、窄螢幕、旋轉、長標籤、鍵盤及頁尾可達。不因 build 或瀏覽器截圖關閉 Issue #485。
