// =============================================================================
// hud_overlay/shared/telemetry-cards/corner-card.js
// 4-Corner (FL, FR, RL, RR) Suspension, Slip Radar & Tire Temp Sub-Renderer
// =============================================================================

import {
    corners,
    getTempColor,
    radToDeg,
    clamp,
    TEMP_HIST_MIN_F,
    TEMP_HIST_MAX_F,
    TEMP_NORMAL_MIN_F,
    TEMP_NORMAL_MAX_F,
} from './utils.js';

export function renderCorners(data, showSusp, showSlip, showTemp, tireHist, suspHist, suspMinMax, now) {
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
            var angEl  = document.getElementById('tcTireAng' + tag);
            if (angEl)  angEl.textContent = radToDeg(cAngle).toFixed(1) + '\u00b0';

            var ratEl  = document.getElementById('tcTireRat' + tag);
            if (ratEl)  ratEl.textContent = cRatio.toFixed(2);

            var rCanvas = document.getElementById('tcTireRadar' + tag);
            if (rCanvas) {
                var rCtx = rCanvas.getContext('2d');
                if (rCtx) {
                    var rw = rCanvas.width, rh = rCanvas.height;
                    rCtx.clearRect(0, 0, rw, rh);
                    var rx0 = rw / 2, ry0 = rh / 2;
                    var rRad = Math.min(rw, rh) * 0.42;

                    // Outer circle
                    rCtx.beginPath();
                    rCtx.arc(rx0, ry0, rRad, 0, Math.PI * 2);
                    rCtx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
                    rCtx.lineWidth = 1;
                    rCtx.stroke();

                    // 50% inner circle (comfort threshold)
                    rCtx.beginPath();
                    rCtx.arc(rx0, ry0, rRad * 0.5, 0, Math.PI * 2);
                    rCtx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
                    rCtx.lineWidth = 1;
                    rCtx.stroke();

                    // Crosshairs
                    rCtx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
                    rCtx.lineWidth = 0.8;
                    rCtx.beginPath(); rCtx.moveTo(rx0, ry0 - rRad); rCtx.lineTo(rx0, ry0 + rRad); rCtx.stroke();
                    rCtx.beginPath(); rCtx.moveTo(rx0 - rRad, ry0); rCtx.lineTo(rx0 + rRad, ry0); rCtx.stroke();

                    // Map slip angle → X, slip ratio → Y
                    var maxTRadius = Math.max(0, rRad - 3);
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
                    rCtx.arc(px, py, 5, 0, Math.PI * 2);
                    rCtx.fillStyle = mag > 1.0 ? 'rgba(255,0,85,0.85)' : 'rgba(0,240,255,0.85)';
                    rCtx.fill();
                }
            }
        }

        // ---- Tire Temperature ----------------------------------------------
        if (showTemp) {
            var tempEl = document.getElementById('tcTireTemp' + tag);
            if (tempEl) {
                if (cTemp > 0) {
                    var cTempC   = (cTemp - 32) * 5 / 9;
                    var displayT = isMetric ? Math.round(cTempC) : Math.round(cTemp);
                    tempEl.textContent = displayT + (isMetric ? '\u00b0C' : '\u00b0F');
                    tempEl.style.color = getTempColor(cTemp);
                } else {
                    tempEl.textContent = '--' + (isMetric ? '\u00b0C' : '\u00b0F');
                    tempEl.style.color = 'rgba(255,255,255,0.4)';
                }
            }

            var tCanvas = document.getElementById('tcTireHist' + tag);
            if (tCanvas && tHist.length > 0) {
                var tCtx = tCanvas.getContext('2d');
                if (tCtx) {
                    var tw = tCanvas.width, th = tCanvas.height;
                    tCtx.clearRect(0, 0, tw, th);

                    var numBins   = 15;
                    var tempRange = TEMP_HIST_MAX_F - TEMP_HIST_MIN_F;
                    var tempPerBin = tempRange / numBins;
                    var bins = new Array(numBins).fill(0);

                    for (var hi = 0; hi < tHist.length; hi++) {
                        var p = tHist[hi];
                        if (p.temp <= 0) continue;
                        var tVal = clamp(p.temp, TEMP_HIST_MIN_F, TEMP_HIST_MAX_F);
                        var bIdx = Math.floor((tVal - TEMP_HIST_MIN_F) / tempPerBin);
                        if (bIdx >= numBins) bIdx = numBins - 1;
                        bins[bIdx]++;
                    }

                    var maxBinCount = Math.max(1, Math.max.apply(null, bins));

                    var normStartBin = Math.floor((TEMP_NORMAL_MIN_F - TEMP_HIST_MIN_F) / tempPerBin);
                    var normEndBin   = Math.ceil( (TEMP_NORMAL_MAX_F - TEMP_HIST_MIN_F) / tempPerBin);
                    var barW = tw / numBins;

                    tCtx.fillStyle = 'rgba(0, 255, 100, 0.08)';
                    tCtx.fillRect(normStartBin * barW, 0, (normEndBin - normStartBin) * barW, th);

                    for (var b = 0; b < numBins; b++) {
                        var bH = (bins[b] / maxBinCount) * (th - 4);
                        if (bH < 2) bH = 2;
                        var bTemp = TEMP_HIST_MIN_F + b * tempPerBin;
                        tCtx.fillStyle = getTempColor(bTemp);
                        tCtx.fillRect(b * barW, th - bH, barW - 1, bH);
                    }
                }
            }
        }

        // ---- Suspension Bar & Waveform -------------------------------------
        if (showSusp) {
            var txtEl = document.getElementById('tcSuspText' + tag);
            if (txtEl) txtEl.textContent = cTravel.toFixed(2);

            var barEl = document.getElementById('tcSuspBar' + tag);
            if (barEl) barEl.style.height = (cTravel * 100) + '%';

            var mm = suspMinMax[i];
            if (mm.min === null || cTravel < mm.min) mm.min = cTravel;
            if (mm.max === null || cTravel > mm.max) mm.max = cTravel;
            var minEl = document.getElementById('tcSuspMin' + tag); if (minEl) minEl.textContent = mm.min.toFixed(2);
            var maxEl = document.getElementById('tcSuspMax' + tag); if (maxEl) maxEl.textContent = mm.max.toFixed(2);

            var sHist = suspHist[i];
            if (sHist.length < 150) {
                sHist.push({ travel: cTravel, time: now });
            } else {
                var oldS = sHist.shift();
                if (oldS) { oldS.travel = cTravel; oldS.time = now; sHist.push(oldS); }
            }

            var wCanvas = document.getElementById('tcSuspWave' + tag);
            if (wCanvas && sHist.length > 0) {
                var wCtx = wCanvas.getContext('2d');
                if (wCtx) {
                    var ww = wCanvas.width, wh = wCanvas.height;
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

                    var wrapperEl = document.getElementById('tcClusterWrapper');
                    var primaryColor = '#00f0ff';
                    if (wrapperEl && typeof wrapperEl.style !== 'undefined' && typeof wrapperEl.style.getPropertyValue === 'function') {
                        var cssVal = wrapperEl.style.getPropertyValue('--card-primary');
                        if (cssVal && cssVal.trim()) primaryColor = cssVal.trim();
                    }
                    wCtx.strokeStyle = primaryColor;
                    wCtx.lineWidth = 1.5;
                    wCtx.stroke();
                }
            }
        }
    }
}
