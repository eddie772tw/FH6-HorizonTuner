## 2024-11-20 - Ensure accurate mapping for automated accessibility injection
**Learning:** When automating the addition of `aria-label` tags, naive regex scanning can incorrectly map labels (e.g. assigning a previous label to the wrong input because of unexpected structural skips in JSX). Factually incorrect `aria-label`s actively degrade the UX for visually impaired users.
**Action:** When creating text replacement scripts for accessibility features, explicitly define exact mappings or tightly couple the replacement bounds to avoid misassigning labels.
