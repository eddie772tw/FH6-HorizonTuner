/* S650 layout architecture profiles and shared geometry. */
(function (window) {
    'use strict';

    var DUAL_LAYOUT_TYPE = 'dual';
    var TRACK_LAYOUT_TYPE = 'track';

    // Roles remain owned by each theme profile even when two themes currently
    // display the same telemetry slots. This keeps the profile independent
    // from the Heritage contract and leaves room for theme-specific content.
    var PROFILES = Object.freeze({
        normal: Object.freeze({
            type: DUAL_LAYOUT_TYPE,
            statusRenderer: 'normal',
            centerRoles: Object.freeze({
                topLeft: 'odometer',
                topRight: 'heading',
                bottomLeft: 'rpm',
                bottomRight: 'speed'
            }),
            sideRoles: Object.freeze({ left: 'power', right: 'boost' }),
            sideGauges: true,
            dial: Object.freeze({
                renderer: 'normalEnergy',
                leftRole: 'rpm',
                rightRole: 'speed',
                outerInset: 8,
                // Normal treats the dial as an energy band. Keep its width
                // profile-owned so Heritage can retain its own analog logic.
                energyWidth: 48,
                redlineWidth: 56
            }),
            sideGauge: Object.freeze({
                fillColor: 'primary',
                pointerColor: 'danger'
            })
        }),
        heritage67: Object.freeze({
            type: DUAL_LAYOUT_TYPE,
            header: null,
            statusRenderer: 'heritage',
            centerRoles: Object.freeze({
                topLeft: 'odometer',
                topRight: 'heading',
                bottomLeft: 'rpm',
                bottomRight: 'speed'
            }),
            sideRoles: Object.freeze({ left: 'power', right: 'boost' }),
            sideGauges: true,
            dial: Object.freeze({
                renderer: 'heritageAnalog',
                leftRole: 'rpm',
                rightRole: 'speed',
                outerInset: 7
            })
        }),
        foxbody: Object.freeze({
            type: DUAL_LAYOUT_TYPE,
            statusRenderer: 'heritage',
            centerRoles: Object.freeze({
                topLeft: 'odometer',
                topRight: 'heading',
                bottomLeft: 'rpm',
                bottomRight: 'speed'
            }),
            sideRoles: Object.freeze({ left: 'power', right: 'boost' }),
            sideGauges: true,
            sideGauge: Object.freeze({
                fillColor: 'primary',
                pointerColor: 'primary'
            }),
            dial: Object.freeze({
                renderer: 'foxbodyAnalog',
                leftRole: 'rpm',
                rightRole: 'speed',
                outerInset: 8
            })
        }),
        track: Object.freeze({
            type: TRACK_LAYOUT_TYPE,
            sideGauges: false,
            dial: Object.freeze({
                renderer: 'trackPerformance',
                leftRole: 'rpm',
                rightRole: 'speed',
                outerInset: 0
            })
        })
    });

    function freezeCenterRegions(region) {
        var frozen = Object.freeze({
            x: region.x,
            y: region.y,
            width: region.width,
            height: region.height
        });
        return Object.freeze({ normal: frozen, heritage67: frozen, foxbody: frozen });
    }

    function create(options) {
        options = options || {};
        var width = options.width || 1280;
        var height = options.height || 480;
        var gauge = options.gauge || {};
        var centerX = width / 2;
        var baseRadius = gauge.radius === undefined ? 180 : gauge.radius;

        // The renderer-specific radius is derived from this common outer
        // boundary. Inner rings and energy tracks remain theme-owned.
        var outerRadius = baseRadius + 8;
        var centerInfo = Object.freeze({
            x: 425,
            y: 126,
            width: 430,
            height: 230
        });
        var geometry = Object.freeze({
            type: DUAL_LAYOUT_TYPE,
            canvas: Object.freeze({ width: width, height: height, centerX: centerX }),
            centerInfo: centerInfo,
            centerRegions: freezeCenterRegions(centerInfo),
            mainGauge: Object.freeze({
                leftCenterX: gauge.leftCenterX === undefined ? 256 : gauge.leftCenterX,
                rightCenterX: gauge.rightCenterX === undefined ? 1024 : gauge.rightCenterX,
                centerY: gauge.centerY === undefined ? 250 : gauge.centerY,
                outerRadius: outerRadius
            }),
            centerReadouts: Object.freeze({
                centerX: centerX,
                topOffset: 195,
                bottomOffset: 170,
                topY: 82,
                bottomY: 392
            }),
            decorations: Object.freeze({
                centerX: centerX,
                topY: 84,
                bottomY: 410,
                innerOffset: 118,
                outerOffset: 176
            }),
            sideGauges: Object.freeze({
                centerY: (gauge.centerY === undefined ? 250 : gauge.centerY) + 1,
                radius: baseRadius + 24
            }),
            baseDriving: Object.freeze({
                carousel: Object.freeze({ centerX: centerX, y: 399 })
            })
        });

        return {
            type: DUAL_LAYOUT_TYPE,
            geometry: geometry,
            profiles: PROFILES,
            names: Object.keys(PROFILES),
            getProfile: function (theme) {
                return PROFILES[theme] || PROFILES.normal;
            }
        };
    }

    window.S650HmiLayoutProfiles = {
        type: DUAL_LAYOUT_TYPE,
        create: create,
        profiles: PROFILES
    };
})(window);
