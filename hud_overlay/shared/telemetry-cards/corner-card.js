// =============================================================================
// hud_overlay/shared/telemetry-cards/corner-card.js
// 4-Corner (FL, FR, RL, RR) Suspension, Slip Radar & Tire Temp Sub-Renderer
// =============================================================================

import {
    corners,
    getTempColor,
    radToDeg,
    clamp,
    getCanvasContext,
    TEMP_HIST_MIN_F,
    TEMP_HIST_MAX_F,
    TEMP_COLD_F,
    TEMP_HOT_F,
    TEMP_NORMAL_MIN_F,
    TEMP_NORMAL_MAX_F,
} from './utils.js';


export function renderCorners(data, showSusp, showSlip, showTemp, tireHist, suspHist, suspMinMax, now, domCache) {
    var rawSlipRatios = data.TireSlipRatio || [];
    var rawSlipAngles = data.TireSlipAngle || [];
    var rawTemps = data.TireTemp || [];
    var rawTravels = data.NormalizedSuspensionTravel || [];

    var slipRatios = [
        data.slip_fl !== undefined ? data.slip_fl : (rawSlipRatios[0] || 0),
        data.slip_fr !== undefined ? data.slip_fr : (rawSlipRatios[1] || 0),
        data.slip_rl !== undefined ? data.slip_rl : (rawSlipRatios[2] || 0),
        data.slip_rr !== undefined ? data.slip_rr : (rawSlipRatios[3] || 0)
    ];
    var slipAngles = [
        data.slip_angle_fl !== undefined ? data.slip_angle_fl : (rawSlipAngles[0] || 0),
        data.slip_angle_fr !== undefined ? data.slip_angle_fr : (rawSlipAngles[1] || 0),
        data.slip_angle_rl !== undefined ? data.slip_angle_rl : (rawSlipAngles[2] || 0),
        data.slip_angle_rr !== undefined ? data.slip_angle_rr : (rawSlipAngles[3] || 0)
    ];
    var temps = [
        data.temp_fl !== undefined ? data.temp_fl : (rawTemps[0] !== undefined ? rawTemps[0] : 0),
        data.temp_fr !== undefined ? data.temp_fr : (rawTemps[1] !== undefined ? rawTemps[1] : 0),
        data.temp_rl !== undefined ? data.temp_rl : (rawTemps[2] !== undefined ? rawTemps[2] : 0),
        data.temp_rr !== undefined ? data.temp_rr : (rawTemps[3] !== undefined ? rawTemps[3] : 0)
    ];
    var travels = [
        data.susp_fl !== undefined ? data.susp_fl : (rawTravels[0] || 0),
        data.susp_fr !== undefined ? data.susp_fr : (rawTravels[1] || 0),
        data.susp_rl !== undefined ? data.susp_rl : (rawTravels[2] || 0),
        data.susp_rr !== undefined ? data.susp_rr : (rawTravels[3] || 0)
    ];

    // Unit conversion preference (°C vs °F display)
    var isMetric = (data.isMetric !== undefined ? data.isMetric : (data.is_metric !== false));

    for (var i = 0; i < 4; i++) {
        var tag = corners[i];
        var cRatio = slipRatios[i] || 0;
        var cAngle = slipAngles[i] || 0;
        var cTemp  = temps[i] || 0;
        var cTravel = clamp(travels[i] || 0, 0, 1);

        // Maintain 3-second Tire Temp History (180 points @ 60 Hz)
        var tHist = tireHist[i];
        if (tHist.length < 180) {
            tHist.push({ temp: cTemp, time: now });
        } else {
            var oldT = tHist.shift();
            if (oldT) { oldT.temp = cTemp; oldT.time = now; tHist.push(oldT); }
        }

        // ---- Slip Radar ----------------------------------------------------
        if (showSlip) {
            var cached = domCache && domCache.corners ? domCache.corners[tag] : null;
            var angEl  = cached ? cached.angEl : document.getElementById('tcTireAng' + tag);
            if (angEl)  angEl.textContent = radToDeg(cAngle).toFixed(1) + '\u00b0';

            var ratEl  = cached ? cached.ratEl : document.getElementById('tcTireRat' + tag);
            if (ratEl)  ratEl.textContent = cRatio.toFixed(2);

            var rCanvas = cached ? cached.rCanvas : document.getElementById('tcTireRadar' + tag);
            if (rCanvas) {
                var cData = getCanvasContext(rCanvas);
                if (cData && cData.ctx) {
                    var rCtx = cData.ctx;
                    var rw = cData.w, rh = cData.h, dpr = cData.dpr;
                    rCtx.clearRect(0, 0, rw, rh);
                    var rx0 = rw / 2, ry0 = rh / 2;
                    var rRad = Math.min(rw, rh) * 0.44;

                    // Outer circle
                    rCtx.beginPath();
                    rCtx.arc(rx0, ry0, rRad, 0, Math.PI * 2);
                    rCtx.strokeStyle = 'rgba(255, 255, 255, 0.30)';
                    rCtx.lineWidth = 1.5 * dpr;
                    rCtx.stroke();

                    // Crosshairs
                    rCtx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
                    rCtx.lineWidth = 1 * dpr;
                    rCtx.beginPath(); rCtx.moveTo(rx0, ry0 - rRad); rCtx.lineTo(rx0, ry0 + rRad); rCtx.stroke();
                    rCtx.beginPath(); rCtx.moveTo(rx0 - rRad, ry0); rCtx.lineTo(rx0 + rRad, ry0); rCtx.stroke();

                    // Map slip angle → X, slip ratio → Y
                    var maxTRadius = Math.max(0, rRad - 3 * dpr);
                    var dx = (cAngle / 1.0) * rRad;
                    var dy = (cRatio / 1.0) * rRad;
                    var tDist = Math.sqrt(dx * dx + dy * dy);
                    if (tDist > maxTRadius && tDist > 0) {
                        dx = (dx / tDist) * maxTRadius;
                        dy = (dy / tDist) * maxTRadius;
                    }
                    var mag = Math.sqrt(cAngle * cAngle + cRatio * cRatio);
                    var px = rx0 + dx, py = ry0 + dy;

                    rCtx.beginPath();
                    rCtx.arc(px, py, Math.max(4 * dpr, rRad * 0.1), 0, Math.PI * 2);
                    rCtx.fillStyle = mag > 1.0 ? 'rgba(255,0,85,0.90)' : 'rgba(0,240,255,0.90)';
                    rCtx.fill();
                }
            }
        }

        // ---- Tire Temperature ----------------------------------------------
        if (showTemp) {
            var tempEl = cached ? cached.tempEl : document.getElementById('tcTireTemp' + tag);
            if (tempEl) {
                tempEl.style.display = 'none';
            }

            var tCanvas = cached ? cached.tCanvas : document.getElementById('tcTireHist' + tag);
            if (tCanvas && tHist.length > 0) {
                var tData = getCanvasContext(tCanvas);
                if (tData && tData.ctx) {
                    var tCtx = tData.ctx;
                    var tw = tData.w, th = tData.h, dpr = tData.dpr;
                    tCtx.clearRect(0, 0, tw, th);

                    var targetBarW = 3 * dpr;
                    var numBins    = Math.max(15, Math.floor(tw / targetBarW));
                    var barW       = tw / numBins;

                    var tempRange  = TEMP_HIST_MAX_F - TEMP_HIST_MIN_F;
                    var tempPerBin = tempRange / numBins;
                    var bins       = new Array(numBins).fill(0);

                    for (var hi = 0; hi < tHist.length; hi++) {
                        var p = tHist[hi];
                        if (p.temp <= 0) continue;
                        var normT = clamp((p.temp - TEMP_HIST_MIN_F) / tempRange, 0, 1);
                        var bIdx  = Math.min(numBins - 1, Math.floor(normT * numBins));
                        bins[bIdx]++;
                    }

                    var maxBinCount = 3;
                    for (var i_bin = 0; i_bin < bins.length; i_bin++) {
                        if (bins[i_bin] > maxBinCount) {
                            maxBinCount = bins[i_bin];
                        }
                    }

                    // Tri-Color Baseline (Cold: Blue, Normal: Green, Hot: Red)
                    var coldX = Math.max(0, Math.min(tw, ((TEMP_COLD_F - TEMP_HIST_MIN_F) / tempRange) * tw));
                    var hotX  = Math.max(0, Math.min(tw, ((TEMP_HOT_F  - TEMP_HIST_MIN_F) / tempRange) * tw));
                    var lineY = th - 1 * dpr;

                    tCtx.lineWidth = 1.5 * dpr;
                    // Cold segment (Blue)
                    tCtx.strokeStyle = '#0088ff';
                    tCtx.beginPath(); tCtx.moveTo(0, lineY); tCtx.lineTo(coldX, lineY); tCtx.stroke();
                    // Normal segment (Green)
                    tCtx.strokeStyle = '#00ff00';
                    tCtx.beginPath(); tCtx.moveTo(coldX, lineY); tCtx.lineTo(hotX, lineY); tCtx.stroke();
                    // Hot segment (Red)
                    tCtx.strokeStyle = '#ff0000';
                    tCtx.beginPath(); tCtx.moveTo(hotX, lineY); tCtx.lineTo(tw, lineY); tCtx.stroke();

                    for (var b = 0; b < numBins; b++) {
                        var bH = (bins[b] / maxBinCount) * (th - 6 * dpr);
                        if (bH < 2 * dpr) bH = 2 * dpr;
                        var bTempMid = TEMP_HIST_MIN_F + (b + 0.5) * tempPerBin;
                        tCtx.fillStyle = getTempColor(bTempMid);
                        var drawBarW = barW > 1.5 * dpr ? barW - 0.5 * dpr : barW;
                        tCtx.fillRect(b * barW, th - 2 * dpr - bH, drawBarW, bH);
                    }

                    // White Indicator Line & Floating Current Temp Display
                    if (cTemp > 0) {
                        var normTempFactor = clamp((cTemp - TEMP_HIST_MIN_F) / tempRange, 0, 1);
                        var indicatorX     = normTempFactor * tw;

                        // Draw White Line
                        tCtx.strokeStyle = '#ffffff';
                        tCtx.lineWidth   = 1.5 * dpr;
                        tCtx.beginPath();
                        tCtx.moveTo(indicatorX, 0);
                        tCtx.lineTo(indicatorX, th);
                        tCtx.stroke();

                        // Draw Floating Temperature Text
                        var cTempC   = (cTemp - 32) * 5 / 9;
                        var displayT = (isMetric ? Math.round(cTempC) + '\u00b0C' : Math.round(cTemp) + '\u00b0F');

                        var fontSize = Math.max(10 * dpr, Math.round(th * 0.28));
                        tCtx.fillStyle  = '#ffffff';
                        tCtx.font       = 'bold ' + fontSize + 'px monospace';
                        tCtx.textAlign  = indicatorX > tw - (36 * dpr) ? 'right' : (indicatorX < (36 * dpr) ? 'left' : 'center');
                        tCtx.textBaseline = 'top';
                        if (typeof tCtx.fillText === 'function') {
                            tCtx.fillText(displayT, indicatorX, 2 * dpr);
                        }
                    }
                }
            }
        }

        // ---- Suspension Bar & Waveform -------------------------------------
        if (showSusp) {
            var txtEl = cached ? cached.txtEl : document.getElementById('tcSuspText' + tag);
            if (txtEl) txtEl.textContent = cTravel.toFixed(2);

            var barEl = cached ? cached.barEl : document.getElementById('tcSuspBar' + tag);
            if (barEl) barEl.style.height = (cTravel * 100) + '%';

            var mm = suspMinMax[i];
            if (mm.min === null || cTravel < mm.min) mm.min = cTravel;
            if (mm.max === null || cTravel > mm.max) mm.max = cTravel;
            var minEl = cached ? cached.minEl : document.getElementById('tcSuspMin' + tag); if (minEl) minEl.textContent = mm.min.toFixed(2);
            var maxEl = cached ? cached.maxEl : document.getElementById('tcSuspMax' + tag); if (maxEl) maxEl.textContent = mm.max.toFixed(2);

            var sHist = suspHist[i];
            if (sHist.length < 150) {
                sHist.push({ travel: cTravel, time: now });
            } else {
                var oldS = sHist.shift();
                if (oldS) { oldS.travel = cTravel; oldS.time = now; sHist.push(oldS); }
            }

            var wCanvas = cached ? cached.wCanvas : document.getElementById('tcSuspWave' + tag);
            if (wCanvas && sHist.length > 0) {
                var wData = getCanvasContext(wCanvas);
                if (wData && wData.ctx) {
                    var wCtx = wData.ctx;
                    var ww = wData.w, wh = wData.h, dpr = wData.dpr;
                    wCtx.clearRect(0, 0, ww, wh);

                    var warnH = wh * 0.05;
                    wCtx.fillStyle = 'rgba(255, 0, 60, 0.18)';
                    wCtx.fillRect(0, 0, ww, warnH);
                    wCtx.fillRect(0, wh - warnH, ww, warnH);

                    wCtx.beginPath();
                    for (var j = 0; j < sHist.length; j++) {
                        var wx = (j / 150) * ww;
                        var wy = wh - (sHist[j].travel * wh);
                        if (j === 0) wCtx.moveTo(wx, wy);
                        else         wCtx.lineTo(wx, wy);
                    }

                    var wrapperEl = domCache ? domCache.wrapper : document.getElementById('tcClusterWrapper');
                    var primaryColor = '#00f0ff';
                    if (wrapperEl && typeof wrapperEl.style !== 'undefined' && typeof wrapperEl.style.getPropertyValue === 'function') {
                        var cssVal = wrapperEl.style.getPropertyValue('--card-primary');
                        if (cssVal && cssVal.trim()) primaryColor = cssVal.trim();
                    }
                    wCtx.strokeStyle = primaryColor;
                    wCtx.lineWidth = 1.5 * dpr;
                    wCtx.stroke();
                }
            }
        }
    }
}
