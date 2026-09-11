# Project: FH6-HorizonTuner Multi-Discipline Tuning Workflow Extension

## Architecture
FH6-HorizonTuner provides verified, closed-loop telemetry-driven tuning. This project extends the proven Road racing tuning workflow (quick prep, neutral/no-season formula decoupling, A/B baseline comparison, telemetry persistence, post-race descriptive reports, single-variable iteration) to Offroad/Rally, Drag, and Drift disciplines.

### Architecture Boundaries & Invariants:
1. **SSOT Physics Math**: All chassis, tire, suspension, and gearing baseline calculations remain pure functions in `frontend/src/utils/tuningMath.ts`.
2. **60Hz UDP Non-Blocking Loop**: Ingestion in `backend/telemetry_listener.py` and queue routing in `broadcast_telemetry()` must NEVER execute synchronous disk I/O or blocking network calls.
3. **Safe Path Traversal Defense**: All file access endpoints must use `backend/path_security.py` (`safe_resolve_path` and `safe_join_under_dir`).
4. **Halfmoon Design System**: All UI follows Halfmoon CSS v2 glassmorphism tokens, zero layout-shift popovers, `ModalPortal` mounting, and zero emojis in UI strings.
5. **No Fabricated Causal Metrics**: For Drift (and all disciplines), never fabricate unverified composite scores or causal models when telemetry provides descriptive kinematic facts.

### Data Flow & Component Model
```
Forza UDP (8000) ──> telemetry_listener (fast unpack) ──> telemetry_queue
                                                                 │
                                    ┌────────────────────────────┼────────────────────────────┐
                                    ▼                            ▼                            ▼
                           road_service.observe      offroad_service.observe        drag_service.observe
                                    │                            │                            │
                                    └────────────────────────────┼────────────────────────────┘
                                                                 ▼
                                                        workflow_store (SQLite)
                                                                 ▲
                                                                 │ HTTP API (8001)
                                                                 ▼
                                            Frontend: TuningWorkspace (2D Selector)
                                    ┌───────────────────┬───────────────┬──────────────────┐
                                    ▼                   ▼               ▼                  ▼
                             features/road      features/offroad  features/drag     features/drift
```

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Domain Baseline Pure Math SSOT | `calculateDomainBaselineGroup` in `tuningMath.ts` supporting Road, Rally, Drag, Drift without seasonal lock | M1 | Survey 1 |
| 2 | Offroad Dynamic Telemetry Extraction | Extract near-compression / severe bottoming (travel >= 0.95 & >= 0.98), absolute travel mm, surface rumble RMS, and landing impact G | M1 | Survey 1, 2 |
| 3 | Offroad A/B Comparison & Analysis | Descriptive comparison of bottoming reduction, event times, and terrain compliance across sprint & circuit modes | M1 | Survey 1, 2 |
| 4 | Offroad Snapshot Persistence & APIs | Append-only SQLite document storage, workflow lifecycle routes, and session persistence | M1 | Survey 2 |
| 5 | Offroad Frontend Modular Workflow UI | 4-stage UI in `features/offroad/`: Prepare, BaselineBuilder, RunPanel, Observation, Candidate, Compare, ReportCard, LocalDetails | M1 | Survey 3 |
| 6 | Drag Dynamic Telemetry Extraction | Launch slip ratio & wheelspin duration, per-gear acceleration curves, shift delay & power interruption, 0-100 / 0-200 km/h, 0-400m time and trap speed | M2 | Survey 1, 2 |
| 7 | Drag A/B Comparison & Analysis | Single-variable A/B comparison for launch traction, gearing, and rear damping stiffness with sprint timing deltas | M2 | Survey 1, 2 |
| 8 | Drag Snapshot Persistence & APIs | Workflow store integration for drag runs, snapshots, and comparison reports | M2 | Survey 2 |
| 9 | Drag Frontend Modular Workflow UI | 4-stage UI in `features/drag/` replacing legacy monolithic `DragTestView.tsx`, removing emojis and using Halfmoon tokens | M2 | Survey 3 |
| 10 | Drift Dynamic Telemetry Extraction | Sideslip angle beta, tire slip angle distributions, sustained slide duration, rear wheelspin ratio, and yaw rate | M3 | Survey 1, 2 |
| 11 | Drift A/B Comparison & Limitations Disclosure | Objective comparison of kinematic stability, thermal degradation, with mandatory disclosure of unmodeled variables and zero fabricated scores | M3 | Survey 1, 2 |
| 12 | Drift Snapshot Persistence & APIs | Workflow store integration for drift runs, baselines, and candidate debriefs | M3 | Survey 2 |
| 13 | Drift Frontend Modular Workflow UI | 4-stage UI in `features/drift/`: Prepare, BaselineBuilder, RunPanel, Observation, Candidate, Compare, ReportCard | M3 | Survey 3 |
| 14 | Global Tuning Entry & Mode Switching | `TuningWorkspace.tsx` 2D switcher (Road, Offroad, Drag, Drift x Assistant vs Detailed) with isolated localStorage states | M4 | Survey 3 |
| 15 | Navigation Integration & UI Governance | `Navigation.tsx` dropdown updates, zero layout-shift popovers, Halfmoon tokens, and emoji cleanup verification | M4 | Survey 3 |
| 16 | E2E Test Infrastructure & Test Cases (Tiers 1-4) | Opaque-box requirement-driven test suite with >=5 tests per feature, BVA boundaries, pairwise combinations, and real-world scenarios | E2E Track | ORIGINAL_REQUEST |
| 17 | Final E2E Test Pass & Adversarial Hardening | 100% pass on all E2E tests, followed by Tier 5 white-box adversarial stress testing | M5 | ORIGINAL_REQUEST |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E | E2E Testing Suite Track | Design and implement opaque-box test runner and Tiers 1-4 test cases; publish TEST_READY.md | none | DONE |
| M1 | Offroad/Rally Tuning Workflow Adaptation | Features 1, 2, 3, 4, 5 (Backend analysis, comparison, APIs, Frontend features/offroad, tuningMath pure functions, unit tests) | none | DONE |
| M2 | Drag Tuning Workflow Adaptation | Features 6, 7, 8, 9 (Backend analysis, comparison, APIs, Frontend features/drag, 0-100 / 0-400m metrics, shift delay, emoji removal) | none | DONE |
| M3 | Drift Tuning Workflow Alignment | Features 10, 11, 12, 13 (Backend analysis, comparison, APIs, Frontend features/drift, objective kinematics, transparent limitations) | none | DONE |
| M4 | Global Tuning Entry & Architecture Integration | Features 14, 15 (TuningWorkspace 2D switcher, Navigation dropdown, localStorage isolation, security/60Hz verification) | M1, M2, M3 | DONE |
| M5 | Final E2E Pass & Adversarial Hardening | Feature 17 (100% pass on E2E test suite Tiers 1-4, followed by Tier 5 white-box adversarial stress testing) | M4, E2E | DONE |

## Interface Contracts

### 1. `tuningMath.ts` ↔ Frontend Workflows
```typescript
export type TuningDiscipline = 'Road' | 'Rally' | 'Drag' | 'Drift';

export function calculateDomainBaselineGroup(
  discipline: TuningDiscipline,
  group: string,
  inputs: Partial<TuningCarParams> & { numGears?: number },
  engine: WorkflowEngineInput | null
): Record<string, RoadFormulaValue> | null;

export function calculateRoadBaselineGroup(
  group: string,
  inputs: Partial<TuningCarParams> & { numGears?: number },
  engine: WorkflowEngineInput | null
): Record<string, RoadFormulaValue> | null;
```

### 2. Backend Discipline Services ↔ `workflow_store.py`
All disciplines share the SQLite snapshot document structure:
```sql
CREATE TABLE IF NOT EXISTS workflow_documents (
  id TEXT PRIMARY KEY,
  discipline TEXT NOT NULL,       -- 'road', 'offroad', 'drag', 'drift'
  workflow_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at REAL NOT NULL,
  document TEXT NOT NULL
);
```

### 3. Backend API ↔ Frontend Workflows
Endpoints partitioned or parametrized by discipline:
- `POST /api/{discipline}/workflow/new`
- `GET /api/{discipline}/workflow/{id}`
- `POST /api/{discipline}/run/start`
- `POST /api/{discipline}/run/stop`
- `POST /api/{discipline}/candidate`
- `POST /api/{discipline}/compare`
- `GET /api/{discipline}/live`

### 4. Global Workspace ↔ Discipline Sub-Workflows
`TuningWorkspace.tsx` manages:
- Selected Discipline: `'tuning-active-discipline'` ('road' | 'offroad' | 'drag' | 'drift')
- Selected Mode: `'tuning-active-mode'` ('workflow' | 'detailed')
- Independent workflow IDs: `'road-selected-workflow'`, `'offroad-selected-workflow'`, `'drag-selected-workflow'`, `'drift-selected-workflow'`

## Code Layout
```
frontend/src/
├── utils/
│   ├── tuningMath.ts                       # SSOT Pure Functions
│   └── tuningMath.test.ts
├── features/
│   ├── road/                               # Road baseline (untouched)
│   ├── offroad/                            # M1: Offroad workflow UI & hooks
│   ├── drag/                               # M2: Drag workflow UI & hooks
│   ├── drift/                              # M3: Drift workflow UI & hooks
│   └── tuning/
│       └── TuningWorkspace.tsx             # M4: 2D selector workspace
└── components/
    └── Navigation.tsx                      # M4: Global nav entries

backend/
├── telemetry_listener.py                   # 60Hz UDP loop (zero sync I/O)
├── path_security.py                        # Path traversal security
├── road_store.py / workflow_store.py       # Append-only snapshot store
├── offroad_analysis.py, offroad_comparison.py, offroad_models.py, offroad_service.py
├── drag_analysis.py, drag_comparison.py, drag_models.py, drag_service.py
├── drift_analysis.py, drift_comparison.py, drift_models.py, drift_service.py
└── app.py / main.py                        # API route registration

tests/
├── test_telemetry_listener.py
├── test_road_workflow.py
├── test_offroad_workflow.py
├── test_drag_workflow.py
├── test_drift_workflow.py
└── e2e/                                    # E2E test suite (Tiers 1-4)
```
