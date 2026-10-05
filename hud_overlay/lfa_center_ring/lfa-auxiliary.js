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
    function display(snapshot, settings) {
        const a = snapshot || normalize({}), metric = a.metric ?? settings.isMetric;
        const temperatureUnit = a.temperatureUnit || settings.temperatureUnit || (metric ? 'C' : 'F');
        const boostUnit = a.boostUnit || settings.boostUnit || (metric ? 'bar' : 'psi');
        const tireC = a.tireF === null ? null : (a.tireF - 32) * 5 / 9;
        const tireValue = temperatureUnit === 'F' ? a.tireF : tireC;
        const temperatureTicks = [20, 60, 100, 140].map(v => String(temperatureUnit === 'F' ? v * 9 / 5 + 32 : v));
        const boostBar = a.boostPsi === null ? null : a.boostPsi / PSI_PER_BAR;
        const boostValue = a.boostPsi === null ? null : fromPsi(a.boostPsi, boostUnit);
        // Classic JDM convention: vacuum -1..0 bar gets 35%, boost 0..2 gets 65%.
        const boostFraction = boostBar === null ? null : boostBar <= 0 ? clamp(boostBar + 1) * .35 : .35 + clamp(boostBar / 2) * .65;
        return {
            tireValue, tireText: compact(tireValue, 1), temperatureUnit: '°' + temperatureUnit,
            temperatureTicks, tireFraction: tireC === null ? null : clamp((tireC - 20) / 120),
            tireBand: tireC === null ? 'unavailable' : tireC < 75 ? 'cold' : tireC > 105 ? 'hot' : 'normal',
            boostValue, boostText: compact(boostValue, boostUnit === 'bar' ? 2 : 1), boostUnit: boostUnit === 'kpa' ? 'kPa' : boostUnit,
            boostTicks: [-1, 0, 1, 2].map(v => compact(fromPsi(v * PSI_PER_BAR, boostUnit), boostUnit === 'bar' ? 0 : 1)),
            boostFraction, boostNegative: boostBar !== null && boostBar < 0,
            throttle: a.throttle, brake: a.brake,
            throttleText: a.throttle === null ? 'N/A' : Math.round(a.throttle * 100) + '%',
            brakeText: a.brake === null ? 'N/A' : Math.round(a.brake * 100) + '%',
        };
    }
    root.LfaAuxiliary = { averageTireF, boostPsi, normalize, display, unit };
})(typeof window === 'undefined' ? globalThis : window);
