export const FULL_THROTTLE_INPUT = 255;
export const MAX_QUALIFIED_TIRE_SLIP_RATIO = 0.1;

export interface OutputPeak {
  value: number;
  rpm: number;
}

export interface QualifiedOutputPeaks {
  power: OutputPeak | null;
  torque: OutputPeak | null;
}

export interface OutputTelemetrySample {
  IsRaceOn?: number;
  AccelInput?: number;
  CurrentEngineRpm?: number;
  PowerWatts?: number;
  TorqueNewtons?: number;
  TireSlipRatio?: number[];
}

export const emptyQualifiedOutputPeaks = (): QualifiedOutputPeaks => ({
  power: null,
  torque: null,
});

export function isQualifiedOutputSample(sample: OutputTelemetrySample): boolean {
  const tireSlip = sample.TireSlipRatio;
  return sample.AccelInput === FULL_THROTTLE_INPUT
    && Number.isFinite(sample.CurrentEngineRpm)
    && (sample.CurrentEngineRpm ?? 0) > 0
    && Array.isArray(tireSlip)
    && tireSlip.length >= 4
    && tireSlip.slice(0, 4).every((slip) => (
      Number.isFinite(slip) && Math.abs(slip) <= MAX_QUALIFIED_TIRE_SLIP_RATIO
    ));
}

export function updateQualifiedOutputPeaks(
  previous: QualifiedOutputPeaks,
  sample: OutputTelemetrySample,
): QualifiedOutputPeaks {
  if (!isQualifiedOutputSample(sample)) return previous;

  const rpm = sample.CurrentEngineRpm ?? 0;
  const power = sample.PowerWatts ?? 0;
  const torque = sample.TorqueNewtons ?? 0;

  return {
    power: Number.isFinite(power) && power > 0 && (!previous.power || power > previous.power.value)
      ? { value: power, rpm }
      : previous.power,
    torque: Number.isFinite(torque) && torque > 0 && (!previous.torque || torque > previous.torque.value)
      ? { value: torque, rpm }
      : previous.torque,
  };
}
