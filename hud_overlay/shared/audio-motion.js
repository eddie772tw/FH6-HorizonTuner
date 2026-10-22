/* Time-domain audio display primitives. No frame-count assumptions or timers. */
(function (root) {
    'use strict';
    root.HUDAudioMotion = {
        phase: function (elapsedSeconds, radiansPerSecond) {
            return Math.max(0, elapsedSeconds) * radiansPerSecond;
        },
        peak: function (previous, value, elapsedSeconds, fallPerSecond) {
            return Math.max(value, previous - Math.max(0, elapsedSeconds) * fallPerSecond);
        },
        follow: function (previous, target, elapsedSeconds, timeConstant) {
            return target + (previous - target) * Math.exp(-Math.max(0, elapsedSeconds) / timeConstant);
        }
    };
})(globalThis);
