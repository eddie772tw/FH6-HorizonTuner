/* Bounded display formatting only. Raw units, availability and timing stay in the model. */
(function (root) {
    'use strict';
    function number(value) {
        if (typeof value !== 'number' || !Number.isFinite(value)) return 'N/A';
        var rounded = value.toFixed(0);
        if (Math.abs(Number(rounded)) < 10000) return rounded;
        // Preserve sign and magnitude explicitly instead of clipping or clamping.
        var text = value.toExponential(1).replace('e+', 'e').replace('.0e', 'e');
        if (text.length > 6) text = value.toExponential(0).replace('e+', 'e');
        return text;
    }
    function reading(value, unit) { return number(value) + ' ' + unit; }
    function timer(seconds) {
        // Guard before the shared millisecond arithmetic can overflow or lose precision.
        if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds > Number.MAX_SAFE_INTEGER / 1000) return number(seconds) + ' s';
        var text = root.R34Model.timerTime(seconds);
        // Only astronomical positive durations need an explicit seconds form.
        return text.length <= 16 ? text : number(seconds) + ' s';
    }
    root.R34LcdFormat = { number: number, reading: reading, timer: timer };
})(typeof window !== 'undefined' ? window : globalThis);
