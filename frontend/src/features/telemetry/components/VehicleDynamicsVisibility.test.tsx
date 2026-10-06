// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import VehicleDynamicsDisplay from './VehicleDynamicsDisplay';
import { TelemetryCardPaintContext, type TelemetryCardPaint } from './TelemetryCardVisibility';
import { telemetryEmitter } from '../../../hooks/useTelemetry';

vi.mock('../../../hooks/useTelemetry', () => ({ telemetryEmitter: new EventTarget() }));
const settings = vi.hoisted(() => ({ speedFactor: 3.6 }));
vi.mock('../../../context/SettingsContext', () => ({ useSettings: () => ({
  t: (s: string) => s,
  convertPower: (value: number) => ({ value: value / 1000, label: 'kW' }),
  convertTorque: (value: number) => ({ value, label: 'Nm' }),
  convertBoost: (value: number) => ({ value: value / 100000, label: 'bar' }),
  convertSpeed: (value: number) => ({ value: value * settings.speedFactor, label: 'speed' }),
}) }));

it('retains hidden qualified peaks and raw top speed through unit changes without re-ingesting on resume', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let visible = true;
  const listeners = new Set<() => void>();
  const paint: TelemetryCardPaint = {
    canPaint: () => visible,
    subscribe: callback => { listeners.add(callback); return () => { listeners.delete(callback); }; },
  };
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  const render = () => <TelemetryCardPaintContext.Provider value={paint}><VehicleDynamicsDisplay /></TelemetryCardPaintContext.Provider>;
  const emit = (power: number, speed: number, car = 1) => telemetryEmitter.dispatchEvent(new CustomEvent('update', { detail: {
    CarOrdinal: car, IsRaceOn: 1, AccelInput: 255, BrakeInput: 0, ClutchInput: 0, HandBrakeInput: 0,
    CurrentEngineRpm: 6000, EngineIdleRpm: 900, PowerWatts: power, TorqueNewtons: 500,
    TireSlipRatio: [0, 0, 0, 0], SpeedMetersPerSecond: speed,
  } }));
  const metric = (label: string) => Array.from(host.querySelectorAll('div')).find(element => element.textContent === label)?.nextElementSibling?.textContent;
  try {
    await act(async () => root.render(render()));
    emit(100000, 30);
    expect(metric('Max Power')).toContain('100');
    visible = false;
    emit(300000, 60);
    emit(200000, 20);
    expect(metric('Max Power')).toContain('100');
    settings.speedFactor = 2.23694;
    await act(async () => root.render(render()));
    expect(metric('Max Power')).toContain('100');
    visible = true;
    listeners.forEach(listener => listener());
    expect(metric('Max Power')).toContain('300');
    expect(metric('Power')).toContain('200');
    expect(metric('Top Speed')).toContain(String(Math.round(60 * settings.speedFactor)));
    visible = false;
    emit(80000, 10, 2);
    visible = true;
    listeners.forEach(listener => listener());
    expect(metric('Max Power')).toContain('80');
    expect(metric('Top Speed')).toContain(String(Math.round(10 * settings.speedFactor)));
  } finally {
    await act(async () => root.unmount()); host.remove();
    expect(listeners.size).toBe(0);
    settings.speedFactor = 3.6;
  }
});
