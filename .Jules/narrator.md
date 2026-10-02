## 2024-05-24 - Double Translation Prevention in Custom Components
**Learning:** Custom UI components like `AppDialog` may already wrap string props (like `title`) in the translation function `t()` internally. Passing an already translated string `t('Settings')` as a prop leads to double-translation or missing key warnings.
**Action:** When applying i18n to component props, first inspect the component's internal implementation (e.g., `AppDialog.tsx`) to verify if it handles translation itself, preventing redundant double-translations.
