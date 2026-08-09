1. **Optimize DOM queries in `hud_overlay/shared/telemetry-cards/corner-card.js`**
   - The `renderCorners` function is called 60 times a second for all 4 corners and contains numerous `document.getElementById` calls.
   - We will cache these elements in `manager.js`'s `this.domCache` inside the `corners[tag]` sub-object during initialization.
   - We will pass `domCache` from `manager.js` to `renderCorners` and use it to retrieve the DOM elements instead of querying the DOM repeatedly.
   - *Note: I have already implemented the changes in a test script to confirm this works, but I will formally structure it here.*
2. **Review performance impact**
   - This optimization reduces `document.getElementById` calls from ~44 per frame (60Hz) to 0 in `renderCorners`, significantly reducing garbage collection pressure and CPU usage per the codebase rules.
3. **Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.**
   - Run linter/formatting on backend Python files (if any).
   - Ensure HUD changes work correctly by running a local test server.
4. **Submit changes**
   - Submit PR with prefix `pref:` and the required template (What, Why, Impact, Measurement).
