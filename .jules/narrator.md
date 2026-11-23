## 2025-05-24 - Avoid AI-Generated Translations
**Learning:** Automatically translating missing strings using scripts or AI often leads to regressions or unverified translations.
**Action:** When working on i18n features, never commit machine-generated translations to `lang/*.json` files unless human verification is performed, as these can easily introduce subtle errors. Instead, focus on extracting hardcoded UI text into proper translation function wrappers like `t("...")`.

## 2025-02-26 - Translated Status Badges
**Learning:** Found several UI text badges acting as status flags (`READY`, `EXPERIMENTAL`, `REQUIRED`, `SYNCED`, `PAUSED`) that were hardcoded in English, rendering them inaccessible to users in other languages.
**Action:** Replaced the hardcoded values inside badges with translation wrappers `{t("...")}` and mapped them safely across `en-us.json`, `ja-jp.json`, and `zh-tw.json` using explicit translation entries.

## 2026-09-05 - Missing diagnostic string extraction
**Learning:** Found several un-translated hardcoded strings in DiagnosticConsole.tsx, specifically around alert/error messages and support bundle buttons. While developers often forget to translate error boundary logs, leaving UI buttons (like "Download Support Bundle") un-translated degrades the experience for non-English support scenarios.
**Action:** Always scan `alert()`, `window.confirm()`, and conditionally rendered `{status === 'x' ? '...' : '...'}` blocks when hunting for missing i18n keys in UI components.

## 2024-03-24 - Extracting Data Storage Overview text
**Learning:** Found an entire Settings subsection (`DataStorageOverview.tsx`) filled with completely hardcoded English strings, including non-visible ones like `aria-label`. We should always check nested partial components (not just the main views) for missing translations.
**Action:** Next time looking for hardcoded values, grep for patterns like `aria-label=` inside frontend components that don't already import the `useSettings` hook.
## 2024-05-18 - App Brand Name i18n
**Learning:** App and brand names like "FH6-Horizon Tuner" and "FH6 HorizonTuner Lite" were hardcoded in the primary Navigation components because they don't typically change across locales. However, wrapping them in translation helpers `t()` is a best practice that gives localization teams full control over spacing, subtitle inclusion, or regional brand adaptations without requiring code changes.
**Action:** When auditing high-level structural components (like Navbars or Footers) for i18n coverage, proactively extract and map hardcoded brand or app names, even if the base English values are duplicated across locale files, to ensure 100% localization surface area.
## 2025-02-27 - Safe Updates to JSON Locale Files
**Learning:** When automating the extraction and update of translation keys into `json` locale files using Python `json.load()` / `json.dump()`, or Node `JSON.parse()`, any duplicate keys that previously existed in the file may be implicitly deleted, causing a regression.
**Action:** Always verify the diff after programmatically updating localization files to ensure that only the targeted additions are made and no existing unrelated keys are lost. If existing files have duplicate keys or formatting quirks, use text-based replacement or append operations instead of parsing the entire object.
## 2024-11-13 - Translation Parameterization support
**Learning:** Hardcoded text that contain numbers or values in UI elements must be extracted via `t` variables, for this project we must use string replacement. E.g `t(text, params)` inside the `SettingsContext.tsx`
**Action:** Extract text using `t(A · {number} · {date}, { number: i + 1, date: ... })` and pass the mapped `Record<string, string | number>` object.
## 2024-05-24 - Variable interpolation in translation function

**Learning:** When passing variables to custom `t()` function, ensure the variables are properly enclosed in an object as the second argument, e.g., `t('{activeCount} Companion device(s) connected', { activeCount })`.

**Action:** Ensure proper variable interpolation when refactoring hardcoded text to i18n usage.

## 2024-05-24 - Double Translation Prevention in Custom Components
**Learning:** Custom UI components like `AppDialog` may already wrap string props (like `title`) in the translation function `t()` internally. Passing an already translated string `t('Settings')` as a prop leads to double-translation or missing key warnings.
**Action:** When applying i18n to component props, first inspect the component's internal implementation (e.g., `AppDialog.tsx`) to verify if it handles translation itself, preventing redundant double-translations.
## 2024-10-05 - [Hardcoded Text Pattern Extraction]
**Learning:** Found several hardcoded, context-specific UI strings like 'GitHub Releases (Ed25519 Signed)', 'P05 / P50 / P95', and 'Endpoint' that were missed in standard i18n sweeps.
**Action:** Always scan for generic punctuation-only structures and domain-specific acronyms that appear directly as child nodes in React components.
## 2025-05-24 - Extracting Domain-Specific Statistical Labels
**Learning:** Found numerous hardcoded context-specific domain labels and punctuation-heavy strings like `Ride height F/R`, `Damping rebound F/R`, `Samples`, `Bins`, and `Peak power` within the Companion app's `CompanionMeasurement.tsx` and `CompanionResults.tsx`. These strings act as labels for statistical values, and leaving them un-translated breaks the UI's accessibility and usability for non-English tuning audiences.
**Action:** When auditing telemetry or tuning UI components, always proactively scan for and extract hardcoded domain-specific statistical labels and properties (like `F/R` abbreviations or specific tuning terms) into proper translation function wrappers like `t("companion....")` and add them to the base English locale file to enable complete translations.

## 2026-11-01 - Anti-Fragmented Sentence Concatenation
**學習 (Learning):** 避免將含有動態數值或版本的單一完整句子切碎成多個片段進行字串拼接（例如 `${t('New version')} ${ver} ${t('is ready...')}` 或 `{t('Version')} {ver} {t('is available!')}`）。切碎拼接會破壞日文或德文等倒裝語序，且容易遺漏未納入字典的懸空碎片字串（如 `'is available!'`），導致介面出現英文穿透。
**行動 (Action):** 遇到包含動態變數的通知或狀態字串時，一律採用參數化內插格式 `t('New version {version} is ready for download.', { version })`，並將帶有具名變數的完整句子鍵值同步對齊至所有語系字典中。
**署名:** Narrator as Antigravity

## 2026-11-02 - WCAG Bypass Links & Dialog Title Prop Single-Pass Translation
**學習 (Learning):** 新增的無障礙旁路連結（如 `Skip to main content`）與全域 Suspense 狀態（`Loading...`）若未即時在各語言字典中對齊，會造成螢幕閱讀器與輔助鍵盤使用者在非英文環境下遭遇未翻譯的英文穿透；同時，客製化對話框（如 `AppDialog`）若內部已實作 `t(title)`，父層元件傳遞 prop 時切勿預先包裝 `t(...)`，否則在切換語系後會將已翻譯字串作為鍵名傳入造成二次翻譯失效。
**行動 (Action):** 當審查無障礙屬性（aria-label、skip link）或頂層 Suspense fallback 時，務必將其通用字詞同步收錄至 `en-us.json`、`zh-tw.json` 與 `ja-jp.json`；且凡使用自帶 `t()` 的對話框或抽屜元件時，一律傳遞原始鍵名（raw key），維持單次翻譯責任邊界。
**署名:** Narrator as Antigravity


## 2026-11-03 - Companion Badge Status Parameterization & Structural Accessibility
**學習 (Learning):** 設定介面中用作狀態徽章 (Badge) 的文字，常因開發者直接將動態數量與假想的字串進行模板拼接（如 `${count} ${t('DEVICE(S) CONNECTED')}`）而發生字典鍵缺失，導致在所有非英文環境中永遠顯示未翻譯的大寫英文；此外，Companion 應用程式頂層 `<main>`、`<nav>` 與連線模式開關等結構容器的 `aria-label` 若未包裝 `t()`，會使螢幕閱讀器使用者遭遇英文穿透，無法感知當前操作區段。
**行動 (Action):** 審查狀態徽章時，一律優先檢查專案字典中是否已有現成參數化鍵值（如 `{activeCount} Companion device(s) connected`），並徹底取代 `${count} ${t('KEY')}` 形式之字串拼接；同時將 Companion 頂層結構與無障礙標籤全面以 `t()` 包裝並同步收錄至 `en-us.json`、`zh-tw.json` 與 `ja-jp.json`。
**署名:** Narrator as Antigravity


## 2026-11-04 - CSS Text-Transform Anti-Pattern & Accessible Tab Labeling
**學習 (Learning):** 在行動或隨行視圖中，將未翻譯的內部 ID 直接傳入 Tab 按鈕並仰賴 CSS（如 `text-transform: capitalize`）呈現大寫，是常見的在地化反模式；這會導致所有非英文語系直接暴露英文小寫 raw ID，且螢幕閱讀器使用者無法獲悉卡片的完整語義。同時，全局字典中的通用詞（如 `"Tires": "輪胎氣壓"`）可能因歷史上下文產生語意窄化，若直接復用於不同場景會造成非預期的語義偏離。
**行動 (Action):** Companion Tab 導航按鈕應採用分層標籤架構：按鈕可視文字採用模組化命名空間（如 `companion.cards.*`）的精簡短標籤，`aria-label` 則綁定卡片全名（如 `t("Tire Grip & Status")`），同時將桌面與隨行視圖共享的標題鍵（如 `Live Telemetry Traces`）同步收錄至各語系字典，兼顧緊湊排版與無障礙語意完整性。
**署名:** Narrator as Antigravity
## 2026-11-05 - Parameterized Status Badges & Component Props t() Signature
**學習 (Learning):** 分析視圖工具列（ManualRecordingToolbar）將動態採樣數與狀態標籤碎片化拼接（如 `{status} ({count} {t("samples")})`），會導致非英文語系（如日文）因詞彙缺失或倒裝語序造成介面顯示破碎，且螢幕閱讀器難以解析完整語義；同時，子組件 Props 中的 `t` 簽名若被收窄為 `(text: string) => string`，會迫使開發者在該組件內退回字串拼接。此外，工具列按鈕若僅提供 `title` 而未同步鏡像至 `aria-label`，會使純鍵盤焦點與無障礙讀屏工具遺漏操作說明。
**行動 (Action):** 在工具列等含有動態計數的狀態徽章中，一律改用具備具名參數的完整句子鍵值（如 `t("Manual Recording ({count} samples)", { count })`），將組件 `t` prop 擴展為支援可選 params 物件；並確保 `title` 與 `aria-label` 同步對齊收錄至 `en-us.json`、`zh-tw.json` 與 `ja-jp.json` 中。
**署名:** Narrator as Antigravity
## 2026-11-06 - Deep Workspace t() Signature Expansion & Trilingual Dictionary Asymmetry
**學習 (Learning):** 開發者調校與深層診斷視圖（如 `TuningTelemetryCaptureView`）常因組件 Props 將 `t` 窄化為 `(text: string) => string`，阻礙了參數化內插的使用，導致開發者退回模板字串拼接（如 `{status} · {count} {t('samples')}`），在日文環境下產生半英半日穿透與語序倒裝破壞；此外，歷史上該視圖之靜態說明文字僅單邊收錄於 `zh-tw.json`，而 `en-us.json` 與 `ja-jp.json` 存在嚴重缺鍵，使非英文語系直接暴露英文；且按鈕僅靠外部容器條件標籤，使內層原生按鈕遺漏可及名稱。
**行動 (Action):** 當審查深層工作區或子視圖時，一律將組件 Props 之 `t` 簽名擴展為 `t: (text: string, params?: Record<string, string | number>) => string;`，將狀態徽章抽取為具名參數之完整鍵值（如 `Capturing · {count} samples`），添加 `role="status"` 與 `aria-live="polite"`；並全面審查三語系字典（`en-US`、`zh-TW`、`ja-JP`）的不對稱缺失，對齊「返回」、「開始/停止」、「清空緩衝區」及「下載」等操作按鈕的 `aria-label`。
**署名:** Narrator as Antigravity

## 2026-11-07 - Composite Action Anti-Pattern & Contextual Status Homonyms
**學習 (Learning):** 工具列按鈕將檔案格式與動詞片段拼接（如 `MoTeC .ld {t("Export")} ({t("Experimental")})` 或 `CSV {t("Export")}`），在非英文語系（如日語動賓倒裝語序）中會產生語法破碎與欠缺助詞的生硬介面；同時，歷史字典可能存在同形異義（Homonym）錯譯，例如介面中的「Status」在日語字典中被機械化翻譯為行政區劃的「州」（State）而非「ステータス」，直接妨害了非英文使用者的理解。此外，頂層工具列的 `<select>` 下拉選單若缺少 `aria-label`，讀屏工具僅能讀出原生控制項而遺漏選單功能語義。
**行動 (Action):** 將複合動作按鈕全面抽取為單一完整鍵值（如 `MoTeC .ld Export (Experimental)`、`CSV Export` 與 `MoTeC CSV Import`）；審查多語言字典時主動校正歷史術語歧義；並為工具列選單補齊與標籤對齊之 `aria-label`，確保國際化與無障礙體驗一體化交付。
**署名:** Narrator as Antigravity

## 2026-11-09 - Telemetry Mode Raw ID Anti-Pattern & Analysis Trimming Trilingual Alignment
**學習 (Learning):** 遙測分析視圖（SessionTrimSummaryCard）直接渲染協議原始字串（如 recording_mode 的 `circuit`、`time_trial`，以及 lap_time_source 的 `game`、`calculated`）並仰賴 CSS（`text-uppercase` / `text-capitalize`）呈現，會導致非英文語系（日文與中文）無法顯示合適賽事術語而暴露大寫英文 raw ID；同時，該卡片之 `Session Analysis & Trimming`、`Lead-in Trim` 等整組鍵值在日文字典（`ja-jp.json`）中完全缺失，使日文使用者面臨整卡英文穿透。此外，統計採樣比例（`trimmed / raw`）若僅以純文字斜線呈現，輔助科技無法獲取完整語意，且組件 Props 將 `t` 窄化為 `(text: string) => string` 會阻礙參數化無障礙標籤的傳入。
**行動 (Action):** 將模式與計時來源對應為規範化字典鍵（如 `Circuit`, `Time Trial`, `In-Game Timing`, `Calculated Timing`）並移除裝飾性 CSS 大寫；擴展組件 Props `t` 簽名支援可選 params 物件，為有效採樣比例加上具備參數化句子之 `aria-label`（`t("{valid} of {total} samples valid", { valid, total })`）；為 switch 控制項補齊 `role="switch"` 與 `aria-checked`；並完整對齊 `en-us.json`、`zh-tw.json` 與 `ja-jp.json`，消除遙測分析卡片的跨語言不對稱。
**署名:** Narrator as Antigravity

## 2026-11-14 - Pure Chart Primitives Legend Localization & Memoized Corner Series
**學習 (Learning):** 遙測詳細圖表元件（`TrendChart` in `TelemetryDetailPrimitives.tsx`）刻意維持與 `SettingsContext` 解耦，導致圖例容器硬編碼 `aria-label="Chart legend"`；同時 `TelemetryDetailPanels.tsx` 雖由父層傳入已在地化之 `corners` 陣列，圖表曲線卻仍使用模組層常數 `FL`/`FR`/`RL`/`RR` 標籤，且 `TrendChart` 的 `[data, lines]` effect 會在 `lines` 參考變更時重置懸停狀態與重繪。此外，`Pitch`、`Roll`、`Yaw` 及四項輪胎趨勢標題亦完全未收錄於三語系字典中。
**行動 (Action):** 對維持純粹性而不直接訂閱 `SettingsContext` 的圖表基元，應以選擇性 prop（如 `legendLabel?: string`）傳入 `t('Chart legend')`；將傳入 `TrendChart` 的在地化四輪曲線標籤包裹於 `useMemo(..., [corners])`（如 `CornerTrendChart`）以維持高頻重繪時的參考穩定性；並以既有詞彙表（如日文 `スリップアングル` 對應 `Slip Angle`）對齊三語系字典。
**署名:** Narrator as Antigravity

## 2026-11-15 - Mixed Sentinel Enum Leakage in Debrief Status Badges
**學習 (Learning):** 領域計算函式（如 `sessionDebriefMath.ts`）常在同一個 `status` / `tendency` 聯集型別中混用可讀標題字串（`Optimal`、`Occasional Bottoming`、`Understeer Biased`）與內部 snake_case 哨兵值（`no_data`）。當 UI 元件（`SessionHealthDebrief`）直接將該欄位傳入 `t(status)` 時，因字典中不存在 `no_data` 鍵值，會在包含英文在內的所有語系介面上直接洩漏原始字面 `no_data`。此外，`Valid Laps` 與 `Total Samples` 僅單邊存在於 `zh-tw.json` 而遺漏於 `en-us.json` / `ja-jp.json`，且四輪溫度網格仍硬編碼英文縮寫 `FL` / `FR` / `RL` / `RR`。
**行動 (Action):** 審查直接將領域狀態欄位傳給 `t(...)` 的元件時，務必檢查聯集型別中的哨兵值（如 `no_data`）並於 UI 層映射至規範字典鍵（`No Data`）；四輪標籤一律復用既有三語系字典鍵 `Front Left` / `Front Right` / `Rear Left` / `Rear Right` 並以陣列映射消除重複區塊；同時檢查 `zh-tw.json` 已存在但 `en-us.json` 與 `ja-jp.json` 缺漏的單邊鍵值並完整對齊。
**署名:** Narrator as Antigravity

## 2026-11-17 - Parameterized Select Option Formatting & Unit Suffix Leakage
**學習 (Learning):** `AnalysisSessionToolbar.tsx` 的賽段與單圈下拉選單（`<option>`）除了直接硬編碼英文標籤（`Laps | Best:`、`Lap ... | Max:`、`vs Lap`）之外，還將時間與車速單位直接拼接在空值回退表達式之後（例如 `${lap.lap_time?.toFixed(2) ?? t("Unknown")}s` 與 `${lap.max_speed_kmh?.toFixed(0) ?? t("Unknown")}km/h`），導致當 `best_lap_time`、`lap_time` 或 `max_speed_kmh` 缺失或為 0 時，各語系介面皆出現「未知s」、「未知km/h」或「Unknowns」等破損字串。
**行動 (Action):** 抽取下拉選單文字時，應使用完整參數化鍵值（如 `"{car} ({laps} Laps | Best: {best})"`、`"Lap {lap} ({time} | Max: {maxSpeed})"`、`vs Lap {lap} ({time})`），並由純函式先判斷數值有效且有限後才附加單位（`s`、`km/h`），無效時直接回傳純淨的 `t("Unknown")`，防止單位後綴與未翻譯／缺值詞彙錯誤黏連。
**署名:** Narrator as Antigravity

## 2026-11-18 - Pure Telemetry Health Model Label Leakage in Header Status
**學習 (Learning):** `telemetryHealth.ts` 的 `deriveTelemetryHealth()` 回傳的 `TelemetryHealth.label` 為純領域英文預設字串（例如 `'Waiting for Data Out'`、`'Data Out receiving'`）。雖然 `DataOutGuide.tsx` 已匯出 `localizeTelemetryHealth(health, t)` 統一依 `health.state` 映射三語系鍵值，但頂層導覽列元件 `AppStatus.tsx` 仍直接將 `health.label` 插入 `aria-label` 與 `title`，導致在 `zh-TW` 與 `ja-JP` 介面上所有頁面的 Data Out 狀態按鈕持續洩漏未翻譯英文；同時其動態連接埠 `MCP Endpoint Notice` 氣泡的四個鍵值僅單邊收錄於 `zh-tw.json` 而遺漏於 `en-us.json` 與 `ja-jp.json`。
**行動 (Action):** 凡消費 `TelemetryHealth` 顯示狀態標籤或無障礙屬性的元件，應統一呼叫 `localizeTelemetryHealth(health, t).label` 作為單一本地化來源，禁止直接插值原始 `health.label`；並同步檢查單邊存在於 `zh-tw.json` 的動態提示鍵值，完整對齊至 `en-us.json` 與 `ja-jp.json`。
**署名:** Narrator as Antigravity

## 2026-11-19 - Non-English Canonical Key Leakage in Companion Connection Status
**學習 (Learning):** `connectionStatus.ts` 的 `getAggregateConnectionStatus()` 直接回傳硬編碼的繁體中文字串（`已連線`、`桌面前端未連線`、`Companion 後端未連線`、`未連線` 與對應完整 `accessibleLabel`），而 `SettingsContext.t()` 在 `en-us` 語系會直接原樣回傳輸入鍵名，且 `ja-jp.json` 亦無對應繁中鍵值，導致英文與日文使用者在 Companion 連線分頁與狀態徽章皆遭遇繁體中文洩漏；同時 `CompanionApp.tsx` 狀態徽章的 `aria-label` 未包裹 `t(...)`，且分頁與診斷鍵值（`Tuning`、`Online`、`Offline`、`CONNECTED`、`LOADING`）亦遺漏於三語系字典。
**行動 (Action):** 所有 UI 領域狀態協助函式（如 `connectionStatus.ts`）一律回傳英文規範化鍵值作為單一 i18n 鍵名，禁止以非英文字串作為 `t(...)` 鍵值來源；同時將原先的繁中譯文完整保留並對齊至 `zh-tw.json`，補齊 `en-us.json` 與 `ja-jp.json`，並確保所有狀態徽章的 `aria-label` 皆經過 `t(...)` 包裝。
**署名:** Narrator as Antigravity

## 2026-11-20 - Dynamic Option Registry Non-English Key Leakage in HUD Config Modules
**學習 (Learning):** 像 `ClassicJdmSettingsCard.tsx` 這類設定卡片雖已對每個 `<option>` 呼叫 `t(item.label)`，因而不會被靜態字面 `t('...')` 掃描器檢出缺鍵，但其引用的設定常數陣列（`classic_jdm/config.ts` 中的 `CLASSIC_JDM_AUX_GAUGES` 與 `CLASSIC_JDM_DEFI_THEMES`）卻直接內嵌繁中／雙語混排字串（如 `四輪平均胎溫 (4W Avg)`、`Amber Red (琥珀紅)`）且未收錄於任何語系字典，導致 `en-US` 與 `ja-JP` 使用者在 HUD 控制面板的下拉選單直接看到繁體中文洩漏，並使 `zh-TW` 混雜括號英文與不統一術語。
**行動 (Action):** 稽核動態呼叫 `t(option.label)` 的表單元件時，務必同步追蹤其外部 config 常數陣列，確保所有選項鍵名皆為無縮寫歧義的英文規範鍵（並優先復用同工作區既有三語鍵如 `Oil Temperature`、`Oil Pressure`），再於 `en-us.json`、`zh-tw.json`、`ja-jp.json` 完整對齊並透過單元測試封鎖非 ASCII 鍵名回歸。
**署名:** Narrator as Antigravity

## 2026-11-21 - Fragmented Tuning Summary & Chinese-Pivot Japanese Discipline Mistranslations
**學習 (Learning):** `Step2ChassisTuner.tsx` 同時存在四類典型 i18n 缺陷：(1) 主標題硬編碼英文前綴 `Step 2:`；(2) 摘要副標題將 `Calculated based on`、`profile for` 與未經 `t()` 包裝之領域枚舉（`selectedRaceGoal`、`season`、`drivetrain`）及硬編碼縮寫 `% F` 拼接為碎片句子，導致日文與中文語序破碎且讀屏器將 `% F` 誤讀為華氏單位；(3) 20 個核心卡片標題與底盤參數鍵僅部分存在於 `zh-tw.json` 或完全缺失於三語系字典；(4) `lang/ja-jp.json` 中四個賽事類型鍵因歷史上從繁體中文直譯而出現嚴重語義錯譯（`甩尾`→`フリック`、`拉力`→`引く`、`公路`→`高速道路`、`直線加速`→`直線加速度`），連帶污染 `Step1GoalSetup` 與 `BaselinePreviewPanel`。
**行動 (Action):** 步驟標題一律納入單一完整鍵值（如 `Step 2: Chassis, suspension & tire recommendations`）；含多變數之車輛摘要與 AWD 後軸比例改用具名參數內插（`Calculated for {goal} profile · {weight} {unit} ({frontPercent}% front) {drivetrain} · Season: {season}`、`{percent}% Rear`），將賽事目標、季節與驅動形式全數透過 `t()` 映射；並於審查 `ja-jp.json` 賽車領域術語時，主動排查由中文多義詞轉譯造成的誤譯並修正為標準日文賽車術語（`ロード`、`ラリー`、`ドリフト`、`ドラッグ`）。
**署名:** Narrator as Antigravity

## 2026-11-22 - Static aria-label Masking Dynamic Values & Protocol Enum Leakage in Companion Settings
**學習 (Learning):** 在 `CompanionLanControls.tsx` 中對顯示動態配對碼的 `<strong>` 加上靜態 `aria-label={t('Pairing code')}`，會使螢幕閱讀器覆寫元素內容而完全隱藏實際配對碼數字，且倒數徽章以 `{t('Expires in')} {mm}:{ss}` 碎片拼接會破壞日文與中文語序；同時 `CompanionUsbControls.tsx` 直接在 `<option>` 內插原始 ADB 協定枚舉 `device.state`（`device` / `unauthorized` / `offline`），在英文介面暴露內部詞彙 `device`，並在 `zh-TW` / `ja-JP` 介面造成英文穿透。此外，實測截圖亦確認過長的日文卡片標題與按鈕（如 `ローカルネットワークペアリング` + `ペアリングコードを生成`）在雙欄與 320px 視窗容易產生單字元孤行折行。
**行動 (Action):** 為動態代碼元素提供無障礙標籤時，應改用參數化鍵值（如 `aria-label={t('Pairing code: {code}', { code: pairing.token })}`）保留實際數值語義；倒數計時改為完整參數化鍵（`t('Expires in {time}', { time })`）；ADB 等底層協定狀態一律經顯式鍵值表映射（`Ready` / `Unauthorized` / `Offline`）再傳入 `t(...)`；並確保說明文案中引用的按鈕名稱（如 `Connect USB device`、`Refresh devices`）與對應按鈕譯文在三語系間完全一致，且在 320px 與雙欄視窗下保持精簡不產生孤字折行。
**署名:** Narrator as Antigravity

## 2026-11-23 - Cross-Domain Homonym Collision on "Metric" & Raw Storage Capability Enums
**學習 (Learning):** 系統設定中的單位系統鍵 `"Metric"` 與遙測分析熱圖通道選擇器（`AnalysisSessionVisuals.tsx`）共用同一字面鍵，導致歷史上 `zh-tw.json` 與 `ja-jp.json` 保留原樣英文 `"Metric"` 未譯且漏收 `"Imperial"`；由於 `SettingsContext.t()` 在 `en-us` 直接回傳原始鍵名而不查表，若單獨修改 `"Metric"` 譯文為「公制 / メートル法」，會讓分析介面錯誤顯示單位制名稱。此外，`DataStorageOverview.tsx` 直接以 `.replace('_', ' ')` 渲染 Rust 後端能力枚舉（`not_available`、`not_planned`、`available`）與 `data_root`（`Application data directory`）而未經過 `t(...)` 映射，`DiscordPresenceStatusCard.tsx` 亦遺漏後端 `unavailable` 狀態且以通用鍵 `Updates` 拼接數值計數。
**行動 (Action):** 修改任何高風險多義鍵（如 `Metric`、`Updates`）譯文前，必須先全域 grep 盤點所有呼叫端，並以明確英文區分鍵（如復用既有三語系鍵 `Analysis Metric` 或參數化 `Updates: {count}`）解除同形異義衝突；凡消費後端能力枚舉或描述字串的狀態卡片，一律建立顯式鍵名對應表經 `t(...)` 轉換，並為動態輪詢徽章與錯誤區塊補齊 `role="status" aria-live="polite"` 與 `role="alert"`。
**署名:** Narrator as Antigravity
