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

        function clearAndPaintBackground(palette, width, height, transparent) {
            ctx.clearRect(0, 0, width, height);
            if (transparent) return;
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
            var headerY = Math.round(view.height * 0.08);
            var edge = Math.round(view.width * 0.038);
            ctx.save();
            setFont(fontSize(view, 'captionLegal', 16), '700');
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';
            ctx.fillStyle = palette.secondary;
            ctx.fillText('MUSTANG // S650', edge, headerY);
            ctx.textAlign = 'right';
            ctx.fillStyle = palette.primary;
            ctx.fillText(label, view.width - edge, headerY);
            if (rightLabel) {
                ctx.textAlign = 'left';
                ctx.fillStyle = palette.secondary;
                ctx.fillText(rightLabel, edge + 140, headerY);
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
            if (view.showGear && options.showGear !== false) {
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

        function drawGearCarousel(view, data, palette, centerX, centerY) {
            if (!view.showGear) return;
            var position = view.getGearCarousel(data);
            var labels = ['R', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
            var first = Math.max(0, Math.floor(position) - 3);
            var last = Math.min(labels.length - 1, Math.ceil(position) + 3);
            var spacing = 28;

            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            for (var index = first; index <= last; index += 1) {
                var distance = Math.abs(index - position);
                var emphasis = Math.max(0, 1 - distance / 2.7);
                var size = 14 + emphasis * 14;
                ctx.globalAlpha = 0.18 + emphasis * 0.82;
                setFont(size, '700', 'ForzaGear');
                ctx.fillStyle = distance < 0.5 ? palette.primary : palette.text;
                ctx.fillText(labels[index], centerX + (index - position) * spacing, centerY);
            }
            ctx.globalAlpha = 1;
            ctx.strokeStyle = 'rgba(214, 221, 219, 0.28)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(centerX - 16, centerY - 18);
            ctx.lineTo(centerX + 16, centerY - 18);
            ctx.moveTo(centerX - 16, centerY + 18);
            ctx.lineTo(centerX + 16, centerY + 18);
            ctx.stroke();
            ctx.restore();
        }

        function drawHeritageBackdrop(view) {
            var centerY = view.height * 0.52;
            var centerGlow = ctx.createRadialGradient(view.width / 2, centerY, 28, view.width / 2, centerY, 500);
            centerGlow.addColorStop(0, 'rgba(94, 80, 67, 0.32)');
            centerGlow.addColorStop(0.42, 'rgba(31, 28, 26, 0.18)');
            centerGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.save();
            ctx.fillStyle = centerGlow;
            ctx.fillRect(0, 0, view.width, view.height);
            ctx.restore();
        }

        function getHeritageDialScale(maximum, targetIntervals) {
            var target = Math.max(1, maximum || 1);
            var desired = targetIntervals || 8;
            var multipliers = [1, 2, 2.5, 5, 10];
            var exponent = Math.floor(Math.log(target / desired) / Math.LN10);
            var best = null;

            for (var power = exponent - 1; power <= exponent + 2; power += 1) {
                var magnitude = Math.pow(10, power);
                for (var index = 0; index < multipliers.length; index += 1) {
                    var step = multipliers[index] * magnitude;
                    if (!Number.isFinite(step) || step <= 0) continue;
                    var intervals = Math.ceil(target / step);
                    if (intervals < 5 || intervals > 14) continue;
                    var visualMax = intervals * step;
                    var score = Math.abs(intervals - desired) + ((visualMax - target) / target) * 1.5;
                    if (!best || score < best.score || (score === best.score && visualMax < best.max)) {
                        best = { max: visualMax, majorStep: step, majorCount: intervals, score: score };
                    }
                }
            }

            if (!best) {
                var fallbackStep = Math.ceil(target / desired);
                best = { max: fallbackStep * desired, majorStep: fallbackStep, majorCount: desired };
            }
            best.minorPerMajor = 5;
            best.minorCount = best.majorCount * best.minorPerMajor;
            return best;
        }

        function drawHeritageDial(view, palette, cx, cy, radius, ratio, options) {
            options = options || {};
            var startAngle = Math.PI * 0.70;
            var endAngle = Math.PI * 2.30;
            var min = options.min || 0;
            var scale = options.scale || getHeritageDialScale(options.max || 160);
            var max = scale.max;
            var majorStep = scale.majorStep;
            var majorCount = scale.majorCount;
            var minorPerMajor = scale.minorPerMajor;
            var minorCount = scale.minorCount;
            var redlineFrom = options.redlineFrom;
            var faceLabel = options.faceLabel || '';
            var needleColor = options.needleColor || '#F1373F';
            var needleAngle = startAngle + (endAngle - startAngle) * clamp(ratio, 0, 1);
            var bezelGradient = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
            bezelGradient.addColorStop(0, '#2B3034');
            bezelGradient.addColorStop(0.18, '#EDF6F7');
            bezelGradient.addColorStop(0.37, '#6C757D');
            bezelGradient.addColorStop(0.58, '#F6FFFF');
            bezelGradient.addColorStop(0.78, '#525A60');
            bezelGradient.addColorStop(1, '#DCE7E9');

            ctx.save();
            ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
            ctx.shadowBlur = 14;
            ctx.beginPath();
            ctx.arc(cx, cy, radius + 7, 0, Math.PI * 2);
            ctx.fillStyle = '#090A0B';
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.arc(cx, cy, radius + 5, 0, Math.PI * 2);
            ctx.strokeStyle = bezelGradient;
            ctx.lineWidth = 6;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.fillStyle = '#111214';
            ctx.fill();
            ctx.strokeStyle = 'rgba(223, 243, 247, 0.68)';
            ctx.lineWidth = 1;
            ctx.stroke();

            for (var tick = 0; tick <= minorCount; tick += 1) {
                var tickRatio = tick / minorCount;
                var tickAngle = startAngle + (endAngle - startAngle) * tickRatio;
                var isMajor = tick % minorPerMajor === 0;
                var currentValue = isMajor
                    ? min + (tick / minorPerMajor) * majorStep
                    : min + (max - min) * tickRatio;
                var tickOuter = radius - 8;
                var tickInner = tickOuter - (isMajor ? 15 : 8);
                ctx.beginPath();
                ctx.moveTo(cx + Math.cos(tickAngle) * tickInner, cy + Math.sin(tickAngle) * tickInner);
                ctx.lineTo(cx + Math.cos(tickAngle) * tickOuter, cy + Math.sin(tickAngle) * tickOuter);
                ctx.strokeStyle = redlineFrom !== undefined && currentValue >= redlineFrom ? needleColor : '#E9EFF0';
                ctx.lineWidth = isMajor ? 2 : 1;
                ctx.stroke();

                if (isMajor) {
                    var labelRadius = radius - fontSize(view, 'heritageDialTickInset', 58);
                    var label = String(Math.round(currentValue));
                    setFont(fontSize(view, 'heritageDialTickNumber', 200), '100', 'RobotoFlexDial');
                    ctx.save();
                    ctx.translate(cx + Math.cos(tickAngle) * labelRadius, cy + Math.sin(tickAngle) * labelRadius);
                    // Tangential rotation keeps each label aligned with its own
                    // tick while the upper-center reading remains horizontal.
                    ctx.rotate(tickAngle + Math.PI / 2);
                    // Canvas does not consistently honor variable-font width
                    // axes. Compress locally so the dial keeps its narrow,
                    // heritage-style numerals in every host browser.
                    ctx.scale(fontSize(view, 'heritageDialTickWidthScale', 1), 1);
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = redlineFrom !== undefined && currentValue >= redlineFrom ? needleColor : '#F2F5F3';
                    ctx.fillText(label, 0, 0);
                    ctx.restore();
                }
            }

            setFont(fontSize(view, 'heritageDialFaceLabel', 14), '400', 'Impact');
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#E7ECEB';
            ctx.fillText(faceLabel, cx, cy - radius * fontSize(view, 'heritageDialFaceLabelOffset', 0.42));

            ctx.save();
            ctx.shadowColor = 'rgba(255, 0, 0, 0.55)';
            ctx.shadowBlur = 5;
            ctx.beginPath();
            ctx.moveTo(cx - Math.cos(needleAngle + Math.PI / 2) * 2.5, cy - Math.sin(needleAngle + Math.PI / 2) * 2.5);
            ctx.lineTo(cx + Math.cos(needleAngle) * (radius - 25), cy + Math.sin(needleAngle) * (radius - 25));
            ctx.lineTo(cx + Math.cos(needleAngle + Math.PI / 2) * 2.5, cy + Math.sin(needleAngle + Math.PI / 2) * 2.5);
            ctx.closePath();
            ctx.fillStyle = needleColor;
            ctx.fill();
            ctx.restore();

            var hubGradient = ctx.createRadialGradient(cx - 3, cy - 4, 2, cx, cy, 20);
            hubGradient.addColorStop(0, '#F1F7F6');
            hubGradient.addColorStop(0.42, '#8D989A');
            hubGradient.addColorStop(0.76, '#2D3335');
            hubGradient.addColorStop(1, '#C6D0CF');
            ctx.beginPath();
            ctx.arc(cx, cy, 19, 0, Math.PI * 2);
            ctx.fillStyle = hubGradient;
            ctx.fill();
            ctx.strokeStyle = '#EAF5F4';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx, cy, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#08090A';
            ctx.fill();
            ctx.restore();
        }

        function drawHeritageSideGauge(x, y, label, ratio, options) {
            options = options || {};
            var available = ratio !== null && ratio !== undefined;
            // One eighth of a circle, starting at the outward horizontal
            // tangent and descending toward the lower edge of each dial.
            var arcLength = Math.PI * 0.25;
            var start = options.mirror ? 0 : Math.PI;
            var direction = options.mirror ? 1 : -1;
            var end = start + direction * arcLength;
            // The visual scale reads bottom-to-top: minimum at the descending
            // endpoint, maximum at the outward horizontal start point.
            var indicatorAngle = end - direction * arcLength * (available ? clamp(ratio, 0, 1) : 0.5);
            var activeColor = options.activeColor || '#E9EFF0';
            var radius = options.radius || 205;
            var tickOuter = radius;
            var tickInnerMajor = radius - 17;
            var tickInnerMinor = radius - 9;
            var outward = options.mirror ? 1 : -1;
            var readoutX = x + outward * (radius + 14);
            ctx.save();
            ctx.lineCap = 'butt';
            ctx.beginPath();
            ctx.arc(x, y, radius, start, end, !options.mirror);
            ctx.strokeStyle = 'rgba(235, 243, 243, 0.68)';
            ctx.lineWidth = 6;
            ctx.stroke();
            for (var i = 0; i <= 4; i += 1) {
                var angle = start + direction * arcLength * i / 4;
                var outer = tickOuter;
                var inner = i % 2 === 0 ? tickInnerMajor : tickInnerMinor;
                ctx.beginPath();
                ctx.moveTo(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner);
                ctx.lineTo(x + Math.cos(angle) * outer, y + Math.sin(angle) * outer);
                ctx.strokeStyle = i === 0 && options.dangerAtStart ? '#F1373F' : '#E9EFF0';
                ctx.lineWidth = 2;
                ctx.stroke();
            }
            ctx.beginPath();
            ctx.arc(x, y, radius, end, indicatorAngle, options.mirror);
            ctx.strokeStyle = available ? activeColor : 'rgba(233, 239, 240, 0.28)';
            ctx.lineWidth = 4;
            ctx.stroke();
            if (options.showText === false) {
                if (options.auxiliaryLabel) {
                    var labelAngle = start + direction * arcLength * 0.5;
                    var labelRadius = radius + (options.labelOffset || 21);
                    setFont(options.labelSize || 10, '400', 'Impact');
                    // Grow labels toward the canvas interior: their anchor is
                    // intentionally beyond the auxiliary arc near each edge.
                    ctx.textAlign = options.mirror ? 'right' : 'left';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = '#D6DCDB';
                    ctx.fillText(options.auxiliaryLabel, x + Math.cos(labelAngle) * labelRadius, y + Math.sin(labelAngle) * labelRadius);
                }
                ctx.restore();
                return;
            }
            setFont(12, '700', 'Arial Narrow');
            ctx.textAlign = options.mirror ? 'left' : 'right';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#E9EFF0';
            ctx.fillText(options.endText || '', readoutX, y - 25);
            ctx.fillText(options.startText || '', readoutX, y + 47);
            if (options.valueText !== undefined) {
                setFont(16, '700', 'ForzaGear');
                ctx.fillStyle = '#F4F7F6';
                ctx.fillText(options.valueText, readoutX, y + 6);
                setFont(9, '700', 'Arial Narrow');
                ctx.fillStyle = '#B8C0C1';
                ctx.fillText(options.valueUnit || label, readoutX, y + 22);
            } else {
                setFont(11, '700', 'Arial Narrow');
                ctx.fillStyle = '#B8C0C1';
                ctx.fillText(label, readoutX, y + 19);
            }
            ctx.restore();
        }

        function drawHeritageStatus(view, data, slots) {
            var centerX = view.width / 2;
            var topLeft = view.getTelemetryReadout(slots.topLeft, data);
            var topRight = view.getTelemetryReadout(slots.topRight, data);
            var bottomLeft = view.getTelemetryReadout(slots.bottomLeft, data);
            var bottomRight = view.getTelemetryReadout(slots.bottomRight, data);

            function text(readout) {
                return readout.value + (readout.unit ? ' ' + readout.unit : '');
            }

            ctx.save();
            ctx.textBaseline = 'middle';
            setFont(fontSize(view, 'heritageCenterTopReadout', 18), '700', 'Arial Narrow');
            ctx.fillStyle = '#D6DCDB';
            ctx.textAlign = 'right';
            ctx.fillText(text(topLeft), centerX - 115, 82);
            ctx.textAlign = 'left';
            ctx.fillText(text(topRight), centerX + 115, 82);
            ctx.strokeStyle = 'rgba(207, 216, 215, 0.28)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(centerX - 118, 84);
            ctx.lineTo(centerX + 118, 84);
            ctx.stroke();
            setFont(fontSize(view, 'heritageCenterBottomReadout', 15), '700', 'Arial Narrow');
            ctx.fillStyle = '#C5CDCC';
            ctx.textAlign = 'right';
            ctx.fillText(text(bottomLeft), centerX - 110, 392);
            ctx.textAlign = 'left';
            ctx.fillText(text(bottomRight), centerX + 110, 392);
            ctx.strokeStyle = 'rgba(201, 112, 73, 0.72)';
            ctx.beginPath();
            ctx.moveTo(centerX - 176, 410);
            ctx.lineTo(centerX - 118, 410);
            ctx.moveTo(centerX + 118, 410);
            ctx.lineTo(centerX + 176, 410);
            ctx.stroke();
            ctx.restore();
        }

        function drawTireTemperatureWidget(view, data, palette, x, y, width, height) {
            var cx = x + width / 2;
            var temps = view.getTireTemperatures(data);
            var hasTemperature = temps.some(function (value) { return value !== null; });
            var valueSpread = Math.min(width * 0.18, 76);
            var labels = ['FL', 'FR', 'RL', 'RR'];
            var positions = [
                { x: cx - valueSpread, y: y + 48, align: 'right' },
                { x: cx + valueSpread, y: y + 48, align: 'left' },
                { x: cx - valueSpread, y: y + height - 17, align: 'right' },
                { x: cx + valueSpread, y: y + height - 17, align: 'left' }
            ];
            ctx.save();
            setFont(fontSize(view, 'dualRingCenterTitle', 18), '700', 'Arial Narrow');
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#F3F5F4';
            ctx.fillText('TIRE TEMPERATURE', cx, y + 7);
            setFont(fontSize(view, 'dualRingCenterSubtitle', 12), '700', 'Arial Narrow');
            ctx.fillStyle = '#CDD5D4';
            ctx.fillText(hasTemperature ? view.tireTemperatureUnit() : 'SENSOR UNAVAILABLE', cx, y + 23);

            ctx.strokeStyle = 'rgba(96, 142, 210, 0.78)';
            ctx.fillStyle = 'rgba(35, 77, 137, 0.50)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(cx - 20, y + 37);
            ctx.lineTo(cx + 20, y + 37);
            ctx.lineTo(cx + 23, y + height / 2);
            ctx.lineTo(cx + 13, y + height - 20);
            ctx.lineTo(cx - 13, y + height - 20);
            ctx.lineTo(cx - 23, y + height / 2);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = 'rgba(128, 177, 244, 0.58)';
            ctx.fillRect(cx - 30, y + 44, 7, 21);
            ctx.fillRect(cx + 23, y + 44, 7, 21);
            ctx.fillRect(cx - 30, y + height - 56, 7, 21);
            ctx.fillRect(cx + 23, y + height - 56, 7, 21);

            ctx.strokeStyle = 'rgba(231, 236, 235, 0.62)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(cx - valueSpread + 5, y + 52); ctx.lineTo(cx - 31, y + 52);
            ctx.moveTo(cx - valueSpread + 5, y + height - 22); ctx.lineTo(cx - 31, y + height - 22);
            ctx.moveTo(cx + 31, y + 52); ctx.lineTo(cx + valueSpread - 5, y + 52);
            ctx.moveTo(cx + 31, y + height - 22); ctx.lineTo(cx + valueSpread - 5, y + height - 22);
            ctx.stroke();

            for (var index = 0; index < positions.length; index += 1) {
                var position = positions[index];
                ctx.textAlign = position.align;
                setFont(fontSize(view, 'dualRingCenterValue', 18), '700', 'Arial Narrow');
                ctx.fillStyle = temps[index] === null ? '#AEB8B7' : '#FFFFFF';
                ctx.fillText(view.formatTireTemperature(temps[index]), position.x, position.y);
                setFont(fontSize(view, 'dualRingCenterPosition', 10), '700', 'Arial Narrow');
                ctx.fillStyle = '#CDD5D4';
                ctx.fillText(labels[index], position.x, position.y + 12);
            }
            ctx.restore();
        }

        function drawPerformanceWidget(view, data, palette, x, y, width, height) {
            var centerX = x + width / 2;
            var rpm = Math.round(view.getRpm(data));
            var maxRpm = Math.round(view.getMaxRpm(data));
            var throttle = Math.round(view.getPedalValue(data, 'throttle') * 100);
            var brake = Math.round(view.getPedalValue(data, 'brake') * 100);
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            setFont(16, '700', 'Arial Narrow');
            ctx.fillStyle = palette.text;
            ctx.fillText('PERFORMANCE', centerX, y + 16);
            setFont(12, '700', 'Arial Narrow');
            ctx.fillStyle = palette.secondary;
            ctx.fillText(rpm + ' / ' + maxRpm + ' RPM', centerX, y + 40);
            setFont(42, '700', 'ForzaGear');
            ctx.fillStyle = palette.primary;
            ctx.fillText(view.getGearLabel(data), centerX, y + 76);
            setFont(11, '700', 'Arial Narrow');
            ctx.fillStyle = palette.secondary;
            ctx.textAlign = 'left';
            ctx.fillText('THR ' + throttle + '%', x + 36, y + height - 15);
            ctx.textAlign = 'right';
            ctx.fillText('BRK ' + brake + '%', x + width - 36, y + height - 15);
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
            drawGearCarousel: drawGearCarousel,
            drawHeader: drawHeader,
            drawShiftLights: drawShiftLights,
            drawRpmBand: drawRpmBand,
            drawMinimalRpmBar: drawMinimalRpmBar,
            drawRetroDial: drawRetroDial,
            drawRetroCenter: drawRetroCenter,
            getHeritageDialScale: getHeritageDialScale,
            drawHeritageBackdrop: drawHeritageBackdrop,
            drawHeritageDial: drawHeritageDial,
            drawHeritageSideGauge: drawHeritageSideGauge,
            drawHeritageStatus: drawHeritageStatus,
            drawTireTemperatureWidget: drawTireTemperatureWidget,
            drawPerformanceWidget: drawPerformanceWidget,
            drawCobraReadout: drawCobraReadout
        };
    }

    window.S650HmiPrimitives = {
        create: createPrimitives
    };
})(window);
