/* Reusable S650 cluster components. Cluster recipes own placement and variants. */
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

    function create(ctx) {
        function drawTachometer(view, data, palette, recipe) {
            // `trackWide` is intentionally a presentation variant, not a
            // second cluster type. Other recipes may select an analog or ring
            // tachometer without inheriting Track's geometry.
            if (recipe.variant !== 'trackWide') return;
            var maxRpm = Math.max(1000, view.getMaxRpm(data));
            var rpmRatio = clamp(view.getRpm(data) / maxRpm, 0, 1);
            var redlineRatio = clamp(recipe.redlineRatio, 0, 1);
            var divisions = recipe.divisions || 9;
            var x = recipe.x;
            var y = recipe.y;
            var width = recipe.width;
            var height = recipe.height;
            var slant = recipe.slant || 76;
            var lowerRise = height * (recipe.lowerRiseRatio === undefined ? 0.20 : recipe.lowerRiseRatio);
            var scaleStart = x + slant;
            var scaleWidth = Math.max(0, width - slant * 2);
            var lowerSlantRatio = slant / width;

            function lowerBoundaryY(ratio) {
                if (ratio <= lowerSlantRatio) return y + height - lowerRise * ratio / lowerSlantRatio;
                if (ratio >= 1 - lowerSlantRatio) return y + height - lowerRise * (1 - ratio) / lowerSlantRatio;
                return y + height - lowerRise;
            }

            function traceTrackWideOutline() {
                ctx.moveTo(x, y + height);
                ctx.lineTo(x + slant, y);
                ctx.lineTo(x + width - slant, y);
                ctx.lineTo(x + width, y + height);
                ctx.lineTo(x + width - slant, y + height - lowerRise);
                ctx.lineTo(x + slant, y + height - lowerRise);
                ctx.lineTo(x, y + height);
            }

            ctx.save();
            ctx.beginPath();
            traceTrackWideOutline();
            ctx.strokeStyle = 'rgba(135, 115, 255, 0.86)';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Fill bands must live inside the same trapezoid as the tick and
            // label scale. Clipping the normal-style base, redline and active
            // fills prevents them from reading as a detached horizontal bar.
            ctx.save();
            ctx.beginPath();
            traceTrackWideOutline();
            ctx.closePath();
            ctx.clip();
            ctx.fillStyle = 'rgba(160, 144, 255, 0.12)';
            ctx.fillRect(x, y, width, height);
            if (redlineRatio < 1) {
                ctx.fillStyle = 'rgba(255, 59, 48, 0.50)';
                ctx.fillRect(scaleStart + scaleWidth * redlineRatio, y, scaleWidth * (1 - redlineRatio), height);
            }
            if (rpmRatio > 0) {
                ctx.fillStyle = palette.primary;
                ctx.globalAlpha = recipe.activeFillAlpha === undefined ? 0.82 : recipe.activeFillAlpha;
                ctx.fillRect(scaleStart, y, scaleWidth * Math.min(rpmRatio, redlineRatio), height);
            }
            ctx.globalAlpha = 1;
            ctx.restore();

            for (var tick = 0; tick <= divisions * 4; tick += 1) {
                var ratio = tick / (divisions * 4);
                var tickX = scaleStart + scaleWidth * ratio;
                var major = tick % 4 === 0;
                var redline = ratio >= redlineRatio;
                var tickHeight = major ? 28 : 9;
                drawRule(ctx, tickX, y + 4, tickX, y + 4 + tickHeight,
                    redline ? palette.danger : 'rgba(160, 144, 255, 0.96)', major ? 2 : 1);
                if (major && tick < divisions) {
                    ctx.textAlign = 'center';
                    setFont(ctx, 21, '700');
                    ctx.fillStyle = redline ? palette.danger : palette.text;
                    ctx.fillText(String(Math.round(maxRpm * ratio / 1000)), tickX, lowerBoundaryY(ratio) - 14);
                }
            }

            setFont(ctx, 11, '800');
            ctx.textAlign = 'right';
            ctx.fillStyle = palette.secondary;
            ctx.fillText('RPM', x + width - slant - 4, y + height - 12);
            ctx.restore();
        }

        function drawVerticalRail(view, data, palette, recipe) {
            var x = recipe.x;
            var y = recipe.y;
            var height = recipe.height;
            var readout = recipe.role && typeof view.getTelemetryReadout === 'function'
                ? view.getTelemetryReadout(recipe.role, data)
                : null;
            var ratio = readout ? readout.ratio : null;
            var available = ratio !== null && ratio !== undefined;
            var activeHeight = available ? Math.round(height * clamp(ratio, 0, 1)) : 0;
            var side = recipe.side === 'right' ? 1 : -1;
            var axisWidth = recipe.axisWidth || 2;
            var tickLength = recipe.tickLength || 8;
            var fillWidth = recipe.fillWidth || 4;
            var valueSize = recipe.valueSize || 13;
            var valueOffset = recipe.valueOffset || 12;

            ctx.save();
            ctx.textAlign = side > 0 ? 'left' : 'right';
            drawRule(ctx, x, y, x, y + height, 'rgba(219, 239, 241, 0.54)', axisWidth);
            for (var tick = 0; tick <= 4; tick += 1) {
                var tickY = y + height * tick / 4;
                drawRule(ctx, x, tickY, x + side * tickLength, tickY, 'rgba(219, 239, 241, 0.55)', axisWidth - 1);
            }
            if (available) {
                drawRule(ctx, x, y + height, x, y + height - activeHeight, recipe.activeColor || palette.primary, fillWidth);
                setFont(ctx, valueSize, '800');
                ctx.fillStyle = palette.text;
                ctx.fillText(readout.value + (readout.unit ? ' ' + readout.unit : ''), x + side * valueOffset, y + height + valueSize + 3);
            } else {
                setFont(ctx, valueSize, '700');
                ctx.fillStyle = 'rgba(219, 239, 241, 0.46)';
                ctx.fillText('--', x + side * valueOffset, y + height + valueSize + 3);
            }
            ctx.restore();
        }

        function drawTrackSpeedGear(view, data, palette, recipe) {
            var x = recipe.x;
            var y = recipe.y;
            var width = recipe.width;
            var dividerX = x + (recipe.dividerX === undefined ? width / 2 : recipe.dividerX);
            var gearX = x + (recipe.gearX === undefined ? 14 : recipe.gearX);
            var speedX = x + (recipe.speedX === undefined ? width - 14 : recipe.speedX);
            var gearAlign = recipe.gearAlign || 'right';
            var speedAlign = recipe.speedAlign || 'right';
            var labelY = y + (recipe.labelY === undefined ? 17 : recipe.labelY);
            var valueY = y + (recipe.valueY === undefined ? 52 : recipe.valueY);
            var unitY = y + (recipe.unitY === undefined ? 79 : recipe.unitY);
            var dividerInset = recipe.dividerInset === undefined ? 10 : recipe.dividerInset;
            var speed = typeof view.roundedSpeed === 'function' ? view.roundedSpeed(data) : '--';
            var unit = typeof view.unitLabel === 'function' ? view.unitLabel() : '';
            var gear = typeof view.getGearLabel === 'function' ? view.getGearLabel(data) : '--';

            ctx.save();
            ctx.textBaseline = 'middle';

            setFont(ctx, recipe.labelSize || 10, '700');
            ctx.fillStyle = palette.secondary;
            ctx.textAlign = gearAlign;
            ctx.fillText('GEAR', gearX, labelY);
            ctx.textAlign = speedAlign;
            ctx.fillText(recipe.unitInLabel && unit ? 'SPEED ' + unit : 'SPEED', speedX, labelY);

            if (recipe.divider !== false) {
                drawRule(ctx, dividerX, y + dividerInset,
                    dividerX, y + (recipe.height || 72) - dividerInset,
                    'rgba(194, 226, 234, 0.26)');
            }

            if (view.showSpeed !== false) {
                setFont(ctx, recipe.speedSize || 38, '700');
                ctx.fillStyle = palette.text;
                ctx.textAlign = speedAlign;
                ctx.fillText(String(speed), speedX, valueY);
                if (!recipe.unitInLabel) {
                    setFont(ctx, recipe.unitSize || 10, '700');
                    ctx.fillStyle = palette.secondary;
                    ctx.fillText(unit, speedX, unitY);
                }
            }

            if (view.showGear !== false) {
                setFont(ctx, recipe.gearSize || 46, '700');
                ctx.fillStyle = palette.primary;
                ctx.textAlign = gearAlign;
                ctx.fillText(String(gear), gearX, valueY);
            }
            ctx.restore();
        }

        function drawFooter(view, data, palette, recipe, primitives) {
            var slots = recipe.slots || {};
            var positions = recipe.positions || {};

            ctx.save();
            drawRule(ctx, recipe.x, recipe.y - 16, recipe.x + recipe.width, recipe.y - 16, 'rgba(194, 226, 234, 0.24)');
            setFont(ctx, 12, '700');
            ctx.fillStyle = palette.secondary;
            for (var key in slots) {
                if (!Object.prototype.hasOwnProperty.call(slots, key) || !positions[key]) continue;
                var readout = view.getTelemetryReadout(slots[key], data);
                var position = positions[key];
                ctx.textAlign = position.align || 'center';
                ctx.fillText(readout.value + (readout.unit ? ' ' + readout.unit : ''), position.x, position.y);
            }
            ctx.restore();
            if (primitives && typeof primitives.drawGearCarousel === 'function') {
                primitives.drawGearCarousel(view, data, palette, recipe.gear.centerX, recipe.gear.centerY);
            }
        }

        return {
            drawFooter: drawFooter,
            drawTrackSpeedGear: drawTrackSpeedGear,
            drawVerticalRail: drawVerticalRail,
            drawTachometer: drawTachometer
        };
    }

    window.S650HmiClusterComponents = { create: create };
})(window);
