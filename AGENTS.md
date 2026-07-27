# Project Guidelines for AI Agents

Welcome! When working on this repository, please adhere to the following guidelines to ensure consistency, code quality, and maintainability.

## 1. Package Management & Build Tools
- **Frontend Tools:** Strictly use `pnpm` for all frontend package management operations (e.g., `pnpm install`, `pnpm run dev`, `pnpm run test`). **Never use `npm` or `yarn`.**
- **Backend Formatting & Linting:** Strictly use `ruff`.
  - Format code: `ruff format .`
  - Check formatting: `ruff format --check .`
  - Run linter: `ruff check .`
- **Backend Testing:** Run tests using `python -m pytest tests/` or simply `pytest tests/`.
- **Dependency Management:** Always seek explicit user approval before adding new dependencies to `package.json` or `requirements.txt`. Do not modify `tsconfig.json` without explicit user instruction.

## 2. Testing Expectations
- **Run Tests Locally:** Always run both frontend and backend test suites before submitting a PR.
  - Frontend: `cd frontend && pnpm run test`
  - Backend: `pytest tests/`
- **Test Coverage:** When adding or modifying calculation logic (e.g., in `frontend/src/utils/` like `tuningMath.ts`), you must add or update corresponding unit tests.
- **Verification:** Do not blindly assume changes work. Write and run tests, use Playwright if instructed for UI verifications, and run linting/formatting checks.

## 3. Pull Request Guidelines
- Branch names should follow `feature/<name>` or `fix/<name>`.
- Use the following specific PR prefixes for commit messages and PR titles:
  - `feat(i18n): ` for new language support (e.g., `feat(i18n): add fr-fr language support`).
  - `fix(i18n): ` for localization maintenance (e.g., `fix(i18n): extract UI strings and synchronize fr-fr translations`).
  - `ui: ` for UI and UX enhancement pull requests.
  - `pref: ` for performance optimization pull requests. These PR descriptions must include **What**, **Why**, **Impact**, and **Measurement**, along with inline comments explaining the code changes.
- Ensure the commit message follows Conventional Commits format if it doesn't fall into the special categories above.

## 4. UI/UX and Localization (i18n) Rules
- **No Inline Fallbacks:** Inline fallback strings within localization functions (e.g., `t('key') || 'fallback'`) are strictly prohibited in frontend components. Translations must be resolved exclusively through the `lang/` JSON files.
- **Translation Alignment:** `lang/en-us.json` is the baseline file. All other locale files must fully align their keys with `en-us.json`.
- **Accessibility (A11y):** Add ARIA labels to icon-only buttons, use `aria-current="page"` for active navigation tabs, preserve keyboard accessibility, and use visually hidden native inputs (`.sr-only`) for custom toggles.

## 5. Performance Optimization & React Best Practices
- **Recharts Animation:** When rendering large telemetry datasets with Recharts, animations should be disabled (`isAnimationActive={false}`) on all components and data points should be aggressively downsampled to prevent performance degradation.
- **Canvas Components & React.memo:** Canvas subcomponents that independently render live data outside the React state cycle (e.g., via `telemetryEmitter.addEventListener`) must be wrapped in `React.memo()` to prevent unnecessary re-evaluations from parent component rendering loops.
- **Performance Optimizations:** Optimizations should be measurable, cleanly implemented in under 50 lines, and maintain readability. If no suitable optimization can be identified or if it requires user verification, do not create a PR.

## 6. Known Environment Details
- **Backend Telemetry Port:** The Rust/Python telemetry listener uses UDP port **8000** for Forza Horizon 6.
- **Frontend Dev Server:** Typically runs on `http://localhost:1420`.
- **Vite State Ignore:** If you generate files dynamically, you must add their patterns to the `ignoredPatterns` array in `frontend/vite.config.ts` to prevent Vite from entering an uncommitted 'dirty' state.
