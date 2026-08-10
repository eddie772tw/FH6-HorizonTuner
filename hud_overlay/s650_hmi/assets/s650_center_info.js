/* Shared dual-ring center-information module. Expand this TODO module
 * independently when its trip/media/vehicle-data contract is ready. */
(function (window) {
    'use strict';

    function create(options) {
        var primitives = options.primitives;

        return {
            draw: function (view, data, palette, x, y, width, height) {
                // TODO(s650-center-info): add selectable trip content when a
                // dedicated, dashboard-safe data contract has been agreed.
                primitives.drawTireTemperatureWidget(view, data, palette, x || 425, y || 122, width || 430, height || 210);
            }
        };
    }

    window.S650HmiCenterInfo = { create: create };
})(window);
