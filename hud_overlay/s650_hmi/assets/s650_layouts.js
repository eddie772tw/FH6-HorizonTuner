/* S650 dashboard layouts. Peripheral/companion systems deliberately do not live here. */
(function (window) {
    'use strict';

    function createLayouts(options) {
        var view = options.view;
        var p = options.primitives;
        var baseDriving = options.baseDriving;
        var centerInfo = options.centerInfo;
        var width = options.width;
        var height = options.height;
        var typography = view.typography;
        var profilesModule = options.layoutProfiles || window.S650HmiLayoutProfiles;
        var profileRegistry = profilesModule.create({
            width: width,
            height: height,
            gauge: view.gauge
        });
        var geometry = profileRegistry.geometry;
        var profiles = profileRegistry.profiles;
        var gauge = geometry.mainGauge;
        var centerReadouts = geometry.centerReadouts;

        function profileFor(theme) {
            return profiles[theme] || profiles.normal;
        }

        function clear(palette) {
            // The overlay host owns the backdrop. Every S650 theme paints only
            // its instruments, preserving transparency outside the HMI marks.
            p.clearAndPaintBackground(palette, width, height, true);
        }

        function drawCenterInfo(data, palette) {
            if (view.showCenterInfo === false || !centerInfo || typeof centerInfo.draw !== 'function') return;
            centerInfo.draw(view, data, palette, geometry.centerInfo);
        }

        function drawCenterDecorations(data, palette) {
            if (typeof p.drawCenterDecorations !== 'function') return;
            p.drawCenterDecorations(view, palette, geometry.decorations);
        }

        function drawFixedReadouts(data, palette, profile) {
            if (typeof view.getTelemetryReadout !== 'function') return;
            var options = Object.assign({}, centerReadouts);
            if (profile.statusRenderer === 'heritage' && typeof p.drawHeritageStatus === 'function') {
                p.drawHeritageStatus(view, data, profile.centerRoles, options);
                return;
            }
            if (typeof p.drawNormalStatus === 'function') {
                p.drawNormalStatus(view, data, palette, profile.centerRoles, options);
            }
        }

        function drawBaseDriving(data, palette) {
            if (baseDriving && typeof baseDriving.draw === 'function') {
                baseDriving.draw(view, data, palette, geometry.baseDriving);
            }
        }

        function drawSideGauges(data, palette, profile) {
            if (!profile.sideGauges) return;
            var slots = profile.sideRoles;
            var drawSideGauge = p.drawSideGauge || p.drawHeritageSideGauge;
            if (!slots || typeof view.getTelemetryReadout !== 'function' || typeof drawSideGauge !== 'function') return;

            var sideGaugeStyle = profile.sideGauge || {};
            var fillColor = palette[sideGaugeStyle.fillColor] || palette.primary;
            var pointerColor = palette[sideGaugeStyle.pointerColor] || palette.primary;

            var leftSideReadout = view.getTelemetryReadout(slots.left, data);
            var rightSideReadout = view.getTelemetryReadout(slots.right, data);
            var sharedOptions = {
                showText: false,
                labelSize: typography.heritageDialAuxLabel,
                labelOffset: typography.heritageDialAuxLabelOffset,
                radius: geometry.sideGauges.radius,
                activeColor: fillColor,
                pointerColor: pointerColor,
                tickColor: palette.secondary
            };

            drawSideGauge(gauge.leftCenterX, geometry.sideGauges.centerY, leftSideReadout.unit, leftSideReadout.ratio, Object.assign({}, sharedOptions, {
                auxiliaryLabel: 'POWER'
            }));
            drawSideGauge(gauge.rightCenterX, geometry.sideGauges.centerY, rightSideReadout.unit, rightSideReadout.ratio, Object.assign({}, sharedOptions, {
                auxiliaryLabel: 'BOOST',
                mirror: true
            }));
        }

        function normalSpeedScale() {
            return view.isMetric === false ? 180 : 300;
        }

        function normalSpeedTicks() {
            var divisions = view.isMetric === false ? 9 : 10;
            var maximum = normalSpeedScale();
            var labels = [];
            for (var index = 0; index <= divisions; index += 1) {
                labels.push(String(Math.round(maximum * index / divisions)));
            }
            return { count: divisions, labels: labels };
        }

        function normalRpmTicks(data) {
            var maximum = Math.max(1, Math.round(view.getMaxRpm(data) / 1000));
            var labels = [];
            for (var index = 0; index <= maximum; index += 1) {
                labels.push(String(index));
            }
            return { count: maximum, labels: labels };
        }

        function drawNormalEnergyDial(data, palette, role, centerX, redlineRatio, profile) {
            var dialStyle = profile.dial;
            var dialText = {
                baseWidth: dialStyle.energyWidth,
                redlineWidth: dialStyle.redlineWidth,
                valueSize: typography.normalDialValue || typography.bodyM,
                unitSize: typography.normalDialUnit || typography.captionLegal,
                labelSize: typography.normalDialLabel || typography.captionLegal,
                valueOffsetY: typography.normalDialValueOffset,
                unitOffsetY: typography.normalDialUnitOffset,
                labelOffsetY: typography.normalDialLabelOffset,
                labelOffsetYWithoutUnit: typography.normalDialLabelWithoutUnitOffset,
                labelLineGap: typography.normalDialLabelLineGap,
                centerLabel: true,
                activeColor: palette.primary
            };
            if (role === 'speed') {
                if (!view.showSpeed) return;
                var speedTicks = normalSpeedTicks();
                p.drawNormalEnergyDial(view, palette, centerX, gauge.centerY, gauge.outerRadius - profile.dial.outerInset,
                    view.getSpeed(data) / normalSpeedScale(), 1, 'SPEED', view.roundedSpeed(data), view.unitLabel(), Object.assign({}, dialText, {
                        tickCount: speedTicks.count,
                        tickLabels: speedTicks.labels
                    }));
                return;
            }
            if (role !== 'rpm' || !view.showRPM) return;
            var rpmTicks = normalRpmTicks(data);
            var gearValue = typeof view.getGearLabel === 'function'
                ? view.getGearLabel(data)
                : '--';
            p.drawNormalEnergyDial(view, palette, centerX, gauge.centerY, gauge.outerRadius - profile.dial.outerInset,
                view.getRpm(data) / view.getMaxRpm(data), redlineRatio, 'RPMx1000', gearValue, '', Object.assign({}, dialText, {
                    tickCount: rpmTicks.count,
                    tickLabels: rpmTicks.labels,
                    labelLines: ['GEAR', 'RPMx1000'],
                    redlineRatio: redlineRatio
                }));
        }

        function drawRetroDial(data, palette, role, centerX, redlineRatio, profile) {
            var pointer = '#FF7A3D';
            if (role === 'speed') {
                if (!view.showSpeed) return;
                p.drawRetroDial(view, data, palette, centerX, gauge.centerY, gauge.outerRadius - profile.dial.outerInset,
                    view.getSpeed(data) / normalSpeedScale(), 1, 'SPEED', view.roundedSpeed(data), view.unitLabel(), {
                        pointerColor: pointer,
                        ringColor: palette.primary,
                        ringHighlight: palette.primary,
                        tickColor: palette.secondary,
                        valueSize: typography.bodyM,
                        baseWidth: 7
                    });
                return;
            }
            if (role !== 'rpm' || !view.showRPM) return;
            p.drawRetroDial(view, data, palette, centerX, gauge.centerY, gauge.outerRadius - profile.dial.outerInset,
                view.getRpm(data) / view.getMaxRpm(data), redlineRatio, 'RPM', Math.round(view.getRpm(data) / 100) * 100, 'RPM', {
                    pointerColor: pointer,
                    ringColor: palette.primary,
                    ringHighlight: palette.primary,
                    tickColor: palette.secondary,
                    valueSize: typography.bodyM,
                    baseWidth: 7
                });
        }

        function drawHeritageDials(data, palette, redlineRatio, profile) {
            var rpmScale = p.getHeritageDialScale(view.getMaxRpm(data) / 100);
            var speedScale = view.isMetric
                ? { max: 300, majorStep: 30, majorCount: 10, minorPerMajor: 5, minorCount: 50 }
                : { max: 180, majorStep: 20, majorCount: 9, minorPerMajor: 5, minorCount: 45 };
            var rpmRatio = view.getRpm(data) / (rpmScale.max * 100);
            var speedRatio = view.getSpeed(data) / speedScale.max;
            var redlinePaddingRpm = view.getMaxRpm(data) > 10000 ? 2000 : 1500;
            var heritageRedlineStart = Math.max(0, (data.redlineRpm - redlinePaddingRpm) / 100);
            var ringRadius = gauge.outerRadius - profile.dial.outerInset;

            if (view.showSpeed) {
                p.drawHeritageDial(view, palette, gauge.rightCenterX, gauge.centerY, ringRadius, speedRatio, {
                    scale: speedScale,
                    faceLabel: view.unitLabel(),
                    needleColor: '#F1373F'
                });
            }
            if (view.showRPM) {
                p.drawHeritageDial(view, palette, gauge.leftCenterX, gauge.centerY, ringRadius, rpmRatio, {
                    scale: rpmScale,
                    redlineFrom: heritageRedlineStart,
                    faceLabel: 'RPM × 100',
                    needleColor: '#F1373F'
                });
            }
        }

        function drawFoxbodyDials(data, palette, profile) {
            var ringRadius = gauge.outerRadius - profile.dial.outerInset;
            var rpmMax = Math.max(8, Math.ceil(view.getMaxRpm(data) / 1000));
            var speedScale = view.isMetric
                ? { max: 240, majorStep: 20, majorCount: 12, minorPerMajor: 5 }
                : { max: 160, majorStep: 20, majorCount: 8, minorPerMajor: 5 };

            if (view.showRPM) {
                p.drawFoxbodyDial(view, palette, gauge.leftCenterX, gauge.centerY, ringRadius,
                    view.getRpm(data) / (rpmMax * 1000), {
                        scale: { max: rpmMax, majorStep: 1, majorCount: rpmMax, minorPerMajor: 5 },
                        faceLabel: 'RPM X 1000',
                        redlineFrom: Math.max(0, data.redlineRpm / 1000),
                        warningFrom: Math.max(0, data.redlineRpm / 1000 - 1)
                    });
            }
            if (view.showSpeed) {
                p.drawFoxbodyDial(view, palette, gauge.rightCenterX, gauge.centerY, ringRadius,
                    view.getSpeed(data) / speedScale.max, {
                        scale: speedScale,
                        faceLabel: view.unitLabel(),
                        specialMark: view.isMetric ? 60 : 55
                    });
            }
        }

        function drawMainDials(data, palette, redlineRatio, profile) {
            var leftRole = profile.dial.leftRole;
            var rightRole = profile.dial.rightRole;
            if (profile.dial.renderer === 'normalEnergy') {
                drawNormalEnergyDial(data, palette, leftRole, gauge.leftCenterX, redlineRatio, profile);
                drawNormalEnergyDial(data, palette, rightRole, gauge.rightCenterX, redlineRatio, profile);
                return;
            }
            if (profile.dial.renderer === 'retro') {
                drawRetroDial(data, palette, leftRole, gauge.leftCenterX, redlineRatio, profile);
                drawRetroDial(data, palette, rightRole, gauge.rightCenterX, redlineRatio, profile);
                return;
            }
            if (profile.dial.renderer === 'foxbodyAnalog') {
                drawFoxbodyDials(data, palette, profile);
                return;
            }
            drawHeritageDials(data, palette, redlineRatio, profile);
        }

        function drawDual(data, palette, redlineRatio, profile) {
            clear(palette);

            // All dual-ring styles render center content before their rings.
            // The ring renderer remains theme-owned and is always last.
            drawCenterInfo(data, palette);
            drawCenterDecorations(data, palette);
            drawFixedReadouts(data, palette, profile);
            drawBaseDriving(data, palette);
            drawSideGauges(data, palette, profile);
            drawMainDials(data, palette, redlineRatio, profile);
        }

        function drawTrack(data, palette, redlineRatio) {
            clear(palette);
            if (typeof p.drawTrackCluster === 'function') {
                p.drawTrackCluster(view, data, palette, redlineRatio);
            }
        }

        var centerRegions = geometry.centerRegions;
        var baseDrivingRegions = Object.freeze({
            normal: geometry.baseDriving,
            heritage67: geometry.baseDriving,
            foxbody: geometry.baseDriving
        });

        return {
            render: function (theme, data, palette, redlineRatio) {
                var profile = profileFor(theme);
                if (profile.type === 'track') {
                    drawTrack(data, palette, redlineRatio);
                    return;
                }
                // The current supported theme set is dual-ring. Keeping this
                // check explicit makes future non-dual families easy to add.
                if (profile.type !== profileRegistry.type) profile = profiles.normal;
                drawDual(data, palette, redlineRatio, profile);
            },
            names: profileRegistry.names,
            type: profileRegistry.type,
            profiles: profiles,
            geometry: geometry,
            centerRegions: centerRegions,
            baseDrivingRegions: baseDrivingRegions
        };
    }

    window.S650HmiLayouts = {
        create: createLayouts
    };
})(window);
