/* Display geometry, derived from the shifted ring boundary and full glyph bounds. */
(function (root) {
    'use strict';
    function rightEdge(circle, top, bottom, clearance = 8) {
        const nearestY = Math.max(top - clearance, Math.min(bottom + clearance, circle.y));
        const dy = nearestY - circle.y;
        return circle.x - Math.sqrt(Math.max(0, circle.radius * circle.radius - dy * dy)) - clearance;
    }
    function pedalGeometry(circle, labelBounds, valueBounds, top, height, value) {
        const right = Math.min(rightEdge(circle, top, top + height), rightEdge(circle, valueBounds.y, valueBounds.y + valueBounds.height) - valueBounds.width - 8);
        const left = labelBounds.x + labelBounds.width + 12;
        const width = Math.max(0, right - left);
        const ratio = typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null;
        return { left, width, fillWidth: width * (ratio ?? 0), available: ratio !== null };
    }
    root.LfaPanelLayout = { rightEdge, pedalGeometry };
})(typeof window === 'undefined' ? globalThis : window);
