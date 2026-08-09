window.registerS650Style = function(styleId) {
    var canvas = document.getElementById('s650Canvas');
    var ctx = canvas ? canvas.getContext('2d') : null;
    var isReady = Boolean(ctx);
    var sweepPending = false;

    var currentTheme = 'normal';
    var isHeadlightsOn = true;
    var isMetricUnit = true;
    var lastFrame = { rpm: 0, maxRpm: 8000, speed_kmh: 0, speed_mph: 0, gear: 11 };

    function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }
    function mix(a, b, amt) { return a + (b - a) * clamp(amt, 0, 1); }
    function degToRad(deg) { return deg * (Math.PI / 180); }
    function normalizeTheme(theme) {
        var validThemes = ['normal', 'sport', 'track', 'calm', 'foxbody', 'heritage67', 'svt_cobra'];
        return validThemes.indexOf(theme) >= 0 ? theme : 'normal';
    }

    // The coordinator supplies both canonical speed fields and a unit-aware
    // `speed` field. Prefer the canonical fields so a HUD unit switch cannot
    // accidentally convert an already-converted value a second time.
    function getSpeed(data) {
        data = data || {};
        if (isMetricUnit) {
            if (data.speed_kmh !== undefined) return Number(data.speed_kmh) || 0;
            if (data.speed_mps !== undefined) return (Number(data.speed_mps) || 0) * 3.6;
            return Number(data.speed) || 0;
        }

        if (data.speed_mph !== undefined) return Number(data.speed_mph) || 0;
        if (data.speed_kmh !== undefined) return (Number(data.speed_kmh) || 0) * 0.621371;
        return Number(data.speed) || 0;
    }

    function getMaxRpm(data) {
        data = data || {};
        return Number(data.maxRpm ?? data.max_rpm) || 8000;
    }

    function getGearLabel(data, fallback) {
        var gear = data && data.gear;
        if (gear === 0) return 'R';
        if (gear === 11) return 'N';
        return gear !== undefined && gear !== null ? String(gear) : fallback;
    }

    function getSpeedUnitLabel() {
        return isMetricUnit ? 'KM/H' : 'MPH';
    }

    // 1. FOX BODY 1987-1993
    function drawFoxBodyTheme(data, time) {
        var speed = getSpeed(data);
        var rpm = data.rpm || 0;
        var maxRpm = getMaxRpm(data);

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

        drawAnalogDial(ctx, 360, 120, 95, 0, 180, speed, mainColor, needleColor, 'FoxBodyRetro', getSpeedUnitLabel());
        drawAnalogDial(ctx, 900, 120, 95, 0, maxRpm / 1000, rpm / 1000, mainColor, needleColor, 'FoxBodyRetro', 'RPMx1000');

        ctx.font = '28px FoxBodyRetro, sans-serif';
        ctx.fillStyle = mainColor;
        ctx.textAlign = 'center';
        if (isHeadlightsOn) {
            ctx.shadowColor = '#00FF66';
            ctx.shadowBlur = 8;
        }
        var gearStr = getGearLabel(data, 'N');
        ctx.fillText("GEAR " + gearStr, 630, 110);
        ctx.font = '18px FoxBodyRetro, sans-serif';
        ctx.fillText("S650 FOXBODY", 630, 150);
        ctx.restore();
    }

    // 2. TRACK
    function drawTrackTheme(data, time) {
        var rpm = data.rpm || 0;
        var maxRpm = getMaxRpm(data);
        var rpmRatio = clamp(rpm / maxRpm, 0, 1);
        var gear = getGearLabel(data, '1');
        var speed = Math.round(getSpeed(data));

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
        var speed = getSpeed(data);
        var rpm = data.rpm || 0;
        var maxRpm = getMaxRpm(data);

        ctx.save();
        ctx.fillStyle = '#12100e';
        ctx.fillRect(0, 0, 1260, 240);

        drawChromeRing(ctx, 360, 120, 102);
        drawChromeRing(ctx, 900, 120, 102);

        drawAnalogDial(ctx, 360, 120, 90, 0, 140, speed, '#f5e8c8', '#e63946', 'MustangHeritage1967', getSpeedUnitLabel());
        drawAnalogDial(ctx, 900, 120, 90, 0, maxRpm, rpm, '#f5e8c8', '#e63946', 'MustangHeritage1967', 'RPM');

        ctx.restore();
    }

    // S650 HMI modes. Each mode changes the instrument presentation while the
    // host continues to expose one HMI style to the rest of the application.
    function drawGenericTheme(data, time, theme) {
        var rpm = data.rpm || 0;
        var maxRpm = getMaxRpm(data);
        var speed = Math.round(getSpeed(data));
        var gear = getGearLabel(data, '1');

        var palette = {
            normal: { background: '#101820', dial: '#c7f4ff', needle: '#29d8ff', text: '#f4fbff' },
            sport: { background: '#1c1012', dial: '#ffd2cc', needle: '#ff4438', text: '#fff7f5' },
            svt_cobra: { background: isHeadlightsOn ? '#111111' : '#f5f5f5', dial: isHeadlightsOn ? '#ffffff' : '#171717', needle: '#e63946', text: isHeadlightsOn ? '#ffffff' : '#111111' },
            calm: { background: '#0d1117', dial: '#d6e4f0', needle: '#7cc7ff', text: '#f3f7fb' }
        }[theme] || { background: '#111111', dial: '#ffffff', needle: '#e63946', text: '#ffffff' };

        ctx.save();
        ctx.fillStyle = palette.background;
        ctx.fillRect(0, 0, 1260, 240);

        ctx.font = 'bold 32px MustangModernDigits, sans-serif';
        ctx.fillStyle = palette.text;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (theme === 'calm') {
            ctx.font = 'bold 64px MustangModernDigits, sans-serif';
            ctx.fillText(speed.toString(), 630, 120);
            ctx.font = 'bold 24px MustangModernDigits, sans-serif';
            ctx.fillText(getSpeedUnitLabel(), 630, 170);
        } else {
            drawAnalogDial(ctx, 360, 120, 90, 0, 140, speed, palette.dial, palette.needle, 'MustangModernDigits', getSpeedUnitLabel());
            drawAnalogDial(ctx, 900, 120, 90, 0, maxRpm, rpm, palette.dial, palette.needle, 'MustangModernDigits', 'RPM');
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
                if (payload.s650Theme !== undefined) {
                    var nextTheme = normalizeTheme(payload.s650Theme);
                    if (nextTheme !== currentTheme) {
                        currentTheme = nextTheme;
                        renderMustang(lastFrame);
                    }
                }
            }
        },
        onElementsChange: function (elements) {
            var c = document.getElementById('s650Container');
            if (c) c.style.display = elements.showGauge === false ? 'none' : 'block';
        },
        onFrame: function (data, payload) {
            if (payload) {
                if (payload.headlights !== undefined) isHeadlightsOn = payload.headlights;
                if (payload.isMetric !== undefined) isMetricUnit = payload.isMetric !== false;
            }
            lastFrame = data || lastFrame;
            if (!sweepActive) renderMustang(lastFrame);
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
    renderMustang(lastFrame);
};
