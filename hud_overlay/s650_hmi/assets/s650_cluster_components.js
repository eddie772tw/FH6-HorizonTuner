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

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(x, y + height);
            ctx.lineTo(x + slant, y);
            ctx.lineTo(x + width - slant, y);
            ctx.lineTo(x + width, y + height);
            ctx.strokeStyle = 'rgba(135, 115, 255, 0.86)';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Fill bands must live inside the same trapezoid as the tick and
            // label scale. Clipping the normal-style base, redline and active
            // fills prevents them from reading as a detached horizontal bar.
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(x, y + height);
            ctx.lineTo(x + slant, y);
            ctx.lineTo(x + width - slant, y);
            ctx.lineTo(x + width, y + height);
            ctx.closePath();
            ctx.clip();
            ctx.fillStyle = 'rgba(160, 144, 255, 0.12)';
            ctx.fillRect(x, y, width, height);
            if (redlineRatio < 1) {
                ctx.fillStyle = 'rgba(255, 59, 48, 0.50)';
                ctx.fillRect(x + width * redlineRatio, y, width * (1 - redlineRatio), height);
            }
            if (rpmRatio > 0) {
                ctx.fillStyle = palette.primary;
                ctx.globalAlpha = 0.40;
                ctx.fillRect(x, y, width * Math.min(rpmRatio, redlineRatio), height);
            }
            ctx.restore();

            for (var tick = 0; tick <= divisions * 4; tick += 1) {
                var ratio = tick / (divisions * 4);
                var tickX = x + slant + (width - slant * 2) * ratio;
                var major = tick % 4 === 0;
                var redline = ratio >= redlineRatio;
                var tickHeight = major ? 28 : 9;
                drawRule(ctx, tickX, y + 4, tickX, y + 4 + tickHeight,
                    redline ? palette.danger : 'rgba(160, 144, 255, 0.96)', major ? 2 : 1);
                if (major && tick < divisions) {
                    ctx.textAlign = 'center';
                    setFont(ctx, 21, '700');
                    ctx.fillStyle = redline ? palette.danger : palette.text;
                    ctx.fillText(String(Math.round(maxRpm * ratio / 1000)), tickX, y + height - 14);
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

            ctx.save();
            ctx.textAlign = side > 0 ? 'left' : 'right';
            drawRule(ctx, x, y, x, y + height, 'rgba(219, 239, 241, 0.54)', 2);
            for (var tick = 0; tick <= 4; tick += 1) {
                var tickY = y + height * tick / 4;
                drawRule(ctx, x, tickY, x + side * 8, tickY, 'rgba(219, 239, 241, 0.55)', 1);
            }
            if (available) {
                drawRule(ctx, x, y + height, x, y + height - activeHeight, recipe.activeColor || palette.primary, 4);
                setFont(ctx, 13, '800');
                ctx.fillStyle = palette.text;
                ctx.fillText(readout.value + (readout.unit ? ' ' + readout.unit : ''), x + side * 12, y + height + 16);
            } else {
                setFont(ctx, 13, '700');
                ctx.fillStyle = 'rgba(219, 239, 241, 0.46)';
                ctx.fillText('--', x + side * 12, y + height + 16);
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
            drawVerticalRail: drawVerticalRail,
            drawTachometer: drawTachometer
        };
    }

    window.S650HmiClusterComponents = { create: create };
})(window);
