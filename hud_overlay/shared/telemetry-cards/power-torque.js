// =============================================================================
// hud_overlay/shared/telemetry-cards/power-torque.js
// Power & Torque vs RPM 2D Scatter Plot Sub-Renderer Module
// =============================================================================

import { clamp } from './utils.js';

export function renderPowerTorque(data, powerTorqueHist, now) {
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

    var ptCanvas = document.getElementById('tcPowerTorqueChart');
    if (!ptCanvas || powerTorqueHist.length === 0) return;

    var ptCtx = ptCanvas.getContext('2d');
    if (!ptCtx) return;

    var pw = ptCanvas.width, ph = ptCanvas.height;
    ptCtx.clearRect(0, 0, pw, ph);

    // MAX text hidden per requirement
    /*
    ptCtx.save();
    ptCtx.fillStyle = '#ffffff';
    ptCtx.font = 'bold 12px monospace';
    ptCtx.textAlign = 'center';
    ptCtx.textBaseline = 'top';
    if (typeof ptCtx.fillText === 'function') {
        ptCtx.fillText('MAX: ' + combinedMax, pw / 2, 4);
    }
    ptCtx.restore();
    */

    var mRpm = data.maxRpm || 10000;

    // Draw Torque Trace (Yellow #ffeb3b)
    ptCtx.fillStyle = 'rgba(255, 235, 59, 0.65)';
    for (var k = 0; k < powerTorqueHist.length; k++) {
        var pt = powerTorqueHist[k];
        var tx = (pt.rpm / mRpm) * pw;
        var clampedTQ = clamp(pt.torque, 0, combinedMax);
        var ty = ph - (clampedTQ / combinedMax) * (ph - 4) - 2;
        ptCtx.fillRect(tx, ty, 2, 2);
    }

    // Draw Power Trace (Pink #ff0088)
    ptCtx.fillStyle = 'rgba(255, 0, 136, 0.65)';
    for (var k = 0; k < powerTorqueHist.length; k++) {
        var pt = powerTorqueHist[k];
        var px = (pt.rpm / mRpm) * pw;
        var clampedHP = clamp(pt.power, 0, combinedMax);
        var py = ph - (clampedHP / combinedMax) * (ph - 4) - 2;
        ptCtx.fillRect(px, py, 2, 2);
    }
}
