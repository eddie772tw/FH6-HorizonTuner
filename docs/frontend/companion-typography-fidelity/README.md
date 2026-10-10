# Issue #485 最小 typography fidelity 切片

本切片依 [Issue 留言 6093430885](https://github.com/eddie772tw/FH6-HorizonTuner/issues/485#issuecomment-6093430885) 與 [PR #498 review](https://github.com/eddie772tw/FH6-HorizonTuner/pull/498#pullrequestreview-5477402920) 處理原生字體／數值角色差距。stacked Draft PR 依賴 #498，Related to #485；沒有合併、關閉 Issue、發布或將 #498 標 Ready。

- Base：`feature/issue-485-theme-sync`，核實 head `901c545df5ebb608acd8a43e24b1ea36a9c95ab7`。
- 專用分支：`feature/issue-485-typography-fidelity`。
- 使用技能：`halfmoon-design-system`、`pr-author-maintainer`。
- 審查盤點：#498 一則頂層 review、無 inline review threads；Issue 的額外交付要求已讀取。

## 實作與來源

Typography 從色彩／shape tokens 分離至 [`Typography.kt`](../../../companion/theme/src/main/kotlin/org/horizontuner/companion/theme/Typography.kt)。`HalfmoonTheme` 依 core 集中提供 Material 15 roles 與 supporting、badge、selected-tab、instrument readout roles；mode／配色不改字體契約。沒有改 receive-only bridge、cache、generation、配對、安全投影、status colors、48dp targets 或調校工作流。

| Core | Requested body family | Heading weight／tracking | Control weight／tracking | Readout-label tracking |
| --- | --- | --- | --- | --- |
| Default／Modern／Elegant | Outfit→Inter | 600／.025em | 400／normal | .025em |
| Swiss Technical | Inter | 700／.04em | 600／.025em | .08em |
| Swiss Editorial | Inter | 600／normal | 600／normal | .025em |
| Swiss Contrast | Inter | 700／.02em | 600／.02em | .08em |
| Rhine Lab | Rhine MiSans | 600／.015em | 600／.015em | .025em |

來源：[`halfmoon.css`](../../../frontend/src/styles/design-systems/halfmoon.css)、[`swiss.css`](../../../frontend/src/styles/design-systems/swiss.css)、[`rhine.css`](../../../frontend/src/styles/design-systems/rhine.css)。Contrast 沒有覆寫 readout tracking，仍繼承 Swiss `.08em`，不能把 control 的 `.02em` 當作 readout tracking。

Section heading 沿用 native 的 16sp，Editorial 以既有 CSS 1.05rem 對應 16.8sp。readout label 依 [`base.css`](../../../frontend/src/styles/base.css) `.6875rem` 對應 11sp／600；Swiss 三 core 使用 uppercase，其餘保留文字。數值 tracking 為 normal；Halfmoon instrument family 依 CSS 為 platform monospace，Swiss／Rhine 為 body。值的預設大小為 native body 14sp，實際儀表可按用途指定大小；此 shell 尚無原生儀表，沒有新增測試畫面或遙測流程。

Native body 14sp、small 12sp、supporting 13sp 沿用本來的 shell 階層。所有 roles 明示 `"tnum" 1, "lnum" 1`，對應 Web body 的全域 numeric inheritance，不把 readout-label 的字距施加於數字。unused Material display/headline/title-large/small 沿用 Material 預設大小與行高，明示本系統 family／weight／tracking，避免以後落回未映射的 Material 預設 family。

[`CompanionShell.kt`](../../../companion/app/src/main/kotlin/org/horizontuner/companion/app/CompanionShell.kt) 的 primary 與 outline button 均用 control role；selected-tab 依 CSS 為 Halfmoon／Rhine 600、Swiss 700。status badge 為 12sp／600，與功能色分離；輸入值與 label 使用 body roles，diagnostics 依 [`companion.css`](../../../frontend/src/features/companion/companion.css) dt/dd 保持 body 字重／normal tracking，不誤套 instrument label 的 uppercase／600／字距。

## 字體素材與授權盤點（2026-10-10）

| Family | repo 既有來源 | Android 狀態與剩餘差距 |
| --- | --- | --- |
| Outfit／Inter | [`App.css`](../../../frontend/src/App.css) Google Fonts remote CSS，僅請求 400／500／600／700；repo 無對應 TTF／OTF | 未新增 native fonts；SansSerif 不保證字形、字寬、基線與 CJK 回退一致 |
| Rhine MiSans | [`source.json`](../../../frontend/public/assets/rhine/fonts/misans-webfont-4.3.1/source.json)，misans-webfont 4.3.1／font 4.003，regular 400／demibold 600 原始 WOFF2 | 376 分片共 12,197,248 bytes，逐檔 bytes／SHA-256 與 manifest 一致；沒有適用 Android 的既有 TTF／OTF，沒有轉檔／合併／裁字 |
| HUD fonts | 獨立 HUD 各自的 DSEG／Roboto／Barlow 等資源 | 不對應本切片的設計 family，不拿來取代設計字體 |

MiSans [`NOTICE`](../../../frontend/public/assets/rhine/fonts/NOTICE.txt) 與 [`協議 PDF`](../../../frontend/public/assets/rhine/fonts/MiSans-license.pdf) 分別保留。PDF SHA-256：`4a93a27cd2bd81b3b5ecfd0a853144a876fa26938a93a68443c67d74172fcb86`。協議要求軟體署名、保留版權與協議，禁止改編／二次開發及單獨分發字體，同時對使用字體創作的 App 等作品另有分發許可。協議亦將下載／安裝／使用與條款接受連結；本切片不新增該接受行為。**不能由分包工具 Apache 2.0 推導 MiSans 轉換或 native redistribution 的許可。**

既有 [Rhine 文件](../rhine-lab.md) 明示 WOFF2 byte-for-byte、未改字形／格式。官方 Android [font resources 文件](https://developer.android.com/develop/ui/views/text-and-emoji/fonts-in-xml) 描述 `res/font` 的 bundled fonts 配置；既有 CSS Unicode-range WOFF2 分片沒有對應的 Android resource／family 配置，不能僅改副檔名就直接使用。MiSans 官方入口 `https://hyperos.mi.com/font/download` 本環境回傳 HTTP 403，無法核實目前官方 Android 格式的確切版本／雜湊與隨附條款；因此 **MiSans 原生字形一致性保持阻塞**。沒有下載新字體包、推定轉換權或套用不同協議。

Outfit／Inter 的官方 Google Fonts [Outfit OFL](https://raw.githubusercontent.com/google/fonts/main/ofl/outfit/OFL.txt)／[Inter OFL](https://raw.githubusercontent.com/google/fonts/main/ofl/inter/OFL.txt) 已查閱，均為 SIL OFL 1.1，允許遵守版權／license 保留等條件的 embedding／bundling；這不是 repo 既有 native assets 的證據。本切片先交 role/fallback 契約，沒有匯入新素材或新增條款接受。後續若匯入須另核對原始 font bytes、版本、字重、Unicode coverage、數字 feature tables 及 APK 中的授權留存，不能只看 family 同名就宣稱一致。

## 可測的 fallback 差距與驗收界線

此切片的 native body resolver 明示 SansSerif，requested family metadata 維持原設計；不是把 Android 系統字體重新命名為 Outfit／Inter／MiSans，也不是已接受的完整平台等價決定。

- Unit gate：七 core 的 heading/control/readout mapping、family fallback、Material 全 roles、selected tabs／badge／numeric features／readout casing；tracking 使用 em，避免硬乘固定 14sp 後不同字級失真。
- 裝置 gate：記錄 exact commit／APK SHA、Android／WebView 版本及實際字體；同框核對 heading 與 controls、primary／outline、數字列更新時寬度穩定、`0123456789`／小數／正負／CJK 混排的基線與截斷。`tnum`／`lnum` 是 feature request，測試設定值不證明每台裝置的 fallback font 都有這些 tables。
- 字級／空間 gate：窄螢幕、旋轉、200% 字級、長標籤、鍵盤、頁尾與冷啟動／重連／換 host，覆蓋七 core × 日夜。保留 bridge 與 #498 既有裝置 gate。
- Native 與 Web 字形、字寬、行高、CJK fallback、font synthesis／feature 支援差距仍待實測及維護者決定；無像素一致性的宣稱。
- 裝置／emulator native＋WebView visual QA：**NOT_RUN**。WebView font loading／真實遊戲／LAN／USB／QR／revocation device integration：**NOT_RUN**。沒有以 build 或 desktop browser 替代。
- blur／radial anchor／Rhine animation 保持 Issue 的其他 scope，本切片未加入效果。

## 提交前驗證報告

原始 logs、來源 hash、font audit、獨立純 JVM runner 留於 `/workspace/evidence/issue-485-typography` 與 `/workspace/toolchains/typography`，不提交工具快取或大型原始檔。

| Gate | 結果 |
| --- | --- |
| `pnpm -C frontend run test` | 198 passed files／1747 passed、1 skipped tests |
| `FH6_PLATFORM=windows pnpm -C frontend run build` | PASS；Companion index/assets 存在 |
| Kotlin 2.2.21／Compose 純 JVM mapping／contracts | 15 passed，0 failure／error／skipped；實際 Android AAR classes，包含新 typography 4 cases、既有 theme／session／protocol tests；不含 MainActivity／Shell Android 編譯 |
| Local Android Gradle unit／lint／assemble | NOT_RUN；無 SDK，優先使用既有 CI，沒有新安裝／接受條款 |
| Exact-head Android CI | 提交前尚未 push；後續精確 head／run 結果記入 PR body，原有 workflow 留存 APK、JUnit、lint、head／checkout／source hashes |
| Rust | NOT_RUN／範圍未修改；沒有修改 backend／API／資產投影，依範圍不另安裝 Rust |
| `git diff --check` | PASS（提交前再次核對） |

不能將 #498 的 CI 當作本切片的 head 結果。push 後核對 head 的 CI，再把實際 run／job／artifact／APK hash 與剩餘 gate 記入 PR body；PR 保持 Draft。

stacked base 不在一般 `CI Pipeline` 的 pull_request branches filter，本次也沒有 release-packaging paths；因此這兩條 workflow 不會對此 stacked PR 執行。Android workflow 同時監聽 feature push／pull_request，可對本切片精確 head 執行必要 native gate；不為取得其他 scope 的 checks 而改 workflow 或 retarget main。

純 JVM runner 位於 repo 外，以 Gradle 8.13（官方 ZIP SHA 與 wrapper 相同）、Kotlin／Compose compiler 2.2.21、Compose UI／foundation 1.9.4、Material3 1.3.2 的實際 Google Maven AAR classes 及本 repo 測試執行。JDK 17.0.19+10-1~deb12u2 由 Debian 官方 package 解壓至工具目錄，與官方 Packages SHA-256 相符；保留 shipped security config，只將解壓的絕對 `/etc` symlinks 定位至同一工具目錄的原始設定。沒有修改系統安全設定、安裝 SDK 或接受 SDK／字體新協議。這個 runner 驗證 Kotlin／role 契約，不能代替 Android Gradle unit／lint／assemble 或裝置視覺驗收。
