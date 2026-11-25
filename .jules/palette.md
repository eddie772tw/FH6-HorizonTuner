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


## 2026-11-09 - Accessible Switch Semantics, Description Binding, and Region Landmark Identification in Settings Primitives
**學習 (Learning):** In configuration panels, styling a row with `form-switch` without assigning `role="switch"` and `aria-checked` causes assistive technologies to announce options as plain checkboxes rather than stateful switches. More critically, when explanatory copy (`description`) is rendered without a dedicated DOM ID and `aria-describedby` association, keyboard and screen reader users navigating settings fields only hear the raw label and miss critical operational guidance (e.g. UDP port forward behavior or developer tuning warnings). Furthermore, unlabelled `<section>` tags are treated as generic containers in the accessibility tree, failing to expose actionable navigation landmarks.
**行動 (Action):** Explicitly equip `SettingsSwitch` with `role="switch"`, `aria-checked={checked}`, and link its description via `id={`${id}-description`}` and `aria-describedby`; associate `SettingsSection` with its header via `React.useId()` and `aria-labelledby` to expose standard region landmarks; and attach interactive `cursor: pointer` or disabled `cursor: not-allowed` along with subtle opacity states to switch rows.
**署名:** Palette as Antigravity


## 2026-11-15 - Non-Modal Anchored Dialog Popovers vs Tooltip Containers & Viewport-Aware Alignment
**學習 (Learning):** Interactive popovers anchored to status badges (such as Drag Launch Conditions in `DragTestView`) often combine three subtle traps: triggering from clickable `<div onClick>` wrappers with `<span className="badge">` excludes keyboard users; tagging an interactive popover containing a Close button with `role="tooltip"` violates ARIA semantics and blocks screen reader dialog navigation; and hardcoding `left: 0` with `min-width: 320px` on a right-aligned toolbar item pushes the popover and its close button off the right edge on desktop and beyond 320px viewports on mobile.
**行動 (Action):** Always expose interactive popover triggers as native `<button type="button">` elements with `aria-haspopup="dialog"`, `aria-expanded`, and `aria-controls`; give floating interactive cards `role="dialog"` with `aria-labelledby`, document Escape/pointerdown dismissal that restores focus to the trigger ref, and clamp popover width (`min(300px, calc(100vw - 2rem))`) with trigger-rect edge flipping (`right: 0` when space to the right is insufficient, `left: 0` on narrow left-wrapped rows).
**署名:** Palette as Antigravity


## 2026-11-16 - Polling-Safe Non-Blocking Confirmation, Escape Interception, and Dual-Theme Log Contrast
**學習 (Learning):** In Halfmoon/Bootstrap drawers backed by 1Hz polling (`DiagnosticConsole`), replacing blocking `window.confirm`/`alert` with inline confirmation and inline `role="alert"` banners exposes two subtle traps: (1) unconditional `setErrorMsg(null)` on polling success erases destructive action errors within a second, and (2) document-level `Escape` listeners in `useModalFocus` dismiss the entire drawer before local confirmation state can cancel. Additionally, hardcoded light-on-dark hex terminal colors and `.badge.bg-secondary.bg-opacity-25` (whose default `--bs-badge-color` is `#fff`) render nearly invisible on Light themes (`default`, `swiss`, `rhine-lab`).
**行動 (Action):** Use Halfmoon semantic emphasis tokens (`var(--bs-danger-text-emphasis)`, `var(--bs-warning-text-emphasis)`, `var(--bs-info-text-emphasis)`, `var(--text-primary)`) and `.text-body` on translucent log badges for dual-theme contrast; intercept `Escape` in the `window` capture phase while inline confirmation is active so it cancels confirmation and returns focus to the trigger; move focus safely to the `Cancel` button on open and to the `tabIndex={0}` `role="region"` log container after emptying logs; and avoid clearing action errors during routine log polls.
**署名:** Palette as Antigravity


## 2026-11-18 - Async Deletion Focus Restoration When Trigger Unmounts & 2-Column Mobile Toolbar Grid
**學習 (Learning):** In `AnalysisSessionToolbar`, two structural traps affect inline destructive confirmations: (1) at `<= 575.98px`, `.analysis-toolbar__actions` switches to a 2-column CSS grid and `.analysis-toolbar__actions .btn` forces `width: 100%`, so embedding a confirmation group inside `__actions` squashes prompt text and risks pointer overlap on double-click; and (2) when an async delete handler calls `selectCurrent()` before resolving (`isDeleting` is still `true`), the delete trigger unmounts and `confirmDelete` resets to `false` mid-flight—if `hadConfirmation.current` is overwritten while `isDeleting` is `true`, focus restoration never runs after `finally` and focus drops to `document.body`.
**行動 (Action):** Render the inline confirmation `role="group"` as a full-width row inside `.analysis-toolbar` (with `Cancel` focused first and `overflowWrap: "anywhere"`), early-return `if (isDeleting) return;` in the focus effect so `hadConfirmation.current` survives mid-flight selection resets, and fall back from the unmounted delete trigger ref to the persistent `Select Session` `<select>` ref.
**署名:** Palette as Antigravity


## 2026-11-20 - Always-Mounted Offcanvas Escape Collisions & Overflow Focus Ring Clipping on Toolbar Popovers
**學習 (Learning):** In this repository, `ThemeView`, `DiagnosticConsole`, and `UnitSettingsSidebar` stay mounted in `document.body` with `aria-modal="true"` and toggle `aria-hidden={!show}`. For non-modal toolbar popovers (such as the HUD paused notice in `TelemetryView`) that register document-level `Escape` handlers earlier than modal drawers, naively checking `document.querySelector('[aria-modal="true"]')` blocks `Escape` permanently because hidden always-mounted drawers still match, whereas omitting a modal guard lets background popovers steal `Escape` and focus from open drawers. Additionally, when a compact toolbar sits flush against the top of an `overflow: auto` container (`.telemetry-view`), native `:focus-visible` rings (`outline-offset: 2px`) on toolbar buttons get top-clipped across Swiss and Rhine themes and on 320px wrapped rows.
**行動 (Action):** Guard non-modal popover `Escape` handlers with `document.querySelector('[aria-modal="true"]:not([aria-hidden="true"])')` and only restore focus to the popover trigger when focus was inside the popover container; pair warning status labels with `.text-warning-emphasis` for dual-theme contrast; and preserve top breathing room (`pt-1`) on top-flush toolbars inside scrollable views so keyboard focus rings remain unclipped.
**署名:** Palette as Antigravity


## 2026-11-22 - ModalPortal Escape Propagation, Inline `background` Shorthand vs `.is-invalid`, and Self-Disabling Editor Actions
**學習 (Learning):** Inside `ModalPortal`-mounted drawers backed by `useModalFocus` (`document.addEventListener('keydown', ...)`), calling `setDraft(value)` or synthetic `event.stopPropagation()` in an input's `onKeyDown` still lets the native `Escape` event bubble from `document.body` to `document`, closing the entire drawer (`ThemeView`) instead of cancelling the dirty draft (`ColorPickerPanel`). Separately, in Halfmoon `.form-control.is-invalid` fields (`CustomCSSEditorPanel`), using inline `style={{ background: 'var(--surface-2)' }}` resets `background-image: none` and silently erases the native red `!` validation icon; and editor buttons that synchronously disable themselves on click (`Apply`, `Cancel`, `Clear Current`) drop keyboard focus to `document.body`.
**行動 (Action):** For inputs inside `ModalPortal` dialogs with Escape-to-revert, guard on `draft !== value` and call `event.preventDefault()`, `event.stopPropagation()`, and `event.nativeEvent.stopPropagation()` so the first `Escape` reverts the draft and a clean `Escape` still dismisses the dialog. Always use `backgroundColor` (never `background` shorthand) on `.form-control` inputs to preserve `.is-invalid` icons, and restore focus to the editor ref inside handlers that disable the clicked action button.
**署名:** Palette as Antigravity


## 2026-11-24 - Card-Bounded Tooltip Alignment, Modal-Aware Escape Capture, and Native Offcanvas Reduced-Motion
**學習 (Learning):** In `TelemetryView`, `.telemetry-card-shell` applies `overflow-hidden` while `.telemetry-card-shell__header` enables `flex-wrap`, and `RenderSwitch` renders inside both dashboard cards and expanded `TelemetryCardShell` `role="dialog"` modals. Hardcoding `right: 0` with `text-nowrap` and `pointer-events-none` clips tooltips when wrapped or on 320px viewports and violates WCAG 1.4.13 (not hoverable, not Escape-dismissible). Additionally, attaching inline `transition: 'transform 0.3s ...'` on `UnitSettingsSidebar` overrides Halfmoon's `@media (prefers-reduced-motion: reduce)` `.offcanvas { transition: none }` rule, whereas omitting `inert={!show}` leaves off-screen controls reachable if CSS visibility lags. Also note `TelemetryView.a11y.test.tsx` queries `button[aria-haspopup="dialog"]` exclusively for the HUD paused popover trigger.
**行動 (Action):** Align card tooltips relative to `.telemetry-card-shell` horizontal bounds, wrap them in a non-gapped hover-bridge container without `pointer-events-none` or `text-nowrap`, and capture `Escape` on `window` only when the topmost `[aria-modal="true"]:not([aria-hidden="true"])` either does not exist or contains the tooltip. On persistent `.offcanvas` drawers like `UnitSettingsSidebar`, omit inline `transition` overrides, enforce `inert={!show}`, use `aria-expanded` + `aria-controls` on drawer triggers, and omit redundant `aria-describedby` when `role="tooltip"` text matches the switch's `aria-label`.
**署名:** Palette as Antigravity


## 2026-11-26 - Separating Live-Region Announcements from 1Hz Countdown Timers and Dual-Theme Warning Contrast in Companion Settings
**學習 (Learning):** Wrapping a 1-second `setInterval` countdown container (`.companion-lan-pairing`) with `role="status"` causes assistive technologies to re-announce the entire host name, timer, pairing code, QR alt text, and IP list every second until expiry. Separately, using Bootstrap `.text-warning` for inline status/recovery copy in `CompanionUsbControls` and `CompanionLanControls` renders bright yellow text on white cards across Light themes (`default`, `swiss`, `rhine-lab`), failing WCAG 1.4.3 contrast, while placing `title` directly on disabled `Stop ADB daemon` buttons swallows hover tooltips and omitting `flex-wrap` crushes action buttons on 320px viewports.
**行動 (Action):** Keep ticking countdowns passive (`role="timer" aria-live="off"`) and pair them with a persistent `.visually-hidden[role="status"][aria-live="polite"]` element whose text is derived from immutable pairing metadata (`token` + initial `expires_in_secs`) so creation announces once without 1Hz spam. Use Halfmoon `.text-warning-emphasis` for all inline warning copy across Light/Dark themes, wire `<select>` controls to recovery notices via `id`/`<label htmlFor>`/`aria-describedby`, wrap disabled async buttons in `title`-bearing `<span>` wrappers with `pointerEvents: 'none'` plus `aria-busy` and decorative `.spinner-border.spinner-border-sm[aria-hidden="true"]`, and include `flex-wrap` on action rows for 320px viewports.
**署名:** Palette as Antigravity
