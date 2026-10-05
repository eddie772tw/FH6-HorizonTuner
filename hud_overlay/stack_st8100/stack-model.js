/* Original ST8100-inspired display contract. No simulated vehicle sensors. */
(function (root) {
    'use strict';
    const STALE_MS = 1500;
    const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    const finite = v => typeof v === 'number' && Number.isFinite(v) ? v : null;
    const bounded = (v, min, max) => finite(v) !== null && v >= min && v <= max ? v : null;
    const FIELDS = ['speed', 'gear', 'fuel', 'tire_avg', 'tire_max', 'boost', 'rpm', 'current_lap', 'last_lap', 'best_lap', 'lap', 'peak_rpm', 'peak_speed'];
    const DEFAULTS = Object.freeze({
        stackSt8100Field1: 'speed', stackSt8100Field2: 'gear', stackSt8100Field3: 'fuel', stackSt8100Field4: 'tire_avg',
        stackSt8100Page: 'live', stackSt8100TemperatureUnit: 'c', stackSt8100Dial: 'auto',
        stackSt8100ShiftEnabled: true, stackSt8100ShiftPercent: 90,
        stackSt8100FuelWarningEnabled: false, stackSt8100FuelWarningPercent: 10,
        stackSt8100TireWarningEnabled: false, stackSt8100TireWarningC: 120,
        stackSt8100BoostWarningEnabled: false, stackSt8100BoostWarningBar: 1.5,
    });
    function config(input, previous) {
        const p = input || {}, result = Object.assign({}, DEFAULTS, previous);
        for (const key of Object.keys(DEFAULTS)) {
            if (!own(p, key)) continue;
            const fallback = DEFAULTS[key], value = p[key];
            if (typeof fallback === 'boolean') result[key] = typeof value === 'boolean' ? value : fallback;
            else if (typeof fallback === 'number') {
                const limits = key.endsWith('ShiftPercent') ? [50, 100] : key.endsWith('FuelWarningPercent') ? [1, 50]
                    : key.endsWith('TireWarningC') ? [50, 200] : [.1, 5];
                result[key] = finite(value) === null ? fallback : Math.max(limits[0], Math.min(limits[1], value));
            } else {
                const values = key.includes('Field') ? FIELDS : key.endsWith('Page') ? ['live', 'peaks']
                    : key.endsWith('Dial') ? ['auto', '0-3-8', '0-4-10', '0-6-13'] : ['c', 'f'];
                result[key] = values.includes(value) ? value : fallback;
            }
        }
        const units = p.effectiveUnits || p.units || {};
        result.speedUnit = ['kmh', 'mph'].includes(units.speed) ? units.speed : ['kmh', 'mph'].includes(p.unit) ? p.unit : result.speedUnit || 'kmh';
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
        out.lap = Number.isInteger(d.LapNumber) ? bounded(d.LapNumber, 0, 65535) : null;
        out.rpm = bounded(d.CurrentEngineRpm, 0, 30000);
        out.maxRpm = bounded(d.EngineMaxRpm, 1, 30000);
        out.speedKmh = own(d, 'SpeedMetersPerSecond') ? bounded(d.SpeedMetersPerSecond, 0, 400) : null;
        if (out.speedKmh !== null) out.speedKmh *= 3.6;
        const gear = d.Gear;
        out.gear = Number.isInteger(gear) ? bounded(gear, 0, 11) : null;
        out.fuel = bounded(d.Fuel, 0, 1);
        if (out.fuel !== null) out.fuel *= 100;
        out.boostBar = own(d, 'Boost') ? bounded(d.Boost, -15, 150) : null;
        if (out.boostBar !== null) out.boostBar /= 14.5038;
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
        '0-4-10': { id: '0-4-10', knee: 4000, max: 10000 }, '0-6-13': { id: '0-6-13', knee: 6000, max: 13000 } });
    function dial(settings, maxRpm) {
        return DIALS[settings.stackSt8100Dial] || DIALS[maxRpm > 10000 ? '0-6-13' : maxRpm > 8000 ? '0-4-10' : '0-3-8'];
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
    function pressure(bar, settings) { return bar === null ? null : bar * (settings.boostUnit === 'psi' ? 14.5038 : settings.boostUnit === 'kpa' ? 100 : 1); }
    function speed(kmh, settings) { return kmh === null ? null : kmh * (settings.speedUnit === 'mph' ? 1 / 1.609344 : 1); }
    function field(key, state, out) {
        const d = state.latest, s = state.settings, live = state.status === 'LIVE';
        let value = null; out.label = ''; out.value = '--';
        if (key === 'speed' || key === 'peak_speed') { out.label = key === 'speed' ? (s.speedUnit === 'mph' ? 'MPH' : 'KM/H') : 'MAX SPD'; value = s.showSpeed ? speed(live ? key === 'speed' ? d.speedKmh : state.peakSpeed : null, s) : null; }
        else if (key === 'rpm' || key === 'peak_rpm') { out.label = key === 'rpm' ? 'RPM' : 'MAX RPM'; value = s.showRPM && live ? key === 'rpm' ? d.rpm : state.peakRpm : null; }
        else if (key === 'gear') { out.label = 'GEAR'; out.value = !live || !s.showGear || d.gear === null ? '--' : d.gear === 0 ? 'R' : d.gear === 11 ? 'N' : String(d.gear); return out; }
        else if (key === 'fuel') { out.label = 'FUEL %'; value = live ? d.fuel : null; }
        else if (key === 'tire_avg' || key === 'tire_max') { out.label = (key === 'tire_avg' ? 'TYRE ' : 'HOT ') + s.stackSt8100TemperatureUnit.toUpperCase(); value = temperature(live ? key === 'tire_avg' ? d.tireAvgC : d.tireMaxC : null, s); }
        else if (key === 'boost') { out.label = 'BST ' + s.boostUnit.toUpperCase(); value = pressure(live && s.showBoost ? d.boostBar : null, s); }
        else if (key === 'lap') { out.label = 'LAPS'; value = live ? d.lap : null; }
        else { out.label = key === 'current_lap' ? 'LAP' : key === 'last_lap' ? 'LAST' : 'BEST'; out.value = formatLap(live ? key === 'current_lap' ? d.currentLap : key === 'last_lap' ? d.lastLap : d.bestLap : null); return out; }
        out.value = value === null ? '--' : key === 'boost' ? value.toFixed(s.boostUnit === 'bar' ? 2 : 1) : String(Math.round(value));
        return out;
    }
    root.StackModel = { STALE_MS, DEFAULTS, FIELDS, DIALS, finite, config, sample, visualRpm, dial, angle, formatLap, temperature, pressure, speed, field };
})(typeof window === 'undefined' ? globalThis : window);
