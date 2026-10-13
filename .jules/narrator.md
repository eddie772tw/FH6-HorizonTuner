## 2023-10-13 - Extracting punctuation-heavy hardcoded UI structures
**Learning:** Hardcoded text structures like "P05 / P50 / P95" that rely on non-translated characters (e.g. forward slashes) limit the accuracy and context of translations, as translators receive the entire string to translate.
**Action:** Extract these structural elements into individual translation keys (e.g. `{t('P05')} / {t('P50')} / {t('P95')}`) inside the UI component instead of pushing the structural format (slashes, spacing) to the locale string itself.
