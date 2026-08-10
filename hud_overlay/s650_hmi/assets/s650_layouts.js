/* S650 dashboard layouts. Peripheral/companion systems deliberately do not live here. */
(function (window) {
    'use strict';

    function createLayouts(options) {
        var ctx = options.ctx;
        var contract = options.contract || window.S650HmiContract;
        var view = options.view;
        var p = options.primitives;
        var centerInfo = options.centerInfo;
        var width = options.width;
        var height = options.height;
        var gauge = view.gauge;
        var speedScaleMax = gauge.speedScaleMax;
        var type = view.typography;

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

            centerInfo.draw(view, data, palette, 425, 132, 430, 224);
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

        function drawCalm(data, palette, redlineRatio) {
            clear(palette);
            p.drawHeader(view, palette, 'CALM', 'REDUCED VIEW');

            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            if (view.showSpeed) {
                p.setFont(type.speedHero + 12, '700', 'ForzaGear');
                ctx.fillStyle = palette.text;
                ctx.fillText(String(view.roundedSpeed(data)), 630, 101);
                p.setFont(type.captionLegal, '700');
                ctx.fillStyle = palette.secondary;
                ctx.fillText(view.unitLabel(), 630, 139);
            }
            if (view.showGear) {
                p.setFont(type.headingL + 7, '700', 'ForzaGear');
                ctx.fillStyle = palette.primary;
                ctx.fillText(view.getGearLabel(data), 630, 176);
            }
            ctx.restore();

            if (view.showRPM) {
                ctx.save();
                p.setFont(type.captionLegal, '700');
                ctx.fillStyle = palette.secondary;
                ctx.textAlign = 'left';
                ctx.fillText('RPM', 252, 197);
                ctx.textAlign = 'right';
                ctx.fillText(Math.round(view.getRpm(data)) + ' / ' + Math.round(view.getMaxRpm(data)), 1008, 197);
                ctx.restore();
                p.drawMinimalRpmBar(view, data, palette, redlineRatio, 252, 207, 756, 7);
            }
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
            centerInfo.draw(view, data, palette);
            p.drawGearCarousel(view, data, palette, 640, 399);
        }

        function drawHeritage67(data, palette, redlineRatio) {
            clear(palette);
            var heritageSlots = contract.heritageTelemetrySlots;
            p.drawHeritageStatus(view, data, heritageSlots.center);

            // The center information intentionally sits below the dial layer. The
            // real cluster lets both rings overlap the center boundary, so the
            // rings and needles must always be painted after this content.
            centerInfo.draw(view, data, palette, 425, 126, 430, 230);

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

        function drawSvtCobra(data, palette, redlineRatio) {
            clear(palette);
            p.drawHeader(view, palette, 'SVT COBRA', 'HIGH CONTRAST // PERFORMANCE');
            if (view.showRPM) p.drawRpmBand(view, data, palette, redlineRatio, 78, 35, 1104, 24, true);

            ctx.save();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.30)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(78, 103);
            ctx.lineTo(1182, 103);
            ctx.moveTo(630, 111);
            ctx.lineTo(630, 219);
            ctx.stroke();
            ctx.restore();

            if (view.showSpeed) p.drawCobraReadout(view, 'SPEED', view.roundedSpeed(data), view.unitLabel(), 270, 160, 'center', palette);
            if (view.showRPM) p.drawCobraReadout(view, 'RPM', Math.round(view.getRpm(data) / 100) * 100, 'RPM', 990, 160, 'center', palette);

            if (view.showGear) {
                ctx.save();
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                p.setFont(type.captionLegal, '700');
                ctx.fillStyle = palette.secondary;
                ctx.fillText('GEAR', 630, 124);
                p.setFont(type.speedHero + 22, '700', 'ForzaGear');
                ctx.fillStyle = palette.text;
                ctx.fillText(view.getGearLabel(data), 630, 175);
                ctx.restore();
            }
        }

        function drawSport(data, palette, redlineRatio) {
            clear(palette);
            p.drawHeader(view, palette, 'SPORT', 'PERFORMANCE CLUSTER');
            if (view.showRPM) p.drawRpmBand(view, data, palette, redlineRatio, 108, 36, 1044, 28, false);

            if (view.showRPM) {
                ctx.save();
                p.setFont(type.captionLegal, '700');
                ctx.textAlign = 'left';
                ctx.fillStyle = palette.secondary;
                ctx.fillText('0', 108, 91);
                ctx.textAlign = 'right';
                ctx.fillText(Math.round(view.getMaxRpm(data) / 1000) + 'K RPM', 1152, 91);
                ctx.restore();
            }

            if (view.showSpeed) {
                p.drawArcGauge(view, data, palette, 228, 160, 52, Math.PI * 0.86, Math.PI * 2.14,
                    view.getSpeed(data) / speedScaleMax, 'SPEED', view.roundedSpeed(data), view.unitLabel(), {
                        lineWidth: 6,
                        valueSize: type.bodyM,
                        activeColor: palette.secondary
                    });
            }

            p.drawRoundedPanel(397, 95, 466, 115, 6, palette.surface, 'rgba(255, 181, 102, 0.34)');
            p.drawGearAndSpeed(view, data, palette, 630, 114, 184, type.speedHero - 8, type.speedHero + 3);

            ctx.save();
            p.setFont(type.captionLegal, '700');
            ctx.textAlign = 'center';
            ctx.fillStyle = palette.secondary;
            ctx.fillText('THROTTLE', 921, 119);
            ctx.fillText('BRAKE', 1042, 119);
            ctx.fillStyle = palette.primary;
            ctx.fillRect(906, 134, 151 * view.getPedalValue(data, 'throttle'), 7);
            ctx.fillStyle = palette.warning;
            ctx.fillRect(906, 153, 151 * view.getPedalValue(data, 'brake'), 7);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
            ctx.strokeRect(906, 134, 151, 7);
            ctx.strokeRect(906, 153, 151, 7);
            ctx.restore();
        }

        function drawTrack(data, palette, redlineRatio) {
            clear(palette);
            p.drawHeader(view, palette, 'TRACK', 'SHIFT PRIORITY');

            var bandX = 78;
            var bandWidth = 1104;
            if (view.showRPM) p.drawRpmBand(view, data, palette, redlineRatio, bandX, 35, bandWidth, 35, true);

            if (view.showRPM) {
                ctx.save();
                p.setFont(type.captionLegal, '700');
                ctx.fillStyle = palette.secondary;
                ctx.textAlign = 'left';
                ctx.fillText('RPM', bandX, 115);
                ctx.textAlign = 'right';
                ctx.fillText(Math.round(view.getRpm(data)) + ' / ' + Math.round(view.getMaxRpm(data)), bandX + bandWidth, 115);
                ctx.restore();
            }

            p.drawRoundedPanel(445, 124, 370, 92, 4, palette.surface, 'rgba(255, 255, 255, 0.18)');
            if (view.showGear) {
                ctx.save();
                p.setFont(type.captionLegal, '700');
                ctx.fillStyle = palette.secondary;
                ctx.textAlign = 'center';
                ctx.fillText('GEAR', 630, 138);
                p.setFont(type.speedHero + 12, '700', 'ForzaGear');
                ctx.fillStyle = palette.text;
                ctx.fillText(view.getGearLabel(data), 630, 182);
                ctx.restore();
            }

            if (view.showSpeed) {
                ctx.save();
                p.setFont(type.speedHero - 8, '700', 'ForzaGear');
                ctx.textAlign = 'left';
                ctx.fillStyle = palette.text;
                ctx.fillText(String(view.roundedSpeed(data)), 92, 169);
                p.setFont(type.captionLegal, '700');
                ctx.fillStyle = palette.secondary;
                ctx.fillText(view.unitLabel(), 94, 188);
                ctx.restore();
            }

            p.drawPedalBars(view, data, palette, 891, 151, 270, false);
        }

        var layouts = {
            normal: drawNormal,
            sport: drawSport,
            track: drawTrack,
            calm: drawCalm,
            foxbody: drawFoxbody,
            heritage67: drawHeritage67,
            svt_cobra: drawSvtCobra
        };

        return {
            render: function (theme, data, palette, redlineRatio) {
                var layout = layouts[theme] || layouts.normal;
                var compactTheme = theme === 'sport' || theme === 'track' || theme === 'calm' || theme === 'svt_cobra';
                if (!compactTheme) {
                    layout(data, palette, redlineRatio);
                    return;
                }

                // These themes retain their compact information density, but
                // live in the vertical center of the real 8:3 cluster canvas.
                // The prefill keeps the translated legacy clear pass from
                // leaving transparent pixels above the compact band.
                ctx.clearRect(0, 0, width, height);
                ctx.fillStyle = palette.background;
                ctx.fillRect(0, 0, width, height);
                ctx.save();
                ctx.translate(10, 120);
                layout(data, palette, redlineRatio);
                ctx.restore();
            },
            names: Object.keys(layouts)
        };
    }

    window.S650HmiLayouts = {
        create: createLayouts
    };
})(window);
