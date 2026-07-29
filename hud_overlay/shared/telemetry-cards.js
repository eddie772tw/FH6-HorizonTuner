// =============================================================================
// shared/telemetry-cards.js
// Shared Full-Screen Central Telemetry Cluster Renderer for All HUD Styles
// Backwards-compatible entry point re-exporting modularized components
// =============================================================================

import { TelemetryCardsManager, createTelemetryCardsManager } from './telemetry-cards/manager.js';
import { corners, getTempColor, fahrenheitToCelsius, celsiusToFahrenheit, radToDeg, clamp } from './telemetry-cards/utils.js';
import { getClusterHTML } from './telemetry-cards/template.js';
import { renderGRadar } from './telemetry-cards/g-radar.js';
import { renderCorners } from './telemetry-cards/corner-card.js';
import { renderPedalWave } from './telemetry-cards/pedal-wave.js';
import { renderPowerTorque } from './telemetry-cards/power-torque.js';

if (typeof window !== 'undefined') {
    window.TelemetryCardsManager = TelemetryCardsManager;
}

export {
    TelemetryCardsManager,
    createTelemetryCardsManager,
    corners,
    getTempColor,
    fahrenheitToCelsius,
    celsiusToFahrenheit,
    radToDeg,
    clamp,
    getClusterHTML,
    renderGRadar,
    renderCorners,
    renderPedalWave,
    renderPowerTorque
};
