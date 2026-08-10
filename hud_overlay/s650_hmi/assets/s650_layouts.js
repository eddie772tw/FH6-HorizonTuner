/* S650 dashboard layouts. Peripheral/companion systems deliberately do not live here. */
(function (window) {
    'use strict';

    function createLayouts(options) {
        var ctx = options.ctx;
        var view = options.view;
        var p = options.primitives;
        var width = options.width;
        var height = options.height;
        var gauge = view.gauge;
        var speedScaleMax = gauge.speedScaleMax;
        var type = view.typography;

        function clear(palette) {
            p.clearAndPaintBackground(palette, width, height);
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

            p.drawRoundedPanel(385, 48, 490, 147, 8, palette.surface, 'rgba(255, 255, 255, 0.12)');
            ctx.save();
            ctx.strokeStyle = palette.primary;
            ctx.globalAlpha = 0.65;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(434, 71);
            ctx.lineTo(826, 71);
            ctx.stroke();
            ctx.restore();

            p.drawGearAndSpeed(view, data, palette, 630, 95, 169, type.speedHero, type.speedHero + 6);
            p.drawPedalBars(view, data, palette, 432, 205, 190, true);
            p.drawPedalBars(view, data, palette, 642, 205, 190, true);

            ctx.save();
            p.setFont(type.captionLegal, '700');
            ctx.fillStyle = palette.secondary;
            ctx.textAlign = 'center';
            if (view.showSpeed) ctx.fillText('SPEED', gauge.leftCenterX, 230);
            if (view.showRPM) ctx.fillText('ENGINE', gauge.rightCenterX, 230);
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
            p.drawRetroCenter(view, data, palette, 430, 62, 400, 128, {
                label: 'FOX BODY // DIGITAL OVERLAY',
                border: palette.primary,
                gearColor: palette.text,
                secondary: palette.secondary,
                panel: 'rgba(0, 22, 12, 0.68)',
                fontFamily: 'ForzaGear'
            });
        }

        function drawHeritage67(data, palette, redlineRatio) {
            clear(palette);
            p.drawHeader(view, palette, "HERITAGE '67", 'CLASSIC // ANALOG');

            var ivory = '#F5E8C8';
            var metal = '#B7A98D';
            var pointer = '#E04B4B';
            if (view.showSpeed) {
                p.drawRetroDial(view, data, palette, gauge.leftCenterX, gauge.centerY, gauge.radius, view.getSpeed(data) / speedScaleMax, 1,
                    'SPEED', view.roundedSpeed(data), view.unitLabel(), {
                        pointerColor: pointer,
                        ringColor: ivory,
                        ringHighlight: metal,
                        tickColor: metal,
                        valueSize: type.bodyM,
                        baseWidth: 8,
                        outerWidth: 4,
                        fontFamily: 'Georgia'
                    });
            }
            if (view.showRPM) {
                p.drawRetroDial(view, data, palette, gauge.rightCenterX, gauge.centerY, gauge.radius, view.getRpm(data) / view.getMaxRpm(data), redlineRatio,
                    'RPM', Math.round(view.getRpm(data) / 100) * 100, 'RPM', {
                        pointerColor: pointer,
                        ringColor: ivory,
                        ringHighlight: metal,
                        tickColor: metal,
                        valueSize: type.bodyM,
                        baseWidth: 8,
                        outerWidth: 4,
                        fontFamily: 'Georgia'
                    });
            }
            p.drawRetroCenter(view, data, palette, 430, 62, 400, 128, {
                label: 'MUSTANG // 1967',
                border: metal,
                borderWidth: 2,
                borderAlpha: 0.86,
                gearColor: ivory,
                secondary: metal,
                panel: 'rgba(34, 28, 20, 0.82)',
                fontFamily: 'Georgia'
            });
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
                layout(data, palette, redlineRatio);
            },
            names: Object.keys(layouts)
        };
    }

    window.S650HmiLayouts = {
        create: createLayouts
    };
})(window);
