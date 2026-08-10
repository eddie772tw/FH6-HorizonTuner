/* Tire-temperature center-information page. */
(function (window) {
    'use strict';

    window.S650HmiCenterInfo.register({
        id: 'tire_temp',
        label: 'Tire temperature',
        status: 'production',
        render: function (context) {
            var region = context.region;
            context.primitives.drawTireTemperatureWidget(
                context.view,
                context.data,
                context.palette,
                region.x,
                region.y,
                region.width,
                region.height
            );
        }
    });
})(window);
