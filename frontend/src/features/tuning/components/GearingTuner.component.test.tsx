// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { GearingTuner } from './GearingTuner';

vi.mock('../../../context/SettingsContext', () => ({
  useSettings: () => ({
    settings: { units: { speed: 'kmh' } },
    convertSpeed: (ms: number) => ({ value: ms * 3.6, label: 'km/h' }),
    t: (s: string) => s,
  }),
}));

// Mock recharts responsive container to avoid zero dimension warnings in jsdom
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 800, height: 450 }}>{children}</div>
    ),
  };
});

function setInputValue(element: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('GearingTuner ratio balance slider', () => {
  it('renders slider, adjusts FD and gears inversely, and resets back to baseline', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

    const initialTuning = {
      gearing: {
        finalDrive: 3.50,
        gears: [3.20, 2.15, 1.60, 1.25, 1.00, 0.82],
        maxRpm: 8000,
        effectiveRedline: 7200,
      },
    };

    try {
      await act(async () => {
        root.render(
          <GearingTuner
            numGears={6}
            tuning={initialTuning}
            carParams={{ maxHpRpm: 6500, maxTorqueRpm: 4500 }}
          />
        );
      });

      // 1. Locate slider
      const slider = host.querySelector<HTMLInputElement>('input[type="range"]')!;
      expect(slider).toBeDefined();
      expect(slider.value).toBe('1');

      // 2. Locate FD input and Gear 1 input
      const fdInput = host.querySelector<HTMLInputElement>('input[title="Final Drive Ratio (FD)"]')!;
      expect(fdInput.value).toBe('3.5');

      const gear1Input = host.querySelector<HTMLInputElement>('input[title="Gear 1"]')!;
      expect(gear1Input.value).toBe('3.2');

      // 3. Move slider to 1.20 (taller numerical FD, shorter numerical gears)
      await act(async () => {
        setInputValue(slider, '1.2');
      });

      // FD should now be 3.50 * 1.20 = 4.20
      expect(fdInput.value).toBe('4.2');

      // Gear 1 should now be (3.50 * 3.20) / 4.20 = 11.20 / 4.20 = 2.67
      expect(gear1Input.value).toBe('2.67');

      // Total reduction: 4.20 * 2.67 = 11.214, very close to 3.50 * 3.20 = 11.20
      const reduction = parseFloat(fdInput.value) * parseFloat(gear1Input.value);
      expect(Math.abs(reduction - 3.50 * 3.20)).toBeLessThanOrEqual(0.03);

      // 4. Reset button should be visible
      const resetButton = [...host.querySelectorAll('button')].find(b => b.textContent === 'Reset');
      expect(resetButton).toBeDefined();

      // Click reset
      await act(async () => {
        resetButton!.click();
      });

      expect(slider.value).toBe('1');
      expect(fdInput.value).toBe('3.5');
      expect(gear1Input.value).toBe('3.2');

      // 5. Entering FD manually in input box updates slider and gears
      await act(async () => {
        setInputValue(fdInput, '2.8');
      });

      // Scale should be 2.80 / 3.50 = 0.80
      expect(parseFloat(slider.value)).toBeCloseTo(0.80, 2);
      // Gear 1 should be (3.50 * 3.20) / 2.80 = 4.00
      expect(gear1Input.value).toBe('4');
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
