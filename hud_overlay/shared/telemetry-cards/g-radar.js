// =============================================================================
// hud_overlay/shared/telemetry-cards/g-radar.js
// G-Force Radar Sub-Renderer (Center Circular Cluster)
// =============================================================================

export function renderGRadar(data, gHist, now) {
    var rawAccX = data.accel_x !== undefined ? data.accel_x : (data.AccelerationX || 0);
    var rawAccZ = data.accel_z !== undefined ? data.accel_z : (data.AccelerationZ || 0);
    var lat = -rawAccX / 9.81; // Invert X axis (lateral G) per user requirement
    var lon = rawAccZ / 9.81;  // Keep Y axis (longitudinal G: BRAKE on top)

    var gCircle = document.getElementById('tcGRadarCircle');
    var dot = document.getElementById('tcGDot');
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

    var latEl = document.getElementById('tcLatG'); if (latEl) latEl.textContent = Math.abs(lat).toFixed(2);
    var lonEl = document.getElementById('tcLonG'); if (lonEl) lonEl.textContent = Math.abs(lon).toFixed(2);

    // Update 30s history & peak markers
    if (gHist.length < 900) {
        gHist.push({ lat: lat, lon: lon, time: now });
    } else {
        var oldG = gHist.shift();
        if (oldG) { oldG.lat = lat; oldG.lon = lon; oldG.time = now; gHist.push(oldG); }
    }

    var markersContainer = document.getElementById('tcGMarkers');
    if (markersContainer && gCircle) {
        var radiusPx = gCircle.clientWidth / 2;
        var maxMRadius = Math.max(0, radiusPx - 4);
        var recent30s = gHist.filter(function (p) { return now - p.time <= 30000; });
        if (recent30s.length > 0 && Math.random() < 0.2) {
            var maxL = 0, maxR = 0, maxB = 0, maxA = 0;
            recent30s.forEach(function (p) {
                if (p.lat < maxL) maxL = p.lat;
                if (p.lat > maxR) maxR = p.lat;
                if (p.lon < maxB) maxB = p.lon;
                if (p.lon > maxA) maxA = p.lon;
            });
            markersContainer.innerHTML = '';
            var points = [
                { lat: maxL, lon: 0 }, { lat: maxR, lon: 0 },
                { lat: 0, lon: maxB }, { lat: 0, lon: maxA }
            ];
            points.forEach(function (p) {
                var mDot = document.createElement('div');
                mDot.style.position = 'absolute';
                mDot.style.width = '18px';
                mDot.style.height = '18px';
                mDot.style.borderRadius = '50%';
                mDot.style.background = 'rgba(255,255,255,0.4)';
                var mx = (p.lat / 2) * radiusPx;
                var my = (p.lon / 2) * radiusPx;
                var mDist = Math.sqrt(mx * mx + my * my);
                if (mDist > maxMRadius && mDist > 0) {
                    mx = (mx / mDist) * maxMRadius;
                    my = (my / mDist) * maxMRadius;
                }
                mDot.style.left = (radiusPx + mx - 9) + 'px';
                mDot.style.top = (radiusPx + my - 9) + 'px';
                markersContainer.appendChild(mDot);
            });
        }
    }
}
