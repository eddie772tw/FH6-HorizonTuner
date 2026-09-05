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
        tachometer: Object.freeze({
            // Track keeps the RPM band above the lower game UI. The Canvas is
            // bottom-anchored, so the recipe must use the original y=86 anchor
            // rather than shifting its children downward as a scale substitute.
            variant: 'trackWide', x: 96, y: 86, width: 1120, height: 96, slant: 94, divisions: 9,
            lowerRiseRatio: 0.20, activeFillAlpha: 0.82
        }),
        // Keep the game's central race presentation clear. Track owns the
        // sidebar safe bounds while the center-info component owns rendering.
        // centerInfo is mirrored symmetrically across X=640 with speedGear (x=200, y=198, w=220, h=88).
        centerInfo: Object.freeze({ x: 860, y: 198, width: 220, height: 88, layoutStyle: 'trackSidebar' }),
        speedGear: Object.freeze({
            x: 200, y: 198, width: 220, height: 88,
            dividerX: 110, gearX: 55, speedX: 208,
            gearAlign: 'center', speedAlign: 'right',
            labelY: 12, valueY: 55, dividerInset: 10,
            labelSize: 15, speedSize: 57, gearSize: 57, unitInLabel: true
        }),
        leftRail: Object.freeze({ x: 172, y: 202, height: 110, side: 'left', role: 'power', axisWidth: 3, tickLength: 12, fillWidth: 8, valueSize: 16, valueOffset: 18 }),
        rightRail: Object.freeze({ x: 1108, y: 202, height: 110, side: 'right', role: 'boost', axisWidth: 3, tickLength: 12, fillWidth: 8, valueSize: 16, valueOffset: 18 }),
        footer: Object.freeze({
            x: 236,
            y: 374,
            width: 808,
            slots: Object.freeze({ topLeft: 'odometer', topRight: 'heading', bottomLeft: 'rpm', bottomRight: 'speed' }),
            positions: Object.freeze({
                topLeft: Object.freeze({ x: 430, y: 364, align: 'center' }),
                topRight: Object.freeze({ x: 850, y: 364, align: 'center' }),
                bottomLeft: Object.freeze({ x: 430, y: 407, align: 'center' }),
                bottomRight: Object.freeze({ x: 850, y: 407, align: 'center' })
            }),
            gear: Object.freeze({ centerX: 640, centerY: 407 })
        })
    });

    function drawTrack(view, data, palette, redlineRatio, ctx, dependencies) {
        var componentModule = window.S650HmiClusterComponents;
        if (!componentModule || typeof componentModule.create !== 'function') return;
        var components = componentModule.create(ctx);
        var tachometer = Object.assign({}, TRACK_RECIPE.tachometer, { redlineRatio: redlineRatio });
        dependencies = dependencies || {};

        components.drawTachometer(view, data, palette, tachometer);
        if (view.showCenterInfo !== false && dependencies.centerInfo && typeof dependencies.centerInfo.draw === 'function') {
            dependencies.centerInfo.draw(view, data, palette, TRACK_RECIPE.centerInfo);
        }
        components.drawTrackSpeedGear(view, data, palette, TRACK_RECIPE.speedGear);
        components.drawVerticalRail(view, data, palette, TRACK_RECIPE.leftRail);
        components.drawVerticalRail(view, data, palette, TRACK_RECIPE.rightRail);
        components.drawFooter(view, data, palette, TRACK_RECIPE.footer, dependencies.primitives);
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

    // TODO(s650-svt-cobra): Retain this twin-ring research renderer without
    // registering it until a future visual review approves the production form.
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
