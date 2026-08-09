/*
 * S650 Unified HMI MVP
 *
 * One HUD registration exposes the S650 themes through the s650Theme config
 * value. The renderer intentionally stays Canvas-only so 60 Hz telemetry does
 * not cause a DOM update for every frame.
 */
(function (window) {
    'use strict';

    var WIDTH = 1260;
    var HEIGHT = 240;
    var DEFAULT_MAX_RPM = 8000;
    var DEFAULT_REDLINE_RPM = 7000;
    var DEFAULT_SPEED_MAX = 360;
    var KMH_PER_MPS = 3.6;
    var MPH_PER_MPS = 2.23694;
    var THEMES = ['normal', 'sport', 'track', 'calm', 'foxbody', 'heritage67', 'svt_cobra'];

    var canvas = document.getElementById('s650Canvas');
    var ctx = canvas ? canvas.getContext('2d') : null;
    var container = document.getElementById('s650Container');
    var isReady = Boolean(ctx && canvas);
    var sweepPending = false;
    var sweepActive = false;
    var lastFrame = {
        rpm: 0,
        maxRpm: DEFAULT_MAX_RPM,
        redlineRpm: DEFAULT_REDLINE_RPM,
        speed_kmh: 0,
        speed_mph: 0,
        gear: 0,
        throttle: 0,
        brake: 0
    };
    var currentTheme = 'normal';
    var isMetricUnit = true;
    var showGauge = true;
    var showSpeed = true;
    var showGear = true;
    var showRPM = true;
    var lastRenderTime = 0;

    var PALETTES = {
        normal: {
            background: '#080b10',
            surface: '#101820',
            primary: '#29d8ff',
            secondary: '#8d99a6',
            text: '#f4f7fa',
            warning: '#ffb020',
            danger: '#ff2a2a'
        },
        sport: {
            background: '#12090b',
            surface: '#241114',
            primary: '#ff4438',
            secondary: '#d8a4a0',
            text: '#fff7f5',
            warning: '#ffb020',
            danger: '#ff2a2a'
        },
        track: {
            background: '#080a0d',
            surface: '#15191f',
            primary: '#ffffff',
            secondary: '#8d99a6',
            text: '#ffffff',
            warning: '#ffb020',
            danger: '#ff2a2a'
        },
        calm: {
            background: '#0d1117',
            surface: '#151c24',
            primary: '#7cc7ff',
            secondary: '#8d99a6',
            text: '#f3f7fb',
            warning: '#d9b45b',
            danger: '#d96565'
        },
        foxbody: {
            background: '#050b08',
            surface: '#0d1b13',
            primary: '#00ff66',
            secondary: '#86b79a',
            text: '#effff4',
            warning: '#ffb020',
            danger: '#ff5533'
        },
        heritage67: {
            background: '#12100e',
            surface: '#211d17',
            primary: '#f5e8c8',
            secondary: '#b7a98d',
            text: '#fff8e7',
            warning: '#d9a441',
            danger: '#e04b4b'
        },
        svt_cobra: {
            background: '#090a0d',
            surface: '#171a20',
            primary: '#dce7f2',
            secondary: '#8798a8',
            text: '#f8fbff',
            warning: '#ffb020',
            danger: '#e63946'
        }
    };

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function finiteNumber(value, fallback) {
        var number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function normalizeTheme(theme) {
        return THEMES.indexOf(theme) >= 0 ? theme : 'normal';
    }

    function paletteFor(theme) {
        return PALETTES[theme] || PALETTES.normal;
    }

    function readTheme(payload) {
        if (!payload || typeof payload !== 'object') return null;
        if (payload.s650Theme !== undefined) return payload.s650Theme;
        if (payload.data && payload.data.s650Theme !== undefined) return payload.data.s650Theme;
        return null;
    }

    function updateStateFromPayload(payload) {
        if (!payload || typeof payload !== 'object') return;

        var nextTheme = readTheme(payload);
        if (nextTheme !== null) {
            currentTheme = normalizeTheme(nextTheme);
        }

        if (payload.isMetric !== undefined) {
            isMetricUnit = payload.isMetric !== false;
        } else if (payload.data && payload.data.isMetric !== undefined) {
            isMetricUnit = payload.data.isMetric !== false;
        } else if (payload.unit === 'mph' || payload.unit === 'imperial') {
            isMetricUnit = false;
        } else if (payload.unit === 'kmh' || payload.unit === 'metric') {
            isMetricUnit = true;
        }

        var elements = payload.elements;
        if (!elements && payload.data && typeof payload.data === 'object') {
            elements = payload.data.elements;
        }
        updateElementVisibility(elements);
    }

    /*
     * Match the existing HUD convention: use coordinator-provided canonical
     * values first, then the unit-aware `speed` fallback, and only convert the
     * raw m/s field when older/demo payloads do not contain either value.
     * This prevents double conversion while keeping the HUD usable with a raw
     * telemetry payload.
     */
    function getSpeed(data) {
        data = data || {};
        var canonical = isMetricUnit ? data.speed_kmh : data.speed_mph;
        if (canonical !== undefined && canonical !== null) {
            return Math.max(0, finiteNumber(canonical, 0));
        }

        if (data.speed !== undefined && data.speed !== null) {
            return Math.max(0, finiteNumber(data.speed, 0));
        }

        var metersPerSecond = data.SpeedMetersPerSecond;
        if (metersPerSecond !== undefined && metersPerSecond !== null) {
            var conversion = isMetricUnit ? KMH_PER_MPS : MPH_PER_MPS;
            return Math.max(0, finiteNumber(metersPerSecond, 0) * conversion);
        }

        return 0;
    }

    function getRpm(data) {
        var value = data && data.rpm !== undefined ? data.rpm : data && data.CurrentEngineRpm;
        return Math.max(0, finiteNumber(value, 0));
    }

    function getMaxRpm(data) {
        var value = data && data.maxRpm !== undefined
            ? data.maxRpm
            : data && data.max_rpm !== undefined
                ? data.max_rpm
                : data && data.EngineMaxRpm;
        return Math.max(1, finiteNumber(value, DEFAULT_MAX_RPM));
    }

    function getRedlineRpm(data, payload) {
        var payloadRedline = payload && payload.redlineRpm;
        var dataRedline = data && data.redlineRpm;
        var maxRpm = getMaxRpm(data);
        var redline = finiteNumber(payloadRedline, finiteNumber(dataRedline, maxRpm - 1000));
        return clamp(redline, 1, maxRpm);
    }

    function getGearLabel(data) {
        var rawGear = data && data.gear !== undefined ? data.gear : data && data.Gear;
        if (rawGear === undefined || rawGear === null || rawGear === '') return '--';

        var gear = Number(rawGear);
        if (!Number.isFinite(gear) || gear < 0) return '--';
        if (gear === 0) return 'R';
        if (gear === 11) return 'N';
        return String(gear);
    }

    function getPedalValue(data, key) {
        if (data && data[key] !== undefined && data[key] !== null && data[key] !== '') {
            return clamp(finiteNumber(data[key], 0), 0, 1);
        }

        var rawKey = key === 'throttle' ? 'AccelInput' : (key === 'brake' ? 'BrakeInput' : null);
        if (rawKey && data && data[rawKey] !== undefined && data[rawKey] !== null) {
            return clamp(finiteNumber(data[rawKey], 0) / 255, 0, 1);
        }
        var legacyRawKey = key === 'throttle' ? 'Accel' : (key === 'brake' ? 'Brake' : null);
        if (legacyRawKey && data && data[legacyRawKey] !== undefined && data[legacyRawKey] !== null) {
            return clamp(finiteNumber(data[legacyRawKey], 0) / 255, 0, 1);
        }
        return 0;
    }

    function updateElementVisibility(elements) {
        if (!elements || typeof elements !== 'object') return;
        if (elements.showGauge !== undefined) showGauge = elements.showGauge !== false;
        if (elements.showSpeed !== undefined) showSpeed = elements.showSpeed !== false;
        if (elements.showGear !== undefined) showGear = elements.showGear !== false;
        if (elements.showRPM !== undefined) showRPM = elements.showRPM !== false;
        if (container && elements.showGauge !== undefined) {
            container.style.display = showGauge ? 'block' : 'none';
        }
    }

    function unitLabel() {
        return isMetricUnit ? 'KM/H' : 'MPH';
    }

    function roundedSpeed(data) {
        return Math.round(getSpeed(data));
    }

    function setFont(size, weight, family) {
        ctx.font = (weight || '700') + ' ' + size + 'px ' + (family || 'ForzaGear') + ', Arial, sans-serif';
    }

    function clearAndPaintBackground(palette) {
        ctx.clearRect(0, 0, WIDTH, HEIGHT);
        ctx.fillStyle = palette.background;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);

        var topFade = ctx.createLinearGradient(0, 0, 0, HEIGHT);
        topFade.addColorStop(0, 'rgba(255, 255, 255, 0.035)');
        topFade.addColorStop(0.52, 'rgba(255, 255, 255, 0)');
        topFade.addColorStop(1, 'rgba(0, 0, 0, 0.18)');
        ctx.fillStyle = topFade;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }

    function roundedRectPath(x, y, width, height, radius) {
        if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(x, y, width, height, radius);
            return;
        }

        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    function drawRoundedPanel(x, y, width, height, radius, fill, stroke) {
        ctx.beginPath();
        roundedRectPath(x, y, width, height, radius);
        ctx.fillStyle = fill;
        ctx.fill();
        if (stroke) {
            ctx.strokeStyle = stroke;
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }

    function drawArcGauge(cx, cy, radius, startAngle, endAngle, ratio, palette, label, value, unit, options) {
        options = options || {};
        var baseWidth = options.lineWidth || 9;
        var activeColor = options.activeColor || palette.primary;
        var redlineRatio = clamp(options.redlineRatio === undefined ? 1 : options.redlineRatio, 0, 1);
        var activeEnd = startAngle + (endAngle - startAngle) * clamp(ratio, 0, 1);
        var redlineStart = startAngle + (endAngle - startAngle) * redlineRatio;

        ctx.save();
        ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.arc(cx, cy, radius, startAngle, endAngle);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = baseWidth;
        ctx.stroke();

        if (redlineRatio < 1) {
            ctx.beginPath();
            ctx.arc(cx, cy, radius, redlineStart, endAngle);
            ctx.strokeStyle = palette.danger;
            ctx.globalAlpha = 0.72;
            ctx.lineWidth = baseWidth;
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        if (ratio > 0) {
            ctx.beginPath();
            ctx.arc(cx, cy, radius, startAngle, activeEnd);
            ctx.strokeStyle = activeColor;
            ctx.lineWidth = baseWidth;
            ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(cx, cy, radius - 19, startAngle, endAngle);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.stroke();

        setFont(11, '700');
        ctx.fillStyle = palette.secondary;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, cx, cy + radius - 31);

        setFont(options.valueSize || 24, '700', options.valueFamily || 'ForzaGear');
        ctx.fillStyle = palette.text;
        ctx.fillText(value, cx, cy + 2);

        if (unit) {
            setFont(10, '700');
            ctx.fillStyle = palette.secondary;
            ctx.fillText(unit, cx, cy + 25);
        }
        ctx.restore();
    }

    function drawPedalBars(data, palette, x, y, width, compact) {
        var throttle = getPedalValue(data, 'throttle');
        var brake = getPedalValue(data, 'brake');
        var barHeight = compact ? 5 : 7;
        var gap = compact ? 7 : 9;
        var labelSize = compact ? 9 : 10;

        ctx.save();
        setFont(labelSize, '700');
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillStyle = palette.secondary;
        ctx.fillText('THR', x, y + barHeight / 2);
        ctx.fillText('BRK', x, y + barHeight + gap + barHeight / 2);

        var barX = x + 31;
        var barWidth = width - 31;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(barX, y, barWidth, barHeight);
        ctx.fillRect(barX, y + barHeight + gap, barWidth, barHeight);

        ctx.fillStyle = palette.primary;
        ctx.fillRect(barX, y, barWidth * throttle, barHeight);
        ctx.fillStyle = palette.warning;
        ctx.fillRect(barX, y + barHeight + gap, barWidth * brake, barHeight);
        ctx.restore();
    }

    function drawGearAndSpeed(data, palette, centerX, speedY, gearY, speedSize, gearSize) {
        var options = arguments[7] || {};
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (showSpeed && options.showSpeed !== false) {
            setFont(speedSize, '700', 'ForzaGear');
            ctx.fillStyle = palette.text;
            ctx.fillText(String(roundedSpeed(data)), centerX, speedY);

            setFont(10, '700');
            ctx.fillStyle = palette.secondary;
            ctx.fillText(unitLabel(), centerX, speedY + speedSize * 0.54);
        }

        if (showGear && options.showGear !== false) {
            setFont(gearSize, '700', 'ForzaGear');
            ctx.fillStyle = palette.primary;
            ctx.fillText(getGearLabel(data), centerX, gearY);
        }
        ctx.restore();
    }

    function drawHeader(palette, label, rightLabel) {
        ctx.save();
        setFont(11, '700');
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillStyle = palette.secondary;
        ctx.fillText('MUSTANG // S650', 34, 19);
        ctx.textAlign = 'right';
        ctx.fillStyle = palette.primary;
        ctx.fillText(label, WIDTH - 34, 19);
        if (rightLabel) {
            ctx.textAlign = 'left';
            ctx.fillStyle = palette.secondary;
            ctx.fillText(rightLabel, 174, 19);
        }
        ctx.restore();
    }

    function drawNormal(data, palette, redlineRatio) {
        clearAndPaintBackground(palette);
        drawHeader(palette, currentTheme.toUpperCase(), currentTheme === 'normal' ? 'BALANCED CLUSTER' : 'MVP FALLBACK');

        if (showSpeed) {
            drawArcGauge(232, 128, 78, Math.PI * 0.78, Math.PI * 2.22,
                getSpeed(data) / DEFAULT_SPEED_MAX, palette, 'SPEED', roundedSpeed(data), unitLabel(), {
                    valueSize: 22,
                    activeColor: palette.primary
                });
        }
        if (showRPM) {
            drawArcGauge(1028, 128, 78, Math.PI * 0.78, Math.PI * 2.22,
                getRpm(data) / getMaxRpm(data), palette, 'RPM', Math.round(getRpm(data) / 100) * 100, 'RPM', {
                    valueSize: 20,
                    activeColor: palette.primary,
                    redlineRatio: redlineRatio
                });
        }

        drawRoundedPanel(385, 48, 490, 147, 8, palette.surface, 'rgba(255, 255, 255, 0.12)');
        ctx.save();
        ctx.strokeStyle = palette.primary;
        ctx.globalAlpha = 0.65;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(434, 71);
        ctx.lineTo(826, 71);
        ctx.stroke();
        ctx.restore();

        drawGearAndSpeed(data, palette, 630, 111, 166, 41, 70);
        drawPedalBars(data, palette, 432, 205, 190, true);
        drawPedalBars(data, palette, 642, 205, 190, true);

        ctx.save();
        setFont(9, '700');
        ctx.fillStyle = palette.secondary;
        ctx.textAlign = 'center';
        if (showSpeed) ctx.fillText('SPEED', 232, 224);
        if (showRPM) ctx.fillText('ENGINE', 1028, 224);
        ctx.restore();
    }

    function drawShiftLights(rpmRatio, palette, x, y, width, height, count, large) {
        var activeCount = Math.ceil(clamp((rpmRatio - 0.58) / 0.42, 0, 1) * count);
        var gap = large ? 7 : 4;
        var segmentWidth = (width - gap * (count - 1)) / count;

        ctx.save();
        for (var i = 0; i < count; i += 1) {
            var segmentX = x + i * (segmentWidth + gap);
            var color = i >= count - 2 ? palette.danger : (i >= count - 4 ? palette.warning : palette.primary);
            ctx.fillStyle = i < activeCount ? color : 'rgba(255, 255, 255, 0.1)';
            ctx.fillRect(segmentX, y, segmentWidth, height);
        }
        ctx.restore();
    }

    function drawRpmBand(data, palette, redlineRatio, x, y, width, height, large) {
        var maxRpm = getMaxRpm(data);
        var rpmRatio = clamp(getRpm(data) / maxRpm, 0, 1);
        var redlineX = x + width * redlineRatio;

        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.09)';
        ctx.fillRect(x, y, width, height);
        ctx.fillStyle = palette.primary;
        ctx.fillRect(x, y, width * rpmRatio, height);

        if (redlineX < x + width) {
            ctx.fillStyle = 'rgba(255, 42, 42, 0.42)';
            ctx.fillRect(redlineX, y, x + width - redlineX, height);
        }

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.lineWidth = 1;
        for (var tick = 1; tick < 10; tick += 1) {
            var tickX = x + width * tick / 10;
            ctx.beginPath();
            ctx.moveTo(tickX, y);
            ctx.lineTo(tickX, y + height);
            ctx.stroke();
        }
        ctx.restore();

        drawShiftLights(rpmRatio, palette, x, y + height + (large ? 10 : 6), width, large ? 14 : 9, large ? 12 : 16, large);
    }

    function drawMinimalRpmBar(data, palette, redlineRatio, x, y, width, height) {
        var maxRpm = getMaxRpm(data);
        var rpmRatio = clamp(getRpm(data) / maxRpm, 0, 1);
        var redlineX = x + width * redlineRatio;

        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.fillRect(x, y, width, height);
        ctx.fillStyle = palette.primary;
        ctx.fillRect(x, y, width * rpmRatio, height);
        if (redlineX < x + width) {
            ctx.fillStyle = 'rgba(217, 101, 101, 0.42)';
            ctx.fillRect(redlineX, y, x + width - redlineX, height);
        }
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.lineWidth = 1;
        for (var tick = 1; tick < 5; tick += 1) {
            var tickX = x + width * tick / 5;
            ctx.beginPath();
            ctx.moveTo(tickX, y);
            ctx.lineTo(tickX, y + height);
            ctx.stroke();
        }
        ctx.restore();
    }

    function drawRetroDial(cx, cy, radius, ratio, redlineRatio, palette, label, value, unit, options) {
        options = options || {};
        var startAngle = options.startAngle || Math.PI * 0.78;
        var endAngle = options.endAngle || Math.PI * 2.22;
        var ringColor = options.ringColor || palette.primary;
        var ringHighlight = options.ringHighlight || ringColor;
        var tickColor = options.tickColor || palette.secondary;
        var pointerColor = options.pointerColor || ringColor;
        var redlineStart = startAngle + (endAngle - startAngle) * clamp(redlineRatio, 0, 1);
        var activeEnd = startAngle + (endAngle - startAngle) * clamp(ratio, 0, 1);
        var fontFamily = options.fontFamily || 'ForzaGear';

        ctx.save();
        ctx.lineCap = 'butt';

        ctx.beginPath();
        ctx.arc(cx, cy, radius + 7, startAngle, endAngle);
        ctx.strokeStyle = ringHighlight;
        ctx.globalAlpha = 0.34;
        ctx.lineWidth = options.outerWidth || 3;
        ctx.stroke();
        ctx.globalAlpha = 1;

        ctx.beginPath();
        ctx.arc(cx, cy, radius, startAngle, endAngle);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.13)';
        ctx.lineWidth = options.baseWidth || 8;
        ctx.stroke();

        if (redlineRatio < 1) {
            ctx.beginPath();
            ctx.arc(cx, cy, radius, redlineStart, endAngle);
            ctx.strokeStyle = palette.danger;
            ctx.globalAlpha = 0.86;
            ctx.lineWidth = options.baseWidth || 8;
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        if (ratio > 0) {
            ctx.beginPath();
            ctx.arc(cx, cy, radius, startAngle, activeEnd);
            ctx.strokeStyle = ringColor;
            ctx.lineWidth = options.baseWidth || 8;
            ctx.stroke();
        }

        for (var tick = 0; tick <= 10; tick += 1) {
            var tickAngle = startAngle + (endAngle - startAngle) * tick / 10;
            var tickOuter = radius - 13;
            var tickInner = radius - (tick % 5 === 0 ? 28 : 21);
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(tickAngle) * tickInner, cy + Math.sin(tickAngle) * tickInner);
            ctx.lineTo(cx + Math.cos(tickAngle) * tickOuter, cy + Math.sin(tickAngle) * tickOuter);
            ctx.strokeStyle = tick / 10 >= redlineRatio ? palette.danger : tickColor;
            ctx.lineWidth = tick % 5 === 0 ? 2 : 1;
            ctx.stroke();
        }

        var pointerAngle = startAngle + (endAngle - startAngle) * clamp(ratio, 0, 1);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(pointerAngle) * (radius - 31), cy + Math.sin(pointerAngle) * (radius - 31));
        ctx.strokeStyle = pointerColor;
        ctx.lineWidth = options.pointerWidth || 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, options.capRadius || 5, 0, Math.PI * 2);
        ctx.fillStyle = pointerColor;
        ctx.fill();

        setFont(10, '700');
        ctx.fillStyle = tickColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, cx, cy + radius - 31);

        setFont(options.valueSize || 20, '700', fontFamily);
        ctx.fillStyle = palette.text;
        ctx.fillText(value, cx, cy + 1);
        if (unit) {
            setFont(9, '700');
            ctx.fillStyle = tickColor;
            ctx.fillText(unit, cx, cy + 23);
        }
        ctx.restore();
    }

    function drawRetroCenter(data, palette, x, y, width, height, options) {
        options = options || {};
        var centerX = x + width / 2;
        var border = options.border || palette.primary;
        var panel = options.panel || 'rgba(0, 0, 0, 0.28)';
        var secondary = options.secondary || palette.secondary;

        ctx.save();
        ctx.fillStyle = panel;
        ctx.fillRect(x, y, width, height);
        ctx.strokeStyle = border;
        ctx.globalAlpha = options.borderAlpha || 0.72;
        ctx.lineWidth = options.borderWidth || 1;
        ctx.strokeRect(x, y, width, height);
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.moveTo(x + 25, y + 29);
        ctx.lineTo(x + width - 25, y + 29);
        ctx.strokeStyle = secondary;
        ctx.globalAlpha = 0.45;
        ctx.stroke();
        ctx.globalAlpha = 1;

        setFont(10, '700');
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = secondary;
        ctx.fillText(options.label || 'GEAR', centerX, y + 16);
        if (showGear) {
            setFont(options.gearSize || 60, '700', options.fontFamily || 'ForzaGear');
            ctx.fillStyle = options.gearColor || palette.text;
            ctx.fillText(getGearLabel(data), centerX, y + height * 0.64);
        }
        if (showSpeed) {
            setFont(10, '700');
            ctx.fillStyle = secondary;
            ctx.fillText(String(roundedSpeed(data)) + ' ' + unitLabel(), centerX, y + height - 13);
        }
        ctx.restore();
    }

    function drawCalm(data, palette, redlineRatio) {
        clearAndPaintBackground(palette);
        drawHeader(palette, 'CALM', 'REDUCED VIEW');

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (showSpeed) {
            setFont(76, '700', 'ForzaGear');
            ctx.fillStyle = palette.text;
            ctx.fillText(String(roundedSpeed(data)), 630, 101);
            setFont(11, '700');
            ctx.fillStyle = palette.secondary;
            ctx.fillText(unitLabel(), 630, 139);
        }
        if (showGear) {
            setFont(43, '700', 'ForzaGear');
            ctx.fillStyle = palette.primary;
            ctx.fillText(getGearLabel(data), 630, 176);
        }
        ctx.restore();

        if (showRPM) {
            ctx.save();
            setFont(9, '700');
            ctx.fillStyle = palette.secondary;
            ctx.textAlign = 'left';
            ctx.fillText('RPM', 252, 197);
            ctx.textAlign = 'right';
            ctx.fillText(Math.round(getRpm(data)) + ' / ' + Math.round(getMaxRpm(data)), 1008, 197);
            ctx.restore();
            drawMinimalRpmBar(data, palette, redlineRatio, 252, 207, 756, 7);
        }
    }

    function drawFoxbody(data, palette, redlineRatio) {
        clearAndPaintBackground(palette);
        drawHeader(palette, 'FOXBODY', 'ANALOG // NIGHT');

        var pointer = '#ff7a3d';
        if (showSpeed) {
            drawRetroDial(235, 126, 76, getSpeed(data) / DEFAULT_SPEED_MAX, 1, palette,
                'SPEED', roundedSpeed(data), unitLabel(), {
                    pointerColor: pointer,
                    ringColor: palette.primary,
                    ringHighlight: palette.primary,
                    tickColor: palette.secondary,
                    valueSize: 19,
                    baseWidth: 7
                });
        }
        if (showRPM) {
            drawRetroDial(1025, 126, 76, getRpm(data) / getMaxRpm(data), redlineRatio, palette,
                'RPM', Math.round(getRpm(data) / 100) * 100, 'RPM', {
                    pointerColor: pointer,
                    ringColor: palette.primary,
                    ringHighlight: palette.primary,
                    tickColor: palette.secondary,
                    valueSize: 18,
                    baseWidth: 7
                });
        }
        drawRetroCenter(data, palette, 430, 62, 400, 128, {
            label: 'FOX BODY // DIGITAL OVERLAY',
            border: palette.primary,
            gearColor: palette.text,
            secondary: palette.secondary,
            panel: 'rgba(0, 22, 12, 0.68)',
            fontFamily: 'ForzaGear'
        });
    }

    function drawHeritage67(data, palette, redlineRatio) {
        clearAndPaintBackground(palette);
        drawHeader(palette, "HERITAGE '67", 'CLASSIC // ANALOG');

        var ivory = '#f5e8c8';
        var metal = '#b7a98d';
        var pointer = '#e04b4b';
        if (showSpeed) {
            drawRetroDial(235, 126, 76, getSpeed(data) / DEFAULT_SPEED_MAX, 1, palette,
                'SPEED', roundedSpeed(data), unitLabel(), {
                    pointerColor: pointer,
                    ringColor: ivory,
                    ringHighlight: metal,
                    tickColor: metal,
                    valueSize: 19,
                    baseWidth: 8,
                    outerWidth: 4,
                    fontFamily: 'Georgia'
                });
        }
        if (showRPM) {
            drawRetroDial(1025, 126, 76, getRpm(data) / getMaxRpm(data), redlineRatio, palette,
                'RPM', Math.round(getRpm(data) / 100) * 100, 'RPM', {
                    pointerColor: pointer,
                    ringColor: ivory,
                    ringHighlight: metal,
                    tickColor: metal,
                    valueSize: 18,
                    baseWidth: 8,
                    outerWidth: 4,
                    fontFamily: 'Georgia'
                });
        }
        drawRetroCenter(data, palette, 430, 62, 400, 128, {
            label: "MUSTANG // 1967",
            border: metal,
            borderWidth: 2,
            borderAlpha: 0.86,
            gearColor: ivory,
            secondary: metal,
            panel: 'rgba(34, 28, 20, 0.82)',
            fontFamily: 'Georgia'
        });
    }

    function drawCobraReadout(label, value, unit, x, y, align, palette) {
        ctx.save();
        ctx.textAlign = align;
        ctx.textBaseline = 'middle';
        setFont(10, '700');
        ctx.fillStyle = palette.secondary;
        ctx.fillText(label, x, y - 31);
        setFont(42, '700', 'ForzaGear');
        ctx.fillStyle = palette.text;
        ctx.fillText(String(value), x, y);
        setFont(10, '700');
        ctx.fillStyle = palette.secondary;
        ctx.fillText(unit, x, y + 28);
        ctx.restore();
    }

    function drawSvtCobra(data, palette, redlineRatio) {
        clearAndPaintBackground(palette);
        drawHeader(palette, 'SVT COBRA', 'HIGH CONTRAST // PERFORMANCE');
        if (showRPM) drawRpmBand(data, palette, redlineRatio, 78, 35, 1104, 24, true);

        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.30)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(78, 103);
        ctx.lineTo(1182, 103);
        ctx.moveTo(630, 111);
        ctx.lineTo(630, 219);
        ctx.stroke();
        ctx.restore();

        if (showSpeed) drawCobraReadout('SPEED', roundedSpeed(data), unitLabel(), 270, 160, 'center', palette);
        if (showRPM) drawCobraReadout('RPM', Math.round(getRpm(data) / 100) * 100, 'RPM', 990, 160, 'center', palette);

        if (showGear) {
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            setFont(10, '700');
            ctx.fillStyle = palette.secondary;
            ctx.fillText('GEAR', 630, 124);
            setFont(86, '700', 'ForzaGear');
            ctx.fillStyle = palette.text;
            ctx.fillText(getGearLabel(data), 630, 175);
            ctx.restore();
        }
    }

    function drawSport(data, palette, redlineRatio) {
        clearAndPaintBackground(palette);
        drawHeader(palette, 'SPORT', 'PERFORMANCE CLUSTER');

        if (showRPM) drawRpmBand(data, palette, redlineRatio, 108, 36, 1044, 28, false);

        if (showRPM) {
            ctx.save();
            setFont(9, '700');
            ctx.textAlign = 'left';
            ctx.fillStyle = palette.secondary;
            ctx.fillText('0', 108, 91);
            ctx.textAlign = 'right';
            ctx.fillText(Math.round(getMaxRpm(data) / 1000) + 'K RPM', 1152, 91);
            ctx.restore();
        }

        if (showSpeed) {
            drawArcGauge(228, 166, 43, Math.PI * 0.86, Math.PI * 2.14,
                getSpeed(data) / DEFAULT_SPEED_MAX, palette, 'SPEED', roundedSpeed(data), unitLabel(), {
                    lineWidth: 6,
                    valueSize: 18,
                    activeColor: palette.secondary
                });
        }

        drawRoundedPanel(397, 105, 466, 101, 6, palette.surface, 'rgba(255, 68, 56, 0.34)');
        drawGearAndSpeed(data, palette, 630, 132, 184, 26, 67);

        ctx.save();
        setFont(9, '700');
        ctx.textAlign = 'center';
        ctx.fillStyle = palette.secondary;
        ctx.fillText('THROTTLE', 921, 119);
        ctx.fillText('BRAKE', 1042, 119);
        ctx.fillStyle = palette.primary;
        ctx.fillRect(906, 134, 151 * getPedalValue(data, 'throttle'), 7);
        ctx.fillStyle = palette.warning;
        ctx.fillRect(906, 153, 151 * getPedalValue(data, 'brake'), 7);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
        ctx.strokeRect(906, 134, 151, 7);
        ctx.strokeRect(906, 153, 151, 7);
        ctx.restore();
    }

    function drawTrack(data, palette, redlineRatio) {
        clearAndPaintBackground(palette);
        drawHeader(palette, 'TRACK', 'TRACK APPS // SHIFT PRIORITY');

        var bandX = 78;
        var bandWidth = 1104;
        if (showRPM) drawRpmBand(data, palette, redlineRatio, bandX, 35, bandWidth, 35, true);

        if (showRPM) {
            ctx.save();
            setFont(10, '700');
            ctx.fillStyle = palette.secondary;
            ctx.textAlign = 'left';
            ctx.fillText('RPM', bandX, 115);
            ctx.textAlign = 'right';
            ctx.fillText(Math.round(getRpm(data)) + ' / ' + Math.round(getMaxRpm(data)), bandX + bandWidth, 115);
            ctx.restore();
        }

        drawRoundedPanel(445, 124, 370, 92, 4, palette.surface, 'rgba(255, 255, 255, 0.18)');
        if (showGear) {
            ctx.save();
            setFont(10, '700');
            ctx.fillStyle = palette.secondary;
            ctx.textAlign = 'center';
            ctx.fillText('GEAR', 630, 138);
            setFont(76, '700', 'ForzaGear');
            ctx.fillStyle = palette.text;
            ctx.fillText(getGearLabel(data), 630, 182);
            ctx.restore();
        }

        if (showSpeed) {
            ctx.save();
            setFont(36, '700', 'ForzaGear');
            ctx.textAlign = 'left';
            ctx.fillStyle = palette.text;
            ctx.fillText(String(roundedSpeed(data)), 92, 169);
            setFont(10, '700');
            ctx.fillStyle = palette.secondary;
            ctx.fillText(unitLabel(), 94, 188);
            ctx.restore();
        }

        drawPedalBars(data, palette, 891, 151, 270, false);
    }

    function render(data, payload, renderTime) {
        if (!isReady || !showGauge) return;

        var theme = normalizeTheme(currentTheme);
        var palette = paletteFor(theme);
        var maxRpm = getMaxRpm(data);
        var redline = getRedlineRpm(data, payload);
        var redlineRatio = clamp(redline / maxRpm, 0, 1);
        lastRenderTime = renderTime || 0;

        if (theme === 'sport') {
            drawSport(data, palette, redlineRatio);
        } else if (theme === 'track') {
            drawTrack(data, palette, redlineRatio);
        } else if (theme === 'calm') {
            drawCalm(data, palette, redlineRatio);
        } else if (theme === 'foxbody') {
            drawFoxbody(data, palette, redlineRatio);
        } else if (theme === 'heritage67') {
            drawHeritage67(data, palette, redlineRatio);
        } else if (theme === 'svt_cobra') {
            drawSvtCobra(data, palette, redlineRatio);
        } else {
            drawNormal(data, palette, redlineRatio);
        }
    }

    function triggerSweep() {
        if (!isReady || sweepActive || !showGauge) return;
        sweepActive = true;
        var startedAt = performance.now();
        var duration = 1200;
        var maxRpm = getMaxRpm(lastFrame);
        var redline = getRedlineRpm(lastFrame, null);

        function animate(now) {
            var progress = clamp((now - startedAt) / duration, 0, 1);
            var rpm;
            if (progress < 0.5) {
                rpm = maxRpm * Math.sin((progress / 0.5) * Math.PI / 2);
            } else {
                var downProgress = (progress - 0.5) / 0.5;
                rpm = maxRpm * (1 - Math.sin(downProgress * Math.PI / 2)) + 900 * Math.sin(downProgress * Math.PI / 2);
            }

            var sweepFrame = {
                rpm: rpm,
                maxRpm: maxRpm,
                redlineRpm: redline,
                speed_kmh: (rpm / maxRpm) * 160,
                speed_mph: (rpm / maxRpm) * 99.4,
                gear: 3,
                throttle: progress < 0.5 ? progress * 2 : 0,
                brake: progress >= 0.5 ? (progress - 0.5) * 2 : 0
            };
            render(sweepFrame, { redlineRpm: redline }, (now - startedAt) / 1000);

            if (progress < 1) {
                window.requestAnimationFrame(animate);
            } else {
                sweepActive = false;
                render(lastFrame, null, 0);
            }
        }

        window.requestAnimationFrame(animate);
    }

    function setGaugeVisibility(elements) {
        updateElementVisibility(elements);
    }

    if (!window.HUDCore) {
        console.error('[S650 HMI] HUDCore is not available. Renderer was not registered.');
        return;
    }

    HUDCore.registerStyle('s650_hmi', {
        containerId: 's650Container',
        scaleMultiplier: 1.0,

        onInit: function (payload) {
            updateStateFromPayload(payload);
            if (isReady && showGauge && !sweepActive) render(lastFrame, payload, 0);
        },

        onElementsChange: function (elements) {
            updateStateFromPayload({ elements: elements });
            if (showGauge && !sweepActive) render(lastFrame, null, 0);
        },

        onFrame: function (data, payload) {
            updateStateFromPayload(payload);
            lastFrame = data || lastFrame;
            if (!sweepActive && showGauge) render(lastFrame, payload, 0);
        },

        onAnimate: function () {
            if (isReady) {
                triggerSweep();
            } else {
                sweepPending = true;
            }
        }
    });

    HUDCore.init('s650_hmi');

    if (sweepPending) {
        sweepPending = false;
        triggerSweep();
    } else if (isReady) {
        render(lastFrame, null, 0);
    }
})(window);
