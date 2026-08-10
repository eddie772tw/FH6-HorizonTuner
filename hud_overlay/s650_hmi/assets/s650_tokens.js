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
            leftCenterX: 384,
            rightCenterX: 1536,
            ringDiameter: 400,
            centerAdasWidth: 650
        }),
        // The active S650 HUD is a deliberately shorter overlay viewport.
        overlay: Object.freeze({
            width: 1280,
            height: 480,
            safePaddingTop: 40,
            safePaddingLeft: 48,
            safePaddingRight: 48,
            safePaddingBottom: 40,
            leftCenterX: 256,
            rightCenterX: 1024,
            ringDiameter: 360,
            centerAdasWidth: 480
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
        bodyM: 24,
        captionLegal: 16,
        // Heritage dual-ring typography is independently tunable so visual
        // sizing tests do not alter the remaining S650 themes.
        heritageDialTickNumber: 70,
        heritageDialTickInset: 55,
        heritageDialTickWidthScale: 0.30,
        heritageDialFaceLabel: 16,
        heritageDialFaceLabelOffset: 0.45,
        heritageDialAuxLabel: 16,
        heritageDialAuxLabelOffset: 44,
        heritageCenterTopReadout: 28,
        heritageCenterBottomReadout: 26,
        normalCenterTopReadout: 28,
        normalCenterBottomReadout: 26,
        normalDialValue: 56,
        normalDialUnit: 16,
        normalDialLabel: 16,
        normalDialValueOffset: -16,
        normalDialUnitOffset: 18,
        normalDialLabelOffset: 42,
        normalDialLabelWithoutUnitOffset: 30,
        dualRingCenterTitle: 24,
        dualRingCenterSubtitle: 15,
        dualRingCenterValue: 22,
        dualRingCenterPosition: 12,
        weightHero: 800,
        weightHeading: 600,
        weightBody: 500,
        weightCaption: 400
    });

    var palettes = {
        normal: {
            background: colors.bgPrimary,
            surface: '#15181B',
            primary: '#1351D8',
            secondary: '#98A0A8',
            text: colors.textPrimary,
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
