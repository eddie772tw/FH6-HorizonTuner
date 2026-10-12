# Companion 原生背景與 Rhine 導覽差異

盤點基準：main `c1e86317b43aa328a075760e3f6d683dc179583b`。本切片為 [Issue #485](https://github.com/eddie772tw/FH6-HorizonTuner/issues/485) 的狹義背景／導覽實作，不代表完整原生與 WebView 視覺驗收。採用技能：`halfmoon-design-system`、`pr-author-maintainer`、`cross-agent-collaboration`。

## 差異矩陣

Web 來源為 `frontend/src/styles/design-systems/{halfmoon,rhine,swiss}.css`、`styles/navigation.css`、`styles/base.css` 與 `context/themeCatalog.ts`；原生基準為 `companion/theme/src/main/kotlin/org/horizontuner/companion/theme/{Theme,Typography,NativeFontResolver}.kt` 和 `companion/app/src/main/kotlin/org/horizontuner/companion/app/CompanionShell.kt`。

| 契約 | Web 現況 | 基準 main 原生現況 | 本切片結果／殘留 |
| --- | --- | --- | --- |
| Halfmoon Default 夜間背景 | `ellipse at top right`，`#111a2e → #080b12` | 相同端點，永遠 linear | 右上角、依繪製寬高計算 farthest-corner 橢圓 |
| Halfmoon Modern 夜間背景 | `ellipse at top left`，`#0e172a → #050a16` | 相同端點，永遠 linear | 左上角、依繪製寬高計算 farthest-corner 橢圓 |
| Halfmoon Elegant 夜間背景 | `ellipse at bottom right`，`#1c1813 → #0d0a07` | 相同端點，永遠 linear | 右下角、依繪製寬高計算 farthest-corner 橢圓 |
| Halfmoon 三核心日間背景 | 135deg linear；Default `#f0f4fa → #dbe4f0`、Modern `#f0f3ff → #dbe1f7`、Elegant `#f7f4ee → #e8decb` | 相同端點，Compose 預設左上至右下 linear（矩形上角度隨比例改變） | 保持 linear；依尺寸投影 135deg 起訖點 |
| Swiss／Rhine 背景 | 各 mode 的實色 token | 同色的 linear | 明示 `SolidColor`，沿用原色 |
| 背景定位範圍 | body 的 gradient box | shell、Connection、Offline 三個不同大小的背景各自重畫 | 原生只在完整 shell 畫一次，子頁透明；顯示原生頁時已掛載的 WebView layer alpha=0，讓表面看到 shell 背景，切回恢復 alpha=1。Web body 與 native shell 仍各有自己的 gradient box，沒有跨 WebView 共用座標或像素等價宣稱 |
| Halfmoon 材質 | 一般靜態表面使用 alpha、`backdrop-filter: blur(14px)`；高頻圖表有排除規則 | alpha 表面；無 backdrop blur | **殘留**：需獨立背景圖層取樣／合成及 GPU、裝置／WebView 驗證；不可用 `Modifier.blur` 模糊控制項／文字冒充 backdrop blur |
| Rhine marker 幾何 | 左 8px、寬 2px、top 25%、height 50%；底部為 scale origin | label 上方左 12dp 的 1×4dp 靜態 tick、border 色 | 左 8dp、寬 2dp、top 25%、height 50%；底部錨定；跟隨 text／textSecondary；label 左內距 20dp |
| Rhine marker 狀態 | active、enabled hover、focus-visible 時 scaleY=1；其餘 .35 | 靜態，無互動狀態 | selectable 的共用 interaction source 接 selection、pointer hover、keyboard／D-pad focus；scale .35 ↔ 1；所有現有 shell tabs 保持可用 |
| Rhine marker 動效 | 150ms CSS `ease`（.25,.1,.25,1） | 無 | 對應 Compose tween／Bezier，僅 draw 讀取動畫值 |
| Rhine underline | 左／右 inset 8px、高 2px、bottom -1px，origin left；僅 active scaleX=1 | 整個 tab 寬的靜態 2dp 選取底線 | inset 8dp、高 2dp、下緣跨 1dp 導覽分界；只有 selected 展開；180ms Bezier(.22,1,.36,1) |
| Rhine 焦點與觸控 | focus-visible 2px 內縮 outline；Web disabled 不接 hover | `selectable` Tab semantics、48dp 最小觸控 | 保留 selectable group／Tab semantics、橫向捲動／224dp 上限；Rhine 加可見 2dp focus outline；裝置焦點、TalkBack **NOT_RUN** |
| Rhine reduced motion | `prefers-reduced-motion: reduce` 停止 transition／animation | 尚無上述動效 | Compose 使用 Android WindowRecomposer 的 live `MotionDurationScale`：系統倍率由框架處理一次；0／Remove animations 到終態；不新增私有偏好或 Settings 權限。Android 設定與 WebView media query 的實際對映 **NOT_RUN** |
| 字體 | Halfmoon Outfit→Inter；Swiss Inter；Rhine MiSans 400／600 shards 與 Web notices | Halfmoon／Swiss 已有原始 variable fonts 與系統 glyph fallback；Rhine 為 system SansSerif | **殘留**：MiSans 完整官方原始資產、revision／版本／hash／font license 尚未完整驗證；本分支不下載／拼接／转换字型，不把 SansSerif 的字形或 metrics 當 MiSans 等價，也未接受永久降級 |
| 字距／數字特性與色彩 | 各系統 roles、`tnum`／lining、mode／preset tokens；功能性色独立 | 已有集中 roles、native resolver、receive-only codec／endpoint cache | 沿用原契約；動效不更新文字尺寸／字重、layout transforms、telemetry／WebView／主題橋接。CJK／emoji／baseline／truncation 仍需裝置驗證 |

上表 dp 是 Web CSS px 的原生邏輯尺寸映射，不是不同 density／字級／字體下的物理像素承諾。Swiss／Halfmoon 分頁既有選取字重及原生尺寸不在本切片重新設計；Rhine selected 與 idle 的 control role 均為 600，裝飾不插入額外 layout child。

## 幾何與平台可行性

[CSS Images 規範](https://www.w3.org/TR/css-images-3/#radial-gradients) 對省略 size 的 ellipse 使用 farthest-corner，保留 farthest-side 的長寬比。對本專案三個角落中心，半徑為 `rx = width × √2`、`ry = height × √2`；相對角落位於 100% ellipse。以單一圓半徑或單純 `rx=width, ry=height` 都不能達成這個契約。

`Background.kt` 使用現有 Compose `ShaderBrush`／Android `RadialGradient`，以 [Shader local matrix](https://developer.android.com/reference/android/graphics/Shader#setLocalMatrix(android.graphics.Matrix)) 做獨立 X/Y scale 及 anchor translation；shader 按繪製尺寸快取，旋轉／resize 時重建。現有 minSdk 33 已支援此 API，無需新增 library／Gradle／SDK 功能契約。日間保留線性 shader，135deg 對角方向固定，color stops 由矩形角落投影得到。

`Navigation.kt` 集中 Rhine geometry、目標狀態與兩組 tween。`ShellTab.kt` 的動畫 `State` 在 draw 階段讀取，不逐幀寫回 Composable 的測量、文字 style、page、connection 或 telemetry；只在 selection／hover／focus 改變時更換 target。selected 初幀直接使用終態，不製造額外入場。移出 Rhine 時該分支的動畫 scope 移除，其他系統沿用既有裝飾。Android WindowRecomposer（已核對 [Compose 1.9.4 官方 sources](https://dl.google.com/dl/android/maven2/androidx/compose/ui/ui-android/1.9.4/ui-android-1.9.4-sources.jar)）的 duration scale 與 Compose animation coroutine 共用，不自行輪詢 Settings 或重複乘倍率。

## 客觀驗證與範圍

- `BackgroundTest`：七 core × 日夜映射；portrait／landscape／square 的 ellipse aspect ratio、anchor、center／farthest-corner progress；日間 135deg 固定方向與角落色標投影。這是比例與 token 契約，沒有 Canvas API 次數或固定像素斷言。
- `RhineNavigationTest`：selection／hover／focus 的目標狀態與 disabled hover 抑制；以真實 Compose `Animatable`、可控 frame clock 和 `MotionDurationScale` 驗證 0／0.5／1／2 倍率，以及動畫途中改為 0 的終態。這是 JVM 動畫運算，不是實機 Android 設定／UI 測試。
- 完整前端 Vitest、TypeScript／Windows profile production build；原生 gate 為 `bash ./gradlew --no-daemon :protocol-core:test :theme:testDebugUnitTest :app:testDebugUnitTest :app:lintDebug :app:assembleDebug`（在 companion 工作目錄執行）。最終執行結果、工具版本、精確 PR head 與 actual checkout／source tree 另列於 PR；不沿用 main 或舊 PR 的 CI 當本分支證據。
- Android／WebView／TalkBack／實機、native＋Web 同框截圖、density／200% 字級／窄屏／旋轉／鍵盤、觸控／滑鼠／D-pad、連線／重連／換 host／主題切換及 GPU raster／frame timing：**NOT_RUN**。APK build、純 JVM 或前端測試不代替這些驗收。

正式 APK signing／version／交付契約及 Kotlin processed-source coverage 由其他 owner 處理。本分支不修改 Gradle、release 或 CI 安全設定，不 merge／release／關閉 Issue，也不改他人分支。Halfmoon blur 與 Rhine font 為有明確平台／資源前提的殘留，需另外交付可審查實作；未作永久平台降級決定。
