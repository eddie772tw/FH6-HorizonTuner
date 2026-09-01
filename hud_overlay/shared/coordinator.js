// =============================================================================
// shared/coordinator.js
// Single source of truth for all telemetry processing.
// Receives raw telemetry from ws.js, runs it through every shared module,
// computes session maxima and lockup deltas, then dispatches one clean
// 'hud:frame' event the active HUD renders from.
//
// Usage (in src/index.html only):
//   import { initCoordinator } from './shared/coordinator.js';
//   initCoordinator();
//
// HUDs listen to:
//   window.addEventListener('hud:frame', (e) => {
//       const { data, redlineRpm, lcState, sessionMaxima, lockup } = e.detail;
//   });
// =============================================================================

import { updatePhysicsTargets }  from './physics.js';
import { FrameInterpolator }    from './frame-interpolator.js';

// ── Frame pacing & interpolation ──────────────────────────────────────────────
const _interpolator = new FrameInterpolator();
let _enableSmoothing = true;
let _rafId = null;
let _hasActiveTelemetry = false;

export function setFrameSmoothing(enabled) {
    _enableSmoothing = Boolean(enabled);
    if (!_enableSmoothing && _rafId !== null) {
        cancelAnimationFrame(_rafId);
        _rafId = null;
    }
}

export function isFrameSmoothingEnabled() {
    return _enableSmoothing;
}

function _startRenderLoopIfNeeded() {
    if (!_enableSmoothing || _rafId !== null) return;

    function _renderLoop() {
        if (!_enableSmoothing) {
            _rafId = null;
            return;
        }

        const interpolated = _interpolator.interpolate(performance.now());
        if (interpolated) {
            updatePhysicsTargets(interpolated);
            window.dispatchEvent(new CustomEvent('hud:frame', {
                detail: {
                    data:          interpolated,
                    redlineRpm:    interpolated.redlineRpm,
                    lcState:       interpolated.lcState,
                    sessionMaxima: interpolated.sessionMaxima,
                    lockup:        interpolated.lockup,
                }
            }));
            window._diag?.countFrame?.();
        }

        _rafId = requestAnimationFrame(_renderLoop);
    }

    _rafId = requestAnimationFrame(_renderLoop);
}

// ── Init ──────────────────────────────────────────────────────────────────────
export function initCoordinator() {
    window.addEventListener('telemetry', _onTelemetry);

    // Periodic memory cleanup
    setInterval(() => {
        performance.clearResourceTimings();
        performance.clearMarks();
        performance.clearMeasures();
    }, 30_000);

    console.log('[Coordinator] Initialized with High-Refresh Frame Interpolation');
}

// ── Core pipeline ─────────────────────────────────────────────────────────────
let _lastLcState  = 'inactive';
let _lastCarKey   = '';
let peakSessionPower = 100;
let peakSessionTorque = 100;
let peakSessionBoost = 1.5;
let lastCarOrdinal = null;
const EMPTY_TIRE_TEMPERATURES = Object.freeze([null, null, null, null]);

function finiteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function nullableNumber(value) {
    if (value === undefined || value === null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function normalizeHeadingDegrees(yawRadians) {
    const degrees = finiteNumber(yawRadians, 0) * 180 / Math.PI;
    return ((degrees % 360) + 360) % 360;
}

function normalizeFuelRatio(value) {
    const fuel = nullableNumber(value);
    if (fuel === null) return null;
    return Math.max(0, Math.min(1, fuel > 1 ? fuel / 100 : fuel));
}

function formatHudTelemetry(raw) {
    const isMetric = typeof window.isMetric === 'function' ? window.isMetric() : true;
    const configuredUnits = window._currentHudConfig?.effectiveUnits || {};
    const displayUnits = {
        speed: configuredUnits.speed || (isMetric ? 'kmh' : 'mph'),
        power: configuredUnits.power || (isMetric ? 'kw' : 'hp'),
        torque: configuredUnits.torque || (isMetric ? 'nm' : 'lbft'),
        boostPressure: configuredUnits.boostPressure || (isMetric ? 'bar' : 'psi'),
    };
    const speedKmh = (raw.SpeedMetersPerSecond || 0) * 3.6;
    const speedMph = (raw.SpeedMetersPerSecond || 0) * 2.23694;
    const hp = ((raw.PowerWatts || 0) / 745.7);
    const ftlbs = ((raw.TorqueNewtons || 0) * 0.737562);
    const kw = (raw.PowerWatts || 0) / 1000;
    const ps = kw * 1.35962;
    const nm = raw.TorqueNewtons || 0;
    const boostPsi = Math.max(0, raw.Boost || 0);
    const boostBar = Math.max(0, (raw.Boost || 0) / 14.5038);
    const boostKpa = Math.max(0, (raw.Boost || 0) * 6.89476);
    const displayPower = displayUnits.power === 'kw' ? kw : displayUnits.power === 'ps' ? ps : hp;
    const displayTorque = displayUnits.torque === 'lbft' ? ftlbs : nm;
    const displayBoost = displayUnits.boostPressure === 'psi'
        ? boostPsi
        : displayUnits.boostPressure === 'kpa' ? boostKpa : boostBar;
    const tireTempF = Array.isArray(raw.TireTemp) ? raw.TireTemp : EMPTY_TIRE_TEMPERATURES;
    const distanceM = Math.max(0, finiteNumber(raw.DistanceTraveled, 0));
    const headingDeg = normalizeHeadingDegrees(raw.Yaw);
    const fuelRatio = normalizeFuelRatio(raw.Fuel);
    const lap = nullableNumber(raw.LapNumber);
    const racePosition = nullableNumber(raw.RacePosition);

    const maxRpm = raw.EngineMaxRpm || 7000;
    const idleRpm = raw.EngineIdleRpm || 1000;
    const redlineRpm = Math.max(0, maxRpm - 1000);
    const isRaceOn = raw.IsRaceOn ?? 1;

    if (lastCarOrdinal !== null && lastCarOrdinal !== raw.CarOrdinal) {
        peakSessionPower = 100;
        peakSessionTorque = 100;
        peakSessionBoost = 1.5;
    }
    lastCarOrdinal = raw.CarOrdinal || 1;

    if (displayPower > peakSessionPower) peakSessionPower = displayPower;
    if (displayTorque > peakSessionTorque) peakSessionTorque = displayTorque;
    if (displayBoost > peakSessionBoost) peakSessionBoost = displayBoost;

    const brakeRatio = (raw.BrakeInput || 0) / 255;
    const slipFL = raw.TireSlipRatio?.[0] || 0;
    const slipFR = raw.TireSlipRatio?.[1] || 0;
    const slipRL = raw.TireSlipRatio?.[2] || 0;
    const slipRR = raw.TireSlipRatio?.[3] || 0;

    const lockup = {
        fl: brakeRatio > 0.1 && slipFL < -0.1,
        fr: brakeRatio > 0.1 && slipFR < -0.1,
        rl: brakeRatio > 0.1 && slipRL < -0.1,
        rr: brakeRatio > 0.1 && slipRR < -0.1,
    };

    const sessionMaxima = {
        power: peakSessionPower,
        torque: peakSessionTorque,
        boost: peakSessionBoost,
        maxHP: peakSessionPower,
        maxTQ: peakSessionTorque,
        maxBoost: peakSessionBoost,
    };

    return {
        ...raw, // Keep raw data accessible just in case
        isRaceOn,
        is_race_on: isRaceOn,
        timestamp_ms: raw.TimestampMS || 0,
        carOrdinal: raw.CarOrdinal || 1,
        car_ordinal: raw.CarOrdinal || 1,
        carClass: raw.CarClass || 0,
        car_class: raw.CarClass || 0,
        carPi: raw.CarPerformanceIndex || 0,
        car_pi: raw.CarPerformanceIndex || 0,
        maxRpm,
        max_rpm: maxRpm,
        idleRpm,
        idle_rpm: idleRpm,
        redlineRpm,
        rpm: raw.CurrentEngineRpm || 0,
        accel_x: raw.AccelerationX || 0,
        accel_y: raw.AccelerationY || 0,
        accel_z: raw.AccelerationZ || 0,
        vel_x: raw.VelocityX || 0,
        vel_y: raw.VelocityY || 0,
        vel_z: raw.VelocityZ || 0,
        displayUnits,
        speed: displayUnits.speed === 'mph' ? speedMph : speedKmh,
        speed_kmh: speedKmh,
        speed_mph: speedMph,
        distance_m: distanceM,
        heading_deg: headingDeg,
        power: displayPower,
        power_unit: displayUnits.power === 'kw' ? 'kW' : displayUnits.power === 'ps' ? 'PS' : 'HP',
        power_hp: hp,
        power_kw: kw,
        power_ps: ps,
        torque: displayTorque,
        torque_unit: displayUnits.torque === 'lbft' ? 'LB·FT' : 'N·m',
        torque_nm: nm,
        torque_ftlbs: ftlbs,
        boost: displayBoost,
        boost_unit: displayUnits.boostPressure === 'kpa' ? 'kPa' : displayUnits.boostPressure.toUpperCase(),
        boost_psi: boostPsi,
        boost_bar: boostBar,
        boost_kpa: boostKpa,
        gear: raw.Gear || 0,
        throttle: (raw.AccelInput || 0) / 255,
        brake: brakeRatio,
        clutch: (raw.ClutchInput || 0) / 255,
        hand_brake: raw.HandBrakeInput || 0,
        steer: raw.SteerInput || 0,
        slip_fl: slipFL,
        slip_fr: slipFR,
        slip_rl: slipRL,
        slip_rr: slipRR,
        slip_angle_fl: raw.TireSlipAngle?.[0] ?? 0,
        slip_angle_fr: raw.TireSlipAngle?.[1] ?? 0,
        slip_angle_rl: raw.TireSlipAngle?.[2] ?? 0,
        slip_angle_rr: raw.TireSlipAngle?.[3] ?? 0,
        TireTemp: raw.TireTemp || [0, 0, 0, 0],
        TireSlipRatio: raw.TireSlipRatio || [slipFL, slipFR, slipRL, slipRR],
        TireSlipAngle: raw.TireSlipAngle || [0, 0, 0, 0],
        tire_temp_f: tireTempF,
        temp_fl: raw.TireTemp?.[0] ?? 0,
        temp_fr: raw.TireTemp?.[1] ?? 0,
        temp_rl: raw.TireTemp?.[2] ?? 0,
        temp_rr: raw.TireTemp?.[3] ?? 0,
        susp_fl: raw.NormalizedSuspensionTravel?.[0] || 0,
        susp_fr: raw.NormalizedSuspensionTravel?.[1] || 0,
        susp_rl: raw.NormalizedSuspensionTravel?.[2] || 0,
        susp_rr: raw.NormalizedSuspensionTravel?.[3] || 0,
        driveline_id: raw.DrivetrainType ?? 1,
        drivetrain_type: raw.DrivetrainType ?? 1,
        pos_x: raw.PositionX || 0,
        pos_y: raw.PositionY || 0,
        pos_z: raw.PositionZ || 0,
        fuel_ratio: fuelRatio,
        lap,
        race_position: racePosition,
        num_cylinders: raw.Cylinders || 4,
        lockup,
        sessionMaxima,
        lcState: raw.lcState || 'inactive'
    };
}

function _onTelemetry(e) {
    const data = formatHudTelemetry(e.detail);
    window._diag?.countWsMessage?.();

    // Discrete state events are always dispatched immediately for zero latency
    if (data.notification) {
        window.showNotification?.(data.notification);
    }

    if (data.carChanged) {
        window.dispatchEvent(new CustomEvent('car:changed', {
            detail: {
                carOrdinal: data.carOrdinal,
                carKey:     data.carKey,
                isKnown:    data.isKnown,
                redline:    data.redlineRpm,
                maxRpm:     data.maxRpm,
                idleRpm:    data.idleRpm,
            }
        }));
    }

    if (data.carLearned) {
        window.dispatchEvent(new CustomEvent('car:learned', {
            detail: {
                carOrdinal: data.carOrdinal,
                carKey:     data.carKey,
                redline:    data.redlineRpm,
            }
        }));
    }

    if (data.lcState !== _lastLcState) {
        _lastLcState = data.lcState;
        window.dispatchEvent(new CustomEvent('lc:state', {
            detail: {
                armed:    data.lcState === 'armed',
                launched: data.lcState === 'launched',
            }
        }));
    }

    if (_enableSmoothing) {
        _interpolator.pushSample(data, performance.now());
        _startRenderLoopIfNeeded();
    } else {
        updatePhysicsTargets(data);
        window.dispatchEvent(new CustomEvent('hud:frame', {
            detail: {
                data,
                redlineRpm:    data.redlineRpm,
                lcState:       data.lcState,
                sessionMaxima: data.sessionMaxima,
                lockup:        data.lockup,
            }
        }));
        window._diag?.countFrame?.();
    }
}
