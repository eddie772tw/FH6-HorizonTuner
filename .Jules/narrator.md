## 2025-02-18 - Batch adding missing translations
**Learning:** Found 37 missing keys in the Japanese translation file (`ja-jp.json`) compared to the English file, likely because they were added for new telemetry features without translation propagation.
**Action:** Always write a script to check for key parity across all supported JSON language files when auditing translations to catch these easily missed structural desyncs.
