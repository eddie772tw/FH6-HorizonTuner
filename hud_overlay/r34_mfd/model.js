/* BNR34 MFD adapter: display conversions only; no fabricated engine sensors. */
(function (root) {
    'use strict';
    var MODES = ['single', 'twin', 'multi', 'g', 'lap'];
    var STALE_MS = 1500, TIMER_ZERO_GRACE_MS = 3000, CAPACITY = 301, SAMPLE_MS = 100, WINDOW_MS = 30000;
    function finite(value) { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
    function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
    function normalizeConfig(config) {
        config = config || {};
        return {
            r34MfdMode: MODES.indexOf(config.r34MfdMode) >= 0 ? config.r34MfdMode : 'single',
            r34ShowCluster: typeof config.r34ShowCluster === 'boolean' ? config.r34ShowCluster : true,
            r34Lighting: config.r34Lighting === 'day' ? 'day' : 'night'
        };
    }
    // Packet TireTemp is FL/FR/RL/RR in Fahrenheit. Never use a zero-filled alias.
    function meanTireTemperatureC(values) {
        if (!Array.isArray(values) || values.length !== 4) return null;
        var meanF = 0;
        for (var i = 0; i < 4; i++) {
            if (finite(values[i]) === null) return null;
            meanF += values[i] / 4;
        }
        return finite((meanF - 32) * (5 / 9));
    }
    function gear(value) {
        if (value === 0) return 'R';
        if (value === 11) return 'N';
        return Number.isInteger(value) && value >= 1 && value <= 10 ? String(value) : '—';
    }
    function timerTime(seconds) {
        if (finite(seconds) === null || seconds < 0) return "—'——.———";
        var ms = Math.round(seconds * 1000);
        return Math.floor(ms / 60000) + "'" + String(Math.floor(ms / 1000) % 60).padStart(2, '0') + '.' + String(ms % 1000).padStart(3, '0');
    }
    function lapTime(seconds) { return seconds === 0 ? "—'——.———" : timerTime(seconds); }
    function ratio(value, min, max) { return finite(value) === null ? null : clamp((value - min) / (max - min), 0, 1); }
    function boostUnit(unit) {
        return unit === 'psi' ? { unit: 'psi', factor: 1, min: -7.2519, max: 29.0076, decimals: 1 }
            : unit === 'kpa' ? { unit: 'kPa', factor: 6.89476, min: -50, max: 200, decimals: 0 }
            : { unit: 'bar', factor: 1 / 14.5038, min: -0.5, max: 2, decimals: 2 };
    }
    function units(config, data) {
        var supplied = config.effectiveUnits || data.displayUnits || config.units || {};
        return {
            speed: (supplied.speed || config.effectiveUnit || config.unit) === 'mph' ? 'mph' : 'kmh',
            boost: boostUnit(supplied.boostPressure),
            temperature: supplied.temperature === 'F' ? 'F' : 'C',
            power: ['kw', 'ps'].indexOf(supplied.power) >= 0 ? supplied.power : 'hp',
            torque: supplied.torque === 'lbft' ? 'lbft' : 'nm'
        };
    }
    function createState() {
        return {
            data: {}, redline: null, timestamp: null, receivedAt: null, car: null, raceTime: null,
            status: 'waiting', blocked: false, sequence: 0, session: 0,
            epochTimestamp: null, epochAt: null, epochCar: null, epochRaceTime: null,
            peakBoostPsi: null, peakRpm: null, lastLapNumber: null, laps: [],
            timerSeconds: null, timerLapNumber: null, timerZeroUntil: null,
            historyTime: new Float64Array(CAPACITY), historyBoost: new Float64Array(CAPACITY),
            historyCount: 0, historyHead: 0, nextSampleAt: null, elapsed: 0
        };
    }
    function reset(state) {
        state.peakBoostPsi = null; state.peakRpm = null;
        state.laps.length = 0; state.lastLapNumber = null;
        clearTimer(state);
        state.historyCount = 0; state.historyHead = 0; state.nextSampleAt = null; state.elapsed = 0;
        state.session++;
    }
    function physical(data, key) {
        var value = finite(data[key]);
        if (value === null) return null;
        if (key === 'Fuel') return value >= 0 && value <= 1 ? value : null;
        if (key === 'AccelInput' || key === 'BrakeInput') return value >= 0 && value <= 255 ? value : null;
        if (key === 'LapNumber') return Number.isInteger(value) && value >= 0 ? value : null;
        if (key === 'CurrentEngineRpm' || key === 'SpeedMetersPerSecond' || key === 'DistanceTraveled' ||
            key === 'CurrentRaceTime' || key === 'CurrentLap' || key === 'BestLap' || key === 'LastLap') return value >= 0 ? value : null;
        // Signed boost, power/torque and acceleration remain valid signed channels.
        return value;
    }
    function clearEpoch(state) {
        state.epochTimestamp = null; state.epochAt = null; state.epochCar = null; state.epochRaceTime = null;
    }
    function clearTimer(state) { state.timerSeconds = null; state.timerLapNumber = null; state.timerZeroUntil = null; }
    function updateTimer(state, data, lap, continuous, now) {
        var seconds = physical(data, 'CurrentLap');
        // Raw zero is commonly a default. It is genuine only at an observed
        // lap rollover from a positive timer, then on consecutive same-lap zeros
        // within the fixed grace period. Receive/source gaps are availability heuristics.
        var rollover = state.timerSeconds > 0 && state.timerLapNumber !== null && lap === state.timerLapNumber + 1;
        var validZero = seconds === 0 && continuous && lap !== null &&
            (rollover || (state.timerSeconds === 0 && lap === state.timerLapNumber && now < state.timerZeroUntil));
        state.timerZeroUntil = validZero ? (rollover ? now + TIMER_ZERO_GRACE_MS : state.timerZeroUntil) : null;
        state.timerSeconds = seconds > 0 || validZero ? seconds : null;
        state.timerLapNumber = state.timerSeconds === null ? null : lap;
    }
    function ingest(state, envelope, payload, now) {
        envelope = envelope || {}; payload = payload || {};
        var data = envelope.sourceTelemetry && typeof envelope.sourceTelemetry === 'object' ? envelope.sourceTelemetry : envelope;
        if (envelope.success === false || envelope.error || payload.success === false || payload.error || data.success === false || data.error) {
            state.status = 'error'; state.blocked = true; clearEpoch(state); clearTimer(state); return false;
        }
        if (data.IsRaceOn === 0 || data.IsRaceOn === false) { state.status = 'paused'; state.blocked = true; clearEpoch(state); clearTimer(state); return false; }
        var timestamp = finite(data.TimestampMS), car = finite(data.CarOrdinal);
        var raceTime = physical(data, 'CurrentRaceTime'), lap = physical(data, 'LapNumber');
        if ((data.IsRaceOn !== 1 && data.IsRaceOn !== true) || timestamp === null || !Number.isInteger(timestamp) || timestamp < 0 || timestamp > 4294967295) {
            state.status = 'unavailable'; state.blocked = true; clearEpoch(state); clearTimer(state); return false;
        }
        var delta = state.timestamp === null ? 1 : (timestamp - state.timestamp + 4294967296) % 4294967296;
        var carChanged = state.car !== null && car !== null && car !== state.car;
        var stale = state.receivedAt !== null && now - state.receivedAt >= STALE_MS;
        var restarted = state.raceTime !== null && raceTime !== null && raceTime <= 1 && state.raceTime > 2 && lap === 0 &&
            (state.lastLapNumber > 0 || state.blocked || stale);
        if (delta >= 2147483648) {
            var mayReset = carChanged || restarted || stale;
            var step = state.epochTimestamp === null ? 0 : (timestamp - state.epochTimestamp + 4294967296) % 4294967296;
            var coherent = car === state.epochCar && (raceTime === null || state.epochRaceTime === null || raceTime >= state.epochRaceTime);
            // A single reordered packet must never erase the active session.
            if (mayReset && step > 0 && step < 2147483648 && now - state.epochAt < 500 && coherent) restarted = true;
            else {
                if (mayReset && state.epochTimestamp !== timestamp) {
                    state.epochTimestamp = timestamp; state.epochAt = now; state.epochCar = car; state.epochRaceTime = raceTime;
                }
                return false;
            }
        } else if (delta === 0) return false;
        state.epochTimestamp = null; state.epochAt = null; state.epochCar = null; state.epochRaceTime = null;
        if (carChanged || restarted) { reset(state); delta = 0; }
        var first = state.timestamp === null;
        updateTimer(state, data, lap, !first && !state.blocked && !stale && delta < STALE_MS, now);
        state.timestamp = timestamp; if (car !== null) state.car = car; if (raceTime !== null) state.raceTime = raceTime;
        state.receivedAt = now; state.data = data;
        var redline = finite(payload.redlineRpm), maxRpm = finite(data.EngineMaxRpm);
        state.redline = redline !== null && redline > 0 && maxRpm !== null && maxRpm > 0 ? redline : null;
        state.status = 'live'; state.blocked = false;
        state.sequence++; state.elapsed += first ? 0 : Math.min(delta, WINDOW_MS + 1);
        var boost = physical(data, 'Boost'), rpm = physical(data, 'CurrentEngineRpm');
        if (boost !== null) state.peakBoostPsi = state.peakBoostPsi === null ? boost : Math.max(state.peakBoostPsi, boost);
        if (rpm !== null) state.peakRpm = state.peakRpm === null ? rpm : Math.max(state.peakRpm, rpm);
        if (lap !== null) {
            if (state.lastLapNumber !== null && lap === state.lastLapNumber + 1 && physical(data, 'LastLap') > 0) {
                state.laps.unshift({ number: lap, seconds: data.LastLap });
                if (state.laps.length > 5) state.laps.pop();
            }
            if (state.lastLapNumber === null || lap >= state.lastLapNumber) state.lastLapNumber = lap;
        }
        if (state.nextSampleAt === null || state.elapsed >= state.nextSampleAt) {
            var at = state.historyHead;
            state.historyTime[at] = state.elapsed;
            state.historyBoost[at] = boost === null ? NaN : boost;
            state.historyHead = (at + 1) % CAPACITY;
            state.historyCount = Math.min(CAPACITY, state.historyCount + 1);
            state.nextSampleAt = state.elapsed + SAMPLE_MS;
        }
        return true;
    }
    function status(state, now) {
        if (state.status === 'live' && state.receivedAt !== null && now - state.receivedAt >= STALE_MS) return 'stale';
        return state.status;
    }
    function read(data, live, key) { return live ? physical(data, key) : null; }
    function convert(data, live, key, factor) { var value = read(data, live, key); return value === null ? null : value * factor; }
    function snapshot(state, config, now, out, displayUnits) {
        config = config || {};
        var data = state.data, currentStatus = status(state, now), live = currentStatus === 'live';
        var u = displayUnits || units(config, data);
        var speedKmh = convert(data, live, 'SpeedMetersPerSecond', 3.6);
        var speed = u.speed === 'mph' ? convert(data, live, 'SpeedMetersPerSecond', 2.23694) : speedKmh;
        var fuel = read(data, live, 'Fuel'); if (fuel !== null) fuel *= 100;
        var tireTemperatureC = live ? meanTireTemperatureC(data.TireTemp) : null;
        var throttle = convert(data, live, 'AccelInput', 100 / 255), brake = convert(data, live, 'BrakeInput', 100 / 255);
        var rpm = read(data, live, 'CurrentEngineRpm'), boost = convert(data, live, 'Boost', u.boost.factor);
        out = out || {};
        out.status = currentStatus;
        out.live = live;
        out.sequence = state.sequence;
        out.session = state.session;
        out.speed = speed;
        out.speedKmh = speedKmh;
        out.speedUnit = u.speed;
        out.rpm = rpm;
        out.gear = live ? gear(data.Gear) : '—';
        out.fuel = fuel;
        out.tireTemperatureC = tireTemperatureC;
        out.tireTemperature = tireTemperatureC === null ? null : u.temperature === 'F' ? tireTemperatureC * 1.8 + 32 : tireTemperatureC;
        out.tireTemperatureUnit = u.temperature === 'F' ? '°F' : '°C';
        out.tireTemperatureRatio = ratio(tireTemperatureC, 0, 150);
        out.coolant = null;
        out.oilPressure = null;
        out.boost = boost;
        out.boostSpec = u.boost;
        out.boostRatio = ratio(boost, u.boost.min, u.boost.max);
        out.peakBoost = state.peakBoostPsi === null ? null : state.peakBoostPsi * u.boost.factor;
        out.peakRpm = state.peakRpm;
        out.redline = state.redline;
        out.throttle = throttle;
        out.brake = brake;
        out.power = convert(data, live, 'PowerWatts', u.power === 'kw' ? 0.001 : u.power === 'ps' ? 0.0013596216 : 1 / 745.7);
        out.powerUnit = u.power === 'kw' ? 'kW' : u.power === 'ps' ? 'PS' : 'HP';
        out.torque = convert(data, live, 'TorqueNewtons', u.torque === 'lbft' ? 0.737562 : 1);
        out.torqueUnit = u.torque === 'lbft' ? 'lb·ft' : 'N·m';
        out.lateralG = convert(data, live, 'AccelerationX', -1 / 9.80665);
        out.longitudinalG = convert(data, live, 'AccelerationZ', 1 / 9.80665);
        out.completedLaps = read(data, live, 'LapNumber');
        out.lap = out.completedLaps === null ? null : out.completedLaps + 1;
        out.timerSeconds = live && (state.timerSeconds !== 0 || now < state.timerZeroUntil) ? state.timerSeconds : null;
        out.tachLcdMode = !live ? 'unavailable' : out.timerSeconds !== null ? 'timer' : 'power';
        out.currentLap = out.timerSeconds;
        out.bestLap = read(data, live, 'BestLap');
        out.lastLap = read(data, live, 'LastLap');
        out.laps = state.laps;
        out.distance = convert(data, live, 'DistanceTraveled', 0.001); // Retained km API; no longer displayed by the cluster.
        return out;
    }
    root.R34Model = { MODES: MODES, STALE_MS: STALE_MS, TIMER_ZERO_GRACE_MS: TIMER_ZERO_GRACE_MS, CAPACITY: CAPACITY, WINDOW_MS: WINDOW_MS,
        finite: finite, clamp: clamp, ratio: ratio, meanTireTemperatureC: meanTireTemperatureC, normalizeConfig: normalizeConfig, gear: gear, lapTime: lapTime, timerTime: timerTime,
        boostUnit: boostUnit, units: units, createState: createState, reset: reset, ingest: ingest, snapshot: snapshot, status: status };
    if (typeof module !== 'undefined' && module.exports) module.exports = root.R34Model;
})(typeof window !== 'undefined' ? window : globalThis);
