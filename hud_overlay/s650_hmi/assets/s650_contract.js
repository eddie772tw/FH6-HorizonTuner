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
        'sport',
        'track',
        'calm',
        'foxbody',
        'heritage67',
        'svt_cobra'
    ];

    var DRIVE_MODES = [
        'normal',
        'sport',
        'slippery',
        'track',
        'drag_strip',
        'custom'
    ];

    var CANVAS = {
        width: 1260,
        height: 240,
        safeZone: {
            top: 32,
            left: 34,
            right: 34,
            bottom: 28
        },
        gauge: {
            leftCenterX: 232,
            rightCenterX: 1028,
            centerY: 122,
            radius: 90,
            speedScaleMax: 360
        },
        regions: {
            header: { x: 0, y: 0, width: 1260, height: 32 },
            left: { x: 34, y: 32, width: 326, height: 180 },
            center: { x: 385, y: 32, width: 490, height: 180 },
            right: { x: 890, y: 32, width: 326, height: 180 },
            footer: { x: 34, y: 212, width: 1182, height: 28 },
            telltales: { x: 34, y: 212, width: 360, height: 28 }
        }
    };

    var DEFAULT_FRAME = {
        rpm: 0,
        maxRpm: 8000,
        redlineRpm: 7000,
        speed_kmh: 0,
        speed_mph: 0,
        gear: 0,
        throttle: 0,
        brake: 0
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
        return THEMES.indexOf(theme) >= 0 ? theme : 'normal';
    }

    function normalizeDriveMode(mode) {
        return DRIVE_MODES.indexOf(mode) >= 0 ? mode : 'normal';
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
        var rawDriveMode = firstDefined(readValue(payload, 'driveMode'), readValue(payload, 'drive_mode'));
        var rawMetric = firstDefined(readValue(payload, 'isMetric'), readValue(payload, 'metric'));
        var unit = readValue(payload, 'unit');

        var isMetric = rawMetric === undefined
            ? unit !== 'mph' && unit !== 'imperial'
            : rawMetric !== false;

        return {
            contractVersion: 's650-hmi/v1',
            theme: normalizeTheme(rawTheme),
            driveMode: normalizeDriveMode(rawDriveMode),
            matchDriveMode: readValue(payload, 'matchDriveMode') === true,
            isMetric: isMetric,
            elements: readElements(payload)
        };
    }

    function getPedalValue(source, key) {
        var direct = source[key];
        if (direct !== undefined && direct !== null && direct !== '') {
            return clamp(finiteNumber(direct, 0), 0, 1);
        }

        var rawKey = key === 'throttle' ? 'AccelInput' : 'BrakeInput';
        var rawValue = source[rawKey];
        if (rawValue !== undefined && rawValue !== null) {
            return clamp(finiteNumber(rawValue, 0) / 255, 0, 1);
        }

        var legacyKey = key === 'throttle' ? 'Accel' : 'Brake';
        return clamp(finiteNumber(source[legacyKey], 0) / 255, 0, 1);
    }

    function normalizeFrame(data, payload) {
        var source = isObject(data) ? data : {};
        var maxRpm = Math.max(1, finiteNumber(firstDefined(source.maxRpm, source.max_rpm, source.EngineMaxRpm), DEFAULT_FRAME.maxRpm));
        var rpm = Math.max(0, finiteNumber(firstDefined(source.rpm, source.CurrentEngineRpm), 0));
        var redline = clamp(
            finiteNumber(firstDefined(payload && payload.redlineRpm, source.redlineRpm), maxRpm - 1000),
            1,
            maxRpm
        );
        var speedKmh = firstDefined(source.speed_kmh, source.SpeedKmh);
        var speedMph = firstDefined(source.speed_mph, source.SpeedMph);
        var metersPerSecond = firstDefined(source.SpeedMetersPerSecond, source.speed_mps);

        if (speedKmh === undefined) speedKmh = metersPerSecond === undefined ? 0 : finiteNumber(metersPerSecond, 0) * 3.6;
        if (speedMph === undefined) speedMph = metersPerSecond === undefined ? 0 : finiteNumber(metersPerSecond, 0) * 2.23694;

        return Object.assign({}, DEFAULT_FRAME, source, {
            rpm: rpm,
            maxRpm: maxRpm,
            redlineRpm: redline,
            speed_kmh: Math.max(0, finiteNumber(speedKmh, 0)),
            speed_mph: Math.max(0, finiteNumber(speedMph, 0)),
            gear: firstDefined(source.gear, source.Gear, 0),
            throttle: getPedalValue(source, 'throttle'),
            brake: getPedalValue(source, 'brake')
        });
    }

    window.S650HmiContract = {
        version: 's650-hmi/v1',
        themes: Object.freeze(THEMES.slice()),
        driveModes: Object.freeze(DRIVE_MODES.slice()),
        canvas: CANVAS,
        defaultFrame: Object.freeze(Object.assign({}, DEFAULT_FRAME)),
        clamp: clamp,
        finiteNumber: finiteNumber,
        normalizeTheme: normalizeTheme,
        normalizeDriveMode: normalizeDriveMode,
        normalizeConfig: normalizeConfig,
        normalizeFrame: normalizeFrame
    };
})(window);
