/* Shared dual-ring center-information module.
 *
 * The center slot is intentionally a small, closed contract. It must render
 * one of the widgets declared by s650_contract.js and must not create a second
 * telemetry or configuration path of its own.
 */
(function (window) {
    'use strict';

    function create(options) {
        var primitives = options.primitives;
        var contract = options.contract;
        var supportedWidgets = contract && Array.isArray(contract.centerWidgets)
            ? contract.centerWidgets
            : ['drive', 'tire_temp', 'performance'];

        function normalizeWidget(view) {
            var candidate = view && view.centerWidget;
            return supportedWidgets.indexOf(candidate) >= 0 ? candidate : 'drive';
        }

        function drawDrive(view, data, palette, x, y, width, height) {
            primitives.drawGearAndSpeed(
                view,
                data,
                palette,
                x + width / 2,
                y + Math.round(height * 0.38),
                y + Math.round(height * 0.78),
                58,
                82
            );
        }

        return {
            draw: function (view, data, palette, x, y, width, height) {
                var originX = x || 425;
                var originY = y || 122;
                var regionWidth = width || 430;
                var regionHeight = height || 210;
                var widget = normalizeWidget(view);

                if (widget === 'tire_temp') {
                    primitives.drawTireTemperatureWidget(view, data, palette, originX, originY, regionWidth, regionHeight);
                } else if (widget === 'performance') {
                    primitives.drawPerformanceWidget(view, data, palette, originX, originY, regionWidth, regionHeight);
                } else {
                    drawDrive(view, data, palette, originX, originY, regionWidth, regionHeight);
                }
            },
            normalizeWidget: normalizeWidget,
            widgets: supportedWidgets.slice()
        };
    }

window.S650HmiCenterInfo = { create: create };
})(window);
