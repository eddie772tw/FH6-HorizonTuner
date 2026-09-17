## 2024-05-17 - Form Label Association
**Learning:** Found a pattern where labels were visually adjacent to form controls (like `<select>`) but lacked semantic programmatic association via `htmlFor` and `id`, breaking screen reader support.
**Action:** Always verify that every `<label>` element explicitly targets its corresponding form input using matching `htmlFor` and `id` attributes, rather than relying on visual proximity.
