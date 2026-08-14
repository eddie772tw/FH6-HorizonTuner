import { describe, expect, it } from 'vitest';
import { calculateFrictionEllipse, getDevTirePrior } from './tireModel';

describe('tireModel domain tests', () => {
  describe('getDevTirePrior', () => {
    it('returns calibration prior with default metadata and fallback compound', () => {
      const prior = getDevTirePrior('UnknownTireCompound', 'tarmac');
      expect(prior.compound).toBe('Default');
      expect(prior.surface).toBe('tarmac');
      expect(prior.muLongitudinal).toBe(1.0);
      expect(prior.muLateral).toBe(1.0);
      expect(prior.source).toBe('calibration-prior');
    });

    it('applies surface multiplier to known tire prior', () => {
      const prior = getDevTirePrior('Drag', 'gravel');
      expect(prior.compound).toBe('Drag');
      expect(prior.surface).toBe('gravel');
      // Drag base: muLong=1.40, muLat=0.70; gravel: long=0.78, lat=0.82
      expect(prior.muLongitudinal).toBe(1.092);
      expect(prior.muLateral).toBe(0.574);
    });
  });

  describe('calculateFrictionEllipse boundaries', () => {
    it('handles zero normal load with positive demand as infeasible (Infinity utilization)', () => {
      const result = calculateFrictionEllipse({
        muLongitudinal: 1.0,
        muLateral: 1.0,
        normalForceN: 0,
        longitudinalDemandN: 100,
        lateralDemandN: 0
      });
      expect(result.maxLongitudinalForceN).toBe(0);
      expect(result.maxLateralForceN).toBe(0);
      expect(result.utilization).toBe(Infinity);
      expect(result.feasible).toBe(false);
    });

    it('handles zero friction coefficient with positive demand as infeasible', () => {
      const result = calculateFrictionEllipse({
        muLongitudinal: 0,
        muLateral: 1.0,
        normalForceN: 3000,
        longitudinalDemandN: 50,
        lateralDemandN: 0
      });
      expect(result.maxLongitudinalForceN).toBe(0);
      expect(result.utilization).toBe(Infinity);
      expect(result.feasible).toBe(false);
    });

    it('handles zero capacity with zero demand as feasible with 0 utilization', () => {
      const result = calculateFrictionEllipse({
        muLongitudinal: 0,
        muLateral: 0,
        normalForceN: 0,
        longitudinalDemandN: 0,
        lateralDemandN: 0
      });
      expect(result.maxLongitudinalForceN).toBe(0);
      expect(result.maxLateralForceN).toBe(0);
      expect(result.utilization).toBe(0);
      expect(result.feasible).toBe(true);
    });

    it('evaluates normal within-boundary combined slip demands', () => {
      // Normal force = 4000 N, muLong = 1.0, muLat = 1.0 -> MaxForce = 4000 N
      // 3-4-5 triangle: LongDemand = 2400 N (0.6), LatDemand = 3200 N (0.8) -> sqrt(0.36 + 0.64) = 1.0
      const result = calculateFrictionEllipse({
        muLongitudinal: 1.0,
        muLateral: 1.0,
        normalForceN: 4000,
        longitudinalDemandN: 2400,
        lateralDemandN: 3200
      });
      expect(result.maxLongitudinalForceN).toBe(4000);
      expect(result.maxLateralForceN).toBe(4000);
      expect(result.utilization).toBeCloseTo(1.0, 5);
      expect(result.feasible).toBe(true);
    });

    it('evaluates demands exceeding friction ellipse as infeasible', () => {
      const result = calculateFrictionEllipse({
        muLongitudinal: 1.0,
        muLateral: 1.0,
        normalForceN: 4000,
        longitudinalDemandN: 2401,
        lateralDemandN: 3200
      });
      expect(result.utilization).toBeGreaterThan(1.0);
      expect(result.feasible).toBe(false);
    });
  });
});
