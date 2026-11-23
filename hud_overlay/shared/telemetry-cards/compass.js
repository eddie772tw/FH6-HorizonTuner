// =============================================================================
// hud_overlay/shared/telemetry-cards/compass.js
// Ribbon / Tape Compass Telemetry HUD Component
// Borderless, Transparent Background, Drop Shadow, 50vw Screen Width
// =============================================================================

var CARDINAL_POINTS = {
    0: 'N',
    45: 'NE',
    90: 'E',
    135: 'SE',
    180: 'S',
    225: 'SW',
    270: 'W',
    315: 'NW',
    360: 'N'
};

/**
 * Normalizes an angle in degrees into [0, 360)
 * @param {number} deg
 * @returns {number}
 */
export function normalizeAngle(deg) {
    if (!Number.isFinite(deg)) return 0;
    return ((deg % 360) + 360) % 360;
}

/**
 * Formats degrees into a 3-digit padded string (e.g. 5 -> '005')
 * @param {number} deg
 * @returns {string}
 */
export function formatHeadingDigits(deg) {
    var rounded = Math.round(normalizeAngle(deg)) % 360;
    if (rounded < 10) return '00' + rounded;
    if (rounded < 100) return '0' + rounded;
    return '' + rounded;
}

/**
 * Gets nearest cardinal or intercardinal 2-letter abbreviation
 * @param {number} deg
 * @returns {string}
 */
export function getNearestCardinal(deg) {
    var norm = normalizeAngle(deg);
    var octant = Math.round(norm / 45) % 8;
    var octDeg = octant * 45;
    return CARDINAL_POINTS[octDeg] || 'N';
}

function strokeTickTier(ctx, startTick, endTick, headingDeg, centerX, ppd, w, baseY, len, tier, style, lineW) {
    ctx.strokeStyle = style; ctx.lineWidth = lineW; ctx.beginPath();
    for (var d = startTick; d <= endTick; d += 5) {
        var x = centerX + (d - headingDeg) * ppd;
        if (x < 0 || x > w) continue;
        var n = normalizeAngle(d);
        if (tier === 0 ? n % 45 === 0 : (tier === 1 ? n % 15 === 0 && n % 45 !== 0 : n % 15 !== 0)) {
            ctx.moveTo(x, baseY); ctx.lineTo(x, baseY + len);
        }
    }
    ctx.stroke();
}

function drawCompassTape(ctx, canvas, w, h, dpr, pixelWidth, headingDeg, primaryColor) {
    var ppd = w / 120.0, centerX = w / 2, vScale = Math.min(1, h / 76), yOff = Math.max(0, (h - 76 * vScale) * 0.5);
    var baselineY = yOff + 46 * vScale, majorLen = 13 * vScale, minorLen = 6.5 * vScale;
    var cardinalY = baselineY - 4 * vScale, labelY = baselineY + majorLen + 3.5 * vScale;
    var degPx = Math.max(1, Math.round(10 * vScale)), cardPx = Math.max(1, Math.round(12 * vScale));
    var startTick = Math.floor((headingDeg - 60) / 5) * 5, endTick = Math.ceil((headingDeg + 60) / 5) * 5;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.95)'; ctx.shadowBlur = 4 * dpr;
    ctx.shadowOffsetX = 0; ctx.shadowOffsetY = dpr; ctx.lineCap = 'round';
    // Horizontal tape baseline rail & 3 batched tick tiers (45° -> 15° -> 5°)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)'; ctx.lineWidth = Math.max(0.75, 1 * vScale);
    ctx.beginPath(); ctx.moveTo(0, baselineY); ctx.lineTo(w, baselineY); ctx.stroke();
    strokeTickTier(ctx, startTick, endTick, headingDeg, centerX, ppd, w, baselineY, majorLen, 0, primaryColor, 2.4 * vScale);
    strokeTickTier(ctx, startTick, endTick, headingDeg, centerX, ppd, w, baselineY, majorLen, 1, 'rgba(255, 255, 255, 0.9)', 1.8 * vScale);
    strokeTickTier(ctx, startTick, endTick, headingDeg, centerX, ppd, w, baselineY, minorLen, 2, 'rgba(255, 255, 255, 0.45)', 1.0 * vScale);
    ctx.textAlign = 'center';
    for (var tickDeg = startTick; tickDeg <= endTick; tickDeg += 5) {
        var x = centerX + (tickDeg - headingDeg) * ppd;
        if (x < 0 || x > w) continue;
        var norm = normalizeAngle(tickDeg);
        if (norm % 15 !== 0) continue;
        var isCard = norm % 45 === 0;
        if (isCard) {
            ctx.font = 'bold ' + cardPx + 'px "ForzaGear", Arial, sans-serif'; ctx.fillStyle = primaryColor;
            ctx.textBaseline = 'bottom'; ctx.fillText(CARDINAL_POINTS[norm], x, cardinalY);
        }
        ctx.font = (isCard ? 'bold ' : '') + degPx + 'px monospace';
        ctx.fillStyle = isCard ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 0.72)';
        ctx.textBaseline = 'top'; ctx.fillText(String(norm), x, labelY);
    }
    // Center Lubber Index Tick & Pointer Triangle with theme glow
    ctx.shadowColor = primaryColor; ctx.shadowBlur = 6 * dpr; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = primaryColor; ctx.lineWidth = 2.2 * vScale;
    ctx.beginPath(); ctx.moveTo(centerX, baselineY - 1 * vScale); ctx.lineTo(centerX, baselineY + majorLen + 1 * vScale); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(centerX, yOff + 24.5 * vScale);
    ctx.lineTo(centerX - 5.5 * vScale, yOff + 18 * vScale); ctx.lineTo(centerX + 5.5 * vScale, yOff + 18 * vScale);
    ctx.closePath(); ctx.fillStyle = primaryColor; ctx.fill();
    // Fixed Center Heading Readout (e.g. "042° NE")
    ctx.shadowColor = 'rgba(0, 0, 0, 0.95)'; ctx.shadowBlur = 4 * dpr; ctx.shadowOffsetY = dpr;
    ctx.font = 'bold ' + Math.max(1, Math.round(13 * vScale)) + 'px "ForzaGear", monospace';
    ctx.fillStyle = primaryColor; ctx.textBaseline = 'bottom';
    ctx.fillText(formatHeadingDigits(headingDeg) + '° ' + getNearestCardinal(headingDeg), centerX, yOff + 15 * vScale);
    // Cached left/right 15% edge fade mask (zero per-frame gradient allocations)
    var edgeW = w * 0.15;
    if (canvas._fadeGradCtx !== ctx || canvas._fadeGradW !== w || canvas._fadeGradPW !== pixelWidth) {
        var lg = ctx.createLinearGradient(0, 0, edgeW, 0), rg = ctx.createLinearGradient(w - edgeW, 0, w, 0);
        lg.addColorStop(0, 'rgba(0, 0, 0, 1)'); lg.addColorStop(1, 'rgba(0, 0, 0, 0)');
        rg.addColorStop(0, 'rgba(0, 0, 0, 0)'); rg.addColorStop(1, 'rgba(0, 0, 0, 1)');
        canvas._fadeGradCtx = ctx; canvas._fadeGradW = w; canvas._fadeGradPW = pixelWidth;
        canvas._leftFadeGrad = lg; canvas._rightFadeGrad = rg;
    }
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = canvas._leftFadeGrad; ctx.fillRect(0, 0, edgeW, h);
    ctx.fillStyle = canvas._rightFadeGrad; ctx.fillRect(w - edgeW, 0, edgeW, h);
}

/**
 * Render Ribbon / Tape Compass on Canvas
 *
 * @param {HTMLCanvasElement} canvas
 * @param {Object} data - Raw UDP telemetry packet
 * @param {Object} config - Telemetry cards configuration
 * @param {Object} [domCache] - Cached DOM references
 */
export function renderCompass(canvas, data, config, domCache) {
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw in CSS pixels; the backing bitmap follows the viewport and display DPI.
    // Never use the previous bitmap as the layout size while the HUD is hidden.
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    if (w <= 0 || h <= 0) return;

    var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    var pixelWidth = Math.max(1, Math.round(w * dpr));
    var pixelHeight = Math.max(1, Math.round(h * dpr));
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    ctx.setTransform(pixelWidth / w, 0, 0, pixelHeight / h, 0, 0);

    // Clear canvas - transparent background
    ctx.clearRect(0, 0, w, h);

    // Extract Yaw in radians
    var yawAngle = 0;
    if (data && data.Yaw !== undefined && data.Yaw !== null) {
        yawAngle = data.Yaw;
    } else if (data && data.yaw !== undefined && data.yaw !== null) {
        yawAngle = data.yaw;
    } else if (data && data.NormalizedYaw !== undefined && data.NormalizedYaw !== null) {
        yawAngle = data.NormalizedYaw * Math.PI;
    }
    yawAngle = Number.isFinite(Number(yawAngle)) ? Number(yawAngle) : 0;

    // DEMO mode simulated rotation if no data
    if ((!data || (data.Yaw === undefined && data.yaw === undefined && data.NormalizedYaw === undefined)) && (typeof window !== 'undefined' && window.demoActive)) {
        yawAngle = ((Date.now() / 3000) % (Math.PI * 2));
    }

    // Convert to heading degrees: N = 0 deg, E = 90 deg, S = 180 deg, W = 270 deg
    var headingDeg = normalizeAngle(yawAngle * 180 / Math.PI);

    // Color tokens
    var primaryColor = '#00f0ff';
    if (config && config.customColor && config.useDefaultColors === false) {
        primaryColor = config.customColor;
    } else {
        if (domCache && domCache.wrapper && domCache.wrapper._cachedPrimaryColor) {
            primaryColor = domCache.wrapper._cachedPrimaryColor;
        } else {
            if (canvas._cachedPrimaryColor === undefined && canvas.parentElement) {
                var parentComputed = getComputedStyle(canvas.parentElement);
                var computedPrimary = parentComputed ? parentComputed.getPropertyValue('--card-primary') : null;
                canvas._cachedPrimaryColor = (computedPrimary && computedPrimary.trim()) ? computedPrimary.trim() : null;
            }
            if (canvas._cachedPrimaryColor) {
                primaryColor = canvas._cachedPrimaryColor;
            }
        }
    }

    ctx.save();
    try { drawCompassTape(ctx, canvas, w, h, dpr, pixelWidth, headingDeg, primaryColor); }
    finally { ctx.restore(); }
}
