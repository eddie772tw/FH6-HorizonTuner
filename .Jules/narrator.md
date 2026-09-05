## 2024-05-18 - Missing diagnostic string extraction
**Learning:** Found several un-translated hardcoded strings in DiagnosticConsole.tsx, specifically around alert/error messages and support bundle buttons. While developers often forget to translate error boundary logs, leaving UI buttons (like "Download Support Bundle") un-translated degrades the experience for non-English support scenarios.
**Action:** Always scan `alert()`, `window.confirm()`, and conditionally rendered `{status === 'x' ? '...' : '...'}` blocks when hunting for missing i18n keys in UI components.
