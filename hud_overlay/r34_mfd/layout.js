/* Independent viewport anchors. Only resize/config boundaries consume this pure geometry. */
(function (root) {
    'use strict';
    function positive(value, fallback) { return Number.isFinite(value) && value > 0 ? value : fallback; }
    function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
    function box(cx, cy, radius) { return { x: cx - radius, y: cy - radius, width: radius * 2, height: radius * 2 }; }
    function layout(width, height, userScale, showCluster) {
        var w = positive(width, 1920), h = positive(height, 1080);
        var margin = Math.min(w / 10, h / 10, Math.max(24, h / 36));
        var gap = Math.min(24, w / 20);
        var heightFactor = clamp(h / 1080, .8, 1.2);
        var screenPerFactor = clamp(320 * h / 1080, 230, 380) / heightFactor;
        // Reserve the corner LCD, outside auxiliary and a readable center gap
        // before fitting enlarged user scales. This prevents negative offsets.
        var maximum = Math.max(.001, Math.min((w / 2 - margin - gap) / (screenPerFactor + 408), (h - 2 * margin) / 228));
        if (showCluster === false) maximum = Math.min((w - 2 * margin) / screenPerFactor, (h - 2 * margin) / (screenPerFactor * 152 / 270));
        var scale = Math.min(heightFactor * positive(userScale, 1), maximum);
        var radius = 114 * scale, smallRadius = 54 * scale, screenWidth = screenPerFactor * scale;
        var screenHeight = screenWidth * 152 / 270;
        var cx = w / 2, cy = h - margin - radius;
        var offset = showCluster === false ? 320 * scale : Math.min(320 * scale, w / 2 - margin - screenWidth - 244 * scale - gap);
        return {
            width: w, height: h, scale: scale, margin: margin,
            tach: box(cx - offset, cy, radius), speed: box(cx + offset, cy, radius),
            boost: box(cx - offset - 190 * scale, cy - 36 * scale, smallRadius),
            temperature: box(cx + offset + 190 * scale, cy - 36 * scale, smallRadius),
            screen: { x: w - margin - screenWidth, y: h - margin - screenHeight, width: screenWidth, height: screenHeight },
            readouts: { x: cx, y: cy, scale: scale },
            status: { x: cx, y: Math.min(h - 14, h - margin + 13 * scale) }
        };
    }
    root.R34Layout = { layout: layout };
    if (typeof module !== 'undefined' && module.exports) module.exports = root.R34Layout;
})(typeof window !== 'undefined' ? window : globalThis);
