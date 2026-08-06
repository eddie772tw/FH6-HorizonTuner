// =============================================================================
// hud_overlay/shared/telemetry-cards/live-map.js
// Live Map Telemetry Card Renderer (Track Map, Vehicle Cursor & Asset Placeholder)
// =============================================================================

var posHistory = [];
var MAX_MAP_HISTORY = 300;
var mapImageAsset = null;
var mapImageLoaded = false;
var mapImageFailed = false;

// Preload map placeholder asset if provided in assets/
if (typeof Image !== 'undefined') {
    mapImageAsset = new Image();
    mapImageAsset.onload = function () {
        mapImageLoaded = true;
    };
    mapImageAsset.onerror = function () {
        mapImageFailed = true;
    };
    // Default placeholder asset path
    mapImageAsset.src = '../../assets/live_map_bg.png';
}

/**
 * Render Live Map Telemetry Card
 *
 * @param {HTMLCanvasElement} canvas
 * @param {Object} data - Raw UDP telemetry packet
 * @param {Object} config - Telemetry cards configuration
 */
export function renderLiveMap(canvas, data, config) {
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var w = canvas.width;
    var h = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, w, h);

    // Extract position X and Z (or Y in planar games)
    var rawX = data ? (data.PositionX !== undefined ? data.PositionX : data.x) : 0;
    var rawZ = data ? (data.PositionZ !== undefined ? data.PositionZ : (data.z !== undefined ? data.z : data.PositionY)) : 0;
    var speed = data ? (data.SpeedMetersPerSecond !== undefined ? data.SpeedMetersPerSecond * 3.6 : (data.speed || 0)) : 0;

    // DEMO mode simulated track if no data
    if ((!data || (rawX === 0 && rawZ === 0)) && (typeof window !== 'undefined' && window.demoActive)) {
        var t = (Date.now() / 1000) * 0.8;
        rawX = Math.sin(t) * 180 + Math.cos(t * 2.1) * 40;
        rawZ = Math.cos(t * 0.9) * 140 + Math.sin(t * 1.5) * 30;
        speed = 85 + Math.sin(t * 1.2) * 30;
    }

    // Append to position history if moving or valid
    if (Math.abs(rawX) > 0.01 || Math.abs(rawZ) > 0.01) {
        var isDrift = data && (data.TireSlipRatio ? Math.max.apply(null, data.TireSlipRatio) > 0.4 : speed > 20);
        posHistory.push({ x: rawX, z: rawZ, drift: isDrift, time: Date.now() });
        if (posHistory.length > MAX_MAP_HISTORY) {
            posHistory.shift();
        }
    }

    // ── 1. Render Map Background Asset / Placeholder ───────────────────────
    if (mapImageLoaded && mapImageAsset) {
        ctx.drawImage(mapImageAsset, 0, 0, w, h);
    } else {
        // Draw High-Tech Grid Asset Placeholder
        ctx.save();
        ctx.fillStyle = 'rgba(10, 15, 25, 0.85)';
        ctx.fillRect(0, 0, w, h);

        // Grid lines
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.08)';
        ctx.lineWidth = 1;
        var gridSize = 25;
        for (var gx = 0; gx < w; gx += gridSize) {
            ctx.beginPath();
            ctx.moveTo(gx, 0);
            ctx.lineTo(gx, h);
            ctx.stroke();
        }
        for (var gy = 0; gy < h; gy += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, gy);
            ctx.lineTo(w, gy);
            ctx.stroke();
        }

        // Placeholder Badge Text
        ctx.font = '10px monospace';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('MAP ASSET PLACEHOLDER', w / 2, h / 2 - 10);
        ctx.fillStyle = 'rgba(0, 240, 255, 0.2)';
        ctx.fillText('ADD BG TO /assets/live_map_bg.png', w / 2, h / 2 + 10);
        ctx.restore();
    }

    // ── 2. Auto Range Normalization ──────────────────────────────────────────
    var minX = rawX - 100, maxX = rawX + 100;
    var minZ = rawZ - 100, maxZ = rawZ + 100;

    if (posHistory.length > 1) {
        minX = posHistory[0].x; maxX = posHistory[0].x;
        minZ = posHistory[0].z; maxZ = posHistory[0].z;
        for (var i = 1; i < posHistory.length; i++) {
            var p = posHistory[i];
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.z < minZ) minZ = p.z;
            if (p.z > maxZ) maxZ = p.z;
        }
    }

    var rangeX = Math.max(80, maxX - minX);
    var rangeZ = Math.max(80, maxZ - minZ);
    var padding = 30;

    function mapToCanvas(px, pz) {
        var cx = padding + ((px - minX) / rangeX) * (w - padding * 2);
        var cy = padding + ((pz - minZ) / rangeZ) * (h - padding * 2);
        return { x: cx, y: cy };
    }

    // ── 3. Render Track History Lines ───────────────────────────────────────
    if (posHistory.length > 1) {
        ctx.save();
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (var j = 1; j < posHistory.length; j++) {
            var pPrev = mapToCanvas(posHistory[j - 1].x, posHistory[j - 1].z);
            var pCurr = mapToCanvas(posHistory[j].x, posHistory[j].z);
            var alpha = j / posHistory.length;

            ctx.beginPath();
            ctx.moveTo(pPrev.x, pPrev.y);
            ctx.lineTo(pCurr.x, pCurr.y);

            if (posHistory[j].drift) {
                ctx.strokeStyle = 'rgba(255, 120, 0, ' + (0.3 + alpha * 0.7) + ')';
            } else {
                ctx.strokeStyle = 'rgba(0, 240, 255, ' + (0.2 + alpha * 0.6) + ')';
            }
            ctx.stroke();
        }
        ctx.restore();
    }

    // ── 4. Render Current Vehicle Cursor ────────────────────────────────────
    var currPos = mapToCanvas(rawX, rawZ);
    ctx.save();
    ctx.beginPath();
    ctx.arc(currPos.x, currPos.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#00f0ff';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // Pulse ring
    var pulseR = 8 + (Date.now() % 1000) / 1000 * 8;
    ctx.beginPath();
    ctx.arc(currPos.x, currPos.y, pulseR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 240, 255, ' + (1 - pulseR / 16) + ')';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();

    // Update coordinate readout if element exists
    var coordEl = document.getElementById('tcLiveMapCoord');
    if (coordEl) {
        coordEl.innerText = 'X:' + Math.round(rawX) + ' Z:' + Math.round(rawZ);
    }
}
