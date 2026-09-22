import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  convertRawBoostToUnits,
  formatHudTelemetry,
  PA_PER_BAR,
  PA_PER_PSI,
  PA_PER_KPA,
  type HudDisplayUnits,
  type TelemetryData,
} from '../useTelemetry';

interface FixtureItem {
  id: string;
  category: string;
  description: string;
  raw_packet: TelemetryData;
  expected_canonical: {
    boost_pa: number;
    speed_ms: number;
    power_w: number;
    torque_nm: number;
    [key: string]: unknown;
  };
  expected_presentation: {
    boost_bar: number;
    boost_psi: number;
    boost_kpa: number;
    speed_kmh: number;
    speed_mph: number;
    power_kw: number;
    power_hp: number;
    power_ps: number;
    torque_nm: number;
    torque_ftlb: number;
    hud_metric: {
      speed: number;
      boost: number;
      power: number;
      torque: number;
    };
    hud_imperial: {
      speed: number;
      boost: number;
      power: number;
      torque: number;
    };
    [key: string]: unknown;
  };
}

interface FixturesFile {
  version: string;
  fixtures: FixtureItem[];
}

const fixturesPath = resolve(__dirname, '../../../../tests/fixtures/telemetry_canonical_fixtures.json');
const fixturesJson: FixturesFile = JSON.parse(readFileSync(fixturesPath, 'utf-8'));

describe('useTelemetry - convertRawBoostToUnits', () => {
  it('converts typical GT racing boost (150,000 Pa) correctly without magnification', () => {
    const result = convertRawBoostToUnits(150_000);
    expect(result.bar).toBeCloseTo(1.5, 4);
    expect(result.psi).toBeCloseTo(21.75566, 2);
    expect(result.kpa).toBeCloseTo(150.0, 4);

    // Negative regression check: verify absence of ~10,342 bar or 150,000 psi
    expect(result.bar).toBeLessThan(10);
    expect(result.psi).toBeLessThan(100);
  });

  it('converts zero boost (0 Pa, NA / idle) correctly', () => {
    const result = convertRawBoostToUnits(0);
    expect(result.bar).toBe(0);
    expect(result.psi).toBe(0);
    expect(result.kpa).toBe(0);
  });

  it('converts extreme boost (350,000 Pa) accurately', () => {
    const result = convertRawBoostToUnits(350_000);
    expect(result.bar).toBeCloseTo(3.5, 4);
    expect(result.psi).toBeCloseTo(50.763, 2);
    expect(result.kpa).toBeCloseTo(350.0, 4);
  });

  it('converts 1.0 PSI equivalent (6,894.75729 Pa) with high precision', () => {
    const result = convertRawBoostToUnits(PA_PER_PSI);
    expect(result.psi).toBeCloseTo(1.0, 5);
    expect(result.bar).toBeCloseTo(0.0689476, 5);
    expect(result.kpa).toBeCloseTo(6.89476, 4);
  });

  it('handles negative values safely by clamping to 0', () => {
    const resultNegative = convertRawBoostToUnits(-5000);
    expect(resultNegative.bar).toBe(0);
    expect(resultNegative.psi).toBe(0);
    expect(resultNegative.kpa).toBe(0);
  });

  it('handles non-finite, null, or undefined values safely by falling back to 0', () => {
    const nanResult = convertRawBoostToUnits(NaN);
    expect(nanResult.bar).toBe(0);
    expect(nanResult.psi).toBe(0);
    expect(nanResult.kpa).toBe(0);

    const undefinedResult = convertRawBoostToUnits(undefined);
    expect(undefinedResult.bar).toBe(0);
    expect(undefinedResult.psi).toBe(0);
    expect(undefinedResult.kpa).toBe(0);

    const nullResult = convertRawBoostToUnits(null);
    expect(nullResult.bar).toBe(0);
    expect(nullResult.psi).toBe(0);
    expect(nullResult.kpa).toBe(0);
  });
});

describe('useTelemetry - formatHudTelemetry presentation units', () => {
  const samplePacket: TelemetryData = {
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
    Yaw: 0,
    NormalizedSuspensionTravel: [0.45, 0.48, 0.4, 0.42],
    TireSlipRatio: [0.08, 0.08, 0.01, 0.01],
    TireSlipAngle: [0.06, 0.06, 0.02, 0.02],
    SpeedMetersPerSecond: 50.0,
    PowerWatts: 350000.0,
    TorqueNewtons: 500.0,
    Boost: 150000.0,
  };

  it('formats boost as bar when unit preference is bar', () => {
    const units: HudDisplayUnits = {
      speed: 'kmh',
      power: 'kw',
      torque: 'nm',
      boostPressure: 'bar',
    };

    const formatted = formatHudTelemetry(samplePacket, units);
    expect(formatted.boost).toBeCloseTo(1.5, 4);
    expect(formatted.boost_unit).toBe('BAR');
    expect(formatted.boost_bar).toBeCloseTo(1.5, 4);
    expect(formatted.boost_psi).toBeCloseTo(21.756, 2);
    expect(formatted.boost_kpa).toBeCloseTo(150.0, 4);
  });

  it('formats boost as PSI when unit preference is psi', () => {
    const units: HudDisplayUnits = {
      speed: 'mph',
      power: 'hp',
      torque: 'lbft',
      boostPressure: 'psi',
    };

    const formatted = formatHudTelemetry(samplePacket, units);
    expect(formatted.boost).toBeCloseTo(21.756, 2);
    expect(formatted.boost_unit).toBe('PSI');
    expect(formatted.boost_bar).toBeCloseTo(1.5, 4);
    expect(formatted.boost_psi).toBeCloseTo(21.756, 2);
    expect(formatted.boost_kpa).toBeCloseTo(150.0, 4);
  });

  it('formats boost as kPa when unit preference is kpa', () => {
    const units: HudDisplayUnits = {
      speed: 'kmh',
      power: 'kw',
      torque: 'nm',
      boostPressure: 'kpa',
    };

    const formatted = formatHudTelemetry(samplePacket, units);
    expect(formatted.boost).toBeCloseTo(150.0, 4);
    expect(formatted.boost_unit).toBe('kPa');
    expect(formatted.boost_bar).toBeCloseTo(1.5, 4);
    expect(formatted.boost_psi).toBeCloseTo(21.756, 2);
    expect(formatted.boost_kpa).toBeCloseTo(150.0, 4);
  });

  it('tracks session maxima without polluting subsequent calls', () => {
    const units: HudDisplayUnits = {
      speed: 'kmh',
      power: 'kw',
      torque: 'nm',
      boostPressure: 'bar',
    };

    const formatted1 = formatHudTelemetry(samplePacket, units);
    expect(formatted1.sessionMaxima.boost).toBeCloseTo(1.5, 2);
    expect(formatted1.sessionMaxima.power).toBeCloseTo(350.0, 2);

    const zeroBoostPacket: TelemetryData = {
      ...samplePacket,
      Boost: 0,
      PowerWatts: 100000,
    };
    const formatted2 = formatHudTelemetry(zeroBoostPacket, units);
    expect(formatted2.boost).toBe(0);
    expect(formatted2.sessionMaxima.boost).toBe(1.5); // Initial default peak is 1.5
  });
});

describe('useTelemetry - Cross-Stack Canonical Fixture Contract', () => {
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

  it.each(fixturesJson.fixtures)('validates canonical fixture: $id ($category)', (fixture) => {
    const raw = fixture.raw_packet;
    const exp = fixture.expected_presentation;

    // 1. Assert pure convertRawBoostToUnits
    const boostUnits = convertRawBoostToUnits(raw.Boost);
    expect(boostUnits.bar).toBeCloseTo(exp.boost_bar, 2);
    expect(boostUnits.psi).toBeCloseTo(exp.boost_psi, 1);
    expect(boostUnits.kpa).toBeCloseTo(exp.boost_kpa, 2);

    // 2. Assert formatHudTelemetry with Metric units
    const hudMetric = formatHudTelemetry(raw, metricUnits);
    expect(hudMetric.boost).toBeCloseTo(exp.hud_metric.boost, 2);
    expect(hudMetric.boost_unit).toBe('BAR');
    expect(hudMetric.speed).toBeCloseTo(exp.hud_metric.speed, 1);
    expect(hudMetric.power).toBeCloseTo(exp.hud_metric.power, 1);
    expect(hudMetric.torque).toBeCloseTo(exp.hud_metric.torque, 1);
    expect(hudMetric.boost_bar).toBeCloseTo(exp.boost_bar, 2);
    expect(hudMetric.boost_psi).toBeCloseTo(exp.boost_psi, 1);
    expect(hudMetric.boost_kpa).toBeCloseTo(exp.boost_kpa, 2);

    // 3. Assert formatHudTelemetry with Imperial units
    const hudImperial = formatHudTelemetry(raw, imperialUnits);
    expect(hudImperial.boost).toBeCloseTo(exp.hud_imperial.boost, 1);
    expect(hudImperial.boost_unit).toBe('PSI');
    expect(hudImperial.speed).toBeCloseTo(exp.hud_imperial.speed, 1);
    expect(hudImperial.power).toBeCloseTo(exp.hud_imperial.power, 1);
    expect(hudImperial.torque).toBeCloseTo(exp.hud_imperial.torque, 1);

    // 4. Assert formatHudTelemetry with kPa units
    const hudKpa = formatHudTelemetry(raw, kpaUnits);
    expect(hudKpa.boost).toBeCloseTo(exp.boost_kpa, 2);
    expect(hudKpa.boost_unit).toBe('kPa');
  });
});
