/* Stack-specific persisted contract. Canonical thresholds never follow display units. */
(function(root) {
    'use strict';
    const own = (o, k) => Object.prototype.hasOwnProperty.call(o,k);
    const finite = v => typeof v === 'number' && Number.isFinite(v) ? v : null;
    const FIELDS = ["speed","gear","tire_avg","tire_max","boost","rpm","power","torque","throttle","brake","current_lap","race_time","last_lap","best_lap","lap","peak_rpm","peak_speed"];
    const METRICS = {
        "rpm": {
            "label": "Engine RPM",
            "min": 0,
            "max": 30000,
            "threshold": 7000,
            "hysteresis": 150,
            "property": "rpm",
            "unit": "rpm"
        },
        "speed": {
            "label": "Speed",
            "min": 0,
            "max": 1440,
            "threshold": 200,
            "hysteresis": 3,
            "property": "speedKmh",
            "unit": "speed"
        },
        "tire_avg": {
            "label": "Average tire temperature",
            "min": -100,
            "max": 800,
            "threshold": 120,
            "hysteresis": 5,
            "property": "tireAvgC",
            "unit": "temperature"
        },
        "tire_max": {
            "label": "Maximum tire temperature",
            "min": -100,
            "max": 800,
            "threshold": 120,
            "hysteresis": 5,
            "property": "tireMaxC",
            "unit": "temperature"
        },
        "boost": {
            "label": "Boost",
            "min": -1,
            "max": 10,
            "threshold": 1.5,
            "hysteresis": 0.1,
            "property": "boostBar",
            "unit": "boostPressure"
        },
        "power": {
            "label": "Power",
            "min": -2000,
            "max": 20000,
            "threshold": 300,
            "hysteresis": 5,
            "property": "powerKw",
            "unit": "power"
        },
        "torque": {
            "label": "Torque",
            "min": -100000,
            "max": 100000,
            "threshold": 500,
            "hysteresis": 10,
            "property": "torqueNm",
            "unit": "torque"
        },
        "throttle": {
            "label": "Throttle",
            "min": 0,
            "max": 100,
            "threshold": 90,
            "hysteresis": 2,
            "property": "throttle",
            "unit": "percent"
        },
        "brake": {
            "label": "Brake",
            "min": 0,
            "max": 100,
            "threshold": 90,
            "hysteresis": 2,
            "property": "brake",
            "unit": "percent"
        }
    };
    const DEFAULTS = {
        "stackSt8100Field1": "speed",
        "stackSt8100Field2": "gear",
        "stackSt8100Field3": "race_time",
        "stackSt8100Field4": "tire_avg",
        "stackSt8100Page": "live",
        "stackSt8100TemperatureUnit": "c",
        "stackSt8100Dial": "auto",
        "stackSt8100Face": "black",
        "stackSt8100ShiftEnabled": true,
        "stackSt8100ShiftPercent": 90,
        "stackSt8100Alarms": [
            {
                "enabled": false,
                "metric": "tire_max",
                "direction": "high",
                "threshold": 120
            },
            {
                "enabled": false,
                "metric": "boost",
                "direction": "high",
                "threshold": 1.5
            },
            {
                "enabled": false,
                "metric": "rpm",
                "direction": "high",
                "threshold": 7000
            }
        ]
    };
    const ENUMS = {
        "stackSt8100Dial": [
            "auto",
            "0-3-8",
            "0-4-10",
            "0-3-10.5",
            "0-6-13"
        ],
        "stackSt8100Face": [
            "black",
            "white"
        ],
        "stackSt8100Page": [
            "live",
            "peaks"
        ],
        "stackSt8100TemperatureUnit": [
            "c",
            "f"
        ]
    };
    const LEGACY = ["stackSt8100FuelWarningEnabled","stackSt8100FuelWarningPercent","stackSt8100TireWarningEnabled","stackSt8100TireWarningC","stackSt8100BoostWarningEnabled","stackSt8100BoostWarningBar"];
    function normalizeAlarms(value) {
        const result = [];
        for (let i = 0; i < 3; i++) {
            const input = Array.isArray(value) && value[i] && typeof value[i] === 'object' && !Array.isArray(value[i]) ? value[i] : {};
            const fallback = DEFAULTS.stackSt8100Alarms[i];
            const metric = typeof input.metric === 'string' && own(METRICS, input.metric) ? input.metric : fallback.metric;
            const spec = METRICS[metric];
            result.push({ enabled: input.enabled === true, metric, direction: input.direction === 'low' ? 'low' : 'high',
                threshold: finite(input.threshold) === null ? spec.threshold : Math.max(spec.min, Math.min(spec.max, input.threshold)) });
        }
        return result;
    }
    function normalize(input, active = input.hudStyle === 'stack_st8100') {
        const p = Object.assign({}, input);
        const oldWarnings = LEGACY.slice(2).some(key => own(p, key));
        if (!own(p, 'stackSt8100Alarms') && oldWarnings) {
            p.stackSt8100Alarms = normalizeAlarms([
                { metric: 'tire_max', enabled: p.stackSt8100TireWarningEnabled === true, threshold: p.stackSt8100TireWarningC },
                { metric: 'boost', enabled: p.stackSt8100BoostWarningEnabled === true, threshold: p.stackSt8100BoostWarningBar },
            ]);
        }
        for (const key of LEGACY) delete p[key];
        for (const key of Object.keys(DEFAULTS)) {
            if (!active && !own(p, key)) continue;
            const fallback = DEFAULTS[key], value = p[key];
            if (key === 'stackSt8100Alarms') p[key] = normalizeAlarms(value);
            else if (key === 'stackSt8100ShiftEnabled') p[key] = typeof value === 'boolean' ? value : fallback;
            else if (key === 'stackSt8100ShiftPercent') p[key] = finite(value) === null ? fallback : Math.max(50, Math.min(100, value));
            else if (key.includes('Field')) p[key] = value === 'fuel' ? 'race_time' : FIELDS.includes(value) ? value : fallback;
            else p[key] = ENUMS[key].includes(value) ? value : fallback;
        }
        return p;
    }
    root.StackConfig = { FIELDS, METRICS, DEFAULTS, ENUMS, LEGACY, normalizeAlarms, normalize };
})(typeof window === 'undefined' ? globalThis : window);
