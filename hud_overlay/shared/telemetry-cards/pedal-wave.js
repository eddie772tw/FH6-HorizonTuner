// =============================================================================
// hud_overlay/shared/telemetry-cards/pedal-wave.js
// Throttle & Brake 5-Second Waveform Trace Sub-Renderer Module
// =============================================================================

import { clamp, getCanvasContext } from './utils.js';

function drawTraceChannel(pCtx, pedalHist, len, field, padX, stepX, bottomY, drawH, dpr, color, shadowColor) {
    var lastX = padX;
    var lastY = bottomY;

    pCtx.beginPath();
    for (var k = 0; k < len; k++) {
        var logicalIdx = (pedalHist._offset + k) % len;
        var px = padX + k * stepX;
        var py = bottomY - (pedalHist[logicalIdx][field] * drawH);
        if (k === 0) pCtx.moveTo(px, py);
        else         pCtx.lineTo(px, py);
        lastX = px;
        lastY = py;
    }
    pCtx.lineWidth = 2.5 * dpr;
    pCtx.strokeStyle = color;
    pCtx.shadowColor = shadowColor;
    pCtx.shadowBlur = 6 * dpr;
    if (len > 1) pCtx.stroke();

    // Coaxial Leading Active Pulse Marker (Outer Halo Ring + Core Dot)
    pCtx.lineWidth = 1.6 * dpr;
    pCtx.shadowBlur = 7 * dpr;
    pCtx.beginPath();
    pCtx.arc(lastX, lastY, 4.2 * dpr, 0, Math.PI * 2);
    pCtx.stroke();

    pCtx.fillStyle = color;
    pCtx.shadowBlur = 0;
    pCtx.beginPath();
    pCtx.arc(lastX, lastY, 2.0 * dpr, 0, Math.PI * 2);
    pCtx.fill();
}

export function renderPedalWave(data, pedalHist, now, domCache) {
    var rawThrottle = Number(data && data.throttle);
    var rawBrake    = Number(data && data.brake);
    var throttle = clamp(Number.isFinite(rawThrottle) ? rawThrottle : 0, 0, 1);
    var brake    = clamp(Number.isFinite(rawBrake) ? rawBrake : 0, 0, 1);

    pedalHist._offset = pedalHist._offset || 0;
    if (pedalHist.length < 300) {
        pedalHist.push({ throttle: throttle, brake: brake, time: now });
    } else {
        var oldP = pedalHist[pedalHist._offset];
        if (oldP) { oldP.throttle = throttle; oldP.brake = brake; oldP.time = now; }
        pedalHist._offset = (pedalHist._offset + 1) % 300;
    }

    var pCanvas = domCache ? domCache.pedalWaveCanvas : document.getElementById('tcPedalWave');
    if (!pCanvas) return;

    var cData = getCanvasContext(pCanvas);
    if (!cData || !cData.ctx || pedalHist.length === 0) return;

    var pCtx = cData.ctx;
    var pw = cData.w, ph = cData.h, dpr = cData.dpr;
    pCtx.clearRect(0, 0, pw, ph);

    var len = pedalHist.length;
    var padX = Math.min(5.5 * dpr, pw * 0.1);
    var padY = Math.min(5.5 * dpr, ph * 0.15);
    var plotW = Math.max(1, pw - 2 * padX);
    var drawH = Math.max(1, ph - 2 * padY);
    var bottomY = ph - padY;
    var stepX = plotW / (300 - 1);

    pCtx.save();
    try {
        // 25% & 75% Subtle Guidelines (batched) + 50% Center Guideline
        pCtx.lineWidth = 1 * dpr;
        pCtx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        pCtx.beginPath();
        pCtx.moveTo(0, bottomY - drawH * 0.25);
        pCtx.lineTo(pw, bottomY - drawH * 0.25);
        pCtx.moveTo(0, bottomY - drawH * 0.75);
        pCtx.lineTo(pw, bottomY - drawH * 0.75);
        pCtx.stroke();

        pCtx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        pCtx.beginPath();
        pCtx.moveTo(0, bottomY - drawH * 0.5);
        pCtx.lineTo(pw, bottomY - drawH * 0.5);
        pCtx.stroke();

        pCtx.lineCap = 'round';
        pCtx.lineJoin = 'round';

        // Throttle Trace (Green #00ff66) & Brake Trace (Red #ff0055) - Latest data on right
        drawTraceChannel(pCtx, pedalHist, len, 'throttle', padX, stepX, bottomY, drawH, dpr, '#00ff66', 'rgba(0, 255, 102, 0.65)');
        drawTraceChannel(pCtx, pedalHist, len, 'brake',    padX, stepX, bottomY, drawH, dpr, '#ff0055', 'rgba(255, 0, 85, 0.65)');
    } finally {
        pCtx.restore();
    }
}

