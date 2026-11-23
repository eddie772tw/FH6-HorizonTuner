import { describe, expect, it, vi } from 'vitest';
vi.mock('../../coordinator.js', () => ({ initCoordinator: vi.fn(), setFrameSmoothing: vi.fn() }));
vi.mock('../../utils.js', () => ({ setSpeedUnit: vi.fn() }));
import { companionInstrumentConfig, resolveCompanionInstrument } from '../../companion-renderer.js';

describe('Companion instrument-only boundary', () => {
  it('never enables auxiliary overlays when selecting an instrument', () => {
    for (const style of ['vfd', 'bmw_idrive7', 'ford_gt']) {
      const config = companionInstrumentConfig(style, 0.8);
      expect(config.hudStyle).toBe(style);
      expect(config.scale).toBe(0.8);
      expect(config.elements).toMatchObject({ showGauge: true, showTeleMaster: false, showTeleGamepad: false, showMotionEffect: false });
    }
  });
  it('falls back for unknown, inherited and path-like identifiers', () => {
    const catalog = { vfd: 'VFD', ford_gt: 'Ford' };
    expect(resolveCompanionInstrument('ford_gt', catalog)).toBe('ford_gt');
    for (const id of ['../gamepad_overlay', 'gamepad_overlay', 'toString', null]) {
      expect(resolveCompanionInstrument(id, catalog)).toBe('vfd');
    }
  });
});
