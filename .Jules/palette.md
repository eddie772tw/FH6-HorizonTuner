## 2026-09-01 - Accessible Async Button Spinners
**Learning:** Text-based loading states like `...` in buttons are often skipped or misinterpreted by screen readers, creating an inaccessible async experience. Replacing them with proper spinner components (e.g., `spinner-border`) combined with `aria-hidden="true"` on the spinner and explicit descriptive text provides both a clear visual cue and a semantic cue for assistive technologies.
**Action:** When creating async/loading buttons, use explicit spinner elements and descriptive text instead of relying on ellipsis strings.
