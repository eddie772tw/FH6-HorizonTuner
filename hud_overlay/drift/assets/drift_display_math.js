/*
 * Drift HUD display math.
 *
 * The Forza packet exposes normalized steering input, not the physical front
 * wheel angle. This module maps it onto the Drift HUD's ±45 degree steering
 * indicator range so the counter-steer pointer is an honest visual indicator
 * rather than a falsely precise wheel-angle readout.
 */
(function (window) {
    'use strict';

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function normalizeSteerPercent(rawSteer) {
        var raw = Number(rawSteer) || 0;
        var percent = Math.abs(raw) <= 1 ? raw * 100 : raw / 1.27;
        return clamp(percent, -100, 100);
    }

    function getCounterState(driftAngle, steerPercent) {
        var angle = Number(driftAngle) || 0;
        var steer = clamp(Number(steerPercent) || 0, -100, 100);
        var absAngle = Math.abs(angle);
        var isCountering = absAngle >= 8 && angle * steer > 0;
        var controlWeight = 0.45 + 0.55 * clamp((absAngle - 8) / 42, 0, 1);

        return {
            isCountering: isCountering,
            percent: isCountering ? Math.abs(steer) * controlWeight : 0,
            // The drift-angle scale remains ±60 degrees, but the steering
            // indicator itself is bounded to the ±45 degree ticks: 100%
            // normalized steer maps exactly to 45 degrees.
            arcAngle: clamp(steer * 0.45, -45, 45)
        };
    }

    function resolveTorque(data, isMetric) {
        var source = data || {};
        function readFinite(value) {
            // Null and empty strings are missing payload values, not valid zero torque.
            if (value === null || value === undefined || value === '') return NaN;
            var number = Number(value);
            return Number.isFinite(number) ? number : NaN;
        }

        var torque = readFinite(source.torque);
        if (!Number.isFinite(torque)) torque = isMetric ? readFinite(source.torque_nm) : readFinite(source.torque_ftlbs);
        if (!Number.isFinite(torque)) torque = 0;

        return {
            value: Math.round(torque),
            unit: typeof source.torque_unit === 'string' ? source.torque_unit.toUpperCase() : (isMetric ? 'N·M' : 'LB·FT')
        };
    }

    window.DriftDisplayMath = {
        normalizeSteerPercent: normalizeSteerPercent,
        getCounterState: getCounterState,
        resolveTorque: resolveTorque
    };
})(window);
