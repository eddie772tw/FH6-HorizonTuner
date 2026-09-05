## 2025-05-24 - Avoid AI-Generated Translations
**Learning:** Automatically translating missing strings using scripts or AI often leads to regressions or unverified translations.
**Action:** When working on i18n features, never commit machine-generated translations to `lang/*.json` files unless human verification is performed, as these can easily introduce subtle errors. Instead, focus on extracting hardcoded UI text into proper translation function wrappers like `t("...")`.

## 2025-02-26 - Translated Status Badges
**Learning:** Found several UI text badges acting as status flags (`READY`, `EXPERIMENTAL`, `REQUIRED`, `SYNCED`, `PAUSED`) that were hardcoded in English, rendering them inaccessible to users in other languages.
**Action:** Replaced the hardcoded values inside badges with translation wrappers `{t("...")}` and mapped them safely across `en-us.json`, `ja-jp.json`, and `zh-tw.json` using explicit translation entries.

## 2026-09-05 - Missing diagnostic string extraction
**Learning:** Found several un-translated hardcoded strings in DiagnosticConsole.tsx, specifically around alert/error messages and support bundle buttons. While developers often forget to translate error boundary logs, leaving UI buttons (like "Download Support Bundle") un-translated degrades the experience for non-English support scenarios.
**Action:** Always scan `alert()`, `window.confirm()`, and conditionally rendered `{status === 'x' ? '...' : '...'}` blocks when hunting for missing i18n keys in UI components.
