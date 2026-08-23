<!-- Raw Jules work log. Promote only after local verification; see .jules/README.md. -->

## 2024-03-24 - Accessible Custom Toggles & Modals
**Learning:** In the `Dashboard.tsx`, the custom toggle for metric/imperial units relied solely on a `<label>` with an `onClick` event, making it inaccessible to keyboard users and screen readers. In `DiagnosticConsole.tsx`, the close button used an icon without an aria-label.
**Action:** Back custom toggles with a visually hidden (`.sr-only`) native `<input type="checkbox">`; bind `checked` and `onChange` to the input. Add `aria-label` to icon-only buttons and global `:focus-visible` styles.

## 2024-07-24 - Missing ARIA Labels on Dynamic Icon Buttons
**Learning:** Dynamically generated UI lists with icon-only actions often lack screen-reader context when labels are not added during iteration.
**Action:** Add an explicit, action-specific `aria-label` to every dynamically generated icon-only button.

## 2026-07-24 - ARIA Current for Navigation Tabs
**Learning:** Visually styled active navigation tabs do not automatically convey the current location to assistive technologies.
**Action:** Add `aria-current="page"` or the appropriate equivalent to the active tab or navigation item.

## 2024-08-01 - Expand Clickable Hit Areas for Settings Rows
**Learning:** Wrapping settings rows that contain checkboxes in `<label>` elements improves keyboard and pointer usability.
**Action:** Wrap checkbox settings rows in `<label>` elements and use `cursor: pointer` to make the complete row clickable.

## 2026-08-03 - Tooltips on Disabled Buttons
**Learning:** A disabled visual state alone may not explain why an action is unavailable or how to resolve it.
**Action:** Add a `title` or tooltip explaining the disabled reason and recovery path.

## 2024-08-03 - Tooltips on Disabled Button Wrappers
**Learning:** Native disabled buttons can swallow pointer events, preventing a tooltip attached directly to the button from appearing.
**Action:** Put the disabled button in an inline-block wrapper, attach the tooltip to the wrapper, and disable pointer events on the button when necessary.
## 2024-08-04 - Tooltips on Disabled Buttons with inline-block wrappers
**Learning:** Adding `title` attributes directly to a `<button>` element is ineffective when the button is disabled, because native disabled buttons swallow pointer events. Furthermore, if a `<span>` wrapper is used but left as `display: inline`, the wrapper's hit area may not correctly cover the disabled button, causing the tooltip to only trigger around the edges or fail completely in flexbox layouts.
**Action:** When adding tooltips to disabled buttons, wrap the button in a `<span title="...">` that explicitly includes `display: 'inline-block'` and `cursor: 'not-allowed'`. The `<button>` itself must have `pointerEvents: 'none'` applied conditionally when disabled so hover events propagate to the wrapper.
