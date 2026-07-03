import { CarParams } from '../context/CarParamsContext';

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

  points.forEach(p => {
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
  });

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
    const isSuspExtended = travel.every((t: number) => t < 0.08); // all wheels near fully extended
    
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
            const maxLTravel = Math.max(...lTravel);
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
  
  points.forEach(p => {
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
  });

  const driftTimePercent = (driftPointsCount / totalPoints) * 100;

  if (driftPointsCount > 10 || raceType === 'Drift') {
    const avgDriftAngle = driftPointsCount > 0 ? (totalDriftAngleSum / driftPointsCount) : 0;
    const driftAdvice: string[] = [];

    // Calculate stability: standard deviation of lateral G during drift to evaluate smoothness
    let latGVariance = 0;
    if (driftPointsCount > 1) {
      const latGs: number[] = [];
      points.forEach(p => {
        const slipAngles = p.TireSlipAngle || [0.0, 0.0, 0.0, 0.0];
        const rearSlipAvg = (Math.abs(slipAngles[2]) + Math.abs(slipAngles[3])) / 2 * (180 / Math.PI);
        if (rearSlipAvg > 8.0 && p.SpeedMetersPerSecond > 5.0) {
          latGs.push(p.AccelerationX / 9.81);
        }
      });
      const meanLatG = latGs.reduce((a, b) => a + b, 0) / latGs.length;
      const squaredDiffs = latGs.map(g => Math.pow(g - meanLatG, 2));
      const variance = squaredDiffs.reduce((a, b) => a + b, 0) / (latGs.length - 1);
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

  points.forEach((p, idx) => {
    const speed = p.SpeedMetersPerSecond * 3.6; // convert to km/h
    if (speed > maxSpeed) maxSpeed = speed;

    const latG = Math.abs(p.AccelerationX) / 9.81;
    if (latG > maxG) maxG = latG;

    // Cornering detection (lateral G > 0.45G)
    if (latG > 0.45) {
      if (!insideCorner) {
        insideCorner = true;
        const entryPt = points[Math.max(0, idx - 5)];
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
  });

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
