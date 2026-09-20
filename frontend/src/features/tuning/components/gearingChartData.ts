import { calcGearRpm, calcGearSpeed } from '../../../utils/tuningMath';

export interface GearingChartDataParams {
  numGears: number;
  gears: number[];
  finalDrive: number;
  maxRpm?: number;
  effectiveRedline?: number;
  maxHpRpm?: number;
  tireRadiusM: number;
  speedUnit: 'kmh' | 'mph';
  convertSpeed: (ms: number) => { value: number; label: string };
  simulatedTopSpeed?: number;
  softMaxSpeed?: number;
}

export function computeGearingChartData(params: GearingChartDataParams) {
  const {
    numGears,
    gears,
    finalDrive,
    maxRpm,
    effectiveRedline,
    maxHpRpm = 7000,
    tireRadiusM,
    speedUnit,
    convertSpeed,
    simulatedTopSpeed = 0,
    softMaxSpeed = 0
  } = params;

  // 1. Determine gauge redline limit and actual cutoff RPM
  const yLimit = maxRpm && maxRpm > 0 ? maxRpm : Math.round(maxHpRpm * 1.15);
  const cutoffRpm = effectiveRedline && Number.isFinite(effectiveRedline) && effectiveRedline > 0
    ? Math.min(effectiveRedline, yLimit) : yLimit;
  const chartYMax = Math.max(yLimit, cutoffRpm);

  const displaySpeed = (kmh: number) => speedUnit === 'mph' ? kmh * 0.621371 : kmh;

  // 2. Compute start/end speeds for each gear
  // Gear 1: Start speed = 0, End speed = Speed at cutoffRpm in Gear 1
  // Gear N (N > 1): Start speed = Gear N-1 End speed (speed at cutoffRpm of Gear N-1)
  const gearRanges: { gearIndex: number; startSpeed: number; endSpeed: number; ratio: number }[] = [];

  let currentStartSpeed = 0;
  for (let g = 0; g < numGears; g++) {
    const ratio = gears[g] || 1.0;
    let endSpeed = 0;
    if (ratio > 0 && finalDrive > 0) {
      const maxSpeedMs = calcGearSpeed(cutoffRpm, ratio, finalDrive, tireRadiusM);
      endSpeed = convertSpeed(maxSpeedMs).value;
    }

    const startSpeed = g === 0 ? 0 : currentStartSpeed;

    gearRanges.push({
      gearIndex: g,
      startSpeed,
      endSpeed,
      ratio
    });

    // Next gear starts at this gear's endSpeed (cutoffRpm speed)
    currentStartSpeed = endSpeed;
  }

  const overallTopSpeed = Math.max(
    gearRanges[gearRanges.length - 1]?.endSpeed || 300,
    displaySpeed(simulatedTopSpeed),
    displaySpeed(softMaxSpeed)
  );
  const xLimit = Math.max(120, Math.ceil(overallTopSpeed / 20) * 20);

  // 3. Collect critical speed sample points
  const speedSet = new Set<number>();
  speedSet.add(0);
  speedSet.add(xLimit);

  gearRanges.forEach(range => {
    speedSet.add(range.startSpeed);
    speedSet.add(range.endSpeed);

    // Interpolate points between startSpeed and endSpeed
    const steps = 15;
    const stepSize = (range.endSpeed - range.startSpeed) / steps;
    for (let s = 1; s < steps; s++) {
      speedSet.add(Math.round((range.startSpeed + s * stepSize) * 10) / 10);
    }
  });

  const sortedSpeeds = Array.from(speedSet).sort((a, b) => a - b);

  // 4. Generate Recharts data points
  const points = sortedSpeeds.map(speed => {
    const pt: any = { speed };

    gearRanges.forEach(range => {
      const { gearIndex, startSpeed, endSpeed, ratio } = range;

      // Include point if speed is between this gear's shift start and shift end
        if (speed >= startSpeed - 0.05 && speed <= endSpeed + 0.05 && ratio > 0 && finalDrive > 0) {
          const speedMs = speedUnit === 'mph' ? speed / 2.23694 : speed / 3.6;
          const rpm = calcGearRpm(speedMs, ratio, finalDrive, tireRadiusM);
          if (rpm >= 0 && rpm <= cutoffRpm + 50) {
            const isAtEnd = Math.abs(speed - endSpeed) < 0.05;
            pt[`gear${gearIndex + 1}`] = isAtEnd ? Math.round(cutoffRpm) : Math.min(Math.round(rpm), Math.round(cutoffRpm));
          }
        }
    });

    return pt;
  });

  return { chartData: points, xMax: xLimit, yMax: chartYMax, cutoffRpm, gearRanges };
}
