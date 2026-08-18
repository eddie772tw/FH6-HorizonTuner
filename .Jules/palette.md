## 2023-10-27 - Full row labels for checkboxes
**Learning:** For settings pages with checkboxes and descriptive text, wrapping the entire row in a `<label>` tag (and changing any inner title from `<label>` to `<div>` to avoid nesting) significantly increases the clickable hit area, making toggling much easier and more accessible.
**Action:** Always wrap the entire settings row (checkbox + text) in a single `<label>` element with a pointer cursor.
