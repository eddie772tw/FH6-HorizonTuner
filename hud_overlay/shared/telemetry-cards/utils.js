// =============================================================================
// hud_overlay/shared/telemetry-cards/utils.js
// Pure math calculation and helper functions for Telemetry Cards Cluster
// =============================================================================

export const corners = ['FL', 'FR', 'RL', 'RR'];

// Tire temperature thresholds (°F) — 75°C (167°F) to 105°C (221°F) normal operating range
export const TEMP_COLD_F      = 167;   // < 167°F (75°C) → blue  (#0088ff)
export const TEMP_HOT_F       = 221;   // > 221°F (105°C) → red   (#ff0000)
export const TEMP_NORMAL_MIN_F = 167;  // 75°C → normal range lower bound
export const TEMP_NORMAL_MAX_F = 221;  // 105°C → normal range upper bound

// In °C (for histogram background band rendering)
export const TEMP_NORMAL_MIN_C = 75;
export const TEMP_NORMAL_MAX_C = 105;

// Tire temperature histogram range (°F raw UDP scale)
export const TEMP_HIST_MIN_F = 100;  // display min of histogram
export const TEMP_HIST_MAX_F = 260;  // display max of histogram

/** Returns a colour hex string for a raw °F tire temperature. */
export function getTempColor(tempF) {
    if (tempF < TEMP_COLD_F) return '#0088ff';
    if (tempF > TEMP_HOT_F)  return '#ff0000';
    return '#00ff00';
}

/** Converts raw °F to °C. */
export function fahrenheitToCelsius(tempF) {
    return (tempF - 32) * 5 / 9;
}

/** Converts °C to °F. */
export function celsiusToFahrenheit(tempC) {
    return (tempC * 9 / 5) + 32;
}

/** Converts radians to degrees. */
export function radToDeg(rad) {
    return rad * (180 / Math.PI);
}

/** Clamps a value between min and max. */
export function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

/**
 * Computes an approximate complementary/contrast colour for a given hex primary colour.
 * Used for auto-updating the contrast colour when the user changes the primary card colour.
 * Strategy: rotate hue by 180° in HSL space, keep saturation, slightly adjust lightness.
 * @param {string} hexColor - e.g. '#00f0ff'
 * @returns {string} hex contrast colour
 */
export function computeContrastColor(hexColor) {
    // Parse hex → r,g,b
    var r = parseInt(hexColor.slice(1, 3), 16) / 255;
    var g = parseInt(hexColor.slice(3, 5), 16) / 255;
    var b = parseInt(hexColor.slice(5, 7), 16) / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h, s, l = (max + min) / 2;
    if (max === min) {
        h = s = 0;
    } else {
        var d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d + 2) / 6; break;
            default: h = ((r - g) / d + 4) / 6; break;
        }
    }
    // Rotate hue 180°
    h = (h + 0.5) % 1;
    // Ensure adequate lightness so it's visible on dark background
    l = Math.max(0.45, Math.min(0.75, l));
    s = Math.max(0.7, s);
    // HSL → RGB
    var hue2rgb = function (p, q, t) {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
    };
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    var rr = Math.round(hue2rgb(p, q, h + 1/3) * 255);
    var gg = Math.round(hue2rgb(p, q, h) * 255);
    var bb = Math.round(hue2rgb(p, q, h - 1/3) * 255);
    return '#' + ((1 << 24) | (rr << 16) | (gg << 8) | bb).toString(16).slice(1);
}
