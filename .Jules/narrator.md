
## 2024-03-24 - Extracting Data Storage Overview text
**Learning:** Found an entire Settings subsection (`DataStorageOverview.tsx`) filled with completely hardcoded English strings, including non-visible ones like `aria-label`. We should always check nested partial components (not just the main views) for missing translations.
**Action:** Next time looking for hardcoded values, grep for patterns like `aria-label=` inside frontend components that don't already import the `useSettings` hook.
