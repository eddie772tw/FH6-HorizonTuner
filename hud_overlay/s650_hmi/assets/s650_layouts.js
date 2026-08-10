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
        var speedScaleMax = gauge.speedScaleMax;
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
                speed: Object.freeze({ centerX: 640, y: 190, size: type.speedHero + 12 }),
                carousel: Object.freeze({ centerX: 640, y: 399 })
            }),
            foxbody: Object.freeze({
                speed: Object.freeze({ centerX: 640, y: 202, size: 58 }),
                carousel: Object.freeze({ centerX: 640, y: 399 })
            }),
            heritage67: Object.freeze({
                speed: Object.freeze({ centerX: 640, y: 214, size: 58 }),
                carousel: Object.freeze({ centerX: 640, y: 399 })
            })
        });

        function drawBaseDriving(data, palette, theme) {
            var region = baseDrivingRegions[theme];
            if (baseDriving && region) {
                baseDriving.draw(view, data, palette, region);
            }
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

        function drawNormal(data, palette, redlineRatio) {
            clear(palette);
            p.drawHeader(view, palette, view.theme.toUpperCase(), view.theme === 'normal' ? 'BALANCED CLUSTER' : 'MVP FALLBACK');

            if (view.showSpeed) {
                p.drawArcGauge(view, data, palette, gauge.leftCenterX, gauge.centerY, gauge.radius, Math.PI * 0.78, Math.PI * 2.22,
                    view.getSpeed(data) / speedScaleMax, 'SPEED', view.roundedSpeed(data), view.unitLabel(), {
                        valueSize: type.bodyM,
                        activeColor: palette.primary
                    });
            }
            if (view.showRPM) {
                p.drawArcGauge(view, data, palette, gauge.rightCenterX, gauge.centerY, gauge.radius, Math.PI * 0.78, Math.PI * 2.22,
                    view.getRpm(data) / view.getMaxRpm(data), 'RPM', Math.round(view.getRpm(data) / 100) * 100, 'RPM', {
                        valueSize: type.bodyM,
                        activeColor: palette.primary,
                        redlineRatio: redlineRatio
                    });
            }

            p.drawRoundedPanel(410, 102, 460, 274, 12, palette.surface, 'rgba(255, 255, 255, 0.12)');
            ctx.save();
            ctx.strokeStyle = palette.primary;
            ctx.globalAlpha = 0.65;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(456, 144);
            ctx.lineTo(824, 144);
            ctx.stroke();
            ctx.restore();

            drawBaseDriving(data, palette, 'normal');
            drawCenterInfo(data, palette, 'normal');
            p.drawPedalBars(view, data, palette, 454, 390, 170, true);
            p.drawPedalBars(view, data, palette, 656, 390, 170, true);

            ctx.save();
            p.setFont(type.captionLegal, '700');
            ctx.fillStyle = palette.secondary;
            ctx.textAlign = 'center';
            if (view.showSpeed) ctx.fillText('SPEED', gauge.leftCenterX, 440);
            if (view.showRPM) ctx.fillText('ENGINE', gauge.rightCenterX, 440);
            ctx.restore();
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
            p.drawHeritageSideGauge(gauge.leftCenterX, gauge.centerY + 1, leftSideReadout.unit, leftSideReadout.ratio, {
                startText: leftSideReadout.min,
                endText: leftSideReadout.max,
                valueText: leftSideReadout.value,
                valueUnit: leftSideReadout.unit,
                showText: false,
                auxiliaryLabel: 'POWER',
                labelSize: type.heritageDialAuxLabel,
                labelOffset: type.heritageDialAuxLabelOffset,
                radius: gauge.radius + 24
            });
            p.drawHeritageSideGauge(gauge.rightCenterX, gauge.centerY + 1, rightSideReadout.unit, rightSideReadout.ratio, {
                startText: rightSideReadout.min,
                endText: rightSideReadout.max,
                valueText: rightSideReadout.value,
                valueUnit: rightSideReadout.unit,
                showText: false,
                auxiliaryLabel: 'BOOST',
                labelSize: type.heritageDialAuxLabel,
                labelOffset: type.heritageDialAuxLabelOffset,
                activeColor: '#E9EFF0',
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
