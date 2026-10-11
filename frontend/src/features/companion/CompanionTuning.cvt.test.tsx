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
it.each([false, true])('navigates mounted sections without discarding draft or measurement state (CVT: %s)', async cvt => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  host.className = 'companion-content'; document.body.append(host);
  const root = createRoot(host);
  const onCommand = vi.fn(async () => true);
  try {
    const snapshot = state(cvt);
    snapshot.snapshot!.engine = { phase: 'collecting', sampleCount: 41, state: null };
    await act(async () => root.render(<CompanionTuning state={snapshot} disabled={false} onCommand={onCommand} />));
    const nav = host.querySelector('nav')!;
    expect(nav.getAttribute('role')).toBeNull();
    const buttons = Array.from(nav.querySelectorAll('button'));
    const sections = ['setup', 'chassis', 'alignment', 'engine', 'gearing'].map(id => host.querySelector<HTMLElement>(`#companion-${id}`)!);
    const measurement = sections[3].textContent;
    expect(measurement).toContain(cvt ? unavailable : 'Engine measurement');
    if (!cvt) {
      expect(measurement).toContain('collecting');
      expect(measurement).toContain('41');
    }
    const weight = host.querySelector<HTMLInputElement>('input')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(weight, '1555');
      weight.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const disabledSteps = Array.from(host.querySelectorAll('select option:disabled')).map(option => option.textContent);
    for (const [index, button] of buttons.entries()) {
      expect(button.getAttribute('role')).toBeNull();
      expect(button.tabIndex).toBe(0);
      const scroll = vi.fn(); sections[index].scrollIntoView = scroll;
      button.focus();
      await act(async () => button.click());
      expect(scroll).toHaveBeenCalledExactlyOnceWith({ behavior: 'smooth', block: 'start' });
      expect(document.activeElement).toBe(button);
      expect(button.getAttribute('aria-current')).toBe('location');
      expect(buttons.filter(node => node.getAttribute('aria-current') === 'location')).toEqual([button]);
      expect(nav.querySelector('[aria-selected]')).toBeNull();
      for (const section of sections) {
        expect(host.querySelector(`#${section.id}`)).toBe(section);
        expect(section.hidden).toBe(false);
      }
      expect(host.querySelector('input')).toBe(weight);
      expect(weight.value).toBe('1555');
      expect(host.textContent).toContain('Unsaved draft');
      expect(sections[3].textContent).toBe(measurement);
      expect(Array.from(host.querySelectorAll('select option:disabled')).map(option => option.textContent)).toEqual(disabledSteps);
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
