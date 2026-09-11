# FH6-HorizonTuner E2E Test Infrastructure & Specification

## 1. Test Philosophy & Architecture

### 1.1 Opaque-Box & Requirement-Driven Philosophy
The FH6-HorizonTuner End-to-End (E2E) Test Suite is designed from the ground up as an **opaque-box, requirement-driven verification system**. Rather than inspecting internal class states or private module variables, all tests interact exclusively with public contracts:
1. **Public HTTP REST APIs**: `/api/road/...`, `/api/offroad/...`, `/api/drag/...`, `/api/drift/...` following `PROJECT.md § Interface Contracts`.
2. **AI Agent CLI Commands**: `fh6-agent.bat` / `python -m backend.agent_cli` (`solve`, `cars`, `preset`, `telemetry`, `status`).
3. **Wire-Level UDP Binary Packets**: 324-byte little-endian Forza Data Out telemetry streams adhering to `telemetry-udp-protocol`.
4. **Durable Storage Schemas**: Standard SQLite `workflow_documents` table (`id`, `discipline`, `workflow_id`, `kind`, `created_at`, `document`).

### 1.2 Core Invariants Enforced
- **Pure Math SSOT**: Physics calculations remain pure functions without seasonal modifiers or arbitrary offsets.
- **60Hz UDP Non-Blocking Loop**: Telemetry ingestion and stream parsing perform zero synchronous file I/O or network calls.
- **Strict Path Security**: Presets and session exports strictly validate path traversal via `safe_resolve_path` and `safe_join_under_dir`.
- **Zero Emoji Governance**: UI strings, dropdown items, and report summaries contain zero decorative emojis.
- **No Fabricated Causal Metrics**: Drift and multi-discipline debriefs present objective kinematic facts and explicitly disclose unknowns without inventing fake scores.

### 1.3 Test Suite Layout
```
tests/e2e/
├── __init__.py
├── conftest.py                     # Pytest fixtures and binary stream generators
├── harness.py                      # Opaque HTTP client, store, and workflow simulator
├── test_tier1_features.py          # Tier 1: Feature Coverage (75 tests, Features 1-15)
├── test_tier2_boundaries.py        # Tier 2: Boundary & Corner Cases (75 tests)
├── test_tier3_combinations.py      # Tier 3: Pairwise Cross-Feature Interactions (12 tests)
├── test_tier4_scenarios.py         # Tier 4: Real-World Race Simulation Scenarios (5 tests)
└── e2e_runner.py                   # Standalone CLI runner with JSON reporting
```

---

## 2. Feature Inventory Mapping

| # | Feature Name | Tier 1 (Coverage) | Tier 2 (Boundaries) | Tier 3 (Combinations) | Tier 4 (Scenarios) |
|---|--------------|-------------------|---------------------|-----------------------|-------------------|
| 1 | Domain Baseline Pure Math SSOT | F1-T1 to F1-T5 (5) | F1-B1 to F1-B5 (5) | T3-09 | S01, S02, S03 |
| 2 | Offroad Dynamic Telemetry Extraction | F2-T1 to F2-T5 (5) | F2-B1 to F2-B5 (5) | T3-01, T3-02 | S01, S05 |
| 3 | Offroad A/B Comparison & Analysis | F3-T1 to F3-T5 (5) | F3-B1 to F3-B5 (5) | T3-01 | S01 |
| 4 | Offroad Snapshot Persistence & APIs | F4-T1 to F4-T5 (5) | F4-B1 to F4-B5 (5) | T3-02, T3-07, T3-10 | S01, S04 |
| 5 | Offroad Frontend Modular Workflow UI | F5-T1 to F5-T5 (5) | F5-B1 to F5-B5 (5) | T3-10 | S01 |
| 6 | Drag Dynamic Telemetry Extraction | F6-T1 to F6-T5 (5) | F6-B1 to F6-B5 (5) | T3-03 | S02 |
| 7 | Drag A/B Comparison & Analysis | F7-T1 to F7-T5 (5) | F7-B1 to F7-B5 (5) | T3-03, T3-04 | S02 |
| 8 | Drag Snapshot Persistence & APIs | F8-T1 to F8-T5 (5) | F8-B1 to F8-B5 (5) | T3-04, T3-07, T3-10 | S02, S04 |
| 9 | Drag Frontend Modular Workflow UI | F9-T1 to F9-T5 (5) | F9-B1 to F9-B5 (5) | T3-10 | S02 |
| 10 | Drift Dynamic Telemetry Extraction | F10-T1 to F10-T5 (5) | F10-B1 to F10-B5 (5) | T3-05 | S03 |
| 11 | Drift A/B Comparison & Disclosures | F11-T1 to F11-T5 (5) | F11-B1 to F11-B5 (5) | T3-05, T3-06 | S03 |
| 12 | Drift Snapshot Persistence & APIs | F12-T1 to F12-T5 (5) | F12-B1 to F12-B5 (5) | T3-06, T3-07, T3-10 | S03, S04 |
| 13 | Drift Frontend Modular Workflow UI | F13-T1 to F13-T5 (5) | F13-B1 to F13-B5 (5) | T3-10 | S03 |
| 14 | Global Tuning Entry & Mode Switching | F14-T1 to F14-T5 (5) | F14-B1 to F14-B5 (5) | T3-07, T3-08 | S04 |
| 15 | Navigation Integration & UI Governance | F15-T1 to F15-T5 (5) | F15-B1 to F15-B5 (5) | T3-08, T3-11, T3-12 | S04, S05 |
| **Total** | | **75 Tests** | **75 Tests** | **12 Tests** | **5 Tests** |

**Grand Total: 167 Comprehensive E2E Tests**

---

## 3. Tier 1-4 Test Scenario Catalog & Thresholds

### Tier 1: Feature Coverage (75 Tests)
- **Feature 1**: Verifies baseline calculations for Road, Rally, Drag, and Drift. Asserts neutral season delta P = 0, AWD/RWD/FWD differential logic, stiff rear springs for Drag, softened bump compliance for Rally, and oversteer bias for Drift.
- **Feature 2**: Verifies detection of travel >= 0.95 (near-compression) and travel >= 0.98 (severe bottoming), absolute travel in mm, surface rumble RMS, and vertical landing G shock.
- **Feature 3**: Verifies A/B comparison conclusions: `provisional-keep` (bottoming reduced), `candidate-slower` (bottoming increased), time deltas in sprint/circuit modes, and `insufficient-data` guards.
- **Feature 4**: Verifies offroad workflow lifecycle via REST API: `POST /api/offroad/workflows`, setup snapshot A generation, run recording, finish confirmation, and decision promotion.
- **Feature 5**: Verifies 4-stage UI lifecycle contract, neutral baseline builder, single-variable candidate step, zero emojis, and unknown conditions disclosure.
- **Feature 6**: Verifies drag launch slip ratio, wheelspin duration (>0.20 slip), 0-100 km/h, 0-200 km/h, and 0-400m time and trap speed.
- **Feature 7**: Verifies single-variable drag A/B comparisons (gearing time reduction, launch wheelspin penalty, trap speed gains, and comparability guards).
- **Feature 8**: Verifies drag document creation, setup snapshots, run summaries, and comparison persistence.
- **Feature 9**: Verifies monolith replacement, emoji removal audit, Halfmoon CSS variable compliance, and component length governance (<250 lines).
- **Feature 10**: Verifies sideslip angle $\beta$, slip angle distribution, sustained slide duration ($|\beta| > 15^\circ$), rear wheelspin ratio, and tire thermal rise in °C.
- **Feature 11**: Verifies kinematic slide stability comparison, strict assertion of `fabricatedScore is None`, mandatory limitations disclosures, and descriptive tradeoffs.
- **Feature 12**: Verifies drift workflow lifecycle, baseline persistence, candidate debrief documents, and schema versioning.
- **Feature 13**: Verifies drift 4-stage UI contract, objective kinematics display, limitations card, zero emojis, and glassmorphism styling.
- **Feature 14**: Verifies 2D selector state model (4 disciplines $\times$ 2 modes), independent localStorage workflow ID retention, and cross-discipline state isolation.
- **Feature 15**: Verifies navigation dropdown entries, downward popover anchor, Halfmoon design tokens, zero emoji audit, and 60Hz UDP loop non-blocking invariants.

### Tier 2: Boundary & Corner Cases (75 Tests)
- Zero/null/negative vehicle weights and bias percentages.
- Exactly 0.0 travel, 1.0 travel (mechanical bump stop), and 0.95/0.98 edge conditions.
- Extreme vertical deceleration shocks (-50.0 m/s², ~5.1G).
- Single-frame runs, empty telemetry streams, and zero time differences.
- SQL injection attempts in workflow IDs and document keys.
- Max PI boundary (9999) and negative slider values.
- Stalled launches (0 km/h), full burnout slip (1.0), and short runs not reaching 100 km/h or 400m.
- Sub-millisecond timing noise (<0.05s) triggering `difference-insufficient`.
- Division-by-zero defenses in sideslip angle $\beta$ at zero speed.
- 180° spinout angles and negative tire temperatures in °F.
- Path traversal defenses (`../`, `..\`, null bytes `\0`).
- Disallowed port collisions (UDP 8000 vs HTTP 8001).

### Tier 3: Cross-Feature Combinations (12 Tests)
- **T3-01**: Offroad Sprint vs Circuit $\times$ Extreme bottoming detection.
- **T3-02**: Offroad bottoming detection $\times$ SQLite snapshot persistence roundtrip.
- **T3-03**: Drag launch slip $\times$ gear shifts $\times$ 400m sprint timing.
- **T3-04**: Drag gearing iteration $\times$ SQLite snapshot persistence.
- **T3-05**: Drift kinematic slide $\times$ thermal variance degradation.
- **T3-06**: Drift transparent limitation disclosure $\times$ SQLite persistence.
- **T3-07**: Multi-discipline switching $\times$ concurrent state preservation in SQLite.
- **T3-08**: Global navigation dropdown $\times$ 2D mode switching.
- **T3-09**: Pure math SSOT $\times$ discipline baseline extraction across Road, Rally, Drag, Drift.
- **T3-10**: Frontend modular UI contract $\times$ Backend REST API schema validation.
- **T3-11**: High-frequency UDP ingestion (60Hz) $\times$ concurrent REST API polling without blocking.
- **T3-12**: Safe path security defense $\times$ document and preset persistence.

### Tier 4: Real-World Application Scenarios (5 Tests)
- **S01**: Complete Offroad Rally Stage Tuning Loop (A/B bottoming reduction & candidate promotion).
- **S02**: Complete Drag Strip 0-400m Launch & Gearing Optimization Loop.
- **S03**: Complete Drift Session with Transparent Disclosures and Zero Fabricated Scores.
- **S04**: Multi-Discipline Round-Robin Tuning with Isolated Concurrent States.
- **S05**: Adversarial Noise, Sensor Jitter, Reconnection, and Extreme Sensor Shock Handling.

---

## 4. How to Run the Tests

### 4.1 Pytest Command (Standard Verification)
```bash
uv run --no-project --python .venv\Scripts\python.exe python -m pytest tests/e2e/
```

### 4.2 Standalone E2E Runner (Rich Console / JSON Reporting)
```bash
# Run all tiers with human-readable summary
uv run --no-project --python .venv\Scripts\python.exe tests/e2e/e2e_runner.py

# Run a specific tier (e.g. Tier 1)
uv run --no-project --python .venv\Scripts\python.exe tests/e2e/e2e_runner.py --tier 1

# Output machine-readable JSON for orchestration agents
uv run --no-project --python .venv\Scripts\python.exe tests/e2e/e2e_runner.py --json
```

### 4.3 Static Code Analysis & Formatting Checks
```bash
uv run --no-project --python .venv\Scripts\python.exe ruff check tests/e2e/
uv run --no-project --python .venv\Scripts\python.exe ruff format --check tests/e2e/
```
