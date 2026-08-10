/* Drive-summary center-information page. */
(function (window) {
    'use strict';

    window.S650HmiCenterInfo.register({
        id: 'drive',
        label: 'Drive summary',
        status: 'production',
        render: function (context) {
            var region = context.region;
            var centerX = typeof region.centerX === 'number'
                ? region.centerX
                : region.x + region.width / 2;
            var speedY = typeof region.speedY === 'number'
                ? region.speedY
                : region.y + Math.round(region.height * 0.38);
            var gearY = typeof region.gearY === 'number'
                ? region.gearY
                : region.y + Math.round(region.height * 0.78);
            var speedSize = typeof region.speedSize === 'number' ? region.speedSize : 58;
            var gearSize = typeof region.gearSize === 'number' ? region.gearSize : 82;
            context.primitives.drawGearAndSpeed(
                context.view,
                context.data,
                context.palette,
                centerX,
                speedY,
                gearY,
                speedSize,
                gearSize
            );
        }
    });
})(window);
