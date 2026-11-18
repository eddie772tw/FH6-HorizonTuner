// =============================================================================
// hud_overlay/shared/telemetry-cards/corner-card.js
// 4-Corner (FL, FR, RL, RR) Suspension, Slip Radar & Tire Temp Sub-Renderer
// =============================================================================

import {
    corners,
    getTempColor,
    fahrenheitToCelsius,
    radToDeg,
    clamp,
    getCanvasContext,
    TEMP_HIST_MIN_F,
    TEMP_HIST_MAX_F,
    TEMP_COLD_F,
    TEMP_HOT_F,
} from './utils.js';

// Performance optimization: Pre-allocate a shared array to eliminate
// per-frame and per-wheel garbage collection (GC) heap allocations inside the 60Hz render loop.
var _sharedBins = [];
var _slipRatios = [0, 0, 0, 0];
var _slipAngles = [0, 0, 0, 0];
var _temps = [0, 0, 0, 0];
var _travels = [0, 0, 0, 0];

function resolvePrimaryColor(domCache) {
    var wrapperEl = domCache ? domCache.wrapper : (typeof document !== 'undefined' ? document.getElementById('tcClusterWrapper') : null);
    if (wrapperEl && wrapperEl._cachedPrimaryColor === undefined) {
        var cssVal = wrapperEl.style && typeof wrapperEl.style.getPropertyValue === 'function' ? wrapperEl.style.getPropertyValue('--card-primary') : '';
        wrapperEl._cachedPrimaryColor = (cssVal && cssVal.trim()) ? cssVal.trim() : null;
    }
    return (wrapperEl && wrapperEl._cachedPrimaryColor) || '#00f0ff';
}

function drawSuspWaveform(wCtx, ww, wh, dpr, sHist, cTravel, primaryColor) {
    var padX = Math.min(ww * 0.1, 4.5 * dpr);
    var padY = Math.min(wh * 0.12, 4.5 * dpr);
    // Scale the complete marker to the available inset on compact HUDs.
    var markerScale = Math.min(dpr, padX / 4.5, padY / 4.5);
    var plotW = Math.max(1, ww - 2 * padX);
    var drawH = Math.max(1, wh - 2 * padY);
    var bottomY = wh - padY;
    var stepX = plotW / (150 - 1);
    var bandH = padY + drawH * 0.05;
    var len = sHist.length;
    var lastX = padX;
    var lastY = bottomY - cTravel * drawH;

    wCtx.save();
    try {
        // 5% top-out / bottoming-out danger bands & 50% ride-height centerline
        wCtx.fillStyle = 'rgba(255, 0, 60, 0.18)';
        wCtx.fillRect(0, 0, ww, bandH);
        wCtx.fillRect(0, wh - bandH, ww, bandH);

        wCtx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        wCtx.lineWidth = 1 * dpr;
        wCtx.beginPath();
        wCtx.moveTo(0, bottomY - drawH * 0.5);
        wCtx.lineTo(ww, bottomY - drawH * 0.5);
        wCtx.stroke();

        wCtx.lineCap = 'round';
        wCtx.lineJoin = 'round';
        wCtx.beginPath();
        for (var j = 0; j < len; j++) {
            var logicalIdx = (sHist._offset + j) % len;
            var wx = padX + j * stepX;
            var wy = bottomY - (sHist[logicalIdx].travel * drawH);
            if (j === 0) wCtx.moveTo(wx, wy);
            else         wCtx.lineTo(wx, wy);
            lastX = wx;
            lastY = wy;
        }
        wCtx.strokeStyle = primaryColor;
        wCtx.lineWidth = 1.6 * dpr;
        wCtx.shadowColor = primaryColor;
        wCtx.shadowBlur = 4 * dpr;
        if (len > 1) wCtx.stroke();

        // Coaxial Leading Active Pulse Marker (Outer Halo Ring + Core Dot)
        var pulseColor = (cTravel <= 0.05 || cTravel >= 0.95) ? '#ff0055' : primaryColor;
        wCtx.strokeStyle = pulseColor;
        wCtx.fillStyle = pulseColor;
        wCtx.shadowColor = pulseColor;
        wCtx.shadowBlur = 5 * markerScale;
        wCtx.lineWidth = 1.4 * markerScale;
        wCtx.beginPath();
        wCtx.arc(lastX, lastY, 3.6 * markerScale, 0, Math.PI * 2);
        wCtx.stroke();

        wCtx.shadowBlur = 0;
        wCtx.beginPath();
        wCtx.arc(lastX, lastY, 1.8 * markerScale, 0, Math.PI * 2);
        wCtx.fill();
    } finally {
        wCtx.restore();
    }
}

function drawSlipRadar(rCtx, rw, rh, dpr, cAngle, cRatio, primaryColor) {
    var rx0 = rw / 2;
    var ry0 = rh / 2;
    var rRad = Math.max(1, Math.min(rw, rh) * 0.44);
    // Scale the coaxial grip marker cleanly to fit inside compact radar bounds.
    var markerScale = Math.min(dpr, rRad / 9);
    var haloRadius = 3.6 * markerScale;
    var coreRadius = 1.8 * markerScale;
    var haloLineW = 1.4 * markerScale;
    var maxTRadius = Math.max(0, rRad - haloRadius - haloLineW * 0.5);
    var dx = cAngle * rRad;
    var dy = cRatio * rRad;
    var tDistSq = dx * dx + dy * dy;
    if (tDistSq > maxTRadius * maxTRadius && tDistSq > 0) {
        var clampScale = maxTRadius / Math.sqrt(tDistSq);
        dx *= clampScale;
        dy *= clampScale;
    }
    var isLosingGrip = (cAngle * cAngle + cRatio * cRatio) > 1.0;
    var pulseColor = isLosingGrip ? '#ff0055' : primaryColor;
    var px = rx0 + dx;
    var py = ry0 + dy;

    rCtx.save();
    try {
        // Outer 1.0G traction limit ring
        rCtx.beginPath();
        rCtx.arc(rx0, ry0, rRad, 0, Math.PI * 2);
        rCtx.strokeStyle = isLosingGrip ? 'rgba(255, 0, 85, 0.45)' : 'rgba(255, 255, 255, 0.30)';
        rCtx.lineWidth = Math.min(1.5 * dpr, rRad * 0.25);
        rCtx.stroke();

        // 50% traction reference ring + crosshairs (batched single path)
        rCtx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        rCtx.lineWidth = Math.min(1 * dpr, rRad * 0.16);
        rCtx.beginPath();
        rCtx.arc(rx0, ry0, rRad * 0.5, 0, Math.PI * 2);
        rCtx.moveTo(rx0, ry0 - rRad);
        rCtx.lineTo(rx0, ry0 + rRad);
        rCtx.moveTo(rx0 - rRad, ry0);
        rCtx.lineTo(rx0 + rRad, ry0);
        rCtx.stroke();

        // Coaxial Active Grip Pulse Marker (Outer Halo Ring + Core Dot)
        rCtx.strokeStyle = pulseColor;
        rCtx.fillStyle = pulseColor;
        rCtx.shadowColor = pulseColor;
        rCtx.shadowBlur = 5 * markerScale;
        rCtx.lineWidth = haloLineW;
        rCtx.beginPath();
        rCtx.arc(px, py, haloRadius, 0, Math.PI * 2);
        rCtx.stroke();

        rCtx.shadowBlur = 0;
        rCtx.beginPath();
        rCtx.arc(px, py, coreRadius, 0, Math.PI * 2);
        rCtx.fill();
    } finally {
        rCtx.restore();
    }
}

function drawTireTempHistogram(tCtx, tw, th, dpr, tHist, cTemp, isMetric) {
    var padX = Math.min(tw * 0.08, 3 * dpr), plotW = Math.max(1, tw - 2 * padX);
    var markerScale = Math.min(dpr, padX / 3, th / 10);
    var numBins = Math.max(15, Math.floor(plotW / (3 * dpr))), barW = plotW / numBins;
    var tempRange = TEMP_HIST_MAX_F - TEMP_HIST_MIN_F, tempPerBin = tempRange / numBins;

    if (_sharedBins.length !== numBins) _sharedBins.length = numBins;
    for (var _b = 0; _b < numBins; _b++) _sharedBins[_b] = 0;
    var maxBinCount = 3;
    for (var hi = 0; hi < tHist.length; hi++) {
        // [PERF] Accumulating bins is order-independent; iterate linearly to skip modulo overhead.
        var p = tHist[hi];
        if (p.temp <= 0) continue;
        var bIdx = Math.min(numBins - 1, Math.floor(clamp((p.temp - TEMP_HIST_MIN_F) / tempRange, 0, 1) * numBins));
        if (++_sharedBins[bIdx] > maxBinCount) maxBinCount = _sharedBins[bIdx];
    }

    var fontSize = Math.max(10 * dpr, Math.round(th * 0.28));
    var topPad = Math.min(th * 0.36, fontSize + 3 * dpr), bottomPad = Math.min(th * 0.22, 3.2 * dpr);
    var maxBarH = Math.max(1, th - topPad - bottomPad), minBarH = Math.min(maxBarH, 2 * dpr);
    var lineY = th - Math.min(th * 0.16, 2.2 * dpr), lineW = Math.min(1.5 * dpr, th * 0.15);
    var coldX = padX + clamp((TEMP_COLD_F - TEMP_HIST_MIN_F) / tempRange, 0, 1) * plotW;
    var hotX = padX + clamp((TEMP_HOT_F - TEMP_HIST_MIN_F) / tempRange, 0, 1) * plotW;
    var drawBarW = barW > 1.5 * dpr ? barW - 0.5 * dpr : barW;

    tCtx.save();
    try {
        tCtx.lineCap = 'butt';
        tCtx.lineWidth = lineW;
        tCtx.strokeStyle = '#0088ff'; tCtx.beginPath(); tCtx.moveTo(padX, lineY); tCtx.lineTo(coldX, lineY); tCtx.stroke();
        tCtx.strokeStyle = '#00ff00'; tCtx.beginPath(); tCtx.moveTo(coldX, lineY); tCtx.lineTo(hotX, lineY); tCtx.stroke();
        tCtx.strokeStyle = '#ff0000'; tCtx.beginPath(); tCtx.moveTo(hotX, lineY); tCtx.lineTo(padX + plotW, lineY); tCtx.stroke();

        for (var b = 0; b < numBins; b++) {
            var bH = Math.max(minBarH, (_sharedBins[b] / maxBinCount) * maxBarH);
            tCtx.fillStyle = getTempColor(TEMP_HIST_MIN_F + (b + 0.5) * tempPerBin);
            tCtx.fillRect(padX + b * barW, th - bottomPad - bH, drawBarW, bH);
        }

        if (cTemp > 0) {
            var indicatorX = padX + clamp((cTemp - TEMP_HIST_MIN_F) / tempRange, 0, 1) * plotW;
            tCtx.strokeStyle = '#ffffff';
            tCtx.lineWidth = lineW;
            tCtx.shadowColor = getTempColor(cTemp);
            tCtx.shadowBlur = 4 * markerScale;
            tCtx.beginPath();
            tCtx.moveTo(indicatorX, topPad);
            tCtx.lineTo(indicatorX, lineY);
            tCtx.stroke();

            tCtx.fillStyle = '#ffffff';
            tCtx.beginPath();
            tCtx.arc(indicatorX, lineY, 1.8 * markerScale, 0, Math.PI * 2);
            tCtx.fill();

            var displayT = isMetric ? Math.round(fahrenheitToCelsius(cTemp)) + '\u00b0C' : Math.round(cTemp) + '\u00b0F';
            var edgeMargin = Math.min(plotW * 0.3, 36 * dpr);
            tCtx.shadowColor = 'rgba(0, 0, 0, 0.9)';
            tCtx.shadowBlur = 3 * markerScale;
            tCtx.font = 'bold ' + fontSize + 'px monospace';
            tCtx.textAlign = indicatorX > (tw - padX) - edgeMargin ? 'right' : (indicatorX < padX + edgeMargin ? 'left' : 'center');
            tCtx.textBaseline = 'top';
            if (typeof tCtx.fillText === 'function') {
                var textX = tCtx.textAlign === 'left' ? indicatorX + 3 * markerScale : (tCtx.textAlign === 'right' ? indicatorX - 3 * markerScale : indicatorX);
                tCtx.fillText(displayT, clamp(textX, padX, tw - padX), 2 * markerScale);
            }
        }
    } finally {
        tCtx.restore();
    }
}

export function renderCorners(data, showSusp, showSlip, showTemp, tireHist, suspHist, suspMinMax, now, domCache) {
    var rawSlipRatios = data.TireSlipRatio || [];
    var rawSlipAngles = data.TireSlipAngle || [];
    var rawTemps = data.TireTemp || [];
    var rawTravels = data.NormalizedSuspensionTravel || [];

    _slipRatios[0] = data.slip_fl !== undefined ? data.slip_fl : (rawSlipRatios[0] || 0);
    _slipRatios[1] = data.slip_fr !== undefined ? data.slip_fr : (rawSlipRatios[1] || 0);
    _slipRatios[2] = data.slip_rl !== undefined ? data.slip_rl : (rawSlipRatios[2] || 0);
    _slipRatios[3] = data.slip_rr !== undefined ? data.slip_rr : (rawSlipRatios[3] || 0);
    var slipRatios = _slipRatios;

    _slipAngles[0] = data.slip_angle_fl !== undefined ? data.slip_angle_fl : (rawSlipAngles[0] || 0);
    _slipAngles[1] = data.slip_angle_fr !== undefined ? data.slip_angle_fr : (rawSlipAngles[1] || 0);
    _slipAngles[2] = data.slip_angle_rl !== undefined ? data.slip_angle_rl : (rawSlipAngles[2] || 0);
    _slipAngles[3] = data.slip_angle_rr !== undefined ? data.slip_angle_rr : (rawSlipAngles[3] || 0);
    var slipAngles = _slipAngles;

    _temps[0] = data.temp_fl !== undefined ? data.temp_fl : (rawTemps[0] !== undefined ? rawTemps[0] : 0);
    _temps[1] = data.temp_fr !== undefined ? data.temp_fr : (rawTemps[1] !== undefined ? rawTemps[1] : 0);
    _temps[2] = data.temp_rl !== undefined ? data.temp_rl : (rawTemps[2] !== undefined ? rawTemps[2] : 0);
    _temps[3] = data.temp_rr !== undefined ? data.temp_rr : (rawTemps[3] !== undefined ? rawTemps[3] : 0);
    var temps = _temps;

    _travels[0] = data.susp_fl !== undefined ? data.susp_fl : (rawTravels[0] || 0);
    _travels[1] = data.susp_fr !== undefined ? data.susp_fr : (rawTravels[1] || 0);
    _travels[2] = data.susp_rl !== undefined ? data.susp_rl : (rawTravels[2] || 0);
    _travels[3] = data.susp_rr !== undefined ? data.susp_rr : (rawTravels[3] || 0);
    var travels = _travels;

    // Unit conversion preference (°C vs °F display)
    var isMetric = (data.isMetric !== undefined ? data.isMetric : (data.is_metric !== false));
    var primaryColor = (showSusp || showSlip) ? resolvePrimaryColor(domCache) : '#00f0ff';

    for (var i = 0; i < 4; i++) {
        var tag = corners[i];
        var rawRatio = Number(slipRatios[i]);
        var rawAngle = Number(slipAngles[i]);
        var cRatio = Number.isFinite(rawRatio) ? rawRatio : 0;
        var cAngle = Number.isFinite(rawAngle) ? rawAngle : 0;
        var rawTemp = Number(temps[i]);
        var cTemp = Number.isFinite(rawTemp) ? rawTemp : 0;
        var rawTravel = Number(travels[i]);
        var cTravel = clamp(Number.isFinite(rawTravel) ? rawTravel : 0, 0, 1);

        // Maintain 3-second Tire Temp History (180 points @ 60 Hz)
        var tHist = tireHist[i];
        tHist._offset = tHist._offset || 0;
        if (tHist.length < 180) {
            tHist.push({ temp: cTemp, time: now });
        } else {
            var oldT = tHist[tHist._offset];
            if (oldT) { oldT.temp = cTemp; oldT.time = now; }
            tHist._offset = (tHist._offset + 1) % 180;
        }

        // ---- Slip Radar ----------------------------------------------------
        if (showSlip) {
            var angEl  = domCache ? domCache.corners[tag].angEl : document.getElementById('tcTireAng' + tag);
            if (angEl)  angEl.textContent = radToDeg(cAngle).toFixed(1) + '\u00b0';

            var ratEl  = domCache ? domCache.corners[tag].ratEl : document.getElementById('tcTireRat' + tag);
            if (ratEl)  ratEl.textContent = cRatio.toFixed(2);

            var rCanvas = domCache ? (domCache.corners[tag] && domCache.corners[tag].rCanvas) : document.getElementById('tcTireRadar' + tag);
            if (rCanvas) {
                var cData = getCanvasContext(rCanvas);
                if (cData && cData.ctx) {
                    cData.ctx.clearRect(0, 0, cData.w, cData.h);
                    drawSlipRadar(cData.ctx, cData.w, cData.h, cData.dpr, cAngle, cRatio, primaryColor);
                }
            }
        }

        // ---- Tire Temperature ----------------------------------------------
        if (showTemp) {
            var tempEl = domCache ? domCache.corners[tag].tempEl : document.getElementById('tcTireTemp' + tag);
            if (tempEl) tempEl.style.display = 'none';

            var tCanvas = domCache ? domCache.corners[tag].tCanvas : document.getElementById('tcTireHist' + tag);
            if (tCanvas && tHist.length > 0) {
                var tData = getCanvasContext(tCanvas);
                if (tData && tData.ctx) {
                    tData.ctx.clearRect(0, 0, tData.w, tData.h);
                    drawTireTempHistogram(tData.ctx, tData.w, tData.h, tData.dpr, tHist, cTemp, isMetric);
                }
            }
        }

        // ---- Suspension Bar & Waveform -------------------------------------
        if (showSusp) {
            var txtEl = domCache ? domCache.corners[tag].txtEl : document.getElementById('tcSuspText' + tag);
            if (txtEl) txtEl.textContent = cTravel.toFixed(2);

            var barEl = domCache ? domCache.corners[tag].barEl : document.getElementById('tcSuspBar' + tag);
            if (barEl) barEl.style.height = (cTravel * 100) + '%';

            var mm = suspMinMax[i];
            if (mm.min === null || cTravel < mm.min) mm.min = cTravel;
            if (mm.max === null || cTravel > mm.max) mm.max = cTravel;
            var minEl = domCache ? domCache.corners[tag].minEl : document.getElementById('tcSuspMin' + tag); if (minEl) minEl.textContent = mm.min.toFixed(2);
            var maxEl = domCache ? domCache.corners[tag].maxEl : document.getElementById('tcSuspMax' + tag); if (maxEl) maxEl.textContent = mm.max.toFixed(2);

            var sHist = suspHist[i];
            sHist._offset = sHist._offset || 0;
            if (sHist.length < 150) {
                sHist.push({ travel: cTravel, time: now });
            } else {
                var oldS = sHist[sHist._offset];
                if (oldS) { oldS.travel = cTravel; oldS.time = now; }
                sHist._offset = (sHist._offset + 1) % 150;
            }

            var wCanvas = domCache ? (domCache.corners[tag] && domCache.corners[tag].wCanvas) : document.getElementById('tcSuspWave' + tag);
            if (wCanvas && sHist.length > 0) {
                var wData = getCanvasContext(wCanvas);
                if (wData && wData.ctx) {
                    wData.ctx.clearRect(0, 0, wData.w, wData.h);
                    drawSuspWaveform(wData.ctx, wData.w, wData.h, wData.dpr, sHist, cTravel, primaryColor);
                }
            }
        }
    }
}
