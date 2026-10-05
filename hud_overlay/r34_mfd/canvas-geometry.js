/* Pure backing-store policy; called only at layout/scale/DPR boundaries. */
(function (root) {
    'use strict';
    var MAX_DIMENSION = 2048;
    function positive(value, fallback) { return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback; }
    function geometry(width, height, scale, dpr) {
        width = positive(width, 0); height = positive(height, 0);
        if (!width || !height) return { drawable: false, width: 0, height: 0, pixelWidth: 0, pixelHeight: 0, xScale: 1, yScale: 1 };
        var density = Math.min(positive(scale, 1) * positive(dpr, 1), MAX_DIMENSION / width, MAX_DIMENSION / height);
        var pixelWidth = Math.max(1, Math.min(MAX_DIMENSION, Math.round(width * density)));
        var pixelHeight = Math.max(1, Math.min(MAX_DIMENSION, Math.round(height * density)));
        return { drawable: true, width: width, height: height, pixelWidth: pixelWidth, pixelHeight: pixelHeight,
            xScale: pixelWidth / width, yScale: pixelHeight / height };
    }
    root.R34CanvasGeometry = { geometry: geometry, MAX_DIMENSION: MAX_DIMENSION };
    if (typeof module !== 'undefined' && module.exports) module.exports = root.R34CanvasGeometry;
})(typeof window !== 'undefined' ? window : globalThis);
