
## 2026-08-29 - Add Tooltips to Disabled Buttons
**Learning:** Users cannot read tooltips on disabled elements because disabled inputs swallow pointer events, leaving users confused about why an action is blocked.
**Action:** Wrap the disabled button in a `<span>` with a `title` attribute, `display: inline-block`, and `cursor: not-allowed`. Apply `pointerEvents: 'none'` to the button itself so the wrapper handles the hover event.
