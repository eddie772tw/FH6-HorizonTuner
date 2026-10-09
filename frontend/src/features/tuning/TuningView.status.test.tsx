// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { TuningViewContent } from './TuningView';
import type { UnitPreferenceOverride } from '../../utils/gameUnitSettings';
const session = vi.hoisted(() => ({ calculationStatus: 'pending', result: null, profile: { weight: 1300, weight_distribution: 54 }, engine: {}, workflow: { step: 2, goal: 'Road', season: 'Summer', reviewHistory: false, setStep: vi.fn(), setGoal: vi.fn(), setSeason: vi.fn(), setReviewHistory: vi.fn() } }));
vi.mock('./TuneSessionProvider', () => ({ useTuneSession: () => session }));
vi.mock('../../context/CarParamsContext', () => ({ useCarParams: () => ({ carId: '1', carName: 'Test car', carParams: session.profile, setCarParams: vi.fn(), saveCarParams: vi.fn() }) }));
vi.mock('../../context/SettingsContext', () => ({ useSettings: () => ({ t: (s: string) => s }), ScopedUnitSettingsProvider: () => null }));
vi.mock('../../components/UnitSettingsSidebar', () => ({ UnitSettingsSidebar: () => null }));
vi.mock('../road/RoadWorkflowView', () => ({ RoadWorkflowView: () => null }));
vi.mock('./components/Step1GoalSetup', () => ({ Step1GoalSetup: () => null }));
vi.mock('./components/Step2ChassisTuner', () => ({ Step2ChassisTuner: () => <div>Missing vehicle inputs</div> }));
vi.mock('./components/SetupVerificationStep', () => ({ SetupVerificationStep: () => <div>Missing engine and gearing inputs</div> }));
vi.mock('./components/EngineDataStep', () => ({ EngineDataStep: () => null }));
vi.mock('./components/EvPowertrainStep', () => ({ EvPowertrainStep: () => null }));
vi.mock('./components/WorkflowGuide', () => ({ WorkflowGuide: () => null }));
vi.mock('./components/BaselinePreviewPanel', () => ({ BaselinePreviewPanel: () => null }));
it('keeps Steps 2 and 4 on request status rather than missing-input panels while pending or failed', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div'); const root = createRoot(host);
  try {
    for (const step of [2, 4]) for (const status of ['pending', 'error']) {
      session.workflow.step = step; session.calculationStatus = status;
      await act(async () => root.render(<TuningViewContent unitPreference={{ followGlobal: true } as UnitPreferenceOverride} onUnitPreferenceChange={() => {}} />));
      expect(host.textContent).toContain(status === 'pending' ? 'Calculating tuning results…' : 'Tuning calculation is unavailable. Retrying…');
      expect(host.textContent).not.toContain('Missing vehicle inputs');
      expect(host.textContent).not.toContain('Missing engine and gearing inputs');
    }
  } finally { await act(async () => root.unmount()); }
});
