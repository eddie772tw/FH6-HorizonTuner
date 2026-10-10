// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { CarParams } from '../../context/CarParamsContext';
import CompanionTuning from './CompanionTuning';
import type { CompanionState } from './companionProtocol';

vi.mock('../../context/SettingsContext', () => ({
  useSettings: () => ({ t: (key: string) => key.startsWith('companion.sections.') ? key.replace('companion.sections.', '') : key }),
}));
const unavailable = 'CVT recommendations are unavailable pending real capture and solver validation.';
function state(cvt: boolean): CompanionState {
  return {
    hostOnline: true, revision: 1, commands: [], snapshot: {
      carId: '42', carName: 'Synthetic fixture', profileKey: 'synthetic-only',
      profile: { weight: 1200, weight_distribution: 50, maxHp: 250,
        ...(cvt ? { transmission: { type: 'cvt', capability: 'final-drive-only' } } : {}) } as CarParams,
      workflow: { step: 3, goal: 'Road', season: 'Summer' },
      results: { chassis: null, alignment: null, gearing: null },
      engine: { phase: 'idle', sampleCount: 0, state: null },
      readiness: { mechanical: true, engineInputs: true, measuredEngine: false, gearingAvailable: false },
      calculationStatus: 'ready',
    },
  };
}
it('keeps Engine navigation attached to its mounted section for discrete and CVT profiles', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  host.className = 'companion-content'; document.body.append(host);
  const root = createRoot(host);
  const onCommand = vi.fn(async () => true);
  try {
    for (const cvt of [false, true]) {
      await act(async () => root.render(<CompanionTuning state={state(cvt)} disabled={false} onCommand={onCommand} />));
      const target = host.querySelector<HTMLElement>('#companion-engine');
      expect(target).not.toBeNull();
      const scroll = vi.fn(); target!.scrollIntoView = scroll;
      const button = Array.from(host.querySelectorAll('nav button')).find(node => node.textContent === 'Engine')!;
      await act(async () => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
      expect(scroll).toHaveBeenCalledExactlyOnceWith({ behavior: 'smooth', block: 'start' });
      expect(button.getAttribute('aria-current')).toBe('location');
      expect(target!.textContent).toContain(cvt ? unavailable : 'Engine measurement');
    }
    expect(onCommand).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); host.remove(); }
});
it('keeps CVT gearing unavailable guidance consistent without requesting an ICE measurement', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<CompanionTuning state={state(false)} disabled={false} onCommand={async () => true} />));
    expect(host.querySelector('#companion-gearing')!.textContent).toContain('Complete a valid engine measurement');
    for (const gearing of [null, { finalDrive: 3.5, gears: [3, 2, 1] }]) {
      const cvt = state(true); cvt.snapshot!.results.gearing = gearing;
      await act(async () => root.render(<CompanionTuning state={cvt} disabled={false} onCommand={async () => true} />));
      expect(host.querySelector('#companion-gearing')!.textContent).toContain(unavailable);
      expect(host.querySelector('#companion-gearing')!.textContent).not.toContain('Final drive');
      expect(host.textContent).not.toContain('Complete a valid engine measurement');
      expect(host.querySelector('#companion-engine')!.querySelector('button')).toBeNull();
    }
  } finally { await act(async () => root.unmount()); host.remove(); }
});
