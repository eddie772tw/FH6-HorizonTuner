# Companion 原生字體資源／resolver 切片

本分支只補 #485 留言 [6093430885](https://github.com/eddie772tw/FH6-HorizonTuner/issues/485#issuecomment-6093430885) 指出的 requestedFamilies metadata 缺口。Stacked base 為 #503 `feature/issue-485-typography-fidelity` @ `b294d6342fbef7d5ddb31607f8f79bdecba38f8f`。Depends on #503 / #498；Related to #485。先完成父 PR 正常 gate，後續 retarget 必須再核實實際 base／head／必要 CI。本切片不 merge、close、release 或接受整個 Issue。

採用 skills：`pr-author-maintainer`、`halfmoon-design-system`。角色、七 core、badge weight／tracking、numeric features、Halfmoon readout monospace 均沿用 #503；沒有修改 bridge、安全、session、調校、Web CSS 或頁面設計。

## 原始 bytes、版本與授權

| 原生資源 | 固定原始來源 | bytes | Git blob SHA-1 | binary SHA-256 |
| --- | --- | ---: | --- | --- |
| `outfit_variable.ttf` | [Outfitio/Outfit-Fonts 902773808eb372f70fb34e8946dd1ffe604efc79 / fonts/variable/Outfit\[wght\].ttf](https://github.com/Outfitio/Outfit-Fonts/blob/902773808eb372f70fb34e8946dd1ffe604efc79/fonts/variable/Outfit%5Bwght%5D.ttf) | 110884 | `466d6245f9582df39bf73da91a8b3c938fd061cd` | `fc7287273e66929776e2ba54f144fe699080bec29f61bf649d70d871468aeade` |
| `inter_variable.ttf` | [google/fonts e1d6480102fed30739fead0faee463101f892c8f / ofl/inter/Inter\[opsz,wght\].ttf](https://github.com/google/fonts/blob/e1d6480102fed30739fead0faee463101f892c8f/ofl/inter/Inter%5Bopsz,wght%5D.ttf) | 876576 | `047c92f6e2212473dc436020afed689527076d44` | `29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031` |

下載後實際核對 SHA-256、`git hash-object`、SFNT `name`／`fvar`／`GSUB`／`hmtx`。**兩原始 binary 共 987460 bytes**；這不是 APK 增量。只重新命名 Android resource 檔名；沒有修改 glyph、subset、轉檔或取用鏡像。

- Outfit 內部 `Version 1.100;gftools[0.9.27]`；`wght` 100／100／900（min/default/max）；copyright 2021 Outfit Project Authors。
- Inter 內部 **`Version 4.001;git-66647c0bb`**；`wght` 100／400／900、`opsz` 14／14／32；font copyright 2016 Inter Project Authors。[同來源 metadata](https://github.com/google/fonts/blob/e1d6480102fed30739fead0faee463101f892c8f/ofl/inter/METADATA.pb) 保存 upstream `66647c0bbbe41a850d79d9c76fb13add3378940f`；archive 名稱 Inter-4.1-GoogleFonts.zip 不作為內部版本。
- [Outfit 同 commit OFL](https://github.com/Outfitio/Outfit-Fonts/blob/902773808eb372f70fb34e8946dd1ffe604efc79/OFL.txt) 4389 bytes，SHA-256 `c676351bf8576b9aba743cd5eaa8c0e7ee0d51f805d720447b4df4ddb6a2e416`。
- [Inter 同 commit OFL](https://github.com/google/fonts/blob/e1d6480102fed30739fead0faee463101f892c8f/ofl/inter/OFL.txt) 4377 bytes，SHA-256 `5b9321a4298cfeb6b34354164a1c3afc3db114569984c502b9b35d988fd58c57`。該 OFL 自己的 copyright 2020 保留；不替換 font／metadata 內的 2016。
- Inter 原始 metadata 1342 bytes，SHA-256 `79e4721ef4f72251c6080a40dfd9efb6728b4df1fc690f0c70eb4b1b5303a5b0`。所有來源與 hashes 另隨 `assets/font_notices/provenance.json` 出貨。

兩來源均為 OFL 1.1，已核對原始條款；原始 font／copyright／完整 license 一起打包，不新增付費或 click-through 協議。APK 的 Connection 頁提供「字型授權」，離線、配對前後均可捲動及選取全文。OFL 原始 trailing spaces 與 bytes 透過 `.gitattributes` 保留，不為通過空白檢查改寫授權。

## Android 與 Compose resolution

[Android CustomFallbackBuilder](https://developer.android.com/reference/android/graphics/Typeface.CustomFallbackBuilder) API 29 提供 ordered custom families 加 system fallback；minSdk 33 可直接使用。[Font.Builder](https://developer.android.com/reference/android/graphics/fonts/Font.Builder) 同時設定 axes、weight 與 upright slant。核對 Compose 1.9.4 官方 Google Maven sources：單純 `FontFamily` 的 font list 會匹配 weight/style，不能當作 CSS 缺 glyph fallback；而 Android Typeface wrapper 會回傳包住的 typeface，不依每次 style 請求重新選 weight。因此每個 100–900 Compose `AndroidFont` descriptor 載入其**完整** Android chain，並使用對應 `wght`／native style。這不是把兩個 Compose Fonts 並列冒充 glyph fallback。

`HalfmoonTheme` 在既有 provider 內注入 resolver。所有 Material／shell roles 在最後 `fontSize` 已確定後選 family；Inter `opsz` 取 Compose Density 的有效字級（sp→dp，包含 Android 字級縮放），clamp 到 font 自身的 14–32。Outfit 只有 `wght`，不加不存在的 `opsz`。切換 core／density 只重新提供 typography；native typeface cache 不保存 Context／Activity／session／WebView。Halfmoon readout-value 不使用 bundled chain，保留 system monospace。

兩字型 `GSUB` 有 `tnum`；JVM test 實際以其 single substitutions 映射 0–9，驗證 `hmtx` advances 相等。字型沒有 `lnum` tag，預設數字為 lining；所有角色仍設定 `"tnum" 1, "lnum" 1`。SFNT/default-instance 證據不能證明 Android shaping、所有 variable instances、baseline 或 system CJK 數字寬度。

Rhine MiSans 未下載／轉換／拼接 WOFF2 shards。官方 MiSans.zip 內容及版本 4.003 仍未核實；FAQ 的 embedding 許可與協議的 adapt/redevelop 禁止必須一起核對，Apache 工具 license 不能替代 font license。不替換版本或 family，不將永久 SansSerif 當作已接受。未在本切片發現並引入新的安全原生來源。

## 驗證與裝置界線

```sh
pnpm -C frontend run test
cd companion
bash ./gradlew --no-daemon :protocol-core:test :theme:testDebugUnitTest :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
java scripts/VerifyFontApk.java app/build/outputs/apk/debug/app-debug.apk [BASELINE_APK]
```

新增 JVM tests 核對 exact resources／Git blob 與 binary hashes／notices hashes／SFNT 版本及 axes／tnum advances／resolver chain、weights、opsz 與所有最終角色字級。既有七 core badge mapping、codec、ThemeSession tests 保留。`VerifyFontApk.java` 比對 APK entries 的完整 bytes 與 resources／notices，輸出 raw／compressed entries、APK bytes／SHA-256 與可选 baseline delta；CI 同時留存所有來源 hashes。

本機無 SDK，未安裝或接受 SDK 協議；Android Gradle gate 使用既有 CI。Stacked PR 的 CI 以實際 parent base SHA 在**同一 runner／SDK／JDK／debug keystore**另 assemble baseline，量測 APK 的完整 bytes 差，保存 baseline APK／SHA。Push run 只驗證自己的 APK，不能冒稱已比較 baseline。最終 exact-head CI、JUnit／lint、artifact／APK SHA-256 與 delta 記在 PR 活內文，舊 #503 success 不作為本 head 驗證。

本機 frontend：198 passed files／1 skipped，1747 passed tests／1 skipped；frontend production tree 未改，不重複 build。Kotlin 2.2.21＋實際 Compose 1.9.4／Material3 1.3.2 AAR 的本地純 JVM tests：10 passed／0 failures；驗證 new resources／plan／既有 role mapping，不替代 Android compile、unit、lint 或 assemble。

**裝置／native＋WebView 視覺：NOT_RUN。** 無 device；mixed CJK／Latin glyph fallback、baseline、實際字寬、truncation、長標籤、窄屏／旋轉／200%字級、七 core×日夜／配色，以及 inherited 連線／冷啟動／重連／host switch／LAN／USB／QR／revocation／late callback／reload／back-forward／鍵盤／頁尾矩陣仍待 exact APK + Android／WebView 版本實測。notices dialog 的 TalkBack／font scale 實機驗收也未執行。

工具限制：GitHub CLI 的 PR read 回傳 Forbidden；connector 已成功核對 #503 metadata／review threads。歷史 #503 artifact 由 connector 提供的下載 URL 在本機 GET 為 HTTP 403，未換另一條路下載它；APK delta 改由上述已授權的 CI 實際建置 base 比較。沒有將此限制作為成功下載或本機 APK 驗證。
