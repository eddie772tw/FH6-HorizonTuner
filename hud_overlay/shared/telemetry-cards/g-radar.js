// =============================================================================
// hud_overlay/shared/telemetry-cards/g-radar.js
// G-Force Radar Sub-Renderer (Center Circular Cluster)
// =============================================================================

export function renderGRadar(data, gHist, now, domCache) {
    var rawAccX = data.accel_x !== undefined ? data.accel_x : (data.AccelerationX || 0);
    var rawAccZ = data.accel_z !== undefined ? data.accel_z : (data.AccelerationZ || 0);
    var lat = -rawAccX / 9.81; // Invert X axis (lateral G) per user requirement
    var lon = rawAccZ / 9.81;  // Keep Y axis (longitudinal G: BRAKE on top)

    var gCircle = domCache ? domCache.gCircle : document.getElementById('tcGRadarCircle');
    var dot = domCache ? domCache.gDot : document.getElementById('tcGDot');
    if (gCircle && dot) {
        var radius = gCircle.clientWidth / 2;
        var maxGRadius = Math.max(0, radius - 4);
        var xPx = (lat / 2) * radius;
        var yPx = (lon / 2) * radius;
        var gDist = Math.sqrt(xPx * xPx + yPx * yPx);
        if (gDist > maxGRadius && gDist > 0) {
            xPx = (xPx / gDist) * maxGRadius;
            yPx = (yPx / gDist) * maxGRadius;
        }
        dot.style.transform = 'translate(' + xPx + 'px, ' + yPx + 'px)';
    }

    var latEl = domCache ? domCache.latEl : document.getElementById('tcLatG'); if (latEl) latEl.textContent = Math.abs(lat).toFixed(2);
    var lonEl = domCache ? domCache.lonEl : document.getElementById('tcLonG'); if (lonEl) lonEl.textContent = Math.abs(lon).toFixed(2);

    // Update 30s history & peak markers
    if (gHist.length < 900) {
        gHist.push({ lat: lat, lon: lon, time: now });
    } else {
        var oldG = gHist.shift();
        if (oldG) { oldG.lat = lat; oldG.lon = lon; oldG.time = now; gHist.push(oldG); }
    }

    var markersContainer = domCache ? domCache.markersContainer : document.getElementById('tcGMarkers');
    if (markersContainer && gCircle) {
        var radiusPx = gCircle.clientWidth / 2;
        var maxMRadius = Math.max(0, radiusPx - 4);

        if (gHist.length > 0 && Math.random() < 0.2) {
            var maxLatL = { lat: 0, lon: 0 }, maxLatR = { lat: 0, lon: 0 };
            var maxLonB = { lat: 0, lon: 0 }, maxLonA = { lat: 0, lon: 0 };
            var maxL_B  = { lat: 0, lon: 0 }, maxL_A  = { lat: 0, lon: 0 };
            var maxR_B  = { lat: 0, lon: 0 }, maxR_A  = { lat: 0, lon: 0 };

            var hasRecent = false;
            for (var i = 0; i < gHist.length; i++) {
                var p = gHist[i];
                if (now - p.time <= 30000) {
                    hasRecent = true;
                    if (p.lat < maxLatL.lat) maxLatL = p;
                    if (p.lat > maxLatR.lat) maxLatR = p;
                    if (p.lon < maxLonB.lon) maxLonB = p;
                    if (p.lon > maxLonA.lon) maxLonA = p;
                    if (p.lat < 0 && p.lon < 0 && (p.lat + p.lon < maxL_B.lat + maxL_B.lon)) maxL_B = p;
                    if (p.lat < 0 && p.lon > 0 && (p.lat - p.lon < maxL_A.lat - maxL_A.lon)) maxL_A = p;
                    if (p.lat > 0 && p.lon < 0 && (p.lat - p.lon > maxR_B.lat - maxR_B.lon)) maxR_B = p;
                    if (p.lat > 0 && p.lon > 0 && (p.lat + p.lon > maxR_A.lat + maxR_A.lon)) maxR_A = p;
                }
            }

            if (hasRecent) {
                markersContainer.innerHTML = '';
                var points = [maxLatL, maxLatR, maxLonB, maxLonA, maxL_B, maxL_A, maxR_B, maxR_A];
                for (var j = 0; j < points.length; j++) {
                    var pt = points[j];
                    if (pt.lat === 0 && pt.lon === 0) continue;

                    var mDot = document.createElement('div');
                    mDot.style.position = 'absolute';
                    mDot.style.width = '6px';
                    mDot.style.height = '6px';
                    mDot.style.borderRadius = '50%';
                    mDot.style.background = 'rgba(255,255,255,0.5)';

                    var mx = (pt.lat / 2) * radiusPx;
                    var my = (pt.lon / 2) * radiusPx;
                    var mDist = Math.sqrt(mx * mx + my * my);
                    if (mDist > maxMRadius && mDist > 0) {
                        mx = (mx / mDist) * maxMRadius;
                        my = (my / mDist) * maxMRadius;
                    }
                    mDot.style.left = (radiusPx + mx - 3) + 'px';
                    mDot.style.top = (radiusPx + my - 3) + 'px';
                    markersContainer.appendChild(mDot);
                }
            }
        }
    }
}
