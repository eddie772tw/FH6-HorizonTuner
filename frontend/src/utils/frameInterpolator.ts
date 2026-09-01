/**
 * frameInterpolator.ts
 *
 * High-precision timestamp-based frame pacing and interpolation engine for Forza telemetry.
 * Solves the visual judder/stutter caused by mismatch between 60Hz UDP telemetry sampling
 * and high-refresh displays (120Hz, 144Hz, 240Hz, or VRR).
 */

export interface TelemetrySample<T = Record<string, any>> {
  data: T;
  timestamp: number; // Client-side performance.now() or monotonic time (ms)
}

export interface FrameInterpolatorOptions {
  /** Maximum extrapolation factor beyond latest sample (default: 1.25) */
  maxExtrapolationAlpha?: number;
  /** Timeout in ms after which interpolation falls back directly to latest sample without extrapolation (default: 150ms) */
  staleTimeoutMs?: number;
  /** Custom list of numeric keys to interpolate */
  continuousKeys?: string[];
  /** Angle keys (degrees, 0-360) requiring shortest arc wrapping */
  angleKeys?: string[];
}

/**
 * Standard continuous numeric keys in telemetry
 */
export const DEFAULT_CONTINUOUS_KEYS: string[] = [
  'rpm',
  'speed',
  'speed_kmh',
  'speed_mph',
  'power',
  'power_hp',
  'power_kw',
  'power_ps',
  'torque',
  'torque_nm',
  'torque_ftlbs',
  'boost',
  'boost_psi',
  'boost_bar',
  'boost_kpa',
  'throttle',
  'brake',
  'clutch',
  'hand_brake',
  'steer',
  'accel_x',
  'accel_y',
  'accel_z',
  'vel_x',
  'vel_y',
  'vel_z',
  'pos_x',
  'pos_y',
  'pos_z',
  'slip_fl',
  'slip_fr',
  'slip_rl',
  'slip_rr',
  'slip_angle_fl',
  'slip_angle_fr',
  'slip_angle_rl',
  'slip_angle_rr',
  'temp_fl',
  'temp_fr',
  'temp_rl',
  'temp_rr',
  'susp_fl',
  'susp_fr',
  'susp_rl',
  'susp_rr',
  'fuel_ratio',
  'distance_m',
  'CurrentEngineRpm',
  'SpeedMetersPerSecond',
  'PowerWatts',
  'TorqueNewtons',
  'Boost',
  'Fuel',
  'AccelInput',
  'BrakeInput',
  'ClutchInput',
  'SteerInput',
  'AccelerationX',
  'AccelerationY',
  'AccelerationZ',
  'VelocityX',
  'VelocityY',
  'VelocityZ',
  'PositionX',
  'PositionY',
  'PositionZ',
  'DistanceTraveled',
];

export const DEFAULT_ANGLE_KEYS: string[] = [
  'heading_deg',
  'Yaw',
];

/**
 * Standard continuous 4-element array keys
 */
export const DEFAULT_ARRAY_KEYS: string[] = [
  'TireTemp',
  'NormalizedSuspensionTravel',
  'TireSlipRatio',
  'TireSlipAngle',
  'tire_temp_f',
];

/**
 * Linear interpolation helper
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Shortest path angle interpolation (degrees, 0-360)
 */
export function lerpAngleDeg(a: number, b: number, t: number): number {
  let diff = (b - a) % 360;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  const result = (a + diff * t) % 360;
  return result < 0 ? result + 360 : result;
}

export class FrameInterpolator {
  private prevSample: TelemetrySample | null = null;
  private currSample: TelemetrySample | null = null;
  private maxExtrapolationAlpha: number;
  private staleTimeoutMs: number;
  private continuousKeys: Set<string>;
  private angleKeys: Set<string>;
  private arrayKeys: Set<string>;

  constructor(options: FrameInterpolatorOptions = {}) {
    this.maxExtrapolationAlpha = options.maxExtrapolationAlpha ?? 1.25;
    this.staleTimeoutMs = options.staleTimeoutMs ?? 150;
    this.continuousKeys = new Set(options.continuousKeys ?? DEFAULT_CONTINUOUS_KEYS);
    this.angleKeys = new Set(options.angleKeys ?? DEFAULT_ANGLE_KEYS);
    this.arrayKeys = new Set(DEFAULT_ARRAY_KEYS);
  }

  /**
   * Record a new telemetry sample received from UDP / WebSocket
   */
  public pushSample(data: Record<string, any>, timestampMs?: number): void {
    const ts = timestampMs ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());

    if (!this.currSample) {
      this.currSample = { data, timestamp: ts };
      this.prevSample = { data, timestamp: ts - 16.667 };
      return;
    }

    // If car ordinal changed or game reset, hard-reset interpolation history to prevent cross-car blend
    const prevOrdinal = this.currSample.data.CarOrdinal ?? this.currSample.data.carOrdinal;
    const newOrdinal = data.CarOrdinal ?? data.carOrdinal;
    if (prevOrdinal !== undefined && newOrdinal !== undefined && prevOrdinal !== newOrdinal) {
      this.reset();
      this.currSample = { data, timestamp: ts };
      this.prevSample = { data, timestamp: ts - 16.667 };
      return;
    }

    // Shift previous sample
    this.prevSample = this.currSample;
    this.currSample = { data, timestamp: ts };
  }

  /**
   * Reset the interpolation buffer (e.g. on disconnect or car change)
   */
  public reset(): void {
    this.prevSample = null;
    this.currSample = null;
  }

  /**
   * Interpolate telemetry state at the given render timestamp
   */
  public interpolate(renderTimeMs?: number): Record<string, any> {
    if (!this.currSample) {
      return {};
    }

    if (!this.prevSample || this.currSample.timestamp === this.prevSample.timestamp) {
      return this.currSample.data;
    }

    const now = renderTimeMs ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const timeSinceCurr = now - this.currSample.timestamp;

    // Stale timeout: If no new telemetry received for a prolonged duration, avoid extrapolation drift
    if (timeSinceCurr > this.staleTimeoutMs) {
      return this.currSample.data;
    }

    const dt = this.currSample.timestamp - this.prevSample.timestamp;
    if (dt <= 0) {
      return this.currSample.data;
    }

    // Alpha calculation:
    // When now == prevSample.timestamp, alpha = 0
    // When now == currSample.timestamp, alpha = 1
    // Between samples, 0 <= alpha <= 1 (Interpolation)
    // Beyond currSample.timestamp (slight frame delay), 1 < alpha <= maxExtrapolationAlpha (Extrapolation)
    const rawAlpha = (now - this.prevSample.timestamp) / dt;
    const alpha = Math.max(0, Math.min(this.maxExtrapolationAlpha, rawAlpha));

    const prev = this.prevSample.data;
    const curr = this.currSample.data;

    // Start with shallow copy of curr to preserve all discrete fields & objects immediately
    const out: Record<string, any> = { ...curr };

    // 1. Interpolate continuous numeric primitives
    for (const key of this.continuousKeys) {
      const v0 = prev[key];
      const v1 = curr[key];
      if (typeof v0 === 'number' && typeof v1 === 'number') {
        out[key] = lerp(v0, v1, alpha);
      }
    }

    // 2. Interpolate angle keys (shortest arc)
    for (const key of this.angleKeys) {
      const a0 = prev[key];
      const a1 = curr[key];
      if (typeof a0 === 'number' && typeof a1 === 'number') {
        out[key] = lerpAngleDeg(a0, a1, alpha);
      }
    }

    // 3. Interpolate 4-element arrays (e.g. TireTemp, Suspension)
    for (const key of this.arrayKeys) {
      const arr0 = prev[key];
      const arr1 = curr[key];
      if (Array.isArray(arr0) && Array.isArray(arr1) && arr0.length === arr1.length) {
        const interpolatedArr = new Array(arr1.length);
        for (let i = 0; i < arr1.length; i++) {
          const val0 = arr0[i];
          const val1 = arr1[i];
          if (typeof val0 === 'number' && typeof val1 === 'number') {
            interpolatedArr[i] = lerp(val0, val1, alpha);
          } else {
            interpolatedArr[i] = val1;
          }
        }
        out[key] = interpolatedArr;
      }
    }

    return out;
  }
}
