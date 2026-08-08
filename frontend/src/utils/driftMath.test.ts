import { describe, expect, it } from 'vitest';
import {
  calculateDriftAngle,
  calculateCounterSteer,
  evaluateDriftFlow,
  evaluateSpinRisk,
  evaluateSpinSave,
  detectOperationPopups,
  clamp,
  lerp,
  DRIFT_FLOW_BUILD,
  DRIFT_FLOW_NORMAL,
  DRIFT_FLOW_CHASE,
  DRIFT_FLOW_SMOOTH,
  DRIFT_FLOW_LOCKED,
  SPIN_RISK_SAFE,
  SPIN_RISK_EDGE,
  SPIN_RISK_RISK,
  SPIN_RISK_MAX,
  DRIFT_EVENT_HANDBRAKE,
  DRIFT_EVENT_CLUTCH,
  DRIFT_EVENT_BRAKE,
  DRIFT_EVENT_THROTTLE,
  DRIFT_EVENT_COUNTER,
} from './driftMath';

describe('driftMath - Pure Function Calculations', () => {
  describe('clamp & lerp', () => {
    it('clamps values correctly within bounds', () => {
      expect(clamp(15, 0, 10)).toBe(10);
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(NaN, 0, 10)).toBe(0);
    });

    it('linearly interpolates between values', () => {
      expect(lerp(0, 100, 0.5)).toBe(50);
      expect(lerp(10, 20, 0.0)).toBe(10);
      expect(lerp(10, 20, 1.0)).toBe(20);
    });
  });

  describe('calculateDriftAngle', () => {
    it('returns 0 degrees when stationary or near zero speed', () => {
      expect(calculateDriftAngle(0, 0)).toBe(0);
      expect(calculateDriftAngle(0.1, 0.2)).toBe(0);
    });

    it('calculates correct angle in degrees for directional velocity', () => {
      // 45 degrees: equal vx and vz
      const angle = calculateDriftAngle(10, 10);
      expect(angle).toBeCloseTo(45, 1);
    });

    it('clamps drift angle to [-90, 90]', () => {
      const anglePos = calculateDriftAngle(100, 0.001);
      expect(anglePos).toBeLessThanOrEqual(90);
      expect(anglePos).toBeGreaterThanOrEqual(-90);
    });
  });

  describe('calculateCounterSteer', () => {
    it('returns 0 when steer and drift angle have opposite signs (not countering)', () => {
      // Drifting left (-20deg) but steering right (+50%)
      expect(calculateCounterSteer(-20, 50)).toBe(0);
    });

    it('returns 0 when angle is below threshold (< 8deg)', () => {
      expect(calculateCounterSteer(5, 50)).toBe(0);
    });

    it('calculates positive counter percentage when steering into drift direction', () => {
      // Drifting right (+30deg) and steering right (+60%)
      const counter = calculateCounterSteer(30, 60);
      expect(counter).toBeGreaterThan(0);
      expect(counter).toBeLessThanOrEqual(100);
    });
  });

  describe('evaluateDriftFlow', () => {
    it('returns integer quality ratings (1 ~ 5)', () => {
      const resultBuild = evaluateDriftFlow({
        absAngle: 5,
        prevAngleAbs: 5,
        rearSlip: 0.1,
        prevRearSlip: 0.1,
        steerPct: 10,
        prevSteerPct: 10,
        accelPct: 0,
        prevAccelPct: 0,
        speedKmh: 5,
        holdSeconds: 0,
        currentFlowPct: 0,
      });
      expect(typeof resultBuild.quality).toBe('number');
      expect([1, 2, 3, 4, 5]).toContain(resultBuild.quality);
      expect(resultBuild.quality).toBe(DRIFT_FLOW_BUILD); // 1

      const resultLocked = evaluateDriftFlow({
        absAngle: 35,
        prevAngleAbs: 35,
        rearSlip: 1.2,
        prevRearSlip: 1.2,
        steerPct: 50,
        prevSteerPct: 50,
        accelPct: 60,
        prevAccelPct: 60,
        speedKmh: 70,
        holdSeconds: 5,
        currentFlowPct: 90,
      });
      expect([1, 2, 3, 4, 5]).toContain(resultLocked.quality);
      expect(resultLocked.quality).toBe(DRIFT_FLOW_LOCKED); // 5
    });
  });

  describe('evaluateSpinRisk', () => {
    it('returns integer risk levels (1 ~ 4)', () => {
      const resultSafe = evaluateSpinRisk({
        absAngle: 5,
        angleDelta: 0,
        rearSlip: 0.1,
        slipDelta: 0,
        counterPct: 0,
        accelPct: 20,
        speedKmh: 50,
        flowQuality: DRIFT_FLOW_NORMAL,
        countering: false,
        currentSpinRisk: 0,
      });
      expect(typeof resultSafe.level).toBe('number');
      expect([1, 2, 3, 4]).toContain(resultSafe.level);
      expect(resultSafe.level).toBe(SPIN_RISK_SAFE); // 1

      const resultMax = evaluateSpinRisk({
        absAngle: 65,
        angleDelta: 15,
        rearSlip: 2.0,
        slipDelta: 0.8,
        counterPct: 0,
        accelPct: 90,
        speedKmh: 90,
        flowQuality: DRIFT_FLOW_CHASE,
        countering: false,
        currentSpinRisk: 90,
      });
      expect([1, 2, 3, 4]).toContain(resultMax.level);
      expect(resultMax.level).toBe(SPIN_RISK_MAX); // 4
    });
  });

  describe('evaluateSpinSave', () => {
    it('arms state machine under danger and triggers upon recovery', () => {
      // Step 1: Arm under severe risk
      const step1 = evaluateSpinSave({
        spinRisk: 85,
        absAngle: 35,
        speedKmh: 50,
        rearSlip: 0.8,
        armed: false,
        peakRisk: 0,
        peakAngle: 0,
        recoverFrames: 0,
        cooldown: 0,
      });
      expect(step1.armed).toBe(true);
      expect(step1.triggered).toBe(false);

      // Step 2-4: Maintain recovery frames (angle & risk dropping back to controlled range)
      let current = step1;
      for (let i = 0; i < 3; i++) {
        current = evaluateSpinSave({
          spinRisk: 30,
          absAngle: 20,
          speedKmh: 50,
          rearSlip: 0.4,
          armed: current.armed,
          peakRisk: current.peakRisk,
          peakAngle: current.peakAngle,
          recoverFrames: current.recoverFrames,
          cooldown: current.cooldown,
        });
      }
      expect(current.triggered).toBe(true);
    });
  });

  describe('detectOperationPopups', () => {
    it('detects handbrake and clutch kick operations using readable placeholders', () => {
      const events = detectOperationPopups({
        handbrakePct: 80,
        prevHandbrakePct: 10,
        clutchPct: 70,
        prevClutchPct: 10,
        brakePct: 0,
        prevBrakePct: 0,
        accelPct: 50,
        prevAccelPct: 10,
        steerPct: 40,
        prevSteerPct: 10,
        counterPct: 60,
        speedKmh: 40,
        absAngle: 25,
      });

      expect(events).toContain(DRIFT_EVENT_HANDBRAKE);
      expect(events).toContain(DRIFT_EVENT_CLUTCH);
    });

    it('returns empty array when inputs are calm', () => {
      const events = detectOperationPopups({
        handbrakePct: 0,
        prevHandbrakePct: 0,
        clutchPct: 0,
        prevClutchPct: 0,
        brakePct: 0,
        prevBrakePct: 0,
        accelPct: 30,
        prevAccelPct: 30,
        steerPct: 10,
        prevSteerPct: 10,
        counterPct: 0,
        speedKmh: 60,
        absAngle: 5,
      });
      expect(events).toHaveLength(0);
    });
  });
});
