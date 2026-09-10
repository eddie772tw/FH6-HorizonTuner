(function (root) {
    'use strict';
    // Fictional Initial D / TRD dial: deliberately compressed 0–3000 rpm.
    // This is NOT the linear calibration of the real ULTRA Clubman No.1932.
    var MAX_RPM = 11000;
    function getAngle(rpm) {
        var value = Number(rpm);
        if (!Number.isFinite(value)) value = 0;
        var bounded = Math.max(0, Math.min(MAX_RPM, value));
        var ratio;
        if (bounded <= 3000) ratio = bounded / 3000 * 0.18;
        else if (bounded <= 7000) ratio = 0.18 + (bounded - 3000) / 4000 * 0.38;
        else ratio = 0.56 + (bounded - 7000) / 4000 * 0.44;
        return (140 + ratio * 260) * Math.PI / 180;
    }
    function getWarningLevel(rpm, redline) {
        if (rpm >= Math.min(10500, redline * 0.99)) return 2;
        if (rpm >= Math.min(9800, redline * 0.96)) return 1;
        return 0;
    }
    root.InitialDTachModel = { getAngle: getAngle, getWarningLevel: getWarningLevel, maxRpm: MAX_RPM };
})(typeof window !== 'undefined' ? window : globalThis);
