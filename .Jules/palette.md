## 2024-03-24 - Accessible Custom Toggles & Modals
**Learning:** In the `Dashboard.tsx`, the custom toggle for metric/imperial units relied solely on a `<label>` with an `onClick` event, making it inaccessible to keyboard users (no tab focus) and screen readers (no state announcement). In `DiagnosticConsole.tsx`, the close button used an icon (`&times;`) without an aria-label.
**Action:** When implementing custom UI controls (like switches/toggles), always back them with a visually hidden (`.sr-only`) native `<input type="checkbox">` to ensure proper keyboard navigation and screen reader support. Always add `aria-label` to icon-only buttons. Added global `:focus-visible` styles to `App.css` to improve keyboard navigation visibility across the app.
## 2024-07-24 - Missing ARIA labels on dynamically generated icon buttons
**Learning:** Dynamically generated UI lists with icon-only actions (like "Remove Channel" with an "×" icon) often lack proper screen-reader context if not explicitly labelled during map iteration.
**Action:** Always add explicit `aria-label`s to dynamically mapped icon buttons.
## 2026-07-24 - [ARIA Current for Navigation Tabs]
**Learning:** Adding `aria-current="page"` to active navigation tab buttons provides clear, semantic context to screen readers about the user's current location within the application, enhancing general accessibility beyond standard focus indicators.
**Action:** Always consider `aria-current` when building tabbed interfaces or primary navigation components to indicate active state for assistive technologies.
## 2024-07-26 - Navigation Tab Accessibility
**Learning:** Screen reader users rely on attributes like `aria-current="page"` (or sometimes `"true"`) on navigation elements to understand which section or tab is currently active. Visually styled active states are not conveyed to assistive technologies automatically.
**Action:** Always add `aria-current="page"` (or similar depending on context) to the active element within a tabbed or menu-based navigation structure to ensure equal access to application state.
## 2024-07-26 - Icon Button Labeling
**Learning:** When using HTML entities like `&times;` (`×`) or `✕` for close/remove buttons, they must have an explicit `aria-label` attribute (e.g., `aria-label="Close"`) to be accessible to screen readers, and it is better to use `&times;` rather than hardcoded unicode characters.
**Action:** Ensure all icon-only buttons, especially those using symbols for actions, have descriptive `aria-label`s.
