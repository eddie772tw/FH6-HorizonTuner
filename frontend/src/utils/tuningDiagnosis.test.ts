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
    expect(res.primaryTelemetryDirective).toContain('完全收斂');
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
    expect(res.primaryTelemetryDirective).toContain('第一優先關鍵調整');
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

  it('應能結合遙測動態抓地力數據 (telemetryGripMetrics) 拋出警訊與具體微調建議', () => {
    const res = evaluateTireTelemetryDiagnosis({
      photF: 32.5,
      photR: 32.5,
      tempF: 90,
      tempR: 90,
      targetPhot: 32.5,
      handlingIssue: 'none',
      telemetryGripMetrics: {
        avgSlipRatioF: -0.18,
        avgSlipRatioR: 0.18,
        maxSlipAngleF: 8.5,
        maxSlipAngleR: 4.0,
        maxSuspTravelF: 0.96,
        maxSuspTravelR: 0.60,
        tireTempFL: 98,
        tireTempFR: 88,
        tireTempRL: 96,
        tireTempRR: 86
      }
    });

    expect(res.gripAnalysisAdvice.length).toBeGreaterThan(0);
    expect(res.gripAnalysisAdvice.some(a => a.includes('觸底警訊'))).toBe(true);
    expect(res.gripAnalysisAdvice.some(a => a.includes('煞車'))).toBe(true);
    expect(res.gripAnalysisAdvice.some(a => a.includes('轉向'))).toBe(true);
    expect(res.gripAnalysisAdvice.some(a => a.includes('驅動打滑'))).toBe(true);
    expect(res.gripAnalysisAdvice.some(a => a.includes('左右熱負載不均'))).toBe(true);

    // 應產生具體可一鍵採納的調整項
    const bumpAdj = res.specificAdjustments.find(a => a.parameterKey === 'bumpFront');
    expect(bumpAdj).toBeDefined();
    expect(bumpAdj?.delta).toBe(1.0);

    const diffAdj = res.specificAdjustments.find(a => a.parameterKey === 'diffAccelRear');
    expect(diffAdj).toBeDefined();
    expect(diffAdj?.delta).toBe(5);
  });

  it('應能正確支援自訂 AppliedTuningSetup 覆蓋並以此為基準計算調整建議', () => {
    // 使用者在第一輪測試後手動修改了設定：前防傾桿改為 20.0，前冷胎壓改為 29.0
    const customSetup = {
      tirePressureFront: 29.0,
      tirePressureRear: 28.0,
      camberFront: -1.8,
      camberRear: -1.2,
      toeFront: 0.05,
      toeRear: -0.05,
      caster: 6.0,
      arbFront: 20.0,
      arbRear: 40.0,
      springsFront: 60.0,
      springsRear: 55.0,
      rideHeightFront: 13.0,
      rideHeightRear: 13.0,
      reboundFront: 11.0,
      reboundRear: 10.5,
      bumpFront: 7.0,
      bumpRear: 6.5,
      diffAccelRear: 55,
      diffDecelRear: 25
    };

    const res = evaluateTireTelemetryDiagnosis({
      photF: 34.0, // 比目標 32.5 高 1.5 PSI
      photR: 32.5,
      tempF: 90,
      tempR: 90,
      targetPhot: 32.5,
      handlingIssue: 'understeer_mid',
      currentSetup: customSetup,
      telemetryGripMetrics: {
        maxSlipAngleF: 8.5,
        maxSlipAngleR: 4.0
      }
    });

    // 驗證冷胎壓調整：應基於 customSetup.tirePressureFront (29.0) 扣除 1.5 PSI = 27.5 PSI
    const pressureAdj = res.specificAdjustments.find(a => a.parameterKey === 'tirePressureFront');
    expect(pressureAdj).toBeDefined();
    expect(pressureAdj?.current).toBe(29.0);
    expect(pressureAdj?.target).toBe(27.5);
    expect(pressureAdj?.delta).toBe(-1.5);

    // 驗證防傾桿調整：應基於 customSetup.arbFront (20.0) 調軟 2.5 = 17.5
    const arbAdj = res.specificAdjustments.find(a => a.parameterKey === 'arbFront');
    expect(arbAdj).toBeDefined();
    expect(arbAdj?.current).toBe(20.0);
    expect(arbAdj?.target).toBe(17.5);
    expect(arbAdj?.delta).toBe(-2.5);

    // 驗證前外傾角調整：應基於 customSetup.camberFront (-1.8) 調負 0.3 = -2.1
    const camberAdj = res.specificAdjustments.find(a => a.parameterKey === 'camberFront');
    expect(camberAdj).toBeDefined();
    expect(camberAdj?.current).toBe(-1.8);
    expect(camberAdj?.target).toBe(-2.1);
  });

  it('應能依據側傾行程差與動力帶換檔落差提出 ARB 與終傳比微調', () => {
    const res = evaluateTireTelemetryDiagnosis({
      currentSetup: {
        tirePressureFront: 28.5,
        tirePressureRear: 28.5,
        camberFront: -1.5,
        camberRear: -1.0,
        toeFront: 0,
        toeRear: 0,
        caster: 5.5,
        arbFront: 15.0,
        arbRear: 35.0,
        springsFront: 50.0,
        springsRear: 50.0,
        rideHeightFront: 12.0,
        rideHeightRear: 12.0,
        reboundFront: 10.0,
        reboundRear: 10.0,
        bumpFront: 6.0,
        bumpRear: 6.0,
        diffAccelRear: 50,
        diffDecelRear: 20,
        finalDrive: 3.80
      },
      telemetryGripMetrics: {
        suspTravelFL: 0.85,
        suspTravelFR: 0.45, // 前軸左右行程差 0.40
        suspTravelRL: 0.60,
        suspTravelRR: 0.50, // 後軸左右行程差 0.10 -> rollF - rollR = 0.30 > 0.18
        accelXG: 1.1,
        currentRpm: 4000,
        engineMaxRpm: 8000, // 4000 / 8000 = 0.50 < 0.60
        accelInput: 255,
        currentGear: 3,
        speedKmh: 120
      }
    });

    expect(res.gripAnalysisAdvice.some(a => a.includes('前軸側傾過大'))).toBe(true);
    expect(res.gripAnalysisAdvice.some(a => a.includes('換檔轉速斷層'))).toBe(true);

    const arbAdj = res.specificAdjustments.find(a => a.parameterKey === 'arbFront');
    expect(arbAdj).toBeDefined();
    expect(arbAdj?.current).toBe(15.0);
    expect(arbAdj?.target).toBe(17.0);

    const fdAdj = res.specificAdjustments.find(a => a.parameterKey === 'finalDrive');
    expect(fdAdj).toBeDefined();
    expect(fdAdj?.current).toBe(3.80);
    expect(fdAdj?.target).toBe(3.95);
  });
});

describe('buildBaselineSetup', () => {
  it('應能正確將 Step 2~4 的計算結果轉換為 AppliedTuningSetup 基準物件', () => {
    const chassis = {
      arb: { front: 18.2, rear: 45.1 },
      springs: { front: 55.4, rear: 52.1, heightF: 12.5, heightR: 12.5 },
      damping: { reboundF: 10.8, reboundR: 10.2, bumpF: 6.5, bumpR: 6.1 },
      diff: { accelF: 15, decelF: 0, accelR: 70, decelR: 20, centerRear: 65 }
    };
    const alignment = {
      camber: { front: -1.7, rear: -1.1 },
      toe: { front: '0.10°', rear: '-0.10°' },
      caster: 5.8,
      pcF: 28.2,
      pcR: 27.8
    };

    const baseline = import('./tuningDiagnosis').then(m => {
      const setup = m.buildBaselineSetup(mockCarParams, chassis, alignment, 32.5, { finalDrive: 3.73 });
      expect(setup.tirePressureFront).toBe(28.2);
      expect(setup.tirePressureRear).toBe(27.8);
      expect(setup.camberFront).toBe(-1.7);
      expect(setup.camberRear).toBe(-1.1);
      expect(setup.toeFront).toBe(0.1);
      expect(setup.toeRear).toBe(-0.1);
      expect(setup.caster).toBe(5.8);
      expect(setup.arbFront).toBe(18.2);
      expect(setup.arbRear).toBe(45.1);
      expect(setup.springsFront).toBe(55.4);
      expect(setup.springsRear).toBe(52.1);
      expect(setup.diffAccelRear).toBe(70);
      expect(setup.finalDrive).toBe(3.73);
    });

    return baseline;
  });
});

describe('collectTuningTelemetryEvents & revalidateTuningEventsOnSetupChange', () => {
  it('應能在多圈測試行駛中累積事件並進行防抖去重計數', async () => {
    const { evaluateTireTelemetryDiagnosis, collectTuningTelemetryEvents } = await import('./tuningDiagnosis');

    // 模擬第 1 圈彎中推頭
    const diag1 = evaluateTireTelemetryDiagnosis({
      telemetryGripMetrics: {
        maxSlipAngleF: 8.0,
        maxSlipAngleR: 4.0
      }
    });

    const now = 1000000;
    const events1 = collectTuningTelemetryEvents([], diag1, 1, now);
    expect(events1.length).toBeGreaterThanOrEqual(1);
    expect(events1[0].occurrences).toBe(1);
    expect(events1[0].lapNumber).toBe(1);
    expect(events1[0].status).toBe('active');

    // 模擬第 2 圈再度發生推頭 (相隔 5 秒)
    const events2 = collectTuningTelemetryEvents(events1, diag1, 2, now + 5000);
    expect(events2.length).toBe(events1.length);
    const understeerEvt = events2.find(e => e.issueKey.includes('arbFront'));
    expect(understeerEvt).toBeDefined();
    expect(understeerEvt?.occurrences).toBe(2);
    expect(understeerEvt?.lapNumber).toBe(2);
  });

  it('應在採納或手動套用設定後即時將對應事件更新為 applied 狀態', async () => {
    const { revalidateTuningEventsOnSetupChange } = await import('./tuningDiagnosis');

    const mockEvents: any[] = [
      {
        id: 'evt_1',
        timestamp: 1000,
        timeFormatted: '01:23.4',
        phase: 'bump',
        phaseLabel: '路面衝擊',
        title: '懸吊行程極限觸底',
        issueKey: 'bump_bumpFront',
        severity: 'critical',
        occurrences: 3,
        evidence: '前懸吊壓縮率 98%',
        adjustment: {
          name: '前壓縮阻尼 (Front Bump)',
          category: 'damping',
          parameterKey: 'bumpFront',
          current: 6.0,
          target: 7.0,
          delta: 1.0,
          unit: ''
        },
        status: 'active'
      },
      {
        id: 'evt_2',
        timestamp: 2000,
        timeFormatted: '01:28.1',
        phase: 'mid_corner',
        phaseLabel: '彎頂穩態',
        title: '彎中極限推頭飽和',
        issueKey: 'mid_corner_arbFront',
        severity: 'high',
        occurrences: 1,
        evidence: '前滑移角 8.5°',
        adjustment: {
          name: '前防傾桿 (Front ARB)',
          category: 'arb',
          parameterKey: 'arbFront',
          current: 15.0,
          target: 12.5,
          delta: -2.5,
          unit: ''
        },
        status: 'active'
      }
    ];

    // 使用者在 AppliedSetupTable 中採納了前壓縮阻尼 (6.0 -> 7.0)，但尚未調整 ARB (仍為 15.0)
    const updatedSetup = {
      bumpFront: 7.0,
      arbFront: 15.0
    };

    const revalidated = revalidateTuningEventsOnSetupChange(mockEvents, updatedSetup as any);
    const bumpEvt = revalidated.find(e => e.issueKey === 'bump_bumpFront');
    const arbEvt = revalidated.find(e => e.issueKey === 'mid_corner_arbFront');

    expect(bumpEvt?.status).toBe('applied');
    expect(bumpEvt?.obsoleteReason).toContain('已套用調整');
    expect(arbEvt?.status).toBe('active');
  });

  it('應在同參數反向衝突且勝負明確時自動靜默移除落敗建議', async () => {
    const { collectTuningTelemetryEvents } = await import('./tuningDiagnosis');

    // 現存高頻推頭調軟建議 (發生 3 次，分數顯著高於新發生的調硬建議)
    const existingEvents: any[] = [
      {
        id: 'evt_understeer',
        timestamp: 1000,
        timeFormatted: '01:23.4',
        phase: 'mid_corner',
        phaseLabel: '彎頂穩態',
        title: '彎中極限推頭飽和',
        issueKey: 'mid_corner_arbFront',
        severity: 'high',
        occurrences: 3,
        evidence: '前滑移角 8.5°',
        adjustment: {
          name: '前防傾桿 (Front ARB)',
          category: 'arb',
          parameterKey: 'arbFront',
          current: 15.0,
          target: 12.5,
          delta: -2.5,
          unit: '',
          priorityRank: 3,
          confidence: 90
        },
        status: 'active'
      }
    ];

    // 新診斷給出了側傾過大調硬前 ARB 的反向衝突建議 (delta: +2.0，僅發生 1 次，分數落差 > 35)
    const mockDiagConflict: any = {
      specificAdjustments: [
        {
          name: '前防傾桿 (Front ARB)',
          category: 'arb',
          parameterKey: 'arbFront',
          current: 15.0,
          target: 17.0,
          delta: 2.0,
          unit: '',
          priorityRank: 3,
          confidence: 80,
          crossTelemetryEvidence: '前軸左右側傾過大'
        }
      ]
    };

    const updated = collectTuningTelemetryEvents(existingEvents, mockDiagConflict, 2, 20000);
    // 驗證高頻的推頭調軟建議保持 active，而落敗的反向調硬建議被系統自動靜默移除 (不打擾使用者)
    const softenEvt = updated.find(e => e.adjustment.delta < 0);
    const stiffenEvt = updated.find(e => e.adjustment.delta > 0);

    expect(softenEvt?.status).toBe('active');
    expect(stiffenEvt).toBeUndefined();
  });

  it('應在同參數反向衝突且勢均力敵時保留兩者並標記人工決策提示', async () => {
    const { collectTuningTelemetryEvents } = await import('./tuningDiagnosis');

    // 現存推頭調軟建議 (發生 1 次)
    const existingEvents: any[] = [
      {
        id: 'evt_understeer',
        timestamp: 1000,
        timeFormatted: '01:23.4',
        phase: 'mid_corner',
        phaseLabel: '彎頂穩態',
        title: '彎中極限推頭飽和',
        issueKey: 'mid_corner_arbFront',
        severity: 'high',
        occurrences: 1,
        evidence: '前滑移角 8.5°',
        adjustment: {
          name: '前防傾桿 (Front ARB)',
          category: 'arb',
          parameterKey: 'arbFront',
          current: 15.0,
          target: 12.5,
          delta: -2.5,
          unit: '',
          priorityRank: 3,
          confidence: 85
        },
        status: 'active'
      }
    ];

    // 新診斷給出調硬建議 (同樣發生 1 次，優先級與信心度接近，分數差 < 35)
    const mockDiagConflict: any = {
      specificAdjustments: [
        {
          name: '前防傾桿 (Front ARB)',
          category: 'arb',
          parameterKey: 'arbFront',
          current: 15.0,
          target: 17.0,
          delta: 2.0,
          unit: '',
          priorityRank: 3,
          confidence: 85,
          crossTelemetryEvidence: '前軸左右側傾過大'
        }
      ]
    };

    const updated = collectTuningTelemetryEvents(existingEvents, mockDiagConflict, 2, 20000);
    const softenEvt = updated.find(e => e.adjustment.delta < 0);
    const stiffenEvt = updated.find(e => e.adjustment.delta > 0);

    expect(softenEvt).toBeDefined();
    expect(stiffenEvt).toBeDefined();
    expect(softenEvt?.isConflicted).toBe(true);
    expect(stiffenEvt?.isConflicted).toBe(true);
    expect(softenEvt?.conflictNotice).toContain('人工權衡');
    expect(stiffenEvt?.conflictNotice).toContain('人工權衡');
  });

  it('應在套用某方向調整後將相反方向的衝突建議自動靜默清除', async () => {
    const { revalidateTuningEventsOnSetupChange } = await import('./tuningDiagnosis');

    const mockEvents: any[] = [
      {
        id: 'evt_stiffen_arb',
        timestamp: 1000,
        timeFormatted: '01:20.0',
        phase: 'mid_corner',
        phaseLabel: '側傾過大',
        title: '彎中車身過度側傾',
        issueKey: 'roll_arbFront',
        severity: 'medium',
        occurrences: 1,
        evidence: '側傾差大',
        adjustment: {
          name: '前防傾桿 (Front ARB)',
          category: 'arb',
          parameterKey: 'arbFront',
          current: 15.0,
          target: 17.0,
          delta: 2.0,
          unit: ''
        },
        status: 'active',
        isConflicted: true
      },
      {
        id: 'evt_soften_arb',
        timestamp: 1500,
        timeFormatted: '01:22.0',
        phase: 'mid_corner',
        phaseLabel: '彎頂穩態',
        title: '彎中極限推頭飽和',
        issueKey: 'mid_corner_arbFront',
        severity: 'high',
        occurrences: 1,
        evidence: '前滑移角大',
        adjustment: {
          name: '前防傾桿 (Front ARB)',
          category: 'arb',
          parameterKey: 'arbFront',
          current: 15.0,
          target: 12.5,
          delta: -2.5,
          unit: ''
        },
        status: 'active',
        isConflicted: true
      }
    ];

    // 使用者選擇採納了調軟前 ARB (15.0 -> 12.5)
    const updatedSetup = {
      arbFront: 12.5
    };

    const revalidated = revalidateTuningEventsOnSetupChange(mockEvents, updatedSetup as any);
    const stiffenEvt = revalidated.find(e => e.issueKey === 'roll_arbFront');
    const softenEvt = revalidated.find(e => e.issueKey === 'mid_corner_arbFront');

    // 驗證調軟建議成功切換為 applied，而衝突的調硬建議被徹底靜默清除
    expect(softenEvt?.status).toBe('applied');
    expect(stiffenEvt).toBeUndefined();
  });
});



