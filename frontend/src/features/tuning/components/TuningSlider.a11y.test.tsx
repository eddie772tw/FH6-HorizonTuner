// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { it, expect, vi } from 'vitest';
import { TuningSlider } from './TuningSlider';

vi.mock('../../../context/SettingsContext', () => ({ useSettings: () => ({ t: (x: string) => x }) }));

it('exposes accessible names, valuetext with units, and keyboard escape reset', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const updateSection = vi.fn();
  await act(async () => {
    root.render(
      <TuningSlider
        label="Front Tire Pressure" value={2.15} min={1.0} max={4.0} step={0.01}
        unitType="pressure" section="tires" field="front" updateSection={updateSection}
        convertToUI={(v: number) => v} convertFromUI={(v: number) => v} getUnitLabel={() => 'bar'}
      />
    );
  });
  const num = host.querySelector<HTMLInputElement>('input[type="number"]')!;
  const rng = host.querySelector<HTMLInputElement>('input[type="range"]')!;
  expect(num.getAttribute('aria-label')).toBe('Front Tire Pressure (bar)');
  expect(host.querySelector<HTMLLabelElement>('label')?.htmlFor).toBe(num.id);
  expect(rng.getAttribute('aria-label')).toBe('Front Tire Pressure');
  expect(rng.getAttribute('aria-valuetext')).toBe('2.15 bar');
  expect(rng.getAttribute('aria-valuenow')).toBe('2.15');

  await act(async () => {
    num.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(num, '3.50');
    num.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(num.value).toBe('3.50');
  await act(async () => { num.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  expect(num.value).toBe('2.15');
  expect(updateSection).not.toHaveBeenCalled();

  await act(async () => {
    num.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(num, '2.80');
    num.dispatchEvent(new Event('input', { bubbles: true }));
    num.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  expect(updateSection).toHaveBeenCalledWith('tires', 'front', 2.8);
  await act(async () => root.unmount());
  host.remove();
});

it('propagates aria-disabled and locked indication when disabled', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<TuningSlider label="Rear ARB" value={30.0} min={1.0} max={65.0} unitType="force" section="arb" field="rear" disabled updateSection={() => {}} convertToUI={(v: number) => v} convertFromUI={(v: number) => v} getUnitLabel={() => ''} />);
  });
  const num = host.querySelector<HTMLInputElement>('input[type="number"]')!;
  const rng = host.querySelector<HTMLInputElement>('input[type="range"]')!;
  expect(num.disabled && num.getAttribute('aria-disabled') === 'true').toBe(true);
  expect(rng.disabled && rng.getAttribute('aria-disabled') === 'true').toBe(true);
  await act(async () => root.unmount());
  host.remove();
});
