// =============================================================================
// hud_overlay/shared/telemetry-cards/live-map.js
// Live Map Telemetry Card Renderer (Track Map, Vehicle Cursor, POIs & Heading)
// =============================================================================

var posHistory = [];
var MAX_MAP_HISTORY = 10000; // Expanded to 10,000 persistent track points
var mapImageAsset = null;
var mapImageLoaded = false;
var mapImageFailed = false;

// Local 3.24MB High-Res Map Background Asset with online fallbacks
var MAP_IMAGE_URLS = [
    '../shared/assets/live_map_bg.png',
    './shared/assets/live_map_bg.png',
    'shared/assets/live_map_bg.png',
    '../../shared/assets/live_map_bg.png',
    'https://forza.labsgg.com/_astro/FH6-full-map.59v5pH0D.jpg',
    'https://media.mapgenie.io/v2/assets/prod/games/forza-horizon-6/preview.jpg'
];

if (typeof Image !== 'undefined') {
    var tryLoadMapImage = function (index) {
        if (index >= MAP_IMAGE_URLS.length) {
            mapImageFailed = true;
            return;
        }
        mapImageAsset = new Image();
        mapImageAsset.crossOrigin = 'Anonymous';
        mapImageAsset.onload = function () {
            mapImageLoaded = true;
            mapImageFailed = false;
        };
        mapImageAsset.onerror = function () {
            tryLoadMapImage(index + 1);
        };
        mapImageAsset.src = MAP_IMAGE_URLS[index];
    };
    tryLoadMapImage(0);
}

// Map Image Alignment Parameters (User Calibrated Values)
var MAP_CALIBRATION = {
    centerX: 1170.0,
    centerY: 1312.0,
    scaleX: 7.81,
    scaleZ: -7.81
};

// Forza Horizon 6 Japan Map POI Catalog (Default Fallback + Local JSON Loadable)
export var JAPAN_POIS = [
    { id: 'pr_hakone_drift', name: 'Hakone Touge Drift Zone', type: 'pr_drift', category: 'pr_stunt', x: -120, z: 80, symbol: 'D', color: '#ff9900' },
    { id: 'pr_fuji_speed', name: 'Fuji Speedway Trap', type: 'pr_speed', category: 'pr_stunt', x: 150, z: -100, symbol: 'S', color: '#00f0ff' },
    { id: 'pr_shuto_zone', name: 'Shuto Expressway Zone', type: 'pr_zone', category: 'pr_stunt', x: 50, z: 120, symbol: 'Z', color: '#00ff66' },
    { id: 'pr_fuji_jump', name: 'Mt. Fuji Danger Sign', type: 'pr_danger', category: 'pr_stunt', x: -80, z: -150, symbol: 'J', color: '#ff0055' },
    { id: 'fest_japan', name: 'Horizon Japan Festival', type: 'festival', category: 'poi', x: 0, z: 0, symbol: 'F', color: '#ff00aa' },
    { id: 'race_suzuka', name: 'Suzuka Touge Battle', type: 'race_touge', category: 'poi', x: 200, z: 90, symbol: 'T', color: '#00e5ff' },
    { id: 'race_tokyo', name: 'Tokyo Night Street Race', type: 'race_street', category: 'poi', x: 80, z: 180, symbol: 'R', color: '#aa00ff' },
    { id: 'race_kyoto', name: 'Kyoto Road Race', type: 'race_road', category: 'poi', x: -180, z: 60, symbol: 'K', color: '#ffcc00' },
    { id: 'barn_skyline', name: 'Barn Find: Skyline GT-R R32', type: 'barn', category: 'collectible', x: -210, z: -80, symbol: 'B', color: '#ffaa00' },
    { id: 'board_xp', name: 'Bonus Board 5000 XP', type: 'board', category: 'collectible', x: 110, z: -50, symbol: 'X', color: '#00ffcc' },
    { id: 'mascot_ramen', name: 'Japan Mascot: Ramen', type: 'mascot', category: 'collectible', x: 40, z: -90, symbol: 'M', color: '#ff9966' },
    { id: 'mascot_matcha', name: 'Japan Mascot: Matcha', type: 'mascot', category: 'collectible', x: -90, z: 30, symbol: 'M', color: '#66ff99' }
];

// Dynamically load local JSON POIs if available
if (typeof fetch !== 'undefined') {
    var jsonUrls = [
        '../shared/assets/japan_pois.json',
        './shared/assets/japan_pois.json',
        'shared/assets/japan_pois.json',
        '../../shared/assets/japan_pois.json'
    ];
    var loadJson = function (index) {
        if (index >= jsonUrls.length) return;
        fetch(jsonUrls[index])
            .then(function (res) { return res.json(); })
            .then(function (data) {
                if (data && Array.isArray(data.pois) && data.pois.length > 0) {
                    JAPAN_POIS = data.pois;
                }
                if (data && data.calibration) {
                    if (data.calibration.centerX !== undefined) MAP_CALIBRATION.centerX = data.calibration.centerX;
                    if (data.calibration.centerY !== undefined) MAP_CALIBRATION.centerY = data.calibration.centerY;
                    if (data.calibration.scaleX !== undefined) MAP_CALIBRATION.scaleX = data.calibration.scaleX;
                    if (data.calibration.scaleZ !== undefined) MAP_CALIBRATION.scaleZ = data.calibration.scaleZ;
                }
            })
            .catch(function () {
                loadJson(index + 1);
            });
    };
    loadJson(0);
}

/**
 * Custom POIs Setter for Runtime/External overrides
 * @param {Array} poisList
 */
export function setCustomPOIs(poisList) {
    if (Array.isArray(poisList) && poisList.length > 0) {
        JAPAN_POIS = poisList;
    }
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

    // Extract position X and Z
    var rawX = data ? (data.PositionX !== undefined ? data.PositionX : (data.x || 0)) : 0;
    var rawZ = data ? (data.PositionZ !== undefined ? data.PositionZ : (data.z !== undefined ? data.z : (data.PositionY || 0))) : 0;
    var speed = data ? (data.SpeedMetersPerSecond !== undefined ? data.SpeedMetersPerSecond * 3.6 : (data.speed || 0)) : 0;

    // World Orientation Heading Angle (Yaw Angle in Radians)
    var yawAngle = 0;
    if (data && data.Yaw !== undefined) {
        yawAngle = data.Yaw;
    } else if (data && data.yaw !== undefined) {
        yawAngle = data.yaw;
    } else if (data && data.NormalizedYaw !== undefined) {
        yawAngle = data.NormalizedYaw * Math.PI;
    }

    // Config toggles
    var elements = (config && config.elements) || (typeof window !== 'undefined' && window._currentHudElements) || {};
    var showPOIs = elements.showLiveMapPOIs !== false;
    var showPRStunts = elements.showLiveMapPRStunts !== false;
    var showCollectibles = elements.showLiveMapCollectibles !== false;
    var showHeading = elements.showLiveMapHeading !== false;

    // DEMO mode simulated track if no data
    if ((!data || (rawX === 0 && rawZ === 0)) && (typeof window !== 'undefined' && window.demoActive)) {
        var t = (Date.now() / 1000) * 0.8;
        rawX = Math.sin(t) * 180 + Math.cos(t * 2.1) * 40;
        rawZ = Math.cos(t * 0.9) * 140 + Math.sin(t * 1.5) * 30;
        speed = 85 + Math.sin(t * 1.2) * 30;
        yawAngle = t % (Math.PI * 2);
    }

    // Append to persistent position history if vehicle moved > 0.3m
    if (Math.abs(rawX) > 0.01 || Math.abs(rawZ) > 0.01) {
        var shouldPush = false;
        if (posHistory.length === 0) {
            shouldPush = true;
        } else {
            var lastP = posHistory[posHistory.length - 1];
            var distMoved = Math.hypot(rawX - lastP.x, rawZ - lastP.z);
            if (distMoved > 0.3) {
                shouldPush = true;
            }
        }

        if (shouldPush) {
            var isDrift = data && (data.TireSlipRatio ? Math.max.apply(null, data.TireSlipRatio) > 0.4 : speed > 20);
            posHistory.push({ x: rawX, z: rawZ, drift: isDrift, time: Date.now() });
            if (posHistory.length > MAX_MAP_HISTORY) {
                posHistory.shift();
            }
        }

        // Dynamically compute World Movement Angle from position history delta
        if (posHistory.length > 1) {
            var lastP2 = posHistory[posHistory.length - 1];
            var prevP2 = posHistory[posHistory.length - 2];
            var dxWorld = lastP2.x - prevP2.x;
            var dzWorld = lastP2.z - prevP2.z;
            if (Math.hypot(dxWorld, dzWorld) > 0.05) {
                yawAngle = Math.atan2(dxWorld, dzWorld);
            }
        }
    }

    // ── 2. Auto Range Normalization & Viewport Bounds ─────────────────────────
    var viewRadiusMeters = 250.0; // Viewport radius around vehicle (meters)
    var minX = rawX - viewRadiusMeters;
    var maxX = rawX + viewRadiusMeters;
    var minZ = rawZ - viewRadiusMeters;
    var maxZ = rawZ + viewRadiusMeters;

    var rangeX = maxX - minX;
    var rangeZ = maxZ - minZ;
    var padding = 20;

    function mapToCanvas(px, pz) {
        var cx = padding + ((px - minX) / rangeX) * (w - padding * 2);
        // Canvas Y is inverted relative to World Z (+Z is UP)
        var cy = padding + (1.0 - (pz - minZ) / rangeZ) * (h - padding * 2);
        return { x: cx, y: cy };
    }

    // ── 1. Render Calibrated Zoomed Map Background Image ──────────────────────
    if (mapImageLoaded && mapImageAsset && !mapImageFailed && mapImageAsset.width > 0) {
        ctx.save();

        var imgW = mapImageAsset.width;
        var imgH = mapImageAsset.height;

        var cx = MAP_CALIBRATION.centerX;
        var cy = MAP_CALIBRATION.centerY;
        var sxScale = MAP_CALIBRATION.scaleX;
        var szScale = MAP_CALIBRATION.scaleZ;

        // Current vehicle image pixel coordinates
        var carPxX = cx + (rawX / sxScale);
        var carPxY = cy + (rawZ / szScale);

        // Size of cropped viewport in source image pixels for 250m radius
        var sw = (rangeX / Math.abs(sxScale));
        var sh = (rangeZ / Math.abs(szScale));

        // Crop top-left origin
        var sx = carPxX - sw / 2;
        var sy = carPxY - sh / 2;

        // Clamp crop bounds within image bounds
        if (sx < 0) sx = 0;
        if (sy < 0) sy = 0;
        if (sx + sw > imgW) sx = imgW - sw;
        if (sy + sh > imgH) sy = imgH - sh;

        ctx.drawImage(mapImageAsset, sx, sy, sw, sh, 0, 0, w, h);
        ctx.restore();
    } else {
        // Fallback Cyber Grid
        ctx.save();
        ctx.fillStyle = 'rgba(8, 12, 22, 0.94)';
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = 'rgba(0, 240, 255, 0.08)';
        ctx.lineWidth = 1;
        var gridSize = 20;
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

        ctx.strokeStyle = 'rgba(0, 240, 255, 0.12)';
        ctx.lineWidth = 1;
        var cxCenter = w / 2;
        var cyCenter = h / 2;
        for (var r = 40; r <= 120; r += 40) {
            ctx.beginPath();
            ctx.arc(cxCenter, cyCenter, r, 0, Math.PI * 2);
            ctx.stroke();
        }

        if (typeof ctx.setLineDash === 'function') {
            ctx.strokeStyle = 'rgba(0, 240, 255, 0.15)';
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            if (typeof ctx.ellipse === 'function') {
                ctx.ellipse(cxCenter - 20, cyCenter + 10, 60, 35, Math.PI / 6, 0, Math.PI * 2);
            } else {
                ctx.arc(cxCenter - 20, cyCenter + 10, 45, 0, Math.PI * 2);
            }
            ctx.stroke();
            ctx.setLineDash([]);
        }
        ctx.restore();
    }

    // ── 3. Render Japan Map POI Markers & Proximity Alert ───────────────────
    var nearestPoi = null;
    var nearestDist = Infinity;

    for (var poiIndex = 0; poiIndex < JAPAN_POIS.length; poiIndex++) {
        var poi = JAPAN_POIS[poiIndex];
        var isAllowed = (poi.category === 'poi' && showPOIs) ||
                        (poi.category === 'pr_stunt' && showPRStunts) ||
                        (poi.category === 'collectible' && showCollectibles);

        var dist = Math.hypot(rawX - poi.x, rawZ - poi.z);
        if (dist < nearestDist) {
            nearestDist = dist;
            nearestPoi = poi;
        }

        if (isAllowed) {
            var pt = mapToCanvas(poi.x, poi.z);
            if (pt.x >= 5 && pt.x <= w - 5 && pt.y >= 5 && pt.y <= h - 5) {
                ctx.save();
                // POI marker ring
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, 7, 0, Math.PI * 2);
                ctx.fillStyle = poi.color || '#00f0ff';
                ctx.globalAlpha = 0.90;
                ctx.fill();
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = '#ffffff';
                ctx.stroke();

                // Symbol text
                ctx.font = 'bold 9px monospace';
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(poi.symbol || '*', pt.x, pt.y);

                // Small POI label
                ctx.font = '8px monospace';
                ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
                ctx.textAlign = 'center';
                ctx.fillText(poi.name.length > 14 ? poi.name.substring(0, 12) + '..' : poi.name, pt.x, pt.y + 12);
                ctx.restore();
            }
        }
    }

    // Update Proximity Banner (#tcLiveMapNearby) - Strictly No Emojis
    var nearbyEl = document.getElementById('tcLiveMapNearby');
    if (nearbyEl) {
        if (nearestPoi && nearestDist <= 250) {
            var newText = 'NEARBY: ' + nearestPoi.name + ' (' + Math.round(nearestDist) + 'm)';
            if (nearbyEl.innerText !== newText) {
                nearbyEl.innerText = newText;
            }
            if (nearbyEl.style.display !== 'block') {
                nearbyEl.style.display = 'block';
            }
        } else {
            if (nearbyEl.style.display !== 'none') {
                nearbyEl.style.display = 'none';
            }
        }
    }

    // ── 4. Render Track History Lines (Persistent Long History) ───────────────
    if (posHistory.length > 1) {
        ctx.save();
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (var j = 1; j < posHistory.length; j++) {
            var pPrev = mapToCanvas(posHistory[j - 1].x, posHistory[j - 1].z);
            var pCurr = mapToCanvas(posHistory[j].x, posHistory[j].z);

            ctx.beginPath();
            ctx.moveTo(pPrev.x, pPrev.y);
            ctx.lineTo(pCurr.x, pCurr.y);

            if (posHistory[j].drift) {
                ctx.strokeStyle = 'rgba(255, 120, 0, 0.9)';
            } else {
                ctx.strokeStyle = 'rgba(0, 240, 255, 0.85)';
            }
            ctx.stroke();
        }
        ctx.restore();
    }

    // ── 5. Render Current Vehicle Cursor (Directional Arrow & Compass) ───────
    var currPos = mapToCanvas(rawX, rawZ);
    ctx.save();

    if (showHeading && typeof ctx.translate === 'function' && typeof ctx.rotate === 'function') {
        // Render Directional Cursor Arrow aligned with World Heading yawAngle
        ctx.translate(currPos.x, currPos.y);
        ctx.rotate(yawAngle);

        ctx.beginPath();
        ctx.moveTo(0, -9); // Arrow nose points UP (-Y)
        ctx.lineTo(7, 7);
        ctx.lineTo(0, 4);
        ctx.lineTo(-7, 7);
        ctx.closePath();

        ctx.fillStyle = '#00f0ff';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
    } else {
        // Standard circle cursor
        ctx.beginPath();
        ctx.arc(currPos.x, currPos.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#00f0ff';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
    }

    ctx.restore();

    // Pulse ring around cursor
    ctx.save();
    var pulseR = 8 + (Date.now() % 1000) / 1000 * 8;
    ctx.beginPath();
    ctx.arc(currPos.x, currPos.y, pulseR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 240, 255, ' + (1 - pulseR / 16) + ')';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // Compass Overlay Indicators (N/S/E/W)
    if (showHeading) {
        ctx.save();
        ctx.font = 'bold 9px monospace';
        ctx.fillStyle = 'rgba(0, 240, 255, 0.7)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('N', w / 2, 10);
        ctx.fillText('S', w / 2, h - 8);
        ctx.fillText('W', 10, h / 2);
        ctx.fillText('E', w - 10, h / 2);
        ctx.restore();
    }

    // Update coordinate readout if element exists
    var coordEl = document.getElementById('tcLiveMapCoord');
    if (coordEl) {
        var newCoordText = 'X:' + Math.round(rawX) + ' Z:' + Math.round(rawZ);
        if (coordEl.innerText !== newCoordText) {
            coordEl.innerText = newCoordText;
        }
    }
}
