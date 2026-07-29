// =============================================================================
// hud_overlay/shared/telemetry-cards/utils.js
// Pure math calculation and helper functions for Telemetry Cards Cluster
// =============================================================================

export const corners = ['FL', 'FR', 'RL', 'RR'];

export function getTempColor(tempF) {
    if (tempF < 150) return '#0088ff';
    if (tempF > 210) return '#ff0000';
    return '#00ff00';
}

export function fahrenheitToCelsius(tempF) {
    return (tempF - 32) * 5 / 9;
}

export function celsiusToFahrenheit(tempC) {
    return (tempC * 9 / 5) + 32;
}

export function radToDeg(rad) {
    return rad * (180 / Math.PI);
}

export function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}
