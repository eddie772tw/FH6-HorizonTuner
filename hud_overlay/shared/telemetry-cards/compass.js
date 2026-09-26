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
    return ((deg % 360) + 360) % 360;
}

/**
 * Formats degrees into a 3-digit padded string (e.g. 5 -> '005')
 * @param {number} deg
 * @returns {string}
 */
export function formatHeadingDigits(deg) {
    var rounded = Math.round(deg) % 360;
    if (rounded < 0) rounded += 360;
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

    // DEMO mode simulated rotation if no data
    if ((!data || (data.Yaw === undefined && data.yaw === undefined)) && (typeof window !== 'undefined' && window.demoActive)) {
        yawAngle = ((Date.now() / 3000) % (Math.PI * 2));
    }

    // Convert to heading degrees: N = 0 deg, E = 90 deg, S = 180 deg, W = 270 deg
    var headingDeg = normalizeAngle(yawAngle * 180 / Math.PI);

    // Color tokens
    var primaryColor = '#00f0ff';
    if (config && config.customColor && config.useDefaultColors === false) {
        primaryColor = config.customColor;
    } else if (canvas.parentElement) {
        var computedPrimary = getComputedStyle(canvas.parentElement).getPropertyValue('--card-primary');
        if (computedPrimary && computedPrimary.trim()) {
            primaryColor = computedPrimary.trim();
        }
    }

    ctx.save();

    // Configure drop shadows for all lines and text for maximum readability
    ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
    ctx.shadowBlur = 4 * dpr;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = dpr;

    // Visible span in degrees (FOV): 120 degrees across the canvas width
    var visibleSpanDeg = 120.0;
    var pixelsPerDegree = w / visibleSpanDeg;
    var centerX = w / 2;

    // Ticks baseline Y (ticks hang down from baseline)
    // Keep the scrolling labels below the fixed heading readout.
    var baselineY = 44;

    // Find starting tick: round down to nearest 5 degrees
    var minAngle = headingDeg - (visibleSpanDeg / 2);
    var maxAngle = headingDeg + (visibleSpanDeg / 2);

    var startTick = Math.floor(minAngle / 5) * 5;
    var endTick = Math.ceil(maxAngle / 5) * 5;

    // Draw ticks and labels
    for (var tickDeg = startTick; tickDeg <= endTick; tickDeg += 5) {
        var diff = tickDeg - headingDeg;
        var x = centerX + diff * pixelsPerDegree;

        if (x < -20 || x > w + 20) continue;

        var normalizedTick = normalizeAngle(tickDeg);
        var isCardinal = (normalizedTick % 45 === 0);
        var isMajor = (normalizedTick % 15 === 0);

        // Grade 1: Major Tick (14px length, 2px stroke width)
        // Grade 2: Minor Tick (7px length, 1px stroke width)
        var tickLength = isMajor ? 14 : 7;
        var tickWidth = isMajor ? 2.0 : 1.0;

        ctx.beginPath();
        ctx.moveTo(x, baselineY);
        ctx.lineTo(x, baselineY + tickLength);

        if (isCardinal) {
            ctx.strokeStyle = primaryColor;
            ctx.lineWidth = 2.5;
        } else if (isMajor) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.lineWidth = tickWidth;
        } else {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
            ctx.lineWidth = tickWidth;
        }
        ctx.stroke();

        // Labels for Major Ticks
        if (isCardinal) {
            var cardinalName = CARDINAL_POINTS[normalizedTick];
            ctx.font = 'bold 12px "ForzaGear", Arial, sans-serif';
            ctx.fillStyle = primaryColor;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            // Cardinal Abbreviation (N, NE, E, SE, S, SW, W, NW)
            ctx.fillText(cardinalName, x, baselineY - 3);

            // Auxiliary Degree Number below the tick
            ctx.font = '9px monospace';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.textBaseline = 'top';
            ctx.fillText(normalizedTick.toString(), x, baselineY + tickLength + 3);
        } else if (isMajor) {
            // Auxiliary Degree Number below major tick (e.g. 15, 30, 60, 75...)
            ctx.font = '10px monospace';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(normalizedTick.toString(), x, baselineY + tickLength + 3);
        }
    }

    // Center Lubber Line / Pointer Triangle Indicator
    ctx.beginPath();
    ctx.moveTo(centerX, 30);
    ctx.lineTo(centerX - 6, 22);
    ctx.lineTo(centerX + 6, 22);
    ctx.closePath();
    ctx.fillStyle = primaryColor;
    ctx.fill();

    // Center Heading Readout (e.g. "042° NE")
    var currentDigits = formatHeadingDigits(headingDeg);
    var currentCardinal = getNearestCardinal(headingDeg);
    var readoutText = currentDigits + '° ' + currentCardinal;

    ctx.font = 'bold 13px "ForzaGear", monospace';
    ctx.fillStyle = primaryColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(readoutText, centerX, 18);

    // Smooth edge fade-out gradient mask (left and right 15%)
    ctx.restore();
    ctx.save();
    var edgeFadeWidth = w * 0.15;

    // Left fade mask
    var leftGrad = ctx.createLinearGradient(0, 0, edgeFadeWidth, 0);
    leftGrad.addColorStop(0, 'rgba(0, 0, 0, 1)');
    leftGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = leftGrad;
    ctx.fillRect(0, 0, edgeFadeWidth, h);

    // Right fade mask
    var rightGrad = ctx.createLinearGradient(w - edgeFadeWidth, 0, w, 0);
    rightGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    rightGrad.addColorStop(1, 'rgba(0, 0, 0, 1)');
    ctx.fillStyle = rightGrad;
    ctx.fillRect(w - edgeFadeWidth, 0, edgeFadeWidth, h);

    ctx.restore();
}
