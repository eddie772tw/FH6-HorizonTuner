/* Original ST8100-inspired display contract. No simulated vehicle sensors. */
(function (root) {
    'use strict';
    const STALE_MS = 1500;
    const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    const finite = v => typeof v === 'number' && Number.isFinite(v) ? v : null;
    const bounded = (v, min, max) => finite(v) !== null && v >= min && v <= max ? v : null;
    const C = root.StackConfig, FIELDS = C.FIELDS, DEFAULTS = C.DEFAULTS, METRICS = C.METRICS;
    function config(input, previous) {
        // Migrate the incoming boundary before defaults from an earlier init can mask legacy alarms.
        const p = C.normalize(input || {}, false), result = C.normalize(Object.assign({}, previous, p), true);
        const units = p.effectiveUnits || p.units || {};
        result.speedUnit = ['kmh', 'mph'].includes(units.speed) ? units.speed : ['kmh', 'mph'].includes(p.unit) ? p.unit : result.speedUnit || 'kmh';
        result.powerUnit = ['kw', 'hp', 'ps'].includes(units.power) ? units.power : result.powerUnit || 'hp';
        result.torqueUnit = ['nm', 'lbft'].includes(units.torque) ? units.torque : result.torqueUnit || 'nm';
        result.boostUnit = ['bar', 'psi', 'kpa'].includes(units.boostPressure) ? units.boostPressure : result.boostUnit || 'bar';
        result.showGauge = typeof p.elements?.showGauge === 'boolean' ? p.elements.showGauge : result.showGauge !== false;
        result.showRPM = typeof p.elements?.showRPM === 'boolean' ? p.elements.showRPM : result.showRPM !== false;
        result.showLCD = typeof p.elements?.showCenterInfo === 'boolean' ? p.elements.showCenterInfo : result.showLCD !== false;
        result.showSpeed = typeof p.elements?.showSpeed === 'boolean' ? p.elements.showSpeed : result.showSpeed !== false;
        result.showGear = typeof p.elements?.showGear === 'boolean' ? p.elements.showGear : result.showGear !== false;
        result.showBoost = typeof p.elements?.showBoost === 'boolean' ? p.elements.showBoost : result.showBoost !== false;
        result.accent = p.useDefaultColors === false && /^#[0-9a-f]{6}$/i.test(p.customColor || '') ? p.customColor
            : p.useDefaultColors === true ? null : result.accent || null;
        result.glow = finite(p.glowIntensity) === null ? result.glow ?? 1 : Math.max(0, Math.min(2, p.glowIntensity));
        return result;
    }
    function visualRpm(d) { return bounded(d?.CurrentEngineRpm, 0, 30000); }
    function sample(data, out) {
        // Shared Coordinator retains the read-only unsmoothed decoded sample.
        // Direct raw packets remain supported by fixtures and standalone integrations.
        const d = own(data, 'sourceTelemetry')
            ? (data.sourceTelemetry && typeof data.sourceTelemetry === 'object' && !Array.isArray(data.sourceTelemetry) ? data.sourceTelemetry : {})
            : data;
        const stamp = d.TimestampMS;
        out.timestamp = Number.isInteger(stamp) ? bounded(stamp, 0, 0xffffffff) : null;
        out.raceOn = d.IsRaceOn;
        out.car = bounded(d.CarOrdinal, 0, 0x7fffffff);
        out.raceTime = bounded(d.CurrentRaceTime, 0, 1e9);
        out.position = Number.isInteger(d.RacePosition) ? bounded(d.RacePosition, 1, 255) : null;
        out.lap = Number.isInteger(d.LapNumber) ? bounded(d.LapNumber, 0, 65535) : null;
        out.rpm = bounded(d.CurrentEngineRpm, 0, 30000);
        out.maxRpm = bounded(d.EngineMaxRpm, 1, 30000);
        out.speedKmh = own(d, 'SpeedMetersPerSecond') ? bounded(d.SpeedMetersPerSecond, 0, 400) : null;
        if (out.speedKmh !== null) out.speedKmh *= 3.6;
        const gear = d.Gear;
        out.gear = Number.isInteger(gear) ? bounded(gear, 0, 11) : null;
        out.powerKw = bounded(d.PowerWatts, -2000000, 20000000);
        if (out.powerKw !== null) out.powerKw /= 1000;
        out.torqueNm = bounded(d.TorqueNewtons, -100000, 100000);
        out.throttle = bounded(d.AccelInput, 0, 255); if (out.throttle !== null) out.throttle = out.throttle / 255 * 100;
        out.brake = bounded(d.BrakeInput, 0, 255); if (out.brake !== null) out.brake = out.brake / 255 * 100;
        out.boostBar = own(d, 'Boost') ? bounded(d.Boost, -15, 150) : null;
        if (out.boostBar !== null) out.boostBar *= .0689476;
        // Canonical tire_temp_f preserves absence; coordinator manufactures TireTemp zeroes.
        const tires = own(d, 'tire_temp_f') ? d.tire_temp_f : d.TireTemp;
        out.tireAvgC = null; out.tireMaxC = null;
        if (Array.isArray(tires) && tires.length === 4) {
            let sum = 0, max = -Infinity, valid = true;
            for (let i = 0; i < 4; i++) {
                if (bounded(tires[i], -148, 1472) === null) { valid = false; break; }
                sum += tires[i]; max = Math.max(max, tires[i]);
            }
            if (valid) { out.tireAvgC = (sum / 4 - 32) * 5 / 9; out.tireMaxC = (max - 32) * 5 / 9; }
        }
        out.currentLap = bounded(d.CurrentLap, .001, 5999.99);
        out.lastLap = bounded(d.LastLap, .001, 5999.99);
        out.bestLap = bounded(d.BestLap, .001, 5999.99);
        out.failed = d.success === false || Boolean(d.error);
        return out;
    }
    const DIALS = Object.freeze({ '0-3-8': { id: '0-3-8', knee: 3000, max: 8000 },
        '0-4-10': { id: '0-4-10', knee: 4000, max: 10000 }, '0-3-10.5': { id: '0-3-10.5', knee: 3000, max: 10500 }, '0-6-13': { id: '0-6-13', knee: 6000, max: 13000 } });
    function dial(settings, maxRpm) {
        return DIALS[settings.stackSt8100Dial] || DIALS[maxRpm > 10500 ? '0-6-13' : maxRpm > 10000 ? '0-3-10.5' : maxRpm > 8000 ? '0-4-10' : '0-3-8'];
    }
    function angle(rpm, scale) {
        const value = Math.max(0, Math.min(scale.max, finite(rpm) || 0));
        // Viewed compressed dial: low-speed sector ~35°, working band ~215°.
        return (145 + (value <= scale.knee ? value / scale.knee * 35 : 35 + (value - scale.knee) / (scale.max - scale.knee) * 215)) * Math.PI / 180;
    }
    function formatLap(value) {
        if (value === null) return '--:--.--';
        const n = Math.round(value * 100);
        return Math.floor(n / 6000) + ':' + String(Math.floor(n / 100) % 60).padStart(2, '0') + '.' + String(n % 100).padStart(2, '0');
    }
    function temperature(c, settings) { return c === null ? null : settings.stackSt8100TemperatureUnit === 'f' ? c * 9 / 5 + 32 : c; }
    function pressure(bar, settings) { return bar === null ? null : bar * (settings.boostUnit === 'psi' ? 1 / .0689476 : settings.boostUnit === 'kpa' ? 100 : 1); }
    function speed(kmh, settings) { return kmh === null ? null : kmh * (settings.speedUnit === 'mph' ? 1 / 1.609344 : 1); }
    function power(kw, s) { return kw === null ? null : kw * (s.powerUnit === 'hp' ? 1000 / 745.7 : s.powerUnit === 'ps' ? 1.35962 : 1); }
    function torque(nm, s) { return nm === null ? null : nm * (s.torqueUnit === 'lbft' ? .73756 : 1); }
    function settingsPowerUnit(s) { return s.powerUnit.toUpperCase(); }
    function field(key, state, out) {
        const d = state.latest, s = state.settings, live = state.status === 'LIVE';
        let value = null; out.label = ''; out.value = '--';
        if (key === 'speed' || key === 'peak_speed') { out.label = key === 'speed' ? (s.speedUnit === 'mph' ? 'MPH' : 'KM/H') : 'MAX SPD'; value = s.showSpeed ? speed(live ? key === 'speed' ? d.speedKmh : state.peakSpeed : null, s) : null; }
        else if (key === 'rpm' || key === 'peak_rpm') { out.label = key === 'rpm' ? 'RPM' : 'MAX RPM'; value = s.showRPM && live ? key === 'rpm' ? d.rpm : state.peakRpm : null; }
        else if (key === 'gear') { out.label = 'GEAR'; out.value = !live || !s.showGear || d.gear === null ? '--' : d.gear === 0 ? 'R' : d.gear === 11 ? 'N' : String(d.gear); return out; }
        else if (key === 'power') { out.label = settingsPowerUnit(s); value = live ? power(d.powerKw, s) : null; }
        else if (key === 'torque') { out.label = s.torqueUnit === 'lbft' ? 'LBFT' : 'NM'; value = live ? torque(d.torqueNm, s) : null; }
        else if (key === 'throttle' || key === 'brake') { out.label = key === 'throttle' ? 'THR %' : 'BRK %'; value = live ? d[key] : null; }
        else if (key === 'tire_avg' || key === 'tire_max') { out.label = (key === 'tire_avg' ? 'TYRE ' : 'HOT ') + s.stackSt8100TemperatureUnit.toUpperCase(); value = temperature(live ? key === 'tire_avg' ? d.tireAvgC : d.tireMaxC : null, s); }
        else if (key === 'boost') { out.label = 'BST ' + s.boostUnit.toUpperCase(); value = pressure(live && s.showBoost ? d.boostBar : null, s); }
        else if (key === 'position') { out.label = 'POS'; value = live ? d.position : null; }
        else if (key === 'lap') { out.label = 'LAPS'; value = live ? d.lap : null; }
        else { out.label = key === 'race_time' ? 'TIME' : key === 'current_lap' ? 'LAP' : key === 'last_lap' ? 'LAST' : 'BEST'; out.value = formatLap(live ? key === 'race_time' ? d.raceTime : key === 'current_lap' ? d.currentLap : key === 'last_lap' ? d.lastLap : d.bestLap : null); return out; }
        out.value = value === null ? '--' : key === 'boost' ? value.toFixed(s.boostUnit === 'bar' ? 2 : 1) : String(Math.round(value));
        return out;
    }
    const ALARM_LABELS = { rpm: 'RPM', speed: 'SPEED', tire_avg: 'AVG TYRE', tire_max: 'TYRE TEMP', boost: 'BOOST', power: 'POWER', torque: 'TORQUE', throttle: 'THROTTLE', brake: 'BRAKE' };
    function alarmField(state, index, out) {
        const slot = state.settings.stackSt8100Alarms[index], spec = METRICS[slot.metric], settings = state.settings;
        let value = state.latest[spec.property], unit = spec.unit;
        if (unit === 'speed') { value = speed(value, settings); unit = settings.speedUnit === 'mph' ? 'MPH' : 'KM/H'; }
        else if (unit === 'temperature') { value = temperature(value, settings); unit = settings.stackSt8100TemperatureUnit.toUpperCase(); }
        else if (unit === 'boostPressure') { value = pressure(value, settings); unit = settings.boostUnit.toUpperCase(); }
        else if (unit === 'power') { value = power(value, settings); unit = settingsPowerUnit(settings); }
        else if (unit === 'torque') { value = torque(value, settings); unit = settings.torqueUnit === 'lbft' ? 'LBFT' : 'NM'; }
        else if (unit === 'percent') unit = '%';
        else unit = 'RPM';
        out.label = (slot.direction === 'low' ? 'LOW ' : 'HIGH ') + ALARM_LABELS[slot.metric];
        out.value = value === null ? '--' : (slot.metric === 'boost' ? value.toFixed(settings.boostUnit === 'bar' ? 2 : 1) : String(Math.round(value))) + ' ' + unit;
        return out;
    }
    root.StackModel = { STALE_MS, DEFAULTS, FIELDS, METRICS, DIALS, finite, config, sample, visualRpm, dial, angle, formatLap, temperature, pressure, speed, power, torque, field, alarmField };
})(typeof window === 'undefined' ? globalThis : window);
