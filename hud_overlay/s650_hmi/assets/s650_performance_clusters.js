/* Dedicated transparent performance layouts for the S650 cluster. */
(function (window) {
    'use strict';

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function setFont(ctx, size, weight) {
        ctx.font = (weight || '700') + ' ' + size + 'px Arial Narrow, Arial, sans-serif';
    }

    function drawRule(ctx, x1, y1, x2, y2, color, width) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = color;
        ctx.lineWidth = width || 1;
        ctx.stroke();
    }

    function drawRpmBand(ctx, x, y, width, count, gap, ratio, redlineRatio, palette, height) {
        var segmentWidth = (width - gap * (count - 1)) / count;
        for (var index = 0; index < count; index += 1) {
            var position = index / count;
            ctx.fillStyle = position >= redlineRatio
                ? palette.danger
                : (position <= ratio ? palette.primary : 'rgba(255,255,255,0.16)');
            ctx.fillRect(x + index * (segmentWidth + gap), y, segmentWidth, height);
        }
    }

    function drawTrack(view, data, palette, redlineRatio, ctx) {
        var rpmRatio = clamp(view.getRpm(data) / view.getMaxRpm(data), 0, 1);
        var fuel = view.getFuelLevel(data);
        var heading = view.getTelemetryReadout('heading', data);
        var odometer = view.getTelemetryReadout('odometer', data);
        var tires = view.getTireTemperatures(data);
        var centerX = view.width / 2;
        var fuelHeight = fuel === null ? 0 : Math.round(118 * clamp(fuel, 0, 1));

        ctx.save();
        drawRpmBand(ctx, 128, 54, view.width - 256, 24, 6, rpmRatio, redlineRatio, palette, 10);
        drawRule(ctx, 128, 78, view.width - 128, 78, 'rgba(255,255,255,0.26)');
        ctx.textAlign = 'left';
        setFont(ctx, 13, '800');
        ctx.fillStyle = palette.primary;
        ctx.fillText('TRACK', 128, 106);
        ctx.textAlign = 'right';
        ctx.fillStyle = palette.secondary;
        ctx.fillText('TRACK USE ONLY', view.width - 128, 106);

        if (view.showSpeed) {
            ctx.textAlign = 'center';
            setFont(ctx, 112, '800');
            ctx.fillStyle = palette.text;
            ctx.fillText(String(view.roundedSpeed(data)), centerX, 258);
            setFont(ctx, 14, '800');
            ctx.fillStyle = palette.secondary;
            ctx.fillText(view.unitLabel(), centerX, 282);
        }
        if (view.showGear) {
            ctx.textAlign = 'center';
            setFont(ctx, 22, '800');
            ctx.fillStyle = palette.primary;
            ctx.fillText(view.getGearLabel(data) + ' GEAR', centerX, 318);
        }
        if (view.showRPM) {
            ctx.textAlign = 'center';
            setFont(ctx, 13, '700');
            ctx.fillStyle = palette.secondary;
            ctx.fillText(Math.round(view.getRpm(data)) + ' RPM', centerX, 340);
        }

        ctx.textAlign = 'right';
        setFont(ctx, 12, '800');
        ctx.fillStyle = palette.secondary;
        ctx.fillText('TIRE TEMP', view.width - 128, 160);
        ctx.textAlign = 'left';
        ctx.fillText('FUEL', view.width - 104, 194);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(view.width - 104, 202, 6, 118);
        ctx.fillStyle = palette.primary;
        ctx.fillRect(view.width - 104, 320 - fuelHeight, 6, fuelHeight);

        ctx.textAlign = 'left';
        setFont(ctx, 12, '700');
        ctx.fillStyle = palette.secondary;
        ctx.fillText('FL ' + view.formatTireTemperature(tires[0]) + '°', 128, 350);
        ctx.fillText('RL ' + view.formatTireTemperature(tires[2]) + '°', 128, 374);
        ctx.textAlign = 'right';
        ctx.fillText('FR ' + view.formatTireTemperature(tires[1]) + '°', view.width - 128, 350);
        ctx.fillText('RR ' + view.formatTireTemperature(tires[3]) + '°', view.width - 128, 374);
        drawRule(ctx, 128, 386, 220, 386, 'rgba(255,255,255,0.28)');
        drawRule(ctx, view.width - 220, 386, view.width - 128, 386, 'rgba(255,255,255,0.28)');

        ctx.textAlign = 'center';
        setFont(ctx, 13, '700');
        ctx.fillStyle = palette.secondary;
        ctx.fillText(heading.value + '  /  ' + odometer.value + ' ' + odometer.unit, centerX, 412);
        ctx.restore();
    }

    function drawCobraDial(ctx, cx, cy, radius, ratio, options, palette) {
        var start = Math.PI * 0.74;
        var end = Math.PI * 2.26;
        var majorCount = options.majorCount;
        var activeEnd = start + (end - start) * clamp(ratio, 0, 1);

        ctx.save();
        ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.arc(cx, cy, radius, start, end);
        ctx.strokeStyle = 'rgba(229,237,239,0.72)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, radius - 18, start, end);
        ctx.strokeStyle = 'rgba(218,232,235,0.28)';
        ctx.lineWidth = 1;
        ctx.stroke();

        for (var tick = 0; tick <= majorCount * 5; tick += 1) {
            var tickRatio = tick / (majorCount * 5);
            var angle = start + (end - start) * tickRatio;
            var major = tick % 5 === 0;
            var outer = radius + 1;
            var inner = radius - (major ? 18 : 10);
            drawRule(ctx, cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner,
                cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer,
                tickRatio >= options.redlineRatio ? palette.danger : palette.secondary, major ? 2 : 1);
            if (major) {
                ctx.textAlign = 'center';
                setFont(ctx, 14, '700');
                ctx.fillStyle = palette.text;
                ctx.fillText(String(Math.round(options.maximum * tickRatio)),
                    cx + Math.cos(angle) * (radius - 36), cy + Math.sin(angle) * (radius - 36) + 5);
            }
        }

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(activeEnd) * (radius - 30), cy + Math.sin(activeEnd) * (radius - 30));
        ctx.strokeStyle = '#F04646';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#F04646';
        ctx.fill();
        ctx.textAlign = 'center';
        setFont(ctx, 14, '800');
        ctx.fillStyle = palette.secondary;
        ctx.fillText(options.label, cx, cy + 32);
        ctx.restore();
    }

    function drawSvtCobra(view, data, palette, redlineRatio, ctx) {
        var rpmRatio = clamp(view.getRpm(data) / view.getMaxRpm(data), 0, 1);
        var speedMax = view.isMetric ? 260 : 160;
        var speedRatio = clamp(view.getSpeed(data) / speedMax, 0, 1);
        var power = view.getTelemetryReadout('power', data);
        var boost = view.getTelemetryReadout('boost', data);
        var fuel = view.getFuelLevel(data);
        var centerX = view.width / 2;

        ctx.save();
        if (view.showRPM) drawCobraDial(ctx, 306, 246, 166, rpmRatio, {
            majorCount: 8,
            maximum: 8,
            redlineRatio: Math.min(redlineRatio, 0.78),
            label: 'SVT  RPM x1000'
        }, palette);
        if (view.showSpeed) drawCobraDial(ctx, 974, 246, 166, speedRatio, {
            majorCount: 8,
            maximum: speedMax,
            redlineRatio: 1,
            label: view.unitLabel()
        }, palette);

        ctx.textAlign = 'center';
        setFont(ctx, 16, '800');
        ctx.fillStyle = palette.primary;
        ctx.fillText('SVT COBRA', centerX, 94);
        if (view.showGear) {
            setFont(ctx, 72, '800');
            ctx.fillStyle = palette.text;
            ctx.fillText(view.getGearLabel(data), centerX, 194);
            setFont(ctx, 13, '700');
            ctx.fillStyle = palette.secondary;
            ctx.fillText('GEAR', centerX, 218);
        }
        setFont(ctx, 14, '700');
        ctx.fillStyle = palette.secondary;
        ctx.fillText('POWER  ' + power.value + ' ' + power.unit, centerX, 274);
        ctx.fillText('BOOST  ' + boost.value + ' ' + boost.unit, centerX, 302);
        ctx.fillText('FUEL  ' + (fuel === null ? '--' : Math.round(fuel * 100) + '%'), centerX, 330);
        drawRule(ctx, 536, 346, 744, 346, 'rgba(229,237,239,0.36)');
        ctx.restore();
    }

    window.S650HmiPerformanceClusters = {
        drawTrack: drawTrack,
        drawSvtCobra: drawSvtCobra
    };
})(window);
