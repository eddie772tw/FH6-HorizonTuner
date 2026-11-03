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
