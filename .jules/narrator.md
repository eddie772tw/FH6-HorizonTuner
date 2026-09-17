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
