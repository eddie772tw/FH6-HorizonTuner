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

    // A cluster recipe only selects component variants and their geometry. It
    // deliberately contains no Canvas calls or data interpretation. Future
    // clusters can reuse the same component registry with another recipe.
    var TRACK_RECIPE = Object.freeze({
        tachometer: Object.freeze({ variant: 'trackWide', x: 96, y: 86, width: 1120, height: 96, slant: 94, divisions: 9 }),
        panel: Object.freeze({ x: 166, y: 178, width: 948, height: 144, notch: 42 }),
        tireOverview: Object.freeze({ centerX: 640, centerY: 246, carWidth: 42, carHeight: 92, label: 'TIRE TEMP' }),
        thermalRail: Object.freeze({ x: 118, y: 202, height: 104, side: 'left', label: 'TEMP' }),
        fuelRail: Object.freeze({ x: 1162, y: 202, height: 104, side: 'right', label: 'FUEL' }),
        footer: Object.freeze({ x: 236, y: 376, width: 808, centerX: 640 })
    });

    function drawTrack(view, data, palette, redlineRatio, ctx) {
        var componentModule = window.S650HmiClusterComponents;
        if (!componentModule || typeof componentModule.create !== 'function') return;
        var components = componentModule.create(ctx);
        var tachometer = Object.assign({}, TRACK_RECIPE.tachometer, { redlineRatio: redlineRatio });
        var fuelRail = Object.assign({}, TRACK_RECIPE.fuelRail, {
            getRatio: function (trackView, trackData) { return trackView.getFuelLevel(trackData); }
        });

        components.drawTachometer(view, data, palette, tachometer);
        components.drawSmokedInfoPanel(palette, TRACK_RECIPE.panel);
        components.drawTireOverview(view, data, palette, TRACK_RECIPE.tireOverview);
        // The source telemetry has no coolant/oil-temperature datum yet. The
        // thermal rail stays visibly unavailable instead of inventing a value.
        components.drawVerticalRail(view, data, palette, TRACK_RECIPE.thermalRail);
        components.drawVerticalRail(view, data, palette, fuelRail);
        components.drawTrackFooter(view, data, palette, TRACK_RECIPE.footer);
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
