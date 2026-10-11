/* Independent viewport anchors. Only resize/config boundaries consume this pure geometry. */
(function (root) {
    'use strict';
    function positive(value, fallback) { return Number.isFinite(value) && value > 0 ? value : fallback; }
    function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
    function box(cx, cy, radius) { return { x: cx - radius, y: cy - radius, width: radius * 2, height: radius * 2 }; }
    function layout(width, height, userScale, showCluster) {
        var w = positive(width, 1920), h = positive(height, 1080);
        var margin = Math.min(w / 10, h / 10, Math.max(24, h / 36));
        var screenMarginX = Math.max(10, Math.min(18, margin * 0.45));
        var clusterGap = Math.min(16, Math.max(8, w / 40));
        var heightFactor = clamp(h / 1080, .8, 1.5);
        var screenPerFactor = clamp(320 * h / 1080, 230, 380) / heightFactor;
        // Reserve the corner LCD, hug auxiliary dials closer to the main dials (160*scale, reach 214*scale)
        // and preserve a generous center safe gap (minOffsetBase 260*scale).
        var auxReach = 214;
        var minOffsetBase = 260;
        var maximum = Math.max(.001, Math.min((w / 2 - screenMarginX - clusterGap) / (screenPerFactor + auxReach + minOffsetBase), (h - 2 * margin) / 228));
        if (showCluster === false) maximum = Math.min((w - 2 * screenMarginX) / screenPerFactor, (h - 2 * margin) / (screenPerFactor * 152 / 270));
        var scale = Math.min(heightFactor * positive(userScale, 1), maximum);
        var radius = 114 * scale, smallRadius = 54 * scale, screenWidth = screenPerFactor * scale;
        var screenHeight = screenWidth * 152 / 270;
        var cx = w / 2, cy = h - margin - radius;
        var maxOffset = 320 * scale;
        var minOffset = minOffsetBase * scale;
        var availableOffset = w / 2 - screenMarginX - screenWidth - auxReach * scale - clusterGap;
        var offset = showCluster === false ? maxOffset : Math.min(maxOffset, Math.max(minOffset, availableOffset));
        return {
            width: w, height: h, scale: scale, margin: margin, screenMarginX: screenMarginX,
            tach: box(cx - offset, cy, radius), speed: box(cx + offset, cy, radius),
            temperature: box(cx - offset - 160 * scale, cy - 36 * scale, smallRadius),
            boost: box(cx + offset + 160 * scale, cy - 36 * scale, smallRadius),
            screen: { x: w - screenMarginX - screenWidth, y: h - margin - screenHeight, width: screenWidth, height: screenHeight },
            note: { x: cx, y: cy, scale: scale },
            status: { x: cx, y: Math.min(h - 14, h - margin + 13 * scale) }
        };
    }
    root.R34Layout = { layout: layout };
    if (typeof module !== 'undefined' && module.exports) module.exports = root.R34Layout;
})(typeof window !== 'undefined' ? window : globalThis);
