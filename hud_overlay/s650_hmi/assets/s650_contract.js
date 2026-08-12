/*
 * S650 HMI data and layout contract.
 *
 * This file is intentionally dependency-free and is loaded before the
 * renderer modules. It defines the only telemetry/config shape that the
 * S650 Canvas renderer is allowed to consume.
 */
(function (window) {
    'use strict';

    var THEMES = [
        'normal',
        'heritage67',
        'foxbody',
        'track'
    ];

    var CENTER_WIDGETS = [
        'disable',
        'drive',
        'tire_temp',
        'performance'
    ];

    // Code-only assignment for Heritage dual-ring telemetry slots. This is
    // intentionally separate from user-facing HMI configuration.
    var HERITAGE_TELEMETRY_SLOTS = Object.freeze({
        center: Object.freeze({
            topLeft: 'odometer',
            topRight: 'heading',
            bottomLeft: 'rpm',
            bottomRight: 'speed'
        }),
        side: Object.freeze({
            left: 'power',
            right: 'boost'
        })
    });

    var CANVAS = {
        width: 1280,
        height: 480,
        safeZone: {
            top: 40,
            left: 48,
            right: 48,
            bottom: 40
        },
        gauge: {
            leftCenterX: 256,
            rightCenterX: 1024,
            centerY: 250,
            radius: 180,
            speedScaleMax: 360
        },
        regions: {
            header: { x: 0, y: 0, width: 1280, height: 64 },
            left: { x: 48, y: 64, width: 352, height: 360 },
            center: { x: 400, y: 64, width: 480, height: 360 },
            right: { x: 880, y: 64, width: 352, height: 360 },
            footer: { x: 48, y: 424, width: 1184, height: 56 },
            telltales: { x: 48, y: 424, width: 360, height: 56 }
        }
    };

    var EMPTY_TIRE_TEMPERATURES = Object.freeze([null, null, null, null]);

    // This is deliberately a closed shape. The coordinator is the only
    // upstream owner that converts raw Forza telemetry into these fixed-unit
    // values; the renderer must never infer aliases or source units.
    var DEFAULT_FRAME = {
        rpm: 0,
        maxRpm: 8000,
        redlineRpm: 7000,
        speed_kmh: 0,
        speed_mph: 0,
        gear: 1,
        throttle: 0,
        brake: 0,
        distance_m: 0,
        heading_deg: 0,
        tire_temp_f: EMPTY_TIRE_TEMPERATURES,
        power_hp: 0,
        power_kw: 0,
        torque_nm: 0,
        torque_ftlbs: 0,
        boost_psi: 0,
        boost_bar: 0,
        fuel_ratio: null,
        lap: null,
        race_position: null
    };

    function isObject(value) {
        return value !== null && typeof value === 'object';
    }

    function finiteNumber(value, fallback) {
        var number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function firstDefined() {
        for (var i = 0; i < arguments.length; i += 1) {
            if (arguments[i] !== undefined && arguments[i] !== null) return arguments[i];
        }
        return undefined;
    }

    function normalizeTheme(theme) {
        return THEMES.indexOf(theme) >= 0 ? theme : 'heritage67';
    }

    function normalizeCenterWidget(widget) {
        return CENTER_WIDGETS.indexOf(widget) >= 0 ? widget : 'drive';
    }

    function readValue(payload, key) {
        if (!isObject(payload)) return undefined;
        if (payload[key] !== undefined) return payload[key];
        if (isObject(payload.data) && payload.data[key] !== undefined) return payload.data[key];
        return undefined;
    }

    function readElements(payload) {
        var elements = readValue(payload, 'elements');
        return isObject(elements) ? elements : {};
    }

    function normalizeConfig(payload) {
        var rawTheme = firstDefined(readValue(payload, 's650Theme'), readValue(payload, 'clusterTheme'));
        var rawMetric = firstDefined(readValue(payload, 'isMetric'), readValue(payload, 'metric'));
        var unit = readValue(payload, 'unit');

        var isMetric = rawMetric === undefined
            ? unit !== 'mph' && unit !== 'imperial'
            : rawMetric !== false;

        return {
            contractVersion: 's650-hmi/v2',
            theme: normalizeTheme(rawTheme),
            centerWidget: normalizeCenterWidget(firstDefined(readValue(payload, 's650CenterWidget'), readValue(payload, 'centerWidget'))),
            guiThemeMode: readValue(payload, 's650GuiThemeMode') === 'light' ? 'light' : 'dark',
            isMetric: isMetric,
            elements: readElements(payload)
        };
    }

    function nullableNumber(value) {
        if (value === undefined || value === null || value === '') return null;
        var number = Number(value);
        return Number.isFinite(number) ? number : null;
    }

    function normalizeTireTemperatures(source) {
        return Array.isArray(source.tire_temp_f)
            ? source.tire_temp_f
            : EMPTY_TIRE_TEMPERATURES;
    }

    function normalizeFrame(data) {
        var source = isObject(data) ? data : {};
        var maxRpm = Math.max(1, finiteNumber(source.maxRpm, DEFAULT_FRAME.maxRpm));
        var rpm = Math.max(0, finiteNumber(source.rpm, DEFAULT_FRAME.rpm));
        var redline = clamp(
            finiteNumber(source.redlineRpm, maxRpm - 1000),
            1,
            maxRpm
        );
        var heading = finiteNumber(source.heading_deg, DEFAULT_FRAME.heading_deg);
        var fuelRatio = nullableNumber(source.fuel_ratio);

        return {
            rpm: rpm,
            maxRpm: maxRpm,
            redlineRpm: redline,
            speed_kmh: Math.max(0, finiteNumber(source.speed_kmh, DEFAULT_FRAME.speed_kmh)),
            speed_mph: Math.max(0, finiteNumber(source.speed_mph, DEFAULT_FRAME.speed_mph)),
            gear: finiteNumber(source.gear, DEFAULT_FRAME.gear),
            throttle: clamp(finiteNumber(source.throttle, DEFAULT_FRAME.throttle), 0, 1),
            brake: clamp(finiteNumber(source.brake, DEFAULT_FRAME.brake), 0, 1),
            distance_m: Math.max(0, finiteNumber(source.distance_m, DEFAULT_FRAME.distance_m)),
            heading_deg: ((heading % 360) + 360) % 360,
            tire_temp_f: normalizeTireTemperatures(source),
            power_hp: Math.max(0, finiteNumber(source.power_hp, DEFAULT_FRAME.power_hp)),
            power_kw: Math.max(0, finiteNumber(source.power_kw, DEFAULT_FRAME.power_kw)),
            torque_nm: finiteNumber(source.torque_nm, DEFAULT_FRAME.torque_nm),
            torque_ftlbs: finiteNumber(source.torque_ftlbs, DEFAULT_FRAME.torque_ftlbs),
            boost_psi: Math.max(0, finiteNumber(source.boost_psi, DEFAULT_FRAME.boost_psi)),
            boost_bar: Math.max(0, finiteNumber(source.boost_bar, DEFAULT_FRAME.boost_bar)),
            fuel_ratio: fuelRatio === null ? null : clamp(fuelRatio, 0, 1),
            lap: nullableNumber(source.lap),
            race_position: nullableNumber(source.race_position)
        };
    }

    window.S650HmiContract = {
        version: 's650-hmi/v2',
        themes: Object.freeze(THEMES.slice()),
        centerWidgets: Object.freeze(CENTER_WIDGETS.slice()),
        heritageTelemetrySlots: HERITAGE_TELEMETRY_SLOTS,
        canvas: CANVAS,
        defaultFrame: Object.freeze(Object.assign({}, DEFAULT_FRAME)),
        clamp: clamp,
        finiteNumber: finiteNumber,
        normalizeTheme: normalizeTheme,
        normalizeCenterWidget: normalizeCenterWidget,
        normalizeConfig: normalizeConfig,
        normalizeFrame: normalizeFrame
    };
})(window);
