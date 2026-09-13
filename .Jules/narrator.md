## 2024-05-18 - Missing Export Setup Keys
**Learning:** Found that some export-related translation keys used in the frontend components (like "Export setup", "Export collected frames", "Export recorded frames") were entirely missing from `en-us.json` and `ja-jp.json`, falling back to untranslated English strings or undefined behavior.
**Action:** When adding missing translation keys to the English file, always verify and update corresponding non-English locale files to ensure translations are accurately propagated for international users.
