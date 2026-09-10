import type { CarParams } from '../context/CarParamsContext';
import { drivenAxles } from './telemetrySlipMetrics';
import type { TelemetryDrivetrain } from './telemetrySlipMetrics';

export interface DiagnosisReport {
  suspension: {
    frontBottomOutRate: number; // % of time front suspension >= 0.95
    rearBottomOutRate: number;  // % of time rear suspension >= 0.95
    frontMaxTravel: number;
    rearMaxTravel: number;
    bottomOutSeverity: 'none' | 'low' | 'moderate' | 'high';
    advice: string[];
  };
  jumpAnalysis?: {
    hasJumps: boolean;
    maxHeightDelta: number; // meters
    airtime: number;        // seconds
    maxLandingImpactG: number;
    landingSuspensionMax: number;
    advice: string[];
  };
  driftAnalysis?: {
    avgDriftAngle: number; // degrees
    driftStability: number; // 0 - 100%
    driftTimePercent: number; // % of time drifting
    advice: string[];
  };
  speedAnalysis?: {
    maxSpeed: number;
    speedDropPercent: number; // Speed loss in corners
    powerbandEfficiency: number; // % of acceleration time in powerband
    advice: string[];
  };
  generalAdvice: string[];
}

/**
 * Analyze a telemetry session's data points and generate a comprehensive diagnostic report.
 * 
 * @param points Array of telemetry data points from the session JSON
 * @param carParams Static car parameters
 * @param raceType The selected race goal (e.g. 'Road', 'Rally', 'Drift', 'SpeedZone', 'DangerSign')
 */
export function analyzeTelemetrySession(
  points: any[],
  carParams: CarParams,
  raceType: string
): DiagnosisReport {
  const report: DiagnosisReport = {
    suspension: {
      frontBottomOutRate: 0,
      rearBottomOutRate: 0,
      frontMaxTravel: 0,
      rearMaxTravel: 0,
      bottomOutSeverity: 'none',
      advice: []
    },
    generalAdvice: []
  };

  if (!points || points.length === 0) {
    report.generalAdvice.push("無遙測數據可供分析。請先進行錄製或載入遙測檔案。");
    return report;
  }

  const totalPoints = points.length;

  // 1. --- Suspension Travel & Bottom-Out Analysis ---
  let frontBottomOutCount = 0;
  let rearBottomOutCount = 0;
  let frontMax = 0;
  let rearMax = 0;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const travel = p.SuspTravel || [0.0, 0.0, 0.0, 0.0];
    const fl = travel[0] || 0;
    const fr = travel[1] || 0;
    const rl = travel[2] || 0;
    const rr = travel[3] || 0;

    const frontVal = Math.max(fl, fr);
    const rearVal = Math.max(rl, rr);

    if (frontVal > frontMax) frontMax = frontVal;
    if (rearVal > rearMax) rearMax = rearVal;

    if (frontVal >= 0.95) frontBottomOutCount++;
    if (rearVal >= 0.95) rearBottomOutCount++;
  }

  report.suspension.frontMaxTravel = frontMax;
  report.suspension.rearMaxTravel = rearMax;
  report.suspension.frontBottomOutRate = Number(((frontBottomOutCount / totalPoints) * 100).toFixed(1));
  report.suspension.rearBottomOutRate = Number(((rearBottomOutCount / totalPoints) * 100).toFixed(1));

  const maxRate = Math.max(report.suspension.frontBottomOutRate, report.suspension.rearBottomOutRate);
  if (maxRate > 5.0) {
    report.suspension.bottomOutSeverity = 'high';
  } else if (maxRate > 1.5) {
    report.suspension.bottomOutSeverity = 'moderate';
  } else if (maxRate > 0.2) {
    report.suspension.bottomOutSeverity = 'low';
  } else {
    report.suspension.bottomOutSeverity = 'none';
  }

  // Generate suspension advice
  if (report.suspension.frontBottomOutRate > 1.5) {
    report.suspension.advice.push(
      `前避震觸底率偏高 (${report.suspension.frontBottomOutRate}%)。在煞車或過彎時，前避震完全壓縮，會導致前輪失去部分抓地力並引發推頭。`
    );
    report.suspension.advice.push("建議：調硬前彈簧 5% - 10%，或調高前壓縮阻尼 (Bump Damping) 1.0 - 2.0 點。");
  }
  if (report.suspension.rearBottomOutRate > 1.5) {
    report.suspension.advice.push(
      `後避震觸底率偏高 (${report.suspension.rearBottomOutRate}%)。出彎加速或起步時後避震壓到底，會降低後輪循跡性並可能引發突發性的打滑。`
    );
    report.suspension.advice.push("建議：調硬後彈簧 5% - 10%，或調高後壓縮阻尼 (Bump Damping) 1.0 - 2.0 點。");
  }
  if (maxRate <= 0.2 && raceType !== 'Rally') {
    report.suspension.advice.push("避震器運作行程良好，無明顯觸底現象，彈簧與壓縮阻尼的支撐力充足。");
  }

  // 2. --- Jump & Airtime Analysis (Mainly for Danger Sign or Rally) ---
  // Detect jump: all 4 wheels in the air (SuspTravel < 0.08) for at least 3 consecutive points (~300ms)
  let inAir = false;
  let airtimeStart = 0;
  let jumpStartHeight = 0;
  let maxJumpHeight = 0;
  
  let longestAirtime = 0;
  let maxHeightDelta = 0;
  let landingPeakSusp = 0;
  let landingPeakG = 0;
  let jumpDetected = false;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const travel = p.SuspTravel || [0.0, 0.0, 0.0, 0.0];
    // [PERF] Optimized O(1) manual property access instead of .every() to avoid functional closure allocation and GC pressure in high frequency loops
    const isSuspExtended = travel[0] < 0.08 && travel[1] < 0.08 && travel[2] < 0.08 && travel[3] < 0.08; // all wheels near fully extended
    
    if (isSuspExtended && !inAir) {
      // Start of jump
      inAir = true;
      airtimeStart = p.time;
      jumpStartHeight = p.PositionY || 0;
      maxJumpHeight = p.PositionY || 0;
    } else if (inAir) {
      if (p.PositionY && p.PositionY > maxJumpHeight) {
        maxJumpHeight = p.PositionY;
      }

      if (!isSuspExtended || i === points.length - 1) {
        // Landing detected
        inAir = false;
        const duration = p.time - airtimeStart;
        const hDelta = Math.max(0, maxJumpHeight - jumpStartHeight);
        
        if (duration > 0.3) { // Must be at least 300ms to be a real jump
          jumpDetected = true;
          if (duration > longestAirtime) longestAirtime = duration;
          if (hDelta > maxHeightDelta) maxHeightDelta = hDelta;

          // Scan next 1.0 second for landing impact (peak suspension compression and G force)
          const landingEndIndex = Math.min(points.length, i + 10);
          for (let j = i; j < landingEndIndex; j++) {
            const lp = points[j];
            const lTravel = lp.SuspTravel || [0.0, 0.0, 0.0, 0.0];
            // [PERF] Avoid spread operator (...) which clones the array internally
            const maxLTravel = Math.max(lTravel[0], lTravel[1], lTravel[2], lTravel[3]);
            if (maxLTravel > landingPeakSusp) landingPeakSusp = maxLTravel;

            // Estimate landing G from AccelerationX/Z or simply travel
            const gVal = Math.sqrt(Math.pow(lp.AccelerationX || 0, 2) + Math.pow(lp.AccelerationZ || 0, 2)) / 9.81;
            if (gVal > landingPeakG) landingPeakG = gVal;
          }
        }
      }
    }
  }

  if (jumpDetected || raceType === 'DangerSign') {
    const jumpAdvice: string[] = [];
    if (longestAirtime > 0.5) {
      jumpAdvice.push(`偵測到車輛騰空跳躍：最大滯空時間 ${longestAirtime.toFixed(2)} 秒，最大爬升高度約 ${maxHeightDelta.toFixed(1)} 公尺。`);
      
      if (landingPeakSusp >= 0.98) {
        jumpAdvice.push("落地撞擊力道極大，避震器完全觸底！這會導致底盤重擊路面並使車身反彈失控。");
        jumpAdvice.push("建議：調高車身高度；調硬前/後彈簧 8% - 15%；並將前/後壓縮阻尼 (Bump) 提高 2.0 - 3.0 點以加強吸收落地衝擊。");
      } else if (landingPeakSusp > 0.85) {
        jumpAdvice.push("落地時避震壓縮接近極限，車身姿態尚可維持，但仍有微幅觸底風險。");
        jumpAdvice.push("建議：微幅調高壓縮阻尼 (Bump) 0.5 - 1.0 點。");
      } else {
        jumpAdvice.push("落地緩衝完美，懸吊行程吸收力充足且無反彈威脅。");
      }
    } else {
      jumpAdvice.push("本路段未偵測到明顯的騰空跳躍。若挑戰危險標誌，請確保起飛速度足夠。");
    }

    report.jumpAnalysis = {
      hasJumps: jumpDetected,
      maxHeightDelta: Number(maxHeightDelta.toFixed(1)),
      airtime: Number(longestAirtime.toFixed(2)),
      maxLandingImpactG: Number(landingPeakG.toFixed(2)),
      landingSuspensionMax: landingPeakSusp,
      advice: jumpAdvice
    };
  }

  // 3. --- Drift Analysis (Slip Angle & Yaw Stability) ---
  let driftPointsCount = 0;
  let totalDriftAngleSum = 0;
  
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    // Average rear tire slip angle is a reliable indicator of drift angle
    const slipAngles = p.TireSlipAngle || [0.0, 0.0, 0.0, 0.0];
    const rlSlip = Math.abs(slipAngles[2] || 0) * (180 / Math.PI);
    const rrSlip = Math.abs(slipAngles[3] || 0) * (180 / Math.PI);
    const rearSlipAvg = (rlSlip + rrSlip) / 2;

    // A drift is defined as rear wheels slipping sideways > 8 degrees while moving
    if (rearSlipAvg > 8.0 && p.SpeedMetersPerSecond > 5.0) {
      driftPointsCount++;
      totalDriftAngleSum += rearSlipAvg;
    }
  }

  const driftTimePercent = (driftPointsCount / totalPoints) * 100;

  if (driftPointsCount > 10 || raceType === 'Drift') {
    const avgDriftAngle = driftPointsCount > 0 ? (totalDriftAngleSum / driftPointsCount) : 0;
    const driftAdvice: string[] = [];

    // Calculate stability: standard deviation of lateral G during drift to evaluate smoothness
    let latGVariance = 0;
    if (driftPointsCount > 1) {
      const latGs: number[] = [];
      let latGsSum = 0;
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const slipAngles = p.TireSlipAngle || [0.0, 0.0, 0.0, 0.0];
        const rearSlipAvg = (Math.abs(slipAngles[2]) + Math.abs(slipAngles[3])) / 2 * (180 / Math.PI);
        if (rearSlipAvg > 8.0 && p.SpeedMetersPerSecond > 5.0) {
          const latG = p.AccelerationX / 9.81;
          latGs.push(latG);
          latGsSum += latG;
        }
      }

      const meanLatG = latGsSum / latGs.length;
      let squaredDiffsSum = 0;
      for (let i = 0; i < latGs.length; i++) {
        squaredDiffsSum += Math.pow(latGs[i] - meanLatG, 2);
      }
      const variance = squaredDiffsSum / (latGs.length - 1);
      latGVariance = Math.sqrt(variance); // Standard Deviation
    }

    // Convert standard deviation to a 0-100 score (lower SD = higher stability)
    const driftStabilityScore = Math.max(0, Math.min(100, Math.round(100 - (latGVariance * 180))));

    if (avgDriftAngle > 40) {
      driftAdvice.push(`平均甩尾角度過大 (${avgDriftAngle.toFixed(1)}°)，容易導致車輛失速或打轉 (Spin out)。`);
      driftAdvice.push("建議：降低後輪胎壓以增加後軸抓地力；微幅放軟前防傾桿；或調降後差速器加速 (Rear Accel) 鎖定率。");
    } else if (avgDriftAngle < 15 && raceType === 'Drift') {
      driftAdvice.push(`平均起甩角度過小 (${avgDriftAngle.toFixed(1)}°)，難以維持大角度橫移。`);
      driftAdvice.push("建議：提高後輪胎壓以降低抓地力；調硬後防傾桿；或將差速器設為 100% 雙向鎖定。");
    } else {
      driftAdvice.push(`平均甩尾維持角度良好 (${avgDriftAngle.toFixed(1)}°)，橫移起步順暢。`);
    }

    if (driftStabilityScore < 50 && driftPointsCount > 10) {
      driftAdvice.push(`甩尾穩定度偏低 (${driftStabilityScore}%)。橫向 G 力波動劇烈，代表過彎橫移不夠流暢，有頻繁抖動修正的現象。`);
      driftAdvice.push("建議：將後減速鎖定 (Rear Decel) 調高至 15% - 20% 以穩定收油門動態，並微幅調軟後彈簧。");
    } else if (driftStabilityScore >= 75) {
      driftAdvice.push(`甩尾滑行非常穩定流暢 (${driftStabilityScore}%)，動態維持佳。`);
    }

    report.driftAnalysis = {
      avgDriftAngle: Number(avgDriftAngle.toFixed(1)),
      driftStability: driftStabilityScore,
      driftTimePercent: Number(driftTimePercent.toFixed(1)),
      advice: driftAdvice
    };
  }

  // 4. --- Speed Cornering & Powerband Analysis ---
  let maxSpeed = 0;
  let minSpeedInCorner = 999;
  let entrySpeed = 0;
  let insideCorner = false;
  let maxG = 0;
  
  // Gearing powerband calculations
  let accelTimeCount = 0;
  let insidePowerbandCount = 0;
  const maxHpRpm = carParams.maxHpRpm || 7000;
  const powerbandMin = maxHpRpm * 0.80; // 80% to 105% of peak RPM
  const powerbandMax = maxHpRpm * 1.05;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const speed = p.SpeedMetersPerSecond * 3.6; // convert to km/h
    if (speed > maxSpeed) maxSpeed = speed;

    const latG = Math.abs(p.AccelerationX) / 9.81;
    if (latG > maxG) maxG = latG;

    // Cornering detection (lateral G > 0.45G)
    if (latG > 0.45) {
      if (!insideCorner) {
        insideCorner = true;
        const entryPt = points[Math.max(0, i - 5)];
        entrySpeed = entryPt.SpeedMetersPerSecond * 3.6;
      }
      if (speed < minSpeedInCorner) {
        minSpeedInCorner = speed;
      }
    } else if (insideCorner && latG < 0.3) {
      insideCorner = false;
    }

    // Powerband efficiency during heavy throttle
    if (p.AccelInput > 200 && p.Gear > 0) {
      accelTimeCount++;
      const rpm = p.CurrentEngineRpm || 0;
      if (rpm >= powerbandMin && rpm <= powerbandMax) {
        insidePowerbandCount++;
      }
    }
  }

  const speedDrop = entrySpeed > 0 ? ((entrySpeed - minSpeedInCorner) / entrySpeed) * 100 : 0;
  const powerbandEff = accelTimeCount > 0 ? (insidePowerbandCount / accelTimeCount) * 100 : 0;

  if (raceType === 'SpeedZone' || maxSpeed > 50) {
    const speedAdvice: string[] = [];
    if (speedDrop > 35 && raceType === 'SpeedZone') {
      speedAdvice.push(`彎中速度流失較多 (${speedDrop.toFixed(1)}%)。極限橫向 G 力達 ${maxG.toFixed(2)}G，但車速驟降。`);
      speedAdvice.push("建議：微幅調降空氣下壓力 (Aero) 以減少拖曳風阻；或微調前防傾桿以改善彎中推頭。");
    } else if (maxG < 0.9 && raceType === 'SpeedZone') {
      speedAdvice.push(`極限彎中 G 力僅為 ${maxG.toFixed(2)}G，未能充分發揮輪胎抓地性能。`);
      speedAdvice.push("建議：調硬彈簧與防傾桿，並適度調高前/後下壓力。");
    } else {
      speedAdvice.push(`彎道速度保持良好，最大橫向力達 ${maxG.toFixed(2)}G。`);
    }

    if (accelTimeCount > 15) {
      if (powerbandEff < 60) {
        speedAdvice.push(`加速動力效率偏低 (${powerbandEff.toFixed(1)}%)。引擎轉速在換檔後頻繁跌落至最大馬力區間之外。`);
        speedAdvice.push("建議：在「變速箱」齒輪比計算中，調密各檔位齒輪比，或調大終傳比 (Final Drive) 以維持高 RPM 出力。");
      } else {
        speedAdvice.push(`引擎轉速在加速時完美契合馬力高原 (${powerbandEff.toFixed(1)}%)，換檔動力無斷層。`);
      }
    }

    report.speedAnalysis = {
      maxSpeed: Number(maxSpeed.toFixed(1)),
      speedDropPercent: Number(Math.max(0, speedDrop).toFixed(1)),
      powerbandEfficiency: Number(powerbandEff.toFixed(1)),
      advice: speedAdvice
    };
  }

  // 5. --- General Advice aggregation ---
  if (report.suspension.bottomOutSeverity === 'high') {
    report.generalAdvice.push("【嚴重】懸吊系統在測試過程中發生嚴重觸底。這會導致車身失控並阻礙輪胎發揮抓地力，請立即增加彈簧磅數或壓縮阻尼。");
  }
  if (report.jumpAnalysis?.hasJumps && report.jumpAnalysis.landingSuspensionMax >= 0.98) {
    report.generalAdvice.push("【警告】車輛跳躍落地衝擊過大，避震器完全觸底，落地後車尾極易擺動打滑。請調硬懸吊與增加車高。");
  }
  if (report.driftAnalysis && report.driftAnalysis.driftStability < 50) {
    report.generalAdvice.push("【提示】甩尾過程中有頻繁的方向盤反打與車身動態抖動現象。可微幅調軟後防傾桿或增強後軸減速鎖定率。");
  }
  if (report.speedAnalysis && report.speedAnalysis.powerbandEfficiency < 60 && accelTimeCount > 15) {
    report.generalAdvice.push("【齒比】加速時引擎轉速多次掉出馬力區間，建議調整各檔位齒比使其更緊密，充分釋放引擎馬力。");
  }

  if (report.generalAdvice.length === 0) {
    report.generalAdvice.push("恭喜！此遙測 Session 分析中未發現明顯的操控性或懸吊幾何缺陷，車輛配置已十分均衡。");
  }

  return report;
}

export interface AppliedTuningSetup {
  // 胎壓 (Stored as PSI)
  tirePressureFront: number;
  tirePressureRear: number;

  // 定位角度 (Degrees)
  camberFront: number;
  camberRear: number;
  toeFront: number;
  toeRear: number;
  caster: number;

  // 防傾桿 ARB (1.0 - 65.0)
  arbFront: number;
  arbRear: number;

  // 彈簧與車高
  springsFront: number;
  springsRear: number;
  rideHeightFront: number;
  rideHeightRear: number;

  // 阻尼 (1.0 - 20.0)
  reboundFront: number;
  reboundRear: number;
  bumpFront: number;
  bumpRear: number;

  // 差速器 (0 - 100%)
  diffAccelFront?: number;
  diffDecelFront?: number;
  diffAccelRear: number;
  diffDecelRear: number;
  diffCenterRear?: number;

  // 齒輪比
  finalDrive?: number;
}

export interface SpecificAdjustmentItem {
  name: string;
  category: 'tire_pressure' | 'alignment' | 'arb' | 'springs' | 'damping' | 'differential' | 'gearing';
  parameterKey: keyof AppliedTuningSetup;
  current: number;
  target: number;
  delta: number;
  unit: string;
  reason?: string;
  priorityRank?: number; // 1 = Highest primary root-cause
  phase?: 'entry' | 'mid_corner' | 'exit' | 'braking' | 'bump' | 'powerband' | 'thermal';
  confidence?: number; // 0 to 100%
  crossTelemetryEvidence?: string;
}

export interface TuningTelemetryEvent {
  id: string;
  timestamp: number;
  timeFormatted: string;
  lapNumber?: number;
  phase: 'entry' | 'mid_corner' | 'exit' | 'braking' | 'bump' | 'powerband' | 'thermal';
  phaseLabel: string;
  title: string;
  issueKey: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  occurrences: number; // 累計發生次數
  evidence: string; // 交叉遙測證據
  adjustment: SpecificAdjustmentItem;
  status: 'active' | 'applied' | 'obsolete';
  isConflicted?: boolean; // 標記是否處於待人工決策之衝突狀態
  conflictNotice?: string; // 人工決策提示說明
  obsoleteReason?: string;
}

export interface TelemetryGripMetrics {
  // FH6 Data Out normalized coefficients. They are not physical percentages or degrees.
  hasCompleteNormalizedSlipRatio?: boolean;
  hasCompleteNormalizedSlipAngle?: boolean;
  avgNormalizedSlipRatioF?: number;
  avgNormalizedSlipRatioR?: number;
  maxAbsNormalizedSlipRatioF?: number;
  maxAbsNormalizedSlipRatioR?: number;
  normalizedSlipRatioFL?: number;
  normalizedSlipRatioFR?: number;
  normalizedSlipRatioRL?: number;
  normalizedSlipRatioRR?: number;

  maxNormalizedSlipAngleF?: number;
  maxNormalizedSlipAngleR?: number;
  normalizedSlipAngleFL?: number;
  normalizedSlipAngleFR?: number;
  normalizedSlipAngleRL?: number;
  normalizedSlipAngleRR?: number;

  // 4-Wheel Normalized Suspension Travel (0.0 to 1.0)
  maxSuspTravelF?: number;
  maxSuspTravelR?: number;
  suspTravelFL?: number;
  suspTravelFR?: number;
  suspTravelRL?: number;
  suspTravelRR?: number;

  // 4-Wheel Tire Temperatures (in user temp unit: C or F)
  tireTempFL?: number;
  tireTempFR?: number;
  tireTempRL?: number;
  tireTempRR?: number;

  // Inertial & G-Forces
  accelXG?: number; // Lateral G
  accelYG?: number; // Vertical G
  accelZG?: number; // Longitudinal G
  pitchRad?: number;
  rollRad?: number;
  yawRad?: number;

  // Powertrain & Gearing
  currentRpm?: number;
  engineMaxRpm?: number;
  currentGear?: number;
  speedKmh?: number;
  powerHp?: number;
  torqueNm?: number;
  boostPsi?: number;

  // Driver Inputs (0 to 255 or -127 to 127)
  steerInput?: number;
  accelInput?: number;
  brakeInput?: number;
  clutchInput?: number;
  handbrakeInput?: number;
}

export interface TireDiagnosisInput {
  tempF?: number; // Front axle average temp (deg C or deg F)
  tempR?: number; // Rear axle average temp (deg C or deg F)
  photF?: number; // Optional observed front hot pressure (PSI)
  photR?: number; // Optional observed rear hot pressure (PSI)
  targetPhot?: number; // Optional target hot pressure (PSI)
  handlingIssue?: string; // Optional subjective handling anomaly
  tempUnit?: 'C' | 'F'; // Default 'C'
  currentSetup?: AppliedTuningSetup | null; // User-applied customizable setup baseline
  alignment?: {
    camber: { front: number; rear: number };
    toe: { front: number | string; rear: number | string };
    caster: number;
    pcF?: number;
    pcR?: number;
  } | null;
  chassis?: {
    arb: { front: number; rear: number };
    springs: { front: number; rear: number; heightF: number; heightR: number };
    damping: { reboundF: number; reboundR: number; bumpF: number; bumpR: number };
    diff: { accelF?: number; decelF?: number; accelR: number; decelR: number; centerRear?: number };
  } | null;
  drivetrain?: TelemetryDrivetrain;
  telemetryGripMetrics?: TelemetryGripMetrics | null;
}

export interface TireDiagnosisResult {
  deltaTaxle: number;
  axleBalanceStatus: 'balanced' | 'front_overheat' | 'rear_overheat';
  biasF?: number;
  biasR?: number;
  primaryTelemetryDirective: string;
  secondarySuspensionAdvice: string;
  isConverged: boolean;
  specificAdjustments: SpecificAdjustmentItem[];
  primaryRecommendedAdjustment?: SpecificAdjustmentItem;
  detectedCornerPhase?: string;
  gripAnalysisAdvice: string[];
}

/**
 * Pure function to construct the initial baseline setup values from previous steps.
 */
export function buildBaselineSetup(
  _carParams: CarParams | null = null,
  chassis?: {
    arb: { front: number; rear: number };
    springs: { front: number; rear: number; heightF: number; heightR: number };
    damping: { reboundF: number; reboundR: number; bumpF: number; bumpR: number };
    diff: { accelF?: number; decelF?: number; accelR: number; decelR: number; centerRear?: number };
  } | null,
  alignment?: {
    camber: { front: number; rear: number };
    toe: { front: number | string; rear: number | string };
    caster: number;
    pcF?: number;
    pcR?: number;
  } | null,
  _targetPhot?: number,
  gearing?: { finalDrive: number } | null
): AppliedTuningSetup {
  const parseNum = (val: number | string | undefined, defaultVal: number) => {
    if (val === undefined || val === null) return defaultVal;
    if (typeof val === 'number') return val;
    const parsed = parseFloat(String(val).replace('°', '').replace('+', ''));
    return isNaN(parsed) ? defaultVal : parsed;
  };

  return {
    tirePressureFront: alignment?.pcF ?? 28.5,
    tirePressureRear: alignment?.pcR ?? 28.5,
    camberFront: alignment?.camber?.front ?? -1.5,
    camberRear: alignment?.camber?.rear ?? -1.0,
    toeFront: parseNum(alignment?.toe?.front, 0.0),
    toeRear: parseNum(alignment?.toe?.rear, 0.0),
    caster: alignment?.caster ?? 5.5,
    arbFront: chassis?.arb?.front ?? 15.0,
    arbRear: chassis?.arb?.rear ?? 35.0,
    springsFront: chassis?.springs?.front ?? 50.0,
    springsRear: chassis?.springs?.rear ?? 50.0,
    rideHeightFront: chassis?.springs?.heightF ?? 12.0,
    rideHeightRear: chassis?.springs?.heightR ?? 12.0,
    reboundFront: chassis?.damping?.reboundF ?? 10.0,
    reboundRear: chassis?.damping?.reboundR ?? 10.0,
    bumpFront: chassis?.damping?.bumpF ?? 6.0,
    bumpRear: chassis?.damping?.bumpR ?? 6.0,
    diffAccelFront: chassis?.diff?.accelF,
    diffDecelFront: chassis?.diff?.decelF,
    diffAccelRear: chassis?.diff?.accelR ?? 50,
    diffDecelRear: chassis?.diff?.decelR ?? 20,
    diffCenterRear: chassis?.diff?.centerRear,
    finalDrive: gearing?.finalDrive
  };
}

/**
 * Closed-Loop Telemetry Diagnosis driven by objective telemetry signals:
 * Tire Temperatures, Slip Angles, Slip Ratios, and Suspension Travel.
 */
export function evaluateTireTelemetryDiagnosis(
  input: TireDiagnosisInput
): TireDiagnosisResult {
  const {
    tempF,
    tempR,
    photF,
    photR,
    targetPhot = 32.5,
    handlingIssue = 'none',
    tempUnit = 'C',
    currentSetup,
    alignment,
    drivetrain,
    telemetryGripMetrics
  } = input;

  const tempLabel = tempUnit === 'F' ? '°F' : '°C';

  // Resolve active temperatures from live telemetry or manual input
  const resolvedTempF = tempF ?? (
    telemetryGripMetrics?.tireTempFL !== undefined && telemetryGripMetrics?.tireTempFR !== undefined
      ? (telemetryGripMetrics.tireTempFL + telemetryGripMetrics.tireTempFR) / 2
      : (tempUnit === 'F' ? 194 : 90)
  );
  const resolvedTempR = tempR ?? (
    telemetryGripMetrics?.tireTempRL !== undefined && telemetryGripMetrics?.tireTempRR !== undefined
      ? (telemetryGripMetrics.tireTempRL + telemetryGripMetrics.tireTempRR) / 2
      : (tempUnit === 'F' ? 194 : 90)
  );

  // Normalize temperature to Celsius for threshold comparisons
  const tempFC = tempUnit === 'F' ? (resolvedTempF - 32) * 5 / 9 : resolvedTempF;
  const tempRC = tempUnit === 'F' ? (resolvedTempR - 32) * 5 / 9 : resolvedTempR;
  const deltaTaxleC = Math.round((tempFC - tempRC) * 10) / 10;
  const deltaTaxle = Math.round((resolvedTempF - resolvedTempR) * 10) / 10;

  let axleBalanceStatus: 'balanced' | 'front_overheat' | 'rear_overheat' = 'balanced';
  if (Math.abs(deltaTaxleC) <= 3.0) {
    axleBalanceStatus = 'balanced';
  } else if (deltaTaxleC > 3.0) {
    axleBalanceStatus = 'front_overheat';
  } else {
    axleBalanceStatus = 'rear_overheat';
  }

  const parseNum = (val: number | string | undefined, defaultVal: number) => {
    if (val === undefined || val === null) return defaultVal;
    if (typeof val === 'number') return val;
    const parsed = parseFloat(String(val).replace('°', '').replace('+', ''));
    return isNaN(parsed) ? defaultVal : parsed;
  };

  // Resolve current active tuning values: prioritize currentSetup if provided
  const currentPressureF = currentSetup?.tirePressureFront ?? alignment?.pcF ?? 28.5;
  const currentPressureR = currentSetup?.tirePressureRear ?? alignment?.pcR ?? 28.5;
  const currentCamberF = currentSetup?.camberFront ?? alignment?.camber?.front ?? -1.5;
  // const currentCamberR = currentSetup?.camberRear ?? alignment?.camber?.rear ?? -1.0;
  const currentToeF = currentSetup?.toeFront ?? parseNum(alignment?.toe?.front, 0.0);
  const currentToeR = currentSetup?.toeRear ?? parseNum(alignment?.toe?.rear, 0.0);
  // const currentCaster = currentSetup?.caster ?? alignment?.caster ?? 5.5;
  // const currentDecelR = currentSetup?.diffDecelRear ?? chassis?.diff?.decelR ?? 20;

  const clamp = (val: number, min: number, max: number) =>
    Math.min(max, Math.max(min, Number(val.toFixed(2))));

  const specificAdjustments: SpecificAdjustmentItem[] = [];
  const gripAnalysisAdvice: string[] = [];

  // 1. Telemetry Grip & Slip Analysis (Primary Objective Truth)
  let primaryTelemetryDirective = '';
  let hasDynamicIssue = false;
  let detectedCornerPhase = '綜合動態評估 (General Dynamic Evaluation)';

  if (telemetryGripMetrics) {
    const {
       // FH6 normalized slip coefficients. Their physical scale is not inferred here.
       hasCompleteNormalizedSlipRatio = false,
       hasCompleteNormalizedSlipAngle = false,
       maxAbsNormalizedSlipRatioF = 0,
       maxAbsNormalizedSlipRatioR = 0,
       maxNormalizedSlipAngleF = 0,
       maxNormalizedSlipAngleR = 0,

      // 4-Wheel Normalized Suspension Travel (0.0 to 1.0, Bottoming & Roll Analysis)
      maxSuspTravelF = 0,
      maxSuspTravelR = 0,
      suspTravelFL,
      suspTravelFR,
      suspTravelRL,
      suspTravelRR,

      // 4-Wheel Tire Temperatures (deg C or deg F, Thermal Equilibrium)
      tireTempFL,
      tireTempFR,
      tireTempRL,
      tireTempRR,

      // Inertial G-Forces & Vehicle Attitude
      accelXG,
      // accelYG,
      // accelZG,
      // pitchRad,
      // rollRad,
      // yawRad,

      // Powertrain, Powerband & Gearing
      currentRpm,
      engineMaxRpm,
      currentGear,
      speedKmh,
      // powerHp,
      // torqueNm,
      // boostPsi,

      // Driver Controls Inputs (Corner Phase Segmentation: Entry / Mid / Exit)
      // steerInput,
      accelInput
      // brakeInput,
      // clutchInput,
      // handbrakeInput
    } = telemetryGripMetrics;

    // Detect dynamic cornering phase
    const bIn = telemetryGripMetrics.brakeInput ?? 0;
    const aIn = accelInput ?? 0;
    const sIn = telemetryGripMetrics.steerInput ?? 0;
    const latG = Math.abs(accelXG ?? 0);
    const lonG = telemetryGripMetrics.accelZG ?? 0;

    if (bIn > 40 && Math.abs(sIn) < 15) {
      detectedCornerPhase = '直線重煞減速期 (Straight Braking)';
    } else if (bIn > 20 && Math.abs(sIn) >= 15) {
      detectedCornerPhase = '入彎循跡剎車期 (Turn-in / Trail-braking)';
    } else if (latG > 0.6 && aIn < 120 && bIn < 20) {
      detectedCornerPhase = '彎頂極限穩態期 (Mid-Corner Apex)';
    } else if (aIn > 150 && lonG > 0.15) {
      detectedCornerPhase = '出彎大油門加速期 (Corner Exit / Power-on)';
    }

    if (!hasCompleteNormalizedSlipRatio || !hasCompleteNormalizedSlipAngle) {
      hasDynamicIssue = true;
      gripAnalysisAdvice.push('【遙測滑移資料未就緒】ANG 與 RAT 必須都有四輪有限值，才能評估是否存在情境化警訊。');
    }

    // A. Normalized lateral-slip warning. A single normalized sample cannot identify
    // an ARB or alignment cause, so preserve it as evidence for a repeatable run.
    if (hasCompleteNormalizedSlipAngle && latG > 0.6 && (maxNormalizedSlipAngleF > 1 || maxNormalizedSlipAngleR > 1)) {
      hasDynamicIssue = true;
      gripAnalysisAdvice.push(`【彎中正規化滑移警訊】前軸 ${maxNormalizedSlipAngleF.toFixed(2)}、後軸 ${maxNormalizedSlipAngleR.toFixed(2)}。請在相同路段、速度與轉向輸入下重複採樣；此訊號不能單獨推導 ARB 或定位調整。`);
    }

    // Normalized endpoints do not prove bottoming or identify a damping cause.
    if (maxSuspTravelF >= 0.95 || maxSuspTravelR >= 0.95) {
      hasDynamicIssue = true;
      const loc = maxSuspTravelF >= 0.95 && maxSuspTravelR >= 0.95 ? '前後' : (maxSuspTravelF >= 0.95 ? '前' : '後');
      const peakVal = Math.max(maxSuspTravelF, maxSuspTravelR);
      gripAnalysisAdvice.push(`【懸吊近壓縮端警訊】${loc}軸正規化行程達 ${peakVal.toFixed(2)}。請記錄相同路段的持續時間、逐輪行程、車速與垂直加速度；單筆近端點數據不能確認觸底，也不能決定彈簧、車高或阻尼的調整幅度。`);
    }

    // C. Braking context can flag a normalized coefficient, but does not prove a
    // camber or brake-bias cause without repeatable wheel-speed/load evidence.
    if (hasCompleteNormalizedSlipRatio && bIn > 40 && (maxAbsNormalizedSlipRatioF > 1 || maxAbsNormalizedSlipRatioR > 1)) {
      hasDynamicIssue = true;
      gripAnalysisAdvice.push(`【煞車正規化滑移警訊】前軸最大絕對值 ${maxAbsNormalizedSlipRatioF.toFixed(2)}、後軸最大絕對值 ${maxAbsNormalizedSlipRatioR.toFixed(2)}。請以相同煞車輸入與路段重複採樣；單次資料不能推導外傾角或煞車設定。`);
    }

    // D. Power-on warning only considers driven axle(s), but does not prescribe
    // differential lock because normalized slip alone is not causal evidence.
    const driven = drivetrain ? drivenAxles(drivetrain) : [];
    const drivenRatio = driven.map((axle) => axle === 'front' ? maxAbsNormalizedSlipRatioF : maxAbsNormalizedSlipRatioR);
    if (hasCompleteNormalizedSlipRatio && aIn > 150 && lonG > 0.15 && !drivetrain) {
      hasDynamicIssue = true;
      gripAnalysisAdvice.push('【出彎滑移待判讀】缺少驅動型式，無法決定應檢視前軸、後軸或兩者；請先提供 FWD、RWD 或 AWD。');
    } else if (hasCompleteNormalizedSlipRatio && aIn > 150 && lonG > 0.15 && drivenRatio.some((value) => value > 1)) {
      hasDynamicIssue = true;
      const axleEvidence = driven.map((axle) => axle === 'front'
        ? `前軸 FL ${telemetryGripMetrics.normalizedSlipRatioFL?.toFixed(2) ?? 'n/a'} / FR ${telemetryGripMetrics.normalizedSlipRatioFR?.toFixed(2) ?? 'n/a'}`
        : `後軸 RL ${telemetryGripMetrics.normalizedSlipRatioRL?.toFixed(2) ?? 'n/a'} / RR ${telemetryGripMetrics.normalizedSlipRatioRR?.toFixed(2) ?? 'n/a'}`).join('、');
      gripAnalysisAdvice.push(`【出彎驅動軸正規化滑移警訊】${axleEvidence}。請重複相同出彎、油門與檔位，並交叉比對輪速、路面與差速設定；此訊號不會直接產生差速器調整。`);
    }

    // Normalized travel differences do not identify physical roll stiffness.
    if ([suspTravelFL, suspTravelFR, suspTravelRL, suspTravelRR].every(value => Number.isFinite(value))) {
      const rollF = Math.abs(suspTravelFL! - suspTravelFR!);
      const rollR = Math.abs(suspTravelRL! - suspTravelRR!);
      if (latG > 0.6 && rollF - rollR > 0.18) {
        hasDynamicIssue = true;
        gripAnalysisAdvice.push(`【前後軸行程差待比對】前軸左右正規化行程差 ${rollF.toFixed(2)}、後軸 ${rollR.toFixed(2)}。請比較相同彎段、速度與操控輸入的逐輪滑移和經過時間；行程差不能直接換算側傾剛度，也不足以推導前防傾桿應加硬。`);
      }
    }

    // Redline fraction is a sampling cue, not a measured powerband or shift event.
    if (
      Number.isFinite(currentRpm) && currentRpm! > 0 &&
      Number.isFinite(engineMaxRpm) && engineMaxRpm! > 0 &&
      (accelInput ?? 0) > 200 &&
      (currentGear ?? 0) > 1
    ) {
      const rpmRatio = currentRpm! / engineMaxRpm!;
      if (rpmRatio < 0.60 && (speedKmh ?? 0) > 60) {
        hasDynamicIssue = true;
        gripAnalysisAdvice.push(`【加速低轉速待比對】目前轉速為紅線的 ${(rpmRatio * 100).toFixed(0)}%。請記錄相同路段的檔位變化、轉速、功率與縱向加速度，確認是否持續落在已量測的有效動力區間之外；單筆資料不能確認換檔落差或決定終傳調整量。`);
      }
    }

    // G. 4-Wheel Thermal Balance
    if (tireTempFL !== undefined && tireTempFR !== undefined && tireTempRL !== undefined && tireTempRR !== undefined) {
      const leftAvg = (tireTempFL + tireTempRL) / 2;
      const rightAvg = (tireTempFR + tireTempRR) / 2;
      const sideDelta = Math.round(Math.abs(leftAvg - rightAvg) * 10) / 10;
      if (sideDelta > 6.0) {
        gripAnalysisAdvice.push(`【左右熱負載不均】左右側輪胎平均溫差達 ${sideDelta}${tempLabel}，單側受載較重。`);
      }
    }
  }

  // 2. Fallback or Supplementary Handling Anomaly Directives (if selected)
  if (handlingIssue === 'understeer_entry' && !specificAdjustments.some(a => a.parameterKey === 'toeFront')) {
    const targetToeF = clamp(currentToeF + 0.1, -1.0, 1.0);
    specificAdjustments.push({
      name: '前輪束角 (Front Toe)',
      category: 'alignment',
      parameterKey: 'toeFront',
      current: currentToeF,
      target: targetToeF,
      delta: 0.1,
      unit: '°',
      priorityRank: 3,
      phase: 'entry',
      confidence: 80,
      reason: '增加前輪外展束角 (Toe-out) 可改善入彎推頭'
    });
  } else if (handlingIssue === 'understeer_mid' && !specificAdjustments.some(a => a.parameterKey === 'camberFront')) {
    const targetCamberF = clamp(currentCamberF - 0.3, -5.0, 0.0);
    specificAdjustments.push({
      name: '前輪外傾角 (Front Camber)',
      category: 'alignment',
      parameterKey: 'camberFront',
      current: currentCamberF,
      target: targetCamberF,
      delta: -0.3,
      unit: '°',
      priorityRank: 3,
      phase: 'mid_corner',
      confidence: 85,
      reason: '增加前負外傾角以補償彎中輪胎變形'
    });
  } else if (handlingIssue === 'oversteer_snap' && !specificAdjustments.some(a => a.parameterKey === 'diffDecelRear')) {
    const targetToeR = clamp(currentToeR - 0.1, -1.0, 1.0);
    specificAdjustments.push({
      name: '後輪束角 (Rear Toe)',
      category: 'alignment',
      parameterKey: 'toeRear',
      current: currentToeR,
      target: targetToeR,
      delta: -0.1,
      unit: '°',
      priorityRank: 3,
      phase: 'entry',
      confidence: 80,
      reason: '增加後輪內收束角 (Toe-in) 以穩定車尾'
    });
  }

  // Axle temperature difference alone does not identify roll stiffness or
  // differential changes. Keep it as an observation, not a numeric adjustment.

  // Optional manual hot pressure bias evaluation (if provided)
  let biasF: number | undefined = undefined;
  let biasR: number | undefined = undefined;
  if (photF !== undefined && photF > 0 && photR !== undefined && photR > 0) {
    biasF = Math.round((photF - targetPhot) * 10) / 10;
    biasR = Math.round((photR - targetPhot) * 10) / 10;

    if (Math.abs(biasF) > 0.3 && !specificAdjustments.some(a => a.parameterKey === 'tirePressureFront')) {
      const targetPressureF = clamp(currentPressureF - biasF, 15.0, 55.0);
      specificAdjustments.push({
        name: '前冷胎壓 (Front Cold Pressure)',
        category: 'tire_pressure',
        parameterKey: 'tirePressureFront',
        current: currentPressureF,
        target: targetPressureF,
        delta: Number((-biasF).toFixed(1)),
        unit: 'PSI',
        priorityRank: 7,
        phase: 'thermal',
        confidence: 70,
        reason: `實測前熱胎壓 (${photF.toFixed(1)} PSI) 與目標 (${targetPhot.toFixed(1)} PSI) 存在偏差`
      });
    }

    if (Math.abs(biasR) > 0.3 && !specificAdjustments.some(a => a.parameterKey === 'tirePressureRear')) {
      const targetPressureR = clamp(currentPressureR - biasR, 15.0, 55.0);
      specificAdjustments.push({
        name: '後冷胎壓 (Rear Cold Pressure)',
        category: 'tire_pressure',
        parameterKey: 'tirePressureRear',
        current: currentPressureR,
        target: targetPressureR,
        delta: Number((-biasR).toFixed(1)),
        unit: 'PSI',
        priorityRank: 7,
        phase: 'thermal',
        confidence: 70,
        reason: `實測後熱胎壓 (${photR.toFixed(1)} PSI) 與目標 (${targetPhot.toFixed(1)} PSI) 存在偏差`
      });
    }
  }

  // Sort adjustments by priority rank (1 is highest) and confidence
  specificAdjustments.sort((a, b) => {
    const rankA = a.priorityRank ?? 99;
    const rankB = b.priorityRank ?? 99;
    if (rankA !== rankB) return rankA - rankB;
    return (b.confidence ?? 0) - (a.confidence ?? 0);
  });

  // Extract the single primary key recommendation
  const primaryRecommendedAdjustment = specificAdjustments.length > 0 ? specificAdjustments[0] : undefined;

  // Summary Directives
  const isConverged = !hasDynamicIssue && Math.abs(deltaTaxleC) <= 3.0 && specificAdjustments.length === 0;

  if (isConverged) {
    primaryTelemetryDirective = '目前沒有在既定情境中出現正規化滑移或懸吊警訊；這不等同完成車輛物理校準。';
  } else if (primaryRecommendedAdjustment) {
    primaryTelemetryDirective = `【第一優先關鍵調整】建議優先調整「${primaryRecommendedAdjustment.name}」(${primaryRecommendedAdjustment.current} → ${primaryRecommendedAdjustment.target})。依據：${primaryRecommendedAdjustment.crossTelemetryEvidence || primaryRecommendedAdjustment.reason}`;
  } else {
    primaryTelemetryDirective = '偵測到情境化遙測警訊，但現有資料不足以推導一鍵調校。請依提示在可重複條件下補採並交叉比對。';
  }

  let secondarySuspensionAdvice = '';
  if (axleBalanceStatus === 'front_overheat') {
    secondarySuspensionAdvice = `前軸熱負荷偏高 (溫差 +${deltaTaxle.toFixed(1)}${tempLabel})：請分別比較暖胎後的制動、彎中與加速路段。單靠軸溫差無法判定防傾桿調整方向或幅度。`;
  } else if (axleBalanceStatus === 'rear_overheat') {
    secondarySuspensionAdvice = `後軸熱負荷偏高 (溫差 ${deltaTaxle.toFixed(1)}${tempLabel})：請分別比較暖胎後的制動、彎中與加速路段。單靠軸溫差無法判定防傾桿或差速器設定。`;
  } else {
    secondarySuspensionAdvice = '目前前後軸平均胎溫接近；這不能證明輪荷、定位或前後剛性配比理想。';
  }

  return {
    deltaTaxle,
    axleBalanceStatus,
    biasF,
    biasR,
    primaryTelemetryDirective,
    secondarySuspensionAdvice,
    isConverged,
    specificAdjustments,
    primaryRecommendedAdjustment,
    detectedCornerPhase,
    gripAnalysisAdvice
  };
}

/**
 * Accumulate and deduplicate telemetry diagnosis notification events during test drive laps.
 */
export function collectTuningTelemetryEvents(
  existingEvents: TuningTelemetryEvent[],
  diagResult: TireDiagnosisResult,
  lapNumber?: number,
  nowMs: number = Date.now()
): TuningTelemetryEvent[] {
  if (!diagResult.specificAdjustments || diagResult.specificAdjustments.length === 0) {
    return existingEvents;
  }

  const updatedEvents = [...existingEvents];
  const dateObj = new Date(nowMs);
  const timeFormatted = `${String(dateObj.getMinutes()).padStart(2, '0')}:${String(dateObj.getSeconds()).padStart(2, '0')}.${String(Math.floor(dateObj.getMilliseconds() / 100))}`;

  for (const adj of diagResult.specificAdjustments) {
    const issueKey = `${adj.phase || 'general'}_${String(adj.parameterKey)}`;
    const existingIdx = updatedEvents.findIndex(e => e.issueKey === issueKey);

    if (existingIdx >= 0) {
      const existing = updatedEvents[existingIdx];
      // Debounce: update if at least 2 seconds passed since last occurrence
      if (nowMs - existing.timestamp >= 2000) {
        updatedEvents[existingIdx] = {
          ...existing,
          timestamp: nowMs,
          timeFormatted,
          lapNumber: lapNumber ?? existing.lapNumber,
          occurrences: existing.occurrences + 1,
          evidence: adj.crossTelemetryEvidence || adj.reason || existing.evidence,
          adjustment: adj,
          // Re-activate if it was obsolete but condition triggered again
          status: existing.status === 'applied' ? 'applied' : 'active'
        };
      }
    } else {
      let title = '';
      let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium';

      if (adj.phase === 'bump') {
        title = '懸吊行程極限觸底';
        severity = 'critical';
      } else if (adj.phase === 'braking') {
        title = '重煞車前輪鎖死抱死';
        severity = 'high';
      } else if (adj.phase === 'mid_corner') {
        title = adj.delta < 0 ? '彎中極限推頭飽和' : '彎中車身過度側傾';
        severity = 'high';
      } else if (adj.phase === 'exit') {
        title = '出彎開油驅動輪打滑';
        severity = 'medium';
      } else if (adj.phase === 'powerband') {
        title = '換檔引擎轉速斷層';
        severity = 'medium';
      } else {
        title = '前後軸熱負荷不均';
        severity = 'low';
      }

      // Check for opposite-direction conflict on the same parameter
      const conflictingActiveIdx = updatedEvents.findIndex(
        e => e.status === 'active' &&
             e.adjustment.parameterKey === adj.parameterKey &&
             ((e.adjustment.delta > 0 && adj.delta < 0) || (e.adjustment.delta < 0 && adj.delta > 0))
      );

      if (conflictingActiveIdx >= 0) {
        const conf = updatedEvents[conflictingActiveIdx];
        const rankScore = (rank?: number) => (10 - (rank ?? 9)) * 100;
        const existingScore = rankScore(conf.adjustment.priorityRank) + conf.occurrences * 25 + (conf.adjustment.confidence ?? 70);
        const newScore = rankScore(adj.priorityRank) + 1 * 25 + (adj.confidence ?? 70);
        const deltaScore = Math.abs(existingScore - newScore);

        if (deltaScore >= 35) {
          // Clear-cut arbitration: automatically purge the losing suggestion silently without bothering the user
          if (existingScore > newScore) {
            // Existing suggestion decisively wins; ignore new conflicting suggestion silently
            continue;
          } else {
            // New suggestion decisively wins; silently remove the existing inferior suggestion
            updatedEvents.splice(conflictingActiveIdx, 1);
          }
        } else {
          // Ambiguous / Tie: cannot deterministically arbitrate -> retain both with Manual Decision Prompt
          updatedEvents[conflictingActiveIdx] = {
            ...conf,
            isConflicted: true,
            conflictNotice: `同參數反向衝突：需人工權衡（${conf.title} vs ${title}），請擇一採納`
          };
          updatedEvents.unshift({
            id: `evt_${issueKey}_${nowMs}`,
            timestamp: nowMs,
            timeFormatted,
            lapNumber,
            phase: adj.phase || 'mid_corner',
            phaseLabel: diagResult.detectedCornerPhase || '動態評估',
            title,
            issueKey,
            severity,
            occurrences: 1,
            evidence: adj.crossTelemetryEvidence || adj.reason || '',
            adjustment: adj,
            status: 'active',
            isConflicted: true,
            conflictNotice: `同參數反向衝突：需人工權衡（${title} vs ${conf.title}），請擇一採納`
          });
          continue;
        }
      }

      updatedEvents.unshift({
        id: `evt_${issueKey}_${nowMs}`,
        timestamp: nowMs,
        timeFormatted,
        lapNumber,
        phase: adj.phase || 'mid_corner',
        phaseLabel: diagResult.detectedCornerPhase || '動態評估',
        title,
        issueKey,
        severity,
        occurrences: 1,
        evidence: adj.crossTelemetryEvidence || adj.reason || '',
        adjustment: adj,
        status: 'active'
      });
    }
  }

  return updatedEvents;
}

/**
 * Revalidate active events whenever applied setup changes.
 * Marks satisfied adjustments as 'applied', and silently purges conflicting/opposite suggestions.
 */
export function revalidateTuningEventsOnSetupChange(
  events: TuningTelemetryEvent[],
  currentSetup: AppliedTuningSetup
): TuningTelemetryEvent[] {
  const result: TuningTelemetryEvent[] = [];

  for (const evt of events) {
    if (evt.status === 'applied') {
      result.push(evt);
      continue;
    }

    const paramKey = evt.adjustment.parameterKey;
    const currentVal = currentSetup[paramKey];

    if (currentVal === undefined) {
      result.push(evt);
      continue;
    }

    const targetVal = evt.adjustment.target;
    const delta = evt.adjustment.delta;

    // Check if the adjustment has been applied or satisfied
    const isSatisfied = delta > 0
      ? currentVal >= targetVal - 0.05
      : currentVal <= targetVal + 0.05;

    if (isSatisfied) {
      result.push({
        ...evt,
        status: 'applied',
        isConflicted: false,
        conflictNotice: undefined,
        obsoleteReason: `已套用調整 (當前值: ${currentVal})`
      });
      continue;
    }

    // Check if current value moved significantly in the OPPOSITE direction (Conflicting change applied)
    const movedOpposite = delta > 0
      ? currentVal < evt.adjustment.current - 0.05
      : currentVal > evt.adjustment.current + 0.05;

    if (movedOpposite) {
      // Silently purge the opposite conflicting suggestion once the user has made their decision
      continue;
    }

    result.push(evt);
  }

  return result;
}

export const TIRE_OVERHEAT_THRESHOLD_C = 105;

/**
 * 依據顯示單位判斷輪胎是否過熱（基準為 105°C，對應華氏約 221°F）。
 *
 * @param tempInDisplayUnit 使用者顯示單位的溫度數值
 * @param unit 溫度顯示單位 ('C' 或 'F')
 * @returns 是否超過過熱門檻
 */
export function isTireOverheated(tempInDisplayUnit: number, unit: 'C' | 'F' = 'C'): boolean {
  const tempC = unit === 'F' ? (tempInDisplayUnit - 32) * 5 / 9 : tempInDisplayUnit;
  return tempC > TIRE_OVERHEAT_THRESHOLD_C;
}
