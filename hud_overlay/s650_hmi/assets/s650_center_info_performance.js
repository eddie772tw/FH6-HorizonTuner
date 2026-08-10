/* Performance center-information page. */
(function (window) {
    'use strict';

    window.S650HmiCenterInfo.register({
        id: 'performance',
        label: 'Performance telemetry',
        status: 'production',
        render: function (context) {
            var region = context.region;
            context.primitives.drawPerformanceWidget(
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
