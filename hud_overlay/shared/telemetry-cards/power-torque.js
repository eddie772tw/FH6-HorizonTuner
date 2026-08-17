// =============================================================================
// hud_overlay/shared/telemetry-cards/power-torque.js
// Power & Torque vs RPM 2D Scatter Plot Sub-Renderer Module
// =============================================================================

import { clamp, getCanvasContext } from './utils.js';

export function renderPowerTorque(data, powerTorqueHist, now, domCache) {
    var maxHP = data.sessionMaxima ? (data.sessionMaxima.maxHP || 100) : 100;
    var maxTQ = data.sessionMaxima ? (data.sessionMaxima.maxTQ || 100) : 100;
    var ceilHP = Math.max(100, Math.ceil(maxHP / 100) * 100);
    var ceilTQ = Math.max(100, Math.ceil(maxTQ / 100) * 100);
    var combinedMax = Math.max(ceilHP, ceilTQ);

    var currentRPM = data.rpm    || 0;
    var currentPwr = data.power  || 0;
    var currentTq  = data.torque || 0;

    if (powerTorqueHist.length < 300) {
        powerTorqueHist.push({ rpm: currentRPM, power: currentPwr, torque: currentTq, time: now });
    } else {
        var oldPT = powerTorqueHist.shift();
        if (oldPT) {
            oldPT.rpm    = currentRPM;
            oldPT.power  = currentPwr;
            oldPT.torque = currentTq;
            oldPT.time   = now;
            powerTorqueHist.push(oldPT);
        }
    }

    var ptCanvas = domCache ? domCache.ptCanvas : document.getElementById('tcPowerTorqueChart');
    if (!ptCanvas || powerTorqueHist.length === 0) return;

    var cData = getCanvasContext(ptCanvas);
    if (!cData || !cData.ctx) return;

    var ptCtx = cData.ctx;
    var pw = cData.w, ph = cData.h, dpr = cData.dpr;
    ptCtx.clearRect(0, 0, pw, ph);

    var mRpm = data.maxRpm || 10000;
    var dotSize = 2 * dpr;

    // Draw Torque Trace (Yellow / Contrast Theme Color)
    ptCtx.fillStyle = 'rgba(255, 235, 59, 0.75)';
    for (var k = 0; k < powerTorqueHist.length; k++) {
        var pt = powerTorqueHist[k];
        var tx = (pt.rpm / mRpm) * pw;
        var clampedTQ = clamp(pt.torque, 0, combinedMax);
        var ty = ph - (clampedTQ / combinedMax) * (ph - 4 * dpr) - 2 * dpr;
        ptCtx.fillRect(tx, ty, dotSize, dotSize);
    }

    // Draw Power Trace (Primary Theme Color)
    var wrapperEl = domCache ? domCache.wrapper : document.getElementById('tcClusterWrapper');
    var primaryColor = 'rgba(255, 0, 136, 0.75)';
    if (wrapperEl && typeof wrapperEl.style !== 'undefined' && typeof wrapperEl.style.getPropertyValue === 'function') {
        var cssVal = wrapperEl.style.getPropertyValue('--card-contrast');
        if (cssVal && cssVal.trim()) primaryColor = cssVal.trim();
    }
    ptCtx.fillStyle = primaryColor;
    for (var k = 0; k < powerTorqueHist.length; k++) {
        var pt = powerTorqueHist[k];
        var px = (pt.rpm / mRpm) * pw;
        var clampedHP = clamp(pt.power, 0, combinedMax);
        var py = ph - (clampedHP / combinedMax) * (ph - 4 * dpr) - 2 * dpr;
        ptCtx.fillRect(px, py, dotSize, dotSize);
    }
}

