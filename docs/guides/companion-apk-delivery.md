# Companion APK 正式交付契約

本契約處理 [#485 的正式 APK 切片](https://github.com/eddie772tw/FH6-HorizonTuner/issues/485#issuecomment-6098731484)。它提供簽署、檢查及本地產物入口；不建立 production credentials、不設定 secrets、不發布 APK／Release／OTA、不改安全設定。正式憑證、發行範圍與裝置驗收仍由維護者負責。採用技能：`pr-author-maintainer`、`cross-agent-collaboration`。

## 建置入口

從乾淨、已提交的 repository root，在已具備 JDK 17、既有 Android SDK 36／build-tools 35.0.0 的 Linux／POSIX 建置環境執行：

```bash
uv run --no-project --python .venv/bin/python python scripts/build_companion_apk.py --mode production
```

Python 3.13／uv 環境依專案 [Python 工具規範](../../.agents/rules/python-uv.md) 準備。SDK 必須已配置且已有合法使用授權；入口不執行 sdkmanager、不接受新條款。CI 沿用 hosted Android 環境。Windows 維護者可在既有 POSIX 建置環境執行此入口；本切片未驗證 Windows APK delivery。

入口先驗證完整設定、版本與乾淨的 source tree，然後執行 Companion Gradle Wrapper 的 `:app:assembleOfficialRelease`，並用官方 `apksigner`、`aapt`、`zipalign` 檢查實際 APK。任一步失敗 exit 1，且移除該模式先前的成功 receipt。**只有入口 exit 0 且新 `delivery.json` 與 APK hash 相符才代表本地交付檢查通過。** 單獨 `assembleRelease`／`assembleOfficialRelease` 不構成已檢查交付。

Release Gradle gate 也要求明確 delivery mode、既有 keystore、完整密碼／alias、有效版本及由入口生成的 provenance asset；缺設定會失敗，已移除 debug signing fallback。舊 `-P` signing properties 不再讀取，維護者應使用下列環境設定。Debug 入口維持：

```bash
cd companion
bash ./gradlew --no-daemon :protocol-core:test :theme:testDebugUnitTest :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
```

## 維護者提供的設定

設定以環境變數傳入，密碼不放命令列、tracked gradle.properties 或 PR。入口只讀取既有 key，沒有 production key 生成／替換流程。

| 名稱 | 契約 |
| --- | --- |
| `HORIZONTUNER_KEYSTORE_PATH` | 維護者既有正式 app-signing keystore 的絕對路徑；必須存在 |
| `HORIZONTUNER_KEYSTORE_PASSWORD` | 非空 keystore 密碼 |
| `HORIZONTUNER_KEY_ALIAS` | 非空正式 key alias；拒絕 `androiddebugkey` |
| `HORIZONTUNER_KEY_PASSWORD` | 非空 private-key 密碼 |
| `HORIZONTUNER_EXPECTED_CERT_SHA256` | 維護者獨立核對的 app-signing certificate SHA-256，64 hex、不含冒號；不得僅從新建 APK 自我推定 |
| `HORIZONTUNER_ANDROID_VERSION_CODE` | 明確 Android code；大於 previous，且不超過 2100000000 |
| `HORIZONTUNER_PREVIOUS_VERSION_CODE` | 維護者發行紀錄中最高已配置／使用的 code；初始開發 code 1 亦保留，首次正式 code 至少 2 |
| `HORIZONTUNER_ANDROID_VERSION_NAME` | 獨立 Android `x.y.z` 或 `x.y.z-rc.n`；不自動沿用桌面 tag |
| `HORIZONTUNER_RELEASE_LABEL` | 人工確認的桌面發行／候選識別，例如 `v1.8.0-candidate`；不是發布指令或 tag 存在／相容性證明 |
| `ANDROID_HOME` | 已有 SDK 路徑，包含 `build-tools/35.0.0` |
| `JAVA_HOME` | 既有 JDK 17；依現有 Companion 工具鏈配置 |

`HORIZONTUNER_APK_DELIVERY_MODE` 由入口提供給 Gradle，不需要維護者設定。正式更新必須沿用同一 app-signing identity；Play upload certificate 與最終 APK app-signing certificate 有不同職責，本入口檢查直接交付 APK 的 signer。更換 key／signing lineage 需另行設計與授權，本契約只接受單一 pinned signer。

## 版本／來源映射

Android versionCode 是獨立、嚴格遞增的整數。入口檢查 `1 <= previous < new <= 2100000000`；維護者須從實際發行／配置紀錄提供 previous，保留每次分配並避免平行分支重複使用。程式無法證明外部紀錄完整，也不查詢裝置已安裝版本。升級是否保留資料仍需最終正式 APK 實測。

Android versionName 不等於桌面公開 `v1.x`，也不等於桌面 OTA runtime。Provenance 同時記錄人工提供的桌面 label、從**本次 source** `backend-rust/Cargo.toml` 讀取的 `desktopOtaRuntime`，及 Android package/code/name。此 main 的 runtime 為 `11.45.22`；它不會自動推導 Android `0.1.0` 或下一次正式 Android 版本。維護者須在 PR／發行紀錄列出且審查這組映射及 PC compatibility，不因此工具通過宣稱完整 Companion 已驗收。

## 實際 APK 與 provenance

APK 的 `assets/delivery-source.json` 包含 actual checkout commit、Git tree、dirty flag、所有 tracked Companion 檔案及入口／桌面 runtime 定義的 SHA-256、版本／模式／expected signer、桌面映射與可用的 CI run URL／requested head。正式模式拒絕 tracked 或 untracked 修改；test-only 可記錄 dirty source，不能把 Git tree 單獨當其實際內容證明。

出口 `companion/build/official-apk/<mode>/` 包含帶模式、code、完整 APK SHA-256 的檔案及 `delivery.json`。Receipt 包含實際 APK hash／bytes、package/version、完整公開 certificate report、非 debuggable 檢查、signature／alignment 結果及 toolchain 識別。入口比較實際 APK 中的 embedded mapping 與當前 checkout 契約，並在建置／檢查後重新取得 source contract；期間 source 有變更即失敗，不寫成功 receipt。沒有 password、keystore bytes 或 private key。

Source mapping 是可核對的 build evidence，**不是** GitHub/OIDC 簽署 attestation，也不表示 bit-for-bit reproducible build。審查者應同時核對 remote head、actual checkout／tree／parents、source hashes、CI logs 與下載的 APK。PR merge checkout 可不同於 PR head；兩者分開記錄。正式 build 的 source 必須是維護者最後選定、已審查的 commit，不能把 test-only run 的 merge SHA 移作正式發布來源。

## CI 正反驗證與 artifact proposal

既有 Android protocol／theme／app JUnit、lint、debug APK、missing-font negative fixture 與 exact font/notice entries gates 均保留。新增工具行為測試及 `companion/scripts/TestReleaseApkContract.sh`：

1. 正式入口缺完整 signing configuration exit 1；直接 Gradle release gate 亦失敗。
2. 在 runner temporary directory 生成兩天有效的 **NON-PRODUCTION** RSA key，獨立從公開 certificate 計算 expected SHA-256。不使用 repository production secrets。
3. `--mode test-only` 正向建置：package 固定為 `org.horizontuner.companion.contracttest`，versionName 加 `-test-only`，receipt／artifact 標示 TEST-ONLY。使用實際 APK 檢查 certificate、package、version、hash、non-debuggable、alignment、embedded source，並再次驗證 release APK font/notice entries。
4. 對同一實際 APK 使用錯誤 signer pin，要求 exit 1 且舊 receipt 消失；重新正向驗證恢復 final receipt。

CI 留存 14 天的 `companion-release-contract-TEST-ONLY-<head>` artifact，包含 test-only APK／receipt／positive-negative logs。臨時 key 在 exit trap 移除，不上傳。既有 debug evidence artifact 獨立保留。**TEST-ONLY 產物只驗證工具契約，不能代表維護者正式簽章、正式升級或可供一般使用者安裝的發行版。**

本切片不新增 production secret 消費、發布 workflow 或發布權限。最小後續 proposal：維護者在已授權的正式建置環境提供既有 signing 設定，對 final source 執行相同入口，核對 receipt/hash/public certificate，先作最終 Android 驗收；正式 artifact 上傳與 Release 操作須依其後另行授權的發行範圍執行。

## 剩餘維護者步驟與裝置限制

- 確認正式 app-signing identity、公用憑證指紋、code 配置紀錄、Android name 及桌面 label/runtime 相容映射；提供已有設定，沒有 key 時回報 blocker，不能以此切片生成 production key。
- 審查／選定 final source，在合法 provisioned 環境建置真正 production APK，下載／核對 provenance、公開憑證、package/version/hash。
- Android 安裝／升級與資料保留：**NOT_RUN**。
- Android／WebView／TalkBack 全矩陣、配對／LAN／USB／QR、重連與 native＋WebView 設計驗收：**NOT_RUN**；需記錄最終 APK SHA、source commit、device model、Android／WebView 版本。
- Kotlin processed-source coverage、原生設計／資源／平台差異及 FH6 遊戲驗收屬其他切片；本 PR 不宣稱完成。FH6 遊戲階段保持關閉。

官方依據：[Android app signing](https://developer.android.com/studio/publish/app-signing)、[Android versioning](https://developer.android.com/studio/publish/versioning)、[apksigner](https://developer.android.com/tools/apksigner)。
