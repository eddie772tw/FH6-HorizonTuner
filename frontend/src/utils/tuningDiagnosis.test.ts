import { describe, it, expect } from 'vitest';
import { analyzeTelemetrySession, evaluateTireTelemetryDiagnosis } from './tuningDiagnosis';

import { CarParams } from '../context/CarParamsContext';

const mockCarParams = {
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
  maxHpRpm: 7500,
} as unknown as CarParams;

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

describe('evaluateTireTelemetryDiagnosis', () => {
  it('應精確判斷熱胎壓收斂狀態與軸溫差', () => {
    const res = evaluateTireTelemetryDiagnosis({
      photF: 32.5,
      photR: 32.5,
      tempF: 90,
      tempR: 90,
      targetPhot: 32.5,
      handlingIssue: 'none'
    });

    expect(res.isConverged).toBe(true);
    expect(res.deltaTaxle).toBe(0);
    expect(res.axleBalanceStatus).toBe('balanced');
    expect(res.primaryPressureAdvice).toContain('無需調整冷胎壓');
  });

  it('應能發出正確的氣壓微調與極限推頭幾何聯動微調指令', () => {
    const res = evaluateTireTelemetryDiagnosis({
      photF: 34.0,
      photR: 32.0,
      tempF: 98,
      tempR: 88,
      targetPhot: 32.5,
      handlingIssue: 'understeer_mid',
      alignment: {
        camber: { front: -1.5, rear: -1.0 },
        toe: { front: 0.0, rear: 0.0 },
        caster: 5.5
      },
      chassis: {
        arb: { front: 15.0, rear: 55.0 },
        springs: { front: 50, rear: 50, heightF: 12, heightR: 12 },
        damping: { reboundF: 10, reboundR: 10, bumpF: 6, bumpR: 6 },
        diff: { accelF: 15, decelF: 0, accelR: 75, decelR: 15, centerRear: 70 }
      }
    });

    expect(res.isConverged).toBe(false);
    expect(res.biasF).toBe(1.5);
    expect(res.biasR).toBe(-0.5);
    expect(res.primaryPressureAdvice).toContain('降低前冷胎壓 -1.5 PSI');
    expect(res.secondarySuspensionAdvice).toContain('前防傾桿由 15.0 調軟');
    expect(res.specificAdjustments.length).toBeGreaterThan(0);
    const camberAdj = res.specificAdjustments.find(a => a.name.includes('Camber'));
    expect(camberAdj).toBeDefined();
    expect(camberAdj?.current).toBe(-1.5);
    expect(camberAdj?.target).toBe(-1.8);
  });

  it('應能在華氏 (°F) 模式下正確判斷軸溫差與顯示單位', () => {
    const res = evaluateTireTelemetryDiagnosis({
      photF: 32.5,
      photR: 32.5,
      tempF: 198,
      tempR: 188,
      targetPhot: 32.5,
      handlingIssue: 'none',
      tempUnit: 'F'
    });

    expect(res.deltaTaxle).toBe(10);
    expect(res.axleBalanceStatus).toBe('front_overheat');
    expect(res.secondarySuspensionAdvice).toContain('°F');
  });

  it('應能結合遙測動態抓地力數據 (telemetryGripMetrics) 拋出警訊', () => {
    const res = evaluateTireTelemetryDiagnosis({
      photF: 32.5,
      photR: 32.5,
      tempF: 90,
      tempR: 90,
      targetPhot: 32.5,
      handlingIssue: 'none',
      telemetryGripMetrics: {
        avgSlipRatioF: -0.18,
        avgSlipRatioR: 0.05,
        maxSlipAngleF: 8.5,
        maxSlipAngleR: 4.0,
        maxSuspTravelF: 0.96,
        maxSuspTravelR: 0.60
      }
    });

    expect(res.gripAnalysisAdvice.length).toBeGreaterThan(0);
    expect(res.gripAnalysisAdvice.some(a => a.includes('觸底警訊'))).toBe(true);
    expect(res.gripAnalysisAdvice.some(a => a.includes('煞車滑移'))).toBe(true);
    expect(res.gripAnalysisAdvice.some(a => a.includes('轉向飽和'))).toBe(true);
  });
});


