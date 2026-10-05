/* Display-only adapters. UDP Boost is PSI; canonical tire_temp_f is Fahrenheit. */
(function (root) {
    'use strict';
    const PSI_PER_BAR = 14.5038, KPA_PER_PSI = 6.89476;
    const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
    const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
    const clamp = value => Math.max(0, Math.min(1, value));
    const rawMarkers = ['TimestampMS', 'CurrentEngineRpm', 'EngineMaxRpm', 'SpeedMetersPerSecond', 'IsRaceOn', 'CarOrdinal'];
    const unit = value => typeof value === 'string' && ['bar', 'psi', 'kpa'].includes(value.toLowerCase()) ? value.toLowerCase() : null;
    const toPsi = (value, from) => from === 'bar' ? value * PSI_PER_BAR : from === 'kpa' ? value / KPA_PER_PSI : value;
    const fromPsi = (value, to) => to === 'bar' ? value / PSI_PER_BAR : to === 'kpa' ? value * KPA_PER_PSI : value;

    function averageTireF(value) {
        if (!Array.isArray(value) || value.length !== 4 || [0, 1, 2, 3].some(i => finite(value[i]) === null)) return null;
        return finite(value.reduce((sum, v) => sum + v / 4, 0));
    }
    function boostPsi(data) {
        // Shared JSON coordinator preserves raw Boost but clamps aliases and fills missing with zero.
        // An invalid/missing raw signal must not be "repaired" by those lossy aliases.
        if (own(data, 'Boost')) return finite(data.Boost);
        if (rawMarkers.some(key => own(data, key))) return null;
        for (const [key, sourceUnit] of [['boost_psi', 'psi'], ['boost_bar', 'bar'], ['boost_kpa', 'kpa']]) {
            if (own(data, key)) return finite(data[key]) === null ? null : finite(toPsi(data[key], sourceUnit));
        }
        const sourceUnit = own(data, 'boost_unit') ? unit(data.boost_unit) : unit(data.displayUnits?.boostPressure);
        return sourceUnit && finite(data.boost) !== null ? finite(toPsi(data.boost, sourceUnit)) : null;
    }
    function pedal(data, name, rawName) {
        if (rawMarkers.some(key => own(data, key)) && (!own(data, rawName) || finite(data[rawName]) === null)) return null;
        return finite(data[name]) === null ? null : clamp(data[name]);
    }
    function normalize(data) {
        return {
            tireF: averageTireF(data.tire_temp_f), boostPsi: boostPsi(data),
            tireWheelsF: Array.isArray(data.tire_temp_f) && data.tire_temp_f.length === 4
                ? [0, 1, 2, 3].map(i => finite(data.tire_temp_f[i])) : [null, null, null, null],
            throttle: pedal(data, 'throttle', 'AccelInput'), brake: pedal(data, 'brake', 'BrakeInput'),
            temperatureUnit: ['C', 'F'].includes(data.displayUnits?.temperature) ? data.displayUnits.temperature : null,
            boostUnit: unit(data.displayUnits?.boostPressure) || unit(data.boost_unit),
            metric: data.displayUnits?.speed === 'kmh' ? true : data.displayUnits?.speed === 'mph' ? false : null,
        };
    }
    function compact(value, digits) {
        if (value === null) return 'N/A';
        if (value > 9999) return 'HI';
        if (value < -999) return 'LO';
        return String(Number(value.toFixed(digits)));
    }
    function boostScale(bar) {
        const available = finite(bar) !== null, negative = available && bar < 0;
        // Both the fill and major graduations use this physical-bar mapping.
        // Vacuum reuses the whole curve with a separate, explicit magnitude scale.
        const fraction = value => negative ? clamp(value) : value <= 1 ? clamp(value) * .75 : .75 + clamp(value - 1) * .25;
        const ticks = negative ? [0, .25, .5, 1] : [0, .5, 1, 2];
        return { fraction: available ? fraction(Math.abs(bar)) : null, negative, ticks, tickFractions: ticks.map(fraction) };
    }
    function display(snapshot, settings) {
        const a = snapshot || normalize({}), metric = a.metric ?? settings.isMetric;
        const temperatureUnit = a.temperatureUnit || settings.temperatureUnit || (metric ? 'C' : 'F');
        const boostUnit = a.boostUnit || settings.boostUnit || (metric ? 'bar' : 'psi');
        const tireC = a.tireF === null ? null : (a.tireF - 32) * 5 / 9;
        const tireValue = temperatureUnit === 'F' ? a.tireF : tireC;
        const tireWheels = (a.tireWheelsF || [null, null, null, null]).map(value => value === null ? null : temperatureUnit === 'F' ? value : (value - 32) * 5 / 9);
        const tireWheelTexts = tireWheels.map(value => value === null ? '--' : compact(Math.round(value), 0));
        const temperatureTicks = [20, 60, 100, 140].map(v => String(temperatureUnit === 'F' ? v * 9 / 5 + 32 : v));
        const boostBar = a.boostPsi === null ? null : a.boostPsi / PSI_PER_BAR;
        const boostValue = a.boostPsi === null ? null : fromPsi(a.boostPsi, boostUnit);
        const scale = boostScale(boostBar);
        const boostDigits = boostUnit === 'bar' ? 2 : 1;
        const roundedBoost = compact(boostValue, boostDigits);
        const boostText = a.boostPsi < 0 && roundedBoost === '0' ? '-' + (0).toFixed(boostDigits) : roundedBoost;
        return {
            tireValue, tireText: compact(tireValue, 1), temperatureUnit: '°' + temperatureUnit,
            tireWheels, tireWheelTexts, tireWheelsText: tireWheelTexts.join('/') + ' °' + temperatureUnit,
            temperatureTicks, tireFraction: tireC === null ? null : clamp((tireC - 20) / 120),
            tireBand: tireC === null ? 'unavailable' : tireC < 75 ? 'cold' : tireC > 105 ? 'hot' : 'normal',
            boostValue, boostText, boostUnit: boostUnit === 'kpa' ? 'kPa' : boostUnit,
            boostTicks: scale.ticks.map(v => compact(fromPsi(v * PSI_PER_BAR, boostUnit), boostUnit === 'bar' ? 2 : 1)),
            boostFraction: scale.fraction, boostNegative: scale.negative, boostTickFractions: scale.tickFractions,
            throttle: a.throttle, brake: a.brake,
            throttleText: a.throttle === null ? 'N/A' : Math.round(a.throttle * 100) + '%',
            brakeText: a.brake === null ? 'N/A' : Math.round(a.brake * 100) + '%',
        };
    }
    root.LfaAuxiliary = { averageTireF, boostPsi, boostScale, normalize, display, unit };
})(typeof window === 'undefined' ? globalThis : window);
