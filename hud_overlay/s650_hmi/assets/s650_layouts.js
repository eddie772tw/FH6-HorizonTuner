/* S650 dashboard layouts. Peripheral/companion systems deliberately do not live here. */
(function (window) {
    'use strict';

    function createLayouts(options) {
        var ctx = options.ctx;
        var contract = options.contract || window.S650HmiContract;
        var view = options.view;
        var p = options.primitives;
        var baseDriving = options.baseDriving;
        var centerInfo = options.centerInfo;
        var width = options.width;
        var height = options.height;
        var gauge = view.gauge;
        var type = view.typography;
        var centerRegions = Object.freeze({
            normal: Object.freeze({
                x: 425,
                y: 132,
                width: 430,
                height: 224,
                centerX: 640,
                speedY: 190,
                gearY: 302,
                speedSize: type.speedHero + 12,
                gearSize: type.speedHero + 18
            }),
            foxbody: Object.freeze({ x: 425, y: 122, width: 430, height: 210 }),
            heritage67: Object.freeze({ x: 425, y: 126, width: 430, height: 230 })
        });
        var baseDrivingRegions = Object.freeze({
            normal: Object.freeze({
                carousel: Object.freeze({ centerX: 640, y: 399 })
            }),
            foxbody: Object.freeze({
                carousel: Object.freeze({ centerX: 640, y: 399 })
            }),
            heritage67: Object.freeze({
                carousel: Object.freeze({ centerX: 640, y: 399 })
            })
        });

        function drawBaseDriving(data, palette, theme) {
            var region = baseDrivingRegions[theme];
            if (baseDriving && region) {
                baseDriving.draw(view, data, palette, region);
            }
        }

        function drawSideGauges(data, palette) {
            var slots = contract && contract.heritageTelemetrySlots && contract.heritageTelemetrySlots.side;
            var drawSideGauge = p.drawSideGauge || p.drawHeritageSideGauge;
            if (!slots || typeof view.getTelemetryReadout !== 'function' || typeof drawSideGauge !== 'function') return;

            var leftSideReadout = view.getTelemetryReadout(slots.left, data);
            var rightSideReadout = view.getTelemetryReadout(slots.right, data);
            var sharedOptions = {
                showText: false,
                labelSize: type.heritageDialAuxLabel,
                labelOffset: type.heritageDialAuxLabelOffset,
                radius: gauge.radius + 24,
                activeColor: palette.primary,
                pointerColor: palette.primary,
                tickColor: palette.secondary
            };

            drawSideGauge(gauge.leftCenterX, gauge.centerY + 1, leftSideReadout.unit, leftSideReadout.ratio, Object.assign({}, sharedOptions, {
                auxiliaryLabel: 'POWER'
            }));
            drawSideGauge(gauge.rightCenterX, gauge.centerY + 1, rightSideReadout.unit, rightSideReadout.ratio, Object.assign({}, sharedOptions, {
                auxiliaryLabel: 'BOOST',
                mirror: true
            }));
        }

        function drawNormalFixedReadouts(data, palette) {
            var slots = contract && contract.heritageTelemetrySlots && contract.heritageTelemetrySlots.center;
            if (!slots || typeof view.getTelemetryReadout !== 'function' || typeof p.drawNormalStatus !== 'function') return;
            p.drawNormalStatus(view, data, palette, slots, {
                centerX: 640,
                topOffset: 147,
                bottomOffset: 141,
                topY: 82,
                bottomY: 374
            });
        }

        function drawCenterInfo(data, palette, theme) {
            var region = centerRegions[theme] || centerRegions.normal;
            if (view.showCenterInfo === false || !centerInfo || typeof centerInfo.draw !== 'function') return;
            centerInfo.draw(view, data, palette, region);
        }

        function clear(palette, transparent) {
            // The overlay host owns the backdrop. Every S650 theme paints only
            // its instruments, preserving transparency outside the HMI marks.
            p.clearAndPaintBackground(palette, width, height, true);
        }

        function normalSpeedScale(view) {
            return view.isMetric === false ? 180 : 300;
        }

        function normalSpeedTicks(view) {
            var divisions = view.isMetric === false ? 9 : 10;
            var maximum = normalSpeedScale(view);
            var labels = [];
            for (var index = 0; index <= divisions; index += 1) {
                labels.push(String(Math.round(maximum * index / divisions)));
            }
            return { count: divisions, labels: labels };
        }

        function normalRpmTicks(view, data) {
            var maximum = Math.max(1, Math.round(view.getMaxRpm(data) / 1000));
            var labels = [];
            for (var index = 0; index <= maximum; index += 1) {
                labels.push(String(index));
            }
            return { count: maximum, labels: labels };
        }

        function drawNormalDecorations(palette) {
            ctx.save();
            ctx.strokeStyle = palette.secondary;
            ctx.globalAlpha = 0.24;
            ctx.lineWidth = 1;
            ctx.beginPath();
            // The reference cluster uses lines to divide information groups;
            // these remain meaningful after the global background is removed.
            ctx.moveTo(456, 144);
            ctx.lineTo(824, 144);
            ctx.moveTo(640, 158);
            ctx.lineTo(640, 348);
            // Keep the lower guide above the fixed readouts and the shared
            // gear carousel; it is a center-panel separator, not a footer.
            ctx.moveTo(425, 350);
            ctx.lineTo(580, 350);
            ctx.moveTo(700, 350);
            ctx.lineTo(855, 350);
            ctx.stroke();
            ctx.restore();
        }

        function drawNormal(data, palette, redlineRatio) {
            clear(palette);
            p.drawHeader(view, palette, view.theme.toUpperCase(), view.theme === 'normal' ? 'BALANCED CLUSTER' : 'MVP FALLBACK');
            drawSideGauges(data, palette);

            if (view.showSpeed) {
                var speedTicks = normalSpeedTicks(view);
                p.drawNormalEnergyDial(view, palette, gauge.rightCenterX, gauge.centerY, gauge.radius,
                    view.getSpeed(data) / normalSpeedScale(view), 1, 'SPEED', view.roundedSpeed(data), view.unitLabel(), {
                        tickCount: speedTicks.count,
                        tickLabels: speedTicks.labels,
                        valueSize: type.bodyM,
                        activeColor: palette.primary
                    });
            }
            if (view.showRPM) {
                var rpmTicks = normalRpmTicks(view, data);
                p.drawNormalEnergyDial(view, palette, gauge.leftCenterX, gauge.centerY, gauge.radius,
                    view.getRpm(data) / view.getMaxRpm(data), redlineRatio, 'RPMx1000', Math.round(view.getRpm(data) / 100) * 100, '', {
                        tickCount: rpmTicks.count,
                        tickLabels: rpmTicks.labels,
                        valueSize: type.bodyM,
                        activeColor: palette.primary,
                        redlineRatio: redlineRatio
                    });
            }

            drawNormalDecorations(palette);

            drawBaseDriving(data, palette, 'normal');
            drawCenterInfo(data, palette, 'normal');
            drawNormalFixedReadouts(data, palette);
            p.drawPedalBars(view, data, palette, 454, 405, 170, true);
            p.drawPedalBars(view, data, palette, 656, 405, 170, true);
        }

        function drawFoxbody(data, palette, redlineRatio) {
            clear(palette);
            p.drawHeader(view, palette, 'FOXBODY', 'ANALOG // NIGHT');

            var pointer = '#FF7A3D';
            if (view.showSpeed) {
                p.drawRetroDial(view, data, palette, gauge.leftCenterX, gauge.centerY, gauge.radius, view.getSpeed(data) / speedScaleMax, 1,
                    'SPEED', view.roundedSpeed(data), view.unitLabel(), {
                        pointerColor: pointer,
                        ringColor: palette.primary,
                        ringHighlight: palette.primary,
                        tickColor: palette.secondary,
                        valueSize: type.bodyM,
                        baseWidth: 7
                    });
            }
            if (view.showRPM) {
                p.drawRetroDial(view, data, palette, gauge.rightCenterX, gauge.centerY, gauge.radius, view.getRpm(data) / view.getMaxRpm(data), redlineRatio,
                    'RPM', Math.round(view.getRpm(data) / 100) * 100, 'RPM', {
                        pointerColor: pointer,
                        ringColor: palette.primary,
                        ringHighlight: palette.primary,
                        tickColor: palette.secondary,
                        valueSize: type.bodyM,
                        baseWidth: 7
                    });
            }
            drawBaseDriving(data, palette, 'foxbody');
            drawCenterInfo(data, palette, 'foxbody');
        }

        function drawHeritage67(data, palette, redlineRatio) {
            clear(palette);
            var heritageSlots = contract.heritageTelemetrySlots;
            p.drawHeritageStatus(view, data, heritageSlots.center);

            // The center information intentionally sits below the dial layer. The
            // real cluster lets both rings overlap the center boundary, so the
            // rings and needles must always be painted after this content.
            drawBaseDriving(data, palette, 'heritage67');
            drawCenterInfo(data, palette, 'heritage67');

            var rpmScale = p.getHeritageDialScale(view.getMaxRpm(data) / 100);
            // Heritage speed markings are fixed by its analog face artwork;
            // only the tachometer uses the adaptive integer scale.
            var speedScale = view.isMetric
                ? { max: 300, majorStep: 30, majorCount: 10, minorPerMajor: 5, minorCount: 50 }
                : { max: 180, majorStep: 20, majorCount: 9, minorPerMajor: 5, minorCount: 45 };
            var rpmRatio = view.getRpm(data) / (rpmScale.max * 100);
            var speedRatio = view.getSpeed(data) / speedScale.max;
            // Heritage retains a broader all-red danger band than the other
            // dynamic styles: 1,500 RPM below a 10k limiter, 2,000 above it.
            var redlinePaddingRpm = view.getMaxRpm(data) > 10000 ? 2000 : 1500;
            var heritageRedlineStart = Math.max(0, (data.redlineRpm - redlinePaddingRpm) / 100);
            var leftSideReadout = view.getTelemetryReadout(heritageSlots.side.left, data);
            var rightSideReadout = view.getTelemetryReadout(heritageSlots.side.right, data);
            var drawSideGauge = p.drawSideGauge || p.drawHeritageSideGauge;
            drawSideGauge(gauge.leftCenterX, gauge.centerY + 1, leftSideReadout.unit, leftSideReadout.ratio, {
                startText: leftSideReadout.min,
                endText: leftSideReadout.max,
                valueText: leftSideReadout.value,
                valueUnit: leftSideReadout.unit,
                showText: false,
                auxiliaryLabel: 'POWER',
                labelSize: type.heritageDialAuxLabel,
                labelOffset: type.heritageDialAuxLabelOffset,
                activeColor: palette.primary,
                pointerColor: palette.primary,
                tickColor: palette.secondary,
                radius: gauge.radius + 24
            });
            drawSideGauge(gauge.rightCenterX, gauge.centerY + 1, rightSideReadout.unit, rightSideReadout.ratio, {
                startText: rightSideReadout.min,
                endText: rightSideReadout.max,
                valueText: rightSideReadout.value,
                valueUnit: rightSideReadout.unit,
                showText: false,
                auxiliaryLabel: 'BOOST',
                labelSize: type.heritageDialAuxLabel,
                labelOffset: type.heritageDialAuxLabelOffset,
                activeColor: palette.primary,
                pointerColor: palette.primary,
                tickColor: palette.secondary,
                mirror: true,
                radius: gauge.radius + 24
            });
            if (view.showSpeed) {
                p.drawHeritageDial(view, palette, gauge.rightCenterX, gauge.centerY + 1, gauge.radius - 5, speedRatio, {
                    scale: speedScale,
                    faceLabel: view.unitLabel(),
                    needleColor: '#F1373F'
                });
            }
            if (view.showRPM) {
                p.drawHeritageDial(view, palette, gauge.leftCenterX, gauge.centerY + 1, gauge.radius - 5, rpmRatio, {
                    scale: rpmScale,
                    redlineFrom: heritageRedlineStart,
                    faceLabel: 'RPM × 100',
                    needleColor: '#F1373F'
                });
            }
        }

        var layouts = {
            normal: drawNormal,
            foxbody: drawFoxbody,
            heritage67: drawHeritage67
        };

        return {
            render: function (theme, data, palette, redlineRatio) {
                var layout = layouts[theme] || layouts.normal;
                layout(data, palette, redlineRatio);
            },
            names: Object.keys(layouts),
            centerRegions: centerRegions,
            baseDrivingRegions: baseDrivingRegions
        };
    }

    window.S650HmiLayouts = {
        create: createLayouts
    };
})(window);
