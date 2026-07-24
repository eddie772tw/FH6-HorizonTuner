## 2023-10-27 - No Fallback Strings in UI Components
**Learning:** Fallback strings inside `t()` functions (e.g., `t('key') || 'fallback'`) are strictly prohibited. They hide untranslated content and prevent the extraction tools from syncing keys correctly.
**Action:** Always scan for and remove `|| 'fallback'` patterns from UI files, extracting the text fully into `lang/en-us.json` instead. Ensure all targets implement the key to prevent missing UI elements.
