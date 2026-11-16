// =============================================================================
// hud_overlay/shared/telemetry-cards/power-torque.js
// Power & Torque vs RPM 2D Scatter Plot Sub-Renderer Module
// =============================================================================

import { clamp, getCanvasContext } from './utils.js';

function resolvePrimaryColor(domCache) {
    var wrapperEl = domCache ? domCache.wrapper : (typeof document !== 'undefined' ? document.getElementById('tcClusterWrapper') : null);
    if (wrapperEl && wrapperEl._cachedContrastColor === undefined) {
        var cssVal = wrapperEl.style && typeof wrapperEl.style.getPropertyValue === 'function' ? wrapperEl.style.getPropertyValue('--card-contrast') : '';
        wrapperEl._cachedContrastColor = cssVal && cssVal.trim() ? cssVal.trim() : null;
    }
    return (wrapperEl && wrapperEl._cachedContrastColor) || '#ff0088';
}

function drawReferenceGrid(ctx, padX, padY, plotW, plotH, dpr) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    for (var i = 1; i <= 3; i++) {
        var frac = i * 0.25;
        ctx.moveTo(padX, padY + plotH * frac); ctx.lineTo(padX + plotW, padY + plotH * frac);
        ctx.moveTo(padX + plotW * frac, padY); ctx.lineTo(padX + plotW * frac, padY + plotH);
    }
    ctx.stroke();
}

function drawScatterChannel(ctx, hist, field, mRpm, combinedMax, padX, padY, plotW, plotH, dpr, color) {
    var dotSize = 2.2 * dpr, halfDot = dotSize * 0.5;
    ctx.fillStyle = color;
    for (var k = 0; k < hist.length; k++) {
        var pt = hist[k];
        var px = padX + clamp(pt.rpm / mRpm, 0, 1) * plotW;
        var py = padY + plotH - (clamp(pt[field], 0, combinedMax) / combinedMax) * plotH;
        ctx.fillRect(px - halfDot, py - halfDot, dotSize, dotSize);
    }
}

function drawLeadingPulse(ctx, x, y, color, dpr) {
    ctx.strokeStyle = color; ctx.fillStyle = color;
    ctx.shadowColor = color; ctx.shadowBlur = 6 * dpr; ctx.lineWidth = 1.6 * dpr;
    ctx.beginPath(); ctx.arc(x, y, 4.4 * dpr, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 2.0 * dpr, 0, Math.PI * 2); ctx.fill();
}

export function renderPowerTorque(data, powerTorqueHist, now, domCache) {
    var rawMaxHP = data && data.sessionMaxima ? data.sessionMaxima.maxHP : 100;
    var rawMaxTQ = data && data.sessionMaxima ? data.sessionMaxima.maxTQ : 100;
    var maxHP = Number.isFinite(rawMaxHP) && rawMaxHP > 0 ? rawMaxHP : 100;
    var maxTQ = Number.isFinite(rawMaxTQ) && rawMaxTQ > 0 ? rawMaxTQ : 100;
    var combinedMax = Math.max(Math.max(100, Math.ceil(maxHP / 100) * 100), Math.max(100, Math.ceil(maxTQ / 100) * 100));

    var currentRPM = data && Number.isFinite(data.rpm) ? Math.max(0, data.rpm) : 0;
    var currentPwr = data && Number.isFinite(data.power) ? Math.max(0, data.power) : 0;
    var currentTq  = data && Number.isFinite(data.torque) ? Math.max(0, data.torque) : 0;

    powerTorqueHist._offset = powerTorqueHist._offset || 0;
    if (powerTorqueHist.length < 300) {
        powerTorqueHist.push({ rpm: currentRPM, power: currentPwr, torque: currentTq, time: now });
    } else {
        var oldPT = powerTorqueHist[powerTorqueHist._offset];
        if (oldPT) {
            oldPT.rpm = currentRPM;
            oldPT.power = currentPwr;
            oldPT.torque = currentTq;
            oldPT.time = now;
        }
        powerTorqueHist._offset = (powerTorqueHist._offset + 1) % 300;
    }

    var ptCanvas = domCache ? domCache.ptCanvas : (typeof document !== 'undefined' ? document.getElementById('tcPowerTorqueChart') : null);
    if (!ptCanvas || powerTorqueHist.length === 0) return;

    var cData = getCanvasContext(ptCanvas);
    if (!cData || !cData.ctx) return;

    var ptCtx = cData.ctx, pw = cData.w, ph = cData.h, dpr = cData.dpr;
    ptCtx.clearRect(0, 0, pw, ph);

    var mRpm = data && Number.isFinite(data.maxRpm) && data.maxRpm > 0 ? data.maxRpm : 10000;
    var padX = Math.min(pw * 0.12, 6 * dpr), padY = Math.min(ph * 0.12, 6 * dpr);
    var plotW = Math.max(1, pw - 2 * padX), plotH = Math.max(1, ph - 2 * padY);
    var primaryColor = resolvePrimaryColor(domCache);

    ptCtx.save();
    try {
        drawReferenceGrid(ptCtx, padX, padY, plotW, plotH, dpr);
        ptCtx.globalAlpha = 0.75;
        drawScatterChannel(ptCtx, powerTorqueHist, 'torque', mRpm, combinedMax, padX, padY, plotW, plotH, dpr, '#ffeb3b');
        drawScatterChannel(ptCtx, powerTorqueHist, 'power', mRpm, combinedMax, padX, padY, plotW, plotH, dpr, primaryColor);
        ptCtx.globalAlpha = 1;
        var activeX = padX + clamp(currentRPM / mRpm, 0, 1) * plotW;
        drawLeadingPulse(ptCtx, activeX, padY + plotH - (clamp(currentTq, 0, combinedMax) / combinedMax) * plotH, '#ffeb3b', dpr);
        drawLeadingPulse(ptCtx, activeX, padY + plotH - (clamp(currentPwr, 0, combinedMax) / combinedMax) * plotH, primaryColor, dpr);
    } finally {
        ptCtx.restore();
    }
}
