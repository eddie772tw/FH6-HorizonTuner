window.registerS650Style = function(styleId, themeName) {
    var canvas = document.getElementById('s650Canvas');
    var ctx = canvas ? canvas.getContext('2d') : null;
    var images = {};
    var isReady = false;
    var sweepPending = false;

    // Mustang S650 asset map
    var assetMap = {
        bg_normal: "../assets/img/s650/bg_normal.png",
        foxbody_day: "../assets/img/s650/foxbody_day.png",
        foxbody_night: "../assets/img/s650/foxbody_night.png",
        chrome_ring: "../assets/img/s650/chrome_ring.png",
        svt_dial: "../assets/img/s650/svt_white_dial.png",
        brake_gauge: "../assets/img/gauge_left.png",
        throttle_gauge: "../assets/img/gauge_right.png"
    };

    var keys = Object.keys(assetMap);
    var loaded = 0;
    keys.forEach(function (k) {
        var img = new Image();
        img.onload = img.onerror = function () {
            images[k] = img;
            loaded++;
            if (loaded >= keys.length) {
                isReady = true;
                if (sweepPending) {
                    sweepPending = false;
                    triggerSweep();
                }
            }
        };
        img.src = assetMap[k];
    });

    var currentTheme = themeName;
    var isHeadlightsOn = true;
    var isMetricUnit = true;

    function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }
    function mix(a, b, amt) { return a + (b - a) * clamp(amt, 0, 1); }
    function degToRad(deg) { return deg * (Math.PI / 180); }

    // 1. FOX BODY 1987-1993
    function drawFoxBodyTheme(data, time) {
        var speed = isMetricUnit ? (data.speed_kmh || data.speed || 0) : ((data.speed_kmh || data.speed || 0) * 0.621371);
        var rpm = data.rpm || 0;
        var maxRpm = data.maxRpm || 8000;

        var mainColor = isHeadlightsOn ? '#00FF66' : '#FFFFFF';
        var bgGlowColor = isHeadlightsOn ? 'rgba(0, 255, 102, 0.15)' : 'transparent';
        var needleColor = isHeadlightsOn ? '#FF3300' : '#FF5500';

        ctx.save();
        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, 1260, 240);

        if (isHeadlightsOn) {
            var radGrad = ctx.createRadialGradient(630, 120, 50, 630, 120, 500);
            radGrad.addColorStop(0, bgGlowColor);
            radGrad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = radGrad;
            ctx.fillRect(0, 0, 1260, 240);
        }

        drawAnalogDial(ctx, 360, 120, 95, 0, 180, speed, mainColor, needleColor, 'FoxBodyRetro', 'MPH');
        drawAnalogDial(ctx, 900, 120, 95, 0, maxRpm / 1000, rpm / 1000, mainColor, needleColor, 'FoxBodyRetro', 'RPMx1000');

        ctx.font = '28px FoxBodyRetro, sans-serif';
        ctx.fillStyle = mainColor;
        ctx.textAlign = 'center';
        if (isHeadlightsOn) {
            ctx.shadowColor = '#00FF66';
            ctx.shadowBlur = 8;
        }
        var gearStr = data.gear === 0 ? 'R' : (data.gear === 11 ? 'N' : (data.gear || 'N'));
        ctx.fillText("GEAR " + gearStr, 630, 110);
        ctx.font = '18px FoxBodyRetro, sans-serif';
        ctx.fillText("TRIP 087.3 MI", 630, 150);
        ctx.restore();
    }

    // 2. TRACK
    function drawTrackTheme(data, time) {
        var rpm = data.rpm || 0;
        var maxRpm = data.maxRpm || 8000;
        var rpmRatio = clamp(rpm / maxRpm, 0, 1);
        var gear = data.gear === 0 ? 'R' : (data.gear === 11 ? 'N' : (data.gear || '1'));
        var speed = Math.round(isMetricUnit ? (data.speed_kmh || data.speed || 0) : ((data.speed_kmh || data.speed || 0) * 0.621371));

        ctx.save();
        ctx.fillStyle = '#0a0b0d';
        ctx.fillRect(0, 0, 1260, 240);

        var barX = 130, barY = 30, barW = 1000, barH = 45;
        ctx.fillStyle = '#1e222a';
        ctx.fillRect(barX, barY, barW, barH);

        var fillW = barW * rpmRatio;
        var grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
        grad.addColorStop(0, '#00ccff');
        grad.addColorStop(0.6, '#ffaa00');
        grad.addColorStop(0.85, '#ff2200');

        ctx.fillStyle = grad;
        ctx.fillRect(barX, barY, fillW, barH);

        if (rpmRatio >= 0.94 && Math.floor((time || performance.now() / 1000) * 12) % 2 === 0) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.fillRect(barX, barY, barW, barH);
        }

        ctx.strokeStyle = '#0a0b0d';
        ctx.lineWidth = 3;
        for (var i = 1; i < 8; i++) {
            var gx = barX + (barW / 8) * i;
            ctx.beginPath();
            ctx.moveTo(gx, barY);
            ctx.lineTo(gx, barY + barH);
            ctx.stroke();

            ctx.font = 'bold 14px MustangModernDigits, sans-serif';
            ctx.fillStyle = '#888888';
            ctx.fillText(i.toString(), gx - 15, barY + barH + 18);
        }

        ctx.font = 'bold 110px MustangModernDigits, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(gear.toString(), 630, 145);

        ctx.font = 'bold 42px MustangModernDigits, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(speed.toString(), barX, 145);
        ctx.font = '16px MustangModernDigits, sans-serif';
        ctx.fillStyle = '#888888';
        ctx.fillText(isMetricUnit ? 'KM/H' : 'MPH', barX, 175);

        ctx.restore();
    }

    // 3. HERITAGE 1967-1968
    function drawHeritage67Theme(data) {
        var speed = isMetricUnit ? (data.speed_kmh || data.speed || 0) : ((data.speed_kmh || data.speed || 0) * 0.621371);
        var rpm = data.rpm || 0;

        ctx.save();
        ctx.fillStyle = '#12100e';
        ctx.fillRect(0, 0, 1260, 240);

        drawChromeRing(ctx, 360, 120, 102);
        drawChromeRing(ctx, 900, 120, 102);

        drawAnalogDial(ctx, 360, 120, 90, 0, 140, speed, '#f5e8c8', '#e63946', 'MustangHeritage1967', 'MPH');
        drawAnalogDial(ctx, 900, 120, 90, 0, 8000, rpm, '#f5e8c8', '#e63946', 'MustangHeritage1967', 'RPM');

        ctx.restore();
    }

    // NORMAL, SPORT, CALM, SVT_COBRA (using Foxbody as a fallback for ones not fully detailed in the prompt, or basic implementations)
    function drawGenericTheme(data, time, theme) {
        var rpm = data.rpm || 0;
        var maxRpm = data.maxRpm || 8000;
        var speed = Math.round(isMetricUnit ? (data.speed_kmh || data.speed || 0) : ((data.speed_kmh || data.speed || 0) * 0.621371));
        var gear = data.gear === 0 ? 'R' : (data.gear === 11 ? 'N' : (data.gear || '1'));

        ctx.save();
        ctx.fillStyle = theme === 'calm' ? '#0d1117' : (theme === 'svt_cobra' && !isHeadlightsOn ? '#ffffff' : '#111');
        ctx.fillRect(0, 0, 1260, 240);

        ctx.font = 'bold 32px MustangModernDigits, sans-serif';
        ctx.fillStyle = theme === 'svt_cobra' && !isHeadlightsOn ? '#000000' : '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (theme === 'calm') {
            ctx.font = 'bold 64px MustangModernDigits, sans-serif';
            ctx.fillText(speed.toString(), 630, 120);
            ctx.font = 'bold 24px MustangModernDigits, sans-serif';
            ctx.fillText(isMetricUnit ? 'KM/H' : 'MPH', 630, 170);
        } else {
            drawAnalogDial(ctx, 360, 120, 90, 0, 140, speed, theme === 'svt_cobra' && !isHeadlightsOn ? '#000' : '#fff', '#e63946', 'MustangModernDigits', isMetricUnit ? 'KM/H' : 'MPH');
            drawAnalogDial(ctx, 900, 120, 90, 0, 8000, rpm, theme === 'svt_cobra' && !isHeadlightsOn ? '#000' : '#fff', '#e63946', 'MustangModernDigits', 'RPM');
            ctx.fillText("GEAR " + gear, 630, 120);
        }

        ctx.restore();
    }


    function drawAnalogDial(ctx, cx, cy, radius, minVal, maxVal, curVal, color, needleColor, fontFam, label) {
        ctx.save();
        ctx.translate(cx, cy);

        var startAngle = degToRad(135);
        var endAngle = degToRad(405);
        var totalSteps = 10;

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        if (isHeadlightsOn && currentTheme === 'foxbody') {
            ctx.shadowColor = color;
            ctx.shadowBlur = 6;
        }

        for (var i = 0; i <= totalSteps; i++) {
            var stepRatio = i / totalSteps;
            var angle = startAngle + stepRatio * (endAngle - startAngle);
            var x1 = Math.cos(angle) * (radius - 8);
            var y1 = Math.sin(angle) * (radius - 8);
            var x2 = Math.cos(angle) * radius;
            var y2 = Math.sin(angle) * radius;

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();

            var tx = Math.cos(angle) * (radius - 24);
            var ty = Math.sin(angle) * (radius - 24);
            var numVal = Math.round(mix(minVal, maxVal, stepRatio));
            ctx.font = '16px ' + fontFam + ', sans-serif';
            ctx.fillStyle = color;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(numVal.toString(), tx, ty);
        }

        ctx.font = '12px ' + fontFam + ', sans-serif';
        ctx.fillText(label, 0, radius - 45);

        var valRatio = clamp((curVal - minVal) / (maxVal - minVal), 0, 1);
        var needleAngle = startAngle + valRatio * (endAngle - startAngle);

        ctx.rotate(needleAngle);
        ctx.beginPath();
        ctx.moveTo(-4, 0);
        ctx.lineTo(0, -radius + 10);
        ctx.lineTo(4, 0);
        ctx.closePath();
        ctx.fillStyle = needleColor;
        ctx.shadowBlur = 0;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, Math.PI * 2);
        ctx.fillStyle = '#111111';
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.stroke();

        ctx.restore();
    }

    function drawChromeRing(ctx, cx, cy, r) {
        ctx.save();
        var ringGrad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.8, cx, cy, r);
        ringGrad.addColorStop(0, '#ffffff');
        ringGrad.addColorStop(0.5, '#777777');
        ringGrad.addColorStop(0.8, '#222222');
        ringGrad.addColorStop(1, '#aaaaaa');

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.lineWidth = 8;
        ctx.strokeStyle = ringGrad;
        ctx.stroke();
        ctx.restore();
    }

    function renderMustang(data, time) {
        if (!ctx || !isReady) return;
        ctx.clearRect(0, 0, 1260, 240);

        switch (currentTheme) {
            case 'foxbody':
                drawFoxBodyTheme(data, time);
                break;
            case 'track':
                drawTrackTheme(data, time);
                break;
            case 'heritage67':
                drawHeritage67Theme(data);
                break;
            case 'normal':
            case 'sport':
            case 'calm':
            case 'svt_cobra':
                drawGenericTheme(data, time, currentTheme);
                break;
            default:
                drawFoxBodyTheme(data, time);
                break;
        }
    }

    var sweepActive = false;
    function triggerSweep() {
        if (sweepActive) return;
        sweepActive = true;
        var startTime = performance.now();
        var duration = 1400;
        var maxRpm = 8000;

        function animate(now) {
            var elapsed = now - startTime;
            var progress = Math.min(1.0, elapsed / duration);
            var mockRpm = 0;

            if (progress < 0.5) {
                mockRpm = maxRpm * Math.sin((progress / 0.5) * Math.PI / 2);
            } else {
                var p = (progress - 0.5) / 0.5;
                mockRpm = maxRpm * (1 - Math.sin(p * Math.PI / 2)) + 800 * Math.sin(p * Math.PI / 2);
            }

            renderMustang({
                rpm: mockRpm,
                maxRpm: maxRpm,
                speed: (mockRpm / maxRpm) * 160,
                gear: 3
            }, elapsed / 1000);

            if (progress < 1.0) {
                requestAnimationFrame(animate);
            } else {
                sweepActive = false;
            }
        }
        requestAnimationFrame(animate);
    }

    HUDCore.registerStyle(styleId, {
        containerId: 's650Container',
        scaleMultiplier: 1.0,
        onInit: function (payload) {
            if (payload) {
                if (payload.headlights !== undefined) isHeadlightsOn = payload.headlights;
                if (payload.isMetric !== undefined) isMetricUnit = payload.isMetric !== false;
            }
        },
        onElementsChange: function (elements) {
            var c = document.getElementById('s650Container');
            if (c) c.style.display = elements.showGauge === false ? 'none' : 'block';
        },
        onFrame: function (data, payload) {
            if (payload) {
                if (payload.headlights !== undefined) isHeadlightsOn = payload.headlights;
            }
            if (!sweepActive) renderMustang(data);
        },
        onAnimate: function () {
            if (isReady) {
                triggerSweep();
            } else {
                sweepPending = true;
            }
        }
    });

    HUDCore.init(styleId);
};
