// =============================================================================
// hud_overlay/shared/telemetry-cards/pedal-wave.js
// Throttle & Brake 5-Second Waveform Trace Sub-Renderer Module
// =============================================================================

import { clamp, getCanvasContext } from './utils.js';

export function renderPedalWave(data, pedalHist, now, domCache) {
    var throttle = clamp(data.throttle !== undefined ? data.throttle : 0, 0, 1);
    var brake    = clamp(data.brake    !== undefined ? data.brake    : 0, 0, 1);

    if (pedalHist.length < 300) {
        pedalHist.push({ throttle: throttle, brake: brake, time: now });
    } else {
        var oldP = pedalHist.shift();
        if (oldP) { oldP.throttle = throttle; oldP.brake = brake; oldP.time = now; pedalHist.push(oldP); }
    }

    var pCanvas = domCache ? domCache.pedalWaveCanvas : document.getElementById('tcPedalWave');
    if (!pCanvas) return;

    var cData = getCanvasContext(pCanvas);
    if (!cData || !cData.ctx || pedalHist.length === 0) return;

    var pCtx = cData.ctx;
    var pw = cData.w, ph = cData.h, dpr = cData.dpr;
    pCtx.clearRect(0, 0, pw, ph);

    // 50% Guideline
    pCtx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    pCtx.lineWidth = 1 * dpr;
    pCtx.beginPath();
    pCtx.moveTo(0, ph * 0.5);
    pCtx.lineTo(pw, ph * 0.5);
    pCtx.stroke();

    var len = pedalHist.length;
    var stepX = pw / (300 - 1);
    var padY = 3 * dpr;
    var drawH = ph - 2 * padY;

    // Throttle Trace (Green #00ff66) - Latest data on right
    pCtx.beginPath();
    for (var k = 0; k < len; k++) {
        var px = k * stepX;
        var py = ph - (pedalHist[k].throttle * drawH) - padY;
        if (k === 0) pCtx.moveTo(px, py);
        else         pCtx.lineTo(px, py);
    }
    pCtx.lineWidth = 2.5 * dpr;
    pCtx.strokeStyle = '#00ff66';
    pCtx.shadowColor = 'rgba(0, 255, 102, 0.6)';
    pCtx.shadowBlur = 6 * dpr;
    pCtx.stroke();
    pCtx.shadowBlur = 0;

    // Brake Trace (Red #ff0055) - Latest data on right
    pCtx.beginPath();
    for (var k = 0; k < len; k++) {
        var px = k * stepX;
        var py = ph - (pedalHist[k].brake * drawH) - padY;
        if (k === 0) pCtx.moveTo(px, py);
        else         pCtx.lineTo(px, py);
    }
    pCtx.lineWidth = 2.5 * dpr;
    pCtx.strokeStyle = '#ff0055';
    pCtx.shadowColor = 'rgba(255, 0, 85, 0.6)';
    pCtx.shadowBlur = 6 * dpr;
    pCtx.stroke();
    pCtx.shadowBlur = 0;
}

