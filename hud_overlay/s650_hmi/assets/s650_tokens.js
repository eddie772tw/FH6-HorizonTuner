/* S650 HMI visual tokens. Keep theme styling separate from drawing logic. */
(function (window) {
    'use strict';

    var colors = {
        bgPrimary: '#0A0B0D',
        textPrimary: '#FFFFFF',
        adas: '#00E676',
        telltaleRed: '#FF3B30',
        telltaleYellow: '#FFCC00',
        copper: '#C98D5A'
    };

    var grid = {
        // Reference grid used by Figma/Qt/Unreal design handoff.
        reference: Object.freeze({
            width: 1920,
            height: 720,
            safePaddingTop: 40,
            safePaddingLeft: 64,
            safePaddingRight: 64,
            safePaddingBottom: 40,
            leftCenterX: 432,
            rightCenterX: 1488,
            ringDiameter: 400,
            centerAdasWidth: 650
        }),
        // The active S650 HUD is a deliberately shorter overlay viewport.
        overlay: Object.freeze({
            width: 1260,
            height: 240,
            safePaddingTop: 32,
            safePaddingLeft: 34,
            safePaddingRight: 34,
            safePaddingBottom: 28,
            leftCenterX: 232,
            rightCenterX: 1028,
            ringDiameter: 180,
            centerAdasWidth: 490
        })
    };

    var touch = Object.freeze({
        enabled: false,
        targetMin: 44,
        targetRecommended: 64,
        gapMin: 8,
        gapRecommended: 16,
        listItemMin: 56,
        listItemRecommended: 76
    });

    var typography = Object.freeze({
        speedHero: 64,
        headingL: 32,
        bodyM: 24,
        captionLegal: 16,
        weightHero: 800,
        weightHeading: 600,
        weightBody: 500,
        weightCaption: 400
    });

    var palettes = {
        normal: {
            background: colors.bgPrimary,
            surface: '#15181B',
            primary: colors.copper,
            secondary: '#98A0A8',
            text: colors.textPrimary,
            warning: colors.telltaleYellow,
            danger: colors.telltaleRed
        },
        sport: {
            background: '#120D0B',
            surface: '#211814',
            primary: '#FFB566',
            secondary: '#C9A48B',
            text: '#FFF7F0',
            warning: colors.telltaleYellow,
            danger: colors.telltaleRed
        },
        track: {
            background: '#080A0D',
            surface: '#15191F',
            primary: '#FFFFFF',
            secondary: '#98A0A8',
            text: '#FFFFFF',
            warning: colors.telltaleYellow,
            danger: colors.telltaleRed
        },
        calm: {
            background: '#0D1117',
            surface: '#151C24',
            primary: '#8EA1B5',
            secondary: '#89939E',
            text: '#F3F7FB',
            warning: colors.telltaleYellow,
            danger: colors.telltaleRed
        },
        foxbody: {
            background: '#050B08',
            surface: '#0D1B13',
            primary: '#00FF66',
            secondary: '#86B79A',
            text: '#EFFFF4',
            warning: colors.telltaleYellow,
            danger: colors.telltaleRed
        },
        heritage67: {
            background: '#12100E',
            surface: '#211D17',
            primary: '#F5E8C8',
            secondary: '#B7A98D',
            text: '#FFF8E7',
            warning: colors.telltaleYellow,
            danger: colors.telltaleRed
        },
        svt_cobra: {
            background: '#090A0D',
            surface: '#171A20',
            primary: '#DCE7F2',
            secondary: '#8798A8',
            text: '#F8FBFF',
            warning: colors.telltaleYellow,
            danger: colors.telltaleRed
        }
    };

    function clonePalette(palette) {
        return Object.assign({}, palette);
    }

    window.S650HmiTokens = {
        colors: Object.freeze(colors),
        grid: grid,
        touch: touch,
        typography: typography,
        // Baseline design calibration for a 700–800 mm driver eye distance.
        // These are implementation targets, not an ISO compliance claim.
        ergonomics: Object.freeze({
            viewingDistanceMm: 750,
            minTextHeightMm: 3.2,
            recommendedSecondaryHeightMm: 5.0,
            recommendedPrimaryHeightMm: 12.0,
            minTextPx: typography.captionLegal,
            secondaryTextPx: typography.bodyM,
            primaryTextPx: typography.speedHero,
            telltalePx: 28,
            majorTickLengthPx: 26,
            minorTickLengthPx: 14,
            majorTickWidthPx: 3,
            minorTickWidthPx: 2,
            pointerWidthPx: 3
        }),
        palettes: palettes,
        paletteFor: function (theme) {
            return clonePalette(palettes[theme] || palettes.normal);
        }
    };
})(window);
