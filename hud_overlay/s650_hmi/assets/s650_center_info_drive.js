/* Drive-summary center-information page. */
(function (window) {
    'use strict';

    window.S650HmiCenterInfo.register({
        id: 'drive',
        label: 'Drive summary',
        status: 'production',
        render: function (context) {
            var region = context.region;
            context.primitives.drawGearAndSpeed(
                context.view,
                context.data,
                context.palette,
                region.x + region.width / 2,
                region.y + Math.round(region.height * 0.38),
                region.y + Math.round(region.height * 0.78),
                58,
                82
            );
        }
    });
})(window);
