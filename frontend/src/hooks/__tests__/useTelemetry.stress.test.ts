import { describe, it, expect } from 'vitest';
import {
  convertRawBoostToUnits,
  formatHudTelemetry,
  createDefaultHudSessionState,
  HudDisplayUnits,
  HudSessionState,
  PA_PER_BAR,
  PA_PER_PSI,
  PA_PER_KPA,
  TelemetryData,
} from '../useTelemetry';

describe('Adversarial Empirical Stress Testing: Frontend Boost & HUD Telemetry', () => {
  const basePacket: TelemetryData = {
    IsRaceOn: 1,
    TimestampMS: 150000,
    EngineMaxRpm: 8000,
    EngineIdleRpm: 800,
    CurrentEngineRpm: 6500,
    AccelerationX: 11.772,
    AccelerationY: 9.81,
    AccelerationZ: -7.848,
    VelocityX: 0,
    VelocityY: 0,
    VelocityZ: 50,
    CarOrdinal: 1,
    PowerWatts: 350000,
    TorqueNewtons: 500,
    Boost: 150000,
  };

  const metricUnits: HudDisplayUnits = {
    speed: 'kmh',
    power: 'kw',
    torque: 'nm',
    boostPressure: 'bar',
  };

  const imperialUnits: HudDisplayUnits = {
    speed: 'mph',
    power: 'hp',
    torque: 'lbft',
    boostPressure: 'psi',
  };

  const kpaUnits: HudDisplayUnits = {
    speed: 'kmh',
    power: 'kw',
    torque: 'nm',
    boostPressure: 'kpa',
  };

  describe('Mission Stress 1: Extreme Boost Values (Huge Boost)', () => {
    it('accurately converts 1,000,000 Pa (10 bar) without overflow or magnification', () => {
      const pa = 1_000_000;
      const res = convertRawBoostToUnits(pa);

      expect(res.bar).toBe(10.0);
      expect(res.psi).toBeCloseTo(145.0377, 3);
      expect(res.kpa).toBe(1000.0);

      // Verify absence of 6,894.76x magnification bug
      expect(res.psi).toBeLessThan(200);
      expect(res.bar).toBeLessThan(20);

      // Test formatHudTelemetry in all 3 unit modes
      const hudBar = formatHudTelemetry({ ...basePacket, Boost: pa }, metricUnits);
      expect(hudBar.boost).toBe(10.0);
      expect(hudBar.boost_unit).toBe('BAR');
      expect(hudBar.boost_bar).toBe(10.0);

      const hudPsi = formatHudTelemetry({ ...basePacket, Boost: pa }, imperialUnits);
      expect(hudPsi.boost).toBeCloseTo(145.0377, 3);
      expect(hudPsi.boost_unit).toBe('PSI');
      expect(hudPsi.boost_psi).toBeCloseTo(145.0377, 3);

      const hudKpa = formatHudTelemetry({ ...basePacket, Boost: pa }, kpaUnits);
      expect(hudKpa.boost).toBe(1000.0);
      expect(hudKpa.boost_unit).toBe('kPa');
      expect(hudKpa.boost_kpa).toBe(1000.0);
    });

    it('accurately converts 10,000,000 Pa (100 bar, extreme pressure)', () => {
      const pa = 10_000_000;
      const res = convertRawBoostToUnits(pa);

      expect(res.bar).toBe(100.0);
      expect(res.psi).toBeCloseTo(1450.377, 2);
      expect(res.kpa).toBe(10000.0);

      const hud = formatHudTelemetry({ ...basePacket, Boost: pa }, metricUnits);
      expect(hud.boost).toBe(100.0);
      expect(hud.boost_bar).toBe(100.0);
      expect(hud.boost_psi).toBeCloseTo(1450.377, 2);
      expect(hud.boost_kpa).toBe(10000.0);
    });

    it('handles absurdly colossal pressure (1e9 Pa = 10,000 bar) gracefully without NaN or Inf', () => {
      const pa = 1_000_000_000;
      const res = convertRawBoostToUnits(pa);

      expect(Number.isFinite(res.bar)).toBe(true);
      expect(Number.isFinite(res.psi)).toBe(true);
      expect(Number.isFinite(res.kpa)).toBe(true);
      expect(res.bar).toBe(10000.0);
    });
  });

  describe('Mission Stress 2: Negative Boost / Manifold Vacuum', () => {
    it('clamps negative boost (-50,000 Pa manifold vacuum) strictly to 0', () => {
      const res = convertRawBoostToUnits(-50_000);
      expect(res.bar).toBe(0);
      expect(res.psi).toBe(0);
      expect(res.kpa).toBe(0);

      const hudBar = formatHudTelemetry({ ...basePacket, Boost: -50_000 }, metricUnits);
      expect(hudBar.boost).toBe(0);
      expect(hudBar.boost_bar).toBe(0);
      expect(hudBar.boost_psi).toBe(0);
      expect(hudBar.boost_kpa).toBe(0);

      const hudPsi = formatHudTelemetry({ ...basePacket, Boost: -50_000 }, imperialUnits);
      expect(hudPsi.boost).toBe(0);
      expect(hudPsi.boost_psi).toBe(0);

      const hudKpa = formatHudTelemetry({ ...basePacket, Boost: -50_000 }, kpaUnits);
      expect(hudKpa.boost).toBe(0);
      expect(hudKpa.boost_kpa).toBe(0);
    });

    it('clamps small negative vacuum (-0.001 Pa) strictly to 0', () => {
      const res = convertRawBoostToUnits(-0.001);
      expect(res.bar).toBe(0);
      expect(res.psi).toBe(0);
      expect(res.kpa).toBe(0);
    });

    it('clamps IEEE 754 negative zero (-0) safely to 0', () => {
      const res = convertRawBoostToUnits(-0);
      expect(res.bar).toBe(0);
      expect(res.psi).toBe(0);
      expect(res.kpa).toBe(0);
      expect(Object.is(res.bar, -0)).toBe(false);
    });

    it('clamps extreme negative values (-1e12 Pa) strictly to 0', () => {
      const res = convertRawBoostToUnits(-1e12);
      expect(res.bar).toBe(0);
      expect(res.psi).toBe(0);
      expect(res.kpa).toBe(0);
    });
  });

  describe('Mission Stress 3: Sub-micro Boost (Near-zero positive values)', () => {
    it('maintains finite precision for sub-micro boost (0.01 Pa)', () => {
      const pa = 0.01;
      const res = convertRawBoostToUnits(pa);

      expect(res.bar).toBe(0.01 / 100_000);
      expect(res.bar).toBeCloseTo(1e-7, 9);
      expect(res.psi).toBeCloseTo(0.01 / 6894.75729, 9);
      expect(res.kpa).toBe(0.01 / 1000);
      expect(res.kpa).toBeCloseTo(1e-5, 7);

      expect(res.bar).toBeGreaterThan(0);
      expect(res.psi).toBeGreaterThan(0);
      expect(res.kpa).toBeGreaterThan(0);

      const hud = formatHudTelemetry({ ...basePacket, Boost: pa }, metricUnits);
      expect(hud.boost).toBeCloseTo(1e-7, 9);
      expect(Number.isNaN(hud.boost)).toBe(false);
    });

    it('handles Number.MIN_VALUE and Number.EPSILON without underflowing to NaN', () => {
      const epsRes = convertRawBoostToUnits(Number.EPSILON);
      expect(Number.isFinite(epsRes.bar)).toBe(true);
      expect(epsRes.bar).toBeGreaterThan(0);

      const minRes = convertRawBoostToUnits(Number.MIN_VALUE);
      expect(Number.isFinite(minRes.bar)).toBe(true);
      expect(Number.isNaN(minRes.bar)).toBe(false);
    });
  });

  describe('Mission Stress 4: NaN, Infinity, -Infinity, null, undefined & Type Pollution', () => {
    it.each([
      ['NaN', NaN],
      ['Infinity', Infinity],
      ['-Infinity', -Infinity],
      ['null', null],
      ['undefined', undefined],
      ['empty string', '' as unknown as number],
      ['string number', '150000' as unknown as number],
      ['object', {} as unknown as number],
      ['array', [150000] as unknown as number],
      ['boolean true', true as unknown as number],
      ['boolean false', false as unknown as number],
    ])('safely handles %s by returning 0 without NaN', (_, invalidInput) => {
      const res = convertRawBoostToUnits(invalidInput);
      expect(res.bar).toBe(0);
      expect(res.psi).toBe(0);
      expect(res.kpa).toBe(0);
      expect(Number.isNaN(res.bar)).toBe(false);
      expect(Number.isNaN(res.psi)).toBe(false);
      expect(Number.isNaN(res.kpa)).toBe(false);

      const hud = formatHudTelemetry({ ...basePacket, Boost: invalidInput }, metricUnits);
      expect(hud.boost).toBe(0);
      expect(hud.boost_bar).toBe(0);
      expect(hud.boost_psi).toBe(0);
      expect(hud.boost_kpa).toBe(0);
      expect(Number.isNaN(hud.boost)).toBe(false);
    });
  });

  describe('Mission Stress 5: Rapid Unit Switching Between bar, psi, kpa', () => {
    it('maintains strict consistency under 10,000 rapid unit transitions and varying boost states', () => {
      const unitsArray: Array<HudDisplayUnits['boostPressure']> = ['bar', 'psi', 'kpa'];
      const testBoostPressures = [
        0,
        0.01,
        500,
        6894.75729,
        50_000,
        150_000,
        250_000,
        1_000_000,
        10_000_000,
        -50_000,
        NaN,
        Infinity,
        -Infinity,
      ];

      let iterations = 0;
      for (let i = 0; i < 1000; i++) {
        for (const unit of unitsArray) {
          for (const boostPa of testBoostPressures) {
            iterations++;
            const activeUnits: HudDisplayUnits = {
              speed: 'kmh',
              power: 'kw',
              torque: 'nm',
              boostPressure: unit,
            };

            const packet: TelemetryData = {
              ...basePacket,
              Boost: boostPa,
            };

            const hud = formatHudTelemetry(packet, activeUnits);

            // 1. Output must NEVER be NaN
            expect(Number.isNaN(hud.boost)).toBe(false);
            expect(Number.isNaN(hud.boost_bar)).toBe(false);
            expect(Number.isNaN(hud.boost_psi)).toBe(false);
            expect(Number.isNaN(hud.boost_kpa)).toBe(false);

            // 2. Output must be finite and >= 0
            expect(Number.isFinite(hud.boost)).toBe(true);
            expect(hud.boost).toBeGreaterThanOrEqual(0);

            // 3. boost_unit must match active unit
            if (unit === 'bar') {
              expect(hud.boost_unit).toBe('BAR');
              expect(hud.boost).toBe(hud.boost_bar);
            } else if (unit === 'psi') {
              expect(hud.boost_unit).toBe('PSI');
              expect(hud.boost).toBe(hud.boost_psi);
            } else if (unit === 'kpa') {
              expect(hud.boost_unit).toBe('kPa');
              expect(hud.boost).toBe(hud.boost_kpa);
            }

            // 4. Verification against 6,894.76x magnification regression:
            // Under old defective code:
            // boostPsi was raw.Boost (150,000)
            // boostBar was raw.Boost / 14.5038 (10,342.12)
            // boostKpa was raw.Boost * 6.89476 (1,034,214)
            if (typeof boostPa === 'number' && Number.isFinite(boostPa) && boostPa > 0) {
              const expectedBar = boostPa / PA_PER_BAR;
              const expectedPsi = boostPa / PA_PER_PSI;
              const expectedKpa = boostPa / PA_PER_KPA;

              expect(hud.boost_bar).toBeCloseTo(expectedBar, 5);
              expect(hud.boost_psi).toBeCloseTo(expectedPsi, 3);
              expect(hud.boost_kpa).toBeCloseTo(expectedKpa, 4);

              // Magnification check: psi must NOT equal Pa!
              if (boostPa >= 1000) {
                expect(hud.boost_psi).toBeLessThan(boostPa);
                expect(hud.boost_bar).toBeLessThan(boostPa);
              }
            } else {
              expect(hud.boost_bar).toBe(0);
              expect(hud.boost_psi).toBe(0);
              expect(hud.boost_kpa).toBe(0);
            }
          }
        }
      }

      expect(iterations).toBe(39000);
    });
  });

  describe('Adversarial Boundary Investigation: Session State Persistence across Unit Switching', () => {
    it('reveals session.peakSessionBoost persistence behavior when switching units', () => {
      const session = createDefaultHudSessionState();
      // Default peak is 1.5
      expect(session.peakSessionBoost).toBe(1.5);

      // Frame 1: 150,000 Pa (1.5 bar) in 'bar' mode
      const frame1 = formatHudTelemetry(
        { ...basePacket, CarOrdinal: 10, Boost: 150_000 },
        metricUnits,
        session
      );
      expect(frame1.boost).toBeCloseTo(1.5, 4);
      expect(session.peakSessionBoost).toBeCloseTo(1.5, 4);

      // Frame 2: 200,000 Pa (2.0 bar) in 'bar' mode -> peak updates to 2.0
      const frame2 = formatHudTelemetry(
        { ...basePacket, CarOrdinal: 10, Boost: 200_000 },
        metricUnits,
        session
      );
      expect(frame2.boost).toBeCloseTo(2.0, 4);
      expect(session.peakSessionBoost).toBeCloseTo(2.0, 4);

      // Frame 3: User switches display units to 'psi' (car still at 200,000 Pa = ~29.007 psi)
      const frame3 = formatHudTelemetry(
        { ...basePacket, CarOrdinal: 10, Boost: 200_000 },
        imperialUnits,
        session
      );
      expect(frame3.boost).toBeCloseTo(29.0076, 2);
      // Because 29.0076 > 2.0, session.peakSessionBoost becomes 29.0076 (numerical value stored in psi)
      expect(session.peakSessionBoost).toBeCloseTo(29.0076, 2);

      // Frame 4: User switches display units back to 'bar' (car still at 200,000 Pa = 2.0 bar)
      const frame4 = formatHudTelemetry(
        { ...basePacket, CarOrdinal: 10, Boost: 200_000 },
        metricUnits,
        session
      );
      expect(frame4.boost).toBeCloseTo(2.0, 4);
      expect(frame4.boost_unit).toBe('BAR');

      // CRITICAL OBSERVATION FOR ADVERSARIAL REVIEW:
      // frame4.boost is 2.0 bar, BUT session.peakSessionBoost was set to 29.0076 while in PSI mode!
      // Since 2.0 is NOT > 29.0076, sessionMaxima.boost remains 29.0076!
      expect(frame4.sessionMaxima.boost).toBeCloseTo(29.0076, 2);

      // When car changes, session resets back to default (1.5)
      const frameCarChange = formatHudTelemetry(
        { ...basePacket, CarOrdinal: 20, Boost: 150_000 },
        metricUnits,
        session
      );
      expect(frameCarChange.sessionMaxima.boost).toBe(1.5);
    });
  });
});
