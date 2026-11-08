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

## 2024-05-19 - Tooltips on Disabled Buttons in React
**Learning:** In standard HTML/React, native `<button disabled>` elements swallow mouse events, preventing CSS `:hover` states and parent wrappers (like `<span>` with `title` attributes) from receiving the events needed to display tooltips.
**Action:** Always wrap disabled buttons that need tooltips in a `<span>` with `title` and conditionally apply `display: inline-block` and `cursor: not-allowed` to the wrapper, and `pointerEvents: 'none'` to the button itself. This allows the wrapper to catch the event while still showing the disabled cursor.

## 2026-09-01 - Accessible Async Button Spinners
**Learning:** Text-based loading states like `...` in buttons are often skipped or misinterpreted by screen readers, creating an inaccessible async experience. Replacing them with proper spinner components (e.g., `spinner-border`) combined with `aria-hidden="true"` on the spinner and explicit descriptive text provides both a clear visual cue and a semantic cue for assistive technologies.
**Action:** When creating async/loading buttons, use explicit spinner elements and descriptive text instead of relying on ellipsis strings.

## 2024-05-17 - Added loading state to Support Bundle download button
**Learning:** When using Playwright to verify transient UI loading states (like async spinners), use route interception to artificially delay the corresponding API responses to reliably capture the visual state for screenshots and videos.
**Action:** When creating tests or taking screenshots of loading states, add a page.route() handler to delay the API response to avoid the test finishing or state clearing too quickly before verification finishes.

## 2024-11-20 - Ensure accurate mapping for automated accessibility injection
**Learning:** When automating the addition of `aria-label` tags, naive regex scanning can incorrectly map labels (e.g. assigning a previous label to the wrong input because of unexpected structural skips in JSX). Factually incorrect `aria-label`s actively degrade the UX for visually impaired users.
**Action:** When creating text replacement scripts for accessibility features, explicitly define exact mappings or tightly couple the replacement bounds to avoid misassigning labels.

## 2024-05-24 - [Internationalize ARIA Labels]
**Learning:** Hardcoding English strings in ARIA labels (e.g., `aria-label="Close"`) breaks accessibility for non-English screen reader users.
**Action:** Always wrap ARIA label strings in translation functions (e.g., `aria-label={t("Close")}`) when working within i18n-supported components to ensure universal accessibility.
## 2024-03-24 - Tooltips on Disabled Buttons
**Learning:** In React, disabled HTML buttons completely swallow pointer events (like hover), preventing standard browser tooltips (the `title` attribute) from appearing. This hides critical context about *why* an action is unavailable from users.
**Action:** When a button is conditionally disabled for reasons that might not be obvious, wrap it in a `<span>` (e.g., `<span className="d-inline-flex" title={...} style={{ cursor: 'not-allowed' }}>`) and apply `pointerEvents: 'none'` to the disabled `<button>` itself. This allows the wrapper to catch hover events and display the tooltip effectively.

## 2026-11-01 - Skip to Main Content Link in SPA & WebView
**Learning:** In desktop SPA and WebView environments (like Tauri), relying solely on a native anchor link `<a href="#main-content">` may scroll the viewport without transferring actual DOM keyboard focus to non-interactive container elements like `<main>`. Furthermore, setting `tabIndex={-1}` on `<main>` can introduce unsightly default focus outlines across the entire viewport.
**Action:** When implementing skip-to-content links, pair the anchor with an explicit click handler that invokes `main.focus()`, set `tabIndex={-1}` with `outline: 'none'` on the target container, and use `.visually-hidden-focusable` so the bypass link remains hidden until keyboard focused.
**署名:** Palette as Antigravity


## 2026-11-02 - Toast Notifications Live Region Calibration & Disambiguation
**學習 (Learning):** In global toast systems, assigning `role="alert"` and `aria-live="assertive"` indiscriminately across all toast categories causes assistive technologies to abruptly interrupt ongoing speech upon mundane events (like routine settings saves or success notifications). Furthermore, identical generic `aria-label="Close"` buttons create severe ambiguity in screen reader element lists when multiple toasts are visible simultaneously.
**行動 (Action):** Differentiate notification urgency: use `role="status"` and `aria-live="polite"` for non-critical types (`info`, `success`), reserving `role="alert"` and `aria-live="assertive"` strictly for destructive or unexpected conditions (`danger`, `warning`). Disambiguate dismiss controls by incorporating the specific toast title into its accessible name, bind `aria-labelledby` to the header title ID, and support `Escape` key dismissal when focus is contained within the toast.
**署名:** Palette as Antigravity


## 2026-11-03 - WAI-ARIA Menu Semantics & Roving Keyboard Navigation in Header Dropdowns
**學習 (Learning):** In Halfmoon/Bootstrap dropdowns, toggling visibility classes alone leaves assistive technologies unaware that a button controls a menu, and renders items indistinguishable from unrelated document buttons. Furthermore, dismissing the dropdown without explicitly restoring focus to the trigger element causes focus loss to the document body, breaking sequential keyboard flow.
**行動 (Action):** Couple dropdown triggers with `aria-haspopup="menu"`, assign `role="menu"` to the list container, `role="menuitem"` to interactive options, and `role="separator"` to dividers. Support ArrowDown/ArrowUp cycling, Home/End boundaries, auto-focus the first item upon expansion, and reliably restore focus to the trigger button upon Escape dismissal or selection.
**署名:** Palette as Antigravity


## 2026-11-04 - Modal Dialog Focus Trap and Contextual Focus Restoration
**學習 (Learning):** Onboarding and telemetry setup dialogs often rely on naive local focus effects (e.g. focusing a close button on mount) without trapping Tab navigation or restoring focus on exit. This causes keyboard users to bleed out into background navigation during inspection, and drops focus abruptly to `document.body` upon dismissal, destroying sequential keyboard flow.
**行動 (Action):** Connect all full-viewport and floating modals to the unified `useModalFocus` hook on the `role="dialog"` container to guarantee bidirectional focus trapping, reliable Escape dismissal, and automatic focus restoration to the trigger element upon exit. Couple introductory text with `aria-describedby` and telemetry badges with `role="status"` to ensure immediate contextual awareness for assistive technologies.
**署名:** Palette as Antigravity


## 2026-11-05 - Modal Dialog Focus Trapping, Backdrop Dismissal, and Scrollable Table Region Accessibility
**學習 (Learning):** In data-dense modal dialogs (such as telemetry channel mappings), simply rendering a table inside a portal without focus management causes keyboard users to bleed out into the background page, disables Escape key dismissal, and loses focus upon exit. Moreover, when a modal contains an overflow scrollable table (`.table-responsive`), omitting `tabIndex={0}`, `role="region"`, and an explicit accessible label prevents keyboard-only users from focusing and scrolling the dataset using arrow keys. Separating the backdrop overlay from the dialog container while configuring `pointerEvents: 'none'` on the full-screen wrapper and `pointerEvents: 'auto'` on the dialog ensures seamless backdrop dismissal without blocking interactive modal elements.
**行動 (Action):** Integrate `useModalFocus` on the modal dialog container, separate clickable backdrops with `pointerEvents: 'none'` on the viewport overlay, bind `aria-labelledby` and `aria-describedby` to the header and description elements, and always expose overflow scroll containers as keyboard-focusable regions (`tabIndex={0}`, `role="region"`, and `aria-label`).
**署名:** Palette as Antigravity


## 2026-11-06 - Modal Backdrop Guarding During Async Payloads and Progress Bar Semantic ValueText
**學習 (Learning):** In critical system modals like OTA software updates, backdrop overlays and dialog wrappers must decouple pointer events (`pointerEvents: 'none'` on viewport wrapper, `pointerEvents: 'auto'` on dialog content) to allow backdrop click dismissals during idle review, while strictly suppressing backdrop dismissal during active operations (such as downloading payloads or staging application relaunch) to prevent user-initiated race conditions or accidental cancellation. Furthermore, dynamic progress bars during binary payloads require both `aria-label` and `aria-valuetext` (coupling percentage with transferred byte counts) so assistive technologies convey actionable transfer status rather than isolated numbers.
**行動 (Action):** Guard modal backdrop click handlers against active async states (`downloading`, `downloaded`), bind `aria-labelledby` and `aria-describedby` to the header and version transition elements, and always accompany animated progress bars with descriptive `aria-label` and composite byte-progress `aria-valuetext`.
**署名:** Palette as Antigravity

## 2026-11-08 - Escape Cancellation and Out-of-Range ARIA Invariants in Generic Numeric Inputs
**學習 (Learning):** In live data-entry numeric fields (such as `DecimalInput`), firing `onChange` during typing while performing clamp normalization on `blur` creates an interaction trap: pressing `Escape` to discard an accidental edit cannot simply invoke `blur()`, because the native blur event commits the dirty local text and retains clamped errors. Furthermore, postponing range feedback until blur leaves screen readers and keyboard users unaware of invalid inputs while actively typing.
**行動 (Action):** Snapshot entry values in `initialValueRef` on focus and guard blur handlers with an `isCancellingRef` flag. When `Escape` is pressed, revert external state via `onChange(initialValueRef.current)`, restore formatted local text, and safely exit without triggering blur commits. Continuously evaluate numeric text against `min`/`max` bounds to broadcast `aria-invalid` and provide accessible range semantics (`aria-valuemin`, `aria-valuemax`, `aria-valuenow`).
**署名:** Palette as Antigravity
