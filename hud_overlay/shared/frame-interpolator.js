// =============================================================================
// shared/frame-interpolator.js
// High-precision timestamp-based frame pacing and interpolation for HUD Overlay.
// Smooths 60Hz UDP telemetry across high-refresh (120Hz/144Hz/240Hz/VRR) displays.
// =============================================================================

export const DEFAULT_CONTINUOUS_KEYS = [
    'rpm', 'speed', 'speed_kmh', 'speed_mph',
    'power', 'power_hp', 'power_kw', 'power_ps',
    'torque', 'torque_nm', 'torque_ftlbs',
    'boost', 'boost_psi', 'boost_bar', 'boost_kpa',
    'throttle', 'brake', 'clutch', 'hand_brake', 'steer',
    'accel_x', 'accel_y', 'accel_z',
    'vel_x', 'vel_y', 'vel_z',
    'pos_x', 'pos_y', 'pos_z',
    'slip_fl', 'slip_fr', 'slip_rl', 'slip_rr',
    'slip_angle_fl', 'slip_angle_fr', 'slip_angle_rl', 'slip_angle_rr',
    'temp_fl', 'temp_fr', 'temp_rl', 'temp_rr',
    'susp_fl', 'susp_fr', 'susp_rl', 'susp_rr',
    'fuel_ratio', 'distance_m',
    'CurrentEngineRpm', 'SpeedMetersPerSecond',
    'PowerWatts', 'TorqueNewtons', 'Boost', 'Fuel',
    'AccelInput', 'BrakeInput', 'ClutchInput', 'SteerInput',
    'AccelerationX', 'AccelerationY', 'AccelerationZ',
    'VelocityX', 'VelocityY', 'VelocityZ',
    'PositionX', 'PositionY', 'PositionZ',
    'DistanceTraveled'
];

export const DEFAULT_ANGLE_KEYS = [
    'heading_deg', 'Yaw'
];

export const DEFAULT_ARRAY_KEYS = [
    'TireTemp', 'NormalizedSuspensionTravel',
    'TireSlipRatio', 'TireSlipAngle', 'tire_temp_f'
];

export function lerp(a, b, t) {
    return a + (b - a) * t;
}

export function lerpAngleDeg(a, b, t) {
    let diff = (b - a) % 360;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    const result = (a + diff * t) % 360;
    return result < 0 ? result + 360 : result;
}

export class FrameInterpolator {
    constructor(options = {}) {
        this.maxExtrapolationAlpha = options.maxExtrapolationAlpha ?? 1.25;
        this.staleTimeoutMs = options.staleTimeoutMs ?? 150;
        this.continuousKeys = new Set(options.continuousKeys ?? DEFAULT_CONTINUOUS_KEYS);
        this.angleKeys = new Set(options.angleKeys ?? DEFAULT_ANGLE_KEYS);
        this.arrayKeys = new Set(DEFAULT_ARRAY_KEYS);

        this.prevSample = null;
        this.currSample = null;
    }

    pushSample(data, timestampMs) {
        const ts = timestampMs ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());

        if (!this.currSample) {
            this.currSample = { data, timestamp: ts };
            this.prevSample = { data, timestamp: ts - 16.667 };
            return;
        }

        const prevOrdinal = this.currSample.data.CarOrdinal ?? this.currSample.data.carOrdinal;
        const newOrdinal = data.CarOrdinal ?? data.carOrdinal;
        if (prevOrdinal !== undefined && newOrdinal !== undefined && prevOrdinal !== newOrdinal) {
            this.reset();
            this.currSample = { data, timestamp: ts };
            this.prevSample = { data, timestamp: ts - 16.667 };
            return;
        }

        this.prevSample = this.currSample;
        this.currSample = { data, timestamp: ts };
    }

    reset() {
        this.prevSample = null;
        this.currSample = null;
    }

    interpolate(renderTimeMs) {
        if (!this.currSample) return null;
        if (!this.prevSample || this.currSample.timestamp === this.prevSample.timestamp) {
            return this.currSample.data;
        }

        const now = renderTimeMs ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());
        const timeSinceCurr = now - this.currSample.timestamp;

        if (timeSinceCurr > this.staleTimeoutMs) {
            return this.currSample.data;
        }

        const dt = this.currSample.timestamp - this.prevSample.timestamp;
        if (dt <= 0) {
            return this.currSample.data;
        }

        const rawAlpha = (now - this.prevSample.timestamp) / dt;
        const alpha = Math.max(0, Math.min(this.maxExtrapolationAlpha, rawAlpha));

        const prev = this.prevSample.data;
        const curr = this.currSample.data;
        const out = { ...curr };

        for (const key of this.continuousKeys) {
            const v0 = prev[key];
            const v1 = curr[key];
            if (typeof v0 === 'number' && typeof v1 === 'number') {
                out[key] = lerp(v0, v1, alpha);
            }
        }

        for (const key of this.angleKeys) {
            const a0 = prev[key];
            const a1 = curr[key];
            if (typeof a0 === 'number' && typeof a1 === 'number') {
                out[key] = lerpAngleDeg(a0, a1, alpha);
            }
        }

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
