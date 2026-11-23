# #648 主線整合與有限驗證（2026-11-18）

整合 PR 原 HEAD `ac97fa0a1877347dc4b8ad30dc7005d1369034ae` 與主線 `54a50e74111f383352aa87ce30725574ef5d3d01`，不改寫既有 PR 歷史。本報告紀錄程式與建置驗證，不代表 Android 實機驗收。

## 衝突處置

- `backend-rust/tests/companion_lan.rs`：保留 PR 的 catalog／manifest／資產配對檢查，以及主線的子系統開關、既有 WebSocket 中斷與新連線拒絕案例。停用 Companion 的路徑矩陣另加入新 catalog、manifest 與 asset 路徑。
- `.agents/Journal.md`：採用主線既有檔案，PR 專屬的原始章節集中保存於本報告下方；兩方的 Git 歷史皆保留。
- 自動合併保留主線目前的調校版本／保存契約、縮圖安全修正與前端存檔併發保護。順手移除主線擷取腳本的一行純空白，通過 diff whitespace 檢查。

## 本次驗證

| 檢查 | 結果 |
| --- | --- |
| 前端完整 Vitest | 233 files／1698 tests 通過 |
| TypeScript／Vite build | 通過；先固定 dist 再跑 Cargo |
| Rust 完整預設組態，含 doc-tests | 46 suites／324 passed／4 ignored |
| Rust 完整 no-default-features，含 doc-tests | 46 suites／313 passed／4 ignored |
| 資產／配對／停用路徑聚焦回歸 | default 與 no-default-features 各 9 tests 通過 |
| Android protocol-core／theme／app 單元測試 | 11＋20＋4＝35 tests，0 failures／errors／skipped |
| Android lintDebug | 0 errors／13 warnings／1 hint |
| Android assembleDebug | 通過；55,436,615 bytes |
| APK ZIP／簽章檢查 | assets/hud/ 為 0；apksigner v2 驗證通過 |
| Rust fmt／git diff --check | 通過 |

Debug APK SHA-256：`59df4ca0faa20354f65bb01b25ba295658b2a0e93210bfd62363be6a04156e61`。

Android Lint 的 warnings／hint 已記錄；沒有把「0 errors」描述為零警告。沒有依賴升級或產品 Gradle 設定修改。

環境為 Linux，JDK 17.0.19、Gradle 8.13、SDK 36、Build Tools 35.0.0；工具安裝於儲存庫外，專案 Gradle 與依賴設定未變。Gradle 發行檔與 wrapper 固定的 SHA-256 一致；JDK 使用 Debian 官方套件及 SHA-256 校驗。Java 下載器須使用環境的 HTTP(S) 代理及系統 trust store。

重現入口：

```sh
pnpm -C frontend test
pnpm -C frontend build
cargo test --locked --manifest-path backend-rust/Cargo.toml
cargo test --locked --manifest-path backend-rust/Cargo.toml --no-default-features
# 完整命令依序完成，避免共用 target 中的不同 feature 執行檔互相覆寫。
cargo test --locked --manifest-path backend-rust/Cargo.toml --test companion_lan --test companion_hud_contract
cargo test --locked --manifest-path backend-rust/Cargo.toml --no-default-features --test companion_lan --test companion_hud_contract
cd companion
bash ./gradlew --no-daemon :protocol-core:test :theme:testDebugUnitTest :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
```

## 驗收邊界

- ADB 已可執行，沒有連接的 Android 裝置；沒有 `/dev/kvm`。本次未安裝模擬器或生成原生頁面截圖。
- Connection／Tuning／Results／Telemetry 的原生整頁、日夜模式、直橫旋轉，以及真實 LAN／USB／QR 配對、遊戲連動與讀屏仍為 NOT_RUN。
- 既有 26 張 Chromium HUD 圖維持原始提交的歷史參考身分，不能替代本次整合版本的 Android 原生視覺證據。
- Debug APK 為測試簽章，沒有正式發行簽署或裝置驗收。

Skills：`pr-author-maintainer`、`modular-refactoring`。

## 原 PR 專屬背景紀錄（歷史原文）

以下內容來自原 PR 的 Journal，日期、數字與技能記載代表當時版本，不作為本次驗證結果：

## 2026-11-10 / Android 原生頁面與主程式供應儀表快取（Codex as Codex）

- **需求與邊界**：Connection、Tuning、Telemetry 導覽／卡片／詳細頁改為 Compose，不載入共用 React 主介面。Telemetry 概覽要求橫向、單卡滑動，詳細頁可旋轉；儀表保留多款主儀表，停用手把與其他附加元件。使用者明確要求清單與資產由 PC 提供，因此 APK 不內建 HUD 清單或 artwork。
- **清單與資產 ownership**：`hud_overlay/shared/companion-instruments.json` 同時供桌面選單及 Rust 供應器使用。PC 在既有 authenticated `/companion/` 前綴提供 catalog、各款 manifest、hash-addressed 資產；沒有擴大 LAN API allowlist。版本摘要由依序排列的 path、SHA-256、byte count 組成。Android 僅實作 `companion-hud/v1`，新增／更新樣式不需要改 APK。無 HUD 的 PC build 回傳空目錄。
- **快取合約**：按 PC origin 隔離；下載在 IO dispatcher 執行，校驗完整 manifest 與所有檔案後才切換快取版本。共用內容 hash 去重；失敗或取消不破壞目前完整版本；損壞檔案不交給 renderer。每款保留目前與上一版，回收未引用的物件。WebView 只服務 manifest 中的本機檔案，沒有 network、file/content access 或 JavaScript interface。
- **遠端調校存檔**：常駐 `CompanionHostBridge` 新增 `save` 指令，一份車輛檔案寫入參數與 `tuningTarget` 後才 acknowledgement；失敗回 rejected。異步寫入後不覆蓋已變更的桌面草稿／車輛。車輛載入會還原 goal／season，PC 不需切到 Tuning；調校公式仍由 Rust 擁有。
- **驗證**：前端 1,856 passed／1 skipped，TypeScript／Vite build 通過；Rust default 功能測試 234 passed／2 ignored、無預設功能 224 passed／2 ignored。default doctest 曾因並行 Vite build 移除舊 hash 資產而失敗，待前端建置完成後重跑 `cargo test --doc` 通過；之後應先固定 frontend/dist，再執行 Rust gate。Android 35 項單元測試、Lint（0 errors）與 Debug APK 通過。實際 PC sidecar 下載 595 個去重資產共 9,808,371 bytes，18 款 cached renderer 的 Chromium 檢查通過；暖快取重跑下載 0 bytes。APK ZIP 檢查沒有 `assets/hud/`。
- **驗收限制**：瀏覽器與 JVM／Rust 契約測試不代表 Android 實機、LAN／USB／QR、旋轉與遊戲連動驗收；這些仍為 NOT_RUN。Debug build 不是正式簽署發行。
- **Skills**：`halfmoon-design-system`、`modular-refactoring`、`telemetry-udp-protocol`；雲端工具鏈使用 `cloud-environment-runtime`。

- **PR 整合驗證補記**：整合 `c01bf0a8`，保留主線存檔併發保護／安全標頭測試，主儀表清單同步 26 款。前端 2030 passed、build 通過；Android scoped gate 通過（35 tests、Lint 0 errors、Debug APK）。Rust default 268 passed／2 ignored，no-default 258 passed／2 ignored，皆含 doctest 通過。兩組態共用 target 並行會覆寫 process contract 的 binary，因此必須依序完成整個測試命令，而非只依賴 Cargo build lock。PR 整理另採用 `pr-author-maintainer`；瀏覽器畫面與未完成原生截圖範圍記於 `docs/companion/native-hud-review/README.md`。


維護者：Codex as Codex
