/* Canvas primitives shared by every S650 theme layout. */
(function (window) {
    'use strict';

    function createPrimitives(ctx, contract) {
        var clamp = contract.clamp;

        function fontSize(view, role, fallback) {
            return view && view.typography && view.typography[role]
                ? view.typography[role]
                : fallback;
        }

        function setFont(size, weight, family) {
            ctx.font = (weight || '700') + ' ' + size + 'px ' + (family || 'ForzaGear') + ', Arial, sans-serif';
        }

        function clearAndPaintBackground(palette, width, height) {
            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = palette.background;
            ctx.fillRect(0, 0, width, height);

            var topFade = ctx.createLinearGradient(0, 0, 0, height);
            topFade.addColorStop(0, 'rgba(255, 255, 255, 0.035)');
            topFade.addColorStop(0.52, 'rgba(255, 255, 255, 0)');
            topFade.addColorStop(1, 'rgba(0, 0, 0, 0.18)');
            ctx.fillStyle = topFade;
            ctx.fillRect(0, 0, width, height);
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

        function drawArcGauge(view, data, palette, cx, cy, radius, startAngle, endAngle, ratio, label, value, unit, options) {
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

            var metrics = view.ergonomics || {};
            for (var tick = 0; tick <= 10; tick += 1) {
                var tickAngle = startAngle + (endAngle - startAngle) * tick / 10;
                var major = tick % 5 === 0;
                var tickOuter = radius - 13;
                var tickInner = radius - (major
                    ? (metrics.majorTickLengthPx || 26)
                    : (metrics.minorTickLengthPx || 14)) - 13;
                ctx.beginPath();
                ctx.moveTo(cx + Math.cos(tickAngle) * tickInner, cy + Math.sin(tickAngle) * tickInner);
                ctx.lineTo(cx + Math.cos(tickAngle) * tickOuter, cy + Math.sin(tickAngle) * tickOuter);
                ctx.strokeStyle = tick / 10 >= redlineRatio ? palette.danger : palette.secondary;
                ctx.lineWidth = major ? (metrics.majorTickWidthPx || 3) : (metrics.minorTickWidthPx || 2);
                ctx.stroke();
            }

            setFont(fontSize(view, 'captionLegal', 16), '700');
            ctx.fillStyle = palette.secondary;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, cx, cy + radius - 31);

            setFont(options.valueSize || fontSize(view, 'bodyM', 24), '700', options.valueFamily || 'ForzaGear');
            ctx.fillStyle = palette.text;
            ctx.fillText(value, cx, cy + 2);

            if (unit) {
                setFont(fontSize(view, 'captionLegal', 16), '700');
                ctx.fillStyle = palette.secondary;
                ctx.fillText(unit, cx, cy + 25);
            }
            ctx.restore();
        }

        function drawPedalBars(view, data, palette, x, y, width, compact) {
            var throttle = view.getPedalValue(data, 'throttle');
            var brake = view.getPedalValue(data, 'brake');
            var barHeight = compact ? 5 : 7;
            var gap = compact ? 7 : 9;
            var labelSize = fontSize(view, 'captionLegal', 16);

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

        function drawGearAndSpeed(view, data, palette, centerX, speedY, gearY, speedSize, gearSize, options) {
            options = options || {};
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            if (view.showSpeed && options.showSpeed !== false) {
                setFont(speedSize, '700', 'ForzaGear');
                ctx.fillStyle = palette.text;
                ctx.fillText(String(view.roundedSpeed(data)), centerX, speedY);

                setFont(fontSize(view, 'captionLegal', 16), '700');
                ctx.fillStyle = palette.secondary;
                ctx.fillText(view.unitLabel(), centerX, speedY + speedSize * 0.54);
            }

            if (view.showGear && options.showGear !== false) {
                setFont(gearSize, '700', 'ForzaGear');
                ctx.fillStyle = palette.primary;
                ctx.fillText(view.getGearLabel(data), centerX, gearY);
            }
            ctx.restore();
        }

        function drawHeader(view, palette, label, rightLabel) {
            ctx.save();
            setFont(fontSize(view, 'captionLegal', 16), '700');
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';
            ctx.fillStyle = palette.secondary;
            ctx.fillText('MUSTANG // S650', 34, 19);
            ctx.textAlign = 'right';
            ctx.fillStyle = palette.primary;
            ctx.fillText(label, view.width - 34, 19);
            if (rightLabel) {
                ctx.textAlign = 'left';
                ctx.fillStyle = palette.secondary;
                ctx.fillText(rightLabel, 174, 19);
            }
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

        function drawRpmBand(view, data, palette, redlineRatio, x, y, width, height, large) {
            var maxRpm = view.getMaxRpm(data);
            var rpmRatio = clamp(view.getRpm(data) / maxRpm, 0, 1);
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

            drawShiftLights(rpmRatio, palette, x, y + height + (large ? 10 : 6), width, large ? 18 : 12, large ? 12 : 16, large);
        }

        function drawMinimalRpmBar(view, data, palette, redlineRatio, x, y, width, height) {
            var maxRpm = view.getMaxRpm(data);
            var rpmRatio = clamp(view.getRpm(data) / maxRpm, 0, 1);
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

        function drawRetroDial(view, data, palette, cx, cy, radius, ratio, redlineRatio, label, value, unit, options) {
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
            var tickInner = radius - (tick % 5 === 0
                ? ((options.majorTickLength || 26) + 13)
                : ((options.minorTickLength || 14) + 13));
                ctx.beginPath();
                ctx.moveTo(cx + Math.cos(tickAngle) * tickInner, cy + Math.sin(tickAngle) * tickInner);
                ctx.lineTo(cx + Math.cos(tickAngle) * tickOuter, cy + Math.sin(tickAngle) * tickOuter);
                ctx.strokeStyle = tick / 10 >= redlineRatio ? palette.danger : tickColor;
            ctx.lineWidth = tick % 5 === 0 ? (options.majorTickWidth || 3) : (options.minorTickWidth || 2);
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

            setFont(fontSize(view, 'captionLegal', 16), '700');
            ctx.fillStyle = tickColor;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, cx, cy + radius - 31);

            setFont(options.valueSize || fontSize(view, 'bodyM', 24), '700', fontFamily);
            ctx.fillStyle = palette.text;
            ctx.fillText(value, cx, cy + 1);
            if (unit) {
                setFont(fontSize(view, 'captionLegal', 16), '700');
                ctx.fillStyle = tickColor;
                ctx.fillText(unit, cx, cy + 23);
            }
            ctx.restore();
        }

        function drawRetroCenter(view, data, palette, x, y, width, height, options) {
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

            setFont(fontSize(view, 'captionLegal', 16), '700');
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = secondary;
            ctx.fillText(options.label || 'GEAR', centerX, y + 16);
            if (view.showGear) {
                setFont(options.gearSize || 60, '700', options.fontFamily || 'ForzaGear');
                ctx.fillStyle = options.gearColor || palette.text;
                ctx.fillText(view.getGearLabel(data), centerX, y + height * 0.64);
            }
            if (view.showSpeed) {
                setFont(fontSize(view, 'captionLegal', 16), '700');
                ctx.fillStyle = secondary;
                ctx.fillText(String(view.roundedSpeed(data)) + ' ' + view.unitLabel(), centerX, y + height - 13);
            }
            ctx.restore();
        }

        function drawCobraReadout(view, label, value, unit, x, y, align, palette) {
            ctx.save();
            ctx.textAlign = align;
            ctx.textBaseline = 'middle';
            setFont(fontSize(view, 'captionLegal', 16), '700');
            ctx.fillStyle = palette.secondary;
            ctx.fillText(label, x, y - 31);
            setFont(fontSize(view, 'speedHero', 64), '700', 'ForzaGear');
            ctx.fillStyle = palette.text;
            ctx.fillText(String(value), x, y);
            setFont(fontSize(view, 'captionLegal', 16), '700');
            ctx.fillStyle = palette.secondary;
            ctx.fillText(unit, x, y + 28);
            ctx.restore();
        }

        return {
            setFont: setFont,
            clearAndPaintBackground: clearAndPaintBackground,
            drawRoundedPanel: drawRoundedPanel,
            drawArcGauge: drawArcGauge,
            drawPedalBars: drawPedalBars,
            drawGearAndSpeed: drawGearAndSpeed,
            drawHeader: drawHeader,
            drawShiftLights: drawShiftLights,
            drawRpmBand: drawRpmBand,
            drawMinimalRpmBar: drawMinimalRpmBar,
            drawRetroDial: drawRetroDial,
            drawRetroCenter: drawRetroCenter,
            drawCobraReadout: drawCobraReadout
        };
    }

    window.S650HmiPrimitives = {
        create: createPrimitives
    };
})(window);
