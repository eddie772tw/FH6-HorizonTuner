// Semantic readings belong to the shared telemetry pipeline, never to a faceplate.
export const GAUGE_SOURCE_DEFAULTS = {
    boost: { field: 'boost_psi', unit: 'psi', label: 'Boost' },
    oilPressure: { field: 'estimated_oil_pressure_psi', unit: 'psi', label: 'Estimated oil pressure (engine load)' },
    oilTemperature: { field: 'tire_temp_avg', unit: 'F', label: 'Average tire temperature' },
    waterTemperature: { field: 'tire_temp_avg', unit: 'F', label: 'Average tire temperature' },
};
export const GAUGE_VALUE_KEYS = Object.keys(GAUGE_SOURCE_DEFAULTS);
const TIRE_FIELDS = ['temp_fl', 'temp_fr', 'temp_rl', 'temp_rr'];
export const GAUGE_SOURCE_UNITS = ['native', 'C', 'F', 'psi', 'bar', 'kpa'];
export const GAUGE_TELEMETRY_FIELDS = [
    '', 'estimated_oil_pressure_psi', 'tire_temp_avg', 'temp_fl', 'temp_fr', 'temp_rl', 'temp_rr',
    'boost_psi', 'boost_bar', 'boost_kpa', 'rpm', 'maxRpm',
    'speed_kmh', 'speed_mph', 'power_kw', 'power_hp', 'torque_nm', 'torque_ftlbs',
    'throttle', 'brake', 'clutch', 'fuel_ratio', 'accel_x', 'accel_y', 'accel_z',
    'susp_fl', 'susp_fr', 'susp_rl', 'susp_rr',
];

export function normalizeGaugeValueSources(input) {
    const result = {};
    for (const key of GAUGE_VALUE_KEYS) {
        const fallback = GAUGE_SOURCE_DEFAULTS[key];
        let source = input?.[key];
        // Upgrade only the exact former defaults; deliberately unassigned/custom mappings survive.
        if (source?.field === '' && (
            (key === 'oilPressure' && source.unit === 'psi' && source.label === 'Oil pressure (unassigned)') ||
            (key === 'oilTemperature' && source.unit === 'C' && source.label === 'Oil temperature (unassigned)')
        )) source = undefined;
        const units = key.endsWith('Temperature') ? ['native', 'C', 'F'] : ['native', 'psi', 'bar', 'kpa'];
        result[key] = {
            field: typeof source?.field === 'string' && /^(?:[A-Za-z][A-Za-z0-9_]{0,63})?$/.test(source.field)
                ? source.field : fallback.field,
            unit: units.includes(source?.unit) ? source.unit : fallback.unit,
            label: typeof source?.label === 'string' && source.label.trim()
                ? Array.from(source.label.trim()).slice(0, 64).join('') : fallback.label,
        };
    }
    return result;
}

// Reuse the caller-owned output at telemetry rate. All target values use °C / PSI.
// 'native' explicitly interprets a different field's numeric value in the target unit.
export function readGaugeValues(data, sources, output, estimatedPressure = null) {
    for (const key of GAUGE_VALUE_KEYS) {
        const source = sources[key];
        const temperatures = data.tire_temp_f ?? data.TireTemp;
        const tireIndex = TIRE_FIELDS.indexOf(source.field);
        let value = null;
        if (source.field === 'estimated_oil_pressure_psi') {
            value = estimatedPressure;
        } else if (source.field === 'tire_temp_avg') {
            let sum = 0;
            let count = 0;
            for (let i = 0; i < 4; i++) {
                const sample = temperatures?.[i];
                if (typeof sample === 'number' && Number.isFinite(sample)) { sum += sample; count++; }
            }
            if (count) value = sum / count;
        } else if (tireIndex >= 0 && Array.isArray(data.tire_temp_f)) {
            const sample = data.tire_temp_f[tireIndex];
            if (typeof sample === 'number' && Number.isFinite(sample)) value = sample;
        } else if (source.field && Object.hasOwn(data, source.field)) {
            const sample = data[source.field];
            if (typeof sample === 'number' && Number.isFinite(sample)) value = sample;
        }
        if (value !== null) {
            if (key === 'oilTemperature' || key === 'waterTemperature') {
                if (source.unit === 'F') value = (value - 32) * 5 / 9;
            } else {
                if (source.unit === 'bar') value *= 14.5038;
                if (source.unit === 'kpa') value /= 6.89476;
            }
        }
        output[key] = value;
    }
    return output;
}

// A visual load proxy, not a measured engine sensor or a tuning/physics model.
// Normalized engine workload = throttle * RPM/maxRPM; pressure target spans 20..80 PSI.
function estimatedOilPressureTarget(data) {
    const rpm = data.rpm ?? data.CurrentEngineRpm;
    if (typeof rpm !== 'number' || !Number.isFinite(rpm) || rpm < 0) return null;
    if (rpm === 0) return 0;
    const maxRpm = data.maxRpm ?? data.max_rpm ?? data.EngineMaxRpm;
    const throttle = data.throttle ?? (typeof data.AccelInput === 'number' ? data.AccelInput / 255 : null);
    if (typeof maxRpm !== 'number' || !Number.isFinite(maxRpm) || maxRpm <= 0 ||
        typeof throttle !== 'number' || !Number.isFinite(throttle)) return null;
    const load = Math.min(1, rpm / maxRpm) * Math.max(0, Math.min(1, throttle));
    return 20 + 60 * load;
}

// One reader per launcher. Elapsed-time damping is independent of render frequency;
// raw telemetry and explicit source overrides never pass through this filter.
export function createGaugeValueReader() {
    let pressure = null;
    let lastTime = null;
    let lastCar = null;
    return function(data, sources, output, now = performance.now()) {
        const target = estimatedOilPressureTarget(data);
        const car = data.CarOrdinal ?? data.carOrdinal ?? null;
        if (target === null || !Number.isFinite(now) || data.IsRaceOn === 0 || data.isRaceOn === false) {
            pressure = null;
            lastTime = null;
        } else if (pressure === null || car !== lastCar || now < lastTime) {
            pressure = 0;
            lastTime = now;
        } else {
            pressure += (target - pressure) * -Math.expm1(-(now - lastTime) / 1500);
            lastTime = now;
        }
        lastCar = car;
        return readGaugeValues(data, sources, output, pressure);
    };
}
