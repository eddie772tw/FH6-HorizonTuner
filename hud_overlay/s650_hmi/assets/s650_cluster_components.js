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

            var activeX = x + slant + (width - slant * 2) * rpmRatio;
            drawRule(ctx, x + slant, y + height - 2, activeX, y + height - 2, palette.primary, 3);
            if (redlineRatio < 1) {
                var redlineX = x + slant + (width - slant * 2) * redlineRatio;
                drawRule(ctx, redlineX, y + 2, x + width - slant, y + 2, palette.danger, 3);
            }
            setFont(ctx, 11, '800');
            ctx.textAlign = 'right';
            ctx.fillStyle = palette.secondary;
            ctx.fillText('RPM', x + width - slant - 4, y + height - 12);
            ctx.restore();
        }

        function drawSmokedInfoPanel(palette, recipe) {
            var x = recipe.x;
            var y = recipe.y;
            var width = recipe.width;
            var height = recipe.height;
            var notch = recipe.notch || 44;

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(x, y + 10);
            ctx.quadraticCurveTo(x + width * 0.18, y - 8, x + width * 0.34, y + 2);
            ctx.quadraticCurveTo(x + width * 0.5, y + 16, x + width * 0.66, y + 2);
            ctx.quadraticCurveTo(x + width * 0.82, y - 8, x + width, y + 10);
            ctx.lineTo(x + width - 18, y + height - 16);
            ctx.quadraticCurveTo(x + width * 0.72, y + height - 4, x + width * 0.58, y + height - notch);
            ctx.quadraticCurveTo(x + width * 0.5, y + height - notch - 10, x + width * 0.42, y + height - notch);
            ctx.quadraticCurveTo(x + width * 0.28, y + height - 4, x + 18, y + height - 16);
            ctx.closePath();
            ctx.fillStyle = recipe.fill || 'rgba(19, 55, 79, 0.68)';
            ctx.fill();
            ctx.strokeStyle = recipe.stroke || 'rgba(104, 174, 214, 0.22)';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.restore();
        }

        function drawTireOverview(view, data, palette, recipe) {
            var temperatures = view.getTireTemperatures(data);
            var centerX = recipe.centerX;
            var centerY = recipe.centerY;
            var carWidth = recipe.carWidth || 42;
            var carHeight = recipe.carHeight || 94;
            var positions = [
                { x: centerX - 48, y: centerY - 32, align: 'right', label: 'FL' },
                { x: centerX + 48, y: centerY - 32, align: 'left', label: 'FR' },
                { x: centerX - 48, y: centerY + 38, align: 'right', label: 'RL' },
                { x: centerX + 48, y: centerY + 38, align: 'left', label: 'RR' }
            ];

            ctx.save();
            ctx.textAlign = 'center';
            setFont(ctx, 10, '800');
            ctx.fillStyle = palette.secondary;
            ctx.fillText(recipe.label || 'TIRE TEMP', centerX, centerY - carHeight / 2 - 16);
            ctx.beginPath();
            ctx.moveTo(centerX - carWidth * 0.28, centerY - carHeight / 2);
            ctx.lineTo(centerX + carWidth * 0.28, centerY - carHeight / 2);
            ctx.lineTo(centerX + carWidth / 2, centerY - carHeight * 0.22);
            ctx.lineTo(centerX + carWidth * 0.36, centerY + carHeight / 2);
            ctx.lineTo(centerX - carWidth * 0.36, centerY + carHeight / 2);
            ctx.lineTo(centerX - carWidth / 2, centerY - carHeight * 0.22);
            ctx.closePath();
            ctx.fillStyle = 'rgba(191, 228, 242, 0.19)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(210, 240, 250, 0.68)';
            ctx.lineWidth = 1;
            ctx.stroke();
            drawRule(ctx, centerX, centerY - carHeight * 0.31, centerX, centerY + carHeight * 0.31, 'rgba(223, 242, 250, 0.48)');

            for (var index = 0; index < positions.length; index += 1) {
                var position = positions[index];
                ctx.textAlign = position.align;
                setFont(ctx, 14, '800');
                ctx.fillStyle = palette.text;
                ctx.fillText(view.formatTireTemperature(temperatures[index]) + '°', position.x, position.y);
                setFont(ctx, 9, '700');
                ctx.fillStyle = palette.secondary;
                ctx.fillText(position.label, position.x, position.y + 12);
            }
            ctx.restore();
        }

        function drawVerticalRail(view, data, palette, recipe) {
            var x = recipe.x;
            var y = recipe.y;
            var height = recipe.height;
            var ratio = recipe.getRatio ? recipe.getRatio(view, data) : null;
            var available = ratio !== null && ratio !== undefined;
            var activeHeight = available ? Math.round(height * clamp(ratio, 0, 1)) : 0;
            var side = recipe.side === 'right' ? 1 : -1;

            ctx.save();
            ctx.textAlign = side > 0 ? 'left' : 'right';
            setFont(ctx, 12, '800');
            ctx.fillStyle = palette.secondary;
            ctx.fillText(recipe.label, x + side * 12, y - 10);
            drawRule(ctx, x, y, x, y + height, 'rgba(219, 239, 241, 0.54)', 2);
            for (var tick = 0; tick <= 4; tick += 1) {
                var tickY = y + height * tick / 4;
                drawRule(ctx, x, tickY, x + side * 8, tickY, 'rgba(219, 239, 241, 0.55)', 1);
            }
            if (available) {
                drawRule(ctx, x, y + height, x, y + height - activeHeight, recipe.activeColor || palette.primary, 4);
                setFont(ctx, 13, '800');
                ctx.fillStyle = palette.text;
                ctx.fillText(Math.round(ratio * 100) + '%', x + side * 12, y + height + 16);
            } else {
                setFont(ctx, 13, '700');
                ctx.fillStyle = 'rgba(219, 239, 241, 0.46)';
                ctx.fillText('--', x + side * 12, y + height + 16);
            }
            ctx.restore();
        }

        function drawTrackFooter(view, data, palette, recipe) {
            var heading = view.getTelemetryReadout('heading', data);
            var odometer = view.getTelemetryReadout('odometer', data);
            var rpm = view.getTelemetryReadout('rpm', data);
            var gear = view.getGearLabel(data);
            var centerX = recipe.centerX;
            var y = recipe.y;
            var transmission = gear === 'R' || gear === 'N' ? gear : (gear === '--' ? '--' : 'D');
            var transmissionLabels = ['P', 'R', 'N', 'D', 'M'];

            ctx.save();
            drawRule(ctx, recipe.x, y - 16, recipe.x + recipe.width, y - 16, 'rgba(194, 226, 234, 0.24)');
            setFont(ctx, 12, '700');
            ctx.fillStyle = palette.secondary;
            ctx.textAlign = 'right';
            ctx.fillText(rpm.value + ' ' + rpm.unit, centerX - 202, y);
            ctx.textAlign = 'center';
            ctx.fillText(heading.value, centerX - 70, y);
            ctx.fillText(odometer.value + ' ' + odometer.unit, centerX + 104, y);
            setFont(ctx, 21, '800');
            for (var index = 0; index < transmissionLabels.length; index += 1) {
                var label = transmissionLabels[index];
                ctx.textAlign = 'center';
                ctx.fillStyle = label === transmission ? palette.primary : palette.text;
                ctx.fillText(label, centerX - 48 + index * 24, y + 31);
            }
            ctx.restore();
        }

        return {
            drawSmokedInfoPanel: drawSmokedInfoPanel,
            drawTireOverview: drawTireOverview,
            drawTrackFooter: drawTrackFooter,
            drawVerticalRail: drawVerticalRail,
            drawTachometer: drawTachometer
        };
    }

    window.S650HmiClusterComponents = { create: create };
})(window);
