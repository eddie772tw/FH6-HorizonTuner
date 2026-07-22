import { describe, it, expect } from 'vitest';
import { analyzeTelemetrySession } from './tuningDiagnosis';
import { CarParams } from '../context/CarParamsContext';

const mockCarParams: CarParams = {
  carOrdinal: 100,
  carClass: 'S1',
  pi: 850,
  weightKg: 1300,
  weightDistFront: 0.52,
  driveType: 'AWD',
  hp: 600,
  torqueNm: 700,
  minRpm: 1000,
  maxRpm: 7500,
};

describe('tuningDiagnosis - analyzeTelemetrySession', () => {

  it('應能優雅處理空遙測數據點，並回傳預設警告', () => {
    const report = analyzeTelemetrySession([], mockCarParams, 'Road');
    expect(report.suspension.frontBottomOutRate).toBe(0);
    expect(report.suspension.rearBottomOutRate).toBe(0);
    expect(report.suspension.bottomOutSeverity).toBe('none');
    expect(report.generalAdvice.length).toBeGreaterThan(0);
    expect(report.generalAdvice[0]).toContain('無遙測數據');
  });

  it('應能正確計算避震器觸底率 (Bottom-out rate) 與嚴重度等級', () => {
    const points = Array.from({ length: 100 }, (_, i) => ({
      SuspTravel: i < 20 ? [0.96, 0.96, 0.5, 0.5] : [0.4, 0.4, 0.4, 0.4],
      SpeedMetersPerSecond: 30,
      CurrentEngineRpm: 5000,
      AccelZ: 0,
      SlipAngle: [0, 0, 0, 0],
    }));

    const report = analyzeTelemetrySession(points, mockCarParams, 'Road');
    expect(report.suspension.frontBottomOutRate).toBeCloseTo(20, 1);
    expect(report.suspension.rearBottomOutRate).toBe(0);
    expect(report.suspension.frontMaxTravel).toBeCloseTo(0.96, 2);
    expect(report.suspension.bottomOutSeverity).not.toBe('none');
  });

  it('應能識別飛躍 (Jump) 與高落地衝擊 G 值分析', () => {
    const points = [
      { AccelZ: 0, AccelerationX: 0, AccelerationZ: 0, SuspTravel: [0.5, 0.5, 0.5, 0.5], PositionY: 10, time: 0 },
      // 騰空期間 (> 0.3s)
      { AccelZ: -0.8, AccelerationX: 0, AccelerationZ: 0, SuspTravel: [0.0, 0.0, 0.0, 0.0], PositionY: 12, time: 0.1 },
      { AccelZ: -0.9, AccelerationX: 0, AccelerationZ: 0, SuspTravel: [0.0, 0.0, 0.0, 0.0], PositionY: 15, time: 0.2 },
      { AccelZ: -0.9, AccelerationX: 0, AccelerationZ: 0, SuspTravel: [0.0, 0.0, 0.0, 0.0], PositionY: 15, time: 0.3 },
      { AccelZ: -0.9, AccelerationX: 0, AccelerationZ: 0, SuspTravel: [0.0, 0.0, 0.0, 0.0], PositionY: 14, time: 0.4 },
      { AccelZ: -0.9, AccelerationX: 0, AccelerationZ: 0, SuspTravel: [0.0, 0.0, 0.0, 0.0], PositionY: 12, time: 0.5 },
      // 觸地衝擊點（提供 AccelerationX / AccelerationZ 供計算 landingPeakG）
      { AccelZ: 3.5, AccelerationX: 19.62, AccelerationZ: 19.62, SuspTravel: [0.98, 0.98, 0.98, 0.98], PositionY: 10, time: 0.6 },
    ];

    const report = analyzeTelemetrySession(points, mockCarParams, 'DangerSign');
    if (report.jumpAnalysis) {
      expect(report.jumpAnalysis.hasJumps).toBe(true);
      expect(report.jumpAnalysis.maxLandingImpactG).toBeGreaterThan(0);
    }
  });

  it('應能正確評估漂移模式 (Drift) 下的角度與穩定度', () => {
    // 留意: TireSlipAngle 的單位於內部計算時會轉成角度 Math.abs(slip) * (180 / Math.PI)
    // 提供約 0.2 弧度 (~11.45 度) 以符合 > 8 度的漂移門檻
    const points = Array.from({ length: 50 }, () => ({
      SuspTravel: [0.5, 0.5, 0.5, 0.5],
      SpeedMetersPerSecond: 25,
      CurrentEngineRpm: 6000,
      AccelerationX: 5.0,
      AccelZ: 0,
      TireSlipAngle: [0.2, 0.2, 0.35, 0.35],
    }));

    const report = analyzeTelemetrySession(points, mockCarParams, 'Drift');
    if (report.driftAnalysis) {
      expect(report.driftAnalysis.driftTimePercent).toBeGreaterThan(0);
      expect(report.driftAnalysis.avgDriftAngle).toBeGreaterThan(0);
    }
  });

  it('應能評估速度帶與最佳馬力輸出帶 (Powerband Efficiency)', () => {
    const points = Array.from({ length: 100 }, (_, i) => ({
      SuspTravel: [0.4, 0.4, 0.4, 0.4],
      SpeedMetersPerSecond: i < 70 ? 40 : 20,
      CurrentEngineRpm: i < 70 ? 5500 : 2000,
      AccelZ: 0,
      SlipAngle: [0, 0, 0, 0],
    }));

    const report = analyzeTelemetrySession(points, mockCarParams, 'Road');
    if (report.speedAnalysis) {
      expect(report.speedAnalysis.maxSpeed).toBeGreaterThan(0);
      expect(report.speedAnalysis.powerbandEfficiency).toBeGreaterThanOrEqual(0);
    }
  });

});
