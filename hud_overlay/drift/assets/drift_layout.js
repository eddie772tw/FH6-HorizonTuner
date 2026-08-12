/*
 * Drift HUD viewport layout and startup Sweep math.
 *
 * The Drift HUD keeps one telemetry lifecycle, but its visual layers are
 * positioned against the full viewport instead of the shared bottom-right
 * gauge slot used by conventional HUDs.
 */
(function (window) {
    'use strict';

    var LOGICAL_WIDTH = 1680;
    var LOGICAL_HEIGHT = 640;

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function finitePositive(value, fallback) {
        var number = Number(value);
        return Number.isFinite(number) && number > 0 ? number : fallback;
    }

    function getViewportTransform(width, height, bottomMargin) {
        var viewportWidth = finitePositive(width, LOGICAL_WIDTH);
        var viewportHeight = finitePositive(height, LOGICAL_HEIGHT);
        var margin = Math.max(0, Number(bottomMargin) || 0);
        var scale = Math.min(viewportWidth / LOGICAL_WIDTH, viewportHeight / LOGICAL_HEIGHT);

        return {
            scale: scale,
            offsetX: (viewportWidth - LOGICAL_WIDTH * scale) * 0.5,
            // Keep the logical instrument group above the game's bottom HUD.
            offsetY: Math.max(0, viewportHeight - LOGICAL_HEIGHT * scale - margin * scale)
        };
    }

    function getBottomRightAnchor(width, height, contentWidth, contentHeight, padding) {
        var viewportWidth = finitePositive(width, LOGICAL_WIDTH);
        var viewportHeight = finitePositive(height, LOGICAL_HEIGHT);
        var safePadding = Math.max(0, Number(padding) || 0);
        var boxWidth = Math.max(1, Number(contentWidth) || 1);
        var boxHeight = Math.max(1, Number(contentHeight) || 1);

        return {
            centerX: viewportWidth - safePadding - boxWidth * 0.5,
            centerY: viewportHeight - safePadding - boxHeight * 0.5,
            width: boxWidth,
            height: boxHeight
        };
    }

    // GT7 uses a short, wide layer aligned to the viewport's bottom center.
    // Keep this as a geometry primitive so Drift can use the same safe anchor
    // without introducing another HTML lifecycle or a second canvas.
    function getCenteredBottomAnchor(width, height, contentWidth, contentHeight, padding) {
        var viewportWidth = finitePositive(width, LOGICAL_WIDTH);
        var viewportHeight = finitePositive(height, LOGICAL_HEIGHT);
        var safePadding = Math.max(0, Number(padding) || 0);
        var boxWidth = Math.max(1, Number(contentWidth) || 1);
        var boxHeight = Math.max(1, Number(contentHeight) || 1);

        return {
            centerX: viewportWidth * 0.5,
            centerY: viewportHeight - safePadding - boxHeight * 0.5,
            width: boxWidth,
            height: boxHeight
        };
    }

    // The initial compact primary fits exactly in the side wing between the
    // map and Drift Zone total. In-game review showed it was too small, so the
    // final frame is doubled with that compact frame's left edge as its new
    // center. The latest in-game review also moves the primary down by about
    // three quarters of its own height; the left-side horizontal separation
    // remains the primary Drift Zone clearance rule after that shift.
    function getFh6PrimaryAnchor(width, height, preferredWidth, aspectRatio) {
        var viewportWidth = finitePositive(width, LOGICAL_WIDTH);
        var viewportHeight = finitePositive(height, LOGICAL_HEIGHT);
        var preferred = Math.max(1, Number(preferredWidth) || 1);
        var safeAspectRatio = Math.max(1, Number(aspectRatio) || 2);
        var mapRight = viewportWidth * 0.28;
        var driftScoreLeft = viewportWidth * 0.40;
        var bottomDriftScoreBandStart = viewportHeight * 0.80;
        var horizontalPadding = Math.max(12, viewportWidth * 0.008);
        var scorePadding = Math.max(16, viewportHeight * 0.025);
        var availableWidth = Math.max(1, driftScoreLeft - mapRight - horizontalPadding * 2);
        var compactWidth = Math.min(preferred, availableWidth);
        var boxWidth = compactWidth * 2;
        var boxHeight = boxWidth / safeAspectRatio;
        var verticalShift = boxHeight * 0.75;

        return {
            centerX: mapRight + horizontalPadding,
            centerY: bottomDriftScoreBandStart - scorePadding - boxHeight * 0.5 + verticalShift,
            width: boxWidth,
            height: boxHeight
        };
    }

    function ellipsePoint(t, centerX, centerY, halfWidth, radiusX, radiusY, side) {
        var normalizedX = clamp((Number(t) || 0) * halfWidth / radiusX, -1, 1);
        var x = centerX + (Number(t) || 0) * halfWidth;
        var yOffset = radiusY * Math.sqrt(Math.max(0, 1 - normalizedX * normalizedX));
        return { x: x, y: centerY + (side === 'bottom' ? yOffset : -yOffset) };
    }

    function fillSweepState(progress, maxRpm, target) {
        var p = clamp(Number(progress) || 0, 0, 1);
        var safeMaxRpm = Math.max(1000, Number(maxRpm) || 9000);
        var rpm;
        var angle;

        if (p < 0.55) {
            var up = p / 0.55;
            var easedUp = Math.sin(up * Math.PI * 0.5);
            rpm = safeMaxRpm * easedUp;
            angle = -60 + 120 * easedUp;
        } else {
            var down = (p - 0.55) / 0.45;
            var easedDown = Math.sin(down * Math.PI * 0.5);
            rpm = safeMaxRpm * (1 - easedDown) + 900 * easedDown;
            angle = 60 * (1 - easedDown);
        }

        target.rpm = rpm;
        target.angle = angle;
        target.speed = Math.round((rpm / safeMaxRpm) * 160);
        return target;
    }

    window.DriftLayout = {
        LOGICAL_WIDTH: LOGICAL_WIDTH,
        LOGICAL_HEIGHT: LOGICAL_HEIGHT,
        getViewportTransform: getViewportTransform,
        getBottomRightAnchor: getBottomRightAnchor,
        getCenteredBottomAnchor: getCenteredBottomAnchor,
        getFh6PrimaryAnchor: getFh6PrimaryAnchor,
        ellipsePoint: ellipsePoint,
        fillSweepState: fillSweepState
    };
})(window);
