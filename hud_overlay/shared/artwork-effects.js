/* Opt-in effects for PNG-backed Canvas gauges. No timers or animation loop. */
(function (root) {
    'use strict';

    function create(element) {
        var x = 0, y = 0, blur = 0;
        var appliedX = 0, appliedY = 0, appliedBlur = 0;
        var enabled = true, disposed = false;
        var color = null, glowIntensity = 1;

        function reset() {
            x = y = blur = appliedX = appliedY = appliedBlur = 0;
            element.style.transform = 'none';
            element.style.filter = 'none';
        }

        function sync(elements) {
            if (disposed) return;
            elements = elements || root._currentHudElements || {};
            enabled = elements.showMotionEffect !== false && elements.showGauge !== false;
            color = root._currentUseDefaultColors === false && /^#[0-9a-f]{6}$/i.test(root._currentCustomColor || '')
                ? root._currentCustomColor : null;
            var glow = root._currentGlowIntensity;
            glowIntensity = typeof glow === 'number' && Number.isFinite(glow) ? Math.max(0, Math.min(2, glow)) : 1;
            if (!enabled) reset();
        }

        function update(data) {
            if (disposed || !enabled) return;
            // VFD motion contract: canonical m/s², deadzone, clamp, smoothing,
            // and a write threshold. Keep the fixed layout/zoom on the parent.
            var ax = typeof data.accel_x === 'number' && Number.isFinite(data.accel_x) ? data.accel_x : 0;
            var ay = typeof data.accel_y === 'number' && Number.isFinite(data.accel_y) ? data.accel_y : 0;
            var gx = Math.max(-2.5, Math.min(2.5, -ax / 9.81));
            var gy = Math.max(-2.5, Math.min(2.5, ay / 9.81));
            if (Math.abs(gx) < 0.1) gx = 0;
            if (Math.abs(gy) < 0.1) gy = 0;
            var magnitude = Math.sqrt(gx * gx + gy * gy);
            // Compact artwork has small baked labels: keep VFD dynamics but cap
            // blur at 0.75 logical px instead of the larger VFD panel's 3.5 px.
            var targetBlur = magnitude > 0.8 ? Math.min(0.75, (magnitude - 0.8) * 2) : 0;
            x += (gx * 12 - x) * 0.2;
            y += (gy * 12 - y) * 0.2;
            blur += (targetBlur - blur) * 0.2;
            if (Math.abs(x - appliedX) > 0.05 || Math.abs(y - appliedY) > 0.05) {
                element.style.transform = 'translate3d(' + x.toFixed(2) + 'px, ' + y.toFixed(2) + 'px, 0px)';
                appliedX = x; appliedY = y;
            }
            if (Math.abs(blur - appliedBlur) > 0.05) {
                element.style.filter = blur > 0.1 ? 'blur(' + blur.toFixed(2) + 'px)' : 'none';
                appliedBlur = blur;
            }
        }

        sync();
        return {
            sync: sync,
            update: update,
            reset: reset,
            accent: function (fallback) { return color || fallback; },
            glow: function (radius) { return radius * glowIntensity; },
            destroy: function () { disposed = true; reset(); }
        };
    }

    root.HUDArtworkEffects = { create: create };
})(globalThis);
