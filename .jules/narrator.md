<!-- Raw Jules work log. Promote only after local verification; see .jules/README.md. -->

## 2023-10-27 - Automated Missing Key Injection
**Learning:** Automatically synchronizing missing i18n keys across multiple files (like `ja-jp.json` and `zh-tw.json`) can be done efficiently with string manipulation tools/scripts to retain formatting, but these ad-hoc script files must be strictly cleaned up before committing to avoid repo pollution.
**Action:** When creating one-off utility scripts for bulk i18n key synchronization, ensure an explicit deletion step (e.g. `rm *.py`) is executed before requesting code review and submitting the PR.
## 2024-05-24 - Dynamic Translation Keys in React
**Learning:** When dynamically rendering selected configuration values in React components (e.g., displaying a chosen dropdown profile), passing the raw state variable directly into the translation function (like `t(config.profile)`) can lead to untranslated text fallbacks or missing parameters.
**Action:** Map the raw configuration values to their corresponding, fully descriptive translation keys using explicit conditionals or object maps (e.g., `config.profile === '1080P' ? t('1080P FULL (Full HD Overlay)') : ...`) to ensure the translation dictionary can be properly queried and maintain clean locale files.
## 2025-02-21 - Removing Developer Jargon from UI
**Learning:** Hardcoded developer-centric terms like "TODO" in placeholders or hints can confuse users and break the immersion of localized interfaces, even if they're meant to indicate upcoming features.
**Action:** Always replace internal tracking terms like "TODO" with user-friendly, translatable strings (e.g., "Coming Soon") mapped across all supported locales to maintain a polished, professional UI experience.
